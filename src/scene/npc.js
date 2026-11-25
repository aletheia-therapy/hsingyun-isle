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
  const L = LOOKS[id] || { look, top: color, hairStyle: /婆|姨|雨|娜|蓮|安/.test(name) ? 'long' : 'short' };
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

/** 任務物件：放在地上的柳丁、草地上的感謝卡、待點亮的石燈、湖邊的蒲團 */
export function questItem(kind, i = 0) {
  const g = new THREE.Group();
  const inner = new THREE.Group(); g.add(inner);
  let light = null;
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
  }
  let clock = Math.random() * 6, state = 'idle', fade = 1;
  return {
    group: g, kind,
    get done() { return state !== 'idle'; },
    collect() {
      if (state !== 'idle') return;
      state = kind === 'lamp' || kind === 'lotus' ? 'lit' : 'gone';
      if (light) { light.visible = true; light.userData.bulb.visible = true; }
    },
    update(dt) {
      clock += dt;
      if (light?.visible) light.scale.setScalar(1.25 + Math.sin(clock * 6) * 0.06);
      if (state === 'gone' && fade > 0) {
        fade = Math.max(0, fade - dt * 3);
        g.scale.setScalar(fade); g.position.y += dt * 2;
        if (fade === 0) g.visible = false;
      }
    },
  };
}
