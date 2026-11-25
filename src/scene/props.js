import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { TEX, triplanar, rand as xrand } from './textures.js';

/**
 * 星雲之島的建築與植物。每個建造函式在原點、地面高度 0 建模，正面朝 +z。
 * 東方寺院風格：石砌台基、朱紅木柱、米白牆面、起翹的曲面屋頂；松、竹、梅與山石。
 * 不描繪佛像、不使用任何寺院的實際標誌或特定建築的複製。
 */
const cache = new Map();
export function mat(color, o = {}) {
  const key = color + JSON.stringify(o);
  if (!cache.has(key)) {
    const m = new THREE.MeshStandardMaterial({
      color, roughness: o.r ?? 0.85, metalness: o.m ?? 0,
      emissive: o.e ?? '#000000', emissiveIntensity: o.ei ?? 1,
      flatShading: !!o.flat, side: o.side ?? THREE.FrontSide, map: o.map ?? null,
      transparent: o.op !== undefined, opacity: o.op ?? 1, depthWrite: o.op === undefined,
    });
    cache.set(key, m);
  }
  return cache.get(key);
}

/* ---------- 貼圖 ---------- */
function canvasTex(w, h, draw, repeat = [1, 1]) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(...repeat); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}
const tileTex = canvasTex(64, 64, (x, w, h) => {
  x.fillStyle = '#ffffff'; x.fillRect(0, 0, w, h);
  for (let i = 0; i < 8; i++) {           // 筒瓦：縱向的瓦壟
    const g = x.createLinearGradient(i * 8, 0, i * 8 + 8, 0);
    g.addColorStop(0, '#9a9a9a'); g.addColorStop(0.45, '#ffffff'); g.addColorStop(1, '#8a8a8a');
    x.fillStyle = g; x.fillRect(i * 8, 0, 8, h);
  }
  x.fillStyle = 'rgba(0,0,0,0.18)';
  for (let j = 0; j < 4; j++) x.fillRect(0, j * 16, w, 1.5);
}, [16, 6]);
const latticeTex = canvasTex(64, 64, (x, w, h) => {
  x.fillStyle = '#f3e7c9'; x.fillRect(0, 0, w, h);
  x.strokeStyle = '#6e3524'; x.lineWidth = 3;
  for (let i = 0; i <= 4; i++) { x.beginPath(); x.moveTo(i * 16, 0); x.lineTo(i * 16, h); x.stroke(); x.beginPath(); x.moveTo(0, i * 16); x.lineTo(w, i * 16); x.stroke(); }
  x.lineWidth = 1.5;
  for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) { x.beginPath(); x.moveTo(i * 16 + 8, j * 16); x.lineTo(i * 16 + 8, j * 16 + 16); x.moveTo(i * 16, j * 16 + 8); x.lineTo(i * 16 + 16, j * 16 + 8); x.stroke(); }
}, [1, 1]);

// 石材、灰泥、木頭用世界座標的三平面投影貼圖：大小不同的構件紋理尺度一致
const tri = (color, tex, scale, key, rough = 0.95) => triplanar(new THREE.MeshStandardMaterial({ color, map: tex, roughness: rough }), scale, key);
const MATS = {
  stone: tri('#dcd5c4', TEX.ashlar, 0.62, 'tri-a'),
  stoneDk: tri('#aaa392', TEX.ashlar, 0.62, 'tri-a'),
  wall: tri('#f3ecdd', TEX.plaster, 0.45, 'tri-p'),
  wood: tri('#8c6c4e', TEX.wood, 1.1, 'tri-w', 0.9),
  woodDk: tri('#5b4535', TEX.wood, 1.1, 'tri-w', 0.9),
  pillar: tri('#9c4a35', TEX.wood, 0.9, 'tri-w', 0.75),
};
export const M = {
  stone: () => MATS.stone,
  stoneDk: () => MATS.stoneDk,
  wall: () => MATS.wall,
  pillar: () => MATS.pillar,
  beam: () => mat('#56665e', { r: 0.8 }),
  wood: () => MATS.wood,
  woodDk: () => MATS.woodDk,
  door: () => mat('#ffffff', { r: 0.85, map: latticeTex }),
  roofGold: () => mat('#a88a4c', { r: 0.62, m: 0.1, map: tileTex, side: THREE.DoubleSide }),
  roofJade: () => mat('#56786c', { r: 0.68, map: tileTex, side: THREE.DoubleSide }),
  roofSlate: () => mat('#56605e', { r: 0.72, map: tileTex, side: THREE.DoubleSide }),
  ridge: () => mat('#454a47', { r: 0.7 }),
  gold: () => mat('#b8964c', { r: 0.4, m: 0.55 }),
  bronze: () => mat('#6f5f3c', { r: 0.45, m: 0.65 }),
  lamp: () => mat('#eadcc0', { r: 0.9 }),
  lampLit: () => mat('#fff0c8', { e: '#ffb050', ei: 1.6 }),
  paper: () => mat('#f2e2c2', { e: '#ffb862', ei: 0.12 }),
  dark: () => mat('#2b2620', { r: 1 }),
  water: () => mat('#4e6a5e', { r: 0.15, op: 0.8 }),
};

