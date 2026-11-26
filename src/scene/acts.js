import * as THREE from 'three';
import { mat, glowMaterial } from './props.js';

/**
 * 島民各自在做的事：掃地、撿柳丁、滑手機、靜坐、畫畫、修燈籠、炒菜、看地圖、海邊釣魚、劈柴。
 * 每一種活動有一組「目標姿勢」（隨時間變化的關節角度）與身邊的道具；
 * 人物會慢慢轉到目標姿勢，旅人走近時轉頭看他。
 *
 * 姿勢欄位（人物本地座標，弧度；沒寫的就回到自然站姿）：
 *   lhx/rhx 大腿前後、lhy/rhy 大腿自轉、lhz/rhz 大腿外張、lk/rk 膝蓋彎曲
 *   lsx/rsx 手臂前後、lsy/rsy 手臂自轉、lsz/rsz 手臂外張、le/re 手肘彎曲
 *   tx/ty/tz 上身前彎／扭轉／側傾、by 身體下降（坐下）、bz 身體前後、hx/hy/hz 頭部低頭／轉頭／歪頭
 */
const L = (a, b, k) => a + (b - a) * k;
const ss = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));

export function setPose(f, p, k) {
  const [ll, rl] = f.legs, [la, ra] = f.arms, st = f.torso.userData.stoop || 0;
  ll.rotation.set(L(ll.rotation.x, p.lhx ?? 0, k), L(ll.rotation.y, p.lhy ?? 0, k), L(ll.rotation.z, p.lhz ?? 0, k));
  rl.rotation.set(L(rl.rotation.x, p.rhx ?? 0, k), L(rl.rotation.y, p.rhy ?? 0, k), L(rl.rotation.z, p.rhz ?? 0, k));
  ll.userData.knee.rotation.x = L(ll.userData.knee.rotation.x, p.lk ?? 0, k);
  rl.userData.knee.rotation.x = L(rl.userData.knee.rotation.x, p.rk ?? 0, k);
  la.rotation.set(L(la.rotation.x, p.lsx ?? 0, k), L(la.rotation.y, p.lsy ?? 0, k), L(la.rotation.z, p.lsz ?? -0.06, k));
  ra.rotation.set(L(ra.rotation.x, p.rsx ?? 0, k), L(ra.rotation.y, p.rsy ?? 0, k), L(ra.rotation.z, p.rsz ?? 0.06, k));
  la.userData.elbow.rotation.x = L(la.userData.elbow.rotation.x, p.le ?? -0.12, k);
  ra.userData.elbow.rotation.x = L(ra.userData.elbow.rotation.x, p.re ?? -0.12, k);
  f.torso.rotation.set(L(f.torso.rotation.x, st + (p.tx ?? 0), k), L(f.torso.rotation.y, p.ty ?? 0, k), L(f.torso.rotation.z, p.tz ?? 0, k));
  f.body.position.y = L(f.body.position.y, p.by ?? 0, k);
  f.body.position.z = L(f.body.position.z, p.bz ?? 0, k);
  f.head.rotation.x = L(f.head.rotation.x, p.hx ?? 0, k);
  f.head.rotation.z = L(f.head.rotation.z, p.hz ?? 0, k);
}
/** 回到站姿（開始走路前，把坐姿、外張等走路動畫不會處理的關節收回來） */
export function unPose(f, k) {
  for (const l of f.legs) { l.rotation.y = L(l.rotation.y, 0, k); l.rotation.z = L(l.rotation.z, 0, k); }
  for (const a of f.arms) a.rotation.y = L(a.rotation.y, 0, k);
  f.torso.rotation.y = L(f.torso.rotation.y, 0, k); f.torso.rotation.z = L(f.torso.rotation.z, 0, k);
  f.body.position.z = L(f.body.position.z, 0, k);
  f.root.rotation.y = L(f.root.rotation.y, 0, k);
}

