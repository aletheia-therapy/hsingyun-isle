import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { VignetteShader } from 'three/addons/shaders/VignetteShader.js';
import { SPOTS, ZONES, START } from './data/spots.js';
import { TASKS } from './data/tasks.js';
import { World } from './scene/world.js';
import { Explorer } from './scene/explorer.js';
import { TPCamera } from './scene/tpcam.js';
import { heightAt } from './scene/terrain.js';
import { Card } from './ui/card.js';
import { Chat, esc } from './ui/chat.js';
import { voice } from './ui/voice.js';
import { state } from './state.js';
import { GUIDE, ABOUT } from './ui/pages.js';

const $ = (id) => document.getElementById(id);
const narrow = () => matchMedia('(max-width: 860px)').matches;
const touch = matchMedia('(pointer: coarse)').matches;
const TALK_R = 2.4;

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
  const lowPower = touch || Math.min(innerWidth, innerHeight) < 600;

  /* ---------- 渲染 ---------- */
  const canvas = $('scene');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, lowPower ? 1.5 : 1.75));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.08;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const world = new World(SPOTS, { lowPower });
  const ground = (x, z) => world.groundAt(x, z);
  const view = new TPCamera(ground);
  const explorer = new Explorer();
  explorer.ground = ground;
  world.scene.add(explorer.object);
  explorer.place(START[0], START[1]);
  explorer.faceTowards(0, 0);

  const target = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: lowPower ? 0 : 4 });
  const composer = new EffectComposer(renderer, target);
  composer.addPass(new RenderPass(world.scene, view.camera));
  view.follow(START[0], 0, START[1]);
  const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.14, 0.5, 0.92);
  composer.addPass(bloom);
  const vignette = new ShaderPass(VignetteShader);
  vignette.uniforms.offset.value = 1.0;
  vignette.uniforms.darkness.value = 0.38;
  composer.addPass(vignette);
  // 島嶼光明度：善念越多，畫面越飽滿明亮
  const grade = new ShaderPass({
    uniforms: { tDiffuse: { value: null }, uSat: { value: 0.8 }, uLift: { value: 0.98 } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: 'uniform sampler2D tDiffuse; uniform float uSat; uniform float uLift; varying vec2 vUv; void main(){ vec4 c = texture2D(tDiffuse, vUv); float l = dot(c.rgb, vec3(0.299, 0.587, 0.114)); vec3 g = mix(vec3(l), c.rgb, uSat); g = (g - 0.5) * 1.05 + 0.5; g *= vec3(1.025, 1.0, 0.96) * uLift; gl_FragColor = vec4(g, c.a); }',
  });
  composer.addPass(grade);
  composer.addPass(new OutputPass());

  /* ---------- 狀態 ---------- */
  let onIsland = false, here = null, nearId = null, navTarget = null;
  const keys = new Set();
  const joy = new THREE.Vector2();
  const chatSubs = new Set();
  let lastChatLen = state.get().chat.length;
  const zoneOf = (spotId) => ZONES.find((z) => z.id === SPOTS.find((s) => s.id === spotId)?.zone);
  const taskOf = (spotId) => TASKS.find((t) => t.id === SPOTS.find((s) => s.id === spotId)?.task);
  const labelOf = (s) => { const t = taskOf(s.id); return t ? `${t.npc.name}（${t.virtue}）` : s.place; };
  const brightness = () => SPOTS.filter((s) => state.isDone(s.id)).length / SPOTS.length;
  let glowNow = brightness();
  state.on((s) => {
    renderLists();
    if (s.chat.length > lastChatLen && s.chat.at(-1)?.role === 'assistant') chatSubs.forEach((f) => f());
    lastChatLen = s.chat.length;
  });

  /* ---------- 介面：善念地圖與地圖標記 ---------- */
  const zoneList = $('zone-list');
  const pinsEl = $('pins');
  const pins = new Map();
  zoneList.innerHTML = ZONES.map((z) => `
    <section class="zone" style="--zc:${z.color}">
      <h3 class="zone-h"><span class="zone-no">${z.no}</span><span class="zone-name">${esc(z.name)}</span><span class="zone-n" data-z="${z.id}"></span></h3>
      <ol class="zone-spots${SPOTS.filter((s) => s.zone === z.id).length > 2 ? ' is-grid' : ''}">${SPOTS.filter((s) => s.zone === z.id).map((s) => { const t = taskOf(s.id); return `
        <li><button type="button" class="place" data-id="${s.id}"><span class="place-name">${esc(t ? t.virtue : s.place)}</span><span class="place-sub">${esc(t ? t.npc.name : z.sub)}</span></button></li>`; }).join('')}
      </ol>
    </section>`).join('');
  zoneList.querySelectorAll('.place').forEach((b) => b.addEventListener('click', () => setNav(b.dataset.id)));
  $('progress-total').textContent = String(SPOTS.length);
  for (const s of SPOTS) {
    const z = ZONES.find((x) => x.id === s.zone), t = taskOf(s.id);
    const p = document.createElement('button');
    p.type = 'button'; p.tabIndex = -1;
    p.className = 'pin';
    p.style.setProperty('--zc', z.color);
    p.innerHTML = `<span class="pin-no">${z.no}</span><span class="pin-name">${esc(t ? t.virtue : s.place)}</span>`;
    p.addEventListener('click', () => setNav(s.id));
    pinsEl.appendChild(p);
    pins.set(s.id, p);
  }
  function renderLists() {
    const st = state.get();
    zoneList.querySelectorAll('.place').forEach((b) => {
      b.classList.toggle('is-done', st.done.includes(b.dataset.id));
      b.setAttribute('aria-current', String(b.dataset.id === navTarget));
    });
    zoneList.querySelectorAll('.zone-n').forEach((n) => { const p = state.zoneProgress(n.dataset.z); n.textContent = p.done >= p.total ? '✓' : `${p.done}/${p.total}`; n.classList.toggle('is-full', p.done >= p.total); });
    pins.forEach((p, id) => { p.classList.toggle('is-done', st.done.includes(id)); p.classList.toggle('is-target', id === navTarget); });
    const n = SPOTS.filter((s) => st.done.includes(s.id)).length;
    $('progress').textContent = String(n);
    $('progress-fill').style.width = `${(n / SPOTS.length) * 100}%`;
    for (const s of SPOTS) if (st.done.includes(s.id)) world.bloom(s.id, false);
  }
  const hint = (t) => { $('hint').textContent = t; $('hint').classList.toggle('is-on', !!t); };
  function toast(t) {
    const el = document.createElement('div');
    el.className = 'toast'; el.textContent = t;
    document.body.appendChild(el);
    requestAnimationFrame(() => el.classList.add('is-in'));
    setTimeout(() => { el.classList.remove('is-in'); setTimeout(() => el.remove(), 500); }, 2600);
  }

  /* ---------- 導航：選一個目的地，旅人頭上的箭頭會指路 ---------- */
  const arrow = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.6, 3), new THREE.MeshBasicMaterial({ color: '#f2c25c', transparent: true, opacity: 0.92, depthTest: false }));
  arrow.geometry.rotateX(Math.PI / 2); arrow.renderOrder = 20; arrow.visible = false;
  world.scene.add(arrow);
  function setNav(id) {
    if (!onIsland) enterIsland();
    navTarget = id;
    renderLists();
    const s = SPOTS.find((x) => x.id === id);
    hint(`導航：${labelOf(s)}。跟著頭上的金色箭頭走過去${touch ? '' : '（WASD 或方向鍵）'}。`);
  }
  const navPoint = () => {
    const q = activeQuest();
    if (q && q.task.quest.type !== 'escort') {
      const left = world.items.get(q.task.id).filter((it) => !it.done);
      if (left.length) {
        const p = explorer.pos;
        const best = left.reduce((b, it) => (Math.hypot(it.group.position.x - p.x, it.group.position.z - p.y) < Math.hypot(b.group.position.x - p.x, b.group.position.z - p.y) ? it : b));
        return new THREE.Vector2(best.group.position.x, best.group.position.z);
      }
    }
    if (q?.task.quest.type === 'escort') { const t = world.spots.get(q.task.quest.to); return t.frontV; }
    return navTarget ? world.spots.get(navTarget).frontV : null;
  };

  /* ---------- 島上任務 ---------- */
  const activeQuest = () => {
    for (const t of TASKS) if (t.quest && state.get().tasks[t.id]?.quest === 'active') return { task: t, spot: SPOTS.find((s) => s.task === t.id) };
    return null;
  };
  const questProgress = (taskId) => {
    const t = TASKS.find((x) => x.id === taskId);
    if (t.quest.type === 'escort') return { done: state.get().tasks[taskId]?.quest === 'done' ? 1 : 0, total: 1 };
    const list = world.items.get(taskId) || [];
    return { done: list.filter((i) => i.done).length, total: list.length };
  };
  function startQuest(taskId) {
    const cur = activeQuest();
    if (cur && cur.task.id !== taskId) { toast(`請先完成：${cur.task.quest.label}`); return; }
    const t = TASKS.find((x) => x.id === taskId);
    state.setTask(taskId, { quest: 'active' });
    (world.items.get(taskId) || []).forEach((it) => { if (!it.done) it.group.visible = true; });
    world.npcs.get(SPOTS.find((s) => s.task === taskId).id)?.setBadge('quest');
    card.hide();
    renderQuestBar();
    toast(`任務開始：${t.quest.label}`);
    voice.say(t.quest.type === 'escort' ? `${t.npc.name}會跟著你。帶她走到 AI 智慧講堂吧。` : `${t.quest.label}。跟著金色箭頭走過去。`, 'narrator');
    reframe();
  }
  function renderQuestBar() {
    const q = activeQuest(), bar = $('quest-bar');
    if (!q) { bar.hidden = true; return; }
    const p = questProgress(q.task.id);
    bar.hidden = false;
    bar.innerHTML = `<span class="qb-tag" style="--tc:${q.task.color}">${esc(q.task.virtue)}</span><b>${esc(q.task.quest.label)}</b>${q.task.quest.type === 'escort' ? '' : `<span class="qb-n">${p.done} / ${p.total}</span>`}`;
  }
  function finishQuest(q) {
    state.setTask(q.task.id, { quest: 'done' });
    world.npcs.get(q.spot.id)?.setBadge('need');
    renderQuestBar();
    if (q.task.quest.type === 'escort') {
      toast(`✦ 帶到了！${q.task.npc.name}想跟你說句話`);
      openSpot(q.spot.id);
    } else {
      toast(`✦ 完成！回去找${q.task.npc.name}吧`);
      voice.say(`完成了！回去找${q.task.npc.name}吧。`, 'narrator');
      navTarget = q.spot.id; renderLists();
    }
  }
  function questTick(dt) {
    const q = activeQuest();
    if (!q) return;
    const p = explorer.pos;
    if (q.task.quest.type === 'escort') {
      const v = world.npcs.get(q.spot.id);
      const g = v.group.position, d = Math.hypot(p.x - g.x, p.y - g.z);
      if (d > 1.6) {
        const step = Math.min(d - 1.4, 4.2 * dt);
        const dx = (p.x - g.x) / d, dz = (p.y - g.z) / d;
        g.x += dx * step; g.z += dz * step; g.y = ground(g.x, g.z);
        v.group.rotation.y = Math.atan2(dx, dz); v.moving = true;
      } else v.moving = false;
      if (d > 14) { const f = view.forward(); g.x = p.x - f.x * 1.4; g.z = p.y - f.y * 1.4; }      // 跟丟了就跳到身邊
      const to = world.spots.get(q.task.quest.to).frontV;
      if (Math.hypot(p.x - to.x, p.y - to.y) < TALK_R && d < 3) { v.moving = false; finishQuest(q); }
      return;
    }
    let got = false;
    for (const it of world.items.get(q.task.id)) {
      if (it.done) continue;
      const gp = it.group.position;
      if (Math.hypot(gp.x - p.x, gp.z - p.y) < (it.kind === 'lamp' ? 1.5 : 1.1)) { it.collect(); got = true; }
    }
    if (got) {
      const pr = questProgress(q.task.id);
      renderQuestBar();
      if (pr.done >= pr.total) finishQuest(q);
      else voice.say(`還差 ${pr.total - pr.done} 個。`, 'narrator');
    }
  }
  function restoreQuests() {
    for (const t of TASKS) {
      const st = state.get().tasks[t.id]?.quest;
      const items = world.items.get(t.id) || [];
      if (st === 'done') items.forEach((it) => { it.collect(); if (it.kind !== 'lamp') it.group.visible = false; else it.group.visible = true; });
      if (st === 'active') {
        if (t.quest.type === 'escort') state.setTask(t.id, { quest: undefined });      // 重新整理後從頭帶路
        else items.forEach((it) => { it.group.visible = true; });
      }
      if (t.quest?.type === 'light' && st !== 'done') items.forEach((it) => { it.group.visible = true; });   // 熄滅的燈一直都在
    }
    renderQuestBar();
  }

  /* ---------- AI 導覽抽屜 ---------- */
  const drawer = $('chat-drawer');
  let drawerChat = null, activeChat = null;
  function openDrawer(q, mode) {
    if (activeChat && card.open && card.spot?.exp === 'lecture') { if (q) activeChat.askNow(q, mode); return; }
    if (!drawerChat) drawerChat = new Chat(drawer, { getZone: () => zoneOf(nearId || here) || null, onClose: closeDrawer, title: 'AI 導覽' });
    else drawerChat.render();
    drawer.hidden = false;
    document.body.classList.add('drawer-open');
    requestAnimationFrame(() => drawer.classList.add('is-in'));
    if (q) drawerChat.askNow(q, mode); else drawer.querySelector('.chat-input').focus({ preventScroll: true });
    reframe();
  }
  function closeDrawer() {
    drawer.hidden = true; drawer.classList.remove('is-in');
    document.body.classList.remove('drawer-open');
    canvas.focus?.();
    reframe();
  }
  $('ai-fab').addEventListener('click', () => (drawer.hidden ? openDrawer() : closeDrawer()));

  /* ---------- 內容面板 ---------- */
  const card = new Card($('card'), {
    onClose: () => closeCard(),
    onNext: null,
    ctx: {
      complete: (id) => {
        const was = state.isDone(id);
        state.complete(id);
        if (!was) { world.bloom(id); const z = zoneOf(id), p = state.zoneProgress(z.id); toast(p.done >= p.total ? `✦ 完成「${z.name}」` : '✦ 島上又亮了一角'); }
      },
      isDone: (id) => state.isDone(id),
      openChat: (q, mode) => openDrawer(q, mode),
      zoneOf,
      onChat: (f) => { chatSubs.add(f); return () => chatSubs.delete(f); },
      registerChat: (c) => { activeChat = c; },
      startQuest,
      questProgress,
    },
  });
  function openSpot(id) {
    here = id;
    keys.clear(); joy.set(0, 0);
    const s = world.spots.get(id);
    explorer.faceTowards(s.at[0], s.at[1]);
    state.visit(id);
    if (navTarget === id) navTarget = null;
    hint(''); prompt(null);
    if (!drawer.hidden && s.exp === 'lecture') closeDrawer();
    faceSpot(s);
    card.show(s, null);
    renderLists();
    reframe();
  }
  function closeCard() {
    card.hide(); here = null; voice.stop();
    // 帶路任務結束後，島民回到自己的亭子
    for (const t of TASKS) if (t.quest?.type === 'escort' && state.get().tasks[t.id]?.quest === 'done') {
      const v = world.npcs.get(SPOTS.find((s) => s.task === t.id).id);
      if (v && v.home) { v.group.position.set(v.home.x, heightAt(v.home.x, v.home.y), v.home.y); v.group.rotation.y = v.face; }
    }
    reframe();
  }

  /* ---------- 靠近互動 ---------- */
  const promptEl = $('prompt');
  function prompt(id) {
    if (id === nearId) return;
    nearId = id;
    world.rings.forEach((r, k) => { r.hot = k === id; });
    if (!id) { promptEl.hidden = true; return; }
    const s = SPOTS.find((x) => x.id === id), t = taskOf(id);
    promptEl.hidden = false;
    promptEl.innerHTML = `<kbd>${touch ? '點這裡' : 'Enter'}</kbd><span>${t ? `和 <b>${esc(t.npc.name)}</b> 說話` : s.npc ? `和 <b>${esc(s.npc.name)}</b> 說話` : `進入 <b>${esc(s.place)}</b>`}</span>`;
  }
  promptEl.addEventListener('click', () => { if (nearId) openSpot(nearId); });
  function nearestStation() {
    const p = explorer.pos;
    let best = null, bd = TALK_R;
    for (const s of SPOTS) {
      const d = Math.hypot(s.front[0] - p.x, s.front[1] - p.y);
      if (d < bd) { bd = d; best = s.id; }
    }
    return best;
  }

  /* ---------- 鍵盤與觸控搖桿 ---------- */
  const MOVE = { KeyW: [0, 1], ArrowUp: [0, 1], KeyS: [0, -1], ArrowDown: [0, -1], KeyA: [-1, 0], ArrowLeft: [-1, 0], KeyD: [1, 0], ArrowRight: [1, 0] };
  const typing = (e) => /INPUT|TEXTAREA|SELECT/.test(e.target?.tagName || '') || e.target?.isContentEditable;
  addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (!$('modal').hidden) closeModal();
      else if (!drawer.hidden) closeDrawer();
      else if (card.open) closeCard();
      return;
    }
    if (typing(e) || !onIsland || card.open || !$('modal').hidden) return;
    if (MOVE[e.code]) { keys.add(e.code); e.preventDefault(); }
    if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') keys.add('Shift');
    if ((e.code === 'Enter' || e.code === 'Space') && nearId && drawer.hidden) { e.preventDefault(); openSpot(nearId); }
    if (e.code === 'KeyM') { if (view.distT > 20) { view.distT = 9; view.pitchT = 0.36; } else { view.distT = 34; view.pitchT = 0.95; } }
    if (e.code === 'KeyQ') keys.add('TurnL');
    if (e.code === 'KeyE') keys.add('TurnR');
    if (e.code === 'Equal' || e.code === 'NumpadAdd') view.zoom(0.85);
    if (e.code === 'Minus' || e.code === 'NumpadSubtract') view.zoom(1.18);
  });
  addEventListener('keyup', (e) => { keys.delete(e.code); if (e.code.startsWith('Shift')) keys.delete('Shift'); if (e.code === 'KeyQ') keys.delete('TurnL'); if (e.code === 'KeyE') keys.delete('TurnR'); });
  addEventListener('blur', () => keys.clear());
  canvas.addEventListener('wheel', (e) => { if (!onIsland) return; e.preventDefault(); view.zoom(1 + e.deltaY * 0.001); }, { passive: false });

  if (touch) {
    const pad = $('joystick'), knob = pad.querySelector('i');
    pad.hidden = false;
    let id = null, cx = 0, cy = 0;
    const R = 46;
    pad.addEventListener('pointerdown', (e) => { id = e.pointerId; const r = pad.getBoundingClientRect(); cx = r.left + r.width / 2; cy = r.top + r.height / 2; pad.setPointerCapture(id); move(e); });
    const move = (e) => { if (e.pointerId !== id) return; let dx = e.clientX - cx, dy = e.clientY - cy; const d = Math.hypot(dx, dy); if (d > R) { dx *= R / d; dy *= R / d; } knob.style.transform = `translate(${dx}px, ${dy}px)`; joy.set(dx / R, -dy / R); };
    pad.addEventListener('pointermove', move);
    const end = (e) => { if (e.pointerId !== id) return; id = null; joy.set(0, 0); knob.style.transform = ''; };
    pad.addEventListener('pointerup', end); pad.addEventListener('pointercancel', end);
  }

  /* ---------- 鏡頭 ---------- */
  function reframe() {
    view.setOverview(!onIsland);
    const panel = card.open ? $('card') : !drawer.hidden ? drawer : null;
    view.offsetXT = panel && !narrow() && onIsland ? panel.getBoundingClientRect().width / 2 : 0;
  }
  /** 打開站點時，鏡頭轉到旅人身後、面向島民與建築 */
  function faceSpot(s) {
    const want = Math.atan2(s.front[0] - s.at[0], s.front[1] - s.at[1]);
    let d = ((want - view.yawT + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
    view.yawT += d; view.distT = Math.min(view.distT, 8.5); view.pitchT = 0.3;
  }
  {
    const pts = new Map(); let pinch0 = 0, dist0 = 9;
    canvas.addEventListener('pointerdown', (e) => {
      if (!onIsland) return;
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY }); canvas.setPointerCapture(e.pointerId);
      if (pts.size === 2) { const [a, b] = [...pts.values()]; pinch0 = Math.hypot(a.x - b.x, a.y - b.y); dist0 = view.distT; }
    });
    canvas.addEventListener('pointermove', (e) => {
      const p = pts.get(e.pointerId); if (!p) return;
      if (pts.size === 1) view.orbit(e.clientX - p.x, e.clientY - p.y);
      p.x = e.clientX; p.y = e.clientY;
      if (pts.size === 2 && pinch0) { const [a, b] = [...pts.values()]; view.distT = Math.min(34, Math.max(3.5, dist0 * pinch0 / Math.hypot(a.x - b.x, a.y - b.y))); }
    });
    const end = (e) => { pts.delete(e.pointerId); if (pts.size < 2) pinch0 = 0; };
    canvas.addEventListener('pointerup', end); canvas.addEventListener('pointercancel', end);
  }

  /* ---------- 首頁、指南、關於、語音開關 ---------- */
  function enterIsland() {
    if (onIsland) return;
    onIsland = true;
    $('home').classList.add('is-out');
    setTimeout(() => { $('home').hidden = true; }, 600);
    document.body.classList.add('on-island');
    canvas.focus?.();
    if (!state.isDone('origin')) {
      navTarget = 'origin';
      hint(touch ? '用左下角的搖桿走路。先到山門旁的源頭碑，找導覽員小蓮。' : '用 WASD 或方向鍵走路，拖曳畫面或按 Q／E 轉視角。先到山門旁的源頭碑，找導覽員小蓮。');
      voice.say('歡迎來到三好四給之島。用方向鍵走路，先到山門旁的源頭碑，找導覽員小蓮吧。', 'guide');
    } else hint('歡迎回來！左側的善念地圖可以設定導航目的地。');
    renderLists();
    reframe();
  }
  function goHome() {
    closeCard(); closeDrawer();
    onIsland = false;
    document.body.classList.remove('on-island');
    $('home').hidden = false;
    requestAnimationFrame(() => $('home').classList.remove('is-out'));
    hint(''); prompt(null); voice.stop();
    reframe();
  }
  const modal = $('modal');
  function openModal(which) {
    $('modal-body').innerHTML = which === 'about' ? ABOUT : GUIDE;
    modal.hidden = false;
    modal.querySelector('.modal-close').focus();
    modal.querySelector('[data-reset]')?.addEventListener('click', (e) => {
      const b = e.currentTarget;
      if (b.dataset.armed) { state.reset(); location.reload(); return; }
      b.dataset.armed = '1'; b.textContent = '再按一次確認清除（無法復原）';
    });
  }
  function closeModal() { modal.hidden = true; }
  modal.querySelector('.modal-close').addEventListener('click', closeModal);
  modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });
  document.querySelectorAll('[data-open]').forEach((b) => b.addEventListener('click', () => openModal(b.dataset.open)));
  $('enter-btn').addEventListener('click', enterIsland);
  $('home-ai').addEventListener('click', () => { enterIsland(); openDrawer(); });
  $('home-btn').addEventListener('click', goHome);
  const vbtn = $('voice-btn');
  const paintVoice = () => { vbtn.setAttribute('aria-pressed', String(voice.on)); vbtn.querySelector('span').textContent = voice.on ? '語音導讀：開' : '語音導讀：關'; };
  if (!voice.supported) vbtn.hidden = true;
  vbtn.addEventListener('click', () => { voice.set(!voice.on); paintVoice(); });
  paintVoice();

  /* ---------- 尺寸 ---------- */
  function resize() {
    const w = innerWidth, h = innerHeight;
    renderer.setSize(w, h, false);
    composer.setSize(w, h);
    bloom.resolution.set(w / 2, h / 2);
    reframe();
  }
  addEventListener('resize', resize);
  new ResizeObserver(() => reframe()).observe($('card'));
  resize();
  restoreQuests();
  for (const s of SPOTS) if (state.isDone(s.id)) world.bloom(s.id, true);
  renderLists();
  if (/[?&]island\b/.test(location.search)) enterIsland();

  /* ---------- 迴圈 ---------- */
  const clock = new THREE.Clock();
  let t = 0, timeScale = 1;
  const tmp = new THREE.Vector3(), mv = new THREE.Vector2();
  renderer.setAnimationLoop(() => {
    const dt = Math.min(clock.getDelta(), 0.05) * timeScale;
    t += dt;
    if (onIsland && !card.open && modal.hidden) {
      mv.set(0, 0);
      for (const k of keys) if (MOVE[k]) { mv.x += MOVE[k][0]; mv.y += MOVE[k][1]; }
      mv.add(joy);
      if (keys.has('TurnL')) view.turn(dt * 1.6);
      if (keys.has('TurnR')) view.turn(-dt * 1.6);
      if (mv.lengthSq() > 0.01) {
        const len = Math.min(1, mv.length());
        const F = view.forward(), R = view.right();
        const dx = R.x * mv.x + F.x * mv.y, dz = R.y * mv.x + F.y * mv.y;
        const speed = (keys.has('Shift') ? 6.4 : 4.2) * len;
        explorer.drive(dx, dz, speed * dt, dt, (x, z) => world.walkable(x, z));
        if ($('hint').classList.contains('is-on') && !navTarget) hint('');
      }
      questTick(dt);
      prompt(nearestStation());
    }
    view.follow(explorer.pos.x, explorer.object.position.y, explorer.pos.y);
    world.follow(explorer.pos.x, explorer.pos.y);
    explorer.update(dt);
    // 導航箭頭
    const np = onIsland && !card.open ? navPoint() : null;
    if (np) {
      const p = explorer.pos, d = Math.hypot(np.x - p.x, np.y - p.y);
      arrow.visible = d > 2.6;
      arrow.position.set(p.x, explorer.object.position.y + 3.6 + Math.sin(t * 3) * 0.08, p.y);
      arrow.rotation.y = Math.atan2(np.x - p.x, np.y - p.y);
      if (navTarget && d <= TALK_R && !activeQuest()) { navTarget = null; renderLists(); hint(''); }
    } else arrow.visible = false;
    // 島嶼光明度
    glowNow += (brightness() - glowNow) * Math.min(1, dt * 1.5);
    grade.uniforms.uSat.value = 0.8 + 0.28 * glowNow;
    grade.uniforms.uLift.value = 0.98 + 0.06 * glowNow;
    world.update(t, dt);
    view.update(dt, innerWidth, innerHeight);
    world.scene.fog.near = onIsland ? 45 : 160; world.scene.fog.far = onIsland ? 420 : 700;
    composer.render();
    for (const [id, p] of pins) {
      tmp.copy(world.spots.get(id).anchor).project(view.camera);
      const x = (tmp.x + 1) / 2 * innerWidth, y = (1 - tmp.y) / 2 * innerHeight - 10;
      p.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%, -100%)`;
      const sp = world.spots.get(id), dd = Math.hypot(sp.front[0] - explorer.pos.x, sp.front[1] - explorer.pos.y);
      p.style.visibility = tmp.z < 1 && onIsland && !card.open && (dd < 55 || id === navTarget) && dd > 3 ? 'visible' : 'hidden';
    }
  });

  requestAnimationFrame(() => setTimeout(() => $('loading').classList.add('is-out'), 300));
  document.fonts?.ready.then(() => reframe());

  // 自動化測試用（不影響使用者）
  window.__isle = {
    world, explorer, card, view, state, renderer, enterIsland, openDrawer, openSpot, startQuest, setNav,
    keys, get near() { return nearId; },
    teleport(x, z) { explorer.place(x, z); },
    set timeScale(v) { timeScale = v; },
  };
}

try { boot(); } catch (err) {
  console.error(err);
  fail(`載入時發生錯誤：${err.message}。請重新整理頁面。`);
}