function add(g, geo, material, x = 0, y = 0, z = 0, ry = 0) {
  const m = new THREE.Mesh(geo, material);
  m.position.set(x, y, z);
  m.rotation.y = ry;
  m.castShadow = true;
  m.receiveShadow = true;
  g.add(m);
  return m;
}
export const box = (g, w, h, d, material, x = 0, y = 0, z = 0, ry = 0) => add(g, new THREE.BoxGeometry(w, h, d), material, x, y + h / 2, z, ry);
export const rbox = (g, w, h, d, material, x = 0, y = 0, z = 0, r = 0.06, ry = 0) =>
  add(g, new RoundedBoxGeometry(w, h, d, 2, Math.min(r, w / 2, h / 2, d / 2)), material, x, y + h / 2, z, ry);
export const cyl = (g, rt, rb, h, material, x = 0, y = 0, z = 0, seg = 12) => add(g, new THREE.CylinderGeometry(rt, rb, h, seg), material, x, y + h / 2, z);
export const sphere = (g, r, material, x = 0, y = 0, z = 0, detail = 1) => add(g, new THREE.IcosahedronGeometry(r, detail), material, x, y, z);

/* ---------- 發光 ---------- */
const glowTex = canvasTex(64, 64, (x) => {
  const g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,226,170,1)'); g.addColorStop(0.3, 'rgba(255,190,110,0.45)'); g.addColorStop(1, 'rgba(255,160,70,0)');
  x.fillStyle = g; x.fillRect(0, 0, 64, 64);
});
export const glowMaterial = new THREE.SpriteMaterial({ map: glowTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, opacity: 0.4 });
export function glow(g, x, y, z, s = 1.1, material = glowMaterial) {
  const sp = new THREE.Sprite(material);
  sp.position.set(x, y, z); sp.scale.setScalar(s);
  sp.userData.flicker = Math.random() * 10;
  g.add(sp);
  return sp;
}

/* ---------- 曲面屋頂 ---------- */
/**
 * 起翹的廡殿／攢尖屋頂。w×d 為簷口範圍，h 為高度，ridge 為正脊長（0 = 攢尖）。
 * 屋面呈下凹曲線（近簷平緩、近脊陡），四角向上起翹。
 */
export function roofGeo(w, d, h, ridge = 0, lift = 0.35, segS = 14, segT = 8) {
  const hw = w / 2, hd = d / 2, hr = Math.min(ridge / 2, hw - 0.01);
  const pos = [], uv = [], idx = [];
  const face = (eave, top, flip, uLen) => {
    const base = pos.length / 3;
    for (let j = 0; j <= segT; j++) {
      const t = j / segT;
      for (let i = 0; i <= segS; i++) {
        const s = (i / segS) * 2 - 1;
        const e = eave(s), tp = top(s);
        const corner = Math.pow(Math.abs(s), 5);
        const x = e.x + (tp.x - e.x) * t, z = e.z + (tp.z - e.z) * t;
        const y = h * Math.pow(t, 1.65) + lift * corner * Math.pow(1 - t, 2.2);
        // 角部微微外伸
        const out = lift * 0.6 * corner * Math.pow(1 - t, 2);
        pos.push(x + e.ox * out, y, z + e.oz * out);
        uv.push(((s + 1) / 2) * uLen, t * Math.hypot(hd, h) );
      }
    }
    for (let j = 0; j < segT; j++) for (let i = 0; i < segS; i++) {
      const a = base + j * (segS + 1) + i, b = a + 1, c = a + segS + 1, dd = c + 1;
      if (flip) idx.push(a, c, b, b, c, dd); else idx.push(a, b, c, b, dd, c);
    }
  };
  const v = (x, z, ox = 0, oz = 0) => ({ x, z, ox, oz });
  // 前、後（梯形，接正脊）
  face((s) => v(s * hw, hd, Math.sign(s), 1), (s) => v(s * hr, 0), false, w);
  face((s) => v(s * hw, -hd, Math.sign(s), -1), (s) => v(s * hr, 0), true, w);
  // 左、右（三角，接脊端）
  face((s) => v(hw, s * hd, 1, Math.sign(s)), () => v(hr, 0), true, d);
  face((s) => v(-hw, s * hd, -1, Math.sign(s)), () => v(-hr, 0), false, d);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return geo;
}
export function roof(g, w, d, h, { ridge = 0, lift = 0.35, material = M.roofJade(), y = 0, x = 0, z = 0, ry = 0, finial = false } = {}) {
  const m = add(g, roofGeo(w, d, h, ridge, lift), material, x, y, z, ry);
  // 簷下的深色封簷板（加厚感）
  const under = add(g, roofGeo(w * 0.985, d * 0.985, h * 0.98, ridge * 0.98, lift), M.beam(), x, y - 0.09, z, ry);
  under.castShadow = false;
  if (ridge > 0.2) {
    const rg = new THREE.Group(); rg.position.set(x, y, z); rg.rotation.y = ry; g.add(rg);
    box(rg, ridge + 0.1, 0.16, 0.16, M.ridge(), 0, h - 0.04, 0);
    for (const sx of [-1, 1]) {               // 正脊兩端的翹起裝飾
      const e = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.42, 6), M.ridge());
      e.position.set(sx * (ridge / 2 + 0.02), h + 0.2, 0); e.rotation.z = -sx * 0.5; e.castShadow = true; rg.add(e);
    }
  }
  if (finial) {
    cyl(g, 0.05, 0.12, 0.25, M.gold(), x, y + h - 0.05, z, 8);
    sphere(g, 0.13, M.gold(), x, y + h + 0.3, z, 1);
  }
  return m;
}

