import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { createTerrain, heightAt, hillAt, islandD, islandR, PEAK, PONDS, pondAt, streamAt } from './terrain.js';
import { createSky, createMist, cloudTexture } from './sky.js';
import { createWater } from './water.js';
import { BUILD, paifang, dock, pagoda, archBridge, pine, roundTree, plum, bamboo, shrub, scholarRock, boulder, tuft, lotus, lantern, mat, glow, glowMaterial, flowerBed, woodBridge } from './props.js';
import { PathGraph } from './paths.js';
import { TASKS } from '../data/tasks.js';
import { GATE, GARDEN, S } from '../data/spots.js';
import { villager, ringMarker, questItem } from './npc.js';

export const SUN_DIR = new THREE.Vector3(30, 38, 24).normalize();

function rng(seed) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 把靜態群組依材質合併成少數幾個網格；發光精靈另外保留（會閃爍） */
function bake(group, scene, sprites) {
  group.updateMatrixWorld(true);
  const buckets = new Map();
  group.traverse((o) => {
    if (o.isSprite) {
      const s = new THREE.Sprite(o.material);
      o.getWorldPosition(s.position);
      const ws = new THREE.Vector3(); o.getWorldScale(ws);
      s.scale.copy(ws);
      s.userData = { ...o.userData, base: ws.x };
      sprites.push(s); scene.add(s);
      return;
    }
    if (!o.isMesh) return;
    const g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
    g.applyMatrix4(o.matrixWorld);
    for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'uv') g.deleteAttribute(k);
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    if (!g.attributes.normal) g.computeVertexNormals();
    if (!buckets.has(o.material)) buckets.set(o.material, { geos: [], cast: false });
    const b = buckets.get(o.material);
    b.geos.push(g); b.cast ||= o.castShadow;
  });
  for (const [m, { geos, cast }] of buckets) {
    const merged = mergeGeometries(geos, false);
    geos.forEach((x) => x.dispose());
    if (!merged) continue;
    const mesh = new THREE.Mesh(merged, m);
    mesh.castShadow = cast; mesh.receiveShadow = true;
    scene.add(mesh);
  }
}

