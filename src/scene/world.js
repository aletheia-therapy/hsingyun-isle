import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { createTerrain, shadeGround, heightAt, hillAt, islandD, islandR, PEAK, PONDS, pondAt, streamAt, STAIR } from './terrain.js';
import { createSky, createMist } from './sky.js';
import { createWater } from './water.js';
import { BUILD, paifang, dock, pagoda, archBridge, scholarRock, boulder, lotus, lantern, woodBridge } from './props.js';
import { broadleaf, maple, pine, bamboo, shrub, grassField, GM, WIND } from './foliage.js';
import { PathGraph } from './paths.js';
import { TEX } from './textures.js';
import { TASKS } from '../data/tasks.js';
import { GATE, GARDEN, S } from '../data/spots.js';
import { villager, ringMarker, questItem } from './npc.js';

/** 陽光從東南方斜照（約 37 度仰角） */
export const SUN_DIR = new THREE.Vector3(36, 30, 22).normalize();
/** 天邊的薄霧色（輸出色彩空間），與天空地平線、遠山一致 */
export const HAZE = '#cfd8dc';
const SHADOW_HALF = 30, SHADOW_MAP = 2048;

/** 任務物件的種類：組員對話、湖邊先靜心（蒲團）再熄滅三把心火、或依 kinds 指定 */
export const questKind = (q, i) => q.kinds?.[i] || (q.type === 'talk' ? 'person' : q.type === 'heart' ? (i === 0 ? 'lotus' : 'fire') : q.item);
/** 一開始就在島上的物件（柳丁、感謝卡、心火要等任務開始才出現） */
const ALWAYS_SHOWN = new Set(['lamp', 'lotus', 'person', 'book', 'easel', 'pot']);
/** 物件的碰撞半徑 */
const ITEM_R = { lamp: 0.3, person: 0.3, fire: 0.48, book: 0.6, easel: 0.42, pot: 0.32 };

