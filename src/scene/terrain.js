import * as THREE from 'three';
import { SPOTS, GARDEN, S, GATE } from '../data/spots.js';

/**
 * 三好四給島地形。heightAt(x, z) 是全島唯一的地面高度來源：地形網格、步道、建築與旅人都用它。
 * 座標：1 單位 = 1 公尺；-z 為北；山頂願行台在 (0, -4)。
 * 島形沿用前作已驗證的海岸線參數（水面著色器使用同一組參數）。
 */
export const R0 = 32 * S;
export const PEAK = new THREE.Vector3(0, 0, -4 * S);

export function islandR(a) {
  return R0 * (1 + 0.06 * Math.sin(2 * a + 0.7) + 0.04 * Math.sin(3 * a + 2.1) + 0.025 * Math.sin(5 * a + 4.0));
}
export function islandD(x, z) { return Math.hypot(x, z) / islandR(Math.atan2(z, x)); }

const ss = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const G = (x, z, cx, cz, s) => Math.exp(-((x - cx) ** 2 + (z - cz) ** 2) / (s * s));

/** 中央主峰（願行台）＋北側緩丘（智慧之境）＋西側生命之路的小坡 */
export function hillAt(x, z) {
  x /= S; z /= S;
  return 4.6 * G(x, z, 0, -4, 5.6)
    + 2.0 * G(x, z, -2.5, -21, 6.5)
    + 1.2 * G(x, z, 9.5, -18, 5)
    + 1.0 * G(x, z, -17, -2, 6)
    + 4.2 * G(x, z, -14, -21, 4.4)      // 西北的峰巒（七層塔）
    + 3.2 * G(x, z, 19, -16, 4.2)       // 東北的峰巒
    + 2.2 * G(x, z, -24, 16, 3.8)       // 西南的小山
    + 2.0 * G(x, z, 24, 18, 3.6);       // 東南的小山
}

/** 林間小溪：從西北山腳蜿蜒流向南方的海 */
/** 小溪走在主峰的西側（不切過登頂石階） */
export const streamX = (z) => -7.5 * S + 2.0 * S * Math.sin(z / (6 * S) + 0.6) + 1.2 * S * Math.sin(z / (2.6 * S));
export function streamAt(x, z) {
  if (z < -16 * S || z > 31 * S) return 0;
  const d = Math.abs(x - streamX(z));
  const fadeIn = ss(-16 * S, -11 * S, z);
  return fadeIn * Math.max(0, 1 - d / 1.9);
}

/** 兩座池：善念實踐園中央的蓮池、人間佛教殿西側的放生池（水面 y = 0） */
export const PONDS = [
  { x: GARDEN.x, z: GARDEN.z, s: GARDEN.pond, depth: 1.8 },
  { x: -11.5 * S, z: -14.5 * S, s: 3.0, depth: 1.8 },
];
export function pondAt(x, z) {
  let p = 0;
  for (const q of PONDS) p = Math.max(p, G(x, z, q.x, q.z, q.s));
  return p;
}

function rawHeight(x, z) {
  const d = islandD(x, z);
  const base = 0.85 - 1.5 * ss(0.88, 1.1, d);
  const undul = (0.35 * Math.sin(x * 0.12 + 1.1) * Math.cos(z * 0.1 - 0.6) + 0.12 * Math.sin(x * 0.33 + z * 0.21)) * (1 - ss(0.7, 0.9, d));
  const h = hillAt(x, z);
  const detail = 0.1 * Math.sin(x * 1.5 + z * 0.6) * Math.cos(z * 1.7 - x * 0.4) * ss(0.4, 2.0, h);
  return base + undul + h + detail;
}

/** 建築用的平台：在每個地點周圍把地形整平，讓房子穩穩坐在地上 */
const PADS = [
  ...SPOTS.filter((s) => s.zone !== 'practice').map((s) => ({ x: s.at[0], z: s.at[1], r: (s.r || 3) * 0.95 })),
  ...SPOTS.filter((s) => s.zone === 'practice').map((s) => ({ x: s.at[0], z: s.at[1], r: 2.1 })),
  { x: GATE.at[0], z: GATE.at[1], r: 3.4 },
  { x: -14 * S, z: -21 * S, r: 2.8 },
];
for (const p of PADS) p.h = rawHeight(p.x, p.z);