export class World {
  constructor(spots, { lowPower = false } = {}) {
    this.scene = new THREE.Scene();
    this.animated = [];
    this.sprites = [];
    this.pickables = [];
    this.spots = new Map();
    this.reserved = [];
    this.boxes = [];        // 建築碰撞：{ inv: Matrix4, box: Box3 }（建築本地座標）
    this.circles = [];      // 樹幹、石頭、柱子：[x, z, r]
    this.npcs = new Map();
    this.rings = new Map();
    this.items = new Map(); // taskId -> questItem[]
    const scene = this.scene;

    /* ---- 光與大氣：清晨的柔光與山間薄霧 ---- */
    scene.fog = new THREE.Fog('#d9e4ea', 90, 560);
    const sky = createSky(SUN_DIR);
    scene.add(sky.mesh); this.animated.push(sky.update);
    scene.add(new THREE.HemisphereLight('#e0ecff', '#8f8a62', 1.55));
    const sun = new THREE.DirectionalLight('#fff3dc', 2.9);
    sun.position.copy(SUN_DIR).multiplyScalar(60);
    sun.castShadow = true;
    sun.shadow.mapSize.set(lowPower ? 2048 : 4096, lowPower ? 2048 : 4096);
    Object.assign(sun.shadow.camera, { left: -32, right: 32, top: 32, bottom: -32, near: 10, far: 200 });
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.04;
    scene.add(sun, sun.target);
    this.sun = sun;
    const fill = new THREE.DirectionalLight('#ffe0bc', 0.45);
    fill.position.set(-30, 18, -10);
    scene.add(fill);

    const water = createWater(SUN_DIR);
    scene.add(water.mesh); this.animated.push(water.update);
    scene.add(createTerrain());

    /* ---- 步道 ---- */
    this.graph = new PathGraph(spots);
    scene.add(this.graph.buildMesh());

    /* ---- 地點建築 ---- */
    const statics = new THREE.Group();
    for (const s of spots) {
      const [x, z] = s.at;
      const y = heightAt(x, z);
      const b = new THREE.Group();
      const task = TASKS.find((t) => t.id === s.task);
      BUILD[s.kind](b, { color: task?.color || s.npc?.color });
      const local = new THREE.Box3().setFromObject(b);
      if (s.kind === 'house' || s.kind === 'pavilion' || s.kind === 'stele') b.scale.setScalar(1.22);
      b.position.set(x, y - 0.04, z);
      b.rotation.y = s.rot || 0;
      statics.add(b);
      b.updateMatrixWorld(true);
      const bb = new THREE.Box3().setFromObject(b);
      const inv = b.matrixWorld.clone().invert();
      if (s.kind === 'terrace') this.circles.push([x + Math.sin(s.rot || 0) * -1.3, z + Math.cos(s.rot || 0) * -1.3, 1.3]);
      else this.boxes.push({ inv, box: local.clone().expandByScalar(0.12) });
      this.spots.set(s.id, {
        ...s,
        pos: new THREE.Vector3(x, y, z),
        frontV: new THREE.Vector2(s.front[0], s.front[1]),
        anchor: new THREE.Vector3(x, Math.max(bb.max.y, y + 1.6) + 0.45, z),
        bounds: bb,
      });
      const R = (s.r || 3) * 0.75;
      const hit = new THREE.Mesh(new THREE.CylinderGeometry(R, R, Math.max(3, bb.max.y - y), 10), new THREE.MeshBasicMaterial({ visible: false }));
      hit.position.set(x, (bb.max.y + y) / 2, z);
      hit.userData.spotId = s.id;
      this.pickables.push(hit);
      scene.add(hit);
    }

    /* ---- 山門與渡口 ---- */
    const pf = new THREE.Group(); paifang(pf); pf.position.set(GATE.at[0], heightAt(...GATE.at) - 0.02, GATE.at[1]); statics.add(pf);
    const dk = new THREE.Group(); dock(dk, 4.4); dk.position.set(GATE.dock[0], 0, GATE.dock[1] + 1.6); statics.add(dk);
    this.reserved.push([GATE.at[0], GATE.at[1], 3.4], [GATE.dock[0], GATE.dock[1], 3]);
    for (const px of [-2.6, -0.95, 0.95, 2.6]) this.circles.push([GATE.at[0] + px, GATE.at[1], 0.32]);

    /* ---- 地標：西北峰頂的七層塔 ---- */
    const pg = new THREE.Group();
    const px = -14 * S, pz = -21 * S;
    this.pagodaTop = pagoda(pg, 1.1);
    pg.position.set(px, heightAt(px, pz) - 0.1, pz); statics.add(pg);
    this.reserved.push([px, pz, 3.2]);
    this.circles.push([px, pz, 1.9]);

    /* ---- 放生池上的拱橋 ---- */
    const pond2 = PONDS[1];
    const br = new THREE.Group(); archBridge(br, 7.4, 1.4); br.position.set(pond2.x, -0.05, pond2.z); br.rotation.y = 0.5; statics.add(br);
    this.reserved.push([pond2.x, pond2.z, 5]);

    /* ---- 小溪上的木橋（步道跨溪處） ---- */
    this.bridges = this.graph.bridges();
    for (const b of this.bridges) {
      const wb = new THREE.Group(); woodBridge(wb, b.len, 2.2);
      wb.position.set(b.x, b.y, b.z); wb.rotation.y = b.angle - Math.PI / 2; statics.add(wb);
      this.reserved.push([b.x, b.z, b.len / 2 + 1]);
    }

    /* ---- 善念實踐園：池邊的太湖石與石燈 ---- */
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + 0.3, r = GARDEN.ring + 0.9;
      const x = GARDEN.x + Math.cos(a) * (GARDEN.pond + 0.55), z = GARDEN.z + Math.sin(a) * (GARDEN.pond + 0.55);
      if (i % 2) { scholarRock(statics, x, heightAt(x, z), z, 0.7, i + 3); this.circles.push([x, z, 0.45]); }
      else lantern(statics, GARDEN.x + Math.cos(a) * r, heightAt(GARDEN.x + Math.cos(a) * r, GARDEN.z + Math.sin(a) * r), GARDEN.z + Math.sin(a) * r, 0.75, i === 0);
    }

