import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/**
 * 心魔試煉：島上兩隻心魔，代表兩種需要看見、需要轉化的習氣。
 *   自私鬼：只想到自己，兩手緊緊抱著一袋東西。發現你就追上來；被追上，福德減少。
 *   懈怠鬼：提不起勁，戴著睡帽打瞌睡。靠近它，腳步會越來越沉重；被它抓住，智慧減少，還會懶洋洋好幾秒。
 * 島上散布著「善念光球」：撿起來，善念之光會守護你一段時間，心魔怕光、會躲開；
 * 這時追上去碰到它，就能把它感化成友善的小精靈（自私→布施的歡喜精靈，懈怠→精進精靈）。
 * 修行不是消滅煩惱，而是看見它、轉化它。
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

export const GHOSTS = {
  selfish: { name: '自私鬼', tamedName: '歡喜精靈', make: makeSelfish, notice: 11, chase: 3.9, wander: 1.4, catchR: 1.15, flee: 3.3, wisp: '#2a1838', tamedColor: '#fff3cf', tamedEm: '#ffcf73' },
  lazy: { name: '懈怠鬼', tamedName: '精進精靈', make: makeLazy, notice: 9, chase: 2.3, wander: 0.8, catchR: 1.3, flee: 2.8, slowR: 7, wisp: '#8a93a6', tamedColor: '#e3fff3', tamedEm: '#7fe8c0' },
};

export class MindTrial {
  /**
   * homes：{ selfish: [x, z, r], lazy: [x, z, r] }（心魔遊蕩的範圍）；orbs：[[x, y, z], ...]；
   * ground(x, z)：地面高度；safe(x, z)：玩家在這裡不會被追（站點前、對話對象旁）；
   * blocked(x, z)：心魔不能進去的地方（安全區、建築、海上）；soft(x, z)：感化後的小精靈不能去的地方（建築、海上）
   */
  constructor(scene, { homes, orbs, ground, safe, blocked, soft }) {
    Object.assign(this, { ground, safe, blocked, soft });
    this.orbs = new Orbs(scene, orbs);
    this.debuff = 0;
    this.shown = true;
    this.ghosts = Object.entries(GHOSTS).map(([id, d]) => {
      const vis = d.make();
      scene.add(vis.g);
      const blob = new THREE.Mesh(new THREE.CircleGeometry(0.45, 20).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#120a1a', transparent: true, opacity: 0.26, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
      blob.position.y = 0.05; vis.g.add(blob);
      const [hx, hz, hr] = homes[id];
      const gh = { id, ...d, vis, blob, wisp: new Wisp(scene, d.wisp, false), home: { x: hx, z: hz, r: hr }, pos: new THREE.Vector2(hx, hz), target: new THREE.Vector2(hx, hz), mode: 'wander', cool: 0, tamed: false, face: R() * 6.28, clock: R() * 9, happy: 0 };
      this.#newTarget(gh); gh.pos.copy(gh.target); this.#newTarget(gh);
      return gh;
    });
  }

  get(id) { return this.ghosts.find((g) => g.id === id); }
  get tamedCount() { return this.ghosts.filter((g) => g.tamed).length; }

  /** 感化：心魔變成友善的小精靈（instant：重新整理後直接還原，不跳舞） */
  tame(id, instant = false) {
    const gh = this.get(id); if (!gh || gh.tamed) return;
    gh.tamed = true; gh.mode = 'tamed'; gh.happy = instant ? 0 : 4.5;
    const b = gh.vis.body;
    b.color.set(gh.tamedColor); b.emissive.set(gh.tamedEm); b.emissiveIntensity = 0.5;
    gh.vis.hide.forEach((m) => { m.visible = false; });
    gh.vis.show.forEach((m) => { m.visible = true; });
    gh.blob.material.color.set('#6b5a2a'); gh.blob.material.opacity = 0.16;
    gh.wisp.setStyle('#ffe7a6', true);
  }

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

  /**
   * 每一幀更新。p：玩家位置（x, z）。
   * opt：{ paused（面板、對話開著）, canChase（可以追人）, shield（善念之光剩下的秒數）, scale（光點大小換算） }
   * 回傳這一幀發生的事：{ type: 'warn' | 'catch' | 'escape' | 'tame' | 'orb', id?, i? }
   */
  update(dt, p, opt) {
    const ev = [];
    if (!this.shown) return ev;
    const live = !opt.paused;
    if (live && this.debuff > 0) this.debuff = Math.max(0, this.debuff - dt);
    const got = this.orbs.update(dt, p.x, p.y, live, opt.scale);
    if (got >= 0) ev.push({ type: 'orb', i: got });
    const shield = opt.shield > 0;
    for (const gh of this.ghosts) {
      gh.clock += dt;
      const d = Math.hypot(p.x - gh.pos.x, p.y - gh.pos.y);
      if (live) {
        if (gh.tamed) {
          // 小精靈：剛被感化時繞著你跳一圈；之後在家附近飄，你經過時會飛過來打招呼
          if (gh.happy > 0) { gh.happy -= dt; const a = gh.clock * 1.6; gh.target.set(p.x + Math.sin(a) * 1.6, p.y + Math.cos(a) * 1.6); this.#step(gh, gh.target.x, gh.target.y, 3.2, dt); }
          else if (d < 7 && opt.canGreet) { const k = 2.2 / Math.max(d, 0.01); this.#step(gh, p.x + (gh.pos.x - p.x) * k, p.y + (gh.pos.y - p.y) * k, 1.8, dt); }
          else this.#wander(gh, dt, 0.9);
          if (d < 7) gh.face = Math.atan2(p.x - gh.pos.x, p.y - gh.pos.y);
        } else if (!opt.canChase) {
          if (gh.mode === 'chase' || gh.mode === 'flee') { gh.mode = 'cool'; gh.cool = 4; }
          if (gh.mode === 'cool') { gh.cool -= dt; if (gh.cool <= 0) gh.mode = 'wander'; }
          this.#wander(gh, dt, gh.wander);
        } else if (shield && d < 1.75) {
          this.tame(gh.id); ev.push({ type: 'tame', id: gh.id });
        } else if (shield && d < 10) {
          // 怕光：往遠離你的方向躲（還是跑得比你慢，追得上）
          this.#step(gh, gh.pos.x + (gh.pos.x - p.x) / d * 3, gh.pos.y + (gh.pos.y - p.y) / d * 3, gh.flee, dt);
          gh.mode = 'flee';
        } else if (gh.mode === 'chase') {
          if (shield || d > gh.notice + 7 || this.safe(p.x, p.y)) { gh.mode = 'cool'; gh.cool = 6; if (!shield) ev.push({ type: 'escape', id: gh.id }); }
          else if (d < gh.catchR) {
            ev.push({ type: 'catch', id: gh.id });
            gh.mode = 'cool'; gh.cool = 18;                                        // 抓到之後退開，一段時間內不再追
            const l = d || 1;
            gh.target.set(gh.pos.x + (gh.pos.x - p.x) / l * 8, gh.pos.y + (gh.pos.y - p.y) / l * 8);
            if (gh.id === 'lazy') this.debuff = 3;
          } else this.#step(gh, p.x, p.y, gh.chase, dt);
        } else {
          if (gh.mode === 'flee') gh.mode = 'wander';
          if (gh.mode === 'cool') { gh.cool -= dt; if (gh.cool <= 0) gh.mode = 'wander'; }
          this.#wander(gh, dt, gh.mode === 'cool' ? 2.2 : gh.wander);
          if (gh.mode === 'wander' && !shield && d < gh.notice && !this.safe(p.x, p.y)) { gh.mode = 'chase'; ev.push({ type: 'warn', id: gh.id }); }
        }
      }
      // 外觀：飄浮、搖晃、轉向移動方向，身後拖著一縷氣息
      const v = gh.vis, gy = Math.max(0, this.ground(gh.pos.x, gh.pos.y));
      v.g.position.set(gh.pos.x, gy, gh.pos.y);
      let a = gh.face - v.g.rotation.y; a = Math.atan2(Math.sin(a), Math.cos(a)); v.g.rotation.y += a * Math.min(1, dt * 4);
      const sleepy = gh.id === 'lazy' && !gh.tamed;
      v.rig.position.y = 0.55 + Math.sin(gh.clock * (sleepy ? 1.1 : 2.2)) * (sleepy ? 0.06 : 0.12)
        + (gh.tamed ? 0.3 + Math.abs(Math.sin(gh.clock * 5)) * (gh.happy > 0 ? 0.4 : 0.08) : 0);
      v.rig.rotation.z = sleepy ? -0.18 + Math.sin(gh.clock * 0.9) * 0.06 : Math.sin(gh.clock * 1.7) * 0.08;
      const sc = gh.tamed ? 0.8 : gh.mode === 'chase' ? 1.3 : 1.2;          // 心魔比人大一點，追人時再脹大一些
      v.rig.scale.setScalar(v.rig.scale.x + (sc - v.rig.scale.x) * Math.min(1, dt * 5));
      if (v.zz?.visible) { const k = (gh.clock * 0.5) % 1; v.zz.position.y = 1.35 + k * 0.5; v.zz.material.opacity = Math.sin(k * Math.PI) * 0.9; }
      gh.blob.scale.setScalar(gh.tamed ? 0.6 : 1);
      gh.wisp.update(dt, gh.pos.x, gy + v.rig.position.y + 0.4 * v.rig.scale.x, gh.pos.y,
        gh.tamed ? 8 : gh.mode === 'chase' ? 18 : 9, opt.scale, gh.tamed ? 0.85 : gh.id === 'selfish' ? 0.55 : 0.4, gh.tamed ? 0.35 : 0.8);
    }
    return ev;
  }

  /** 懈怠鬼靠近時，腳步越來越沉重；被它抓住後懶洋洋三秒。善念之光可以驅散懈怠 */
  speedFactor(p, shield, active) {
    if (!this.shown || shield > 0) return 1;
    let f = 1;
    const lz = this.get('lazy');
    if (active && !lz.tamed) {
      const d = Math.hypot(p.x - lz.pos.x, p.y - lz.pos.y);
      if (d < lz.slowR) f = 0.5 + 0.5 * THREE.MathUtils.smoothstep(d, 1.5, lz.slowR);
    }
    if (this.debuff > 0) f *= 0.45;
    return f;
  }

  /** 正在追你、離你最近的心魔，以及威脅程度（0～1）：用來畫畫面四周的氣息與警告 */
  threat(p) {
    let gh = null, k = 0;
    for (const g of this.ghosts) {
      if (g.tamed || g.mode !== 'chase') continue;
      const kk = 1 - THREE.MathUtils.clamp((Math.hypot(p.x - g.pos.x, p.y - g.pos.y) - 1.2) / 12, 0, 1);
      if (kk > k) { k = kk; gh = g; }
    }
    return { gh, k };
  }

  /** 心魔名牌要放的位置（頭頂上方） */
  tagPos(gh, out) { const v = gh.vis; return out.set(gh.pos.x, v.g.position.y + v.rig.position.y + v.tagY * v.rig.scale.y, gh.pos.y); }

  set visible(v) {
    this.shown = v;
    for (const gh of this.ghosts) { gh.vis.g.visible = v; gh.wisp.visible = v; }
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
