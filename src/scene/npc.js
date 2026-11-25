import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mat, glowMaterial, lantern } from './props.js';

/**
 * 島民與旅人：寫實比例（約 1.7 公尺）的人物。每個身體部位把衣服、皮膚、頭髮合併成一個網格（頂點色），
 * 一個人大約 10 次繪製呼叫。島民會轉頭看向走近的旅人。
 */
const FIG = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.82, metalness: 0 });
const T = (x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) =>
  new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(sx, sy, sz));
function part(list) {
  const geos = list.filter(Boolean).map(([geo, col, m]) => {
    const g = geo.index ? geo.toNonIndexed() : geo.clone();
    if (m) g.applyMatrix4(m);
    for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal') g.deleteAttribute(k);
    const c = new THREE.Color(col), n = g.attributes.position.count, arr = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { arr[i * 3] = c.r; arr[i * 3 + 1] = c.g; arr[i * 3 + 2] = c.b; }
    g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
    return g;
  });
  const mesh = new THREE.Mesh(mergeGeometries(geos), FIG);
  mesh.castShadow = true; mesh.receiveShadow = true;
  return mesh;
}
const cap = (r, len) => new THREE.CapsuleGeometry(r, len, 5, 12);
const sph = (r, ws = 16, hs = 12) => new THREE.SphereGeometry(r, ws, hs);
const shade = (hex, k) => '#' + new THREE.Color(hex).multiplyScalar(k).getHexString();

/** 衣服輪廓（旋轉體）：從腰到肩到領口 */
function shirtGeo(long = false) {
  const pts = (long ? [[0.17, -0.12], [0.165, 0.0]] : [[0.152, 0.06]]).concat([[0.158, 0.2], [0.17, 0.34], [0.176, 0.44], [0.162, 0.51], [0.11, 0.565], [0.05, 0.6]]);
  const g = new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), 18);
  g.scale(1, 1, 0.72);
  return g;
}

/**
 * opt: top, pants, skin, hair, shoe, hairStyle(short/long/bun/grey), height, stoop, longTop, longSleeve
 */
export function humanFigure({ top = '#4f8a83', pants = '#3f4a5c', skin = '#d8a982', hair = '#2b211b', shoe = '#3a3028', hairStyle = 'short', height = 1.0, stoop = 0, longTop = false, longSleeve = false, extras = {} } = {}) {
  const root = new THREE.Group();
  const body = new THREE.Group(); root.add(body);
  const legs = [-1, 1].map((sx) => {
    const hip = new THREE.Group(); hip.position.set(sx * 0.088, 0.9, 0); body.add(hip);
    hip.add(part([[cap(0.074, 0.3), pants, T(0, -0.22, 0)]]));
    const knee = new THREE.Group(); knee.position.y = -0.43; hip.add(knee);
    knee.add(part([
      [cap(0.06, 0.3), pants, T(0, -0.2, 0)],
      [new RoundedBoxGeometry(0.105, 0.075, 0.25, 2, 0.03), shoe, T(0, -0.43, 0.035)],
    ]));
    hip.userData.knee = knee;
    return hip;
  });
  const torso = new THREE.Group(); torso.position.y = 0.9; torso.rotation.x = stoop; body.add(torso);
  const topDk = shade(top, 0.78);
  torso.add(part([
    [new THREE.CylinderGeometry(0.15, 0.142, 0.18, 18), pants, T(0, 0.02, 0, 0, 0, 0, 1, 1, 0.74)],
    [new THREE.CylinderGeometry(0.156, 0.156, 0.035, 18), shade(pants, 0.6), T(0, 0.115, 0, 0, 0, 0, 1, 1, 0.74)],
    [shirtGeo(longTop), top],
    [new THREE.TorusGeometry(0.058, 0.017, 8, 18), topDk, T(0, 0.585, 0, Math.PI / 2)],
    [new THREE.CylinderGeometry(0.045, 0.052, 0.1, 12), skin, T(0, 0.62, 0)],
    ...(extras.torso || []),
  ]));
  const head = new THREE.Group(); head.position.y = 0.72; torso.add(head);
  const hairCol = hairStyle === 'grey' ? '#cfcac2' : hair;
  const hairList = [
    [new THREE.SphereGeometry(0.114, 20, 14, 0, Math.PI * 2, 0, Math.PI * 0.56), hairCol, T(0, 0.02, -0.012, -0.32, 0, 0, 0.97, 1.05, 1.04)],
  ];
  if (hairStyle === 'bun') hairList.push([sph(0.052, 12, 10), hairCol, T(0, 0.075, -0.11)]);
  if (hairStyle === 'long') hairList.push([cap(0.085, 0.17), hairCol, T(0, -0.1, -0.055, 0.12, 0, 0, 1.18, 1, 0.55)]);
  head.add(part([
    [sph(0.105, 20, 16), skin, T(0, 0, 0, 0, 0, 0, 0.92, 1.08, 1)],
    [sph(0.07, 14, 10), skin, T(0, -0.055, 0.03, 0, 0, 0, 1, 0.8, 1)],
    [sph(0.022, 8, 6), skin, T(-0.098, 0, 0, 0, 0, 0, 0.5, 1, 0.8)],
    [sph(0.022, 8, 6), skin, T(0.098, 0, 0, 0, 0, 0, 0.5, 1, 0.8)],
    [new THREE.ConeGeometry(0.016, 0.04, 8), shade(skin, 0.95), T(0, -0.012, 0.105, Math.PI / 2)],
    [sph(0.011, 8, 6), '#1d1915', T(-0.036, 0.012, 0.092)],
    [sph(0.011, 8, 6), '#1d1915', T(0.036, 0.012, 0.092)],
    [new THREE.BoxGeometry(0.034, 0.007, 0.01), shade(hairCol, 0.9), T(-0.037, 0.036, 0.094, 0, 0, 0.08)],
    [new THREE.BoxGeometry(0.034, 0.007, 0.01), shade(hairCol, 0.9), T(0.037, 0.036, 0.094, 0, 0, -0.08)],
    ...hairList,
    ...(extras.head || []),
  ]));
  const arms = [-1, 1].map((sx) => {
    const sh = new THREE.Group(); sh.position.set(sx * 0.205, 0.5, 0); torso.add(sh);
    sh.add(part([[sph(0.064, 12, 10), top], [cap(0.052, 0.21), top, T(0, -0.15, 0)]]));
    const el = new THREE.Group(); el.position.y = -0.3; sh.add(el);
    const fore = longSleeve ? top : skin;
    el.add(part([
      [cap(0.044, 0.19), fore, T(0, -0.13, 0)],
      longSleeve ? [new THREE.CylinderGeometry(0.047, 0.047, 0.03, 12), topDk, T(0, -0.235, 0)] : null,
      [sph(0.046, 12, 10), skin, T(0, -0.29, 0.005, 0, 0, 0, 0.8, 1.12, 0.62)],
      ...((sx > 0 ? extras.right : extras.left) || []),
    ]));
    sh.userData.elbow = el; sh.rotation.z = sx * 0.06;
    return sh;
  });
  root.scale.setScalar(height);
  return { root, body, torso, head, legs, arms };
}

