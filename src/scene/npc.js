import * as THREE from 'three';
import { mat, glowMaterial, lantern } from './props.js';

/** 島民、互動光圈與任務物件 */

function badgeTexture(text, bg, fg = '#ffffff') {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const x = c.getContext('2d');
  x.fillStyle = 'rgba(0,0,0,0.18)'; x.beginPath(); x.arc(64, 68, 50, 0, 7); x.fill();
  x.fillStyle = bg; x.beginPath(); x.arc(64, 62, 50, 0, 7); x.fill();
  x.strokeStyle = '#ffffff'; x.lineWidth = 6; x.stroke();
  x.fillStyle = fg; x.font = '900 70px "Noto Serif TC", serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
  x.fillText(text, 64, 66);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
const BADGE = {
  need: new THREE.SpriteMaterial({ map: badgeTexture('!', '#d89a2e'), depthTest: false, transparent: true }),
  quest: new THREE.SpriteMaterial({ map: badgeTexture('…', '#5a6fa6'), depthTest: false, transparent: true }),
  done: new THREE.SpriteMaterial({ map: badgeTexture('♥', '#c4724f'), depthTest: false, transparent: true }),
  talk: new THREE.SpriteMaterial({ map: badgeTexture('?', '#4f8a83'), depthTest: false, transparent: true }),
};

const _LOOKS_UNUSED = {
  elder: { skin: '#d9ad86', hair: '#c9c4bb', pants: '#5b5146', scale: 0.92, bun: true },
  student: { skin: '#e2b893', hair: '#2b211b', pants: '#3f4a5c', scale: 0.98, bag: true },
  guide: { skin: '#e0b58f', hair: '#2b211b', pants: '#e8dcc0', scale: 1, hat: true },
};

export function villager(look = 'student', color = '#5f9a8b', name = '') {
  const female = /婆|姨|雨|娜|蓮|安/.test(name);
  const cfg = {
    elder: { skin: '#d2a37c', hair: '#cdc8bf', pants: '#4f463c', height: 0.95, stoop: 0.12 },
    student: { skin: '#dcae88', hair: '#231b16', pants: '#3b4658', height: 1.0, stoop: 0 },
    guide: { skin: '#d9aa84', hair: '#231b16', pants: '#e3d6b8', height: 1.0, stoop: 0 },
  }[look] || {};
  const f = humanFigure({ ...cfg, top: color, hairStyle: female ? (look === 'elder' ? 'bun' : 'long') : 'short' });
  const group = new THREE.Group();
  group.add(f.root);
  if (look === 'student') { const bag = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.32, 0.12), mat('#6a5a48', { r: 0.8 })); bag.position.set(0, 0.32, -0.16); bag.castShadow = true; f.torso.add(bag); }
  if (look === 'guide') { const hat = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.015, 24), mat('#d9c08a')); hat.position.y = 0.1; f.head.add(hat); const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.11, 0.07, 16), mat('#d9c08a')); crown.position.y = 0.14; f.head.add(crown); }
  const badge = new THREE.Sprite(BADGE.need);
  badge.scale.setScalar(0.34); badge.position.y = 2.05; badge.renderOrder = 10;
  group.add(badge);
  const blobGeo = new THREE.CircleGeometry(0.3, 18); blobGeo.rotateX(-Math.PI / 2);
  const blob = new THREE.Mesh(blobGeo, new THREE.MeshBasicMaterial({ color: '#000', transparent: true, opacity: 0.2, depthWrite: false }));
  blob.position.y = 0.03; group.add(blob);
  let mood = 'sad', moving = false, clock = Math.random() * 10, phase = 0;
  return {
    group,
    setMood(m) { mood = m; },
    setBadge(k) { badge.visible = !!k; if (k) badge.material = BADGE[k]; },
    set moving(v) { moving = v; },
    update(dt) {
      clock += dt; if (moving) phase += dt * 9;
      badge.position.y = 2.05 + Math.sin(clock * 2.4) * 0.04;
      animateFigure(f, { walking: moving, phase, mood, t: clock });
    },
  };
}