    this.#aiOrb();
    this.#people(spots);
    this.#scatter(statics, spots);
    bake(statics, scene, this.sprites);
    this.#lotusPads();
    this.#birds();

    /* ---- 遠處的雲與山腰薄霧 ---- */
    const mist = createMist([
      [-70, 22, -120, 70, '#ffffff', 0.5], [50, 26, -140, 80, '#ffffff', 0.45], [-130, 20, -50, 60, '#fff6e6', 0.45],
      [110, 24, -60, 70, '#ffffff', 0.45], [0, 30, -170, 90, '#fffaf0', 0.4],
    ]);
    scene.add(mist.group); this.animated.push(mist.update);
    this.#lowMist();
    this.#farHills();
    this.#petals();

    this.peakTop = new THREE.Vector3(PEAK.x, heightAt(PEAK.x, PEAK.z), PEAK.z);
    this.islandPoints = this.#islandOutline();
  }

  /** AI 智慧講堂前方的光環：一顆柔光的球與兩道緩緩轉動的環 */
  #aiOrb() {
    const s = this.spots.get('lecture');
    if (!s) return;
    const g = new THREE.Group();
    const fx = s.at[0] + Math.sin(s.rot) * 3.4 + Math.cos(s.rot) * 2.6, fz = s.at[1] + Math.cos(s.rot) * 3.4 - Math.sin(s.rot) * 2.6;
    this.circles.push([fx, fz, 0.55]);
    g.position.set(fx, heightAt(fx, fz) + 2.3, fz);
    const core = new THREE.Mesh(new THREE.IcosahedronGeometry(0.32, 3), mat('#e8f0ff', { e: '#9fb8ff', ei: 1.6, r: 0.3 }));
    g.add(core);
    const ringM = mat('#c9a24c', { r: 0.35, m: 0.6, e: '#5a4210', ei: 0.4 });
    const r1 = new THREE.Mesh(new THREE.TorusGeometry(0.62, 0.025, 8, 64), ringM);
    const r2 = new THREE.Mesh(new THREE.TorusGeometry(0.8, 0.018, 8, 64), ringM);
    g.add(r1, r2);
    const halo = new THREE.SpriteMaterial({ map: (glowTexFor('#bcd0ff')), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, opacity: 0.55 });
    const sp = new THREE.Sprite(halo); sp.scale.setScalar(2.4); g.add(sp);
    // 石座
    const base = new THREE.Group();
    const y0 = heightAt(fx, fz);
    const ped = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.5, 0.9, 12), mat('#cfc7b4', { r: 0.95 }));
    ped.position.set(fx, y0 + 0.45, fz); ped.castShadow = true; ped.receiveShadow = true; base.add(ped);
    this.scene.add(base, g);
    this.reserved.push([fx, fz, 1.6]);
    this.animated.push((t) => {
      g.position.y = y0 + 2.3 + Math.sin(t * 1.2) * 0.12;
      r1.rotation.set(t * 0.6, t * 0.4, 0);
      r2.rotation.set(-t * 0.3, 0, t * 0.5);
      core.scale.setScalar(1 + Math.sin(t * 2.2) * 0.04);
    });
    this.orb = g;
  }

  #scatter(g, spots) {
    const rand = rng(1927);
    const edges = this.graph.edges.map(([a, b]) => [this.graph.nodes[a], this.graph.nodes[b]]);
    const pathDist = (x, z) => {
      let best = Infinity;
      for (const [a, b] of edges) {
        const abx = b.x - a.x, abz = b.y - a.y, t = Math.max(0, Math.min(1, ((x - a.x) * abx + (z - a.y) * abz) / (abx * abx + abz * abz)));
        best = Math.min(best, Math.hypot(x - a.x - abx * t, z - a.y - abz * t));
      }
      return best;
    };
    const blocked = spots.map((s) => [s.at[0], s.at[1], Math.min(s.r || 3.2, 3) + 0.6]);
    const boxes = [...this.spots.values()].map((s) => s.bounds.clone().expandByScalar(0.9));
    const inBox = (x, z) => boxes.some((b) => x > b.min.x && x < b.max.x && z > b.min.z && z < b.max.z);
    const ponds = PONDS.map((p) => [p.x, p.z, p.s * 1.25]);
    const free = (x, z, gap) => pathDist(x, z) > gap + 0.7
      && !blocked.some(([bx, bz, r]) => Math.hypot(x - bx, z - bz) < r) && !inBox(x, z)
      && !ponds.some(([bx, bz, r]) => Math.hypot(x - bx, z - bz) < r)
      && !this.reserved.some(([bx, bz, r]) => Math.hypot(x - bx, z - bz) < r);
    const inland = (x, z, lim = 0.86) => islandD(x, z) < lim;
    const place = (n, tries, pick, ok, make) => {
      for (let i = 0, k = 0; i < tries && k < n; i++) {
        const [x, z] = pick();
        if (!ok(x, z)) continue;
        make(x, heightAt(x, z), z, i); k++;
      }
    };
    const anywhere = (lo = 0.15, hi = 0.88) => () => { const a = rand() * Math.PI * 2, r = islandR(a) * (lo + rand() * (hi - lo)); return [Math.cos(a) * r, Math.sin(a) * r]; };

    const pathPts = [];
    edges.forEach(([a, b]) => { const n = Math.ceil(a.distanceTo(b) / 3); for (let i = 0; i <= n; i++) pathPts.push(new THREE.Vector2().lerpVectors(a, b, i / n)); });
    const nearPath = (lo, hi) => () => { const p = pathPts[Math.floor(rand() * pathPts.length)], a = rand() * Math.PI * 2, r = lo + rand() * (hi - lo); return [p.x + Math.cos(a) * r, p.y + Math.sin(a) * r]; };
    const dry = (x, z) => streamAt(x, z) < 0.01 && pondAt(x, z) < 0.25;
    const tree = (r) => (x, y, z) => this.circles.push([x, z, r]);

    // 松林：山巒、北側與島的外圈
    place(48, 30000, anywhere(0.2, 0.88), (x, z) => (hillAt(x, z) > 1.6 || z < -14 * S || Math.hypot(x, z) > 25 * S) && inland(x, z) && free(x, z, 4.2) && dry(x, z),
      (x, y, z, i) => { pine(g, x, y - 0.05, z, 1.1 + rand() * 0.9, i + 1); this.circles.push([x, z, 0.45]); });
    // 闊葉林：滿島的樹，東北與西南帶一點秋色
    place(46, 30000, anywhere(0.12, 0.86), (x, z) => inland(x, z) && free(x, z, 4.5) && hillAt(x, z) < 4 && dry(x, z),
      (x, y, z, i) => { this.circles.push([x, z, 0.35]); roundTree(g, x, y - 0.05, z, 1.0 + rand() * 0.7, i + 7, (x > 14 * S && z < -6 * S) || (x < -14 * S && z > 8 * S) ? rand() > 0.35 : rand() > 0.9); });
    // 竹林：三好村後方、講堂旁、溪邊
    place(9, 9000, () => [rand() > 0.5 ? -24 * S + rand() * 8 * S : 8 * S + rand() * 9 * S, rand() > 0.5 ? -6 * S + rand() * 16 * S : 17 * S + rand() * 7 * S], (x, z) => inland(x, z, 0.88) && free(x, z, 1.4) && dry(x, z),
      (x, y, z, i) => { bamboo(g, x, y, z, 1.1 + rand() * 0.4, i + 11); this.circles.push([x, z, 0.45]); });
    // 梅與櫻：四給街外圈、山門參道、願行台的登山路
    place(8, 9000, () => { const a = rand() * Math.PI * 2, r = GARDEN.r + 3.5 + rand() * 5; return [GARDEN.x + Math.cos(a) * r, GARDEN.z + Math.sin(a) * r]; }, (x, z) => inland(x, z) && free(x, z, 1.2) && dry(x, z),
      (x, y, z, i) => { plum(g, x, y, z, 1.2 + rand() * 0.4, i + 21); this.circles.push([x, z, 0.3]); });
    place(8, 9000, nearPath(4, 6.5), (x, z) => inland(x, z) && free(x, z, 1.6) && dry(x, z) && (z > 10 * S || Math.hypot(x, z + 4 * S) < 13 * S),
      (x, y, z, i) => { plum(g, x, y, z, 1.1 + rand() * 0.4, i + 51); this.circles.push([x, z, 0.3]); });
    // 花圃：沿著步道兩旁
    place(120, 20000, nearPath(1.9, 3.6), (x, z) => inland(x, z) && free(x, z, 0.6) && dry(x, z),
      (x, y, z, i) => flowerBed(g, x, y, z, 0.9 + rand() * 0.6, i + 5));
    // 灌叢、山石與草叢
    place(70, 20000, anywhere(0.1, 0.9), (x, z) => inland(x, z, 0.92) && free(x, z, 0.7) && dry(x, z),
      (x, y, z, i) => shrub(g, x, y, z, 0.7 + rand() * 0.7, i));
    place(18, 9000, anywhere(0.15, 0.86), (x, z) => (hillAt(x, z) > 1.0 || streamAt(x + 2.6, z) > 0 || streamAt(x - 2.6, z) > 0) && inland(x, z) && free(x, z, 0.8) && dry(x, z),
      (x, y, z, i) => { const r = 0.3 + rand() * 0.6; boulder(g, x, y + 0.05, z, r, i + 3); this.circles.push([x, z, r * 1.1]); });
    place(1200, 40000, anywhere(0.08, 0.88), (x, z) => inland(x, z, 0.9) && free(x, z, 0.4) && hillAt(x, z) < 6 && dry(x, z),
      (x, y, z, i) => tuft(g, x, y - 0.02, z, 0.8 + rand() * 0.8, i + 3));
    // 步道旁的石燈籠（每隔一段路一盞）
    const lit = [];
    for (let i = 0; i < pathPts.length; i += 6) {
      const p = pathPts[i], q = pathPts[Math.min(pathPts.length - 1, i + 1)];
      const dx = q.x - p.x, dz = q.y - p.y, l = Math.hypot(dx, dz) || 1;
      const x = p.x - dz / l * 1.9, z = p.y + dx / l * 1.9;
      if (!inland(x, z) || !dry(x, z) || lit.some(([lx, lz]) => Math.hypot(lx - x, lz - z) < 9) || this.reserved.some(([bx, bz, r]) => Math.hypot(x - bx, z - bz) < r) || blocked.some(([bx, bz, r]) => Math.hypot(x - bx, z - bz) < r) || inBox(x, z)) continue;
      lantern(g, x, heightAt(x, z), z, 1, true); lit.push([x, z]); this.circles.push([x, z, 0.3]);
    }
    // 岸邊礁石
    for (let i = 0; i < 44; i++) {
      const a = rand() * Math.PI * 2, d = 0.96 + rand() * 0.09;
      const x = Math.cos(a) * islandR(a) * d, z = Math.sin(a) * islandR(a) * d;
      if (Math.abs(x) < 4 && z > 20 * S) continue;
      boulder(g, x, heightAt(x, z) + 0.05, z, 0.3 + rand() * 0.55, 200 + i, mat('#7f7d72', { r: 1, flat: true }));
    }
  }

  /** 島民、互動光圈、任務物件 */
  #people(spots) {
    for (const s of spots) {
      const task = TASKS.find((t) => t.id === s.task);
      const npcDef = task?.npc || s.npc;
      const [fx, fz] = s.front;
      const ring = ringMarker(npcDef ? '#d8a24a' : '#8fa6e6');
      ring.group.position.set(fx, heightAt(fx, fz) + 0.06, fz);
      this.scene.add(ring.group); this.rings.set(s.id, ring);
      this.animated.push((t, dt) => ring.update(dt));
      this.reserved.push([fx, fz, 1.6]);
      if (npcDef) {
        const v = villager(npcDef.look, npcDef.color, npcDef.name);
        const face = Math.atan2(fx - s.at[0], fz - s.at[1]);
        // 島民站在光圈後側，面向來訪的人
        const nx = fx - Math.sin(face) * 0.55, nz = fz - Math.cos(face) * 0.55;
        v.group.position.set(nx, heightAt(nx, nz), nz);
        v.group.rotation.y = face;
        v.home = new THREE.Vector2(nx, nz); v.face = face;
        v.setBadge(s.id === 'origin' ? 'talk' : 'need');
        if (s.id === 'origin') v.setMood('idle');
        this.scene.add(v.group); this.npcs.set(s.id, v);
        this.animated.push((t, dt) => v.update(dt));
      }
      if (task?.quest?.at) {
        const list = task.quest.at.map(([x, z]) => {
          const it = questItem(task.quest.item);
          it.group.position.set(x, heightAt(x, z), z);
          it.group.visible = false;
          this.scene.add(it.group);
          this.animated.push((t, dt) => it.update(dt));
          this.reserved.push([x, z, 1.2]);
          if (it.kind === 'lamp') this.circles.push([x, z, 0.3]);
          return it;
        });
        this.items.set(task.id, list);
      }
    }
  }

  /** 可以走的地方：島上、不在池裡、不撞到建築、樹幹與石頭 */
  walkable(x, z) {
    const onDock = Math.abs(x - GATE.dock[0]) < 1.2 && z > GATE.dock[1] - 10 && z < GATE.dock[1] + 1.4;
    if (onDock) return true;
    if (islandD(x, z) > 0.9) return false;
    if (pondAt(x, z) > 0.42) return false;
    if (streamAt(x, z) > 0.35 && this.groundAt(x, z) === heightAt(x, z)) return false;
    for (const [cx, cz, r] of this.circles) if ((x - cx) ** 2 + (z - cz) ** 2 < r * r) return false;
    const p = new THREE.Vector3();
    for (const b of this.boxes) {
      p.set(x, 0, z).applyMatrix4(b.inv);
      if (p.x > b.box.min.x && p.x < b.box.max.x && p.z > b.box.min.z && p.z < b.box.max.z) return false;
    }
    return true;
  }

  /** 完成一站：島民開心、光圈與花朵綻放、四周亮起燈 */
  bloom(id, instant = false) {
    const s = this.spots.get(id); if (!s || s.bloomed) return;
    s.bloomed = true;
    const v = this.npcs.get(id);
    if (v) { v.setMood('happy'); v.setBadge('done'); }
    const [fx, fz] = s.front;
    const g = new THREE.Group(); this.scene.add(g);
    const petals = ['#f2c4cf', '#f7dbe2', '#ffe3a6', '#ffffff'];
    const items = [];
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2 + Math.random() * 0.3, r = 1.6 + Math.random() * 1.6;
      const x = fx + Math.cos(a) * r, z = fz + Math.sin(a) * r;
      if (!this.walkable(x, z) && islandD(x, z) > 0.9) continue;
      const f = new THREE.Mesh(new THREE.IcosahedronGeometry(0.16 + Math.random() * 0.08, 1), mat(petals[i % 4], { r: 0.7 }));
      f.position.set(x, heightAt(x, z) + 0.18, z); f.scale.setScalar(instant ? 1 : 0.01); g.add(f); items.push(f);
      if (i % 3 === 0) {
        const sp = new THREE.Sprite(glowMaterial.clone()); sp.material.opacity = 0.6;
        sp.position.set(x, heightAt(x, z) + 0.9, z); sp.scale.setScalar(instant ? 1.3 : 0.01); g.add(sp); items.push(sp);
      }
    }
    let t0 = instant ? 1 : 0;
    this.animated.push((t, dt) => {
      if (t0 < 1) { t0 = Math.min(1, t0 + dt * 0.9); const e = 1 - (1 - t0) ** 3; items.forEach((m) => m.scale.setScalar(m.isSprite ? 1.3 * e : e)); }
      items.forEach((m, i) => { if (m.isSprite) m.material.opacity = 0.45 + Math.sin(t * 2 + i) * 0.15; });
    });
  }

  #lotusPads() {
    const g = new THREE.Group();
    PONDS.forEach((p, pi) => {
      for (let i = 0; i < 20; i++) {
        const a = i * 2.39 + pi, d = p.s * (0.25 + (i % 4) * 0.17);
        if (pi === 1 && Math.abs(Math.sin(a - 0.5)) < 0.35) continue;      // 讓出拱橋
        lotus(g, p.x + Math.cos(a) * d, 0.02, p.z + Math.sin(a) * d, pi * 13 + i + 1);
      }
    });
    bake(g, this.scene, this.sprites);
  }

  /** 白鷺：繞島緩緩飛行 */
  #birds() {
    const birdM = mat('#f7f4ec', { r: 0.8, side: THREE.DoubleSide });
    const make = () => {
      const b = new THREE.Group();
      const body = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 6).scale(0.7, 0.6, 1.8), birdM); b.add(body);
      const wings = [-1, 1].map((s) => {
        const w = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.22), birdM);
        w.geometry.translate(0.35 * s, 0, 0);
        b.add(w); return w;
      });
      return { b, wings };
    };
    const flock = (cx, cz, r, h, n, speed, seed) => {
      const rand = rng(seed);
      const birds = Array.from({ length: n }, (_, i) => ({ ...make(), ph: i * 0.45 + rand(), off: rand() * 1.5, dy: rand() * 1.5 }));
      birds.forEach((x) => this.scene.add(x.b));
      this.animated.push((t) => birds.forEach((x) => {
        const a = t * speed + x.ph;
        x.b.position.set(cx + Math.cos(a) * (r + x.off), h + x.dy + Math.sin(t * 0.7 + x.ph) * 0.4, cz + Math.sin(a) * (r + x.off));
        x.b.rotation.y = -a + (speed > 0 ? Math.PI : 0);
        const f = Math.sin(t * 6 + x.ph * 3) * 0.7;
        x.wings[0].rotation.z = f; x.wings[1].rotation.z = -f;
      }));
    };
    flock(0, -4 * S, 22 * S, 18, 7, 0.08, 4);
    flock(6 * S, 2 * S, 15 * S, 14, 4, -0.11, 9);
    flock(-14 * S, 10 * S, 9 * S, 11, 3, 0.15, 13);
  }

  #lowMist() {
    const tex = cloudTexture();
    const rand = rng(23);
    const items = [];
    for (let i = 0; i < 24; i++) {
      const a = rand() * Math.PI * 2, d = i < 14 ? 0.95 + rand() * 0.6 : 0.35 + rand() * 0.4;
      const x = Math.cos(a) * islandR(a) * d, z = Math.sin(a) * islandR(a) * d;
      const m = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, color: i % 3 ? '#ffffff' : '#f6f0e0', transparent: true, opacity: 0.1, depthWrite: false, fog: false }));
      const s = (7 + rand() * 6) * S;
      m.scale.set(s, s * 0.32, 1);
      m.position.set(x, heightAt(x, z) * (i < 14 ? 0 : 1) + 1 + rand() * 1.2, z);
      this.scene.add(m);
      items.push({ m, x, z, ph: rand() * 6, sp: 0.03 + rand() * 0.04 });
    }
    this.animated.push((t) => items.forEach((it) => {
      it.m.position.x = it.x + Math.sin(t * it.sp + it.ph) * 3;
      it.m.position.z = it.z + Math.cos(t * it.sp * 0.8 + it.ph) * 1.5;
      it.m.material.opacity = 0.06 + 0.05 * (0.5 + 0.5 * Math.sin(t * 0.2 + it.ph));
    }));
  }

  /** 遠方的群山與小島：讓視野開闊，有「身在山水之間」的感覺 */
  #farHills() {
    const rand = rng(77);
    const g = new THREE.Group();
    const cols = ['#9fb3ad', '#a9bcb6', '#b6c6c0', '#c4d0ca'];
    for (let ring = 0; ring < 3; ring++) {
      const n = 16 + ring * 6, R = 230 + ring * 120;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + rand() * 0.2, r = R + rand() * 60;
        const h = (30 + rand() * 60) * (1 + ring * 0.6), w = (70 + rand() * 90) * (1 + ring * 0.4);
        const geo = new THREE.ConeGeometry(w, h, 9, 3);
        const pos = geo.attributes.position;
        for (let k = 0; k < pos.count; k++) { const y = pos.getY(k); if (y > -h / 2 + 0.1 && y < h / 2 - 0.1) { pos.setX(k, pos.getX(k) * (0.85 + rand() * 0.3)); pos.setZ(k, pos.getZ(k) * (0.85 + rand() * 0.3)); } }
        geo.computeVertexNormals();
        const m = new THREE.Mesh(geo, mat(cols[ring + (i % 2)] || cols[3], { r: 1, flat: true }));
        m.position.set(Math.cos(a) * r, h / 2 - 8, Math.sin(a) * r);
        m.scale.y = 0.75;
        g.add(m);
      }
    }
    this.scene.add(g);
  }

  /** 飄落的花瓣 */
  #petals() {
    const n = 260, pos = new Float32Array(n * 3), seed = [];
    const rand = rng(5);
    for (let i = 0; i < n; i++) seed.push([(rand() - 0.5) * 120 * S / 2.2, rand() * 14, (rand() - 0.5) * 120 * S / 2.2, rand() * 6]);
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const c = document.createElement('canvas'); c.width = c.height = 32; const x = c.getContext('2d');
    x.fillStyle = '#f6c9d4'; x.beginPath(); x.ellipse(16, 16, 12, 7, 0.6, 0, 7); x.fill();
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
    const pts = new THREE.Points(geo, new THREE.PointsMaterial({ map: tex, size: 0.28, transparent: true, depthWrite: false, opacity: 0.9 }));
    pts.frustumCulled = false;
    this.scene.add(pts);
    this.petalCenter = new THREE.Vector2();
    this.animated.push((t) => {
      const cx = this.petalCenter.x, cz = this.petalCenter.y;
      for (let i = 0; i < n; i++) {
        const [ox, oy, oz, ph] = seed[i];
        const y = 14 - ((t * 0.6 + oy + ph) % 14);
        const wrap = (v, c) => c + ((((v - c) % 60) + 90) % 60) - 30;
        pos[i * 3] = wrap(ox + Math.sin(t * 0.5 + ph) * 2 + t * 0.4, cx);
        pos[i * 3 + 1] = heightAt(pos[i * 3], pos[i * 3 + 2]) + y;
        pos[i * 3 + 2] = wrap(oz + Math.cos(t * 0.4 + ph) * 2, cz);
      }
      geo.attributes.position.needsUpdate = true;
    });
  }

  /** 陽光的陰影範圍跟著旅人移動 */
  follow(x, z) {
    this.sun.target.position.set(x, 0, z);
    this.sun.position.set(x, 0, z).addScaledVector(SUN_DIR, 80);
    this.petalCenter?.set(x, z);
  }

  /** 地面高度（橋上用橋面高度） */
  groundAt(x, z) {
    for (const b of this.bridges || []) {
      const dx = x - b.x, dz = z - b.z, ax = Math.sin(b.angle), az = Math.cos(b.angle);
      const along = dx * ax + dz * az, across = -dx * az + dz * ax;
      if (Math.abs(along) < b.len / 2 && Math.abs(across) < 1.1) return b.y + Math.sin((along / b.len + 0.5) * Math.PI) * 0.35 + 0.08;
    }
    return heightAt(x, z);
  }

  #islandOutline() {
    const pts = [];
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * Math.PI * 2, r = islandR(a) * 1.02;
      pts.push(new THREE.Vector3(Math.cos(a) * r, 0.2, Math.sin(a) * r));
    }
    return pts;
  }

  update(t, dt = 0.016) {
    for (const fn of this.animated) fn(t, dt);
    for (const s of this.sprites) {
      const f = s.userData.flicker ?? 0;
      s.scale.setScalar(s.userData.base * (0.94 + 0.06 * Math.sin(t * 9 + f) + 0.03 * Math.sin(t * 23 + f * 2)));
    }
  }
}

function glowTexFor(color) {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const x = c.getContext('2d');
  const g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, color); g.addColorStop(0.35, color + '66'); g.addColorStop(1, color + '00');
  x.fillStyle = g; x.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
