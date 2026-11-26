import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/**
 * 四大心魔：島上四隻心魔，代表四種需要看見、需要轉化的習氣；每一隻的行為與化解方法都不一樣。
 *   自私鬼（自私）：發現你就主動追上來；被追上，福德減少。拿著善念之光追上去碰它，就能感化。
 *   懈怠鬼（懈怠）：慢慢跟著你，靠近時腳步越來越沉重；被抓住，智慧減少、懶洋洋幾秒。也用善念之光感化。
 *   貪心鬼（貪欲）：到處搶吃善念光球；你撿到的光越多，越容易被它盯上；追上你會把光和福德搶走。
 *                    但如果你主動把善念之光「布施」給它，它就知足了。
 *   嫉妒鬼（比較）：躲著，冷不防就瞬移到你附近，讓畫面一陣干擾、腳步變慢；對它說一句「隨喜」的話，它就轉化了。
 * 感化之後都會變成友善的小精靈。修行不是消滅煩惱，而是看見它、轉化它。
 */
const R = Math.random;
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _v = new THREE.Vector3(), _s = new THREE.Vector3();
/** 先擺好位置、角度、縮放，再合併成一個網格（同一種材質只畫一次） */
const T = (geo, p = [0, 0, 0], r = [0, 0, 0], s = [1, 1, 1]) => geo.applyMatrix4(_m.compose(_v.set(...p), _q.setFromEuler(_e.set(...r)), _s.set(...s)));
const mesh = (geos, material, shadow = false) => { const m = new THREE.Mesh(geos.length > 1 ? mergeGeometries(geos) : geos[0], material); m.castShadow = shadow; return m; };
/** 用幾個點描出側面輪廓，再用曲線補成平滑的身形，繞一圈長成立體 */
const lathe = (pts, seg = 28) => new THREE.LatheGeometry(new THREE.SplineCurve(pts.map(([r, y]) => new THREE.Vector2(r, y))).getPoints(32), seg);
const std = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: o.r ?? 0.6, emissive: o.e ?? '#000000', emissiveIntensity: o.ei ?? 1 });

function textSprite(text, color) {
  const c = document.createElement('canvas'); c.width = 128; c.height = 64;
  const x = c.getContext('2d');
  x.font = '700 40px serif'; x.fillStyle = color; x.textAlign = 'center'; x.textBaseline = 'middle';
  x.fillText(text, 64, 34);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, depthWrite: false, fog: false }));
  s.scale.set(0.8, 0.4, 1);
  return s;
}

