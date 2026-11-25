import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { createTerrain, heightAt, hillAt, islandD, islandR, PEAK, PONDS } from './terrain.js';
import { createSky, createMist, cloudTexture } from './sky.js';
import { createWater } from './water.js';
import { BUILD, paifang, dock, pagoda, archBridge, pine, roundTree, plum, bamboo, shrub, scholarRock, boulder, tuft, lotus, lantern, mat, glow } from './props.js';
import { PathGraph } from './paths.js';
import { TASKS } from '../data/tasks.js';
import { GATE, GARDEN } from '../data/spots.js';

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
    const scene = this.scene;

    /* ---- 光與大氣：清晨的柔光與山間薄霧 ---- */
    scene.fog = new THREE.Fog('#e9ecdf', 70, 190);
    const sky = createSky(SUN_DIR);
    scene.add(sky.mesh); this.animated.push(sky.update);
    scene.add(new THREE.HemisphereLight('#e0ecff', '#8f8a62', 1.55));
    const sun = new THREE.DirectionalLight('#fff3dc', 2.9);
    sun.position.copy(SUN_DIR).multiplyScalar(60);
    sun.castShadow = true;
    sun.shadow.mapSize.set(lowPower ? 2048 : 4096, lowPower ? 2048 : 4096);
    Object.assign(sun.shadow.camera, { left: -44, right: 44, top: 44, bottom: -44, near: 10, far: 160 });
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.04;
    scene.add(sun);
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
      BUILD[s.kind](b, { color: task?.color });
      b.position.set(x, y - 0.04, z);
      b.rotation.y = s.rot || 0;
      statics.add(b);
      b.updateMatrixWorld(true);
      const bb = new THREE.Box3().setFromObject(b);
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

    /* ---- 人間佛教殿前的四盞燈（四句教互動時點亮） ---- */
    const hall = this.spots.get('dharmahall');
    this.hallGlows = [-3.3, -1.1, 1.1, 3.3].map((lx, i) => {
      const c = Math.cos(hall.rot || 0), sn = Math.sin(hall.rot || 0), lz = 4.4;
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexFor('#ffd08a'), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, opacity: 0.9 }));
      sp.position.set(hall.at[0] + lx * c + lz * sn, hall.pos.y + 1.05, hall.at[1] - lx * sn + lz * c);
      sp.scale.setScalar(1.7);
      sp.visible = i === 0 ? false : false;
      scene.add(sp);
      return sp;
    });

    /* ---- 山門與渡口 ---- */
    const pf = new THREE.Group(); paifang(pf); pf.position.set(GATE.at[0], heightAt(...GATE.at) - 0.02, GATE.at[1]); statics.add(pf);
    const dk = new THREE.Group(); dock(dk, 4.4); dk.position.set(GATE.dock[0], 0, GATE.dock[1] + 1.6); statics.add(dk);
    this.reserved.push([GATE.at[0], GATE.at[1], 3.4], [GATE.dock[0], GATE.dock[1], 3]);

    /* ---- 地標：西北峰頂的七層塔 ---- */
    const pg = new THREE.Group();
    const px = -14, pz = -20.5;
    this.pagodaTop = pagoda(pg, 0.8);
    pg.position.set(px, heightAt(px, pz) - 0.1, pz); statics.add(pg);
    this.reserved.push([px, pz, 3.2]);

    /* ---- 放生池上的拱橋 ---- */
    const pond2 = PONDS[1];
    const br = new THREE.Group(); archBridge(br, 4.6, 1.2); br.position.set(pond2.x, -0.05, pond2.z); br.rotation.y = 0.5; statics.add(br);
    this.reserved.push([pond2.x, pond2.z, 3]);

    /* ---- 善念實踐園：池邊的太湖石與石燈 ---- */
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + 0.3, r = GARDEN.ring + 0.9;
      const x = GARDEN.x + Math.cos(a) * (GARDEN.pond + 0.55), z = GARDEN.z + Math.sin(a) * (GARDEN.pond + 0.55);
      if (i % 2) scholarRock(statics, x, heightAt(x, z), z, 0.7, i + 3);
      else lantern(statics, GARDEN.x + Math.cos(a) * r, heightAt(GARDEN.x + Math.cos(a) * r, GARDEN.z + Math.sin(a) * r), GARDEN.z + Math.sin(a) * r, 0.75, i === 0);
    }

    this.#aiOrb();
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

    this.peakTop = new THREE.Vector3(PEAK.x, heightAt(PEAK.x, PEAK.z), PEAK.z);
    this.islandPoints = this.#islandOutline();
  }

  /** AI 智慧講堂前方的光環：一顆柔光的球與兩道緩緩轉動的環 */
  #aiOrb() {
    const s = this.spots.get('lecture');
    if (!s) return;
    const g = new THREE.Group();
    const fx = s.at[0] + Math.sin(s.rot) * 3.6, fz = s.at[1] + Math.cos(s.rot) * 3.6;
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

    // 松林：山巒與北側
    place(70, 6000, anywhere(0.25, 0.86), (x, z) => (hillAt(x, z) > 1.1 || z < -14 || Math.hypot(x, z) > 23) && inland(x, z) && free(x, z, 1.4),
      (x, y, z, i) => pine(g, x, y - 0.05, z, 0.85 + rand() * 0.55, i + 1));
    // 闊葉樹，東北與西南帶一點秋色
    place(46, 5000, anywhere(0.2, 0.84), (x, z) => inland(x, z) && free(x, z, 1.5) && hillAt(x, z) < 2.4,
      (x, y, z, i) => roundTree(g, x, y - 0.05, z, 0.85 + rand() * 0.45, i + 7, (x > 14 && z < -6) || (x < -14 && z > 8) ? rand() > 0.3 : rand() > 0.88));
    // 竹林：生命長廊後方與講堂旁
    place(16, 3000, () => [rand() > 0.5 ? -23 + rand() * 6 : 10 + rand() * 7, rand() > 0.5 ? -2 + rand() * 12 : 19 + rand() * 5], (x, z) => inland(x, z, 0.88) && free(x, z, 1.0),
      (x, y, z, i) => bamboo(g, x, y, z, 0.9 + rand() * 0.3, i + 11));
    // 梅：善念實踐園外圈與山門參道兩側
    place(14, 3000, () => { const a = rand() * Math.PI * 2, r = GARDEN.r + 2 + rand() * 2.5; return [GARDEN.x + Math.cos(a) * r, GARDEN.z + Math.sin(a) * r]; }, (x, z) => inland(x, z) && free(x, z, 0.8),
      (x, y, z, i) => plum(g, x, y, z, 0.95 + rand() * 0.3, i + 21));
    place(8, 2000, () => [(rand() > 0.5 ? 1 : -1) * (2 + rand() * 3), 12 + rand() * 12], (x, z) => inland(x, z) && free(x, z, 0.7),
      (x, y, z, i) => plum(g, x, y, z, 0.9 + rand() * 0.3, i + 51));
    // 灌叢、山石與草叢
    place(90, 5000, anywhere(0.15, 0.9), (x, z) => inland(x, z, 0.92) && free(x, z, 0.5),
      (x, y, z, i) => shrub(g, x, y, z, 0.55 + rand() * 0.5, i));
    place(26, 3000, anywhere(0.2, 0.85), (x, z) => (hillAt(x, z) > 0.8) && inland(x, z) && free(x, z, 0.7),
      (x, y, z, i) => boulder(g, x, y + 0.05, z, 0.25 + rand() * 0.35, i + 3));
    place(900, 9000, anywhere(0.1, 0.88), (x, z) => inland(x, z, 0.9) && free(x, z, 0.35) && hillAt(x, z) < 3.4,
      (x, y, z, i) => tuft(g, x, y - 0.02, z, 0.6 + rand() * 0.7, i + 3));
    // 岸邊礁石
    for (let i = 0; i < 34; i++) {
      const a = rand() * Math.PI * 2, d = 0.96 + rand() * 0.09;
      const x = Math.cos(a) * islandR(a) * d, z = Math.sin(a) * islandR(a) * d;
      if (Math.abs(x) < 3.5 && z > 20) continue;
      boulder(g, x, heightAt(x, z) + 0.05, z, 0.3 + rand() * 0.55, 200 + i, mat('#7f7d72', { r: 1, flat: true }));
    }
  }

  #lotusPads() {
    const g = new THREE.Group();
    PONDS.forEach((p, pi) => {
      for (let i = 0; i < 12; i++) {
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
    flock(0, -4, 22, 12, 5, 0.12, 4);
    flock(6, 2, 15, 9, 3, -0.18, 9);
  }

  #lowMist() {
    const tex = cloudTexture();
    const rand = rng(23);
    const items = [];
    for (let i = 0; i < 24; i++) {
      const a = rand() * Math.PI * 2, d = i < 14 ? 0.95 + rand() * 0.6 : 0.35 + rand() * 0.4;
      const x = Math.cos(a) * islandR(a) * d, z = Math.sin(a) * islandR(a) * d;
      const m = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, color: i % 3 ? '#ffffff' : '#f6f0e0', transparent: true, opacity: 0.1, depthWrite: false, fog: false }));
      const s = 7 + rand() * 6;
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

  #islandOutline() {
    const pts = [];
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * Math.PI * 2, r = islandR(a) * 1.02;
      pts.push(new THREE.Vector3(Math.cos(a) * r, 0.2, Math.sin(a) * r));
    }
    return pts;
  }

  /** 四句教：依點亮的燈號顯示光暈 */
  lightHall(set) { this.hallGlows?.forEach((g, i) => { g.visible = set.has(i); }); }

  update(t) {
    this.hallGlows?.forEach((g, i) => { if (g.visible) g.scale.setScalar(1.6 + Math.sin(t * 3 + i) * 0.12); });
    for (const fn of this.animated) fn(t);
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
