import * as THREE from 'three';
import { TEX, rand } from './textures.js';

/**
 * 植物：用「葉片卡」組成樹冠（帶透明度的葉簇貼圖 + 向外的球面法線），
 * 比單純的圓球樹冠更接近真實的樹；草地用實例化的草叢卡片。
 */
export const WIND = { value: 0 };

const FOLIAGE_NORMAL = THREE.ShaderChunk.normal_fragment_begin.replace('normal *= faceDirection;', '');
function foliageMaterial(map, key, { rough = 0.88, sway = 0.03 } = {}) {
  const m = new THREE.MeshLambertMaterial({ map, alphaTest: 0.45, side: THREE.DoubleSide, vertexColors: true });
  m.alphaToCoverage = true;
  m.customProgramCacheKey = () => 'foliage-' + key;
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = WIND;
    sh.uniforms.uSway = { value: sway };
    sh.vertexShader = 'uniform float uTime;\nuniform float uSway;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
      vec3 wp0 = (modelMatrix * vec4(position, 1.0)).xyz;
      float wv = sin(uTime * 1.7 + wp0.x * 0.9 + wp0.z * 0.6) + 0.5 * sin(uTime * 2.9 + wp0.z * 1.7);
      transformed.x += wv * uSway; transformed.z += wv * uSway * 0.6;`);
    // 葉片卡兩面都用同一個（向外的）法線，樹冠才會有圓潤的明暗
    sh.fragmentShader = sh.fragmentShader.replace('#include <normal_fragment_begin>', FOLIAGE_NORMAL);
  };
  return m;
}

export const FM = {
  leaf: foliageMaterial(TEX.broadleaf, 'leaf'),
  maple: foliageMaterial(TEX.maple, 'maple'),
  needle: foliageMaterial(TEX.needles, 'needle', { sway: 0.02 }),
  bamboo: foliageMaterial(TEX.bambooLeaf, 'bamboo', { sway: 0.06 }),
  bark: new THREE.MeshLambertMaterial({ map: TEX.bark, color: '#b2a596' }),
  barkDark: new THREE.MeshLambertMaterial({ map: TEX.bark, color: '#8a7a6c' }),
  bambooCulm: new THREE.MeshLambertMaterial({ color: '#8c9a5a' }),
};

/* ---------- 葉片卡 ---------- */
const _v = new THREE.Vector3(), _n = new THREE.Vector3(), _a = new THREE.Vector3(), _b = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0);
class CardBuilder {
  constructor() { this.pos = []; this.nrm = []; this.uv = []; this.col = []; this.idx = []; }
  /**
   * 在橢球 (c, rx, ry, rz) 內放 n 張葉片卡。flat = 0..1，越大卡片越水平（松針的雲片）。
   * tint: [r,g,b] 基色；shade: 越往下、越往內越暗。
   */
  lobe(c, rx, ry, rz, n, size, r, { flat = 0, tint = [1, 1, 1], center = c, droop = 0 } = {}) {
    for (let i = 0; i < n; i++) {
      _v.set(r() * 2 - 1, r() * 2 - 1, r() * 2 - 1); if (_v.lengthSq() > 1) _v.normalize();
      const shell = 0.5 + 0.5 * Math.sqrt(r());
      _v.multiplyScalar(shell);
      const px = c.x + _v.x * rx, py = c.y + _v.y * ry, pz = c.z + _v.z * rz;
      // 卡片朝向：大致向外，帶隨機
      _n.set(_v.x + (r() - 0.5) * 1.6, _v.y * (1 - flat) + flat * 2 + (r() - 0.5) * 1.2, _v.z + (r() - 0.5) * 1.6).normalize();
      _a.crossVectors(_n, Math.abs(_n.y) > 0.95 ? new THREE.Vector3(1, 0, 0) : _up).normalize();
      _b.crossVectors(_n, _a).normalize();
      const rot = r() * Math.PI * 2, ca = Math.cos(rot), sa = Math.sin(rot);
      const ax = _a.clone().multiplyScalar(ca).addScaledVector(_b, sa), bx = _a.clone().multiplyScalar(-sa).addScaledVector(_b, ca);
      const s = size * (0.75 + r() * 0.5) / 2;
      const cell = Math.floor(r() * 4), u0 = (cell % 2) * 0.5, v0 = Math.floor(cell / 2) * 0.5;
      // 明暗：下方、內部較暗（像是被遮住的光）
      const lowK = THREE.MathUtils.clamp((py - (center.y - ry)) / (2 * ry), 0, 1);
      const shade = (0.7 + 0.3 * lowK) * (0.82 + 0.18 * shell) * (0.9 + r() * 0.2);
      const base = this.pos.length / 3;
      for (const [su, sv] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
        const vx = px + (ax.x * su + bx.x * sv) * s, vy = py + (ax.y * su + bx.y * sv) * s - (sv > 0 ? 0 : droop * s), vz = pz + (ax.z * su + bx.z * sv) * s;
        this.pos.push(vx, vy, vz);
        _v.set(vx - center.x, (vy - center.y) * 0.8, vz - center.z).normalize();
        _v.lerp(_up, 0.25).normalize();
        this.nrm.push(_v.x, _v.y, _v.z);
        this.uv.push(u0 + (su + 1) * 0.25, 1 - (v0 + (1 - sv) * 0.25));
        this.col.push(tint[0] * shade, tint[1] * shade, tint[2] * shade);
      }
      this.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
    }
  }
  geometry() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nrm, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setIndex(this.idx);
    return g.toNonIndexed();
  }
}

/** 彎曲、漸細的樹幹 */
function trunkGeo(h, r0, r1, bx, bz, seg = 8) {
  const g = new THREE.CylinderGeometry(r1, r0, h, seg, 5, true);
  g.translate(0, h / 2, 0);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const t = p.getY(i) / h;
    p.setX(i, p.getX(i) + bx * t * t); p.setZ(i, p.getZ(i) + bz * t * t);
  }
  g.computeVertexNormals();
  return g;
}
function branch(g, from, to, r0, r1, material) {
  const len = from.distanceTo(to);
  const geo = new THREE.CylinderGeometry(r1, r0, len, 6, 1, true);
  geo.translate(0, len / 2, 0);
  const m = new THREE.Mesh(geo, material);
  m.position.copy(from);
  m.quaternion.setFromUnitVectors(_up, _v.subVectors(to, from).normalize());
  m.castShadow = true; m.receiveShadow = true;
  g.add(m);
}
function add(g, geo, material, x, y, z) {
  const m = new THREE.Mesh(geo, material); m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true; g.add(m); return m;
}

const GREENS = [[0.92, 1.0, 0.86], [0.86, 0.98, 0.8], [1.0, 1.02, 0.84], [0.82, 0.94, 0.86]];

/** 闊葉樹（像樟樹、榕樹的圓頂樹冠） */
export function broadleaf(g, x, y, z, s = 1, seed = 1, { material = FM.leaf, tint } = {}) {
  const r = rand(seed * 7 + 3);
  const H = (2.3 + r() * 1.0) * s, bx = (r() - 0.5) * 0.7 * s, bz = (r() - 0.5) * 0.7 * s;
  add(g, trunkGeo(H, (0.17 + r() * 0.06) * s, 0.09 * s, bx, bz), FM.bark, x, y - 0.1, z);
  const top = new THREE.Vector3(x + bx, y + H, z + bz);
  const cb = new CardBuilder();
  const crownC = top.clone().add(new THREE.Vector3(0, 0.9 * s, 0));
  const R = (1.5 + r() * 0.5) * s;
  const lobes = 5 + Math.floor(r() * 3);
  const tn = tint || GREENS[Math.floor(r() * GREENS.length)];
  for (let i = 0; i < lobes; i++) {
    const a = (i / lobes) * Math.PI * 2 + r() * 0.6, d = i === 0 ? 0 : R * (0.45 + r() * 0.3);
    const c = new THREE.Vector3(crownC.x + Math.cos(a) * d, crownC.y + (i === 0 ? 0.55 * s : (r() - 0.35) * 0.7 * s), crownC.z + Math.sin(a) * d);
    const lr = R * (0.55 + r() * 0.25);
    cb.lobe(c, lr, lr * 0.78, lr, 8 + Math.floor(r() * 3), 1.5 * s, r, { tint: tn, center: crownC });
    if (i > 0 && i < 5) branch(g, new THREE.Vector3(x + bx * 0.7, y + H * 0.78, z + bz * 0.7), c.clone().lerp(crownC, 0.35), 0.07 * s, 0.03 * s, FM.bark);
  }
  add(g, cb.geometry(), material, 0, 0, 0);
  return { trunk: [x, z, 0.24 * s], crown: [crownC.x, crownC.z, R * 1.3] };
}

/** 紅楓：較小的樹，秋天的紅橙葉 */
export function maple(g, x, y, z, s = 1, seed = 1) {
  return broadleaf(g, x, y, z, s * 0.78, seed, { material: FM.maple, tint: [1, 0.96, 0.92] });
}

/** 黑松：傾斜彎曲的樹幹，枝端是一片片水平的松針雲 */
export function pine(g, x, y, z, s = 1, seed = 1) {
  const r = rand(seed * 13 + 5);
  const H = (3.0 + r() * 1.4) * s, la = r() * Math.PI * 2, lean = (0.5 + r() * 0.9) * s;
  const bx = Math.cos(la) * lean, bz = Math.sin(la) * lean;
  add(g, trunkGeo(H, (0.2 + r() * 0.06) * s, 0.08 * s, bx, bz, 8), FM.barkDark, x, y - 0.1, z);
  const cb = new CardBuilder();
  const pads = 4 + Math.floor(r() * 3);
  const tipC = new THREE.Vector3(x + bx, y + H + 0.15 * s, z + bz);
  cb.lobe(tipC, 0.95 * s, 0.38 * s, 0.95 * s, 7, 1.3 * s, r, { flat: 0.75, center: tipC });
  for (let i = 0; i < pads; i++) {
    const t = 0.45 + (i / pads) * 0.45, a = la + Math.PI * (0.4 + r() * 1.2) * (i % 2 ? 1 : -1) + r();
    const from = new THREE.Vector3(x + bx * t * t, y + H * t, z + bz * t * t);
    const L = (1.0 + r() * 0.9) * s * (1.15 - t * 0.5);
    const to = new THREE.Vector3(from.x + Math.cos(a) * L, from.y + (0.15 + r() * 0.35) * s, from.z + Math.sin(a) * L);
    branch(g, from, to, 0.08 * s, 0.035 * s, FM.barkDark);
    const pr = (0.8 + r() * 0.5) * s * (1.2 - t * 0.4);
    const pc = to.clone(); pc.y += 0.12 * s;
    cb.lobe(pc, pr, pr * 0.34, pr * 0.9, 6 + Math.floor(r() * 3), 1.3 * s, r, { flat: 0.8, center: pc });
  }
  add(g, cb.geometry(), FM.needle, 0, 0, 0);
  return { trunk: [x, z, 0.26 * s] };
}

/** 竹叢：細長的竹竿，上半部是下垂的竹葉 */
export function bamboo(g, x, y, z, s = 1, seed = 1) {
  const r = rand(seed * 17 + 9);
  const n = 7 + Math.floor(r() * 5);
  const cb = new CardBuilder();
  for (let i = 0; i < n; i++) {
    const ox = (r() - 0.5) * 1.1 * s, oz = (r() - 0.5) * 1.1 * s, H = (3.6 + r() * 2.2) * s;
    const bx = ox * 0.5 + (r() - 0.5) * 0.4, bz = oz * 0.5 + (r() - 0.5) * 0.4;
    add(g, trunkGeo(H, 0.045 * s, 0.025 * s, bx, bz, 6), FM.bambooCulm, x + ox, y - 0.05, z + oz);
    const c = new THREE.Vector3(x + ox + bx * 0.8, y + H * 0.78, z + oz + bz * 0.8);
    cb.lobe(c, 0.75 * s, H * 0.22, 0.75 * s, 5, 1.0 * s, r, { center: c, droop: 0.3 });
  }
  add(g, cb.geometry(), FM.bamboo, 0, 0, 0);
  return { trunk: [x, z, 0.55 * s] };
}

/** 灌叢 */
export function shrub(g, x, y, z, s = 1, seed = 1) {
  const r = rand(seed * 19 + 11);
  const cb = new CardBuilder();
  const c = new THREE.Vector3(x, y + 0.42 * s, z);
  cb.lobe(c, 0.75 * s, 0.5 * s, 0.7 * s, 7 + Math.floor(r() * 3), 1.0 * s, r, { tint: [0.82, 0.9, 0.8], center: c });
  add(g, cb.geometry(), FM.leaf, 0, 0, 0).castShadow = false;
}

/* ---------- 草地（實例化的草叢卡片） ---------- */
function clumpGeometry(w = 0.8, h = 0.45) {
  const pos = [], uv = [], nrm = [], col = [], idx = [];
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * Math.PI, ca = Math.cos(a) * w / 2, sa = Math.sin(a) * w / 2;
    const base = pos.length / 3, u0 = k / 3, u1 = (k + 1) / 3;
    pos.push(-ca, 0, -sa, ca, 0, sa, ca, h, sa, -ca, h, -sa);
    uv.push(u0, 0, u1, 0, u1, 1, u0, 1);
    for (let i = 0; i < 4; i++) nrm.push(0, 1, 0);
    col.push(0.55, 0.55, 0.55, 0.55, 0.55, 0.55, 1, 1, 1, 1, 1, 1);
    idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  return g;
}
function grassMaterial(map, key) {
  const m = new THREE.MeshLambertMaterial({ map, alphaTest: 0.4, side: THREE.DoubleSide, vertexColors: true });
  m.alphaToCoverage = true;
  m.customProgramCacheKey = () => 'grass-' + key;
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = WIND;
    sh.vertexShader = 'uniform float uTime;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
      #ifdef USE_INSTANCING
        vec3 ip = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);
      #else
        vec3 ip = vec3(0.0);
      #endif
      float gw = sin(uTime * 1.9 + ip.x * 0.45 + ip.z * 0.3) * 0.6 + sin(uTime * 3.1 + ip.z * 0.9) * 0.3;
      transformed.x += gw * uv.y * uv.y * 0.07; transformed.z += gw * uv.y * uv.y * 0.04;`);
    sh.fragmentShader = sh.fragmentShader.replace('#include <normal_fragment_begin>', FOLIAGE_NORMAL);
  };
  return m;
}
export const GM = { grass: grassMaterial(TEX.grass, 'g'), flower: grassMaterial(TEX.flowers, 'f') };

/** 建立一組實例化草叢：list = [[x, y, z, scale, rotY, [r,g,b]], ...] */
export function grassField(list, material = GM.grass, { w = 0.8, h = 0.45, extra = 0 } = {}) {
  const geo = clumpGeometry(w, h);
  const mesh = new THREE.InstancedMesh(geo, material, list.length + extra);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), p = new THREE.Vector3(), c = new THREE.Color();
  list.forEach(([x, y, z, s, ry, col], i) => {
    q.setFromAxisAngle(_up, ry); sc.set(s, s * (0.85 + ((i * 37) % 10) / 30), s); p.set(x, y, z);
    m.compose(p, q, sc); mesh.setMatrixAt(i, m);
    c.setRGB(col[0], col[1], col[2]); mesh.setColorAt(i, c);
  });
  for (let i = list.length; i < list.length + extra; i++) { m.makeScale(0, 0, 0); mesh.setMatrixAt(i, m); mesh.setColorAt(i, c.setRGB(1, 1, 1)); }
  mesh.count = list.length + extra;
  mesh.receiveShadow = true; mesh.castShadow = false;
  mesh.frustumCulled = false;
  mesh.userData.base = list.length;
  return mesh;
}