/** 走路／站立動畫（旅人與島民共用） */
export function animateFigure(f, { walking, phase, amp = 1, mood = 'idle', t = 0, look = 0 }) {
  const [la, ra] = f.arms, [ll, rl] = f.legs;
  f.head.rotation.y += (look - f.head.rotation.y) * 0.12;
  if (walking) {
    const s = Math.sin(phase), c = Math.cos(phase);
    ll.rotation.x = s * 0.6 * amp; rl.rotation.x = -s * 0.6 * amp;
    ll.userData.knee.rotation.x = Math.max(0, -c) * 0.9 * amp; rl.userData.knee.rotation.x = Math.max(0, c) * 0.9 * amp;
    la.rotation.x = -s * 0.5 * amp; ra.rotation.x = s * 0.5 * amp;
    ra.rotation.z += (0.06 - ra.rotation.z) * 0.3;
    la.userData.elbow.rotation.x = -0.35; ra.userData.elbow.rotation.x = -0.35;
    f.body.position.y = Math.abs(Math.cos(phase)) * 0.035 * amp;
    f.head.rotation.x = 0;
    return;
  }
  for (const l of f.legs) { l.rotation.x *= 0.8; l.userData.knee.rotation.x *= 0.8; }
  f.body.position.y = 0;
  f.torso.scale.y = 1 + Math.sin(t * 1.7) * 0.006;                // 呼吸
  if (mood === 'sad') {
    f.head.rotation.x += (0.3 - f.head.rotation.x) * 0.1;
    la.rotation.x *= 0.9; ra.rotation.x *= 0.9; ra.rotation.z += (0.06 - ra.rotation.z) * 0.1;
    la.userData.elbow.rotation.x = -0.15; ra.userData.elbow.rotation.x = -0.15;
  } else if (mood === 'happy') {
    f.head.rotation.x += (-0.06 - f.head.rotation.x) * 0.1; la.rotation.x *= 0.9;
    const wave = (t % 6) < 2.4;                                      // 偶爾揮揮手
    ra.rotation.z += ((wave ? 2.5 + Math.sin(t * 7) * 0.25 : 0.06) - ra.rotation.z) * 0.12;
    ra.userData.elbow.rotation.x = wave ? -0.3 : -0.12;
  } else {
    f.head.rotation.x += (Math.sin(t * 0.6) * 0.04 - f.head.rotation.x) * 0.1;
    la.rotation.x *= 0.85; ra.rotation.x *= 0.85; ra.rotation.z += (0.06 - ra.rotation.z) * 0.1;
    la.userData.elbow.rotation.x = -0.12; ra.userData.elbow.rotation.x = -0.12;
  }
}