/* ---------- 常用姿勢 ---------- */
/** 坐在高 h 公尺的椅子上（H：人物身高比例），雙腳著地 */
const sit = (h, H = 1) => ({ lhx: -1.5, rhx: -1.5, lk: 1.5, rk: 1.5, by: (h + 0.07) / H - 0.9 });
/** 揮手（右手） */
const waveR = (t) => ({ rsz: 2.5 + Math.sin(t * 7) * 0.25, rsx: -0.2, re: -0.3 });

/* ---------- 道具 ---------- */
const wood = () => mat('#8a6440', { r: 0.85 }), woodDk = () => mat('#5e4128', { r: 0.9 });
function mesh(geo, material, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) {
  const m = new THREE.Mesh(geo, material); m.position.set(x, y, z); m.rotation.set(rx, ry, rz); m.castShadow = true; m.receiveShadow = true; return m;
}
function stool(h = 0.42) {
  const g = new THREE.Group();
  g.add(mesh(new THREE.CylinderGeometry(0.19, 0.19, 0.05, 14), wood(), 0, h - 0.025, 0));
  for (let i = 0; i < 3; i++) { const a = i * 2.09; g.add(mesh(new THREE.CylinderGeometry(0.022, 0.026, h - 0.04, 6), woodDk(), Math.cos(a) * 0.12, (h - 0.04) / 2, Math.sin(a) * 0.12)); }
  return g;
}
function bench(w = 1.3, h = 0.42) {
  const g = new THREE.Group();
  g.add(mesh(new THREE.BoxGeometry(w, 0.06, 0.36), wood(), 0, h - 0.03, 0));
  for (const sx of [-1, 1]) g.add(mesh(new THREE.BoxGeometry(0.07, h - 0.06, 0.3), woodDk(), sx * (w / 2 - 0.12), (h - 0.06) / 2, 0));
  return g;
}
/** 拿在手上的東西：掛在前臂上（手的位置大約在前臂 0.29 公尺處） */
function inHand(f, side, obj, [x, y, z] = [0, -0.29, 0.02], [rx, ry, rz] = [0, 0, 0]) {
  const el = f.arms[side === 'l' ? 0 : 1].userData.elbow;
  obj.position.set(x, y, z); obj.rotation.set(rx, ry, rz);
  el.add(obj);
  return obj;
}
function glowSprite(color, size, opacity) {
  const s = new THREE.Sprite(glowMaterial.clone()); s.material.color.set(color); s.material.opacity = opacity; s.scale.setScalar(size); return s;
}

