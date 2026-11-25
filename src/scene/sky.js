import * as THREE from 'three';

/** 東方山水的晨空：天頂淡青、地平線米金色的薄霧，柔和的太陽與緩緩飄動的雲 */
export function createSky(sunDir) {
  const uniforms = {
    uSun: { value: sunDir.clone().normalize() },
    uTime: { value: 0 },
  };
  const mat = new THREE.ShaderMaterial({
    uniforms,
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    vertexShader: /* glsl */`
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        gl_Position = p.xyww;
      }`,
    fragmentShader: /* glsl */`
      uniform vec3 uSun; uniform float uTime;
      varying vec3 vDir;
      float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float noise(vec2 p) {
        vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
      }
      float fbm(vec2 p) { float a = 0.5, s = 0.0; for (int i = 0; i < 5; i++) { s += a * noise(p); p *= 2.03; a *= 0.5; } return s; }
      void main() {
        vec3 d = normalize(vDir);
        float h = clamp(d.y, -0.2, 1.0);
        // 晴朗的天空：天頂較深的藍，往地平線漸淡成帶點霧氣的灰白
        vec3 zenith = vec3(0.17, 0.36, 0.66);
        vec3 mid = vec3(0.45, 0.62, 0.82);
        vec3 horizon = vec3(0.76, 0.83, 0.87);
        vec3 col = mix(horizon, mid, smoothstep(0.0, 0.25, h));
        col = mix(col, zenith, smoothstep(0.22, 0.9, h));
        float sunF = max(dot(d, normalize(uSun)), 0.0);
        col += vec3(1.0, 0.86, 0.62) * pow(sunF, 8.0) * 0.28;
        col += vec3(1.0, 0.95, 0.82) * pow(sunF, 90.0) * 0.6;
        col = mix(col, vec3(1.0, 0.99, 0.94), smoothstep(0.9994, 0.9998, sunF));
        // 積雲：投影到天穹上的雜訊；雲底帶一點灰
        if (d.y > 0.02) {
          vec2 uv = d.xz / (d.y + 0.25) * 1.5 + vec2(uTime * 0.008, 0.0);
          float c = fbm(uv * 1.25);
          float cl = smoothstep(0.55, 0.8, c) * smoothstep(0.02, 0.22, d.y);
          float lit = clamp(fbm(uv * 1.25 + normalize(uSun.xz) * 0.1) - c + 0.55, 0.0, 1.0);
          vec3 cc = mix(vec3(0.70, 0.74, 0.80), vec3(1.0, 0.99, 0.97), lit);
          col = mix(col, cc, cl * 0.9);
        }
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(400, 48, 24), mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = -10;
  return { mesh, update: (t) => { uniforms.uTime.value = t; } };
}

/** 柔軟的雲霧貼片（canvas 漸層材質），用於山腰的薄霧與遠方的雲 */
export function cloudTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  for (let i = 0; i < 9; i++) {
    const x = 30 + Math.random() * 68, y = 44 + Math.random() * 40, r = 22 + Math.random() * 26;
    const grd = g.createRadialGradient(x, y, 0, x, y, r);
    grd.addColorStop(0, 'rgba(255,255,255,0.55)');
    grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd;
    g.fillRect(0, 0, 128, 128);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function createMist(spots) {
  const tex = cloudTexture();
  const group = new THREE.Group();
  const items = spots.map(([x, y, z, s, color, op], i) => {
    const m = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, color, transparent: true, opacity: op, depthWrite: false, fog: false }));
    m.position.set(x, y, z);
    m.scale.set(s, s * 0.42, 1);
    m.userData = { x, ph: i * 1.7 };
    group.add(m);
    return m;
  });
  return { group, update: (t) => items.forEach((m) => { m.position.x = m.userData.x + Math.sin(t * 0.05 + m.userData.ph) * 1.6; }) };
}