/* ---------- 七位島民與導覽員的穿著與隨身物 ---------- */
const backpack = (col = '#6a5a48') => [
  [new RoundedBoxGeometry(0.27, 0.34, 0.13, 2, 0.04), col, T(0, 0.33, -0.165)],
  [new THREE.BoxGeometry(0.035, 0.32, 0.02), shade(col, 0.7), T(-0.1, 0.36, 0.11)],
  [new THREE.BoxGeometry(0.035, 0.32, 0.02), shade(col, 0.7), T(0.1, 0.36, 0.11)],
];
const LOOKS = {
  origin: { look: 'guide', top: '#a8874e', pants: '#5d5246', skin: '#d9ab86', hairStyle: 'bun', longTop: true,
    extras: { head: [[new THREE.CylinderGeometry(0.19, 0.2, 0.012, 28), '#cdb27a', T(0, 0.095, 0)], [new THREE.CylinderGeometry(0.1, 0.112, 0.07, 18), '#cdb27a', T(0, 0.13, 0)], [new THREE.CylinderGeometry(0.113, 0.113, 0.02, 18), '#8a5a3a', T(0, 0.11, 0)]] } },
  deed: { look: 'elder', top: '#7d6290', pants: '#4f463c', skin: '#d2a37c', hairStyle: 'bun', hair: '#bdb7ad', height: 0.93, stoop: 0.14, longTop: true, longSleeve: true },
  speech: { look: 'student', top: '#6f7f52', pants: '#3b4658', skin: '#dcae88', hairStyle: 'short',
    extras: { torso: backpack('#5a4a3a'), left: [[new RoundedBoxGeometry(0.075, 0.14, 0.012, 2, 0.008), '#1f2226', T(0, -0.31, 0.04, -0.5)]] } },
  heart: { look: 'student', top: '#a98aa4', pants: '#4a4a58', skin: '#e0b48e', hairStyle: 'long' },
  confidence: { look: 'student', top: '#5a8f82', pants: '#3b4658', skin: '#d9ab86', hairStyle: 'long', extras: { torso: backpack('#7a6a58') } },
  joy: { look: 'elder', top: '#c99a3c', pants: '#5a4f44', skin: '#cf9f78', hairStyle: 'bun', longTop: true,
    extras: { torso: [[new THREE.BoxGeometry(0.27, 0.42, 0.012), '#f1ebe0', T(0, 0.12, 0.125, 0.05)], [new THREE.BoxGeometry(0.2, 0.15, 0.012), '#f1ebe0', T(0, 0.38, 0.13)]] } },
  hope: { look: 'elder', top: '#6f93b8', pants: '#5a5550', skin: '#c99a74', hairStyle: 'grey', stoop: 0.1, longSleeve: true,
    extras: { right: [[new THREE.CylinderGeometry(0.012, 0.012, 0.92, 8), '#5a3e28', T(0, -0.62, 0.06, 0.06)], [new THREE.TorusGeometry(0.035, 0.011, 6, 12, Math.PI), '#5a3e28', T(0, -0.17, 0.035, 0, Math.PI / 2)]] } },
  ease: { look: 'student', top: '#7f9d5c', pants: '#3f4a5c', skin: '#d6a47e', hairStyle: 'long',
    extras: { torso: backpack('#8a5a4a'), left: [[new THREE.BoxGeometry(0.16, 0.012, 0.12), '#efe6cf', T(0.02, -0.3, 0.07, 0.6)]] } },
};

