import * as THREE from 'three';

/**
 * 導引：地上一串往目標流動的金色箭頭（沿著步道算出最短路線），
 * 加上目標位置的一道柔和光柱。玩家只要跟著箭頭走，就會走到光柱裡。
 */
const MAX = 64, GAP = 1.25;

function chevronTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const x = c.getContext('2d');
  const shape = () => { x.beginPath(); x.moveTo(6, 44); x.lineTo(32, 14); x.lineTo(58, 44); x.lineTo(46, 53); x.lineTo(32, 36); x.lineTo(18, 53); x.closePath(); };
  x.lineJoin = 'round';
  x.save(); x.translate(0, 3); x.fillStyle = 'rgba(30,20,4,0.5)'; shape(); x.fill(); x.restore();
  x.strokeStyle = 'rgba(70,45,8,0.85)'; x.lineWidth = 4; shape(); x.stroke();
  const g = x.createLinearGradient(0, 14, 0, 53); g.addColorStop(0, '#fffbe8'); g.addColorStop(1, '#ffc53d');
  x.fillStyle = g; shape(); x.fill();
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

export class Guide {
  constructor(world) {
    this.world = world;
    this.time = { value: 0 };
    const geo = new THREE.PlaneGeometry(0.95, 0.95); geo.rotateX(-Math.PI / 2);
    this.dist = new THREE.InstancedBufferAttribute(new Float32Array(MAX), 1);
    geo.setAttribute('aD', this.dist);
    const mat = new THREE.ShaderMaterial({
      uniforms: { uTime: this.time, uMap: { value: chevronTexture() }, uLen: { value: 1 } },
      transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4,
      vertexShader: /* glsl */`
        attribute float aD; varying float vD; varying vec2 vUv;
        void main() { vUv = uv; vD = aD; gl_Position = projectionMatrix * viewMatrix * modelMatrix * instanceMatrix * vec4(position, 1.0); }`,
      fragmentShader: /* glsl */`
        uniform sampler2D uMap; uniform float uTime; uniform float uLen; varying float vD; varying vec2 vUv;
        void main() {
          vec4 c = texture2D(uMap, vUv);
          float wave = fract(vD / 7.0 - uTime * 0.55);
          float pulse = 0.7 + 0.3 * smoothstep(0.65, 1.0, wave);
          float near = smoothstep(0.5, 1.8, vD);
          float far = 1.0 - smoothstep(uLen - 1.2, uLen, vD) * 0.5;
          gl_FragColor = vec4(c.rgb * (0.9 + 0.4 * pulse), min(1.0, c.a * 1.1) * pulse * near * far);
          #include <colorspace_fragment>
        }`,
    });
    this.trail = new THREE.InstancedMesh(geo, mat, MAX);
    this.trail.count = 0; this.trail.frustumCulled = false; this.trail.renderOrder = 3;
    world.scene.add(this.trail);

    // 目標光柱：越往上越透明
    const beamMat = (strength) => new THREE.ShaderMaterial({
      uniforms: { uTime: this.time, uK: { value: strength } },
      transparent: true, depthWrite: false, side: THREE.DoubleSide,
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: /* glsl */`
        uniform float uTime; uniform float uK; varying vec2 vUv;
        void main() {
          float a = pow(1.0 - vUv.y, 1.5) * (0.8 + 0.2 * sin(uTime * 2.4)) * uK;
          gl_FragColor = vec4(mix(vec3(1.0, 0.8, 0.38), vec3(1.0, 0.97, 0.85), vUv.y), a);
          #include <colorspace_fragment>
        }`,
    });
    const beamGeo = new THREE.CylinderGeometry(0.62, 0.62, 9, 28, 1, true); beamGeo.translate(0, 4.5, 0);
    const ringGeo = new THREE.RingGeometry(0.62, 0.8, 40); ringGeo.rotateX(-Math.PI / 2);
    const ringMat = new THREE.MeshBasicMaterial({ color: '#ffd98a', transparent: true, opacity: 0.85, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
    this.beams = [0, 1, 2, 3].map((i) => {
      const g = new THREE.Group();
      const beam = new THREE.Mesh(beamGeo, beamMat(i === 0 ? 0.5 : 0.32));
      const ring = new THREE.Mesh(ringGeo, ringMat);
      ring.position.y = 0.06; ring.renderOrder = 3;
      g.add(beam, ring); g.visible = false;
      world.scene.add(g);
      return { g, ring, beam, k: i === 0 ? 0.5 : 0.32 };
    });
    this.key = null; this.target = null; this.cost = null; this.points = []; this.t = 0; this.next = null;
  }

  /** 設定目標：target = Vector2 或 null；key 改變時重算全島到目標的距離 */
  setTarget(target, key, extras = []) {
    this.extras = extras;
    if (!target) { this.target = null; this.key = null; this.trail.count = 0; this.beams.forEach((b) => { b.g.visible = false; }); return; }
    if (key === this.key && this.target && this.target.distanceTo(target) < 0.05) return;
    this.key = key; this.target = target.clone();
    const gph = this.world.graph;
    this.goalNode = this.#entryNode(target);
    this.cost = this.#dijkstra(this.goalNode);
    this.t = 1;   // 立即更新
  }

  /** 從目標點能直線走到的最近步道節點 */
  #entryNode(p) {
    const gph = this.world.graph;
    const ids = gph.nodes.map((n, i) => [i, n.distanceTo(p)]).sort((a, b) => a[1] - b[1]);
    for (const [i, d] of ids.slice(0, 16)) if (d < 0.5 || this.#clear(gph.nodes[i], p, 0.8)) return i;
    return ids[0][0];
  }
  /** a 到 b 之間能不能直線走過去；pad：終點前多少公尺不檢查（目標本身是人物或火盆，會擋路） */
  #clear(a, b, pad = 0) {
    const L = a.distanceTo(b), n = Math.ceil(L / 0.25);   // 每 25 公分檢查一次（橋的欄杆很窄，不能跳過）
    for (let i = 1; i < n; i++) {
      const t = i / n; if ((1 - t) * L < pad) break;
      const x = a.x + (b.x - a.x) * t, z = a.y + (b.y - a.y) * t;
      if (!this.world.walkable(x, z)) return false;
    }
    return true;
  }
  #dijkstra(src) {
    const gph = this.world.graph, N = gph.nodes.length;
    const dist = new Float64Array(N).fill(Infinity), next = new Int32Array(N).fill(-1), done = new Uint8Array(N);
    dist[src] = 0;
    for (;;) {
      let u = -1, ud = Infinity;
      for (let i = 0; i < N; i++) if (!done[i] && dist[i] < ud) { ud = dist[i]; u = i; }
      if (u < 0) break;
      done[u] = 1;
      for (const [v, len] of gph.adj[u]) if (dist[u] + len < dist[v]) { dist[v] = dist[u] + len; next[v] = u; }
    }
    return { dist, next };
  }