/** 地上的互動光圈：靠近時變亮 */
export function ringMarker(color = '#d8a24a') {
  const g = new THREE.Group();
  const m = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.55, depthWrite: false, side: THREE.DoubleSide });
  const r = new THREE.Mesh(new THREE.RingGeometry(0.95, 1.12, 48), m);
  r.rotation.x = -Math.PI / 2; g.add(r);
  const inner = new THREE.Mesh(new THREE.CircleGeometry(0.95, 48), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.08, depthWrite: false }));
  inner.rotation.x = -Math.PI / 2; inner.position.y = -0.005; g.add(inner);
  let clock = 0, hot = false;
  return {
    group: g,
    set hot(v) { hot = v; },
    update(dt) { clock += dt; const s = 1 + Math.sin(clock * 3) * 0.04; r.scale.setScalar(hot ? s * 1.08 : s); m.opacity = hot ? 0.9 : 0.45 + Math.sin(clock * 2) * 0.1; },
  };
}

/** 任務物件：柳丁、感謝卡、待點亮的燈 */
export function questItem(kind) {
  const g = new THREE.Group();
  const inner = new THREE.Group(); g.add(inner);
  let light = null;
  if (kind === 'orange') {
    const o = new THREE.Mesh(new THREE.SphereGeometry(0.16, 16, 12), mat('#e8862a', { r: 0.55 })); o.castShadow = true; inner.add(o);
    const lf = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6).scale(1.6, 0.3, 0.8), mat('#4f7a3a')); lf.position.set(0.05, 0.16, 0); inner.add(lf);
    inner.position.y = 0.17;
  } else if (kind === 'card') {
    const c = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.3, 0.02), mat('#fff8ea', { r: 0.7 })); c.castShadow = true; inner.add(c);
    const h = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.1, 0.025), mat('#d65a5a')); h.position.set(0, 0.02, 0.005); inner.add(h);
    inner.position.y = 0.55;
  } else if (kind === 'lotus') {
    const pad = new THREE.Mesh(new THREE.CircleGeometry(0.55, 20), mat('#4f8a4c', { r: 0.8, side: THREE.DoubleSide })); pad.rotation.x = -Math.PI / 2; pad.position.y = 0.04; inner.add(pad);
    for (let i = 0; i < 8; i++) { const p = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 8).scale(0.45, 0.3, 1), mat(i % 2 ? '#f4c6d1' : '#fbe1e7', { r: 0.6 })); const a = (i / 8) * Math.PI * 2; p.position.set(Math.cos(a) * 0.14, 0.14, Math.sin(a) * 0.14); p.rotation.set(0.6, -a + Math.PI / 2, 0); inner.add(p); }
    inner.position.y = 0.02;
  } else if (kind === 'lamp') {
    const lg = new THREE.Group(); lantern(lg, 0, 0, 0, 1.15, false); inner.add(lg);
    light = new THREE.Sprite(glowMaterial.clone()); light.material.opacity = 0.85; light.scale.setScalar(1.6); light.position.y = 0.95; light.visible = false; inner.add(light);
    const bulb = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.26, 0.24), mat('#fff0c8', { e: '#ffb050', ei: 2 })); bulb.position.y = 0.95; bulb.visible = false; inner.add(bulb);
    light.userData.bulb = bulb;
  }
  // 提示用的小光暈
  const hint = new THREE.Sprite(glowMaterial.clone()); hint.material.opacity = 0.55; hint.scale.setScalar(kind === 'lamp' ? 0.01 : 0.9); hint.position.y = inner.position.y || 0.5; g.add(hint);
  let clock = Math.random() * 6, state = 'idle', fade = 1;
  return {
    group: g, kind,
    get done() { return state !== 'idle'; },
    collect() {
      if (state !== 'idle') return;
      state = kind === 'lamp' ? 'lit' : 'gone';
      if (light) { light.visible = true; light.userData.bulb.visible = true; }
    },
    update(dt) {
      clock += dt;
      if (kind !== 'lamp') {
        inner.rotation.y += dt * 1.6;
        if (kind === 'lotus') { inner.rotation.y = clock * 0.3; inner.position.y = 0.02; hint.material.opacity = 0.35 + Math.sin(clock * 1.6) * 0.2; return void (state === 'gone' && (g.visible = false)); }
        inner.position.y = (kind === 'card' ? 0.55 : 0.17) + Math.sin(clock * 2.5) * 0.06;
        hint.material.opacity = 0.35 + Math.sin(clock * 3) * 0.15;
      } else if (light?.visible) light.scale.setScalar(1.5 + Math.sin(clock * 6) * 0.08);
      if (state === 'gone' && fade > 0) {
        fade = Math.max(0, fade - dt * 3);
        g.scale.setScalar(fade); g.position.y += dt * 2;
        if (fade === 0) g.visible = false;
      }
    },
  };
}