/** 島民（依編號套用穿著與隨身物） */
export function villager(look = 'student', color = '#5f9a8b', name = '', id = '') {
  const L = typeof look === 'object' ? look : LOOKS[id] || { look, top: color, hairStyle: /婆|姨|雨|娜|蓮|安/.test(name) ? 'long' : 'short' };
  const f = humanFigure(L);
  const group = new THREE.Group();
  group.add(f.root);
  // 腳下的柔和陰影
  const blobGeo = new THREE.CircleGeometry(0.34, 20); blobGeo.rotateX(-Math.PI / 2);
  const blob = new THREE.Mesh(blobGeo, new THREE.MeshBasicMaterial({ color: '#000', transparent: true, opacity: 0.18, depthWrite: false }));
  blob.position.y = 0.025; group.add(blob);
  // 阿婆的柳丁籃：任務前翻倒在地上，任務後扶正、裝滿
  let basket = null;
  if (id === 'deed') {
    basket = new THREE.Group();
    const wicker = mat('#a07a48', { r: 0.95 }), orange = mat('#e07b22', { r: 0.55 });
    const b = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.17, 0.2, 16, 1, true), wicker); b.position.y = 0.1; b.castShadow = true;
    const bottom = new THREE.Mesh(new THREE.CircleGeometry(0.17, 16), wicker); bottom.rotation.x = -Math.PI / 2; bottom.position.y = 0.005;
    const handle = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.012, 6, 20, Math.PI), wicker); handle.position.y = 0.2;
    const fruits = new THREE.Group();
    for (let i = 0; i < 6; i++) { const o = new THREE.Mesh(new THREE.SphereGeometry(0.07, 12, 10), orange); const a = i * 1.05; o.position.set(Math.cos(a) * 0.09, 0.2 + (i % 2) * 0.04, Math.sin(a) * 0.09); fruits.add(o); }
    basket.add(b, bottom, handle, fruits);
    basket.position.set(0.55, 0, 0.25);
    basket.userData.fruits = fruits;
    group.add(basket);
  }
  let mood = 'sad', moving = false, clock = Math.random() * 10, phase = 0, look_ = 0;
  const watch = new THREE.Vector2(9999, 9999);
  const api = {
    group,
    setMood(m) { mood = m; if (basket) { const up = m === 'happy'; basket.rotation.z = up ? 0 : 1.35; basket.position.y = up ? 0 : 0.17; basket.userData.fruits.visible = up; } },
    setBadge() {},
    set moving(v) { moving = v; },
    /** 旅人的位置（島民會轉頭看他） */
    watch(x, z) { watch.set(x, z); },
    update(dt) {
      clock += dt; if (moving) phase += dt * 9;
      const g = group.position, d = Math.hypot(watch.x - g.x, watch.y - g.z);
      let target = 0;
      if (d < 7 && d > 0.3) {
        let a = Math.atan2(watch.x - g.x, watch.y - g.z) - group.rotation.y;
        a = Math.atan2(Math.sin(a), Math.cos(a));
        target = THREE.MathUtils.clamp(a, -1.0, 1.0);
      }
      look_ += (target - look_) * Math.min(1, dt * 4);
      animateFigure(f, { walking: moving, phase, mood, t: clock, look: look_ });
    },
  };
  api.setMood('sad');
  return api;
}

/** 地上的互動光圈：只在「目前目標」或走近時出現 */
export function ringMarker() {
  const g = new THREE.Group();
  const m = new THREE.MeshBasicMaterial({ color: '#fff3d6', transparent: true, opacity: 0.5, depthWrite: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
  const r = new THREE.Mesh(new THREE.RingGeometry(0.92, 1.0, 56), m);
  r.rotation.x = -Math.PI / 2; g.add(r);
  g.visible = false;
  let clock = 0, hot = false;
  return {
    group: g,
    set hot(v) { hot = v; },
    set show(v) { g.visible = v; },
    update(dt) { clock += dt; const s = 1 + Math.sin(clock * 3) * 0.03; r.scale.setScalar(hot ? s * 1.05 : s); m.opacity = hot ? 0.85 : 0.45 + Math.sin(clock * 2) * 0.1; },
  };
}

/* ---------- 任務物件 ---------- */
const glowOf = (col, op = 0.6, sc = 1.3) => { const sp = new THREE.Sprite(glowMaterial.clone()); sp.material.color.set(col); sp.material.opacity = op; sp.scale.setScalar(sc); return sp; };
const shadowed = (m, cast = true) => { m.castShadow = cast; m.receiveShadow = true; return m; };
const lathe = (pts, seg = 20) => new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), seg);

/** 把一組靜態小物件依材質合併成少數幾個網格（減少繪製呼叫）；多材質的網格與精靈保留原樣 */
function mergeStatic(g) {
  g.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(g.matrixWorld).invert(), rel = new THREE.Matrix4();
  const buckets = new Map(), done = [];
  g.traverse((o) => {
    if (!o.isMesh || Array.isArray(o.material)) return;
    const geo = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
    geo.applyMatrix4(rel.multiplyMatrices(inv, o.matrixWorld));
    for (const k of Object.keys(geo.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'uv') geo.deleteAttribute(k);
    if (!geo.attributes.uv) geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(geo.attributes.position.count * 2), 2));
    if (!buckets.has(o.material.uuid)) buckets.set(o.material.uuid, { m: o.material, geos: [], cast: false });
    const b = buckets.get(o.material.uuid); b.geos.push(geo); b.cast ||= o.castShadow;
    done.push(o);
  });
  done.forEach((o) => o.parent.remove(o));
  for (const { m, geos, cast } of buckets.values()) {
    const mesh = new THREE.Mesh(mergeGeometries(geos), m);
    geos.forEach((x) => x.dispose());
    mesh.castShadow = cast; mesh.receiveShadow = true; g.add(mesh);
  }
  return g;
}