  /** 由玩家位置算出沿步道到目標的折線 */
  #route(p) {
    const gph = this.world.graph, { dist, next } = this.cost, tg = this.target;
    const direct = p.distanceTo(tg);
    const cand = [];
    gph.nodes.forEach((n, i) => { const d = n.distanceTo(p); if (d < 16 && dist[i] < Infinity) cand.push([i, d + dist[i] + tg.distanceTo(gph.nodes[this.goalNode]), d]); });
    cand.sort((a, b) => a[1] - b[1]);
    // 依總路程排序，找第一個「從這裡能直線走到」的步道節點（對岸的節點雖然近，但中間隔著溪或建築就不行）
    let start = -1;
    for (const [i, , d] of cand.slice(0, 24)) if (d < 0.6 || this.#clear(p, gph.nodes[i])) { start = i; break; }
    if (start < 0 && cand.length) start = cand.reduce((b, c) => (c[2] < b[2] ? c : b))[0];
    const viaCost = start >= 0 ? cand.find((c) => c[0] === start)[1] : Infinity;
    if (direct < 14 && direct <= viaCost * 1.15 && this.#clear(p, tg, 0.8)) return [p.clone(), tg.clone()];
    if (start < 0) return [p.clone(), tg.clone()];
    const pts = [p.clone()];
    for (let v = start; v !== -1; v = next[v]) pts.push(gph.nodes[v].clone());
    pts.push(tg.clone());
    // 去掉剛好在身後的第一個節點（避免先往回走）
    if (pts.length > 2) {
      const a = pts[0], b = pts[1], c = pts[2];
      if (a.distanceTo(c) < b.distanceTo(c) && a.distanceTo(b) < 3 && this.#clear(a, c)) pts.splice(1, 1);
    }
    return pts;
  }

  /** 測試用：從某一點出發的路線 */
  routeFrom(p) { return this.cost ? this.#route(p) : []; }

  update(dt, player, ground) {
    this.time.value += dt;
    if (!this.target) return;
    // 光柱
    const all = [this.target, ...(this.extras || [])].slice(0, this.beams.length);
    this.beams.forEach((b, i) => {
      const p = all[i];
      b.g.visible = !!p;
      if (!p) return;
      b.g.position.set(p.x, ground(p.x, p.y), p.y);
      const near = Math.hypot(p.x - player.x, p.y - player.y);
      b.beam.material.uniforms.uK.value = b.k * THREE.MathUtils.smoothstep(near, 2.2, 7);
      const s = 1 + Math.sin(this.time.value * 3 + i) * 0.06;
      b.ring.scale.setScalar(i === 0 ? s : s * 0.7);
    });
    this.t += dt;
    if (this.t < 0.25) return;
    this.t = 0;
    const pts = this.#route(player);
    this.points = pts;
    // 每 GAP 公尺放一個箭頭
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), pos = new THREE.Vector3(), one = new THREE.Vector3(1, 1, 1);
    let along = 0, k = 0, carry = 1.1;
    const total = pts.reduce((s, p, i) => (i ? s + p.distanceTo(pts[i - 1]) : 0), 0);
    this.next = null;
    for (let i = 0; i < pts.length - 1 && k < MAX; i++) {
      const a = pts[i], b = pts[i + 1], L = a.distanceTo(b);
      if (L < 1e-3) continue;
      const dx = (b.x - a.x) / L, dz = (b.y - a.y) / L;
      if (!this.next && along + L > 2.5) this.next = new THREE.Vector2(a.x + dx * Math.max(0, 2.5 - along), a.y + dz * Math.max(0, 2.5 - along));
      let s = carry;
      while (s < L && k < MAX) {
        const d = along + s;
        if (d > total - 0.9) break;
        const x = a.x + dx * s, z = a.y + dz * s;
        q.setFromAxisAngle(up, Math.atan2(dx, dz) + Math.PI);
        pos.set(x, ground(x, z) + 0.07, z);
        m.compose(pos, q, one);
        this.trail.setMatrixAt(k, m);
        this.dist.setX(k, d);
        k++; s += GAP;
      }
      carry = s - L; along += L;
    }
    if (!this.next) this.next = this.target.clone();
    this.trail.count = k;
    this.trail.material.uniforms.uLen.value = Math.min(total, k * GAP + 1);
    this.trail.instanceMatrix.needsUpdate = true;
    this.dist.needsUpdate = true;
    this.remaining = total;
  }
}