/* ---------- 基本構件 ---------- */
/** 石砌台基＋前方台階 */
function podium(g, w, d, h, { steps = true, stepW = 1.6 } = {}) {
  rbox(g, w, h, d, M.stone(), 0, 0, 0, 0.05);
  rbox(g, w + 0.16, 0.08, d + 0.16, M.stoneDk(), 0, h - 0.04, 0, 0.03);
  if (steps) {
    const n = Math.max(2, Math.round(h / 0.16));
    for (let i = 0; i < n; i++) box(g, stepW, h * (i + 1) / n, 0.28, M.stone(), 0, 0, d / 2 + 0.28 * (n - i) - 0.14);
  }
}
function columns(g, pts, h, y, r = 0.11) {
  for (const [x, z] of pts) {
    cyl(g, r * 1.4, r * 1.5, 0.12, M.stoneDk(), x, y, z, 10);    // 柱礎
    cyl(g, r, r, h, M.pillar(), x, y + 0.1, z, 12);
  }
}
/** 柱頂的額枋（一圈綠色橫樑） */
function beams(g, w, d, y, t = 0.16) {
  box(g, w + 0.2, t, 0.14, M.beam(), 0, y, d / 2);
  box(g, w + 0.2, t, 0.14, M.beam(), 0, y, -d / 2);
  box(g, 0.14, t, d + 0.2, M.beam(), w / 2, y, 0);
  box(g, 0.14, t, d + 0.2, M.beam(), -w / 2, y, 0);
}
/** 掛在簷下的匾額，顏色代表該處主題 */
function plaque(g, color, x, y, z, w = 0.9) {
  rbox(g, w + 0.1, 0.42, 0.06, M.gold(), x, y - 0.02, z, 0.02);
  rbox(g, w, 0.34, 0.07, mat(color, { r: 0.6 }), x, y, z + 0.01, 0.02);
}
export function lantern(g, x, y, z, s = 1, light = true) {
  // 石燈籠：台座、柱、燈室、寶蓋
  cyl(g, 0.16 * s, 0.2 * s, 0.1 * s, M.stoneDk(), x, y, z, 6);
  cyl(g, 0.07 * s, 0.09 * s, 0.55 * s, M.stone(), x, y + 0.1 * s, z, 6);
  cyl(g, 0.17 * s, 0.13 * s, 0.07 * s, M.stone(), x, y + 0.65 * s, z, 6);
  box(g, 0.2 * s, 0.22 * s, 0.2 * s, light ? M.lamp() : M.stone(), x, y + 0.72 * s, z);
  add(g, new THREE.ConeGeometry(0.24 * s, 0.18 * s, 6), M.stoneDk(), x, y + 1.03 * s, z);
  sphere(g, 0.04 * s, M.stone(), x, y + 1.14 * s, z, 0);
}
function paperLamp(g, x, y, z, s = 1) {
  cyl(g, 0.006, 0.006, 0.25 * s, M.dark(), x, y + 0.28 * s, z, 4);
  add(g, new THREE.SphereGeometry(0.15 * s, 12, 8).scale(1, 1.25, 1), M.paper(), x, y + 0.1 * s, z);
  cyl(g, 0.09 * s, 0.09 * s, 0.03 * s, mat('#a63a2c'), x, y - 0.1 * s, z, 10);
}
function bench(g, x, z, ry = 0, w = 1.2) {
  const b = new THREE.Group(); b.position.set(x, 0, z); b.rotation.y = ry; g.add(b);
  box(b, w, 0.07, 0.34, M.wood(), 0, 0.38, 0);
  for (const sx of [-1, 1]) box(b, 0.08, 0.38, 0.3, M.woodDk(), sx * (w / 2 - 0.12), 0, 0);
}