/** 一張用 canvas 畫的小圖（筆記內頁、小安的畫） */
const texCache = new Map();
function canvasTex(key, w, h, draw) {
  if (texCache.has(key)) return texCache.get(key);
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  texCache.set(key, t);
  return t;
}
const notePage = () => canvasTex('note', 128, 160, (x, w, h) => {
  x.fillStyle = '#f7f1e2'; x.fillRect(0, 0, w, h);
  x.strokeStyle = 'rgba(80,110,160,.35)'; x.lineWidth = 1;
  for (let y = 22; y < h; y += 12) { x.beginPath(); x.moveTo(8, y); x.lineTo(w - 6, y); x.stroke(); }
  x.strokeStyle = 'rgba(40,40,60,.75)'; x.lineWidth = 1.4;
  let s = 7;
  for (let y = 20; y < h - 10; y += 12) {
    let px = 12; const end = w - 12 - ((y * 7) % 30);
    x.beginPath(); x.moveTo(px, y - 3);
    while (px < end) { s = (s * 9301 + 49297) % 233280; px += 3 + (s / 233280) * 4; x.lineTo(px, y - 3 - (s / 233280) * 4); }
    x.stroke();
  }
  x.strokeStyle = 'rgba(200,70,60,.7)'; x.lineWidth = 2; x.strokeRect(10, 70, 60, 26);
});
const islandPainting = () => canvasTex('paint', 256, 196, (x, w, h) => {
  const sky = x.createLinearGradient(0, 0, 0, h * 0.62); sky.addColorStop(0, '#a8c6d6'); sky.addColorStop(1, '#efe5cf');
  x.fillStyle = sky; x.fillRect(0, 0, w, h);
  x.fillStyle = 'rgba(120,150,140,.75)';
  x.beginPath(); x.moveTo(0, 112); for (let i = 0; i <= 16; i++) x.lineTo(i * 16, 96 - Math.sin(i * 0.9) * 10 - (i % 3) * 4); x.lineTo(w, 120); x.lineTo(0, 120); x.fill();
  const sea = x.createLinearGradient(0, 118, 0, h); sea.addColorStop(0, '#7ea4b2'); sea.addColorStop(1, '#4f7f8f');
  x.fillStyle = sea; x.fillRect(0, 118, w, h - 118);
  x.fillStyle = '#5c8450'; x.beginPath(); x.ellipse(128, 132, 86, 22, 0, Math.PI, 0); x.fill();
  x.fillStyle = '#486e42'; x.beginPath(); x.ellipse(118, 124, 48, 26, 0, Math.PI, 0); x.fill();
  x.fillStyle = '#6b4a35'; x.fillRect(150, 104, 4, 16); x.fillRect(166, 104, 4, 16);
  x.fillStyle = '#8a3b30'; x.beginPath(); x.moveTo(142, 106); x.lineTo(160, 94); x.lineTo(178, 106); x.fill();
  x.strokeStyle = 'rgba(255,255,255,.55)'; x.lineWidth = 2;
  for (let i = 0; i < 9; i++) { x.beginPath(); x.moveTo(20 + i * 26, 150 + (i % 3) * 12); x.lineTo(38 + i * 26, 150 + (i % 3) * 12); x.stroke(); }
  x.fillStyle = 'rgba(255,250,235,.9)'; x.beginPath(); x.arc(206, 40, 13, 0, Math.PI * 2); x.fill();
});

/** 一片蓮花瓣（小蓮燈用） */
function lotusLamp() {
  const g = new THREE.Group();
  const petal = new THREE.SphereGeometry(0.1, 10, 8); petal.scale(0.5, 0.32, 1.2); petal.translate(0, 0, 0.1);
  const pm = mat('#f2d9dc', { r: 0.6 }), pm2 = mat('#e8b9c2', { r: 0.6 });
  for (let k = 0; k < 2; k++) for (let i = 0; i < 8; i++) {
    const m = new THREE.Mesh(petal, k ? pm2 : pm);
    m.rotation.set(-0.5 - k * 0.45, i * Math.PI / 4 + k * 0.4, 0, 'YXZ');
    m.scale.setScalar(k ? 0.75 : 1); m.position.y = 0.02 + k * 0.03; g.add(m);
  }
  const candle = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.04, 0.08, 12), mat('#f3ead6', { r: 0.7 })); candle.position.y = 0.07; g.add(candle);
  const fl = new THREE.Mesh(new THREE.SphereGeometry(0.028, 10, 8).scale(1, 1.8, 1), mat('#fff2c8', { e: '#ffc860', ei: 2.4 })); fl.position.y = 0.15; g.add(fl);
  mergeStatic(g);
  const glow = glowOf('#ffd9a0', 0.55, 0.9); glow.position.y = 0.16; g.add(glow);
  g.userData = { glow };
  return g;
}

