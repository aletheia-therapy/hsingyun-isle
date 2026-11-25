import * as THREE from 'three';
import { heightAt, streamAt } from './terrain.js';
import { GARDEN, GATE, S } from '../data/spots.js';
import { TASKS } from '../data/tasks.js';

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
    this.kinds = [];          // 每條邊的寬度種類：main / small
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
    // 登頂步道：從環山步道西南側盤旋而上
    const up = this.#chain([[-8.4 * S, 6.6 * S], [-6.4 * S, 4.6 * S], [-4.4 * S, 3.6 * S], [-2.2 * S, 2.0 * S], [0, 0.4 * S]], 'small');
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

  /** 步道：淺色石板路（主步道較寬），沿地形起伏 */
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
        for (let i = 0; i <= n; i++) {
          const p = new THREE.Vector2().lerpVectors(a, b, i / n);
          for (const s of [-1, 1]) {
            const x = p.x + side.x * s, z = p.y + side.y * s;
            pos.push(x, Math.max(heightAt(x, z), streamAt(x, z) > 0 ? 0.3 : -9) + 0.05, z);
            uv.push(s < 0 ? 0 : 1, (len * i) / n / (W * 2));
          }
          if (i < n) { const k = base + i * 2; idx.push(k, k + 2, k + 1, k + 1, k + 2, k + 3); }
        }
      });
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      geo.setIndex(idx);
      geo.computeVertexNormals();
      const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color, map: flagstone(), roughness: 0.95, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
      m.receiveShadow = true;
      return m;
    };
    const g = new THREE.Group();
    g.add(make('main', 1.15, '#d9cfb6'));
    g.add(make('small', 0.75, '#cfc4a8'));
    return g;
  }
}

let stoneTex = null;
function flagstone() {
  if (stoneTex) return stoneTex;
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const x = c.getContext('2d');
  x.fillStyle = '#e8e4da'; x.fillRect(0, 0, 128, 128);
  x.strokeStyle = 'rgba(90,84,70,0.55)'; x.lineWidth = 2;
  const rows = [0, 34, 70, 100, 128];
  for (let r = 0; r < rows.length - 1; r++) {
    x.beginPath(); x.moveTo(0, rows[r]); x.lineTo(128, rows[r]); x.stroke();
    const off = r % 2 ? 40 : 75;
    x.beginPath(); x.moveTo(off, rows[r]); x.lineTo(off + 4, rows[r + 1]); x.stroke();
  }
  for (let i = 0; i < 300; i++) { const v = 200 + Math.random() * 50; x.fillStyle = `rgba(${v},${v},${v - 10},0.35)`; x.fillRect(Math.random() * 128, Math.random() * 128, 2, 2); }
  stoneTex = new THREE.CanvasTexture(c);
  stoneTex.wrapS = stoneTex.wrapT = THREE.RepeatWrapping; stoneTex.colorSpace = THREE.SRGBColorSpace;
  return stoneTex;
}