/* ---------- 建築 ---------- */
export const BUILD = {
  /** 人間佛教殿：重簷殿宇，殿前四盞燈對應「四句教」 */
  hall(g) {
    podium(g, 9.4, 6.6, 0.75, { stepW: 2.6 });
    const y = 0.75;
    // 殿身
    box(g, 7, 2.4, 4.2, M.wall(), 0, y, -0.3);
    for (const x of [-2.4, 0, 2.4]) box(g, 1.5, 1.9, 0.06, M.door(), x, y + 0.05, 1.82);
    columns(g, [-3.45, -2.1, -0.7, 0.7, 2.1, 3.45].map((x) => [x, 2.25]), 2.45, y);
    beams(g, 7.2, 4.6, y + 2.45, 0.22);
    box(g, 7.6, 0.22, 5, M.beam(), 0, y + 2.6, -0.05);
    roof(g, 9.2, 6.6, 1.15, { ridge: 7.6, lift: 0.45, material: M.roofGold(), y: y + 2.62, z: -0.05 });
    // 上層
    box(g, 5.2, 0.95, 2.9, M.wall(), 0, y + 3.5, -0.05);
    box(g, 5.4, 0.18, 3.1, M.beam(), 0, y + 4.42, -0.05);
    roof(g, 7.4, 5.0, 1.7, { ridge: 4.6, lift: 0.55, material: M.roofGold(), y: y + 4.52, z: -0.05 });
    plaque(g, '#3f5f57', 0, y + 3.95, 1.43, 1.4);
    // 殿前四盞燈（四句教互動會點亮）
    [-3.3, -1.1, 1.1, 3.3].forEach((x) => lantern(g, x, 0, 4.4, 1.25, false));
    // 香爐
    cyl(g, 0.4, 0.32, 0.5, M.bronze(), 0, 0, 5.0, 14);
    cyl(g, 0.48, 0.48, 0.06, M.bronze(), 0, 0.5, 5.0, 14);
  },

  /** 生命長廊：一條有屋頂的迴廊，廊柱之間掛著生命節點的看板 */
  corridor(g) {
    const L = 9;
    rbox(g, L + 0.6, 0.3, 2.6, M.stone(), 0, 0, 0, 0.04);
    const xs = []; for (let i = 0; i <= 6; i++) xs.push(-L / 2 + (L / 6) * i);
    columns(g, xs.flatMap((x) => [[x, 0.95], [x, -0.95]]), 2.0, 0.3, 0.09);
    beams(g, L, 1.9, 2.3, 0.16);
    roof(g, L + 1.2, 3.1, 0.95, { ridge: L, lift: 0.3, material: M.roofSlate(), y: 2.45 });
    // 背牆上的六幅看板（時間軸）
    xs.slice(0, 6).forEach((x, i) => {
      const cx = x + L / 12;
      box(g, 1.2, 1.15, 0.05, M.wall(), cx, 0.95, -1.0);
      box(g, 1.3, 0.06, 0.08, M.woodDk(), cx, 2.08, -1.0);
      box(g, 0.9, 0.08, 0.06, mat(['#b8863b', '#9a6b3a', '#4f8a83', '#5a6fa6', '#c4724f', '#b0565a'][i]), cx, 1.85, -0.97);
    });
    box(g, L, 0.5, 0.08, M.wall(), 0, 0.3, -1.02);
    bench(g, -1.5, 0.45, 0, 1.4); bench(g, 2.4, 0.45, 0, 1.4);
    for (const x of [-L / 2, L / 2]) paperLamp(g, x, 1.85, 1.05, 1);
  },

  /** 三好村的民宅：白牆黛瓦、木門木窗、門前小院與竹籬 */
  house(g, opt) {
    rbox(g, 4.6, 0.22, 3.6, M.stoneDk(), 0, 0, -0.2, 0.04);
    box(g, 3.8, 1.9, 2.6, M.wall(), 0, 0.22, -0.4);
    box(g, 3.9, 0.16, 2.7, M.wood(), 0, 2.1, -0.4);
    box(g, 0.8, 1.35, 0.05, mat('#7a4a30', { r: 0.8 }), 0, 0.22, 0.91);
    for (const x of [-1.2, 1.2]) { box(g, 0.7, 0.6, 0.05, M.door(), x, 1.0, 0.91); box(g, 0.82, 0.08, 0.1, M.woodDk(), x, 0.94, 0.93); }
    // 人字形屋頂（用正脊較長的曲面屋頂）
    roof(g, 4.8, 3.6, 1.25, { ridge: 3.8, lift: 0.18, material: M.roofSlate(), y: 2.24, z: -0.4 });
    plaque(g, opt?.color || '#c4724f', 0, 1.82, 0.95, 0.7);
    // 門前小院：竹籬
    for (let i = -5; i <= 5; i++) {
      if (Math.abs(i) <= 1) continue;
      cyl(g, 0.035, 0.035, 0.7, M.wood(), i * 0.4, 0, 1.75, 5);
    }
    box(g, 1.65, 0.05, 0.05, M.wood(), -1.42, 0.55, 1.75); box(g, 1.65, 0.05, 0.05, M.wood(), 1.42, 0.55, 1.75);
    box(g, 0.05, 0.05, 1.9, M.wood(), -2.2, 0.55, 0.8); box(g, 0.05, 0.05, 1.9, M.wood(), 2.2, 0.55, 0.8);
    // 院子裡的水缸與板凳
    cyl(g, 0.3, 0.24, 0.5, mat('#6b5a48', { r: 0.8 }), 1.6, 0.22, 1.2, 12);
    cyl(g, 0.27, 0.27, 0.03, M.water(), 1.6, 0.7, 1.2, 12);
    bench(g, -1.5, 1.2, 0, 0.9);
    paperLamp(g, 1.95, 1.75, 1.0, 0.8);
  },

  /** 時光碑林：一圈石碑與一座小碑亭 */
  stele(g) {
    rbox(g, 5.2, 0.15, 3.6, M.stoneDk(), 0, 0, 0, 0.04);
    const pts = [[-2, -0.8, 0.35], [-1, -1.25, 0.15], [0, -1.4, 0], [1, -1.25, -0.15], [2, -0.8, -0.35]];
    pts.forEach(([x, z, ry], i) => {
      const s = new THREE.Group(); s.position.set(x, 0.15, z); s.rotation.y = ry; g.add(s);
      box(s, 0.62, 0.18, 0.34, M.stoneDk(), 0, 0, 0);
      rbox(s, 0.46, 1.25 + (i % 2) * 0.2, 0.14, mat('#9b978a', { r: 0.95 }), 0, 0.18, 0, 0.03);
      add(s, new THREE.BoxGeometry(0.56, 0.12, 0.2), M.stoneDk(), 0, 1.5 + (i % 2) * 0.2, 0);
    });
    // 小碑亭
    const p = new THREE.Group(); p.position.set(0, 0.15, 0.9); g.add(p);
    columns(p, [[-0.75, -0.55], [0.75, -0.55], [-0.75, 0.55], [0.75, 0.55]], 1.55, 0, 0.07);
    beams(p, 1.5, 1.1, 1.62, 0.12);
    roof(p, 2.3, 1.9, 0.8, { ridge: 0.8, lift: 0.3, material: M.roofSlate(), y: 1.72 });
    box(p, 0.8, 0.5, 0.5, M.stone(), 0, 0, 0);
  },

  /** 四宗旨苑：四座小殿圍著中庭，各掛一色匾額（文化、教育、慈善、共修） */
  courtyard(g) {
    rbox(g, 7.8, 0.2, 7.8, M.stone(), 0, 0, 0, 0.04);
    const colors = ['#b8863b', '#4f8a83', '#c4724f', '#5a6fa6'];
    [[0, -2.3, 0], [2.3, 0, -Math.PI / 2], [0, 2.3, Math.PI], [-2.3, 0, Math.PI / 2]].forEach(([x, z, ry], i) => {
      const h = new THREE.Group(); h.position.set(x, 0.2, z); h.rotation.y = ry; g.add(h);
      box(h, 2.4, 1.35, 1.3, M.wall(), 0, 0, -0.35);
      box(h, 0.9, 1.05, 0.05, M.door(), 0, 0.05, 0.31);
      columns(h, [[-1.25, 0.55], [1.25, 0.55]], 1.45, 0, 0.07);
      beams(h, 2.5, 1.7, 1.47, 0.12);
      roof(h, 3.3, 2.5, 0.85, { ridge: 2.2, lift: 0.3, material: M.roofJade(), y: 1.6, z: -0.1 });
      plaque(h, colors[i], 0, 1.3, 0.66, 0.7);
    });
    // 中庭：石燈與一株小松
    lantern(g, -0.9, 0.2, 0.9, 0.9); lantern(g, 0.9, 0.2, -0.9, 0.9, false);
    cyl(g, 0.5, 0.55, 0.32, M.stoneDk(), 0, 0.2, 0, 16);
  },

  /** 善念實踐園的亭子：攢尖頂、坐凳欄杆，匾額顏色代表三好或四給 */
  pavilion(g, spot) {
    const color = spot?.color || '#5f9a8b';
    cyl(g, 1.45, 1.55, 0.28, M.stone(), 0, 0, 0, 6);
    const r = 1.15, pts = [];
    for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2 + Math.PI / 6; pts.push([Math.cos(a) * r, Math.sin(a) * r]); }
    columns(g, pts, 1.75, 0.28, 0.075);
    // 坐凳欄杆（留出正面的入口）
    pts.forEach(([x, z], i) => {
      const [nx, nz] = pts[(i + 1) % 6];
      const mx = (x + nx) / 2, mz = (z + nz) / 2;
      if (mz > 0.8) return;
      const len = Math.hypot(nx - x, nz - z);
      box(g, len, 0.06, 0.24, M.wood(), mx, 0.7, mz, -Math.atan2(nz - z, nx - x));
      box(g, len, 0.4, 0.04, M.woodDk(), mx * 1.04, 0.28, mz * 1.04, -Math.atan2(nz - z, nx - x));
    });
    const rg = roofGeo(3.3, 3.3, 1.35, 0, 0.42, 16, 9);
    add(g, rg, M.roofJade(), 0, 2.05, 0, Math.PI / 4);
    add(g, roofGeo(3.25, 3.25, 1.32, 0, 0.42), M.beam(), 0, 1.96, 0, Math.PI / 4).castShadow = false;
    cyl(g, 1.25, 1.25, 0.14, M.beam(), 0, 1.95, 0, 6);
    cyl(g, 0.05, 0.13, 0.25, M.gold(), 0, 3.35, 0, 8);
    sphere(g, 0.14, M.gold(), 0, 3.7, 0, 1);
    plaque(g, color, 0, 1.78, 1.08, 0.62);
    // 亭心的小石桌
    cyl(g, 0.32, 0.22, 0.6, M.stone(), 0, 0.28, -0.1, 10);
    paperLamp(g, 0.7, 1.55, 0.9, 0.75);
  },

  /** AI 智慧講堂：開敞的講堂，堂前浮著一盞緩緩轉動的光環（AI 導覽） */
  lecture(g) {
    podium(g, 7.4, 5.4, 0.5, { stepW: 3 });
    const y = 0.5;
    box(g, 6, 2.2, 3.2, M.wall(), 0, y, -0.7);
    // 前方大開口與圓窗
    box(g, 2.6, 1.9, 0.05, mat('#2f3c48', { r: 0.6, e: '#3a5a7a', ei: 0.35 }), 0, y, 0.92);
    add(g, new THREE.TorusGeometry(0.55, 0.07, 8, 32), M.woodDk(), 2.15, y + 1.3, 0.95);
    add(g, new THREE.TorusGeometry(0.55, 0.07, 8, 32), M.woodDk(), -2.15, y + 1.3, 0.95);
    add(g, new THREE.CircleGeometry(0.52, 32), M.door(), 2.15, y + 1.3, 0.93);
    add(g, new THREE.CircleGeometry(0.52, 32), M.door(), -2.15, y + 1.3, 0.93);
    columns(g, [-2.9, -1.45, 0, 1.45, 2.9].map((x) => [x, 1.8]), 2.25, y, 0.1);
    beams(g, 6.2, 3.8, y + 2.25, 0.2);
    roof(g, 8.2, 5.8, 1.35, { ridge: 5.6, lift: 0.45, material: M.roofSlate(), y: y + 2.4, z: -0.25 });
    plaque(g, '#5a6fa6', 0, y + 2.05, 1.95, 1.2);
    // 講堂內的長桌與坐墊
    box(g, 2.2, 0.5, 0.7, M.wood(), 0, y, -1.2);
    for (const x of [-0.7, 0, 0.7]) cyl(g, 0.2, 0.22, 0.12, mat('#a8553f'), x, y, -0.4, 12);
    for (const x of [-3.2, 3.2]) paperLamp(g, x, y + 1.8, 2.1, 1.1);
  },

  /** 願行台：山頂的圓形石台、鐘亭與一圈祈願燈柱 */
  terrace(g) {
    cyl(g, 3.5, 3.7, 0.3, M.stoneDk(), 0, 0, 0, 32);
    cyl(g, 2.7, 2.8, 0.22, M.stone(), 0, 0.3, 0, 32);
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      if (Math.sin(a) > 0.93) continue;                       // 南側留出入口
      cyl(g, 0.07, 0.08, 0.6, M.stone(), Math.cos(a) * 3.4, 0.3, Math.sin(a) * 3.4, 6);
      if (i % 2 === 0) paperLamp(g, Math.cos(a) * 3.4, 1.15, Math.sin(a) * 3.4, 0.7);
    }
    // 鐘亭（北側）
    const b = new THREE.Group(); b.position.set(0, 0.52, -1.3); g.add(b);
    columns(b, [[-0.7, -0.6], [0.7, -0.6], [-0.7, 0.6], [0.7, 0.6]], 1.9, 0, 0.08);
    beams(b, 1.4, 1.2, 1.95, 0.14);
    roof(b, 2.4, 2.2, 0.95, { ridge: 0.5, lift: 0.38, material: M.roofGold(), y: 2.08, finial: false });
    box(b, 1.4, 0.1, 0.1, M.woodDk(), 0, 1.75, 0);
    const bell = new THREE.LatheGeometry([[0, 0], [0.34, 0], [0.33, 0.08], [0.27, 0.3], [0.24, 0.62], [0.12, 0.72], [0, 0.74]].map(([x, y]) => new THREE.Vector2(x, y)), 20);
    add(b, bell, M.bronze(), 0, 0.98, 0);
    // 中央的蓮花石盆
    cyl(g, 0.55, 0.42, 0.42, M.stone(), 0, 0.52, 1.2, 16);
    cyl(g, 0.5, 0.5, 0.04, M.water(), 0, 0.92, 1.2, 16);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const p = add(g, new THREE.SphereGeometry(0.2, 8, 6).scale(0.5, 0.25, 1), mat('#e8b9c0', { r: 0.7 }), Math.cos(a) * 0.62, 0.84, 1.2 + Math.sin(a) * 0.62);
      p.rotation.y = -a;
    }
  },
};