/** 心火：石座上的銅火盆，熄滅後化成一盞小蓮燈 */
function brazier(i) {
  const g = new THREE.Group();
  g.add(shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.27, 0.48, 12), mat('#8d887d', { r: 0.95 }))));
  g.children[0].position.y = 0.24;
  const bowl = shadowed(new THREE.Mesh(lathe([[0.1, 0], [0.3, 0.05], [0.41, 0.18], [0.43, 0.22], [0.39, 0.21], [0.29, 0.1], [0.1, 0.06]], 22), mat('#5b4532', { r: 0.6, m: 0.35, side: THREE.DoubleSide })));
  bowl.position.y = 0.47; g.add(bowl);
  const coal = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.3, 0.05, 18), mat('#2a201b', { r: 1, e: '#5a1a08', ei: 0.6 })); coal.position.y = 0.6; g.add(coal);
  const tint = [['#ff8a2a', '#ffd36a'], ['#ff5a2a', '#ffb24a'], ['#d4642e', '#f0b070']][i % 3];
  const flameGeo = lathe([[0, 0], [0.15, 0.06], [0.17, 0.16], [0.12, 0.32], [0.05, 0.5], [0, 0.62]], 14);
  const add = (col, op) => new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: op, depthWrite: false, blending: THREE.AdditiveBlending });
  const flames = new THREE.Group(); flames.position.y = 0.6; g.add(flames);
  const parts = [[1, 0, 0, tint[0], 0.75], [0.62, 0.02, 0.0, tint[1], 0.9], [0.55, 0.12, 0.08, tint[0], 0.6], [0.5, -0.1, -0.06, tint[0], 0.6]].map(([s, x, z, col, op], k) => {
    const m = new THREE.Mesh(flameGeo, add(col, op)); m.scale.setScalar(s); m.position.set(x, 0, z); m.userData.k = k * 1.7 + i; m.userData.b = s; flames.add(m); return m;
  });
  const glow = glowOf(tint[0], 0.7, 1.9); glow.position.y = 0.95; g.add(glow);
  const lamp = lotusLamp(); lamp.position.y = 0.6; lamp.scale.setScalar(0.001); lamp.visible = false; g.add(lamp);
  g.userData = { flames, parts, glow, lamp };
  return g;
}

/** 小安的筆記：石凳上攤開的筆記本 */
function notebookBench() {
  const g = new THREE.Group();
  const stone = mat('#8f897c', { r: 0.95 }), wood = mat('#86654a', { r: 0.8 });
  for (const sx of [-0.42, 0.42]) { const l = shadowed(new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.4, 0.34), stone)); l.position.set(sx, 0.2, 0); g.add(l); }
  const top = shadowed(new THREE.Mesh(new RoundedBoxGeometry(1.15, 0.07, 0.4, 2, 0.02), wood)); top.position.y = 0.43; g.add(top);
  const cover = shadowed(new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.012, 0.31), mat('#3e5d78', { r: 0.7 }))); cover.position.set(-0.12, 0.472, 0.02); cover.rotation.y = 0.18; g.add(cover);
  const pageM = new THREE.MeshStandardMaterial({ map: notePage(), roughness: 0.9 });
  for (const sx of [-1, 1]) {
    const pg = new THREE.Mesh(new THREE.BoxGeometry(0.205, 0.01, 0.29), [mat('#efe7d4'), mat('#efe7d4'), pageM, mat('#efe7d4'), mat('#efe7d4'), mat('#efe7d4')]);
    pg.position.set(-0.12 + sx * 0.105 * Math.cos(0.18), 0.482 + 0.006, 0.02 - sx * 0.105 * Math.sin(0.18)); pg.rotation.set(0, 0.18, sx * -0.05);
    pg.receiveShadow = true; g.add(pg);
  }
  const pen = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.16, 8), mat('#23272e')); pen.rotation.set(Math.PI / 2, 0, 0.5); pen.position.set(0.2, 0.475, 0.03); g.add(pen);
  return mergeStatic(g);
}

/** 小安的畫：木畫架上的小島風景 */
function easel() {
  const g = new THREE.Group();
  const wood = mat('#9a7650', { r: 0.8 });
  const leg = (x, z, rx, rz) => { const m = shadowed(new THREE.Mesh(new THREE.BoxGeometry(0.045, 1.62, 0.045), wood)); m.position.set(x, 0.78, z); m.rotation.set(rx, 0, rz); g.add(m); };
  leg(-0.3, 0.06, -0.08, -0.17); leg(0.3, 0.06, -0.08, 0.17); leg(0, -0.36, 0.38, 0);
  const ledge = shadowed(new THREE.Mesh(new THREE.BoxGeometry(0.78, 0.035, 0.1), wood)); ledge.position.set(0, 0.62, 0.11); g.add(ledge);
  const board = shadowed(new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.54, 0.025), mat('#e9e2d2'))); board.position.set(0, 0.92, 0.095); board.rotation.x = -0.08; g.add(board);
  const pic = new THREE.Mesh(new THREE.PlaneGeometry(0.64, 0.48), new THREE.MeshStandardMaterial({ map: islandPainting(), roughness: 0.85 }));
  pic.position.set(0, 0.92, 0.109); pic.rotation.x = -0.08; g.add(pic);
  const pal = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.012, 18).scale(1.3, 1, 1), mat('#b58a5a'))); pal.position.set(0.42, 0.01, 0.32); g.add(pal);
  [['#c44a3a', 0.05, 0.05], ['#e0b34a', -0.04, 0.06], ['#4b7aa0', 0.08, -0.04], ['#5a8a4a', -0.07, -0.03]].forEach(([c, x, z]) => { const d = new THREE.Mesh(new THREE.SphereGeometry(0.022, 8, 6).scale(1, 0.4, 1), mat(c, { r: 0.4 })); d.position.set(0.42 + x, 0.02, 0.32 + z); g.add(d); });
  return mergeStatic(g);
}