function rng(seed) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * 把靜態群組依「材質＋是否投影」合併成少數幾個網格（大幅減少繪製呼叫）。
 * 有頂點色的材質保留顏色屬性；發光精靈另外保留。
 */
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
    const keepColor = !!o.material.vertexColors;
    for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'uv' && !(keepColor && k === 'color')) g.deleteAttribute(k);
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    if (!g.attributes.normal) g.computeVertexNormals();
    if (keepColor && !g.attributes.color) g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 3).fill(1), 3));
    const key = o.material.uuid + (o.castShadow ? '|c' : '|n');
    if (!buckets.has(key)) buckets.set(key, { m: o.material, geos: [], cast: o.castShadow });
    buckets.get(key).geos.push(g);
  });
  for (const { m, geos, cast } of buckets.values()) {
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
    this.canopy = [];
    this.lowPower = lowPower;
    const scene = this.scene;

    /* ---- 光與大氣：晴朗的上午，帶一點湖面的水氣 ---- */
    scene.fog = new THREE.Fog(HAZE, 90, 540);
    const sky = createSky(SUN_DIR);
    scene.add(sky.mesh); this.animated.push(sky.update);
    this.hemi = new THREE.HemisphereLight('#dbe7f3', '#71704c', 1.35);
    scene.add(this.hemi);
    const sun = new THREE.DirectionalLight('#fff2df', 2.9);
    sun.castShadow = true;
    const ms = lowPower ? 1024 : SHADOW_MAP;
    sun.shadow.mapSize.set(ms, ms);
    Object.assign(sun.shadow.camera, { left: -SHADOW_HALF, right: SHADOW_HALF, top: SHADOW_HALF, bottom: -SHADOW_HALF, near: 20, far: 170 });
    sun.shadow.bias = -0.0005;
    sun.shadow.normalBias = 0.035;
    scene.add(sun, sun.target);
    this.sun = sun;
    this.shadowTexel = (SHADOW_HALF * 2) / ms;

    const water = createWater(SUN_DIR);
    scene.add(water.mesh); this.animated.push(water.update);

    /* ---- 步道（先建，地形要依步道畫出路旁被踩過的草地） ---- */
    this.graph = new PathGraph(spots);
    this.edge = this.graph.edgeField();
    this.terrain = createTerrain(this.edge);
    scene.add(this.terrain);
    scene.add(this.graph.buildMesh());

    /* ---- 地點建築 ---- */
    const statics = new THREE.Group();
    const contact = [];
    for (const s of spots) {
      const [x, z] = s.at;
      const y = heightAt(x, z);
      const b = new THREE.Group();
      const task = TASKS.find((t) => t.id === s.task);
      BUILD[s.kind](b, { color: task?.color || s.npc?.color });
      // 碰撞範圍只算「會撞到的部分」（台基、牆、柱），不含伸出去的屋簷
      const local = new THREE.Box3(), part = new THREE.Box3();
      b.updateMatrixWorld(true);
      b.traverse((o) => {
        if (!o.isMesh) return;
        if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
        part.copy(o.geometry.boundingBox).applyMatrix4(o.matrixWorld);
        if (part.min.y < 1.3) local.union(part);
      });
      const k = s.kind === 'house' || s.kind === 'pavilion' || s.kind === 'stele' ? 1.22 : 1;
      b.scale.setScalar(k);
      b.position.set(x, y - 0.04, z);
      b.rotation.y = s.rot || 0;
      statics.add(b);
      b.updateMatrixWorld(true);
      const bb = new THREE.Box3().setFromObject(b);
      const inv = b.matrixWorld.clone().invert();
      if (s.kind === 'terrace') this.circles.push([x + Math.sin(s.rot || 0) * -1.3, z + Math.cos(s.rot || 0) * -1.3, 1.3]);
      else this.boxes.push({ inv, box: local.clone().expandByScalar(0.12) });
      const sz = local.getSize(new THREE.Vector3()).multiplyScalar(k), c = local.getCenter(new THREE.Vector3()).multiplyScalar(k).applyAxisAngle(new THREE.Vector3(0, 1, 0), s.rot || 0);
      contact.push([x + c.x, y, z + c.z, sz.x * 1.25 + 1, sz.z * 1.25 + 1, s.rot || 0]);
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
    contact.push([GATE.at[0], heightAt(...GATE.at), GATE.at[1], 7.5, 2.2, 0]);
    const dk = new THREE.Group(); dock(dk, 4.4); dk.position.set(GATE.dock[0], 0, GATE.dock[1] + 1.6); statics.add(dk);
    this.reserved.push([GATE.at[0], GATE.at[1], 3.4], [GATE.dock[0], GATE.dock[1], 3]);
    for (const px of [-2.6, -0.95, 0.95, 2.6]) this.circles.push([GATE.at[0] + px, GATE.at[1], 0.32]);

    /* ---- 地標：西北峰頂的七層塔 ---- */
    const pg = new THREE.Group();
    const px = -14 * S, pz = -21 * S;
    this.pagodaTop = pagoda(pg, 1.1);
    pg.position.set(px, heightAt(px, pz) - 0.1, pz); statics.add(pg);
    contact.push([px, heightAt(px, pz), pz, 5.5, 5.5, 0]);
    this.reserved.push([px, pz, 3.2]);
    this.circles.push([px, pz, 1.9]);

    /* ---- 放生池上的石拱橋 ---- */
    const pond2 = PONDS[1];
    const br = new THREE.Group(); archBridge(br, 7.4, 1.4); br.position.set(pond2.x, -0.05, pond2.z); br.rotation.y = 0.5; statics.add(br);
    this.reserved.push([pond2.x, pond2.z, 5]);
    // 拱橋可以走：橋面高度 = 拱形，兩端接到岸上
    this.decks = [{ x: pond2.x, z: pond2.z, angle: Math.PI / 2 + 0.5, len: 7.4, hw: 0.5, top: (t) => -0.05 + 0.39 + Math.sin(t * Math.PI) * 0.7, arch: true }];

    /* ---- 小溪上的木橋（步道跨溪處） ---- */
    this.bridges = this.graph.bridges();
    for (const b of this.bridges) {
      const wb = new THREE.Group(); woodBridge(wb, b.len, 2.2, b.h0 - b.y, b.h1 - b.y, b.arc);
      wb.position.set(b.x, b.y, b.z); wb.rotation.y = b.angle - Math.PI / 2; statics.add(wb);
      this.reserved.push([b.x, b.z, b.len / 2 + 1]);
      this.decks.push({ ...b, top: (t) => b.h0 + (b.h1 - b.h0) * t + Math.sin(t * Math.PI) * b.arc + 0.02 });
    }

    /* ---- 四給街：池邊的太湖石與石燈 ---- */
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + 0.3, r = GARDEN.ring + 0.9;
      const x = GARDEN.x + Math.cos(a) * (GARDEN.pond + 0.55), z = GARDEN.z + Math.sin(a) * (GARDEN.pond + 0.55);
      if (i % 2) { scholarRock(statics, x, heightAt(x, z), z, 0.8, i + 3); this.circles.push([x, z, 0.45]); }
      else lantern(statics, GARDEN.x + Math.cos(a) * r, heightAt(GARDEN.x + Math.cos(a) * r, GARDEN.z + Math.sin(a) * r), GARDEN.z + Math.sin(a) * r, 0.75, true);
    }

    /* ---- 登頂石階：保留範圍，底端兩盞石燈 ---- */
    for (let z = STAIR.z1; z <= STAIR.z0 + 1; z += 1.2) this.reserved.push([STAIR.x, z, STAIR.hw + 1.6]);
    for (const sx of [-1, 1]) { const lx = STAIR.x + sx * (STAIR.hw + 0.9), lz = STAIR.z0 + 0.9; lantern(statics, lx, heightAt(lx, lz), lz, 1.1, true); this.circles.push([lx, lz, 0.32]); }

    this.#people(spots);
    this.#scatter(statics, spots);
    bake(statics, scene, this.sprites);
    this.#contactShadows(contact);
    shadeGround(this.terrain, this.canopy);
    this.#grass();
    this.#lotusPads();
    this.#birds();

    /* ---- 遠處的雲 ---- */
    const mist = createMist([
      [-90, 40, -260, 120, '#ffffff', 0.35], [110, 46, -280, 140, '#ffffff', 0.3], [-260, 36, -60, 110, '#ffffff', 0.3],
    ]);
    scene.add(mist.group); this.animated.push(mist.update);
    this.#farHills();

    this.peakTop = new THREE.Vector3(PEAK.x, heightAt(PEAK.x, PEAK.z), PEAK.z);
    this.islandPoints = this.#islandOutline();
  }

  #scatter(g, spots) {
    const rand = rng(1927);
    const edge = this.edge;
    const blocked = spots.map((s) => [s.at[0], s.at[1], Math.min(s.r || 3.2, 3) + 0.6]);
    const boxes = [...this.spots.values()].map((s) => s.bounds.clone().expandByScalar(0.9));
    this.inBox = (x, z, pad = 0) => boxes.some((b) => x > b.min.x - pad && x < b.max.x + pad && z > b.min.z - pad && z < b.max.z + pad);
    const ponds = PONDS.map((p) => [p.x, p.z, p.s * 1.25]);
    const free = (x, z, gap) => edge(x, z) > gap
      && !blocked.some(([bx, bz, r]) => Math.hypot(x - bx, z - bz) < r) && !this.inBox(x, z)
      && !ponds.some(([bx, bz, r]) => Math.hypot(x - bx, z - bz) < r)
      && !this.reserved.some(([bx, bz, r]) => Math.hypot(x - bx, z - bz) < r);
    const apart = (x, z, d) => !this.circles.some(([cx, cz]) => Math.hypot(x - cx, z - cz) < d);
    const inland = (x, z, lim = 0.86) => islandD(x, z) < lim;
    const place = (n, tries, pick, ok, make) => {
      for (let i = 0, k = 0; i < tries && k < n; i++) {
        const [x, z] = pick();
        if (!ok(x, z)) continue;
        make(x, heightAt(x, z), z, i); k++;
      }
    };
    const anywhere = (lo = 0.15, hi = 0.88) => () => { const a = rand() * Math.PI * 2, r = islandR(a) * (lo + rand() * (hi - lo)); return [Math.cos(a) * r, Math.sin(a) * r]; };
    const dry = (x, z) => streamAt(x, z) < 0.01 && pondAt(x, z) < 0.25;

    // 黑松：山巒、北側與島的外圈
    place(30, 30000, anywhere(0.2, 0.88), (x, z) => (hillAt(x, z) > 1.6 || z < -14 * S || Math.hypot(x, z) > 25 * S) && inland(x, z) && free(x, z, 2.4) && dry(x, z) && apart(x, z, 3.4),
      (x, y, z, i) => { const t = pine(g, x, y, z, 0.95 + rand() * 0.45, i + 1); this.circles.push(t.trunk); this.canopy.push([x, z, 2.6]); });
    // 闊葉樹：散布全島
    place(32, 30000, anywhere(0.12, 0.86), (x, z) => inland(x, z) && free(x, z, 2.8) && hillAt(x, z) < 4 && dry(x, z) && apart(x, z, 4),
      (x, y, z, i) => { const t = broadleaf(g, x, y, z, 0.85 + rand() * 0.4, i + 7); this.circles.push(t.trunk); this.canopy.push(t.crown); });
    // 紅楓：四給街外圈與山門參道（秋天的顏色）
    place(6, 9000, () => { const a = rand() * Math.PI * 2, r = GARDEN.r + 3.5 + rand() * 5; return [GARDEN.x + Math.cos(a) * r, GARDEN.z + Math.sin(a) * r]; }, (x, z) => inland(x, z) && free(x, z, 1.6) && dry(x, z) && apart(x, z, 3),
      (x, y, z, i) => { const t = maple(g, x, y, z, 1 + rand() * 0.3, i + 21); this.circles.push([x, z, 0.22]); this.canopy.push([x, z, 1.8]); });
    place(3, 9000, () => [(rand() - 0.5) * 16, 18 * S + rand() * 8 * S], (x, z) => inland(x, z) && free(x, z, 1.8) && dry(x, z) && apart(x, z, 3),
      (x, y, z, i) => { maple(g, x, y, z, 1 + rand() * 0.3, i + 51); this.circles.push([x, z, 0.22]); this.canopy.push([x, z, 1.8]); });
    // 竹林：三好村後方、講堂旁
    place(8, 9000, () => [rand() > 0.5 ? -24 * S + rand() * 8 * S : 8 * S + rand() * 9 * S, rand() > 0.5 ? -6 * S + rand() * 16 * S : 17 * S + rand() * 7 * S], (x, z) => inland(x, z, 0.88) && free(x, z, 1.4) && dry(x, z) && apart(x, z, 2.2),
      (x, y, z, i) => { const t = bamboo(g, x, y, z, 1 + rand() * 0.3, i + 11); this.circles.push(t.trunk); this.canopy.push([x, z, 1.6]); });
    // 灌叢：建築旁與路旁
    place(46, 20000, anywhere(0.1, 0.88), (x, z) => inland(x, z, 0.9) && free(x, z, 0.5) && dry(x, z) && (edge(x, z) < 2.5 || this.inBox(x, z, 2)),
      (x, y, z, i) => shrub(g, x, y, z, 0.8 + rand() * 0.6, i));
    // 山石：山坡與溪邊
    place(20, 9000, anywhere(0.15, 0.86), (x, z) => (hillAt(x, z) > 1.0 || streamAt(x + 2.6, z) > 0 || streamAt(x - 2.6, z) > 0) && inland(x, z) && free(x, z, 0.8) && dry(x, z),
      (x, y, z, i) => { const r = 0.35 + rand() * 0.6; boulder(g, x, y + 0.08, z, r, i + 3); this.circles.push([x, z, r * 1.05]); });
    // 步道旁的石燈籠（間隔較大，不要太多）
    const pts = [];
    this.graph.edges.forEach(([ia, ib]) => { const a = this.graph.nodes[ia], b = this.graph.nodes[ib], n = Math.ceil(a.distanceTo(b) / 3); for (let i = 0; i <= n; i++) pts.push([new THREE.Vector2().lerpVectors(a, b, i / n), b.clone().sub(a).normalize()]); });
    const lit = [];
    for (let i = 0; i < pts.length; i += 5) {
      const [p, d] = pts[i];
      const x = p.x - d.y * 1.85, z = p.y + d.x * 1.85;
      if (!inland(x, z) || !dry(x, z) || lit.some(([lx, lz]) => Math.hypot(lx - x, lz - z) < 13) || this.reserved.some(([bx, bz, r]) => Math.hypot(x - bx, z - bz) < r) || blocked.some(([bx, bz, r]) => Math.hypot(x - bx, z - bz) < r) || this.inBox(x, z) || edge(x, z) < 0.25) continue;
      lantern(g, x, heightAt(x, z), z, 1, true); lit.push([x, z]); this.circles.push([x, z, 0.3]);
    }
    // 岸邊礁石
    for (let i = 0; i < 40; i++) {
      const a = rand() * Math.PI * 2, d = 0.95 + rand() * 0.1;
      const x = Math.cos(a) * islandR(a) * d, z = Math.sin(a) * islandR(a) * d;
      if (Math.abs(x) < 4 && z > 20 * S) continue;
      boulder(g, x, heightAt(x, z) + 0.05, z, 0.35 + rand() * 0.6, 200 + i, { wet: true, tall: 0.55 });
    }
  }

  /** 草地與野花：實例化的草叢卡片（一次繪製） */
  #grass() {
    const rand = rng(77), edge = this.edge;
    const grass = [], flowers = [];
    const ok = (x, z) => islandD(x, z) < 0.89 && pondAt(x, z) < 0.18 && streamAt(x, z) < 0.01 && edge(x, z) > 0.12 && !this.inBox(x, z, 0.2)
      && !this.reserved.some(([bx, bz, r]) => Math.hypot(x - bx, z - bz) < r * 0.8) && !this.circles.some(([cx, cz, r]) => Math.hypot(x - cx, z - cz) < r + 0.15);
    const tint = (x, z, k = 1) => {
      const h = hillAt(x, z), d = islandD(x, z), n = Math.sin(x * 0.31 + z * 0.17) * 0.5 + 0.5;
      const dryK = Math.min(1, h * 0.12 + Math.max(0, d - 0.8) * 4) * 0.6;
      return [(0.86 + n * 0.16 + dryK * 0.25) * k, (0.95 + n * 0.08 + dryK * 0.05) * k, (0.8 + dryK * 0.02) * k];
    };
    const maxGrass = this.lowPower ? 1500 : 2600;
    for (let i = 0; i < 16000 && grass.length < maxGrass; i++) {
      let x, z;
      if (rand() < 0.5) {                            // 路旁較密
        const e = this.graph.edges[Math.floor(rand() * this.graph.edges.length)], a = this.graph.nodes[e[0]], b = this.graph.nodes[e[1]];
        const t = rand(), d = b.clone().sub(a).normalize(), s = (rand() > 0.5 ? 1 : -1) * (1.3 + rand() * 2.2);
        x = a.x + (b.x - a.x) * t - d.y * s; z = a.y + (b.y - a.y) * t + d.x * s;
      } else { const a = rand() * Math.PI * 2, r = islandR(a) * Math.sqrt(rand()) * 0.88; x = Math.cos(a) * r; z = Math.sin(a) * r; }
      if (!ok(x, z)) continue;
      const y = heightAt(x, z), sl = Math.abs(heightAt(x + 0.5, z) - y) + Math.abs(heightAt(x, z + 0.5) - y);
      if (sl > 0.45) continue;
      grass.push([x, y - 0.03, z, 0.75 + rand() * 0.7, rand() * 6.28, tint(x, z, 0.92 + rand() * 0.16)]);
      if (rand() < 0.1 && edge(x, z) < 3) for (let k = 0; k < 3; k++) {
        const fx = x + (rand() - 0.5) * 1.4, fz = z + (rand() - 0.5) * 1.4;
        if (ok(fx, fz)) flowers.push([fx, heightAt(fx, fz) - 0.02, fz, 0.7 + rand() * 0.5, rand() * 6.28, [1, 1, 1]]);
      }
    }
    this.grass = grassField(grass, GM.grass, { w: 0.85, h: 0.44 });
    // 完成一站時要長出的花（預留在同一個實例化網格裡）
    this.bloomSlots = new Map();
    const order = [...this.spots.keys()];
    this.flowers = grassField(flowers, GM.flower, { w: 0.75, h: 0.36, extra: order.length * 14 });
    order.forEach((id, si) => this.bloomSlots.set(id, { start: flowers.length + si * 14, n: 14 }));
    this.scene.add(this.grass, this.flowers);
  }

  /** 建築底部的接觸陰影：讓房子「坐」在地上 */
  #contactShadows(list) {
    const m = new THREE.MeshBasicMaterial({ map: TEX.contact, transparent: true, depthWrite: false, opacity: 0.55, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 });
    for (const [x, y, z, w, d, rot] of list) {
      const p = new THREE.Mesh(new THREE.PlaneGeometry(w, d), m);
      p.rotation.set(-Math.PI / 2, 0, rot); p.position.set(x, y + 0.06, z); p.renderOrder = 1;
      this.scene.add(p);
    }
  }

  /** 島民、互動光圈、任務物件 */
  #people(spots) {
    for (const s of spots) {
      const task = TASKS.find((t) => t.id === s.task);
      const npcDef = task?.npc || s.npc;
      const [fx, fz] = s.front;
      const ring = ringMarker();
      ring.group.position.set(fx, heightAt(fx, fz) + 0.06, fz);
      this.scene.add(ring.group); this.rings.set(s.id, ring);
      this.animated.push((t, dt) => ring.update(dt));
      this.reserved.push([fx, fz, 1.6]);
      if (npcDef) {
        const v = villager(npcDef.look, npcDef.color, npcDef.name, task?.id || s.id);
        const face = Math.atan2(fx - s.at[0], fz - s.at[1]);
        // 島民站在光圈後側，面向來訪的人
        const nx = fx - Math.sin(face) * 0.55, nz = fz - Math.cos(face) * 0.55;
        v.group.position.set(nx, heightAt(nx, nz), nz);
        v.group.rotation.y = face;
        v.home = new THREE.Vector2(nx, nz); v.face = face;
        if (s.id === 'origin') v.setMood('idle');
        this.scene.add(v.group); this.npcs.set(s.id, v);
        this.animated.push((t, dt) => v.update(dt));
      }
      if (task?.quest?.at) {
        const q = task.quest;
        const list = q.at.map(([x, z], i) => {
          const kind = questKind(q, i);
          const opt = kind === 'person' ? q.people[i] : kind === 'fire' ? q.fires[i - 1] : {};
          const it = questItem(kind, i, opt);
          // 放在斜坡上的物件：以底座範圍內最低的地面為準，不會一邊懸空
          const y = kind === 'person' ? heightAt(x, z) : Math.min(heightAt(x, z), ...[[0.32, 0], [-0.32, 0], [0, 0.32], [0, -0.32]].map(([a, b]) => heightAt(x + a, z + b)));
          it.group.position.set(x, y, z);
          if (kind === 'person') it.group.rotation.y = Math.atan2(fx - x, fz - z);
          it.group.visible = ALWAYS_SHOWN.has(kind);
          this.scene.add(it.group);
          this.animated.push((t, dt) => it.update(dt));
          this.reserved.push([x, z, 1.4]);
          const r = ITEM_R[kind];
          if (r) this.circles.push([x, z, r]);
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
    if (this.deckAt(x, z)) return true;                  // 橋面上
    if (this.railAt(x, z)) return false;                 // 橋的欄杆
    if (islandD(x, z) > 0.9) return false;
    if (pondAt(x, z) > 0.42) return false;
    if (streamAt(x, z) > 0.35) return false;
    for (const [cx, cz, r] of this.circles) if ((x - cx) ** 2 + (z - cz) ** 2 < r * r) return false;
    // 石階兩側的石欄：只能從上下兩端進出
    if (z < STAIR.z0 + 0.1 && z > STAIR.z1 - 0.1) { const d = Math.abs(x - STAIR.x); if (d > STAIR.hw - 0.05 && d < STAIR.hw + 0.4) return false; }
    const p = _p;
    for (const b of this.boxes) {
      p.set(x, 0, z).applyMatrix4(b.inv);
      if (p.x > b.box.min.x && p.x < b.box.max.x && p.z > b.box.min.z && p.z < b.box.max.z) return false;
    }
    return true;
  }

  /** 完成一站：島民開心，光圈旁長出一圈野花 */
  bloom(id, instant = false) {
    const s = this.spots.get(id); if (!s || s.bloomed) return;
    s.bloomed = true;
    const v = this.npcs.get(id);
    if (v) v.setMood('happy');
    const slot = this.bloomSlots?.get(id); if (!slot) return;
    const [fx, fz] = s.front, rand = rng(id.length * 131 + id.charCodeAt(0));
    const targets = [];
    for (let i = 0; i < slot.n * 3 && targets.length < slot.n; i++) {
      const a = rand() * Math.PI * 2, r = 1.5 + rand() * 2.4, x = fx + Math.cos(a) * r, z = fz + Math.sin(a) * r;
      if (islandD(x, z) > 0.88 || pondAt(x, z) > 0.2 || this.edge(x, z) < 0.05 || this.inBox(x, z)) continue;
      targets.push([x, heightAt(x, z) - 0.02, z, 0.8 + rand() * 0.5, rand() * 6.28]);
    }
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), sc = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
    let t0 = instant ? 1 : 0;
    const apply = (e) => {
      targets.forEach(([x, y, z, s0, ry], i) => {
        const k = Math.max(0, Math.min(1, e * 1.6 - i * 0.04));
        q.setFromAxisAngle(up, ry); p.set(x, y, z); sc.setScalar(s0 * (1 - (1 - k) ** 3));
        m.compose(p, q, sc); this.flowers.setMatrixAt(slot.start + i, m);
      });
      this.flowers.instanceMatrix.needsUpdate = true;
    };
    if (instant) { apply(1); return; }
    const fn = (t, dt) => { t0 = Math.min(1, t0 + dt * 0.8); apply(t0); if (t0 >= 1) this.animated.splice(this.animated.indexOf(fn), 1); };
    this.animated.push(fn);
  }

  #lotusPads() {
    const g = new THREE.Group();
    PONDS.forEach((p, pi) => {
      for (let i = 0; i < 20; i++) {
        const a = i * 2.39 + pi, d = p.s * (0.25 + (i % 4) * 0.17);
        if (pi === 1 && Math.abs(Math.sin(a - 0.5)) < 0.35) continue;      // 讓出拱橋
        lotus(g, p.x + Math.cos(a) * d, 0.03, p.z + Math.sin(a) * d, pi * 13 + i + 1);
      }
    });
    bake(g, this.scene, this.sprites);
  }

  /** 白鷺：繞島緩緩飛行 */
  #birds() {
    const birdM = new THREE.MeshStandardMaterial({ color: '#f4f2ec', roughness: 0.8, side: THREE.DoubleSide });
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
    flock(0, -4 * S, 22 * S, 18, 5, 0.08, 4);
    flock(-14 * S, 10 * S, 9 * S, 11, 3, 0.15, 13);
  }

  /** 遠山：三層山稜，越遠越淡，像湖邊被群山環抱（依空氣透視上色） */
  #farHills() {
    const haze = new THREE.Color(HAZE), sun = SUN_DIR;
    const layers = [
      { R: 210, W: 80, H: [26, 64], col: '#4f6a52', hz: 0.32, seed: 3, seg: 240 },
      { R: 320, W: 110, H: [40, 105], col: '#5e7466', hz: 0.55, seed: 7, seg: 220 },
      { R: 470, W: 140, H: [60, 160], col: '#71837d', hz: 0.72, seed: 11, seg: 200 },
    ];
    for (const L of layers) {
      const r = rng(L.seed), ph = Array.from({ length: 6 }, () => r() * 6.28);
      const ridge = (a) => {
        let h = 0.5 + 0.24 * Math.sin(a * 3 + ph[0]) + 0.16 * Math.sin(a * 7 + ph[1]) + 0.1 * Math.sin(a * 13 + ph[2]) + 0.05 * Math.sin(a * 31 + ph[3]) + 0.03 * Math.sin(a * 57 + ph[4]);
        h = Math.pow(Math.max(0.02, h), 1.5);
        const north = 0.62 + 0.38 * Math.max(0, -Math.sin(a));          // 北邊的山較高
        return (L.H[0] + (L.H[1] - L.H[0]) * h) * north;
      };
      const rows = 7, pos = [], idx = [];
      for (let i = 0; i <= L.seg; i++) {
        const a = (i / L.seg) * Math.PI * 2, hm = ridge(a);
        for (let j = 0; j <= rows; j++) {
          const t = j / rows, rr = L.R + t * L.W * (0.9 + 0.2 * Math.sin(a * 5 + ph[5]));
          const prof = Math.pow(Math.sin(Math.min(1, t * 1.25) * Math.PI * 0.5 + (t > 0.8 ? 0 : 0)), 0.8) * (t < 0.8 ? 1 : 1 - (t - 0.8) * 2.5);
          const y = -3 + hm * Math.max(0, prof) * (1 + 0.06 * Math.sin(a * 90 + j * 2.1));
          pos.push(Math.cos(a) * rr, y, Math.sin(a) * rr);
        }
      }
      for (let i = 0; i < L.seg; i++) for (let j = 0; j < rows; j++) {
        const a = i * (rows + 1) + j, b = a + rows + 1;
        idx.push(a, b, a + 1, a + 1, b, b + 1);
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      geo.setIndex(idx); geo.computeVertexNormals();
      const n = geo.attributes.normal, p = geo.attributes.position, col = new Float32Array(p.count * 3);
      const base = new THREE.Color(L.col), c = new THREE.Color();
      const hmax = L.H[1];
      for (let i = 0; i < p.count; i++) {
        const lam = Math.max(0, n.getX(i) * sun.x + n.getY(i) * sun.y + n.getZ(i) * sun.z);
        c.copy(base).multiplyScalar(0.55 + 0.6 * lam);
        const low = 1 - Math.min(1, Math.max(0, p.getY(i)) / (hmax * 0.6));      // 山腳的水氣
        c.lerp(haze, Math.min(1, L.hz + low * 0.35));
        col.set([c.r, c.g, c.b], i * 3);
      }
      geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
      const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, fog: false }));
      mesh.renderOrder = -5;
      this.scene.add(mesh);
    }
  }

  /** 陽光與陰影範圍跟著旅人（往鏡頭看的方向偏一點）；以陰影貼圖的像素為單位移動，陰影不會閃爍 */
  follow(x, z, fx = 0, fz = 0) {
    const cx = this.wide ? 0 : x + fx * 9, cz = this.wide ? -3 : z + fz * 9;
    const sun = this.sun, d = SUN_DIR;
    const right = _r.set(-d.z, 0, d.x).normalize(), up = _u.crossVectors(right, d).normalize();
    const p = _q.set(cx, 0, cz), t = this.shadowTexel;
    const a = Math.round(p.dot(right) / t) * t, b = Math.round(p.dot(up) / t) * t, c = p.dot(d);
    const snapped = _s.set(0, 0, 0).addScaledVector(right, a).addScaledVector(up, b).addScaledVector(d, c);
    sun.target.position.copy(snapped);
    sun.position.copy(snapped).addScaledVector(d, 90);
  }

  /** 首頁的高空繞島鏡頭：陰影範圍涵蓋全島 */
  shadowWide(on) {
    if (this.wide === on) return;
    this.wide = on;
    const h = on ? 46 : SHADOW_HALF, c = this.sun.shadow.camera;
    Object.assign(c, { left: -h, right: h, top: h, bottom: -h });
    c.updateProjectionMatrix();
    this.shadowTexel = (h * 2) / this.sun.shadow.mapSize.x;
  }

  /** 站在哪一座橋上（橋面範圍內、欄杆內側）：回傳 { deck, t } 或 null */
  deckAt(x, z) {
    for (const d of this.decks || []) {
      const dx = x - d.x, dz = z - d.z, ax = Math.sin(d.angle), az = Math.cos(d.angle);
      const along = dx * ax + dz * az, across = -dx * az + dz * ax;
      if (Math.abs(along) <= d.len / 2 && Math.abs(across) < d.hw) return { deck: d, t: along / d.len + 0.5 };
    }
    return null;
  }

  /** 橋的欄杆：橋面兩側（橋頭兩端除外）不能從旁邊跨進跨出 */
  railAt(x, z) {
    for (const d of this.decks || []) {
      const dx = x - d.x, dz = z - d.z, ax = Math.sin(d.angle), az = Math.cos(d.angle);
      const along = dx * ax + dz * az, across = Math.abs(-dx * az + dz * ax);
      if (Math.abs(along) < d.len / 2 - 0.25 && across >= d.hw && across < d.hw + 0.45) return true;
    }
    return false;
  }

  /**
   * 過橋輔助：大致朝著橋走時，像漏斗一樣在抵達橋頭前把橫向的偏移修正掉，
   * 上橋後保持在中線附近；如果已經走過橋頭卻在橋旁邊，先帶回橋頭。
   * 沿著岸邊橫著走（和橋的方向差很多）時不干涉。回傳調整後的 [dx, dz]（單位向量）。
   */
  bridgeAssist(x, z, dx, dz) {
    let best = null;
    for (const d of this.decks || []) {
      const ax = Math.sin(d.angle), az = Math.cos(d.angle), px = -az, pz = ax;
      const rx = x - d.x, rz = z - d.z, half = d.len / 2;
      const along = rx * ax + rz * az, across = rx * px + rz * pz;
      const da = dx * ax + dz * az;
      if (Math.abs(da) < 0.4) continue;              // 沿著岸邊橫著走：不干涉
      const s = Math.sign(da), a = s * along;        // a：沿著前進方向的位置（-half 是入口，+half 是出口）
      const de = -half - a;                          // 離橋頭還有多遠（負的代表已經過了橋頭）
      const on = Math.abs(along) <= half && Math.abs(across) < d.hw;
      let mode = null, rank = 0;
      if (on) { if (a < half) { mode = 'on'; rank = -1; } }
      else if (de > 0 && de < 3.5 && Math.abs(across) < 3.2) { mode = 'in'; rank = de; }
      else if (de <= 0 && de > -1.6 && Math.abs(across) < d.hw + 1.2) { mode = 'back'; rank = 4; }
      if (mode && (!best || rank < best.rank)) best = { d, ax, az, px, pz, along, across, s, de, mode, rank };
    }
    if (!best) return [dx, dz];
    const { d, ax, az, px, pz, across, s, de, mode } = best;
    let fx, fz, k;
    if (mode === 'in') {                             // 還沒上橋：在抵達橋頭前把橫向偏移修正到 0
      const lat = Math.max(-2.5, Math.min(2.5, -across / Math.max(de, 0.35)));
      fx = ax * s + px * lat; fz = az * s + pz * lat; k = de < 2.5 ? 0.92 : 0.6;
    } else if (mode === 'on') {                      // 在橋上：保持在中線附近
      const lat = Math.max(-1, Math.min(1, -across * 1.5));
      fx = ax * s + px * lat; fz = az * s + pz * lat; k = 0.7;
    } else {                                         // 剛走過橋頭卻在橋旁邊：先退回橋頭
      const lat = -Math.sign(across);
      fx = -ax * s * 0.5 + px * lat; fz = -az * s * 0.5 + pz * lat; k = 0.95;
    }
    const fl = Math.hypot(fx, fz) || 1; fx /= fl; fz /= fl;
    const ox = dx * (1 - k) + fx * k, oz = dz * (1 - k) + fz * k, ol = Math.hypot(ox, oz) || 1;
    return [ox / ol, oz / ol];
  }

  /** 地面高度（橋上用橋面高度） */
  groundAt(x, z) {
    const h = heightAt(x, z), on = this.deckAt(x, z);
    if (!on) return h;
    const top = on.deck.top(on.t);
    return on.deck.arch ? Math.max(h, top) : top;
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
    WIND.value = t;
    for (const fn of [...this.animated]) fn(t, dt);
    for (const s of this.sprites) {
      const f = s.userData.flicker ?? 0;
      s.scale.setScalar(s.userData.base * (0.94 + 0.06 * Math.sin(t * 9 + f) + 0.03 * Math.sin(t * 23 + f * 2)));
    }
  }
}

const _p = new THREE.Vector3(), _r = new THREE.Vector3(), _u = new THREE.Vector3(), _q = new THREE.Vector3(), _s = new THREE.Vector3();