/** 山門牌坊（三間四柱）：面向南方的海 */
export function paifang(g) {
  const posts = [-2.6, -0.95, 0.95, 2.6];
  for (const x of posts) {
    box(g, 0.5, 0.4, 0.5, M.stoneDk(), x, 0, 0);
    cyl(g, 0.15, 0.15, 3.3 - (Math.abs(x) > 2 ? 0.7 : 0), M.pillar(), x, 0.4, 0, 12);
  }
  box(g, 2.2, 0.32, 0.22, M.beam(), 0, 3.1, 0);
  box(g, 1.9, 0.5, 0.12, mat('#2e4a45'), 0, 2.55, 0.02);
  roof(g, 2.9, 1.3, 0.62, { ridge: 2.2, lift: 0.28, material: M.roofJade(), y: 3.4 });
  for (const s of [-1, 1]) {
    box(g, 1.8, 0.26, 0.2, M.beam(), s * 1.78, 2.45, 0);
    roof(g, 2.3, 1.1, 0.5, { ridge: 1.6, lift: 0.24, material: M.roofJade(), y: 2.7, x: s * 1.78 });
  }
}

/** 渡口：木棧橋與兩盞燈 */
export function dock(g, len = 5) {
  for (let i = 0; i < len / 0.4; i++) box(g, 2, 0.08, 0.36, M.wood(), 0, 0.5, -i * 0.4);
  for (let i = 0; i <= len; i += 1.6) for (const s of [-1, 1]) cyl(g, 0.07, 0.07, 1.5, M.woodDk(), s * 1.05, -0.9, -i, 6);
  lantern(g, -0.8, 0.58, -0.2, 0.9); lantern(g, 0.8, 0.58, -0.2, 0.9);
}