/** 小安救回來的花：陶盆、盛開的花與一把澆水壺 */
function flowerPot() {
  const g = new THREE.Group();
  const pot = shadowed(new THREE.Mesh(lathe([[0, 0], [0.15, 0], [0.18, 0.03], [0.23, 0.3], [0.26, 0.31], [0.26, 0.37], [0.225, 0.37], [0.2, 0.34], [0, 0.34]], 22), mat('#ad5f3c', { r: 0.9 })));
  g.add(pot);
  const soil = new THREE.Mesh(new THREE.CylinderGeometry(0.21, 0.21, 0.02, 18), mat('#3b2a1f', { r: 1 })); soil.position.y = 0.345; g.add(soil);
  const leafGeo = new THREE.SphereGeometry(0.08, 8, 6); leafGeo.scale(0.45, 0.12, 1.3); leafGeo.translate(0, 0, 0.09);
  const leafM = mat('#4f7d3c', { r: 0.7 }), stemM = mat('#5f8a40');
  for (let i = 0; i < 9; i++) { const l = shadowed(new THREE.Mesh(leafGeo, leafM)); l.position.y = 0.38 + (i % 3) * 0.06; l.rotation.set(-0.5 - (i % 3) * 0.2, i * 2.3, 0, 'YXZ'); g.add(l); }
  const petalGeo = new THREE.SphereGeometry(0.035, 8, 6).scale(0.6, 0.3, 1.3).translate(0, 0, 0.035);
  [[0, 0.62, 0, '#e6b83a'], [0.1, 0.55, 0.06, '#d9675c'], [-0.09, 0.57, -0.05, '#e6b83a'], [0.02, 0.52, -0.11, '#d9675c']].forEach(([x, y, z, c]) => {
    const st = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.008, y - 0.34, 6), stemM); st.position.set(x * 0.6, (y + 0.34) / 2, z * 0.6); g.add(st);
    const f = new THREE.Group(); f.position.set(x, y, z); g.add(f);
    for (let i = 0; i < 6; i++) { const p = new THREE.Mesh(petalGeo, mat(c, { r: 0.6 })); p.rotation.set(-0.35, i * Math.PI / 3, 0, 'YXZ'); f.add(p); }
    const ctr = new THREE.Mesh(new THREE.SphereGeometry(0.018, 8, 6), mat('#6a4a1c')); ctr.position.y = 0.01; f.add(ctr);
  });
  const can = new THREE.Group(); can.position.set(0.42, 0, 0.1); can.rotation.y = -0.6; g.add(can);
  const cm = mat('#6f8e97', { r: 0.45, m: 0.4 });
  can.add(shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.12, 0.22, 16), cm))); can.children[0].position.y = 0.11;
  const sp = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.022, 0.26, 8), cm); sp.position.set(0.15, 0.16, 0); sp.rotation.z = -1.0; can.add(sp);
  const hd = new THREE.Mesh(new THREE.TorusGeometry(0.07, 0.012, 6, 14, Math.PI), cm); hd.position.set(-0.03, 0.22, 0); can.add(hd);
  return mergeStatic(g);
}

/** 三好村的組員：站在村子裡生悶氣，走近時會轉向你；說過話後會開心地揮手 */
function questPerson(p, i) {
  const v = villager({ ...p.look, height: [1.0, 0.97, 1.03][i % 3] }, '#888', p.name, '');
  const g = v.group;
  let st = 'idle', wx = 9999, wz = 9999;
  return {
    group: g, kind: 'person', talk: { ...p, kind: 'person' },
    get done() { return st !== 'idle'; },
    collect() { if (st === 'idle') { st = 'talked'; v.setMood('happy'); } },
    get talkedTo() { return st !== 'idle'; },
    watch(x, z) { wx = x; wz = z; v.watch(x, z); },
    update(dt) {
      const d = Math.hypot(wx - g.position.x, wz - g.position.z);
      if (d < 5 && d > 0.4) {
        let a = Math.atan2(wx - g.position.x, wz - g.position.z) - g.rotation.y;
        a = Math.atan2(Math.sin(a), Math.cos(a));
        g.rotation.y += a * Math.min(1, dt * 2.5);
      }
      v.update(dt);
    },
  };
}

/**
 * 任務物件：柳丁、感謝卡、石燈、湖邊的蒲團、心火、組員、小安的作品（筆記、畫、花）。
 * opt：組員或心火的對話資料（name、line、options）
 */