function baseHeight(x, z) {
  let h = rawHeight(x, z);
  for (const p of PADS) {
    const w = ss(p.r + 2.2, p.r, Math.hypot(x - p.x, z - p.z));
    if (w > 0) h += (p.h - h) * w;
  }
  let pond = 0;
  for (const q of PONDS) pond = Math.max(pond, q.depth * ss(0.35, 0.95, G(x, z, q.x, q.z, q.s)));
  const st = streamAt(x, z);
  if (st > 0) pond = Math.max(pond, (h + 0.35) * ss(0, 0.75, st));
  return h - pond;
}

/**
 * 登頂石階：從環山步道南側筆直上到願行台。石階底下的地形墊成一道平順的土堤（兩側是長草的斜坡），
 * 旅人沿著坡面走，石階本身由 paths.js 畫出。
 */
export const STAIR = { x: 0, z0: 7.6 * S, z1: -0.5 * S, hw: 1.15 };
STAIR.h0 = baseHeight(STAIR.x, STAIR.z0);
STAIR.h1 = baseHeight(STAIR.x, STAIR.z1);
/** 石階中心線在 t（0 = 底、1 = 頂）處的坡面高度 */
export const stairRamp = (t) => STAIR.h0 + (STAIR.h1 - STAIR.h0) * Math.min(1, Math.max(0, t));

export function heightAt(x, z) {
  const h = baseHeight(x, z);
  const { x: sx, z0, z1, hw } = STAIR;
  if (z > z0 + 0.5 || z < z1 - 0.3) return h;
  const t = (z0 - z) / (z0 - z1);
  const d = Math.max(0, Math.abs(x - sx) - hw - 0.4);
  const berm = stairRamp(t) - d * 0.85;
  return Math.max(h, berm);
}

function noise2(x, z) {
  return 0.5 + 0.25 * Math.sin(x * 0.9 + z * 0.4) * Math.cos(z * 0.8 - x * 0.3) + 0.25 * Math.sin(x * 2.3 - z * 1.7 + 1.2);
}

const TSIZE = 64 * S * 1.45, TSEG = 220;

/** edge(x, z)：到步道邊緣的距離（paths.js 的 edgeField），用來畫出路旁被踩過的草地 */
export function createTerrain(edge = () => 9) {
  const size = TSIZE, seg = TSEG;
  const geo = new THREE.PlaneGeometry(size, size, seg, seg);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) pos.setY(i, heightAt(pos.getX(i), pos.getZ(i)));
  geo.computeVertexNormals();

  const C = (h) => new THREE.Color(h);
  // 自然的草地：中綠、偏黃的綠、濕潤的深綠、偏乾的橄欖色；路旁被踩過的土色
  const grassA = C('#5b7a39'), grassB = C('#788f45'), lush = C('#46652f'), dry = C('#8d8f55');
  const worn = C('#867c5a'), floor = C('#4b5233');
  const rock = C('#84817a'), rockDk = C('#64635d'), sand = C('#cbbd99'), wetSand = C('#968969'), bank = C('#66694a');
  const col = new Float32Array(pos.count * 3);
  const c = new THREE.Color(), t = new THREE.Color();
  const nrm = geo.attributes.normal;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const d = islandD(x, z), hill = hillAt(x, z);
    const n1 = noise2(x * 0.35, z * 0.35), n2 = noise2(x * 1.3 + 7, z * 1.3 - 3), n3 = noise2(x * 0.12 - 5, z * 0.12 + 2);
    c.copy(grassA).lerp(grassB, n1);
    c.lerp(lush, ss(0.5, 0.8, n3) * 0.6);
    c.lerp(dry, ss(0.55, 0.85, n2) * 0.35 + ss(1.2, 3.5, hill) * 0.2);
    c.lerp(floor, ss(0.84, 0.92, d) * 0.25);
    // 路旁：被踩過的草地與泥土
    const e = edge(x, z);
    if (e < 0.9) c.lerp(worn, ss(0.9, -0.1, e) * 0.55);
    // 山巒：坡陡處露出山石
    const steep = 1 - nrm.getY(i);
    const rk = Math.max(ss(0.2, 0.45, steep), ss(1.8, 3.4, hill) * ss(0.1, 0.28, steep));
    if (rk > 0) { t.copy(rock).lerp(rockDk, noise2(x * 1.7, z * 1.7)); c.lerp(t, rk * 0.8); }
    // 岸邊沙灘
    const sd = ss(0.88, 0.95, d);
    if (sd > 0) { t.copy(sand).lerp(wetSand, ss(0.25, -0.2, y)); c.lerp(t, sd); }
    const pd = Math.max(ss(0.15, 0.7, pondAt(x, z)), ss(0, 0.6, streamAt(x, z)));
    if (pd > 0) c.lerp(y < 0.1 ? wetSand : bank, pd * 0.9);
    c.multiplyScalar((1 - Math.min(0.2, steep * 0.4)) * (0.94 + n2 * 0.08));
    col.set([c.r, c.g, c.b], i * 3);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const mesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true, map: groundTexture() }));
  mesh.receiveShadow = true;
  mesh.name = 'terrain';
  return mesh;
}