/* ---------- 各位島民的活動 ---------- */
export const ACTS = {
  /** 小蓮：在源頭碑前掃地；有人走近就停下來揮手打招呼 */
  sweep: {
    tagH: () => 2.0,
    build(f) {
      const broom = new THREE.Group();
      broom.add(mesh(new THREE.CylinderGeometry(0.016, 0.016, 1.25, 6), wood(), 0, 0, 0));
      const head = mesh(new THREE.ConeGeometry(0.13, 0.32, 10, 1, true), mat('#b89a5a', { r: 1, side: THREE.DoubleSide }), 0, -0.72, 0);
      broom.add(head);
      inHand(f, 'r', broom, [0, -0.3, 0.03], [0.55, 0, 0.35]);
      return { broom };
    },
    pose(t, mood, s, c) {
      if (c.near < 4.5) return { ...waveR(t), lsx: -0.15, hx: -0.05 };      // 停下來揮手
      const w = Math.sin(t * 2.4);
      return { tx: 0.18, ty: w * 0.22, rsx: -0.55 + w * 0.12, re: -0.55, rsz: -0.25, lsx: -0.9 + w * 0.1, le: -0.75, lsz: 0.35, hx: 0.25, hy: w * 0.15 };
    },
  },

  /** 阿婆：彎著腰、一手扶著腰，一顆一顆撿柳丁；幫她撿回來之後，坐在小凳子上剝柳丁 */
  pick: {
    tagH: (mood) => (mood === 'happy' ? 1.45 : 1.6),
    build(f, g) {
      const st = stool(0.36); st.visible = false; g.add(st);
      const orange = mesh(new THREE.SphereGeometry(0.06, 12, 10), mat('#e07b22', { r: 0.55 }));
      inHand(f, 'r', orange, [0, -0.33, 0.04]);
      return { st, orange };
    },
    pose(t, mood, s) {
      s.st.visible = mood === 'happy';
      if (mood === 'happy') {
        const peel = Math.sin(t * 2.2);
        return { ...sit(0.36, 0.93), tx: 0.12, lsx: -0.95, le: -1.0, lsz: 0.25, rsx: -0.9 + peel * 0.06, re: -1.15 + peel * 0.1, rsz: -0.2, hx: 0.3 };
      }
      const reach = (Math.sin(t * 0.9) + 1) / 2;                           // 慢慢伸手、撿起、站直一點
      return { lhx: -0.55, rhx: -0.35, lk: 0.95, rk: 0.7, by: -0.12, tx: 0.55 + reach * 0.3, rsx: -0.6 - reach * 0.6, re: -0.3, rsz: -0.1, lsx: 0.75, lsz: -0.35, le: -1.5, hx: -0.3 };
    },
  },

  /** 阿哲：坐在板凳上，低頭盯著手機裡吵成一團的群組；問題解決後，放下手機、抬頭看看四周 */
  phone: {
    tagH: () => 1.55,
    build(f, g) { const b = bench(1.2); g.add(b); return {}; },
    pose(t, mood) {
      const base = sit(0.42);
      if (mood === 'happy') {
        const wave = (t % 9) < 2;
        return { ...base, tx: 0.02, lsx: -0.55, le: -0.95, lsz: 0.15, ...(wave ? waveR(t) : { rsx: -0.5, re: -0.8 }), hx: -0.05 };
      }
      const tap = Math.sin(t * 11) * 0.05;
      return { ...base, tx: 0.42, lsx: -0.75, le: -1.35, lsz: 0.2, rsx: -0.72, re: -1.4 + tap, rsz: -0.22, hx: 0.55 };
    },
  },

  /** 小雨：坐在湖邊的樹下。心亂時抱著膝蓋、頭埋在膝上；靜下來之後盤腿靜坐，身上有一圈淡淡的光 */
  meditate: {
    tagH: () => 1.25,
    build(f, g) {
      const cushion = mesh(new THREE.CylinderGeometry(0.3, 0.32, 0.1, 18), mat('#a65e6e', { r: 0.9 }), 0, 0.05, 0);
      g.add(cushion);
      const halo = glowSprite('#ffe2b0', 2.4, 0); halo.position.set(0, 0.75, 0.1); g.add(halo);
      return { halo };
    },
    pose(t, mood, s) {
      const by = (0.1 + 0.07) - 0.9;
      if (mood === 'happy') {
        s.halo.material.opacity = 0.32 + Math.sin(t * 1.2) * 0.08;
        return { by, lhx: -1.45, rhx: -1.45, lhz: -0.55, rhz: 0.55, lhy: 0.6, rhy: -0.6, lk: 2.5, rk: 2.5, tx: -0.04, lsx: -0.45, lsz: 0.42, le: -1.25, rsx: -0.45, rsz: -0.42, re: -1.25, hx: 0.12 };
      }
      s.halo.material.opacity = 0;
      const rock = Math.sin(t * 0.8) * 0.06;
      return { by: (0.08 + 0.07) - 0.9, lhx: -2.15, rhx: -2.15, lhz: -0.12, rhz: 0.12, lk: 2.35, rk: 2.35, tx: 0.55 + rock, lsx: -0.95, lsz: 0.5, le: -1.95, rsx: -0.95, rsz: -0.5, re: -1.95, hx: 0.6 };
    },
  },

  /** 小安：坐在亭子裡的凳子上畫畫。沒信心時畫得很慢、常常停下來低頭；被鼓勵之後畫得起勁，還會抬頭看看風景 */
  sketch: {
    tagH: () => 1.55,
    build(f, g) {
      g.add(stool(0.42));
      const book = mesh(new THREE.BoxGeometry(0.26, 0.02, 0.2), mat('#e8dcc0', { r: 0.9 }));
      inHand(f, 'l', book, [0.06, -0.3, 0.06], [0, 0, -0.2]);
      const pen = mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.14, 5), mat('#c4724f'));
      inHand(f, 'r', pen, [0, -0.32, 0.03], [0.6, 0, 0]);
      return {};
    },
    pose(t, mood) {
      const base = sit(0.42);
      const sp = mood === 'happy' ? 3.4 : 1.3, stop = mood !== 'happy' && (t % 11) > 7;
      const d = stop ? 0 : 1;
      const look = mood === 'happy' && (t % 8) > 6;
      return { ...base, tx: 0.3, lsx: -0.85, le: -1.05, lsz: 0.18, rsx: -0.72 + Math.sin(t * sp) * 0.06 * d, re: -1.15 + Math.cos(t * sp) * 0.1 * d, rsz: -0.12, hx: look ? -0.05 : stop ? 0.7 : 0.45 };
    },
  },

  /** 李伯伯：坐在亭子裡修一盞紙燈籠。整條路的燈亮起來之後，手上的燈籠也亮了，他會舉起來看看 */
  lantern: {
    tagH: () => 1.5,
    build(f, g) {
      g.add(stool(0.42));
      const cane = mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.92, 8), mat('#5a3e28'), 0.32, 0.44, -0.1, 0.25, 0, -0.15);
      g.add(cane);
      const lamp = new THREE.Group();
      const paper = new THREE.MeshStandardMaterial({ color: '#d8c7a0', roughness: 0.8, emissive: '#ff9a40', emissiveIntensity: 0 });
      lamp.add(mesh(new THREE.SphereGeometry(0.13, 16, 12).scale(1, 1.2, 1), paper));
      lamp.add(mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.03, 12), mat('#7a2e22'), 0, 0.16, 0));
      lamp.add(mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.03, 12), mat('#7a2e22'), 0, -0.16, 0));
      const glow = glowSprite('#ffb060', 1.1, 0); lamp.add(glow);
      lamp.position.set(0, 0.68, 0.36);
      g.add(lamp);
      return { lamp, paper, glow };
    },
    pose(t, mood, s) {
      const base = sit(0.42);
      const lit = mood === 'happy', lift = lit && (t % 10) > 7;
      s.paper.emissiveIntensity = lit ? 1.1 + Math.sin(t * 3) * 0.1 : 0;
      s.glow.material.opacity = lit ? 0.55 : 0;
      s.lamp.position.y += ((lift ? 0.95 : 0.68) - s.lamp.position.y) * 0.08;
      s.lamp.position.z += ((lift ? 0.42 : 0.36) - s.lamp.position.z) * 0.08;
      const fid = Math.sin(t * 2.3) * (lit ? 0 : 0.06);
      return { ...base, tx: 0.22, lsx: lift ? -1.25 : -0.85, le: lift ? -0.7 : -1.05, lsz: 0.3, rsx: (lift ? -1.25 : -0.85) + fid, re: lift ? -0.7 : -1.05, rsz: -0.3, hx: lift ? -0.15 : 0.4 };
    },
  },

  /** 阿姨：在亭子裡的小攤子炒菜，鍋子冒著熱氣 */
  cook: {
    tagH: () => 2.0,
    build(f, g) {
      // 小推車上的爐子與炒鍋
      const stall = new THREE.Group();
      stall.add(mesh(new THREE.BoxGeometry(0.8, 0.05, 0.46), wood(), 0, 0.76, 0));
      for (const [x, z] of [[-0.34, -0.18], [0.34, -0.18], [-0.34, 0.18], [0.34, 0.18]]) stall.add(mesh(new THREE.BoxGeometry(0.05, 0.74, 0.05), woodDk(), x, 0.37, z));
      stall.add(mesh(new THREE.BoxGeometry(0.4, 0.14, 0.34), mat('#5a5a5e', { r: 0.6 }), 0.08, 0.85, 0));
      stall.add(mesh(new THREE.SphereGeometry(0.2, 18, 10, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), mat('#2e2e33', { r: 0.4, side: THREE.DoubleSide }), 0.08, 1.12, 0));
      stall.add(mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.28, 6), woodDk(), -0.24, 1.08, 0, 0, 0, Math.PI / 2));
      for (let i = 0; i < 3; i++) stall.add(mesh(new THREE.CylinderGeometry(0.06, 0.045, 0.05, 12), mat('#e9e4d8', { r: 0.4 }), -0.27 + i * 0.0, 0.81 + i * 0.05, -0.1));
      stall.position.set(0, 0, 0.5);
      g.add(stall);
      const steam = [0, 1, 2].map(() => { const sp = glowSprite('#ffffff', 0.5, 0); g.add(sp); return sp; });
      const spat = new THREE.Group();
      spat.add(mesh(new THREE.CylinderGeometry(0.01, 0.01, 0.34, 6), woodDk(), 0, -0.12, 0));
      spat.add(mesh(new THREE.BoxGeometry(0.08, 0.005, 0.1), mat('#9a9a9f', { r: 0.3 }), 0, -0.3, 0));
      inHand(f, 'r', spat, [0, -0.3, 0.04], [0.9, 0, 0]);
      return { steam };
    },
    pose(t, mood, s) {
      s.steam.forEach((sp, i) => {
        const k = ((t * 0.45 + i / 3) % 1);
        sp.position.set(0.08 + Math.sin(t + i) * 0.08, 1.25 + k * 0.7, 0.5 + Math.cos(t * 0.7 + i) * 0.05);
        sp.material.opacity = Math.sin(k * Math.PI) * 0.28; sp.scale.setScalar(0.35 + k * 0.5);
      });
      const st = Math.sin(t * 3.6), sc = Math.cos(t * 3.6);
      const wave = mood === 'happy' && (t % 9) < 1.8;
      return { tx: 0.16, lsx: -0.95, le: -0.75, lsz: 0.2, ...(wave ? waveR(t) : { rsx: -1.05 + st * 0.15, rsz: -0.12 + sc * 0.15, re: -0.75 }), hx: wave ? -0.1 : 0.35 };
    },
  },

  /** 敏娜：拿著地圖東張西望，偶爾轉個方向（迷路了）；帶她到講堂之後，收起地圖開心地揮手 */
  lost: {
    tagH: () => 2.0,
    build() { return { dir: 0, dirT: 0 }; },
    pose(t, mood, s, c) {
      if (mood === 'happy') return { lsx: -0.3, le: -0.6, lsz: 0.1, ...((t % 7) < 2 ? waveR(t) : {}), hx: -0.05 };
      const ph = t % 10;
      s.dirT = ph > 8.5 ? 1 : 0;
      if (ph > 8.5 && !s.turned) { s.dir = THREE.MathUtils.clamp(s.dir + (Math.random() < 0.5 ? -1 : 1) * (0.6 + Math.random() * 0.6), -1.3, 1.3); s.turned = true; }
      if (ph < 8.5) s.turned = false;
      c.f.root.rotation.y += wrap(s.dir - c.f.root.rotation.y) * 0.04;
      const hy = ph < 4 ? 0 : ph < 6 ? 0.85 : ph < 8 ? -0.85 : 0;
      return { lsx: -0.95, le: -1.15, lsz: 0.22, rsx: -0.85, re: -1.15, rsz: -0.25, hx: ph < 4 ? 0.4 : 0.05, hy, tx: 0.05 };
    },
  },

  /** 生悶氣的組員之一：雙手抱胸、頭撇向一邊；和好之後放下手、笑著揮手 */
  crossArms: {
    tagH: () => 2.05,
    build() { return {}; },
    pose(t, mood) {
      if (mood === 'happy') return { lsx: -0.1, ...((t % 8) < 1.8 ? waveR(t) : {}), hx: -0.05 };
      const tap = Math.max(0, Math.sin(t * 2.2)) ** 4 * 0.25;
      return { lhz: -0.06, rhz: 0.1, rhx: -tap, rk: tap * 0.6, tz: 0.05, lsx: -0.95, lsz: 0.55, le: -1.8, rsx: -0.85, rsz: -0.5, re: -1.85, hx: -0.08, hy: 0.6 };
    },
  },
  /** 生悶氣的組員之一：坐在石頭上，手撐著下巴發呆；和好之後坐直、揮揮手 */
  chinRest: {
    tagH: () => 1.55,
    build(f, g) {
      const rock = mesh(new THREE.DodecahedronGeometry(0.33, 0), mat('#8a857a', { r: 0.95 }), 0, 0.1, 0); rock.scale.set(1.15, 0.85, 1); g.add(rock);
      return {};
    },
    pose(t, mood) {
      const base = sit(0.4);
      if (mood === 'happy') return { ...base, tx: 0.05, lsx: -0.55, le: -0.85, ...((t % 8) < 1.8 ? waveR(t) : { rsx: -0.55, re: -0.85 }), hx: -0.05 };
      return { ...base, tx: 0.38, rsx: -0.95, re: -2.15, rsz: -0.12, lsx: -0.55, le: -0.9, lsz: 0.12, hx: 0.12, hz: 0.12 };
    },
  },
  /** 生悶氣的組員之一：雙手插口袋、低頭踢小石子；和好之後抬起頭來 */
  pockets: {
    tagH: () => 2.05,
    build() { return {}; },
    pose(t, mood) {
      if (mood === 'happy') return { ...((t % 8) < 1.8 ? waveR(t) : {}), hx: -0.05 };
      const kick = Math.max(0, Math.sin(t * 1.4)) ** 3;
      return { rhx: -0.45 * kick, rk: 0.35 * kick, lsx: 0.18, lsz: -0.16, le: -0.45, rsx: 0.18, rsz: 0.16, re: -0.45, tx: 0.08, hx: 0.42, hy: -0.2 };
    },
  },

  /** 海邊的漁夫：坐在礁石上釣魚，每隔一陣子把竿子提起來看看 */
  fish: {
    tagH: () => 1.5,
    build(f, g) {
      const rock = mesh(new THREE.DodecahedronGeometry(0.36, 0), mat('#7d786e', { r: 0.95 }), 0, 0.12, 0); rock.scale.set(1.1, 0.8, 1); g.add(rock);
      const rod = new THREE.Group();
      rod.add(mesh(new THREE.CylinderGeometry(0.008, 0.016, 2.6, 6), woodDk(), 0, 1.3, 0));
      const tip = new THREE.Object3D(); tip.position.y = 2.6; rod.add(tip);
      inHand(f, 'r', rod, [0, -0.3, 0.03], [1.85, 0, 0]);
      const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]), new THREE.LineBasicMaterial({ color: '#e8e8e8', transparent: true, opacity: 0.7 }));
      line.frustumCulled = false; g.add(line);
      const float = mesh(new THREE.SphereGeometry(0.04, 10, 8), mat('#d8452e'));
      g.add(float);
      const bucket = mesh(new THREE.CylinderGeometry(0.15, 0.12, 0.25, 12, 1, true), mat('#6f7f8a', { r: 0.5, side: THREE.DoubleSide }), 0.55, 0.125, -0.15);
      g.add(bucket);
      return { tip, line, float, _a: new THREE.Vector3(), _b: new THREE.Vector3() };
    },
    pose(t, mood, s, c) {
      const lift = (t % 12) > 10.2;
      // 釣線：竿尖到水面上的浮標（浮標輕輕上下晃）
      const g = c.group;
      s.tip.getWorldPosition(s._a); g.worldToLocal(s._a);
      const fx = s._a.x, fz = s._a.z + 0.2, fy = (lift ? 0.35 : -g.position.y + 0.02) + Math.sin(t * 2.1) * 0.015;
      s.float.position.set(fx, fy, fz);
      s.line.geometry.attributes.position.setXYZ(0, s._a.x, s._a.y, s._a.z);
      s.line.geometry.attributes.position.setXYZ(1, fx, fy + 0.03, fz);
      s.line.geometry.attributes.position.needsUpdate = true;
      return { ...sit(0.42), tx: 0.12, rsx: lift ? -1.35 : -0.95, re: -0.45, rsz: -0.05, lsx: lift ? -1.15 : -0.8, le: -0.75, lsz: 0.3, hx: 0.12 };
    },
  },

  /** 砍柴的村民：雙手把斧頭舉高、用力劈下，木屑飛起來，再把柴擺好 */
  chop: {
    tagH: () => 2.0,
    build(f, g) {
      g.add(mesh(new THREE.CylinderGeometry(0.28, 0.32, 0.42, 14), wood(), 0, 0.21, 0.62));
      const log = new THREE.Group(); log.position.set(0, 0.42, 0.62); g.add(log);
      const halves = [-1, 1].map((sx) => { const h = mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.34, 10, 1, false, sx > 0 ? 0 : Math.PI, Math.PI), mat('#c49a62', { r: 0.85 }), 0, 0.17, 0); log.add(h); return h; });
      // 旁邊一堆劈好的柴
      for (let i = 0; i < 9; i++) {
        const r = i < 4 ? 0 : i < 7 ? 1 : 2, k = i < 4 ? i : i < 7 ? i - 4 : i - 7;
        g.add(mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.6, 8), wood(), -0.75 + k * 0.15 + r * 0.075, 0.07 + r * 0.13, 0.55, Math.PI / 2, 0.2, 0));
      }
      const axe = new THREE.Group();
      axe.add(mesh(new THREE.CylinderGeometry(0.016, 0.018, 0.75, 6), woodDk(), 0, -0.2, 0));
      axe.add(mesh(new THREE.BoxGeometry(0.035, 0.12, 0.17), mat('#8f949a', { r: 0.35 }), 0, -0.52, 0.05));
      inHand(f, 'r', axe, [0, -0.3, 0.03], [1.5, 0, 0]);
      const chips = [0, 1, 2, 3].map(() => { const m = mesh(new THREE.BoxGeometry(0.04, 0.015, 0.03), mat('#d8b07a')); m.visible = false; g.add(m); return m; });
      return { halves, chips, last: 0 };
    },
    pose(t, mood, s) {
      const T = 2.4, ph = t % T;
      const up = ss(0.15, 1.05, ph), down = ss(1.05, 1.25, ph);
      const k = up * (1 - down);
      // 劈下的那一刻：木頭裂開、木屑飛出
      const hit = ph > 1.25 && ph < 1.9, a = hit ? (ph - 1.25) / 0.65 : 0;
      s.halves.forEach((h, i) => { h.rotation.z = (i ? -1 : 1) * (hit ? Math.min(0.5, a * 1.6) : 0); h.position.x = (i ? 1 : -1) * (hit ? Math.min(0.06, a * 0.2) : 0); });
      s.chips.forEach((c, i) => {
        c.visible = hit;
        if (hit) { const ang = i * 1.6 + 0.4; c.position.set(Math.cos(ang) * a * 0.5, 0.6 + a * 0.9 - a * a * 1.3, 0.62 + Math.sin(ang) * a * 0.5); c.rotation.set(a * 9, a * 7, 0); }
      });
      return {
        lhz: -0.16, rhz: 0.16, lk: 0.15 + down * 0.25, rk: 0.15 + down * 0.25, by: -0.03 - down * 0.04,
        tx: 0.1 - k * 0.3 + down * 0.45, rsx: -0.55 - k * 2.3, lsx: -0.55 - k * 2.3, rsz: -0.25, lsz: 0.25, re: -0.35 + k * 0.15, le: -0.35 + k * 0.15, hx: 0.3 - k * 0.4,
      };
    },
  },
};