export function questItem(kind, i = 0, opt = {}) {
  if (kind === 'person') return questPerson(opt, i);
  const g = new THREE.Group();
  const inner = new THREE.Group(); g.add(inner);
  let light = null, fire = null, spark = null;
  if (kind === 'orange') {
    const o = new THREE.Mesh(new THREE.SphereGeometry(0.12, 16, 12), mat('#e07b22', { r: 0.55 })); o.castShadow = true; o.position.y = 0.11; inner.add(o);
    const lf = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6).scale(1.6, 0.3, 0.8), mat('#4f7a3a')); lf.position.set(0.04, 0.23, 0); inner.add(lf);
    inner.rotation.y = i * 1.7;
  } else if (kind === 'card') {
    const c = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.012, 0.24), mat('#fbf4e4', { r: 0.7 })); c.castShadow = true; c.position.y = 0.05; inner.add(c);
    const h = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.014, 0.08), mat('#c9584f')); h.position.set(0.06, 0.052, 0.03); inner.add(h);
    inner.rotation.set(0.08, i * 2.1, -0.06);
  } else if (kind === 'lotus') {
    // 湖邊的平石與蒲團：靜坐、靜心的地方
    const stone = new THREE.Mesh(new THREE.CylinderGeometry(0.72, 0.8, 0.14, 24), mat('#a29c8c', { r: 0.95 })); stone.position.y = 0.05; stone.receiveShadow = true; stone.castShadow = true; inner.add(stone);
    const cushion = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.3, 0.13, 24), mat('#b8862f', { r: 0.9 })); cushion.position.y = 0.18; cushion.castShadow = true; inner.add(cushion);
    const top = new THREE.Mesh(new THREE.SphereGeometry(0.28, 20, 8, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.18, 1), mat('#c3913a', { r: 0.9 })); top.position.y = 0.245; inner.add(top);
  } else if (kind === 'lamp') {
    const lg = new THREE.Group(); lantern(lg, 0, 0, 0, 1.15, false); inner.add(lg);
    light = new THREE.Sprite(glowMaterial.clone()); light.material.opacity = 0.7; light.scale.setScalar(1.3); light.position.y = 0.95; light.visible = false; inner.add(light);
    const bulb = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.26, 0.24), mat('#fff0c8', { e: '#ffb050', ei: 2 })); bulb.position.y = 0.95; bulb.visible = false; inner.add(bulb);
    light.userData.bulb = bulb;
  } else if (kind === 'fire') {
    fire = brazier(i); inner.add(fire);
  } else if (kind === 'book' || kind === 'easel' || kind === 'pot') {
    inner.add(kind === 'book' ? notebookBench() : kind === 'easel' ? easel() : flowerPot());
    inner.rotation.y = [Math.PI + 0.4, -0.5, 0.9][i % 3];
    spark = glowOf('#ffe2a0', 0, 2.2); spark.position.y = 0.9; g.add(spark);
  }
  const STAY = new Set(['lamp', 'lotus', 'fire', 'book', 'easel', 'pot']);
  let clock = Math.random() * 6, state = 'idle', fade = 1, ex = 0;
  return {
    group: g, kind,
    talk: kind === 'fire' ? { ...opt, role: '心火', kind: 'fire' } : null,
    get done() { return state !== 'idle'; },
    /** instant：重新整理頁面時直接還原成完成的樣子，不播動畫 */
    collect(instant = false) {
      if (state !== 'idle') return;
      state = STAY.has(kind) ? 'lit' : 'gone';
      if (light) { light.visible = true; light.userData.bulb.visible = true; }
      if (fire) fire.userData.lamp.visible = true;
      if (instant) { ex = 1; fade = 0; if (state === 'gone') g.visible = false; }
    },
    update(dt) {
      clock += dt;
      if (light?.visible) light.scale.setScalar(1.25 + Math.sin(clock * 6) * 0.06);
      if (fire && g.visible) {
        const u = fire.userData;
        if (state === 'lit') ex = Math.min(1, ex + dt * 1.2);
        const k = 1 - ex;
        u.flames.visible = k > 0.01;
        u.parts.forEach((m) => { const a = m.userData.k, b = m.userData.b * Math.max(0.001, k), f = 1 + 0.16 * Math.sin(clock * 9 + a) + 0.08 * Math.sin(clock * 23 + a * 2); m.scale.set(b, b * f, b); m.rotation.y += dt * (0.6 + a * 0.1); });
        u.glow.material.opacity = (0.55 + 0.1 * Math.sin(clock * 11)) * k;
        if (ex > 0) { const s = Math.max(0.001, Math.min(1, (ex - 0.3) / 0.7)); u.lamp.scale.setScalar(s); u.lamp.userData.glow.scale.setScalar(0.85 + Math.sin(clock * 5) * 0.05); }
      }
      if (spark && state === 'lit' && fade > 0) {
        fade = Math.max(0, fade - dt * 0.5);
        spark.material.opacity = Math.sin(Math.min(1, (1 - fade) * 2.2) * Math.PI) * 0.65;
        spark.scale.setScalar(2.2 + (1 - fade) * 1.4);
      }
      if (state === 'gone' && fade > 0) {
        fade = Math.max(0, fade - dt * 3);
        g.scale.setScalar(fade); g.position.y += dt * 2;
        if (fade === 0) g.visible = false;
      }
    },
  };
}
