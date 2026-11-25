import * as THREE from 'three';

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
      varying vec3 vWorld;
      varying vec3 vN;
      #include <fog_pars_fragment>

      float islandR(float a) {
        return 32.0 * (1.0 + 0.06 * sin(2.0 * a + 0.7) + 0.04 * sin(3.0 * a + 2.1) + 0.025 * sin(5.0 * a + 4.0));
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
        float fres = pow(1.0 - max(dot(n, v), 0.0), 4.0);

        // 水體顏色：岸邊青綠 → 外海靛藍
        vec3 deep = vec3(0.10, 0.25, 0.30);
        vec3 mid = vec3(0.18, 0.38, 0.38);
        vec3 shallow = vec3(0.42, 0.62, 0.52);
        float sh = 1.0 - smoothstep(1.0, 1.32, d);
        float md = 1.0 - smoothstep(1.1, 2.1, d);
        vec3 body = mix(deep, mid, md);
        body = mix(body, shallow, sh * sh);

        // 反射天空：仰角越低越靠近地平線的紫粉色，朝西帶暖光
        vec3 r = reflect(-v, n);
        float ry = clamp(r.y, 0.0, 1.0);
        vec3 sky = mix(vec3(0.95, 0.88, 0.72), vec3(0.42, 0.68, 0.90), smoothstep(0.0, 0.5, ry));
        vec3 sunH = normalize(vec3(uSun.x, 0.0, uSun.z));
        float toward = max(dot(normalize(vec3(r.x, 0.0, r.z)), sunH), 0.0);
        sky += vec3(1.0, 0.8, 0.5) * pow(toward, 6.0) * (1.0 - smoothstep(0.0, 0.3, ry)) * 0.3;
        vec3 col = mix(body, sky, 0.10 + 0.5 * fres);

        // 夕陽碎金光帶
        float spec = pow(max(dot(r, normalize(uSun)), 0.0), 220.0);
        float glitter = pow(max(dot(r, normalize(uSun)), 0.0), 18.0);
        col += vec3(1.0, 0.9, 0.62) * (spec * 1.6 + glitter * 0.05) * (1.0 - smoothstep(1.6, 3.2, d));
        // 遠海漸漸沒入夜色
        col = mix(col, vec3(0.80, 0.86, 0.84), smoothstep(1.9, 4.2, d) * 0.85);

        // 岸邊浪花：一圈貼岸、幾道往外推的細線
        float shore = d - 0.995;
        float foam = smoothstep(0.03, 0.0, abs(shore)) * 0.75;
        float waves = smoothstep(0.86, 1.0, sin(shore * 120.0 - uTime * 1.6 + n2(p * 0.8) * 2.0)) * (1.0 - smoothstep(0.0, 0.07, shore)) * step(0.0, shore);
        foam += waves * 0.45;
        foam *= 0.75 + 0.25 * n2(p * 2.4 + uTime * 0.2);
        col = mix(col, vec3(0.96, 0.95, 0.88), clamp(foam, 0.0, 1.0));

        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        #include <fog_fragment>
      }`,
  });
  const geo = new THREE.PlaneGeometry(500, 500, 220, 220);
  geo.rotateX(-Math.PI / 2);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.y = 0.0;
  return { mesh, update: (t) => { uniforms.uTime.value = t; } };
}
