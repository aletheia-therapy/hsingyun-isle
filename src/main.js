import * as THREE from 'three';
import { SPOTS, ZONES, START } from './data/spots.js';
import { TASKS } from './data/tasks.js';
import { World } from './scene/world.js';
import { Explorer } from './scene/explorer.js';
import { TPCamera } from './scene/tpcam.js';
import { Guide } from './scene/guide.js';
import { heightAt } from './scene/terrain.js';
import { Card } from './ui/card.js';
import { Chat, esc } from './ui/chat.js';
import { music } from './ui/music.js';
import { state } from './state.js';
import { GUIDE, ABOUT } from './ui/pages.js';
import { LEVELS } from './data/games.js';

const $ = (id) => document.getElementById(id);
const narrow = () => matchMedia('(max-width: 860px)').matches;
const touch = matchMedia('(pointer: coarse)').matches;
const TALK_R = 2.4;
/** 建議路線：沿著島走一圈（山門 → 三好村 → 四給街 → 講堂 → 影音堂 → 山頂），每一站都在上一站附近 */
const ORDER = ['origin', 'deed', 'speech', 'heart', 'confidence', 'hope', 'joy', 'ease', 'lecture', 'media', 'vowterrace'];
const NUM = '①②③④⑤⑥⑦⑧⑨⑩⑪';
const INTRO_KEY = 'hsingyun-isle:intro';

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
  const fixedRes = /[?&]fixedres\b/.test(location.search);

  /* ---------- 渲染：直接繪製（不用後製），原生反鋸齒，依效能自動調整解析度 ---------- */
  const canvas = $('scene');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  const prMax = Math.min(devicePixelRatio, lowPower ? 1.25 : 1.5);
  let prNow = prMax;
  renderer.setPixelRatio(prNow);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;

  const t0 = performance.now();
  const world = new World(SPOTS, { lowPower });
  const ground = (x, z) => world.groundAt(x, z);
  const view = new TPCamera(ground);
  const explorer = new Explorer();
  explorer.ground = ground;
  world.scene.add(explorer.object);
  explorer.place(START[0], START[1]);
  explorer.faceTowards(0, 0);
  view.follow(START[0], 0, START[1]);
  const guide = new Guide(world);
  const buildMs = Math.round(performance.now() - t0);

  /* ---------- 狀態 ---------- */
  let onIsland = false, here = null, nearId = null, navTarget = null, running = false, stillT = 0;
  const keys = new Set();
  const joy = new THREE.Vector2();
  const chatSubs = new Set();
  let lastChatLen = state.get().chat.length;
  const spotOf = (id) => SPOTS.find((s) => s.id === id);
  const zoneOf = (spotId) => ZONES.find((z) => z.id === spotOf(spotId)?.zone);
  const taskOf = (spotId) => TASKS.find((t) => t.id === spotOf(spotId)?.task);
  const labelOf = (s) => { const t = taskOf(s.id); return t ? `${t.npc.name}（${t.virtue}）` : s.npc ? `導覽員 ${s.npc.name}` : s.place; };
  const brightness = () => SPOTS.filter((s) => state.isDone(s.id)).length / SPOTS.length;
  let glowNow = brightness();
  state.on((s) => {
    renderLists();
    if (s.chat.length > lastChatLen && s.chat.at(-1)?.role === 'assistant') chatSubs.forEach((f) => f());
    lastChatLen = s.chat.length;
  });

  /* ---------- 善念地圖（左側清單） ---------- */
  const zoneList = $('zone-list');
  zoneList.innerHTML = ZONES.map((z) => `
    <section class="zone" style="--zc:${z.color}">
      <h3 class="zone-h"><span class="zone-no">${z.no}</span><span class="zone-name">${esc(z.name)}</span><span class="zone-n" data-z="${z.id}"></span></h3>
      <ol class="zone-spots${SPOTS.filter((s) => s.zone === z.id).length > 2 ? ' is-grid' : ''}">${SPOTS.filter((s) => s.zone === z.id).map((s) => { const t = taskOf(s.id); return `
        <li><button type="button" class="place" data-id="${s.id}"><span class="place-name"><i class="place-no">${NUM[ORDER.indexOf(s.id)] || ''}</i>${esc(t ? t.virtue : s.place)}</span><span class="place-sub">${esc(t ? t.npc.name : s.npc ? `導覽員 ${s.npc.name}` : z.sub)}</span></button></li>`; }).join('')}
      </ol>
    </section>`).join('');
  zoneList.querySelectorAll('.place').forEach((b) => b.addEventListener('click', () => setNav(b.dataset.id)));
  // 手機：點標題展開或收合清單
  const placesEl = $('places'), placesHead = placesEl.querySelector('.places-head');
  const togglePlaces = () => { if (narrow()) placesEl.classList.toggle('is-open'); };
  placesHead.addEventListener('click', togglePlaces);
  placesHead.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); togglePlaces(); } });
  $('progress-total').textContent = String(SPOTS.length);

  /* ---------- 名牌：每位島民頭上都有名字、要幫的事與狀態 ---------- */
  const tagsEl = $('pins');
  const tags = new Map();
  for (const s of SPOTS) {
    const t = taskOf(s.id), z = ZONES.find((x) => x.id === s.zone);
    const el = document.createElement('button');
    el.type = 'button'; el.tabIndex = -1; el.className = 'tag';
    el.style.setProperty('--zc', t?.color || z.color);
    const name = t ? t.npc.name : s.npc ? s.npc.name : s.place;
    const sub = t ? t.virtue : s.npc ? '導覽員' : z.sub;
    el.innerHTML = `<i class="tag-st" aria-hidden="true"></i><b>${esc(name)}</b><small>${esc(sub)}</small><span class="tag-goal">目標</span>`;
    el.addEventListener('click', () => setNav(s.id));
    tagsEl.appendChild(el);
    el.style.visibility = 'hidden';
    tags.set(s.id, { el, npc: !!(t || s.npc), last: '', vis: 'hidden' });
  }
  function tagStatus(id) {
    if (state.isDone(id)) return 'done';
    const t = taskOf(id), q = t ? state.get().tasks[t.id]?.quest : null;
    if (q === 'active') return 'quest';
    if (q === 'done') return 'back';
    return tags.get(id).npc ? 'need' : 'place';
  }

  function renderLists() {
    const st = state.get();
    const ob = objective();
    zoneList.querySelectorAll('.place').forEach((b) => {
      b.classList.toggle('is-done', st.done.includes(b.dataset.id));
      b.setAttribute('aria-current', String(b.dataset.id === ob.spot));
    });
    zoneList.querySelectorAll('.zone-n').forEach((n) => { const p = state.zoneProgress(n.dataset.z); n.textContent = p.done >= p.total ? '✓' : `${p.done}/${p.total}`; n.classList.toggle('is-full', p.done >= p.total); });
    const n = SPOTS.filter((s) => st.done.includes(s.id)).length;
    $('progress').textContent = String(n);
    $('progress-fill').style.width = `${(n / SPOTS.length) * 100}%`;
    for (const s of SPOTS) if (st.done.includes(s.id)) world.bloom(s.id, false);
    $('score').textContent = String(state.score);
    $('badges').innerHTML = LEVELS.map((l) => { const ok = l.spots.every((x) => st.done.includes(x)); return `<span class="badge${ok ? ' is-on' : ''}" style="--bc:${l.color}" title="${l.badge}">${l.mark}</span>`; }).join('');
    const cur = LEVELS.find((l) => !l.spots.every((x) => st.done.includes(x)));
    $('level').innerHTML = cur ? `<b>${cur.name}</b><span>${cur.spots.filter((x) => st.done.includes(x)).length} / ${cur.spots.length}</span>` : '<b>全部過關！</b><span>島嶼已完全點亮</span>';
    for (const [id, tg] of tags) { const s = tagStatus(id); if (s !== tg.last) { tg.el.dataset.st = s; tg.last = s; } }
  }
  /** 善念值飄字 */
  function floatPoints(n) {
    const el = document.createElement('div');
    el.className = 'points-pop'; el.textContent = `+${n} 善念值`;
    document.body.appendChild(el);
    requestAnimationFrame(() => el.classList.add('is-in'));
    setTimeout(() => el.remove(), 1400);
    renderLists();
  }
  /** 過關：大大的徽章 */
  function levelUp(l) {
    const box = $('levelup');
    box.innerHTML = `<div class="lu-card" style="--bc:${l.color}"><span class="lu-mark">${l.mark}</span><p class="lu-t">過關！</p><h3>${l.name}</h3><p>獲得「${l.badge}」</p><button type="button" class="btn btn-primary">繼續</button></div>`;
    box.hidden = false;
    box.querySelector('button').addEventListener('click', () => { box.hidden = true; });
    setTimeout(() => { box.hidden = true; }, 5000);
  }
  let hintTimer = 0;
  const hint = (t, ms = 0) => { $('hint').textContent = t; $('hint').classList.toggle('is-on', !!t); clearTimeout(hintTimer); if (t && ms) hintTimer = setTimeout(() => hint(''), ms); };
  function toast(t) {
    const el = document.createElement('div');
    el.className = 'toast'; el.textContent = t;
    document.body.appendChild(el);
    requestAnimationFrame(() => el.classList.add('is-in'));
    setTimeout(() => { el.classList.remove('is-in'); setTimeout(() => el.remove(), 500); }, 2600);
  }

  /* ---------- 島上任務 ---------- */
  const activeQuest = () => {
    for (const t of TASKS) if (t.quest && state.get().tasks[t.id]?.quest === 'active') return { task: t, spot: SPOTS.find((s) => s.task === t.id) };
    return null;
  };
  const questProgress = (taskId) => {
    const t = TASKS.find((x) => x.id === taskId);
    if (t.quest.type === 'escort' || t.quest.type === 'still') return { done: state.get().tasks[taskId]?.quest === 'done' ? 1 : 0, total: 1 };
    const list = world.items.get(taskId) || [];
    return { done: list.filter((i) => i.done).length, total: list.length };
  };
  function startQuest(taskId) {
    const cur = activeQuest();
    if (cur && cur.task.id !== taskId) { toast(`請先完成：${cur.task.quest.label}`); return; }
    const t = TASKS.find((x) => x.id === taskId);
    state.setTask(taskId, { quest: 'active' });
    (world.items.get(taskId) || []).forEach((it) => { if (!it.done) it.group.visible = true; });
    closeCard();
    toast(`任務開始：${t.quest.label}`);
    hint('看畫面上方的「目前目標」，跟著地上的金色箭頭走。', 6000);
    renderLists();
  }
  function finishQuest(q) {
    state.setTask(q.task.id, { quest: 'done' });
    $('breath').hidden = true;
    if (q.task.quest.type === 'escort') {
      toast(`✦ 帶到了！${q.task.npc.name}想跟你說句話`);
      openSpot(q.spot.id);
    } else {
      toast(`✦ 完成！回去找${q.task.npc.name}吧`);
    }
    renderLists();
  }
  function questTick(dt) {
    const q = activeQuest();
    if (!q) return;
    const p = explorer.pos;
    if (q.task.quest.type === 'escort') {
      const v = world.npcs.get(q.spot.id);
      const g = v.group.position, d = Math.hypot(p.x - g.x, p.y - g.z);
      if (d > 1.6) {
        const step = Math.min(d - 1.4, (running ? 11 : 7.5) * dt);
        const dx = (p.x - g.x) / d, dz = (p.y - g.z) / d;
        g.x += dx * step; g.z += dz * step; g.y = ground(g.x, g.z);
        v.group.rotation.y = Math.atan2(dx, dz); v.moving = true;
      } else v.moving = false;
      if (d > 14) { const f = view.forward(); g.x = p.x - f.x * 1.4; g.z = p.y - f.y * 1.4; }      // 跟丟了就跳到身邊
      const to = world.spots.get(q.task.quest.to).frontV;
      if (Math.hypot(p.x - to.x, p.y - to.y) < TALK_R && d < 3) { v.moving = false; finishQuest(q); }
      return;
    }
    if (q.task.quest.type === 'still') {
      const it = world.items.get(q.task.id)[0], gp = it.group.position;
      const near = Math.hypot(gp.x - p.x, gp.z - p.y) < 1.6;
      const br = $('breath');
      if (near && !explorer.manualMoving) {
        stillT += dt;
        br.hidden = false;
        const ph = (stillT % 4) / 4;
        br.querySelector('i').style.transform = `scale(${0.55 + 0.45 * Math.sin(ph * Math.PI)})`;
        br.querySelector('b').textContent = ph < 0.5 ? '吸氣……' : '吐氣……';
        br.querySelector('small').textContent = `第 ${Math.min(3, Math.floor(stillT / 4) + 1)} / 3 次呼吸`;
        br.querySelector('span').textContent = '站著不要動，跟著光圈慢慢呼吸';
        if (stillT >= q.task.quest.secs) { br.hidden = true; stillT = 0; it.collect(); const pts = state.addPoints(`q:${q.task.id}:0`, 15); if (pts) floatPoints(pts); finishQuest(q); }
      } else if (near) {
        br.hidden = false;
        br.querySelector('b').textContent = '先停下來';
        br.querySelector('small').textContent = '';
        br.querySelector('span').textContent = '放開方向鍵，站在蒲團上不要動';
      } else { br.hidden = true; stillT = 0; }
      return;
    }
    let got = false;
    for (const it of world.items.get(q.task.id)) {
      if (it.done) continue;
      const gp = it.group.position;
      if (Math.hypot(gp.x - p.x, gp.z - p.y) < (it.kind === 'lamp' ? 2.2 : 1.7)) { it.collect(); got = true; const pts = state.addPoints(`q:${q.task.id}:${world.items.get(q.task.id).indexOf(it)}`, 5); if (pts) floatPoints(pts); }
    }
    if (got) {
      const pr = questProgress(q.task.id);
      if (pr.done >= pr.total) finishQuest(q);
      else toast(`${q.task.quest.item === 'lamp' ? '點亮了' : '撿到了'}！還差 ${pr.total - pr.done} 個`);
    }
  }
  function restoreQuests() {
    for (const t of TASKS) {
      const st = state.get().tasks[t.id]?.quest;
      const items = world.items.get(t.id) || [];
      if (st === 'done') items.forEach((it) => { it.collect(); it.group.visible = it.kind === 'lamp' || it.kind === 'lotus'; });
      if (st === 'active') {
        if (t.quest.type === 'escort') state.setTask(t.id, { quest: undefined });      // 重新整理後從頭帶路
        else items.forEach((it) => { if (!it.done) it.group.visible = true; });
      }
    }
  }

  /* ---------- 目前目標：整個遊戲只有一個「下一步」，畫面上方、地上的箭頭與光柱都跟著它 ---------- */
  const v2 = (it) => new THREE.Vector2(it.group.position.x, it.group.position.z);
  function objective() {
    const st = state.get();
    const q = activeQuest();
    if (q) {
      const t = q.task, type = t.quest.type, npc = t.npc.name;
      if (type === 'escort') {
        const to = world.spots.get(t.quest.to);
        return { kind: 'quest', tag: '任務', color: t.color, title: `帶${npc}走到「${to.place}」`, sub: `${npc}會跟在你身後`, target: to.frontV, key: 'esc:' + t.id, spot: t.quest.to };
      }
      const items = world.items.get(t.id) || [];
      if (type === 'still') {
        return { kind: 'quest', tag: '任務', color: t.color, title: '走到湖邊發光的蒲團上，站著不要動', sub: '站好後，跟著畫面中間的光圈呼吸三次', target: v2(items[0]), key: 'still:' + t.id, still: true };
      }
      const left = items.filter((it) => !it.done);
      if (left.length) {
        const p = explorer.pos;
        const best = left.reduce((b, it) => (it.group.position.distanceToSquared(new THREE.Vector3(p.x, it.group.position.y, p.y)) < b.group.position.distanceToSquared(new THREE.Vector3(p.x, b.group.position.y, p.y)) ? it : b));
        const pr = questProgress(t.id);
        return { kind: 'quest', tag: `任務 ${pr.done}/${pr.total}`, color: t.color, title: t.quest.label, sub: type === 'light' ? '走到發光的石燈旁，燈就會亮' : '走到光柱裡就會自動撿起來', target: v2(best), key: `item:${t.id}:${items.indexOf(best)}`, extras: left.filter((x) => x !== best).map(v2) };
      }
    }
    for (const t of TASKS) if (t.quest && st.tasks[t.id]?.quest === 'done') {
      const s = SPOTS.find((x) => x.task === t.id);
      if (!state.isDone(s.id)) return { kind: 'return', tag: '回報', color: t.color, title: `回去找 ${t.npc.name}`, sub: `告訴${t.npc.name}你幫好了`, target: world.spots.get(s.id).frontV, key: 'spot:' + s.id, spot: s.id };
    }
    if (navTarget) {
      const s = world.spots.get(navTarget);
      return { kind: 'pick', tag: '自選目的地', color: '#5a6fa6', title: `前往 ${labelOf(s)}`, sub: '', target: s.frontV, key: 'spot:' + navTarget, spot: navTarget };
    }
    const next = ORDER.find((x) => !state.isDone(x));
    if (next) {
      const s = world.spots.get(next), t = taskOf(next);
      const step = ORDER.filter((x) => state.isDone(x)).length + 1;
      const title = t ? `去找 ${t.npc.name}（${t.virtue}）` : next === 'origin' ? '去找導覽員 小蓮' : next === 'vowterrace' ? '登上山頂的「願行台」' : `前往「${s.place}」`;
      const sub = t ? `${t.npc.name}遇到了一點困難` : next === 'origin' ? '她在山門旁的石碑前，會告訴你這座島在做什麼' : next === 'lecture' ? '和 AI 聊聊你生活中的難題' : next === 'media' ? '看看三好四給在世界各地的影片' : '選一個你願意做到的小行動';
      return { kind: 'next', tag: `第 ${step} 站／共 ${ORDER.length} 站`, color: t?.color || zoneOf(next).color, title, sub, target: s.frontV, key: 'spot:' + next, spot: next };
    }
    return { kind: 'free', tag: '全部完成', color: '#b8863b', title: '整座島都被你點亮了！', sub: '可以自由走走，或打開 AI 導覽聊聊天', target: null, key: 'free' };
  }

  const obEl = $('objective'), obArrow = obEl.querySelector('.ob-arrow');
  let obLast = '', obT = 0, ob = objective();
  function renderObjective(dt) {
    obT += dt;
    if (obT < 0.2) return;
    obT = 0;
    ob = objective();
    const p = explorer.pos;
    let sub = ob.sub;
    if (ob.target) {
      const d = Math.hypot(ob.target.x - p.x, ob.target.y - p.y);
      const near = ob.spot && nearId === ob.spot;
      if (near) sub = `${touch ? '點下方的按鈕' : '按 Enter'}，${talkVerb(ob.spot)}`;
      else if (ob.still && d < 1.6) sub = '很好！站著不要動，跟著光圈呼吸';
      else sub = `${sub ? sub + '・' : ''}跟著地上的金色箭頭走${d > 3 ? `（還有 ${Math.round(guide.remaining ?? d)} 公尺）` : ''}`;
    }
    const html = `<span class="ob-tag" style="--tc:${ob.color}">${esc(ob.tag)}</span><b class="ob-title">${esc(ob.title)}</b><span class="ob-sub">${esc(sub)}</span>`;
    if (html !== obLast) { obEl.querySelector('.ob-text').innerHTML = html; obLast = html; }
    if (ob.spot !== obSpot) {
      obSpot = ob.spot;
      zoneList.querySelectorAll('.place').forEach((b) => b.setAttribute('aria-current', String(b.dataset.id === ob.spot)));
    }
  }
  let obSpot = null;
  const talkVerb = (id) => { const s = spotOf(id), t = taskOf(id); return t ? `和 ${t.npc.name} 說話` : s.npc ? `和 ${s.npc.name} 說話` : `進入「${s.place}」`; };

  /** 地上箭頭與目標光圈 */
  const showWorld = () => onIsland && !card.open && intro.hidden;
  function updateGuide() {
    const on = showWorld();
    guide.setTarget(on ? ob.target : null, ob.key, ob.extras || []);
    const escort = activeQuest()?.task.quest.type === 'escort';
    world.rings.forEach((r, id) => { r.show = on && (id === ob.spot || (id === nearId && !escort)); r.hot = id === nearId; });
  }
  /** 名牌（畫完 3D 之後投影到螢幕上）與「往哪走」的小箭頭 */
  const tmp = new THREE.Vector3();
  const setStyle = (tg, k, v) => { if (tg[k] !== v) { tg[k] = v; if (k === 'tr') tg.el.style.transform = v; else if (k === 'op') tg.el.style.opacity = v; else if (k === 'vis') tg.el.style.visibility = v; else tg.el.classList.toggle('is-target', v); } };
  function updateTags() {
    const on = showWorld();
    for (const [id, tg] of tags) {
      const sp = world.spots.get(id), v = world.npcs.get(id);
      if (v) tmp.set(v.group.position.x, v.group.position.y + 2.12 * (v.group.children[0].scale.y || 1), v.group.position.z);
      else tmp.copy(sp.anchor);
      const dd = Math.hypot(tmp.x - explorer.pos.x, tmp.z - explorer.pos.y);
      const isT = id === ob.spot;
      tmp.project(view.camera);
      const vis = on && tmp.z < 1 && Math.abs(tmp.x) < 1.1 && Math.abs(tmp.y) < 1.15 && (dd < 34 || isT) && !(v && dd < 1.0);
      setStyle(tg, 'vis', vis ? 'visible' : 'hidden');
      if (!vis) continue;
      const x = (tmp.x + 1) / 2 * innerWidth, y = (1 - tmp.y) / 2 * innerHeight;
      setStyle(tg, 'tr', `translate3d(${x.toFixed(0)}px, ${y.toFixed(0)}px, 0) translate(-50%, -100%)`);
      setStyle(tg, 'isT', isT);
      setStyle(tg, 'op', isT ? '1' : (Math.max(0.4, Math.min(1, (34 - dd) / 10))).toFixed(2));
    }
    if (on && ob.target && guide.next) {
      const p = explorer.pos, f = view.forward();
      const dx = guide.next.x - p.x, dz = guide.next.y - p.y;
      const ang = Math.atan2(f.x * dz - f.y * dx, f.x * dx + f.y * dz);
      obArrow.style.transform = `rotate(${ang.toFixed(2)}rad)`;
      obArrow.hidden = Math.hypot(dx, dz) < 0.6;
    } else obArrow.hidden = true;
  }

  /* ---------- 導航：自選目的地 ---------- */
  function setNav(id) {
    if (!onIsland) enterIsland();
    navTarget = state.isDone(id) || ORDER.find((x) => !state.isDone(x)) !== id ? id : null;
    obT = 1; renderObjective(0);
    toast(`目的地：${labelOf(spotOf(id))}`);
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
  /** 面板底部的「下一步」按鈕文字 */
  const nextLabel = () => {
    const o = objective();
    return o.kind === 'free' ? '' : o.title;
  };
  const card = new Card($('card'), {
    onClose: () => closeCard(),
    onNext: () => { closeCard(); const o = objective(); if (o.target) toast(`下一步：${o.title}`); },
    ctx: {
      complete: (id) => {
        const was = state.isDone(id);
        const before = LEVELS.filter((l) => l.spots.every((x) => state.isDone(x))).length;
        state.complete(id);
        if (!was) {
          const got = state.addPoints(`done:${id}`, 20); if (got) floatPoints(got);
          const lv = LEVELS.filter((l) => l.spots.every((x) => state.isDone(x)));
          if (lv.length > before) setTimeout(() => levelUp(lv.find((l) => l.spots.includes(id)) || lv.at(-1)), 900);
          world.bloom(id); const z = zoneOf(id), p = state.zoneProgress(z.id); toast(p.done >= p.total ? `✦ 完成「${z.name}」` : '✦ 島上又亮了一角');
          if (navTarget === id) navTarget = null;
        }
        card.setNext(nextLabel());
        obT = 1;
      },
      isDone: (id) => state.isDone(id),
      openChat: (q, mode) => openDrawer(q, mode),
      zoneOf,
      onChat: (f) => { chatSubs.add(f); return () => chatSubs.delete(f); },
      registerChat: (c) => { activeChat = c; },
      startQuest,
      questProgress,
      points: (n) => floatPoints(n),
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
    card.show(s, null);
    if (state.isDone(id)) card.setNext(nextLabel());
    renderLists();
    reframe();
  }
  function closeCard() {
    card.hide(); here = null;
    // 帶路任務結束後，島民回到自己的亭子
    for (const t of TASKS) if (t.quest?.type === 'escort' && state.get().tasks[t.id]?.quest === 'done') {
      const v = world.npcs.get(SPOTS.find((s) => s.task === t.id).id);
      if (v && v.home) { v.group.position.set(v.home.x, heightAt(v.home.x, v.home.y), v.home.y); v.group.rotation.y = v.face; }
    }
    obT = 1;
    canvas.focus?.();
    reframe();
  }

  /* ---------- 靠近互動 ---------- */
  const promptEl = $('prompt');
  function prompt(id) {
    if (id === nearId) return;
    nearId = id;
    if (!id) { promptEl.hidden = true; return; }
    const s = spotOf(id), t = taskOf(id);
    promptEl.hidden = false;
    promptEl.innerHTML = `<kbd>${touch ? '點這裡' : 'Enter'}</kbd><span>${t ? `和 <b>${esc(t.npc.name)}</b> 說話` : s.npc ? `和 <b>${esc(s.npc.name)}</b> 說話` : `進入 <b>${esc(s.place)}</b>`}</span>`;
    obT = 1;
  }
  promptEl.addEventListener('click', () => { if (nearId) openSpot(nearId); });
  function nearestStation() {
    const p = explorer.pos;
    let best = null, bd = TALK_R;
    for (const s of SPOTS) {
      const d = Math.hypot(s.front[0] - p.x, s.front[1] - p.y);
      if (d < bd) { bd = d; best = s.id; }
    }
    // 帶路途中，敏娜不會在講堂前「被搭話」
    const q = activeQuest();
    if (q?.task.quest.type === 'escort' && best === q.spot.id) return null;
    return best;
  }

  /* ---------- 鍵盤與觸控搖桿 ---------- */
  const MOVE = { KeyW: [0, 1], ArrowUp: [0, 1], KeyS: [0, -1], ArrowDown: [0, -1], KeyA: [-1, 0], ArrowLeft: [-1, 0], KeyD: [1, 0], ArrowRight: [1, 0] };
  const typing = (e) => /INPUT|TEXTAREA|SELECT/.test(e.target?.tagName || '') || e.target?.isContentEditable;
  const intro = $('intro');
  addEventListener('keydown', (e) => {
    if (!intro.hidden) { if (e.key === 'Enter' || e.key === 'Escape' || e.code === 'Space') { e.preventDefault(); closeIntro(); } return; }
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
    if (e.code === 'KeyM') { if (view.distT > 26) { view.distT = 19; view.pitchT = 0.58; } else { view.distT = 34; view.pitchT = 0.95; } }
    if (e.code === 'KeyQ') keys.add('TurnL');
    if (e.code === 'KeyE') keys.add('TurnR');
    if (e.code === 'KeyR' && !e.repeat) setRun(!running);
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

  /* ---------- 奔跑（一鍵切換） ---------- */
  const runBtn = $('run-btn');
  function setRun(v) { running = v; runBtn.setAttribute('aria-pressed', String(v)); runBtn.querySelector('span').textContent = v ? '奔跑中' : '奔跑'; }
  runBtn.addEventListener('click', () => { setRun(!running); canvas.focus?.(); });

  /* ---------- 鏡頭 ---------- */
  function reframe() {
    view.setOverview(!onIsland);
    world.shadowWide(!onIsland);
    const panel = card.open ? $('card') : !drawer.hidden ? drawer : null;
    view.offsetXT = panel && !narrow() && onIsland ? panel.getBoundingClientRect().width / 2 : 0;
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

  /* ---------- 首頁、新手說明、指南、關於 ---------- */
  function openIntro() {
    intro.hidden = false;
    keys.clear(); joy.set(0, 0);
    requestAnimationFrame(() => intro.classList.add('is-in'));
    intro.querySelector('.intro-go').focus({ preventScroll: true });
  }
  function closeIntro() {
    intro.hidden = true; intro.classList.remove('is-in');
    try { localStorage.setItem(INTRO_KEY, '1'); } catch { /* 無痕模式 */ }
    canvas.focus?.();
    obT = 1;
    hint(touch ? '用左下角的搖桿走路，跟著地上的金色箭頭走。' : '用 W A S D 或方向鍵走路，跟著地上的金色箭頭走。', 7000);
  }
  intro.querySelector('.intro-go').addEventListener('click', closeIntro);
  $('help-btn').addEventListener('click', openIntro);
  function enterIsland() {
    if (onIsland) return;
    onIsland = true;
    $('home').classList.add('is-out');
    setTimeout(() => { $('home').hidden = true; }, 600);
    document.body.classList.add('on-island');
    canvas.focus?.();
    let seen = false; try { seen = localStorage.getItem(INTRO_KEY) === '1'; } catch { /* 無痕模式 */ }
    if (!seen && !/[?&]nointro\b/.test(location.search)) openIntro();
    else hint(state.isDone('origin') ? '歡迎回來！看畫面上方的「目前目標」，跟著地上的金色箭頭走。' : '跟著地上的金色箭頭，先去找導覽員小蓮。', 6000);
    obT = 1;
    renderLists();
    reframe();
  }
  function goHome() {
    closeCard(); closeDrawer();
    onIsland = false;
    document.body.classList.remove('on-island');
    $('home').hidden = false;
    requestAnimationFrame(() => $('home').classList.remove('is-out'));
    hint(''); prompt(null);
    reframe();
  }
  const modal = $('modal');
  function openModal(which) {
    $('modal-body').innerHTML = which === 'about' ? ABOUT : GUIDE;
    modal.hidden = false;
    modal.querySelector('.modal-close').focus();
    modal.querySelector('[data-reset]')?.addEventListener('click', (e) => {
      const b = e.currentTarget;
      if (b.dataset.armed) { state.reset(); try { localStorage.removeItem(INTRO_KEY); } catch { /* */ } location.reload(); return; }
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
  const mbtn = $('music-btn');
  const paintMusic = () => { mbtn.setAttribute('aria-pressed', String(music.on)); mbtn.querySelector('span').textContent = music.on ? '音樂：開' : '音樂：關'; };
  mbtn.addEventListener('click', (e) => { e.stopPropagation(); music.set(!music.on); paintMusic(); });
  paintMusic();
  music.start();

  /* ---------- 尺寸 ---------- */
  function resize() {
    renderer.setSize(innerWidth, innerHeight, false);
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
  let t = 0, timeScale = 1, fpsAcc = 0, fpsN = 0;
  const mv = new THREE.Vector2();
  renderer.setAnimationLoop(() => {
    const raw = clock.getDelta();
    const dt = Math.min(raw, 0.05) * timeScale;
    t += dt;
    if (onIsland && !card.open && modal.hidden && intro.hidden) {
      mv.set(0, 0);
      for (const k of keys) if (MOVE[k]) { mv.x += MOVE[k][0]; mv.y += MOVE[k][1]; }
      mv.add(joy);
      if (keys.has('TurnL')) view.turn(dt * 1.6);
      if (keys.has('TurnR')) view.turn(-dt * 1.6);
      if (mv.lengthSq() > 0.01) {
        const len = Math.min(1, mv.length());
        const F = view.forward(), R = view.right();
        const dx = R.x * mv.x + F.x * mv.y, dz = R.y * mv.x + F.y * mv.y;
        const speed = (running || keys.has('Shift') ? 10.5 : 6.6) * len;
        explorer.stride = running || keys.has('Shift') ? 17 : 12.5;
        explorer.drive(dx, dz, speed * dt, dt, (x, z) => world.walkable(x, z));
      }
      questTick(dt);
      prompt(nearestStation());
      // 自選的目的地到了
      if (navTarget) { const s = world.spots.get(navTarget); if (Math.hypot(s.front[0] - explorer.pos.x, s.front[1] - explorer.pos.y) <= TALK_R) { navTarget = null; obT = 1; } }
    }
    view.follow(explorer.pos.x, explorer.object.position.y, explorer.pos.y);
    const fw = view.forward();
    world.follow(explorer.pos.x, explorer.pos.y, fw.x, fw.y);
    explorer.update(dt);
    for (const v of world.npcs.values()) v.watch(explorer.pos.x, explorer.pos.y);
    if (onIsland) renderObjective(dt);
    // 島嶼光明度：善念越多，畫面越明亮
    glowNow += (brightness() - glowNow) * Math.min(1, dt * 1.5);
    renderer.toneMappingExposure = 0.95 + 0.1 * glowNow;
    world.update(t, dt);
    updateGuide();
    guide.update(dt, explorer.pos, ground);
    view.update(dt, innerWidth, innerHeight);
    renderer.render(world.scene, view.camera);
    updateTags();
    // 依實際幀率調整解析度（低於 40 fps 降低、穩定 58 fps 以上再慢慢升回）
    fpsAcc += raw; fpsN++;
    if (fpsAcc > 2) {
      const fps = fpsN / fpsAcc; fpsAcc = 0; fpsN = 0;
      if (!fixedRes && !document.hidden) {
        let next = prNow;
        if (fps < 40 && prNow > 0.75) next = Math.max(0.75, prNow - 0.2);
        else if (fps > 58 && prNow < prMax) next = Math.min(prMax, prNow + 0.1);
        if (next !== prNow) { prNow = next; renderer.setPixelRatio(prNow); resize(); }
      }
    }
  });

  requestAnimationFrame(() => setTimeout(() => $('loading').classList.add('is-out'), 300));
  document.fonts?.ready.then(() => reframe());

  // 自動化測試用（不影響使用者）
  window.__isle = {
    world, explorer, card, view, state, renderer, guide, enterIsland, openDrawer, openSpot, startQuest, setNav, closeIntro,
    keys, buildMs, get near() { return nearId; }, get objective() { return objective(); }, get pixelRatio() { return prNow; },
    teleport(x, z) { explorer.place(x, z); },
    set timeScale(v) { timeScale = v; },
  };
}

try { boot(); } catch (err) {
  console.error(err);
  fail(`載入時發生錯誤：${err.message}。請重新整理頁面。`);
}