/** 一群柔和的光點或煙霧，用一個 Points 一次畫完（大小以公尺計，遠近自動縮放） */
class Dots {
  constructor(scene, n, color, additive) {
    this.n = n;
    this.p = new Float32Array(n * 3); this.a = new Float32Array(n); this.z = new Float32Array(n).fill(0.75);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.p, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aAlpha', new THREE.BufferAttribute(this.a, 1).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aSize', new THREE.BufferAttribute(this.z, 1).setUsage(THREE.DynamicDrawUsage));
    this.color = { value: new THREE.Color(color) };
    this.uScale = { value: 600 };
    this.mat = new THREE.ShaderMaterial({
      uniforms: { uColor: this.color, uScale: this.uScale },
      transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      vertexShader: /* glsl */`
        attribute float aAlpha;
        attribute float aSize;
        uniform float uScale;
        varying float vA;
        void main() {
          vA = aAlpha;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = aAlpha > 0.001 ? clamp(aSize * uScale / -mv.z, 1.5, 120.0) : 0.0;
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */`
        uniform vec3 uColor;
        varying float vA;
        void main() {
          vec2 q = gl_PointCoord * 2.0 - 1.0;
          float d = dot(q, q);
          if (d > 1.0) discard;
          gl_FragColor = vec4(uColor, exp(-d * 3.0) * vA);
          #include <colorspace_fragment>
        }`,
    });
    this.points = new THREE.Points(geo, this.mat);
    this.points.frustumCulled = false; this.points.renderOrder = 6;
    scene.add(this.points);
  }
  setStyle(color, additive) { this.color.value.set(color); this.mat.blending = additive ? THREE.AdditiveBlending : THREE.NormalBlending; this.mat.needsUpdate = true; }
  set(i, x, y, z, a, size) { this.p[i * 3] = x; this.p[i * 3 + 1] = y; this.p[i * 3 + 2] = z; this.a[i] = a; if (size !== undefined) this.z[i] = size; }
  flush(scale) {
    this.uScale.value = scale;
    const at = this.points.geometry.attributes;
    at.position.needsUpdate = true; at.aAlpha.needsUpdate = true; at.aSize.needsUpdate = true;
  }
}

/** 每個心魔身後拖著的一縷氣息（自私鬼是暗紫的煙，懈怠鬼是灰色的霧；感化後變成金色光點） */
class Wisp {
  constructor(scene, color, additive) {
    this.dots = new Dots(scene, 36, color, additive);
    this.i = 0; this.life = new Float32Array(36); this.v = new Float32Array(36 * 3);
  }
  setStyle(color, additive) { this.dots.setStyle(color, additive); }
  update(dt, x, y, z, rate, scale, strength, size = 0.75) {
    const d = this.dots;
    if (R() < rate * dt) {
      const i = this.i; this.i = (this.i + 1) % d.n;
      d.set(i, x + (R() - 0.5) * 0.5, y + (R() - 0.5) * 0.4, z + (R() - 0.5) * 0.5, 0, size * (0.7 + R() * 0.6));
      this.v[i * 3] = (R() - 0.5) * 0.3; this.v[i * 3 + 1] = 0.25 + R() * 0.35; this.v[i * 3 + 2] = (R() - 0.5) * 0.3;
      this.life[i] = 1.6;
    }
    for (let i = 0; i < d.n; i++) {
      if (this.life[i] <= 0) { d.a[i] = 0; continue; }
      this.life[i] -= dt;
      d.p[i * 3] += this.v[i * 3] * dt; d.p[i * 3 + 1] += this.v[i * 3 + 1] * dt; d.p[i * 3 + 2] += this.v[i * 3 + 2] * dt;
      d.a[i] = Math.max(0, Math.sin((this.life[i] / 1.6) * Math.PI)) * strength;
    }
    d.flush(scale);
  }
  set visible(v) { this.dots.points.visible = v; }
}

/** 感化後的小臉：圓眼睛、微笑、兩團腮紅（ze、zm、zb：眼睛、嘴巴、腮紅貼在身體表面的深度） */
function happyFace({ y, spread, ze, zm, zb }) {
  const dark = std('#3a2a1c', { r: 0.4 }), pink = std('#ff9eae', { r: 0.8, e: '#ff7a92', ei: 0.25 });
  const eyes = mesh([
    T(new THREE.SphereGeometry(0.055, 12, 8), [-spread, y, ze]),
    T(new THREE.SphereGeometry(0.055, 12, 8), [spread, y, ze]),
    T(new THREE.TorusGeometry(0.07, 0.016, 6, 14, Math.PI), [0, y - 0.1, zm], [0, 0, Math.PI]),
  ], dark);
  const blush = mesh([
    T(new THREE.SphereGeometry(0.06, 10, 6), [-spread - 0.07, y - 0.08, zb], [0, 0, 0], [1.2, 0.55, 0.4]),
    T(new THREE.SphereGeometry(0.06, 10, 6), [spread + 0.07, y - 0.08, zb], [0, 0, 0], [1.2, 0.55, 0.4]),
  ], pink);
  eyes.visible = blush.visible = false;
  return [eyes, blush];
}

/** 自私鬼：深紫色的水滴身形，眼睛發著貪心的橘光，兩手緊緊抱著一袋錢 */
function makeSelfish() {
  const g = new THREE.Group(), rig = new THREE.Group(); g.add(rig);
  const body = std('#45345a', { r: 0.5, e: '#1b0f27' });
  rig.add(mesh([
    lathe([[0.02, 0], [0.12, 0.12], [0.3, 0.36], [0.46, 0.7], [0.5, 0.95], [0.44, 1.18], [0.27, 1.34], [0, 1.4]]),
    T(new THREE.CapsuleGeometry(0.07, 0.36, 4, 10), [-0.33, 0.78, 0.28], [1.2, 0, -0.5]),
    T(new THREE.CapsuleGeometry(0.07, 0.36, 4, 10), [0.33, 0.78, 0.28], [1.2, 0, 0.5]),
  ], body, true));
  const eyes = mesh([
    T(new THREE.SphereGeometry(0.07, 12, 8), [-0.16, 1.06, 0.43], [0, 0, 0], [1.2, 0.7, 0.6]),
    T(new THREE.SphereGeometry(0.07, 12, 8), [0.16, 1.06, 0.43], [0, 0, 0], [1.2, 0.7, 0.6]),
  ], std('#ffb072', { e: '#ff7a2e', ei: 2.2 }));
  const brows = mesh([
    T(new THREE.BoxGeometry(0.17, 0.035, 0.04), [-0.15, 1.15, 0.44], [0, 0, -0.45]),      // 眉頭往下壓：一臉不想給
    T(new THREE.BoxGeometry(0.17, 0.035, 0.04), [0.15, 1.15, 0.44], [0, 0, 0.45]),
  ], std('#21152c'));
  const sackM = std('#7d5a35', { r: 0.85 });
  const sack = mesh([
    T(new THREE.SphereGeometry(0.24, 16, 12), [0, 0.7, 0.42], [0, 0, 0], [1, 0.9, 0.85]),
    T(new THREE.CylinderGeometry(0.06, 0.1, 0.12, 10), [0, 0.94, 0.42]),
  ], sackM, true);
  const coins = mesh([0, 1, 2].map((i) => T(new THREE.CylinderGeometry(0.06, 0.06, 0.015, 14), [-0.05 + i * 0.05, 1.01 + i * 0.012, 0.44], [0.4, 0, 0])), std('#f2c14e', { r: 0.3, e: '#8a5a10', ei: 0.6 }));
  const face = happyFace({ y: 1.04, spread: 0.15, ze: 0.45, zm: 0.5, zb: 0.45 });
  rig.add(eyes, brows, sack, coins, ...face);
  return { g, rig, body, hide: [eyes, brows, sack, coins], show: face, tagY: 1.6 };
}

/** 懈怠鬼：灰藍色、扁扁垂垂的身形，戴著歪掉的睡帽，眼睛半閉，頭上冒著「Z z」 */
function makeLazy() {
  const g = new THREE.Group(), rig = new THREE.Group(); g.add(rig);
  const body = std('#66718a', { r: 0.7, e: '#121722' });
  rig.add(mesh([lathe([[0.02, 0], [0.2, 0.1], [0.45, 0.3], [0.58, 0.55], [0.56, 0.78], [0.44, 0.98], [0.24, 1.1], [0, 1.14]])], body, true));
  const eyes = mesh([
    T(new THREE.SphereGeometry(0.075, 12, 8), [-0.18, 0.8, 0.5], [0, 0, 0], [1.25, 0.22, 0.5]),
    T(new THREE.SphereGeometry(0.075, 12, 8), [0.18, 0.8, 0.5], [0, 0, 0], [1.25, 0.22, 0.5]),
  ], std('#efe4a4', { e: '#a89a50', ei: 0.7 }));
  // 睡帽：往右垂下來
  const capG = new THREE.Group(); capG.position.set(0.06, 1.0, 0); capG.rotation.z = -0.9;
  capG.add(mesh([T(new THREE.ConeGeometry(0.3, 0.62, 16), [0, 0.25, 0])], std('#8b90a3', { r: 0.9 })));
  capG.add(mesh([T(new THREE.SphereGeometry(0.09, 10, 8), [0, 0.56, 0])], std('#eef0f5')));
  const zz = textSprite('Z z', '#d6dbe8'); zz.position.set(0.45, 1.45, 0);
  const face = happyFace({ y: 0.8, spread: 0.18, ze: 0.53, zm: 0.575, zb: 0.52 });
  rig.add(eyes, capG, zz, ...face);
  return { g, rig, body, hide: [eyes, capG, zz], show: face, zz, tagY: 1.4 };
}

/** 善念光球：浮在小蓮花上的一團金白色光。全部光球的蓮花、光芯、光暈各用一個物件畫完 */
class Orbs {
  constructor(scene, spots) {
    this.list = spots.map(([x, y, z]) => ({ x, y, z, on: true, t: 0, pop: 0 }));
    const n = this.list.length;
    const petal = new THREE.SphereGeometry(0.1, 8, 6); petal.scale(0.5, 0.3, 1.2); petal.translate(0, 0, 0.11);
    const parts = [];
    for (let k = 0; k < 2; k++) for (let i = 0; i < 8; i++) parts.push(petal.clone().rotateX(-0.55 - k * 0.45).rotateY(i * Math.PI / 4 + k * 0.4).scale(1 - k * 0.25, 1 - k * 0.25, 1 - k * 0.25).translate(0, 0.02 + k * 0.03, 0));
    this.lotus = new THREE.InstancedMesh(mergeGeometries(parts), std('#f6d9e0', { r: 0.5, e: '#5a2a3a', ei: 0.25 }), n);
    this.core = new THREE.InstancedMesh(new THREE.SphereGeometry(0.24, 18, 14), new THREE.MeshStandardMaterial({ color: '#fff1cc', emissive: '#ffc24f', emissiveIntensity: 2.6, roughness: 0.3 }), n);
    for (const im of [this.lotus, this.core]) { im.instanceMatrix.setUsage(THREE.DynamicDrawUsage); im.frustumCulled = false; scene.add(im); }
    this.halo = new Dots(scene, n, '#ffd98a', true);
    this.t = 0;
  }
  /** 被貪心鬼吃掉（一樣 45 秒後重生） */
  eat(i) { const o = this.list[i]; if (o?.on) { o.on = false; o.t = 45; o.pop = 1; } }
  /** 離 (x, z) 最近、還亮著的光球（maxD 公尺內），沒有就回傳 -1 */
  nearest(x, z, maxD) {
    let best = -1, bd = maxD;
    this.list.forEach((o, i) => { if (!o.on) return; const d = Math.hypot(o.x - x, o.z - z); if (d < bd) { bd = d; best = i; } });
    return best;
  }
  /** 回傳這一幀被撿到的光球編號（沒有就 -1） */
  update(dt, px, pz, canPick, scale) {
    this.t += dt;
    let got = -1;
    this.list.forEach((o, i) => {
      if (!o.on) { o.t -= dt; if (o.t <= 0) { o.on = true; o.pop = 0; } }
      else if (canPick && got < 0 && Math.hypot(o.x - px, o.z - pz) < 1.45) { o.on = false; o.t = 45; o.pop = 1; got = i; }
      if (o.pop > 0) o.pop = Math.max(0, o.pop - dt * 2.5);
      const show = o.on ? 1 : o.pop, grow = o.on ? 1 : 1 + (1 - o.pop) * 1.4;      // 撿到時往外一放，散成光
      const bob = Math.sin(this.t * 2 + i) * 0.12;
      _q.setFromAxisAngle(_up, this.t * 0.5 + i);
      this.lotus.setMatrixAt(i, _m.compose(_v.set(o.x, o.y + 0.08, o.z), _q, _s.setScalar(Math.max(0.001, 1.3 * show))));
      this.core.setMatrixAt(i, _m.compose(_v.set(o.x, o.y + 0.78 + bob, o.z), _q, _s.setScalar(Math.max(0.001, grow * show))));
      this.halo.set(i, o.x, o.y + 0.78 + bob, o.z, show, (2.6 + Math.sin(this.t * 3 + i) * 0.25) * grow);
    });
    this.lotus.instanceMatrix.needsUpdate = true; this.core.instanceMatrix.needsUpdate = true;
    this.halo.flush(scale);
    return got;
  }
  set visible(v) { this.lotus.visible = this.core.visible = this.halo.points.visible = v; }
}
const _up = new THREE.Vector3(0, 1, 0);

/** 貪心鬼：芥末色、底部圓鼓鼓的身形，張著大嘴、兩隻長手往前抓，身邊繞著搶來的光 */
function makeGreed() {
  const g = new THREE.Group(), rig = new THREE.Group(); g.add(rig);
  const body = std('#7a6c2c', { r: 0.55, e: '#2a2208' });
  rig.add(mesh([
    lathe([[0.02, 0], [0.32, 0.12], [0.56, 0.38], [0.6, 0.62], [0.48, 0.92], [0.3, 1.12], [0.14, 1.24], [0, 1.28]]),
    T(new THREE.CapsuleGeometry(0.075, 0.5, 4, 10), [-0.42, 0.72, 0.36], [1.35, 0, -0.35]),
    T(new THREE.CapsuleGeometry(0.075, 0.5, 4, 10), [0.42, 0.72, 0.36], [1.35, 0, 0.35]),
  ], body, true));
  const eyes = mesh([
    T(new THREE.SphereGeometry(0.085, 12, 8), [-0.17, 0.98, 0.42], [0, 0, 0], [1, 1.1, 0.6]),
    T(new THREE.SphereGeometry(0.085, 12, 8), [0.17, 0.98, 0.42], [0, 0, 0], [1, 1.1, 0.6]),
  ], std('#ffe27a', { e: '#ffc21f', ei: 2.0 }));
  const mouth = mesh([T(new THREE.SphereGeometry(0.19, 16, 10), [0, 0.7, 0.47], [0, 0, 0], [1.25, 0.55, 0.35])], std('#2a1208', { r: 0.9 }));
  const teeth = mesh([-0.12, -0.04, 0.04, 0.12].map((x) => T(new THREE.ConeGeometry(0.028, 0.06, 6), [x, 0.77, 0.53], [Math.PI, 0, 0])), std('#f3ecd8'));
  const loot = new THREE.Group(); rig.add(loot);
  for (let i = 0; i < 6; i++) { const m = new THREE.Mesh(new THREE.SphereGeometry(0.075, 10, 8), new THREE.MeshBasicMaterial({ color: '#ffd77a', toneMapped: false })); m.visible = false; loot.add(m); }
  const face = happyFace({ y: 0.96, spread: 0.17, ze: 0.45, zm: 0.54, zb: 0.46 });
  rig.add(eyes, mouth, teeth, ...face);
  return { g, rig, body, hide: [eyes, mouth, teeth], show: face, loot, tagY: 1.45 };
}

/** 嫉妒鬼：暗綠色、細瘦尖頂的身形，頭上幾根尖刺，斜眼瞪人；出現、消失時會閃一下 */
function makeEnvy() {
  const g = new THREE.Group(), rig = new THREE.Group(); g.add(rig);
  const body = std('#2f5e50', { r: 0.45, e: '#0c2e24' });
  rig.add(mesh([
    lathe([[0.02, 0], [0.14, 0.15], [0.3, 0.45], [0.36, 0.8], [0.32, 1.1], [0.2, 1.38], [0.06, 1.62], [0, 1.7]]),
    T(new THREE.ConeGeometry(0.07, 0.3, 8), [-0.17, 1.42, 0], [0, 0, 0.6]),
    T(new THREE.ConeGeometry(0.07, 0.3, 8), [0.17, 1.42, 0], [0, 0, -0.6]),
    T(new THREE.CapsuleGeometry(0.05, 0.36, 4, 8), [-0.33, 0.82, 0.06], [0.2, 0, 0.5]),
    T(new THREE.CapsuleGeometry(0.05, 0.36, 4, 8), [0.33, 0.82, 0.06], [0.2, 0, -0.5]),
  ], body, true));
  const eyes = mesh([
    T(new THREE.SphereGeometry(0.07, 12, 8), [-0.13, 1.16, 0.27], [0, 0, -0.25], [1.25, 0.45, 0.55]),
    T(new THREE.SphereGeometry(0.07, 12, 8), [0.13, 1.16, 0.27], [0, 0, 0.25], [1.25, 0.45, 0.55]),
  ], std('#b8ff8a', { e: '#6cff3a', ei: 2.2 }));
  const brows = mesh([
    T(new THREE.BoxGeometry(0.14, 0.03, 0.03), [-0.13, 1.24, 0.28], [0, 0, -0.4]),
    T(new THREE.BoxGeometry(0.14, 0.03, 0.03), [0.13, 1.24, 0.28], [0, 0, 0.4]),
  ], std('#0d241c'));
  const mouth = mesh([T(new THREE.TorusGeometry(0.06, 0.013, 6, 12, Math.PI), [0, 1.0, 0.31], [0, 0, 0])], std('#0d241c'));
  const face = happyFace({ y: 1.14, spread: 0.12, ze: 0.28, zm: 0.33, zb: 0.27 });
  rig.add(eyes, brows, mouth, ...face);
  return { g, rig, body, hide: [eyes, brows, mouth], show: face, tagY: 1.95 };
}

/**
 * kind：chase（自私鬼：主動追）、slow（懈怠鬼：慢慢跟、讓人變慢）、greed（貪心鬼：搶光球、搶光）、envy（嫉妒鬼：瞬移、干擾）
 * 速度以旅人走路 4.3 公尺／秒為準：自私鬼、貪心鬼追得上一點但甩得掉，懈怠鬼很慢
 */
export const GHOSTS = {
  selfish: { name: '自私鬼', tamedName: '歡喜精靈', kind: 'chase', make: makeSelfish, notice: 11, chase: 3.35, wander: 1.2, catchR: 1.15, flee: 2.85, wisp: '#2a1838', tamedColor: '#fff3cf', tamedEm: '#ffcf73' },
  lazy: { name: '懈怠鬼', tamedName: '精進精靈', kind: 'slow', make: makeLazy, notice: 9, chase: 2.0, wander: 0.7, catchR: 1.3, flee: 2.4, slowR: 7, wisp: '#8a93a6', tamedColor: '#e3fff3', tamedEm: '#7fe8c0' },
  greed: { name: '貪心鬼', tamedName: '知足精靈', kind: 'greed', make: makeGreed, notice: 8, chase: 3.0, wander: 1.0, catchR: 1.1, flee: 0, wisp: '#5a4a14', tamedColor: '#ffe9dc', tamedEm: '#ffb48a' },
  envy: { name: '嫉妒鬼', tamedName: '隨喜精靈', kind: 'envy', make: makeEnvy, notice: 0, chase: 1.6, wander: 0.8, catchR: 0, flee: 0, wisp: '#1f4a3a', tamedColor: '#f2ffe2', tamedEm: '#b6f07a' },
};

export class MindTrial {
  /**
   * homes：{ id: [x, z, r] }（心魔遊蕩的範圍；嫉妒鬼沒有固定的家）；orbs：[[x, y, z], ...]；
   * ground(x, z)：地面高度；safe(x, z)：玩家在這裡不會被追（站點前、對話對象旁）；
   * blocked(x, z)：心魔不能進去的地方（安全區、建築、海上）；soft(x, z)：感化後的小精靈不能去的地方（建築、海上）
   */
  constructor(scene, { homes, orbs, ground, safe, blocked, soft }) {
    Object.assign(this, { ground, safe, blocked, soft });
    this.orbs = new Orbs(scene, orbs);
    this.debuff = 0; this.time = 0; this.picks = [];
    this.envyK = 0;                         // 嫉妒鬼的干擾程度（0～1）
    this.shown = true;
    this.ghosts = Object.entries(GHOSTS).map(([id, d]) => {
      const vis = d.make();
      scene.add(vis.g);
      const blob = new THREE.Mesh(new THREE.CircleGeometry(0.45, 20).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#120a1a', transparent: true, opacity: 0.26, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
      blob.position.y = 0.05; vis.g.add(blob);
      const [hx, hz, hr] = homes[id] || [0, 0, 6];
      const gh = { id, ...d, vis, blob, wisp: new Wisp(scene, d.wisp, false), home: { x: hx, z: hz, r: hr }, pos: new THREE.Vector2(hx, hz), target: new THREE.Vector2(hx, hz), mode: 'wander', cool: 0, tamed: false, face: R() * 6.28, clock: R() * 9, happy: 0, fade: 1, stolen: 0, orb: -1 };
      if (d.kind === 'envy') {
        gh.mode = 'hidden'; gh.fade = 0; gh.cool = 30 + R() * 20;
        vis.g.traverse((o) => { if (o.material) { o.material = o.material.clone(); o.material.transparent = true; } });
      } else { this.#newTarget(gh); gh.pos.copy(gh.target); this.#newTarget(gh); }
      return gh;
    });
  }

  get(id) { return this.ghosts.find((g) => g.id === id); }
  get tamedCount() { return this.ghosts.filter((g) => g.tamed).length; }
  /** 最近 60 秒內撿了幾顆光球（貪心鬼聞得到） */
  get recentPicks() { return this.picks.filter((t) => this.time - t < 60).length; }

  /** 感化：心魔變成友善的小精靈（instant：重新整理後直接還原，不跳舞） */
  tame(id, instant = false) {
    const gh = this.get(id); if (!gh || gh.tamed) return;
    gh.tamed = true; gh.mode = 'tamed'; gh.happy = instant ? 0 : 4.5; gh.fade = 1;
    if (gh.kind === 'envy') { gh.home.x = gh.pos.x; gh.home.z = gh.pos.y; gh.home.r = 6; if (instant) { gh.pos.set(gh.home.x, gh.home.z); } }
    const b = gh.vis.body;
    b.color.set(gh.tamedColor); b.emissive.set(gh.tamedEm); b.emissiveIntensity = 0.5;
    gh.vis.hide.forEach((m) => { m.visible = false; });
    gh.vis.show.forEach((m) => { m.visible = true; });
    if (gh.vis.loot) gh.vis.loot.children.forEach((m) => { m.visible = false; });
    gh.blob.material.color.set('#6b5a2a'); gh.blob.material.opacity = 0.16;
    gh.wisp.setStyle('#ffe7a6', true);
  }
  /** 嫉妒鬼還沒出現、被感化前要放在哪裡（重新整理後還原用） */
  placeEnvy(x, z) { const gh = this.get('envy'); gh.home.x = x; gh.home.z = z; gh.pos.set(x, z); }

  #free(gh, x, z) { return !(gh.tamed ? this.soft(x, z) : this.blocked(x, z)); }
  /** 往目標前進一步；正前方被擋住時試著往兩邊偏（繞開安全區、建築與海邊）。回傳 true 表示到了或卡住，要換目標 */
  #step(gh, tx, tz, speed, dt) {
    const dx = tx - gh.pos.x, dz = tz - gh.pos.y, d = Math.hypot(dx, dz);
    if (d < 0.05) return true;
    const s = Math.min(d, speed * dt), ux = dx / d, uz = dz / d;
    for (const a of [0, 0.5, -0.5, 1.0, -1.0, 1.5, -1.5]) {
      const c = Math.cos(a), sn = Math.sin(a), vx = ux * c - uz * sn, vz = ux * sn + uz * c;
      const nx = gh.pos.x + vx * s, nz = gh.pos.y + vz * s;
      if (this.#free(gh, nx, nz)) { gh.pos.set(nx, nz); gh.face = Math.atan2(vx, vz); return d - s < 0.05; }
    }
    return true;
  }
  #newTarget(gh) {
    for (let k = 0; k < 16; k++) {
      const a = R() * 6.283, r = Math.sqrt(R()) * gh.home.r, x = gh.home.x + Math.cos(a) * r, z = gh.home.z + Math.sin(a) * r;
      if (this.#free(gh, x, z)) { gh.target.set(x, z); return; }
    }
    gh.target.copy(gh.pos);
  }
  #wander(gh, dt, speed) { if (this.#step(gh, gh.target.x, gh.target.y, speed, dt)) this.#newTarget(gh); }
  #retreat(gh, p, d, cool) {
    gh.mode = 'cool'; gh.cool = cool;
    const l = d || 1;
    gh.target.set(gh.pos.x + (gh.pos.x - p.x) / l * 8, gh.pos.y + (gh.pos.y - p.y) / l * 8);
  }
  #coolDown(gh, dt) { if (gh.mode === 'cool') { gh.cool -= dt; if (gh.cool <= 0) gh.mode = 'wander'; } }

  /**
   * 每一幀更新。p：玩家位置（x, z）。
   * opt：{ paused（面板、對話開著）, canChase（可以追人）, canGreet, shield（善念之光剩下的秒數）, scale（光點大小換算）,
   *        fwd（鏡頭往前的方向，嫉妒鬼會出現在看得到的地方）, gentle：{ greed（做過幾件布施的好事）, envy（是否學會讚美別人）} }
   * 回傳這一幀發生的事：{ type: 'warn' | 'catch' | 'beg' | 'steal' | 'escape' | 'tame' | 'orb' | 'eat' | 'appear' | 'vanish', id?, i? }
   */
  update(dt, p, opt) {
    const ev = [];
    if (!this.shown) return ev;
    const live = !opt.paused;
    if (live) { this.time += dt; if (this.debuff > 0) this.debuff = Math.max(0, this.debuff - dt); }
    const got = this.orbs.update(dt, p.x, p.y, live, opt.scale);
    if (got >= 0) { ev.push({ type: 'orb', i: got }); this.picks.push(this.time); }
    const shield = opt.shield > 0;
    this.envyK = 0;
    for (const gh of this.ghosts) {
      gh.clock += dt;
      const d = Math.hypot(p.x - gh.pos.x, p.y - gh.pos.y);
      if (live) {
        if (gh.tamed) this.#tamedTick(gh, p, d, dt, opt);
        else if (gh.kind === 'envy') this.#envyTick(gh, p, d, dt, opt, ev);
        else if (gh.kind === 'greed') this.#greedTick(gh, p, d, dt, opt, ev);
        else this.#chaseTick(gh, p, d, dt, opt, ev);
      }
      this.#look(gh, dt, opt.scale);
    }
    return ev;
  }

  /** 小精靈：剛被感化時繞著你跳一圈；之後在家附近飄，你經過時會飛過來打招呼 */
  #tamedTick(gh, p, d, dt, opt) {
    if (gh.happy > 0) { gh.happy -= dt; const a = gh.clock * 1.6; gh.target.set(p.x + Math.sin(a) * 1.6, p.y + Math.cos(a) * 1.6); this.#step(gh, gh.target.x, gh.target.y, 3.2, dt); }
    else if (d < 7 && opt.canGreet) { const k = 2.2 / Math.max(d, 0.01); this.#step(gh, p.x + (gh.pos.x - p.x) * k, p.y + (gh.pos.y - p.y) * k, 1.8, dt); }
    else this.#wander(gh, dt, 0.9);
    if (d < 7) gh.face = Math.atan2(p.x - gh.pos.x, p.y - gh.pos.y);
  }

  /** 自私鬼、懈怠鬼：發現你就追；你拿著善念之光時怕得躲開，追上碰到就感化 */
  #chaseTick(gh, p, d, dt, opt, ev) {
    const shield = opt.shield > 0;
    if (!opt.canChase) {
      if (gh.mode === 'chase' || gh.mode === 'flee') { gh.mode = 'cool'; gh.cool = 4; }
      this.#coolDown(gh, dt); this.#wander(gh, dt, gh.wander);
    } else if (shield && d < 1.75) {
      this.tame(gh.id); ev.push({ type: 'tame', id: gh.id });
    } else if (shield && d < 10) {
      this.#step(gh, gh.pos.x + (gh.pos.x - p.x) / d * 3, gh.pos.y + (gh.pos.y - p.y) / d * 3, gh.flee, dt);
      gh.mode = 'flee';
    } else if (gh.mode === 'chase') {
      if (shield || d > gh.notice + 7 || this.safe(p.x, p.y)) { gh.mode = 'cool'; gh.cool = 6; if (!shield) ev.push({ type: 'escape', id: gh.id }); }
      else if (d < gh.catchR) {
        ev.push({ type: 'catch', id: gh.id });
        this.#retreat(gh, p, d, 18);                                              // 抓到之後退開，一段時間內不再追
        if (gh.id === 'lazy') this.debuff = 3;
      } else this.#step(gh, p.x, p.y, gh.chase, dt);
    } else {
      if (gh.mode === 'flee') gh.mode = 'wander';
      this.#coolDown(gh, dt);
      this.#wander(gh, dt, gh.mode === 'cool' ? 1.9 : gh.wander);
      if (gh.mode === 'wander' && !shield && d < gh.notice && !this.safe(p.x, p.y)) { gh.mode = 'chase'; ev.push({ type: 'warn', id: gh.id }); }
    }
  }

  /**
   * 貪心鬼：沒事就去搶吃島上的善念光球；你最近撿了越多光、身上正發著光，它就從越遠的地方盯上你。
   * 追上你時：你身上有光，就把光搶走；沒有光，就搶走一點福德。做過布施的好事（阿婆、阿姨），它比較不貪。
   */
  #greedTick(gh, p, d, dt, opt, ev) {
    const shield = opt.shield > 0, gentle = opt.gentle?.greed || 0;
    const reach = Math.max(4, gh.notice + 2.5 * Math.min(4, this.recentPicks) + (shield ? 6 : 0) - 1.5 * gentle);
    if (!opt.canChase) {
      if (gh.mode === 'chase') { gh.mode = 'cool'; gh.cool = 4; }
      this.#coolDown(gh, dt); this.#wander(gh, dt, gh.wander); return;
    }
    // 伸手討光：你身上有光時，它停在你面前伸出手，等你決定要不要布施（2.5 秒）；不給，它就撲上來搶
    if (gh.mode === 'beg') {
      gh.face = Math.atan2(p.x - gh.pos.x, p.y - gh.pos.y);
      gh.cool -= dt;
      if (!shield || d > 4.2 || this.safe(p.x, p.y)) { gh.mode = shield ? 'chase' : 'wander'; return; }
      if (d > 1.9) this.#step(gh, p.x, p.y, 1.2, dt);
      if (gh.cool <= 0) { ev.push({ type: 'steal', id: gh.id }); gh.stolen = Math.min(6, gh.stolen + 1); this.#retreat(gh, p, d, 16); }
      return;
    }
    if (gh.mode === 'chase') {
      if (d > reach + 8 || this.safe(p.x, p.y)) { gh.mode = 'cool'; gh.cool = 6; ev.push({ type: 'escape', id: gh.id }); return; }
      if (shield && d < 2.6) { gh.mode = 'beg'; gh.cool = 2.5; ev.push({ type: 'beg', id: gh.id }); return; }
      if (d < gh.catchR) {
        ev.push({ type: 'catch', id: gh.id });
        gh.stolen = Math.min(6, gh.stolen + 1);
        this.#retreat(gh, p, d, 16);
        return;
      }
      this.#step(gh, p.x, p.y, shield ? gh.chase + 0.3 : gh.chase, dt);
      return;
    }
    this.#coolDown(gh, dt);
    if (gh.mode === 'wander' && d < reach && !this.safe(p.x, p.y)) { gh.mode = 'chase'; ev.push({ type: 'warn', id: gh.id }); return; }
    // 搶光球：家附近 14 公尺內還亮著的光球
    if (gh.mode !== 'cool') {
      if (gh.orb < 0 || !this.orbs.list[gh.orb].on) gh.orb = this.orbs.nearest(gh.home.x, gh.home.z, 14);
      if (gh.orb >= 0) {
        const o = this.orbs.list[gh.orb];
        this.#step(gh, o.x, o.z, 1.8, dt);
        gh.mode = 'wander';
        if (Math.hypot(o.x - gh.pos.x, o.z - gh.pos.y) < 0.7) { this.orbs.eat(gh.orb); ev.push({ type: 'eat', id: gh.id, i: gh.orb }); gh.stolen = Math.min(6, gh.stolen + 1); gh.orb = -1; }
        return;
      }
    }
    this.#wander(gh, dt, gh.mode === 'cool' ? 1.9 : gh.wander);
  }

  /**
   * 嫉妒鬼：平常躲著。冷不防就瞬移到你前方幾公尺的地方（看得到的地方），在你身邊繞著干擾你 8 秒，再消失；
   * 你拿著善念之光，它會一下子就逃走。學會讚美別人（小安那一站）之後，干擾減半。
   */
  #envyTick(gh, p, d, dt, opt, ev) {
    const shield = opt.shield > 0;
    if (gh.mode === 'hidden') {
      gh.fade = Math.max(0, gh.fade - dt * 3);
      if (opt.canChase && !shield && !this.safe(p.x, p.y)) gh.cool -= dt;
      if (gh.cool > 0) return;
      const f = opt.fwd || { x: 0, y: -1 };
      for (let k = 0; k < 14; k++) {
        const a = Math.atan2(f.x, f.y) + (R() - 0.5) * 1.6, r = 4.5 + R() * 1.8, x = p.x + Math.sin(a) * r, z = p.y + Math.cos(a) * r;
        if (this.blocked(x, z)) continue;
        gh.pos.set(x, z); gh.mode = 'near'; gh.cool = 8; gh.face = Math.atan2(p.x - x, p.y - z);
        ev.push({ type: 'appear', id: gh.id });
        return;
      }
      gh.cool = 3;                                                     // 找不到地方出現，等一下再試
      return;
    }
    // 出現中：慢慢繞著你飄，保持兩公尺多的距離
    gh.fade = Math.min(1, gh.fade + dt * 2.5);
    gh.cool -= dt;
    if (gh.cool <= 0 || shield || !opt.canChase || this.safe(p.x, p.y)) {
      gh.mode = 'hidden'; gh.cool = 45 + R() * 25;
      ev.push({ type: 'vanish', id: gh.id });
      return;
    }
    const a = Math.atan2(gh.pos.x - p.x, gh.pos.y - p.y) + dt * 0.5;
    this.#step(gh, p.x + Math.sin(a) * 2.4, p.y + Math.cos(a) * 2.4, gh.chase, dt);
    gh.face = Math.atan2(p.x - gh.pos.x, p.y - gh.pos.y);
    this.envyK = Math.max(this.envyK, THREE.MathUtils.clamp((7 - d) / 4.5, 0, 1) * gh.fade * (opt.gentle?.envy ? 0.5 : 1));
  }

  /** 外觀：飄浮、搖晃、轉向移動方向，身後拖著一縷氣息 */
  #look(gh, dt, scale) {
    const v = gh.vis, gy = Math.max(0, this.ground(gh.pos.x, gh.pos.y));
    const seen = this.shown && (gh.kind !== 'envy' || gh.tamed || gh.fade > 0.01);
    v.g.visible = seen; gh.wisp.visible = seen;
    if (!seen) return;
    v.g.position.set(gh.pos.x, gy, gh.pos.y);
    let a = gh.face - v.g.rotation.y; a = Math.atan2(Math.sin(a), Math.cos(a)); v.g.rotation.y += a * Math.min(1, dt * 4);
    const sleepy = gh.id === 'lazy' && !gh.tamed;
    v.rig.position.y = 0.55 + Math.sin(gh.clock * (sleepy ? 1.1 : 2.2)) * (sleepy ? 0.06 : 0.12)
      + (gh.tamed ? 0.3 + Math.abs(Math.sin(gh.clock * 5)) * (gh.happy > 0 ? 0.4 : 0.08) : 0);
    v.rig.rotation.z = sleepy ? -0.18 + Math.sin(gh.clock * 0.9) * 0.06 : Math.sin(gh.clock * 1.7) * 0.08;
    const sc = gh.tamed ? 0.8 : gh.mode === 'chase' || gh.mode === 'beg' ? 1.3 : 1.2;          // 心魔比人大一點，追人時再脹大一些
    if (gh.kind === 'greed' && !gh.tamed) v.rig.rotation.x += ((gh.mode === 'beg' ? 0.3 + Math.sin(gh.clock * 8) * 0.05 : 0) - v.rig.rotation.x) * Math.min(1, dt * 5);
    v.rig.scale.setScalar(v.rig.scale.x + (sc - v.rig.scale.x) * Math.min(1, dt * 5));
    if (v.zz?.visible) { const k = (gh.clock * 0.5) % 1; v.zz.position.y = 1.35 + k * 0.5; v.zz.material.opacity = Math.sin(k * Math.PI) * 0.9; }
    // 貪心鬼身邊繞著搶來的光
    if (v.loot && !gh.tamed) v.loot.children.forEach((m, i) => { m.visible = i < gh.stolen; const ang = gh.clock * 1.8 + i * 1.05; m.position.set(Math.cos(ang) * 0.75, 0.7 + Math.sin(gh.clock * 2 + i) * 0.15, Math.sin(ang) * 0.75); });
    // 嫉妒鬼出現、消失時一閃一閃
    if (gh.kind === 'envy' && !gh.tamed) {
      const o = gh.fade * (gh.mode === 'near' ? 0.82 + Math.sin(gh.clock * 23) * 0.12 : 1);
      v.g.traverse((m) => { if (m.material && m !== gh.blob) m.material.opacity = o; });
    }
    gh.blob.scale.setScalar(gh.tamed ? 0.6 : 1);
    gh.wisp.update(dt, gh.pos.x, gy + v.rig.position.y + 0.4 * v.rig.scale.x, gh.pos.y,
      gh.tamed ? 8 : gh.mode === 'chase' || gh.mode === 'near' ? 18 : 9, scale, gh.tamed ? 0.85 : gh.id === 'selfish' ? 0.55 : 0.4, gh.tamed ? 0.35 : 0.8);
  }

  /** 腳步：懈怠鬼靠近時越來越沉重、被抓住懶洋洋三秒；嫉妒鬼干擾時也走不快。善念之光可以驅散 */
  speedFactor(p, shield, active) {
    if (!this.shown || shield > 0) return 1;
    let f = 1;
    const lz = this.get('lazy');
    if (active && !lz.tamed) {
      const d = Math.hypot(p.x - lz.pos.x, p.y - lz.pos.y);
      if (d < lz.slowR) f = 0.5 + 0.5 * THREE.MathUtils.smoothstep(d, 1.5, lz.slowR);
    }
    if (this.debuff > 0) f *= 0.45;
    f *= 1 - 0.3 * this.envyK;
    return Math.max(0.35, f);                  // 好幾隻一起來也不會慢到走不動
  }

  /** 正在追你、離你最近的心魔，以及威脅程度（0～1）：用來畫畫面四周的氣息與警告 */
  threat(p) {
    let gh = null, k = 0;
    for (const g of this.ghosts) {
      if (g.tamed || (g.mode !== 'chase' && g.mode !== 'beg')) continue;
      const kk = 1 - THREE.MathUtils.clamp((Math.hypot(p.x - g.pos.x, p.y - g.pos.y) - 1.2) / 12, 0, 1);
      if (kk > k) { k = kk; gh = g; }
    }
    return { gh, k };
  }

  /** 走近時可以做的事：把善念之光布施給貪心鬼、對嫉妒鬼說隨喜的話（回傳心魔編號，沒有就 null） */
  offer(p, shield) {
    const gr = this.get('greed'), ev = this.get('envy');
    if (!gr.tamed && shield > 0 && (gr.mode === 'beg' || Math.hypot(p.x - gr.pos.x, p.y - gr.pos.y) < 2.8)) return 'greed';
    if (!ev.tamed && ev.mode === 'near' && ev.fade > 0.5 && Math.hypot(p.x - ev.pos.x, p.y - ev.pos.y) < 3.6) return 'envy';
    return null;
  }
  /** 嫉妒鬼在對話時不要跑掉；對話關掉就消失 */
  hold(id, sec) { const gh = this.get(id); if (gh) gh.cool = Math.max(gh.cool, sec); }
  dismiss(id) { const gh = this.get(id); if (gh && !gh.tamed && gh.kind === 'envy') { gh.mode = 'hidden'; gh.cool = 45 + R() * 25; } }

  /** 心魔名牌要放的位置（頭頂上方） */
  tagPos(gh, out) { const v = gh.vis; return out.set(gh.pos.x, v.g.position.y + v.rig.position.y + v.tagY * v.rig.scale.y, gh.pos.y); }
  /** 這隻心魔現在看得見嗎（嫉妒鬼躲起來時看不見） */
  seen(gh) { return this.shown && gh.vis.g.visible; }

  set visible(v) {
    this.shown = v;
    for (const gh of this.ghosts) { gh.vis.g.visible = v && (gh.kind !== 'envy' || gh.tamed || gh.fade > 0.01); gh.wisp.visible = gh.vis.g.visible; }
    this.orbs.visible = v;
  }
}

/** 善念之光：撿到光球後，人物腳下一圈金色光環、身上一團柔光，還有往上飄的光點 */
export function makeAura(scene) {
  const g = new THREE.Group();
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.7, 0.95, 48).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#ffd77a', transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4, toneMapped: false }));
  ring.position.y = 0.07; g.add(ring);
  scene.add(g);
  const glow = new Dots(scene, 1, '#ffe3a0', true);
  const wisp = new Wisp(scene, '#ffe7a6', true);
  let k = 0, clock = 0;
  return {
    update(dt, x, y, z, on, scale) {
      clock += dt;
      k += ((on ? 1 : 0) - k) * Math.min(1, dt * 4);
      g.position.set(x, y, z); g.visible = k > 0.01;
      ring.material.opacity = k * (0.6 + Math.sin(clock * 5) * 0.15);
      ring.scale.setScalar(1 + Math.sin(clock * 3) * 0.06);
      glow.set(0, x, y + 1.0, z, k * 0.45, 3.0); glow.flush(scale);
      wisp.update(dt, x, y + 0.5, z, on ? 14 : 0, scale, 0.9, 0.35);
    },
  };
}

/** 光明之境：四大心魔都感化之後，整座島的上空飄著金色的光點 */
export function makeMotes(scene, n = 160) {
  const dots = new Dots(scene, n, '#ffe6a6', true);
  const seeds = Array.from({ length: n }, () => [R() * 6.283, Math.sqrt(R()) * 34, 1 + R() * 7, R() * 6.283, 0.25 + R() * 0.35]);
  let clock = 0;
  return {
    update(dt, k, scale) {
      clock += dt;
      dots.points.visible = k > 0.01;
      if (!dots.points.visible) return;
      seeds.forEach(([a, r, h, ph, sz], i) => {
        const aa = a + clock * 0.02, y = h + ((clock * 0.25 + ph) % 3);
        dots.set(i, Math.cos(aa) * r, y, Math.sin(aa) * r, k * (0.5 + 0.5 * Math.sin(clock * 2 + ph)) * Math.min(1, (3 - ((clock * 0.25 + ph) % 3)) * 1.5), sz);
      });
      dots.flush(scale);
    },
  };
}
