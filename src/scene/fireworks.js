import * as THREE from 'three';

/**
 * 煙火：一個粒子池（Points，加法混色、不受曝光影響，在黃昏的天色裡特別亮）。
 * 火箭從島上各處升空，到高處炸開成：牡丹（球形）、圓環、金色垂柳、蓮花（粉白雙環）、閃爍的銀星。
 * 粒子會受重力與空氣阻力影響，顏色由白熱轉成本色，最後閃爍著熄滅。
 */
const MAX = 8000;
export const PALETTES = [
  ['#ffd36b', '#fff1c2'],   // 金
  ['#ff6b57', '#ffd2b0'],   // 朱紅
  ['#7ff0c4', '#eafff6'],   // 翠綠
  ['#ff9cc7', '#fff0f7'],   // 蓮花粉
  ['#9fc4ff', '#ffffff'],   // 天藍
  ['#c8a4ff', '#ffe9ff'],   // 紫
];
const HOT = new THREE.Color('#fff8e8'), TRAIL = new THREE.Color('#ffc46a');
const _c1 = new THREE.Color(), _c2 = new THREE.Color();

export class Fireworks {
  /** onBurst(color, strength, x, y, z)：炸開時通知（用來照亮島、播放聲音） */
  constructor(scene, onBurst) {
    this.onBurst = onBurst;
    const geo = new THREE.BufferGeometry();
    this.p = new Float32Array(MAX * 3); this.c = new Float32Array(MAX * 3); this.s = new Float32Array(MAX); this.a = new Float32Array(MAX);
    const attr = (arr, n) => new THREE.BufferAttribute(arr, n).setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('position', attr(this.p, 3));
    geo.setAttribute('aColor', attr(this.c, 3));
    geo.setAttribute('aSize', attr(this.s, 1));
    geo.setAttribute('aAlpha', attr(this.a, 1));
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e5);
    this.geo = geo;
    // 模擬用的狀態（不上傳到顯示卡）
    this.v = new Float32Array(MAX * 3); this.life = new Float32Array(MAX); this.max = new Float32Array(MAX);
    this.base = new Float32Array(MAX * 3); this.drag = new Float32Array(MAX); this.grav = new Float32Array(MAX);
    this.size0 = new Float32Array(MAX); this.seed = new Float32Array(MAX); this.trail = new Uint8Array(MAX); this.tw = new Float32Array(MAX);
    this.cur = 0; this.rockets = []; this.time = 0; this.alive = 0;
    this.uniforms = { uScale: { value: 600 } };
    const mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
      vertexShader: /* glsl */`
        attribute vec3 aColor; attribute float aSize; attribute float aAlpha;
        uniform float uScale; varying vec3 vC; varying float vA;
        void main() {
          vC = aColor; vA = aAlpha;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = aAlpha > 0.001 ? clamp(aSize * uScale / -mv.z, 1.5, 180.0) : 0.0;
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */`
        varying vec3 vC; varying float vA;
        void main() {
          vec2 q = gl_PointCoord * 2.0 - 1.0;
          float d2 = dot(q, q);
          if (d2 > 1.0) discard;
          vec3 col = vC * exp(-d2 * 4.0) + vec3(1.0) * exp(-d2 * 24.0) * 0.55;
          gl_FragColor = vec4(col * vA, 1.0);
          #include <colorspace_fragment>
        }`,
    });
    this.points = new THREE.Points(geo, mat);
    this.points.frustumCulled = false; this.points.renderOrder = 20; this.points.visible = false;
    scene.add(this.points);
  }

  get idle() { return this.alive === 0 && this.rockets.length === 0; }

  #spawn(x, y, z, vx, vy, vz, life, size, col, drag, grav, trail = 0, tw = 1) {
    const i = this.cur; this.cur = (this.cur + 1) % MAX;
    const j = i * 3;
    this.p[j] = x; this.p[j + 1] = y; this.p[j + 2] = z;
    this.v[j] = vx; this.v[j + 1] = vy; this.v[j + 2] = vz;
    this.base[j] = col.r; this.base[j + 1] = col.g; this.base[j + 2] = col.b;
    this.c[j] = HOT.r; this.c[j + 1] = HOT.g; this.c[j + 2] = HOT.b;
    this.life[i] = life; this.max[i] = life; this.size0[i] = size; this.s[i] = size; this.a[i] = 1;
    this.drag[i] = drag; this.grav[i] = grav; this.trail[i] = trail; this.seed[i] = Math.random() * 6.283; this.tw[i] = tw;
  }

  /** 從地面 (x, y0, z) 發射一枚，在 y0 + h 附近炸開 */
  launch(x, y0, z, { type = 'peony', pal = 0, h = 36, scale = 1 } = {}) {
    const g = 14, vy = Math.sqrt(2 * g * h) * 1.04;
    this.rockets.push({ x, y: y0 + 0.5, z, vx: (Math.random() - 0.5) * 1.2, vy, vz: (Math.random() - 0.5) * 1.2, g, top: y0 + h, type, pal, scale });
    this.points.visible = true;
  }

  burst(x, y, z, type, pal, scale = 1) {
    const [a, b] = PALETTES[pal % PALETTES.length];
    _c1.set(a); _c2.set(b);
    const R = Math.random;
    const sphere = (n, speed, life, size, drag, grav, mix = 0.25, trail = 0, tw = 1, col2 = _c2) => {
      for (let k = 0; k < n; k++) {
        const u = R() * 2 - 1, th = R() * 6.283, r = Math.sqrt(1 - u * u), sp = speed * (0.86 + R() * 0.14);
        this.#spawn(x, y, z, r * Math.cos(th) * sp, u * sp, r * Math.sin(th) * sp, life * (0.85 + R() * 0.3), size, R() < mix ? col2 : _c1, drag, grav, trail, tw);
      }
    };
    const ring = (n, speed, life, size, col, tilt) => {
      // 圓環：在一個稍微傾斜的平面上
      const ax = new THREE.Vector3(R() - 0.5, 1.6, R() - 0.5).normalize();
      const u = new THREE.Vector3(1, 0, 0).cross(ax).normalize(), w = ax.clone().cross(u).normalize();
      for (let k = 0; k < n; k++) {
        const th = (k / n) * 6.283, c = Math.cos(th), s = Math.sin(th);
        const dx = u.x * c + w.x * s, dy = (u.y * c + w.y * s) + tilt, dz = u.z * c + w.z * s;
        this.#spawn(x, y, z, dx * speed, dy * speed, dz * speed, life * (0.9 + R() * 0.2), size, col, 1.2, -4.5);
      }
    };
    const s = scale;
    switch (type) {
      case 'ring': ring(96, 17 * s, 2.1, 0.95, _c1, 0); sphere(30, 6 * s, 1.5, 0.75, 1.5, -5, 1); break;
      case 'willow': sphere(130, 12.5 * s, 3.6, 0.85, 1.7, -7.5, 0.15, 1, 0.5); break;
      case 'lotus': ring(72, 16 * s, 2.3, 0.95, _c1, 0.15); ring(48, 10 * s, 2.1, 0.85, _c2, 0.3); sphere(34, 4.5 * s, 1.6, 0.75, 1.5, -4, 1); break;
      case 'glitter': sphere(160, 15 * s, 2.4, 0.62, 1.25, -5, 0.6, 0, 3); break;
      default: sphere(170, 17 * s, 2.3, 0.95, 1.1, -5.5, 0.28);
    }
    this.#spawn(x, y, z, 0, 0, 0, 0.3, 12 * s, HOT, 0, 0);          // 炸開瞬間的閃光
    this.onBurst?.(_c1.getHex(), type === 'willow' ? 0.8 : 1, x, y, z);
  }

  update(dt, camera, viewportHeight) {
    if (!this.points.visible) return;
    this.time += dt;
    this.uniforms.uScale.value = viewportHeight / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2));
    // 火箭：往上飛，拖著一串金色火花
    for (let k = this.rockets.length - 1; k >= 0; k--) {
      const r = this.rockets[k];
      r.vy -= r.g * dt; r.x += r.vx * dt; r.y += r.vy * dt; r.z += r.vz * dt;
      for (let n = 0; n < 2; n++) this.#spawn(r.x, r.y, r.z, (Math.random() - 0.5) * 0.8, -1 - Math.random(), (Math.random() - 0.5) * 0.8, 0.45 + Math.random() * 0.3, 0.5, TRAIL, 2.5, -2);
      if (r.vy < 2.5 || r.y >= r.top) { this.burst(r.x, r.y, r.z, r.type, r.pal, r.scale); this.rockets.splice(k, 1); }
    }
    let alive = 0;
    const t = this.time;
    for (let i = 0; i < MAX; i++) {
      if (this.life[i] <= 0) continue;
      this.life[i] -= dt;
      const j = i * 3;
      if (this.life[i] <= 0) { this.a[i] = 0; continue; }
      alive++;
      const k = 1 - this.life[i] / this.max[i];
      const dr = Math.exp(-this.drag[i] * dt);
      this.v[j] *= dr; this.v[j + 1] = this.v[j + 1] * dr + this.grav[i] * dt; this.v[j + 2] *= dr;
      this.p[j] += this.v[j] * dt; this.p[j + 1] += this.v[j + 1] * dt; this.p[j + 2] += this.v[j + 2] * dt;
      // 顏色：白熱 → 本色 → 慢慢變暗
      const h = Math.min(1, k / 0.22), dim = 1 - 0.35 * k;
      this.c[j] = (HOT.r * (1 - h) + this.base[j] * h) * dim;
      this.c[j + 1] = (HOT.g * (1 - h) + this.base[j + 1] * h) * dim;
      this.c[j + 2] = (HOT.b * (1 - h) + this.base[j + 2] * h) * dim;
      let al = k < 0.62 ? 1 : 1 - (k - 0.62) / 0.38;
      if (k > 0.45) al *= 1 - 0.45 * this.tw[i] * (0.5 + 0.5 * Math.sin(t * 34 + this.seed[i] * 9));
      this.a[i] = Math.max(0, al);
      this.s[i] = this.size0[i] * (1 - 0.45 * k);
      // 垂柳：一路灑下細小的火星
      if (this.trail[i] && Math.random() < 0.22) {
        _c2.setRGB(this.base[j] * 0.9, this.base[j + 1] * 0.8, this.base[j + 2] * 0.6);
        this.#spawn(this.p[j], this.p[j + 1], this.p[j + 2], this.v[j] * 0.08, this.v[j + 1] * 0.08, this.v[j + 2] * 0.08, 0.6, 0.42, _c2, 3, -1.5);
      }
    }
    this.alive = alive;
    const g = this.geo.attributes;
    g.position.needsUpdate = g.aColor.needsUpdate = g.aSize.needsUpdate = g.aAlpha.needsUpdate = true;
    if (this.idle) this.points.visible = false;
  }
}
