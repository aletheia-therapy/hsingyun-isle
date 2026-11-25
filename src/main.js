import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { VignetteShader } from 'three/addons/shaders/VignetteShader.js';
import { SPOTS, ZONES, START } from './data/spots.js';
import { World } from './scene/world.js';
import { Explorer } from './scene/explorer.js';
import { FrameCamera } from './scene/camera.js';
import { Card } from './ui/card.js';
import { Chat, esc } from './ui/chat.js';
import { state } from './state.js';
import { GUIDE, ABOUT } from './ui/pages.js';

const $ = (id) => document.getElementById(id);
const narrow = () => matchMedia('(max-width: 860px)').matches;

function fail(msg) {
  $('error-msg').textContent = msg;
  $('error').hidden = false;
  $('loading').classList.add('is-out');
}
function webglOK() {
  try { const c = document.createElement('canvas'); return !!(c.getContext('webgl2') || c.getContext('webgl')); } catch { return false; }
}

function boot() {
  if (!webglOK()) { fail('這個瀏覽器目前無法顯示 3D 畫面。請改用新版 Chrome、Edge、Firefox 或 Safari，並確認已開啟硬體加速。'); return; }
  const lowPower = matchMedia('(pointer: coarse)').matches || Math.min(innerWidth, innerHeight) < 600;

  /* ---------- 渲染 ---------- */
  const canvas = $('scene');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', preserveDrawingBuffer: false });
  renderer.setPixelRatio(Math.min(devicePixelRatio, lowPower ? 1.5 : 1.75));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.08;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const world = new World(SPOTS, { lowPower });
  const view = new FrameCamera();
  const explorer = new Explorer();
  world.scene.add(explorer.object);
  explorer.place(START[0], START[1]);
  explorer.faceTowards(0, 0);

  const target = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: lowPower ? 0 : 4 });
  const composer = new EffectComposer(renderer, target);
  composer.addPass(new RenderPass(world.scene, view.camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.12, 0.5, 0.93);
  composer.addPass(bloom);
  const vignette = new ShaderPass(VignetteShader);
  vignette.uniforms.offset.value = 1.0;
  vignette.uniforms.darkness.value = 0.38;
  composer.addPass(vignette);
  // 調色：微降飽和、帶一點宣紙般的暖調
  composer.addPass(new ShaderPass({
    uniforms: { tDiffuse: { value: null } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: 'uniform sampler2D tDiffuse; varying vec2 vUv; void main(){ vec4 c = texture2D(tDiffuse, vUv); float l = dot(c.rgb, vec3(0.299, 0.587, 0.114)); vec3 g = mix(vec3(l), c.rgb, 0.84); g = (g - 0.5) * 1.05 + 0.5; g *= vec3(1.025, 1.0, 0.96); gl_FragColor = vec4(g, c.a); }',
  }));
  composer.addPass(new OutputPass());

  /* ---------- 狀態 ---------- */
  let destination = null, here = null, following = false, onIsland = false;
  const chatSubs = new Set();
  let lastChatLen = state.get().chat.length;
  state.on((s) => {
    renderLists();
    if (s.chat.length > lastChatLen && s.chat.at(-1)?.role === 'assistant') chatSubs.forEach((f) => f());
    lastChatLen = s.chat.length;
  });
  const zoneOf = (spotId) => ZONES.find((z) => z.id === SPOTS.find((s) => s.id === spotId)?.zone);

  /* ---------- 介面：區域清單與地圖標記 ---------- */
  const zoneList = $('zone-list');
  const pinsEl = $('pins');
  const pins = new Map();
  zoneList.innerHTML = ZONES.map((z) => `
    <section class="zone" style="--zc:${z.color}">
      <h3 class="zone-h"><span class="zone-no">${z.no}</span><span class="zone-name">${esc(z.name)}</span><span class="zone-sub">${esc(z.sub)}</span><span class="zone-n" data-z="${z.id}"></span></h3>
      <ol class="zone-spots${z.id === 'practice' ? ' is-grid' : ''}">${SPOTS.filter((s) => s.zone === z.id).map((s) => `
        <li><button type="button" class="place" data-id="${s.id}"><span class="place-name">${esc(z.id === 'practice' ? s.title : s.place)}</span>${z.id === 'practice' ? '' : `<span class="place-sub">${esc(s.title)}</span>`}</button></li>`).join('')}
      </ol>
    </section>`).join('');
  zoneList.querySelectorAll('.place').forEach((b) => b.addEventListener('click', () => goTo(b.dataset.id)));
  $('progress-total').textContent = String(SPOTS.length);
  for (const s of SPOTS) {
    const z = ZONES.find((x) => x.id === s.zone);
    const p = document.createElement('button');
    p.type = 'button'; p.tabIndex = -1;
    p.className = `pin${s.zone === 'practice' ? ' pin-sm' : ''}`;
    p.style.setProperty('--zc', z.color);
    p.innerHTML = `<span class="pin-no">${z.no}</span><span class="pin-name">${esc(s.zone === 'practice' ? s.title : s.place)}</span>`;
    p.addEventListener('click', () => goTo(s.id));
    pinsEl.appendChild(p);
    pins.set(s.id, p);
  }

  function renderLists() {
    const st = state.get();
    zoneList.querySelectorAll('.place').forEach((b) => {
      b.classList.toggle('is-done', st.done.includes(b.dataset.id));
      b.setAttribute('aria-current', String(b.dataset.id === (destination || here)));
    });
    zoneList.querySelectorAll('.zone-n').forEach((n) => { const p = state.zoneProgress(n.dataset.z); n.textContent = p.done >= p.total ? '✓' : `${p.done}/${p.total}`; n.classList.toggle('is-full', p.done >= p.total); });
    pins.forEach((p, id) => { p.classList.toggle('is-done', st.done.includes(id)); p.classList.toggle('is-target', id === (destination || here)); });
    const n = SPOTS.filter((s) => st.done.includes(s.id)).length;
    $('progress').textContent = String(n);
    $('progress-fill').style.width = `${(n / SPOTS.length) * 100}%`;
  }
  const hint = (t) => { $('hint').textContent = t; $('hint').classList.toggle('is-on', !!t); };

  /* ---------- AI 導覽抽屜（隨處可開） ---------- */
  const drawer = $('chat-drawer');
  let drawerChat = null, activeChat = null;
  function openDrawer(q, mode) {
    if (activeChat && card.open && card.spot?.exp === 'lecture') {           // 講堂已開：直接用講堂的對話
      if (q) activeChat.askNow(q, mode);
      return;
    }
    if (!drawerChat) {
      drawerChat = new Chat(drawer, {
        getZone: () => zoneOf(here || destination) || null,
        onClose: closeDrawer, title: 'AI 導覽',
      });
    } else drawerChat.render();
    drawer.hidden = false;
    document.body.classList.add('drawer-open');
    requestAnimationFrame(() => drawer.classList.add('is-in'));
    if (q) drawerChat.askNow(q, mode); else drawer.querySelector('.chat-input').focus({ preventScroll: true });
    reframe();
  }
  function closeDrawer() {
    drawer.hidden = true; drawer.classList.remove('is-in');
    document.body.classList.remove('drawer-open');
    reframe();
  }
  $('ai-fab').addEventListener('click', () => (drawer.hidden ? openDrawer() : closeDrawer()));

  /* ---------- 內容面板 ---------- */
  const order = SPOTS.map((s) => s.id);
  const nextOf = (s) => {
    const st = state.get();
    const i = order.indexOf(s.id);
    for (let k = 1; k <= order.length; k++) { const id = order[(i + k) % order.length]; if (!st.done.includes(id)) return SPOTS.find((x) => x.id === id); }
    return null;
  };
  const card = new Card($('card'), {
    onClose: () => { card.hide(); reframe(); },
    onNext: (n) => goTo(n.id),
    ctx: {
      complete: (id) => {
        const was = state.isDone(id);
        state.complete(id);
        if (!was) { const z = zoneOf(id), p = state.zoneProgress(z.id); toast(p.done >= p.total ? `✦ 完成「${z.name}」` : `完成：${SPOTS.find((s) => s.id === id).place}`); }
      },
      isDone: (id) => state.isDone(id),
      openChat: (q, mode) => openDrawer(q, mode),
      lightHall: (set) => world.lightHall(set),
      zoneOf,
      onChat: (f) => { chatSubs.add(f); return () => chatSubs.delete(f); },
      registerChat: (c) => { activeChat = c; },
    },
  });
  function toast(t) {
    const el = document.createElement('div');
    el.className = 'toast'; el.textContent = t;
    document.body.appendChild(el);
    requestAnimationFrame(() => el.classList.add('is-in'));
    setTimeout(() => { el.classList.remove('is-in'); setTimeout(() => el.remove(), 500); }, 2600);
  }

  /* ---------- 構圖 ---------- */
  function viewArea() {
    const W = innerWidth, H = innerHeight;
    const r = (el) => el.getBoundingClientRect();
    if (!onIsland) return { left: 0, top: H * 0.05, w: W, h: H * 0.95 };
    const rightPanel = card.open ? $('card') : !drawer.hidden ? drawer : null;
    if (narrow()) {
      const top = r(document.querySelector('.brand')).bottom + 4;
      const bottom = (rightPanel ? r(rightPanel).top : r($('places')).top) - 6;
      return { left: 0, top, w: W, h: Math.max(140, bottom - top) };
    }
    const left = r($('places')).right + 8;
    const right = (rightPanel ? r(rightPanel).left : W) - 8;
    return { left, top: 8, w: Math.max(200, right - left), h: H - 16 };
  }
  function overviewPoints() {
    return world.islandPoints.concat([world.peakTop.clone().setY(world.peakTop.y + 2)], [...world.spots.values()].map((s) => s.anchor));
  }
  function focusPoints(s) {
    const c = s.pos, r = Math.max(5, (s.r || 3) + 2.2);
    return [
      new THREE.Vector3(c.x - r, c.y, c.z - r), new THREE.Vector3(c.x + r, c.y, c.z - r),
      new THREE.Vector3(c.x - r, c.y, c.z + r), new THREE.Vector3(c.x + r, c.y, c.z + r),
      s.anchor.clone().setY(s.anchor.y + 0.6),
    ];
  }
  function reframe(instant = false) {
    const area = viewArea();
    const focus = card.open && here ? world.spots.get(here) : null;
    following = false; view.setFollow(false);
    view.frame(focus ? focusPoints(focus) : overviewPoints(), area, instant);
  }
  function followPoints() {
    const p = explorer.pos, y = explorer.object.position.y, r = 5.2;
    return [
      new THREE.Vector3(p.x - r, y, p.y - r), new THREE.Vector3(p.x + r, y, p.y - r),
      new THREE.Vector3(p.x - r, y, p.y + r), new THREE.Vector3(p.x + r, y, p.y + r),
      new THREE.Vector3(p.x, y + 3.2, p.y),
    ];
  }
  function updateFollow() {
    const walking = explorer.moving;
    if (walking && !following) { following = true; view.setFollow(true); }
    if (!walking && following && !destination) { following = false; view.setFollow(false); reframe(); }
    if (following) view.frame(followPoints(), viewArea());
  }

  /* ---------- 移動 ---------- */
  function goTo(id) {
    if (!onIsland) enterIsland();
    const s = world.spots.get(id);
    card.hide();
    if (!drawer.hidden && narrow()) closeDrawer();
    destination = id; here = null;
    renderLists();
    const from = world.graph.nearestNode(explorer.pos.x, explorer.pos.y);
    const to = world.graph.spotNode.get(id);
    const pts = world.graph.route(from, to);
    hint(`前往 ${s.place}……`);
    explorer.onArrive = () => arrive(id);
    explorer.walk(pts.length ? pts : [s.frontV.clone()]);
    reframe();
  }
  function arrive(id) {
    const s = world.spots.get(id);
    destination = null; here = id;
    explorer.faceTowards(s.at[0], s.at[1]);
    state.visit(id);
    hint('');
    if (!drawer.hidden && s.exp === 'lecture') closeDrawer();
    card.show(s, nextOf(s));
    reframe();
  }

  /* ---------- 點擊 3D 場景 ---------- */
  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const pick = (x, y) => {
    const r = canvas.getBoundingClientRect();
    ndc.set(((x - r.left) / r.width) * 2 - 1, -((y - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, view.camera);
    const hit = ray.intersectObjects(world.pickables, false)[0];
    return hit ? hit.object.userData.spotId : null;
  };
  let down = null;
  canvas.addEventListener('pointerdown', (e) => { down = { x: e.clientX, y: e.clientY }; });
  canvas.addEventListener('pointerup', (e) => {
    if (!onIsland || !down || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 8) { down = null; return; }
    down = null;
    const id = pick(e.clientX, e.clientY);
    if (id) goTo(id);
  });
  canvas.addEventListener('pointermove', (e) => {
    if (e.pointerType !== 'mouse') return;
    canvas.style.cursor = onIsland && pick(e.clientX, e.clientY) ? 'pointer' : 'default';
    view.setParallax((e.clientX / innerWidth - 0.5) * 2, (e.clientY / innerHeight - 0.5) * 2);
  });
  addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (!$('modal').hidden) closeModal();
    else if (!drawer.hidden) closeDrawer();
    else if (card.open) { card.hide(); reframe(); }
  });

  /* ---------- 首頁、指南、關於 ---------- */
  function enterIsland() {
    if (onIsland) return;
    onIsland = true;
    $('home').classList.add('is-out');
    setTimeout(() => { $('home').hidden = true; }, 600);
    document.body.classList.add('on-island');
    hint(state.get().done.length ? '歡迎回來！點清單或地圖上的標記繼續探索。' : '點左側清單或地圖上的標記，旅人會沿著步道走過去。建議從「生命長廊」開始。');
    reframe();
  }
  function goHome() {
    card.hide(); closeDrawer();
    onIsland = false;
    document.body.classList.remove('on-island');
    $('home').hidden = false;
    requestAnimationFrame(() => $('home').classList.remove('is-out'));
    hint('');
    reframe();
  }
  const modal = $('modal');
  function openModal(which) {
    $('modal-body').innerHTML = which === 'about' ? ABOUT : GUIDE;
    modal.hidden = false;
    modal.querySelector('.modal-close').focus();
    modal.querySelector('[data-reset]')?.addEventListener('click', () => { if (confirm('確定要清除這台裝置上的學習進度與對話紀錄嗎？')) { state.reset(); closeModal(); } });
  }
  function closeModal() { modal.hidden = true; }
  modal.querySelector('.modal-close').addEventListener('click', closeModal);
  modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });
  document.querySelectorAll('[data-open]').forEach((b) => b.addEventListener('click', () => openModal(b.dataset.open)));
  $('enter-btn').addEventListener('click', () => { enterIsland(); if (!state.get().done.length) setTimeout(() => goTo('corridor'), 900); });
  $('home-ai').addEventListener('click', () => { enterIsland(); openDrawer(); });
  $('home-btn').addEventListener('click', goHome);

  /* ---------- 尺寸 ---------- */
  function resize() {
    const w = innerWidth, h = innerHeight;
    renderer.setSize(w, h, false);
    composer.setSize(w, h);
    bloom.resolution.set(w / 2, h / 2);
    reframe(true);
  }
  addEventListener('resize', resize);
  new ResizeObserver(() => reframe()).observe($('card'));
  resize();
  renderLists();
  if (/[?&]island\b/.test(location.search)) enterIsland();

  /* ---------- 迴圈 ---------- */
  const clock = new THREE.Clock();
  let t = 0, timeScale = 1, homeSpin = 0;
  const tmp = new THREE.Vector3();
  renderer.setAnimationLoop(() => {
    const dt = Math.min(clock.getDelta(), 0.05) * timeScale;
    t += dt;
    explorer.update(dt);
    updateFollow();
    world.update(t);
    if (!onIsland) { homeSpin += dt * 0.05; view.setParallax(Math.sin(homeSpin) * 1.2, Math.cos(homeSpin * 0.7) * 0.4); }
    view.update(dt, innerWidth, innerHeight);
    if (view.cur) {
      const d = view.camera.position.distanceTo(view.cur.target);
      world.scene.fog.near = d * 1.0; world.scene.fog.far = d * 2.6;
    }
    composer.render();
    for (const [id, p] of pins) {
      tmp.copy(world.spots.get(id).anchor).project(view.camera);
      const x = (tmp.x + 1) / 2 * innerWidth, y = (1 - tmp.y) / 2 * innerHeight - 10;
      p.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%, -100%)`;
      p.style.visibility = tmp.z < 1 && onIsland ? 'visible' : 'hidden';
    }
  });

  requestAnimationFrame(() => setTimeout(() => $('loading').classList.add('is-out'), 300));
  document.fonts?.ready.then(() => reframe());

  // 自動化測試用（不影響使用者）
  window.__isle = {
    world, explorer, card, view, renderer, goTo, state, enterIsland, openDrawer,
    jump(id) { const s = world.spots.get(id); enterIsland(); explorer.place(s.frontV.x, s.frontV.y); arrive(id); },
    get here() { return here; }, get destination() { return destination; },
    set timeScale(v) { timeScale = v; },
  };
}

try { boot(); } catch (err) {
  console.error(err);
  fail(`載入時發生錯誤：${err.message}。請重新整理頁面。`);
}
