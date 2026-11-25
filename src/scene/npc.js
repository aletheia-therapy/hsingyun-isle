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

const LOOKS = {
  elder: { skin: '#d9ad86', hair: '#c9c4bb', pants: '#5b5146', scale: 0.92, bun: true },
  student: { skin: '#e2b893', hair: '#2b211b', pants: '#3f4a5c', scale: 0.98, bag: true },
  guide: { skin: '#e0b58f', hair: '#2b211b', pants: '#e8dcc0', scale: 1, hat: true },
};

export function villager(look = 'student', color = '#5f9a8b') {
  const L = LOOKS[look] || LOOKS.student;
  const group = new THREE.Group();
  const body = new THREE.Group(); group.add(body);
  const top = mat(color, { r: 0.85 }), skin = mat(L.skin, { r: 0.8 }), hair = mat(L.hair, { r: 0.9 }), pants = mat(L.pants, { r: 0.95 });
  const add = (geo, m, x, y, z, parent = body) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.castShadow = true; parent.add(o); return o; };
  const legs = [-1, 1].map((sx) => {
    const leg = new THREE.Group(); leg.position.set(sx * 0.075, 0.5, 0); body.add(leg);
    add(new THREE.CylinderGeometry(0.06, 0.055, 0.44, 8), pants, 0, -0.22, 0, leg);
    add(new THREE.BoxGeometry(0.1, 0.06, 0.17), mat('#3a3028'), 0, -0.46, 0.03, leg);
    return leg;
  });
  const torso = new THREE.Group(); torso.position.y = 0.5; body.add(torso);
  add(new THREE.CylinderGeometry(0.15, 0.18, 0.46, 14), top, 0, 0.22, 0, torso);
  add(new THREE.SphereGeometry(0.15, 14, 10), top, 0, 0.44, 0, torso).scale.set(1.05, 0.5, 0.9);
  const head = new THREE.Group(); head.position.y = 0.62; torso.add(head);
  add(new THREE.SphereGeometry(0.13, 16, 12), skin, 0, 0, 0, head);
  add(new THREE.SphereGeometry(0.138, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.55), hair, 0, 0.02, -0.01, head).rotation.x = -0.25;
  if (L.bun) add(new THREE.SphereGeometry(0.06, 10, 8), hair, 0, 0.07, -0.12, head);
  if (L.hat) { add(new THREE.CylinderGeometry(0.2, 0.2, 0.02, 20), mat('#d9c08a'), 0, 0.1, 0, head); add(new THREE.CylinderGeometry(0.11, 0.13, 0.08, 16), mat('#d9c08a'), 0, 0.15, 0, head); }
  if (L.bag) add(new THREE.BoxGeometry(0.22, 0.28, 0.1), mat('#6a5a48'), 0, 0.25, -0.18, torso);
  const arms = [-1, 1].map((sx) => {
    const arm = new THREE.Group(); arm.position.set(sx * 0.19, 0.42, 0); torso.add(arm);
    add(new THREE.CylinderGeometry(0.045, 0.04, 0.36, 8), top, 0, -0.18, 0, arm);
    add(new THREE.SphereGeometry(0.045, 8, 6), skin, 0, -0.38, 0, arm);
    return arm;
  });
  // 頭頂的狀態標記
  const badge = new THREE.Sprite(BADGE.need);
  badge.scale.setScalar(0.42); badge.position.y = 1.55; badge.renderOrder = 10;
  group.add(badge);
  // 腳下陰影
  const blobGeo = new THREE.CircleGeometry(0.28, 18); blobGeo.rotateX(-Math.PI / 2);
  const blob = new THREE.Mesh(blobGeo, new THREE.MeshBasicMaterial({ color: '#000', transparent: true, opacity: 0.22, depthWrite: false }));
  blob.position.y = 0.03; group.add(blob);
  group.scale.setScalar(1.7 * L.scale);

  let mood = 'sad', moving = false, clock = Math.random() * 10;
  const api = {
    group,
    setMood(m) { mood = m; },
    setBadge(k) { badge.visible = !!k; if (k) badge.material = BADGE[k]; },
    set moving(v) { moving = v; },
    update(dt) {
      clock += dt;
      badge.position.y = 1.55 + Math.sin(clock * 2.4) * 0.05;
      if (moving) {
        legs.forEach((l, i) => { l.rotation.x = Math.sin(clock * 9 + i * Math.PI) * 0.55; });
        arms.forEach((a, i) => { a.rotation.x = Math.sin(clock * 9 + i * Math.PI + Math.PI) * 0.4; a.rotation.z = 0; });
        torso.rotation.x = 0; head.rotation.x = 0;
        body.position.y = Math.abs(Math.sin(clock * 9)) * 0.025;
        return;
      }
      legs.forEach((l) => { l.rotation.x *= 0.85; });
      body.position.y = 0;
      if (mood === 'sad') {
        torso.rotation.x = 0.18 + Math.sin(clock * 1.1) * 0.02; head.rotation.x = 0.35;
        arms.forEach((a) => { a.rotation.x = 0.1; a.rotation.z = 0; });
      } else if (mood === 'happy') {
        torso.rotation.x = -0.03; head.rotation.x = -0.1;
        arms[0].rotation.x = 0; arms[0].rotation.z = 0;
        arms[1].rotation.x = 0; arms[1].rotation.z = 2.4 + Math.sin(clock * 6) * 0.35;   // 揮手
        body.position.y = Math.max(0, Math.sin(clock * 3)) * 0.03;
      } else {
        torso.rotation.x = Math.sin(clock * 1.3) * 0.02; head.rotation.x = Math.sin(clock * 0.7) * 0.06;
        arms.forEach((a) => { a.rotation.x *= 0.9; a.rotation.z *= 0.9; });
      }
    },
  };
  return api;
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