/** 七層寶塔（西北峰頂的地標） */
export function pagoda(g, s = 1) {
  rbox(g, 3.2 * s, 0.5 * s, 3.2 * s, M.stone(), 0, 0, 0, 0.04);
  let y = 0.5 * s, w = 2.1 * s;
  for (let i = 0; i < 7; i++) {
    const h = (i === 0 ? 1.4 : 0.9) * s;
    box(g, w, h, w, M.wall(), 0, y, 0);
    box(g, w * 0.36, h * 0.6, 0.04, M.door(), 0, y + h * 0.15, w / 2 + 0.01);
    box(g, w + 0.12 * s, 0.12 * s, w + 0.12 * s, M.beam(), 0, y + h, 0);
    roof(g, w + 1.1 * s, w + 1.1 * s, 0.32 * s, { ridge: 0, lift: 0.28 * s, material: M.roofJade(), y: y + h + 0.06 * s, ry: 0 });
    y += h + 0.32 * s; w *= 0.85;
  }
  cyl(g, 0.05 * s, 0.1 * s, 1.3 * s, M.gold(), 0, y - 0.15 * s, 0, 8);
  for (let i = 0; i < 4; i++) cyl(g, (0.2 - i * 0.03) * s, (0.2 - i * 0.03) * s, 0.05 * s, M.gold(), 0, y + i * 0.22 * s, 0, 12);
  sphere(g, 0.12 * s, M.gold(), 0, y + 1.2 * s, 0, 1);
  return y + 1.3 * s;
}