/**
 * 寫實比例的人物（約 1.7 公尺，七頭身）：骨盆、軀幹、頸、頭、四肢用膠囊體，
 * 有手掌、鞋子、耳朵、眼睛與鼻子。回傳各關節，讓呼叫端做走路動畫。
 */
export function humanFigure({ top = '#4f8a83', pants = '#3f4a5c', skin = '#d8a982', hair = '#2b211b', shoe = '#3a3028', hairStyle = 'short', height = 1.0, stoop = 0 } = {}) {
  const root = new THREE.Group();
  const body = new THREE.Group(); root.add(body);
  const M_ = {
    top: mat(top, { r: 0.88 }), pants: mat(pants, { r: 0.92 }), skin: mat(skin, { r: 0.75 }),
    hair: mat(hair, { r: 0.85 }), shoe: mat(shoe, { r: 0.7 }), eye: mat('#1f1a16', { r: 0.4 }),
  };
  const mesh = (geo, m, x, y, z, parent) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.castShadow = true; (parent || body).add(o); return o; };
  const cap = (r, len) => new THREE.CapsuleGeometry(r, len, 4, 10);
  const legs = [-1, 1].map((sx) => {
    const hip = new THREE.Group(); hip.position.set(sx * 0.085, 0.9, 0); body.add(hip);
    mesh(cap(0.068, 0.36), M_.pants, 0, -0.22, 0, hip);
    const knee = new THREE.Group(); knee.position.y = -0.43; hip.add(knee);
    mesh(cap(0.055, 0.34), M_.pants, 0, -0.2, 0, knee);
    mesh(new THREE.BoxGeometry(0.1, 0.07, 0.24).translate(0, 0, 0.04), M_.shoe, 0, -0.43, 0.0, knee);
    hip.userData.knee = knee;
    return hip;
  });
  const torso = new THREE.Group(); torso.position.y = 0.9; torso.rotation.x = stoop; body.add(torso);
  mesh(new THREE.CylinderGeometry(0.15, 0.14, 0.16, 16), M_.pants, 0, 0.04, 0, torso);
  const chest = mesh(cap(0.15, 0.3), M_.top, 0, 0.32, 0, torso); chest.scale.set(1.15, 1, 0.72);
  mesh(new THREE.CylinderGeometry(0.048, 0.055, 0.1, 10), M_.skin, 0, 0.58, 0, torso);
  const head = new THREE.Group(); head.position.y = 0.7; torso.add(head);
  const skull = mesh(new THREE.SphereGeometry(0.105, 20, 16), M_.skin, 0, 0, 0, head); skull.scale.set(0.92, 1.1, 1);
  mesh(new THREE.SphereGeometry(0.012, 8, 6), M_.eye, -0.036, 0.012, 0.092, head);
  mesh(new THREE.SphereGeometry(0.012, 8, 6), M_.eye, 0.036, 0.012, 0.092, head);
  mesh(new THREE.ConeGeometry(0.014, 0.035, 6).rotateX(Math.PI / 2), M_.skin, 0, -0.012, 0.106, head);
  for (const sx of [-1, 1]) mesh(new THREE.SphereGeometry(0.022, 8, 6).scale(0.5, 1, 0.8), M_.skin, sx * 0.097, 0, 0, head);
  const hairCap = mesh(new THREE.SphereGeometry(0.114, 20, 14, 0, Math.PI * 2, 0, Math.PI * 0.55), M_.hair, 0, 0.018, -0.01, head);
  hairCap.scale.set(0.96, 1.05, 1.04); hairCap.rotation.x = -0.32;
  if (hairStyle === 'bun') mesh(new THREE.SphereGeometry(0.05, 12, 10), M_.hair, 0, 0.06, -0.11, head);
  if (hairStyle === 'long') { const h = mesh(cap(0.08, 0.16), M_.hair, 0, -0.1, -0.06, head); h.scale.set(1.15, 1, 0.6); }
  const arms = [-1, 1].map((sx) => {
    const sh = new THREE.Group(); sh.position.set(sx * 0.2, 0.5, 0); torso.add(sh);
    mesh(new THREE.SphereGeometry(0.06, 10, 8), M_.top, 0, 0, 0, sh);
    mesh(cap(0.048, 0.24), M_.top, 0, -0.16, 0, sh);
    const el = new THREE.Group(); el.position.y = -0.31; sh.add(el);
    mesh(cap(0.04, 0.2), M_.skin, 0, -0.13, 0, el);
    mesh(new THREE.SphereGeometry(0.045, 10, 8).scale(0.8, 1.1, 0.6), M_.skin, 0, -0.29, 0, el);
    sh.userData.elbow = el; sh.rotation.z = sx * 0.06;
    return sh;
  });
  root.scale.setScalar(height);
  return { root, body, torso, head, legs, arms, mats: M_ };
}

