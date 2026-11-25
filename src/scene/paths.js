import * as THREE from 'three';
import { heightAt, streamAt, STAIR, stairRamp } from './terrain.js';
import { GARDEN, GATE, S } from '../data/spots.js';
import { TASKS } from '../data/tasks.js';
import { TEX } from './textures.js';
import { M } from './props.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/**
 * 島上的步道網：環山主步道、善念實踐園的環池小徑、山門參道、登頂步道，
 * 加上通往各地點的支線。旅人只沿著步道走，路線用最短路徑搜尋。
 */
export const RING = { cx: 0, cz: -3 * S, r: 12.6 * S, n: 110 };
const GRING = { cx: GARDEN.x, cz: GARDEN.z, r: GARDEN.ring, n: 36 };

const ringPt = (R, deg) => { const a = (deg * Math.PI) / 180; return new THREE.Vector2(R.cx + R.r * Math.cos(a), R.cz + R.r * Math.sin(a)); };

export class PathGraph {
  constructor(spots) {
    this.nodes = [];
    this.adj = [];
    this.edges = [];
    this.kinds = [];          // 每條邊的種類：main / small / stair
    const ring = (R, kind) => {
      const ids = [];
      for (let i = 0; i < R.n; i++) ids.push(this.#node(ringPt(R, (i * 360) / R.n)));
      for (let i = 0; i < R.n; i++) this.#link(ids[i], ids[(i + 1) % R.n], kind);
      return ids;
    };
    this.ringIds = ring(RING, 'main');
    // 環池小徑：西側（180°）不封閉，留作入口
    const gIds = [];
    for (let i = 0; i < GRING.n; i++) gIds.push(this.#node(ringPt(GRING, (i * 360) / GRING.n)));
    for (let i = 0; i < GRING.n; i++) this.#link(gIds[i], gIds[(i + 1) % GRING.n], 'small');
    const gWest = gIds[GRING.n / 2];
    const link = this.#chain([[GRING.cx - GRING.r - 4, GRING.cz - 0.6]], 'main');
    this.#link(gWest, link[0], 'main');
    this.#link(link[0], this.#nearest(this.ringIds, link[0]), 'main');

    // 山門參道：從渡口一路往北接上環山步道
    const gate = this.#chain([[GATE.dock[0], GATE.dock[1] - 0.6], [0, 27.6 * S], [0, 23.4 * S], [-1.2, 19.6 * S], [0.6, 15.6 * S], [0.8, 11.6 * S]], 'main');
    this.startNode = gate[1];
    this.#link(gate.at(-1), this.#nearest(this.ringIds, gate.at(-1)), 'main');
    // 登頂石階：從環山步道南側筆直上到願行台
    const up = this.#chain([[STAIR.x, STAIR.z0 + 2.2], [STAIR.x, STAIR.z0]], 'small');
    this.stairTop = this.#node(new THREE.Vector2(STAIR.x, STAIR.z1));
    this.#link(up.at(-1), this.stairTop, 'stair');
    // 老街：串起希望亭旁的石燈
    const lamps = TASKS.find((t) => t.id === 'hope')?.quest?.at || [];
    if (lamps.length) {
      const street = this.#chain(lamps.map(([x, z]) => [x - 1.6, z]), 'main');
      this.#link(street[0], this.#nearest(this.ringIds, street[0]), 'main');
      this.#link(street.at(-1), gIds[Math.round(GRING.n * 0.95)], 'main');
    }
    // 三好村的村道
    const village = this.#chain([[-29.5 / 2.2 * S, 28 / 2.2 * S], [-31.2 / 2.2 * S, 20.6 / 2.2 * S], [-35.4 / 2.2 * S, 8 / 2.2 * S], [-36.4 / 2.2 * S, -2.4 / 2.2 * S], [-33.2 / 2.2 * S, -13.5 / 2.2 * S], [-29.6 / 2.2 * S, -19.8 / 2.2 * S]], 'main');
    this.#link(village[0], this.#nearest(this.ringIds, village[0]), 'main');
    this.#link(village.at(-1), this.#nearest(this.ringIds, village.at(-1)), 'main');
    this.#link(up[0], this.#nearest(this.ringIds, up[0]), 'small');

    this.spotNode = new Map();
    const spotIds = new Set();
    for (const s of spots) {
      const v = new THREE.Vector2(s.front[0], s.front[1]);
      const pool = this.nodes.map((_, i) => i).filter((i) => !spotIds.has(i));
      const near = pool.reduce((b, r) => (this.nodes[r].distanceTo(v) < this.nodes[b].distanceTo(v) ? r : b), pool[0]);
      if (this.nodes[near].distanceTo(v) < 0.4) { this.spotNode.set(s.id, near); continue; }
      const id = this.#node(v);
      spotIds.add(id);
      this.spotNode.set(s.id, id);
      this.#link(id, near, 'small');
    }
  }

  /** 步道跨過小溪的地方：回傳 [{ x, z, angle, len, y }]，用來放木橋 */
  bridges() {
    const out = [];
    this.edges.forEach(([ia, ib]) => {
      const a = this.nodes[ia], b = this.nodes[ib], len = a.distanceTo(b), n = Math.ceil(len / 0.25);
      let inside = false, t0 = 0;
      for (let i = 0; i <= n; i++) {
        const p = new THREE.Vector2().lerpVectors(a, b, i / n);
        const w = streamAt(p.x, p.y) > 0.05;
        if (w && !inside) { inside = true; t0 = i / n; }
        if ((!w || i === n) && inside) {
          inside = false;
          const tm = (t0 + i / n) / 2, c = new THREE.Vector2().lerpVectors(a, b, tm);
          if (out.some((o) => Math.hypot(o.x - c.x, o.z - c.y) < 3)) continue;
          const dir = new THREE.Vector2().subVectors(b, a).normalize();
          const span = Math.max(4.4, (i / n - t0) * len + 2.4);
          const e1 = c.clone().addScaledVector(dir, -span / 2), e2 = c.clone().addScaledVector(dir, span / 2);
          out.push({ x: c.x, z: c.y, angle: Math.atan2(dir.x, dir.y), len: span, y: Math.max(0.5, Math.min(heightAt(e1.x, e1.y), heightAt(e2.x, e2.y))) });
        }
      }
    });
    return out;
  }

  #node(v) { this.nodes.push(v); this.adj.push([]); return this.nodes.length - 1; }
  #link(a, b, kind = 'main') {
    const len = this.nodes[a].distanceTo(this.nodes[b]);
    this.adj[a].push([b, len]); this.adj[b].push([a, len]);
    this.edges.push([a, b]); this.kinds.push(kind);
  }
  #chain(pts, kind) {
    const ids = pts.map(([x, z]) => this.#node(new THREE.Vector2(x, z)));
    for (let i = 0; i < ids.length - 1; i++) this.#link(ids[i], ids[i + 1], kind);
    return ids;
  }
  #nearest(pool, id) {
    const p = this.nodes[id];
    return pool.reduce((b, r) => (this.nodes[r].distanceTo(p) < this.nodes[b].distanceTo(p) ? r : b), pool[0]);
  }