/** 石拱橋：石塊拱面、石欄杆與欄柱 */
export function archBridge(g, len = 4, w = 1.3) {
  const n = 14, pts = [];
  const arcY = (t) => Math.sin(t * Math.PI) * 0.7;
  for (let i = 0; i <= n; i++) { const t = i / n; pts.push([-len / 2 + t * len, arcY(t)]); }
  for (let i = 0; i < n; i++) {
    const [x0, y0] = pts[i], [x1, y1] = pts[i + 1];
    const L = Math.hypot(x1 - x0, y1 - y0) + 0.02, a = Math.atan2(y1 - y0, x1 - x0);
    const seg = add(g, new THREE.BoxGeometry(L, 0.18, w), M.stone(), (x0 + x1) / 2, (y0 + y1) / 2 + 0.3, 0);
    seg.rotation.z = a;
    const under = add(g, new THREE.BoxGeometry(L, 0.22, w - 0.2), M.stoneDk(), (x0 + x1) / 2, (y0 + y1) / 2 + 0.12, 0);
    under.rotation.z = a;
    for (const s of [-1, 1]) {
      const r = add(g, new THREE.BoxGeometry(L, 0.07, 0.12), M.stone(), (x0 + x1) / 2, (y0 + y1) / 2 + 0.78, s * (w / 2 - 0.06));
      r.rotation.z = a;
      const p = add(g, new THREE.BoxGeometry(L - 0.06, 0.32, 0.06), M.stoneDk(), (x0 + x1) / 2, (y0 + y1) / 2 + 0.56, s * (w / 2 - 0.06));
      p.rotation.z = a;
    }
  }
  for (let i = 0; i <= n; i += 2) {
    const [x, y] = pts[i];
    for (const s of [-1, 1]) {
      box(g, 0.13, 0.62, 0.13, M.stone(), x, y + 0.3, s * (w / 2 - 0.06));
      add(g, new THREE.ConeGeometry(0.09, 0.12, 4), M.stoneDk(), x, y + 0.98, s * (w / 2 - 0.06)).rotation.y = Math.PI / 4;
    }
  }
}

/* ---------- 山石與水生植物 ---------- */
const ROCK = triplanar(new THREE.MeshLambertMaterial({ map: TEX.rock, vertexColors: true }), 0.9, 'tri-r');
const rockShapes = [];
function rockShape(k) {
  if (rockShapes[k]) return rockShapes[k];
  let g = new THREE.IcosahedronGeometry(1, 3);
  g.deleteAttribute('uv'); g.deleteAttribute('normal');
  g = mergeVertices(g);                                         // 共用頂點，法線才會平滑
  const p = g.attributes.position, r = xrand(k * 97 + 13), v = new THREE.Vector3();
  const f = [r() * 6, r() * 6, r() * 6, r() * 6];
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    let n = 1 + 0.18 * Math.sin(v.x * 2.3 + f[0]) * Math.cos(v.z * 2.1 + f[1]) + 0.1 * Math.sin(v.y * 4.1 + f[2]) + 0.05 * Math.sin((v.x + v.z) * 6.3 + f[3]) + 0.025 * Math.sin(v.x * 13 + v.y * 11);
    if (v.y < -0.2) n *= 0.92;                                  // 底部較平，坐得穩
    p.setXYZ(i, v.x * n, Math.max(-0.55, v.y * n), v.z * n);
  }
  return (rockShapes[k] = g);
}
/** 山石：自然起伏的石塊，朝上的面長青苔 */
export function boulder(g, x, y, z, s = 1, seed = 1, { tall = 0.65, wet = false } = {}) {
  const r = xrand(seed * 31 + 7);
  const geo = rockShape(seed % 6).clone();
  const sx = s * (1 + r() * 0.4), sy = s * tall * (0.85 + r() * 0.3), sz = s * (0.85 + r() * 0.35), ry = r() * 6.28;
  geo.scale(sx, sy, sz); geo.rotateY(ry); geo.computeVertexNormals();
  const n = geo.attributes.normal, p = geo.attributes.position, col = new Float32Array(p.count * 3);
  const base = new THREE.Color(wet ? '#8a857a' : '#aaa497'), moss = new THREE.Color('#66763f'), c = new THREE.Color();
  const tone = 0.9 + r() * 0.2;
  for (let i = 0; i < p.count; i++) {
    const up = n.getY(i), hy = p.getY(i) / Math.max(0.01, sy);
    c.copy(base).multiplyScalar(tone * (0.82 + 0.18 * Math.sin(p.getX(i) * 5 + p.getZ(i) * 3)));
    if (!wet && up > 0.5) c.lerp(moss, Math.min(1, (up - 0.5) * 2.2) * 0.75);
    if (hy < -0.25) c.multiplyScalar(0.75);                    // 貼地處較暗
    col.set([c.r, c.g, c.b], i * 3);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const m = new THREE.Mesh(geo, ROCK); m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true; g.add(m);
  return m;
}
/** 太湖石：直立、層層堆疊的山石 */
export function scholarRock(g, x, y, z, s = 1, seed = 1) {
  boulder(g, x, y + 0.25 * s, z, 0.55 * s, seed, { tall: 1.1 });
  boulder(g, x + 0.08 * s, y + 0.95 * s, z - 0.05 * s, 0.4 * s, seed + 1, { tall: 1.25 });
  boulder(g, x - 0.06 * s, y + 1.45 * s, z + 0.04 * s, 0.26 * s, seed + 2, { tall: 1.3 });
}

const L = {
  lotusPad: () => mat('#3f6b3a', { r: 0.6, side: THREE.DoubleSide }), lotusPad2: () => mat('#4d7a40', { r: 0.6, side: THREE.DoubleSide }),
  lotus: () => mat('#f0c6cf', { r: 0.7 }),
};
export function lotus(g, x, y, z, seed = 1) {
  const r = xrand(seed * 11 + 5);
  const pad = add(g, new THREE.CircleGeometry(0.3 + r() * 0.18, 16, 0.3, Math.PI * 1.86), r() > 0.5 ? L.lotusPad() : L.lotusPad2(), x, y, z);
  pad.rotation.x = -Math.PI / 2; pad.rotation.z = r() * 6; pad.castShadow = false;
  if (r() > 0.6) {
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2, p = add(g, new THREE.SphereGeometry(0.06, 8, 6).scale(0.55, 0.4, 1.3), L.lotus(), x + 0.05 + Math.cos(a) * 0.04, y + 0.1, z + Math.sin(a) * 0.04);
      p.rotation.set(0.7, -a + Math.PI / 2, 0); p.castShadow = false;
    }
  }
}

