import * as THREE from 'three';

/**
 * 程式繪製的貼圖（canvas）：葉片、松針、草、花、樹皮、石板路、木板、石牆與灰泥。
 * 全部在載入時畫出，不使用外部圖檔，也不使用任何現成素材。
 */

export function rand(seed = 1) {
  let s = (seed * 2654435761) >>> 0 || 1;
  return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
}

function make(w, h, draw, { repeat = false, srgb = true } = {}) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}
const hsl = (h, s, l, a = 1) => `hsla(${h},${s}%,${l}%,${a})`;

/* ---------- 葉片圖集：2×2 四種葉簇，每格是一團葉子 ---------- */
function leafAtlas(seed, { leaf, base, count = 80, twig = '#4a3a2a' }) {
  return make(512, 512, (x) => {
    const r = rand(seed);
    for (let cell = 0; cell < 4; cell++) {
      const ox = (cell % 2) * 256, oy = Math.floor(cell / 2) * 256, cx = ox + 128, cy = oy + 128;
      x.save();
      x.beginPath(); x.rect(ox, oy, 256, 256); x.clip();
      // 葉團的暗色底，讓遠看時不會透空
      const g = x.createRadialGradient(cx, cy, 10, cx, cy, 92);
      g.addColorStop(0, base(0.9)); g.addColorStop(0.7, base(0.75)); g.addColorStop(1, base(0));
      x.fillStyle = g; x.beginPath(); x.arc(cx, cy, 92, 0, 7); x.fill();
      // 細枝
      x.strokeStyle = twig; x.lineWidth = 2;
      for (let i = 0; i < 5; i++) { const a = r() * 6.28; x.beginPath(); x.moveTo(cx, cy); x.lineTo(cx + Math.cos(a) * 70, cy + Math.sin(a) * 70); x.stroke(); }
      const n = count + Math.floor(r() * 20);
      for (let i = 0; i < n; i++) {
        const t = i / n;                              // 由內到外、由暗到亮
        const a = r() * 6.28, d = Math.sqrt(r()) * (64 + 44 * t);
        const px = cx + Math.cos(a) * d, py = cy + Math.sin(a) * d * 0.95;
        if (Math.hypot(px - cx, py - cy) > 118) continue;
        leaf(x, px, py, a + (r() - 0.5) * 1.4, r, t);
      }
      x.restore();
    }
  });
}

function drawLeaf(x, px, py, ang, r, t, { hue = [84, 112], sat = [34, 54], lit = [24, 46], len = [20, 32], wid = 0.38 } = {}) {
  const L = len[0] + r() * (len[1] - len[0]), W = L * (wid + r() * 0.1);
  const h = hue[0] + r() * (hue[1] - hue[0]), s = sat[0] + r() * (sat[1] - sat[0]);
  const l = lit[0] + (lit[1] - lit[0]) * (0.35 + 0.65 * t) * (0.8 + r() * 0.4);
  x.save(); x.translate(px, py); x.rotate(ang);
  x.fillStyle = hsl(h, s, l);
  x.beginPath(); x.moveTo(0, 0);
  x.quadraticCurveTo(L * 0.45, -W, L, 0); x.quadraticCurveTo(L * 0.45, W, 0, 0); x.fill();
  x.fillStyle = hsl(h - 4, s + 6, Math.min(70, l + 12), 0.55);              // 受光的半邊
  x.beginPath(); x.moveTo(0, 0); x.quadraticCurveTo(L * 0.45, -W, L, 0); x.quadraticCurveTo(L * 0.5, -W * 0.25, 0, 0); x.fill();
  x.strokeStyle = hsl(h, s - 10, Math.max(8, l - 10), 0.6); x.lineWidth = 0.8;
  x.beginPath(); x.moveTo(1, 0); x.lineTo(L * 0.9, 0); x.stroke();
  x.restore();
}