  nearestNode(x, z) {
    const p = new THREE.Vector2(x, z);
    let best = 0, bd = Infinity;
    this.nodes.forEach((n, i) => { const d = n.distanceTo(p); if (d < bd) { bd = d; best = i; } });
    return best;
  }

  /** 最短路徑（Dijkstra），回傳節點座標陣列 */
  route(from, to) {
    const N = this.nodes.length;
    const dist = new Array(N).fill(Infinity), prev = new Array(N).fill(-1), done = new Uint8Array(N);
    dist[from] = 0;
    for (;;) {
      let u = -1, ud = Infinity;
      for (let i = 0; i < N; i++) if (!done[i] && dist[i] < ud) { ud = dist[i]; u = i; }
      if (u < 0 || u === to) break;
      done[u] = 1;
      for (const [v, len] of this.adj[u]) if (dist[u] + len < dist[v]) { dist[v] = dist[u] + len; prev[v] = u; }
    }
    const ids = [];
    for (let v = to; v !== -1; v = prev[v]) ids.unshift(v);
    return ids[0] === from ? ids.map((i) => this.nodes[i].clone()) : [];
  }

  /** 每條步道的半寬 */
  halfWidth(ei) { const k = this.kinds[ei]; return k === 'main' ? WIDTH.main : k === 'stair' ? STAIR.hw : WIDTH.small; }