/** 木橋：跨過小溪。木板一片片鋪在兩根拱形大樑上，兩側有欄柱與扶手 */
const PLANK = [mat('#9a8468', { r: 0.92, map: TEX.wood }), mat('#86705a', { r: 0.92, map: TEX.wood }), mat('#a8957a', { r: 0.92, map: TEX.wood })];
export function woodBridge(g, len = 5, w = 1.8, d0 = 0, d1 = 0, arcH = 0.3) {
  const r = xrand(Math.round(len * 100));
  // 橋面：從一岸（d0）順順地接到另一岸（d1），中間微微拱起
  const at = (x) => { const t = x / len + 0.5; return d0 + (d1 - d0) * t + Math.sin(t * Math.PI) * arcH; };
  // 兩根拱樑
  const segs = 10;
  for (const sz of [-1, 1]) for (let i = 0; i < segs; i++) {
    const x0 = -len / 2 + (i / segs) * len, x1 = -len / 2 + ((i + 1) / segs) * len, y0 = at(x0), y1 = at(x1);
    const b = add(g, new THREE.BoxGeometry(Math.hypot(x1 - x0, y1 - y0) + 0.03, 0.2, 0.14), M.woodDk(), (x0 + x1) / 2, (y0 + y1) / 2 - 0.14, sz * (w / 2 - 0.28));
    b.rotation.z = Math.atan2(y1 - y0, x1 - x0);
  }
  // 木板
  const n = Math.floor(len / 0.27);
  for (let i = 0; i < n; i++) {
    const x = -len / 2 + (i + 0.5) * (len / n), y = at(x);
    const p = add(g, new THREE.BoxGeometry(0.235, 0.06, w + (r() - 0.5) * 0.08), PLANK[Math.floor(r() * 3)], x, y - 0.03 + (r() - 0.5) * 0.012, (r() - 0.5) * 0.05);
    p.rotation.z = Math.atan2(at(x + 0.1) - at(x - 0.1), 0.2) + (r() - 0.5) * 0.02;
    p.rotation.y = (r() - 0.5) * 0.03;
  }
  // 欄柱與扶手
  const posts = Math.max(3, Math.round(len / 1.1));
  for (const sz of [-1, 1]) {
    for (let i = 0; i <= posts; i++) {
      const x = -len / 2 + (i / posts) * len * 0.98 + len * 0.01, y = at(x), end = i === 0 || i === posts;
      box(g, end ? 0.13 : 0.09, end ? 0.95 : 0.82, end ? 0.13 : 0.09, M.woodDk(), x, y, sz * (w / 2 - 0.06));
      box(g, end ? 0.17 : 0.12, 0.04, end ? 0.17 : 0.12, M.wood(), x, y + (end ? 0.95 : 0.82), sz * (w / 2 - 0.06));
    }
    for (let i = 0; i < posts; i++) {
      const x0 = -len / 2 + (i / posts) * len * 0.98 + len * 0.01, x1 = -len / 2 + ((i + 1) / posts) * len * 0.98 + len * 0.01;
      for (const [h, t] of [[0.78, 0.07], [0.4, 0.045]]) {
        const y0 = at(x0) + h, y1 = at(x1) + h;
        const rail = add(g, new THREE.CylinderGeometry(t / 2, t / 2, Math.hypot(x1 - x0, y1 - y0), 8), M.wood(), (x0 + x1) / 2, (y0 + y1) / 2, sz * (w / 2 - 0.06));
        rail.rotation.z = Math.atan2(y1 - y0, x1 - x0) - Math.PI / 2;
      }
    }
    // 橋頭的石座
    for (const ex of [-len / 2, len / 2]) rbox(g, 0.6, 0.6, 0.5, M.stoneDk(), ex - Math.sign(ex) * 0.1, at(ex) - 0.62, sz * (w / 2 - 0.1), 0.05);
  }
}