/** 走路／站立動畫（給旅人與島民共用） */
export function animateFigure(f, { walking, phase, amp = 1, mood = 'idle', t = 0 }) {
  const [la, ra] = f.arms, [ll, rl] = f.legs;
  if (walking) {
    const s = Math.sin(phase), c = Math.cos(phase);
    ll.rotation.x = s * 0.6 * amp; rl.rotation.x = -s * 0.6 * amp;
    ll.userData.knee.rotation.x = Math.max(0, -c) * 0.9 * amp; rl.userData.knee.rotation.x = Math.max(0, c) * 0.9 * amp;
    la.rotation.x = -s * 0.5 * amp; ra.rotation.x = s * 0.5 * amp;
    la.userData.elbow.rotation.x = -0.35; ra.userData.elbow.rotation.x = -0.35;
    f.body.position.y = Math.abs(Math.cos(phase)) * 0.035 * amp;
    f.head.rotation.x = 0;
    return;
  }
  for (const l of f.legs) { l.rotation.x *= 0.8; l.userData.knee.rotation.x *= 0.8; }
  f.body.position.y = 0;
  if (mood === 'sad') {
    f.head.rotation.x = 0.32; la.rotation.x = 0.05; ra.rotation.x = 0.05; la.userData.elbow.rotation.x = -0.1; ra.userData.elbow.rotation.x = -0.1; ra.rotation.z = 0.06;
  } else if (mood === 'happy') {
    f.head.rotation.x = -0.08; la.rotation.x = 0;
    ra.rotation.z = 2.5 + Math.sin(t * 6) * 0.25; ra.userData.elbow.rotation.x = -0.3;
  } else {
    f.head.rotation.x = Math.sin(t * 0.6) * 0.05;
    la.rotation.x *= 0.85; ra.rotation.x *= 0.85; ra.rotation.z += (0.06 - ra.rotation.z) * 0.1;
    la.userData.elbow.rotation.x = -0.12; ra.userData.elbow.rotation.x = -0.12;
  }
}