let cache = {};
export const TEX = {
  get broadleaf() {
    return cache.broadleaf ||= leafAtlas(11, { base: (a) => `rgba(34,56,26,${a})`, leaf: (x, px, py, ang, r, t) => drawLeaf(x, px, py, ang, r, t) });
  },
  get maple() {
    return cache.maple ||= leafAtlas(23, {
      base: (a) => `rgba(92,30,16,${a})`, count: 70,
      leaf: (x, px, py, ang, r, t) => {
        const s = 9 + r() * 6, h = 4 + r() * 30, l = 30 + 22 * t * (0.8 + r() * 0.4);
        x.save(); x.translate(px, py); x.rotate(ang);
        x.fillStyle = hsl(h, 70 + r() * 15, l);
        x.beginPath();
        for (let k = 0; k < 10; k++) { const a = (k / 10) * 6.28 - 1.57, rr = k % 2 ? s * 0.45 : s; x.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); }
        x.closePath(); x.fill();
        x.restore();
      },
    });
  },
  get needles() {
    return cache.needles ||= make(512, 512, (x) => {
      const r = rand(31);
      for (let cell = 0; cell < 4; cell++) {
        const ox = (cell % 2) * 256, oy = Math.floor(cell / 2) * 256, cx = ox + 128, cy = oy + 128;
        x.save(); x.beginPath(); x.rect(ox, oy, 256, 256); x.clip();
        const g = x.createRadialGradient(cx, cy, 8, cx, cy, 96);
        g.addColorStop(0, 'rgba(18,34,24,0.95)'); g.addColorStop(0.7, 'rgba(20,38,26,0.8)'); g.addColorStop(1, 'rgba(20,38,26,0)');
        x.fillStyle = g; x.beginPath(); x.ellipse(cx, cy, 100, 84, 0, 0, 7); x.fill();
        const tufts = 34;
        for (let i = 0; i < tufts; i++) {
          const t = i / tufts, a = r() * 6.28, d = Math.sqrt(r()) * (60 + 40 * t);
          const tx = cx + Math.cos(a) * d, ty = cy + Math.sin(a) * d * 0.85;
          const h = 128 + r() * 30, s = 22 + r() * 18, l = 14 + 22 * t * (0.8 + r() * 0.4);
          for (let k = 0; k < 26; k++) {
            const na = a + (r() - 0.5) * 2.4, nl = 12 + r() * 18;
            x.strokeStyle = hsl(h, s, l + r() * 10, 0.95); x.lineWidth = 1.1 + r() * 0.6;
            x.beginPath(); x.moveTo(tx, ty); x.lineTo(tx + Math.cos(na) * nl, ty + Math.sin(na) * nl); x.stroke();
          }
        }
        x.restore();
      }
    });
  },
  get bambooLeaf() {
    return cache.bambooLeaf ||= make(512, 512, (x) => {
      const r = rand(41);
      for (let cell = 0; cell < 4; cell++) {
        const ox = (cell % 2) * 256, oy = Math.floor(cell / 2) * 256, cx = ox + 128, cy = oy + 70;
        x.save(); x.beginPath(); x.rect(ox, oy, 256, 256); x.clip();
        x.strokeStyle = '#5b6b3a'; x.lineWidth = 2;
        for (let s = 0; s < 6; s++) {
          const a0 = (s / 6) * 3.14 + 0.2 + (r() - 0.5) * 0.3, L0 = 50 + r() * 50;
          const sx = cx + Math.cos(a0) * L0 * 0.7, sy = cy + Math.sin(a0) * L0 * 0.5 + 20;
          x.beginPath(); x.moveTo(cx, cy); x.lineTo(sx, sy); x.stroke();
          for (let k = 0; k < 6; k++) {
            const a = a0 + (r() - 0.5) * 1.2 + 0.5, L = 38 + r() * 30, W = 4 + r() * 2.5;
            const h = 72 + r() * 22, l = 30 + r() * 18;
            x.save(); x.translate(sx + (r() - 0.5) * 20, sy + (r() - 0.5) * 16); x.rotate(a);
            x.fillStyle = hsl(h, 38 + r() * 14, l);
            x.beginPath(); x.moveTo(0, 0); x.quadraticCurveTo(L * 0.35, -W, L, 0); x.quadraticCurveTo(L * 0.35, W, 0, 0); x.fill();
            x.restore();
          }
        }
        x.restore();
      }
    });
  },
  /** 草叢：一排細長的草葉，3 種變化左右並排 */
  get grass() {
    return cache.grass ||= make(768, 256, (x, w, h) => {
      const r = rand(51);
      for (let v = 0; v < 3; v++) {
        const ox = v * 256;
        for (let i = 0; i < 70; i++) {
          const bx = ox + 22 + r() * 212, H = (0.45 + r() * 0.55) * (h - 8), lean = (r() - 0.5) * 70, W = 2.2 + r() * 3.2;
          const dry = r() < 0.12;
          const hue = dry ? 52 + r() * 10 : 78 + r() * 28, l = dry ? 50 + r() * 12 : 26 + r() * 22;
          const g = x.createLinearGradient(0, h, 0, h - H);
          g.addColorStop(0, hsl(hue, 30, l * 0.55)); g.addColorStop(1, hsl(hue - 6, dry ? 32 : 44, l + 8));
          x.fillStyle = g;
          x.beginPath(); x.moveTo(bx - W, h); x.quadraticCurveTo(bx + lean * 0.3, h - H * 0.6, bx + lean, h - H); x.quadraticCurveTo(bx + lean * 0.3 + W * 0.3, h - H * 0.55, bx + W, h); x.fill();
        }
      }
    });
  },
  /** 野花叢：短草裡點綴小花（白、淡黃、淡紫、淡粉） */
  get flowers() {
    return cache.flowers ||= make(768, 256, (x, w, h) => {
      const r = rand(61);
      const cols = [['#f7f4ea', '#e9d27a'], ['#f2d65e', '#c98f2a'], ['#c8b4e0', '#f0e2a0'], ['#f3c2cf', '#f7e6a6']];
      for (let v = 0; v < 3; v++) {
        const ox = v * 256;
        for (let i = 0; i < 46; i++) {
          const bx = ox + 22 + r() * 212, H = (0.3 + r() * 0.45) * h, lean = (r() - 0.5) * 50, W = 2 + r() * 2.5;
          const hue = 82 + r() * 24, l = 26 + r() * 18;
          x.fillStyle = hsl(hue, 40, l);
          x.beginPath(); x.moveTo(bx - W, h); x.quadraticCurveTo(bx + lean * 0.3, h - H * 0.6, bx + lean, h - H); x.quadraticCurveTo(bx + lean * 0.3 + W * 0.3, h - H * 0.55, bx + W, h); x.fill();
        }
        const [pc, cc] = cols[v === 0 ? 0 : v === 1 ? (r() > 0.5 ? 1 : 3) : 2];
        for (let i = 0; i < 16; i++) {
          const fx = ox + 30 + r() * 196, fy = h * (0.18 + r() * 0.42), s = 7 + r() * 5;
          x.strokeStyle = hsl(95, 35, 30); x.lineWidth = 2; x.beginPath(); x.moveTo(fx, fy); x.lineTo(fx + (r() - 0.5) * 10, h); x.stroke();
          x.fillStyle = pc;
          for (let k = 0; k < 5; k++) { const a = (k / 5) * 6.28 + r(); x.beginPath(); x.ellipse(fx + Math.cos(a) * s * 0.55, fy + Math.sin(a) * s * 0.55, s * 0.5, s * 0.32, a, 0, 7); x.fill(); }
          x.fillStyle = cc; x.beginPath(); x.arc(fx, fy, s * 0.28, 0, 7); x.fill();
        }
      }
    });
  },
  get bark() {
    return cache.bark ||= make(128, 256, (x, w, h) => {
      const r = rand(71);
      x.fillStyle = '#6c6052'; x.fillRect(0, 0, w, h);
      for (let i = 0; i < 900; i++) { const v = 70 + r() * 60; x.fillStyle = `rgba(${v},${v - 8},${v - 18},0.35)`; x.fillRect(r() * w, r() * h, 2 + r() * 3, 6 + r() * 20); }
      x.strokeStyle = 'rgba(30,22,16,0.55)';
      for (let i = 0; i < 26; i++) { x.lineWidth = 1 + r() * 2; let px = r() * w; x.beginPath(); x.moveTo(px, 0); for (let y = 0; y <= h; y += 16) { px += (r() - 0.5) * 6; x.lineTo(px, y); } x.stroke(); }
    }, { repeat: true });
  },
  /** 石板路：不規則的石板（Voronoi），兩側是泥土與不規則的邊；u 方向橫跨路面，v 方向可無縫重複 */
  get flagstone() {
    return cache.flagstone ||= (() => {
      const W = 240, H = 960, r = rand(81);
      const c = document.createElement('canvas'); c.width = W; c.height = H;
      const x = c.getContext('2d'); const img = x.createImageData(W, H); const d = img.data;
      const cols = 4, rows = 16, rowH = H / rows;
      const byRow = [];
      for (let j = 0; j < rows; j++) {
        byRow.push([]);
        for (let i = 0; i < cols; i++) {
          const tone = 0.82 + r() * 0.3, warm = r() * 0.08;
          byRow[j].push([(0.13 + (i + 0.2 + r() * 0.6) / cols * 0.74) * W, (j + 0.2 + r() * 0.6) * rowH, tone, warm]);
        }
      }
      const noise = (u0, v0) => { const u = u0 / 1.5, v = v0 / 1.5; return Math.sin(u * 0.21 + Math.sin(v * 0.13) * 2) * Math.cos(v * 0.17 + u * 0.05) * 0.5 + Math.sin(u * 0.9 + v * 0.7) * 0.25; };
      for (let y = 0; y < H; y++) {
        const jr = Math.floor(y / rowH);
        const near = [...byRow[(jr + rows - 1) % rows], ...byRow[jr], ...byRow[(jr + 1) % rows]];
        for (let px = 0; px < W; px++) {
        let d1 = 1e9, d2 = 1e9, best = null;
        for (const p of near) {
          let dy = Math.abs(y - p[1]); dy = Math.min(dy, H - dy);
          const dd = (px - p[0]) ** 2 + dy * dy;
          if (dd < d1) { d2 = d1; d1 = dd; best = p; } else if (dd < d2) d2 = dd;
        }
        const edge = Math.sqrt(d2) - Math.sqrt(d1);                 // 到石縫的距離
        const u = px / W, n = noise(px, y);
        const side = Math.min(u, 1 - u);                            // 到路緣的距離
        const k = (y * W + px) * 4;
        let R, G, B, A = 255;
        const grain = (Math.sin(px * 2.1 + y * 1.1) * Math.sin(px * 0.9 - y * 1.9)) * 10 + (r() - 0.5) * 14;
        if (edge < 3.2 || side < 0.12 + n * 0.035) {               // 石縫與路肩：泥土、碎石、苔
          const moss = side > 0.14 && r() < 0.35;
          R = moss ? 92 : 118; G = moss ? 104 : 104; B = moss ? 62 : 82;
          R += grain; G += grain; B += grain * 0.8;
        } else {
          const t = best[2] * (0.94 + Math.min(1, edge / 13) * 0.06);
          R = (182 + best[3] * 120) * t + grain; G = 174 * t + grain; B = (158 - best[3] * 60) * t + grain;
          if (edge < 6) { R *= 0.86; G *= 0.86; B *= 0.86; }
        }
        // 路緣：不規則地消失在草地裡
        const fade = side - (0.035 + n * 0.03);
        A = fade <= 0 ? 0 : fade < 0.03 ? Math.round(255 * fade / 0.03) : 255;
        d[k] = R; d[k + 1] = G; d[k + 2] = B; d[k + 3] = A;
        }
      }
      x.putImageData(img, 0, 0);
      const t = new THREE.CanvasTexture(c);
      t.wrapS = THREE.ClampToEdgeWrapping; t.wrapT = THREE.RepeatWrapping;
      t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
      return t;
    })();
  },
  get planks() {
    return cache.planks ||= make(256, 64, (x, w, h) => {
      const r = rand(91);
      x.fillStyle = '#7d6a54'; x.fillRect(0, 0, w, h);
      for (let i = 0; i < 60; i++) { const v = r(); x.strokeStyle = `rgba(${50 + v * 60},${40 + v * 45},${30 + v * 30},0.5)`; x.lineWidth = 1 + r() * 2; const y = r() * h; x.beginPath(); x.moveTo(0, y); x.bezierCurveTo(w * 0.3, y + (r() - 0.5) * 8, w * 0.7, y + (r() - 0.5) * 8, w, y + (r() - 0.5) * 4); x.stroke(); }
      for (let i = 0; i < 3; i++) { x.fillStyle = 'rgba(50,38,28,0.6)'; x.beginPath(); x.ellipse(r() * w, r() * h, 3 + r() * 3, 2, 0, 0, 7); x.fill(); }
      x.fillStyle = 'rgba(180,170,150,0.12)'; x.fillRect(0, 0, w, h);
    }, { repeat: true });
  },
  /** 石砌台基：錯縫的長方石塊（三平面投影用，1 張 ≈ 1.6 公尺） */
  get ashlar() {
    return cache.ashlar ||= make(256, 256, (x, w, h) => {
      const r = rand(101);
      x.fillStyle = '#8c8676'; x.fillRect(0, 0, w, h);
      const rows = 5, rh = h / rows;
      for (let j = 0; j < rows; j++) {
        let px = j % 2 ? -40 : 0;
        while (px < w) {
          const bw = 60 + r() * 50, v = 176 + r() * 36;
          x.fillStyle = `rgb(${v},${v - 6},${v - 18})`;
          x.fillRect(px + 2, j * rh + 2, bw - 4, rh - 4);
          if (px + bw > w) { x.fillRect(px + 2 - w, j * rh + 2, bw - 4, rh - 4); }
          px += bw;
        }
      }
      for (let i = 0; i < 2600; i++) { const v = r() * 255; x.fillStyle = `rgba(${v},${v},${v * 0.92},0.07)`; x.fillRect(r() * w, r() * h, 2 + r() * 4, 2 + r() * 4); }
    }, { repeat: true });
  },
  /** 灰泥牆：微微的斑駁與水漬 */
  get plaster() {
    return cache.plaster ||= make(256, 256, (x, w, h) => {
      const r = rand(111);
      x.fillStyle = '#e6decb'; x.fillRect(0, 0, w, h);
      for (let i = 0; i < 160; i++) {
        const px = r() * w, py = r() * h, s = 8 + r() * 40, v = r() > 0.5 ? 255 : 150;
        const g = x.createRadialGradient(px, py, 0, px, py, s); g.addColorStop(0, `rgba(${v},${v - 6},${v - 20},0.06)`); g.addColorStop(1, 'rgba(0,0,0,0)');
        x.fillStyle = g; x.fillRect(px - s, py - s, s * 2, s * 2);
      }
      for (let i = 0; i < 3000; i++) { const v = 200 + r() * 55; x.fillStyle = `rgba(${v},${v},${v - 10},0.12)`; x.fillRect(r() * w, r() * h, 1.5, 1.5); }
    }, { repeat: true });
  },
  /** 木紋（柱、樑、門框） */
  get wood() {
    return cache.wood ||= make(128, 128, (x, w, h) => {
      const r = rand(121);
      x.fillStyle = '#b9b0a2'; x.fillRect(0, 0, w, h);
      for (let i = 0; i < 70; i++) { const v = 150 + r() * 90; x.strokeStyle = `rgba(${v},${v - 10},${v - 25},0.35)`; x.lineWidth = 1 + r() * 2; const px = r() * w; x.beginPath(); x.moveTo(px, 0); x.bezierCurveTo(px + (r() - 0.5) * 8, h * 0.3, px + (r() - 0.5) * 8, h * 0.7, px, h); x.stroke(); }
    }, { repeat: true });
  },
  /** 岩石細節：灰階斑點（與頂點色相乘） */
  get rock() {
    return cache.rock ||= make(128, 128, (x, w, h) => {
      const r = rand(131);
      x.fillStyle = '#c8c8c8'; x.fillRect(0, 0, w, h);
      for (let i = 0; i < 1600; i++) { const v = 120 + r() * 135; x.fillStyle = `rgba(${v},${v},${v},0.25)`; x.beginPath(); x.arc(r() * w, r() * h, 0.6 + r() * 2.2, 0, 7); x.fill(); }
      for (let i = 0; i < 18; i++) { x.strokeStyle = 'rgba(70,70,70,0.25)'; x.lineWidth = 1; let px = r() * w, py = r() * h; x.beginPath(); x.moveTo(px, py); for (let k = 0; k < 5; k++) { px += (r() - 0.5) * 30; py += (r() - 0.5) * 30; x.lineTo(px, py); } x.stroke(); }
    }, { repeat: true });
  },
  /** 柔和的圓形陰影（建築底部的接觸陰影） */
  get contact() {
    return cache.contact ||= make(128, 128, (x) => {
      const g = x.createRadialGradient(64, 64, 4, 64, 64, 64);
      g.addColorStop(0, 'rgba(0,0,0,0.55)'); g.addColorStop(0.55, 'rgba(0,0,0,0.3)'); g.addColorStop(1, 'rgba(0,0,0,0)');
      x.fillStyle = g; x.fillRect(0, 0, 128, 128);
    });
  },
};

/**
 * 三平面投影（triplanar）：依世界座標貼圖，讓同一種材質在大小不同的構件上維持一致的紋理尺度。
 * scale = 每公尺重複幾次。
 */
export function triplanar(material, scale = 0.6, key = 'tri') {
  material.customProgramCacheKey = () => `${key}`;
  material.onBeforeCompile = (sh) => {
    sh.uniforms.uTriScale = { value: scale };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vTriPos;\nvarying vec3 vTriN;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvTriPos = (modelMatrix * vec4(transformed, 1.0)).xyz;\nvTriN = normalize(mat3(modelMatrix) * objectNormal);');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vTriPos;\nvarying vec3 vTriN;\nuniform float uTriScale;')
      .replace('#include <map_fragment>', `
        vec3 tw = pow(abs(normalize(vTriN)), vec3(4.0)); tw /= (tw.x + tw.y + tw.z);
        vec3 tp = vTriPos * uTriScale;
        vec4 tcol = texture2D(map, tp.zy) * tw.x + texture2D(map, tp.xz) * tw.y + texture2D(map, tp.xy) * tw.z;
        diffuseColor *= tcol;`);
  };
  material.needsUpdate = true;
  return material;
}