  /**
   * 到最近步道「邊緣」的距離（負值＝在步道上）。用 4 公尺的格子索引，查詢很快。
   * 附近約 8 公尺內沒有步道時回傳 9。
   */
  edgeField() {
    if (this._field) return this._field;
    const C = 4, grid = new Map(), key = (i, j) => i * 1000 + j;
    this.edges.forEach(([ia, ib], ei) => {
      const a = this.nodes[ia], b = this.nodes[ib];
      const i0 = Math.floor((Math.min(a.x, b.x) - 4) / C), i1 = Math.floor((Math.max(a.x, b.x) + 4) / C);
      const j0 = Math.floor((Math.min(a.y, b.y) - 4) / C), j1 = Math.floor((Math.max(a.y, b.y) + 4) / C);
      for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) { const k = key(i, j); if (!grid.has(k)) grid.set(k, []); grid.get(k).push(ei); }
    });
    const nodes = this.nodes, edges = this.edges;
    this._field = (x, z) => {
      const list = grid.get(key(Math.floor(x / C), Math.floor(z / C)));
      if (!list) return 9;
      let best = 9;
      for (const ei of list) {
        const a = nodes[edges[ei][0]], b = nodes[edges[ei][1]];
        const abx = b.x - a.x, abz = b.y - a.y, L2 = abx * abx + abz * abz || 1;
        const t = Math.max(0, Math.min(1, ((x - a.x) * abx + (z - a.y) * abz) / L2));
        const d = Math.hypot(x - a.x - abx * t, z - a.y - abz * t) - this.halfWidth(ei);
        if (d < best) best = d;
      }
      return best;
    };
    return this._field;
  }

  /** 步道：不規則石板路，兩側是泥土路肩、邊緣自然地消失在草地裡；沿地形起伏 */
  buildMesh() {
    const make = (kind, W, color) => {
      const pos = [], uv = [], idx = [];
      this.edges.forEach(([ia, ib], ei) => {
        if (this.kinds[ei] !== kind) return;
        const a = this.nodes[ia], b = this.nodes[ib];
        const len = a.distanceTo(b), n = Math.max(2, Math.ceil(len / 0.35));
        const dir = new THREE.Vector2().subVectors(b, a).normalize();
        const side = new THREE.Vector2(-dir.y, dir.x).multiplyScalar(W);
        const base = pos.length / 3;
        const lift = 0.045 + (ei % 7) * 0.0012;                // 交會處不會互相閃爍
        const v0 = (ei * 0.37) % 1;
        for (let i = 0; i <= n; i++) {
          const p = new THREE.Vector2().lerpVectors(a, b, i / n);
          for (const s of [-1, 1]) {
            const x = p.x + side.x * s, z = p.y + side.y * s;
            pos.push(x, Math.max(heightAt(x, z), streamAt(x, z) > 0 ? 0.3 : -9) + lift, z);
            uv.push(s < 0 ? 0 : 1, v0 + (len * i) / n / (W * 2 * 4));
          }
          if (i < n) { const k = base + i * 2; idx.push(k, k + 2, k + 1, k + 1, k + 2, k + 3); }
        }
      });
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      geo.setIndex(idx);
      geo.computeVertexNormals();
      const mt = new THREE.MeshStandardMaterial({ color, map: TEX.flagstone, roughness: 0.95, side: THREE.DoubleSide, alphaTest: 0.5, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
      mt.alphaToCoverage = true;
      const m = new THREE.Mesh(geo, mt);
      m.receiveShadow = true;
      return m;
    };
    const g = new THREE.Group();
    g.add(make('main', WIDTH.main + 0.25, '#ffffff'));
    g.add(make('small', WIDTH.small + 0.2, '#f1ece0'));
    const st = this.#steps();
    if (st) g.add(st);
    g.add(this.#stairs());
    return g;
  }

  /** 其他步道的陡坡：每 0.5 公尺一階的小石階（不是一道斜坡） */
  #steps() {
    const geos = [];
    this.edges.forEach(([ia, ib], ei) => {
      if (this.kinds[ei] === 'stair') return;
      const a = this.nodes[ia], b = this.nodes[ib], len = a.distanceTo(b);
      if (len < 0.6) return;
      const W = this.halfWidth(ei) * 1.85, n = Math.max(1, Math.round(len / 0.5)), L = len / n;
      const ang = Math.atan2(b.x - a.x, b.y - a.y);
      for (let i = 0; i < n; i++) {
        const p0 = new THREE.Vector2().lerpVectors(a, b, i / n), p1 = new THREE.Vector2().lerpVectors(a, b, (i + 1) / n), m = p0.clone().add(p1).multiplyScalar(0.5);
        if (streamAt(m.x, m.y) > 0 || streamAt(p0.x, p0.y) > 0 || streamAt(p1.x, p1.y) > 0) continue;
        const h0 = heightAt(p0.x, p0.y), h1 = heightAt(p1.x, p1.y);
        if (Math.abs(h1 - h0) / L < 0.22) continue;
        const top = Math.max(h0, h1) + 0.03, bot = Math.min(h0, h1) - 0.12;
        const box = new THREE.BoxGeometry(W, top - bot, L + 0.04);
        box.rotateY(ang); box.translate(m.x, (top + bot) / 2, m.y);
        geos.push(box);
      }
    });
    if (!geos.length) return null;
    const mesh = new THREE.Mesh(mergeGeometries(geos), M.stone());
    mesh.castShadow = true; mesh.receiveShadow = true;
    return mesh;
  }

  /** 登頂的大石階：每階約 16 公分高，兩側有階梯狀的石欄（坐落在 terrain.js 墊出的土堤上） */
  #stairs() {
    const geos = [];
    const { x, z0, z1, hw } = STAIR, len = z0 - z1, rise = STAIR.h1 - STAIR.h0;
    const n = Math.max(4, Math.round(Math.abs(rise) / 0.16)), tread = len / n;
    const add = (w, y0, y1, d, cx, cz) => { const g = new THREE.BoxGeometry(w, y1 - y0, d); g.translate(cx, (y0 + y1) / 2, cz); geos.push(g); };
    for (let k = 0; k < n; k++) {
      const zc = z0 - (k + 0.5) * tread;
      const top = stairRamp((k + 1) / n) + 0.02, bot = stairRamp(k / n) - 0.32;
      add(hw * 2, bot, top, tread + 0.03, x, zc);                                                       // 踏階
      for (const sx of [-1, 1]) add(0.3, bot - 0.1, top + 0.34, tread + 0.03, x + sx * (hw + 0.15), zc);   // 石欄
    }
    add(hw * 2 + 0.6, STAIR.h1 - 0.3, STAIR.h1 + 0.03, 0.7, x, z1 - 0.3);     // 頂端平台石
    add(hw * 2 + 0.6, STAIR.h0 - 0.3, STAIR.h0 + 0.02, 0.8, x, z0 + 0.35);    // 底端平台石
    const mesh = new THREE.Mesh(mergeGeometries(geos), M.stone());
    mesh.castShadow = true; mesh.receiveShadow = true;
    return mesh;
  }
}

export const WIDTH = { main: 1.15, small: 0.75 };
