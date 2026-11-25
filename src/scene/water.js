import * as THREE from 'three';
import { S } from '../data/spots.js';

/**
 * 早晨的湖水：深處翠綠、島邊轉為透亮的淺綠，岸線有輕輕的水紋；
 * 水面反射天空，朝東有一條晨光的碎金帶。
 * 岸線形狀與 terrain.js 的 islandR() 相同（同一組正弦參數）。
 */
export function createWater(sunDir) {
  const uniforms = THREE.UniformsUtils.merge([
    THREE.UniformsLib.fog,
    {
      uTime: { value: 0 },
      uSun: { value: sunDir.clone().normalize() },
      uDusk: { value: 0 },
    },
  ]);
  const mat = new THREE.ShaderMaterial({
    uniforms,
    fog: true,
    transparent: false,
    vertexShader: /* glsl */`
      uniform float uTime;
      varying vec3 vWorld;
      varying vec3 vN;
      #include <fog_pars_vertex>
      void main() {
        vec4 w = modelMatrix * vec4(position, 1.0);
        float t = uTime;
        float h = sin(w.x * 0.42 + t * 0.7) * 0.035 + sin(w.z * 0.53 - t * 0.55) * 0.035 + sin((w.x - w.z) * 1.3 + t * 1.3) * 0.012;
        w.y += h;
        float dx = cos(w.x * 0.42 + t * 0.7) * 0.0147 + cos((w.x - w.z) * 1.3 + t * 1.3) * 0.0156;
        float dz = cos(w.z * 0.53 - t * 0.55) * 0.0186 - cos((w.x - w.z) * 1.3 + t * 1.3) * 0.0156;
        vN = normalize(vec3(-dx, 1.0, -dz));
        vWorld = w.xyz;
        vec4 mvPosition = viewMatrix * w;
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */`
      uniform float uTime;
      uniform vec3 uSun;
      uniform float uDusk;
      varying vec3 vWorld;
      varying vec3 vN;
      #include <fog_pars_fragment>

      float islandR(float a) {
        return ${(32 * S).toFixed(2)} * (1.0 + 0.06 * sin(2.0 * a + 0.7) + 0.04 * sin(3.0 * a + 2.1) + 0.025 * sin(5.0 * a + 4.0));
      }
      float n2(vec2 p) { return sin(p.x * 1.7 + sin(p.y * 1.3)) * sin(p.y * 1.9 + sin(p.x * 1.1)); }

      void main() {
        float a = atan(vWorld.z, vWorld.x);
        float d = length(vWorld.xz) / islandR(a);

        // 細碎波紋法線（兩層移動的正弦）
        vec2 p = vWorld.xz;
        float r1 = n2(p * 1.6 + vec2(uTime * 0.25, uTime * 0.18));
        float r2 = n2(p * 3.1 - vec2(uTime * 0.31, -uTime * 0.22));
        vec3 n = normalize(vN + vec3(r1 * 0.06 + r2 * 0.035, 0.0, r2 * 0.06 - r1 * 0.03));

        vec3 v = normalize(cameraPosition - vWorld);
        float cosT = max(dot(n, v), 0.0);
        float fres = 0.02 + 0.98 * pow(1.0 - cosT, 5.0);

        // 水體顏色：岸邊帶一點沙底的青綠 → 外海深藍綠
        vec3 deep = vec3(0.03, 0.11, 0.14);
        vec3 mid = vec3(0.045, 0.19, 0.2);
        vec3 shallow = vec3(0.11, 0.32, 0.27);
        float sh = 1.0 - smoothstep(1.0, 1.22, d);
        float md = 1.0 - smoothstep(1.08, 1.9, d);
        vec3 body = mix(deep, mid, md);
        body = mix(body, shallow, sh * sh);
        // 島內的池塘與小溪：較暗的綠褐色
        float inland = 1.0 - smoothstep(0.86, 0.93, d);
        body = mix(body, vec3(0.07, 0.12, 0.09), inland);

        // 反射天空
        vec3 r = reflect(-v, n);
        float ry = clamp(r.y, 0.0, 1.0);
        vec3 sky = mix(vec3(0.78, 0.84, 0.88), vec3(0.30, 0.50, 0.78), smoothstep(0.0, 0.6, ry));
        sky = mix(sky, mix(vec3(0.42, 0.26, 0.24), vec3(0.04, 0.05, 0.12), smoothstep(0.0, 0.5, ry)), uDusk);   // 黃昏的天空倒影
        body *= 1.0 - 0.45 * uDusk;
        vec3 col = mix(body, sky, clamp(fres * 0.8 + 0.04, 0.0, 1.0) * (inland > 0.5 ? 0.75 : 1.0));

        // 陽光的反光
        float sd = max(dot(r, normalize(uSun)), 0.0);
        col += vec3(1.0, 0.94, 0.8) * (pow(sd, 400.0) * 2.2 + pow(sd, 40.0) * 0.06) * (1.0 - smoothstep(1.6, 3.2, d));
        // 遠處融入天邊的薄霧
        col = mix(col, mix(vec3(0.74, 0.81, 0.85), vec3(0.13, 0.13, 0.22), uDusk), smoothstep(2.0, 5.0, d) * 0.8);

        // 岸邊：一圈細細的濕潤水線與零星的白浪
        float shore = d - 0.995;
        float foam = smoothstep(0.018, 0.0, abs(shore)) * 0.35 * (0.5 + 0.5 * n2(p * 1.7 + uTime * 0.15));
        float waves = smoothstep(0.93, 1.0, sin(shore * 110.0 - uTime * 1.3 + n2(p * 0.8) * 2.0)) * (1.0 - smoothstep(0.0, 0.05, shore)) * step(0.0, shore);
        foam += waves * 0.22 * smoothstep(0.2, 0.8, n2(p * 0.6 - uTime * 0.05));
        col = mix(col, vec3(0.92, 0.93, 0.9), clamp(foam, 0.0, 1.0) * (1.0 - inland));

        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        #include <fog_fragment>
      }`,
  });
  const geo = new THREE.PlaneGeometry(1400, 1400, 110, 110);
  geo.rotateX(-Math.PI / 2);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.y = 0.0;
  return { mesh, update: (t) => { uniforms.uTime.value = t; }, setDusk: (k) => { uniforms.uDusk.value = k; } };
}