/** 樹下的地面：顏色變深、偏向林地的落葉土（list = [[x, z, r], ...]） */
export function shadeGround(mesh, list) {
  const col = mesh.geometry.attributes.color, step = TSIZE / TSEG, half = TSIZE / 2;
  const floor = new THREE.Color('#4a4a30'), c = new THREE.Color();
  for (const [x, z, r] of list) {
    const c0 = Math.max(0, Math.floor((x - r + half) / step)), c1 = Math.min(TSEG, Math.ceil((x + r + half) / step));
    const r0 = Math.max(0, Math.floor((z - r + half) / step)), r1 = Math.min(TSEG, Math.ceil((z + r + half) / step));
    for (let row = r0; row <= r1; row++) for (let cc = c0; cc <= c1; cc++) {
      const vx = -half + cc * step, vz = -half + row * step, d = Math.hypot(vx - x, vz - z) / r;
      if (d >= 1) continue;
      const k = ss(1, 0.25, d), i = row * (TSEG + 1) + cc;
      c.fromBufferAttribute(col, i).lerp(floor, k * 0.35).multiplyScalar(1 - k * 0.28);
      col.setXYZ(i, c.r, c.g, c.b);
    }
  }
  col.needsUpdate = true;
}

/** 地面細節貼圖：細草與小石粒，與頂點色相乘 */
function groundTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 512;
  const x = c.getContext('2d');
  x.fillStyle = '#cfcfcf'; x.fillRect(0, 0, 512, 512);
  let k = 11;
  const r = () => { k = (k * 16807) % 2147483647; return k / 2147483647; };
  for (let i = 0; i < 8000; i++) {
    const v = 160 + Math.floor(r() * 95);
    x.strokeStyle = `rgba(${v},${v},${v},${0.16 + r() * 0.28})`;
    x.lineWidth = 0.7 + r();
    const px = r() * 512, py = r() * 512, a = -1.57 + (r() - 0.5) * 1.1, l = 4 + r() * 8;
    x.beginPath(); x.moveTo(px, py); x.lineTo(px + Math.cos(a) * l, py + Math.sin(a) * l); x.stroke();
  }
  for (let i = 0; i < 600; i++) {
    const v = 120 + Math.floor(r() * 70);
    x.fillStyle = `rgba(${v},${v},${v - 8},0.3)`;
    x.beginPath(); x.ellipse(r() * 512, r() * 512, 1.5 + r() * 3, 1 + r() * 2, r() * 3, 0, 7); x.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(52, 52); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}
