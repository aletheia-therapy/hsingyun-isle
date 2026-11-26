import * as THREE from 'three';
import { SPOTS, ZONES, START } from './data/spots.js';
import { TASKS } from './data/tasks.js';
import { World } from './scene/world.js';
import { Explorer } from './scene/explorer.js';
import { TPCamera } from './scene/tpcam.js';
import { Guide } from './scene/guide.js';
import { heightAt, islandD, STAIR } from './scene/terrain.js';
import { Card } from './ui/card.js';
import { Chat, esc } from './ui/chat.js';
import { music } from './ui/music.js';
import { state } from './state.js';
import { GUIDE, ABOUT } from './ui/pages.js';
import { LEVELS } from './data/games.js';
import { Fireworks } from './scene/fireworks.js';
import { sfx } from './ui/sfx.js';
import { MindTrial, makeAura, GHOSTS } from './scene/ghosts.js';
import { SOURCES } from './data/sources.js';
import { MERIT } from './data/merit.js';

const $ = (id) => document.getElementById(id);
const narrow = () => matchMedia('(max-width: 860px)').matches;
const touch = matchMedia('(pointer: coarse)').matches;
const TALK_R = 2.4;
/** 移動速度（公尺／秒，輕快小跑步）；帶路時島民跟得上 */
const WALK = 5.0, FOLLOW = 5.6;
/** 建議路線：沿著島走一圈（山門 → 三好村 → 四給街 → 講堂 → 影音堂 → 山頂），每一站都在上一站附近 */
const ORDER = ['origin', 'deed', 'speech', 'heart', 'confidence', 'hope', 'joy', 'ease', 'lecture', 'media', 'vowterrace'];
const NUM = '①②③④⑤⑥⑦⑧⑨⑩⑪';
const INTRO_KEY = 'hsingyun-isle:intro';
const WORKS = new Set(['book', 'easel', 'pot']);

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
  const walkable = (x, z) => world.walkable(x, z);
  const view = new TPCamera(ground);
  const explorer = new Explorer();
  explorer.ground = ground;
  world.scene.add(explorer.object);
  explorer.place(START[0], START[1]);
  explorer.faceTowards(0, 0);
  view.follow(START[0], 0, START[1]);
  const guide = new Guide(world);
  const buildMs = Math.round(performance.now() - t0);
  /** 山頂的願行台：全部完成後回到這裡放煙火 */
  const SUMMIT = world.spots.get('vowterrace');
  const allDone = () => SPOTS.every((s) => state.isDone(s.id));
  /** 會轉頭看旅人的任務人物 */
  const watchers = [...world.items.values()].flat().filter((it) => it.watch);

  /* ---------- 狀態 ---------- */
  let onIsland = false, here = null, nearId = null, nearItem = null, nearFinale = false, navTarget = null, stillT = 0, talking = null, speedNow = 0, finale = null, duskNow = 0;
  const lastDir = new THREE.Vector2(0, 1);
  const keys = new Set();
  const joy = new THREE.Vector2();
  const chatSubs = new Set();
  let lastChatLen = state.get().chat.length;
  const spotOf = (id) => SPOTS.find((s) => s.id === id);
  const zoneOf = (spotId) => ZONES.find((z) => z.id === spotOf(spotId)?.zone);
  const taskOf = (spotId) => TASKS.find((t) => t.id === spotOf(spotId)?.task);
  const labelOf = (s) => { const t = taskOf(s.id); return t ? `${t.npc.name}（${t.virtue}）` : s.npc ? `導覽員 ${s.npc.name}` : s.place; };
  const brightness = () => SPOTS.filter((s) => state.isDone(s.id)).length / SPOTS.length;
  const itemsOf = (taskId) => world.items.get(taskId) || [];
  let glowNow = brightness();
  state.on((s) => {
    renderLists();
    const reply = s.chat.length > lastChatLen && s.chat.at(-1)?.role === 'assistant';
    lastChatLen = s.chat.length;
    if (reply) {
      chatSubs.forEach((f) => f());
      // 向 AI 提問、得到回答：智慧增加（前五次）
      queueMicrotask(() => {
        const n = Object.keys(state.get().points).filter((k) => k.startsWith('ask:')).length;
        if (n < MERIT.askMax) gain(state.addMerit(`ask:${n + 1}`, MERIT.ask), '提問');
      });
    }
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
  const makeTag = (color, name, sub) => {
    const el = document.createElement('button');
    el.type = 'button'; el.tabIndex = -1; el.className = 'tag';
    el.style.setProperty('--zc', color);
    el.innerHTML = `<i class="tag-st" aria-hidden="true"></i><b>${esc(name)}</b><small>${esc(sub)}</small><span class="tag-goal">目標</span>`;
    tagsEl.appendChild(el);
    el.style.visibility = 'hidden';
    return el;
  };
  for (const s of SPOTS) {
    const t = taskOf(s.id), z = ZONES.find((x) => x.id === s.zone);
    const el = makeTag(t?.color || z.color, t ? t.npc.name : s.npc ? s.npc.name : s.place, t ? t.virtue : s.npc ? '導覽員' : z.sub);
    el.addEventListener('click', () => setNav(s.id));
    tags.set(s.id, { el, npc: !!(t || s.npc), last: '', vis: 'hidden' });
  }
  /** 任務人物（組員）與心火的名牌：任務進行中才出現 */
  const itemTags = [];
  for (const t of TASKS) {
    itemsOf(t.id).forEach((it, i) => {
      if (!it.talk) return;
      const el = makeTag(t.color, it.talk.name, it.talk.role || '');
      el.dataset.st = 'need'; el.classList.add('tag-item');
      itemTags.push({ el, t, i, it, h: it.kind === 'person' ? 2.1 : 1.75, vis: 'hidden' });
    });
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
    $('fu').textContent = String(state.fu);
    $('hui').textContent = String(state.hui);
    $('badges').innerHTML = LEVELS.map((l) => { const ok = l.spots.every((x) => st.done.includes(x)); return `<span class="badge${ok ? ' is-on' : ''}" style="--bc:${l.color}" title="${l.badge}">${l.mark}</span>`; }).join('');
    const cur = LEVELS.find((l) => !l.spots.every((x) => st.done.includes(x)));
    $('level').innerHTML = cur ? `<b>${cur.name}</b><span>${cur.spots.filter((x) => st.done.includes(x)).length} / ${cur.spots.length}</span>` : '<b>全部過關！</b><span>島嶼已完全點亮</span>';
    for (const [id, tg] of tags) { const s = tagStatus(id); if (s !== tg.last) { tg.el.dataset.st = s; tg.last = s; } }
    // 心魔試煉：完成第一站後出現
    const tr = $('trial');
    tr.hidden = !st.done.includes('origin');
    if (!tr.hidden) tr.innerHTML = `<b>心魔試煉</b><span>${Object.entries(GHOSTS).map(([id, g]) => (st.ghosts?.[id] ? `<i class="tr-g is-ok">✓ ${g.tamedName}</i>` : `<i class="tr-g">${g.name}</i>`)).join('')}</span>`;
  }
  /**
   * 福德、智慧增加（或減少）多少：從人物頭上冒出來、慢慢往上飄。
   * 同時有好幾筆時一筆接一筆；人物被面板擋住時，改在面板外側顯示。
   */
  const popsEl = $('pops'), pops = [];
  let popNext = 0;
  function gain(g, label = '') {
    if (!g || (!g[0] && !g[1])) return;
    const chip = (cls, name, n) => (n ? `<span class="${cls}${n < 0 ? ' is-minus' : ''}"><i>${name}</i>${n > 0 ? '+' : '−'}${Math.abs(n)}</span>` : '');
    const el = document.createElement('div');
    el.className = 'pop';
    el.innerHTML = `${label ? `<em>${esc(label)}</em>` : ''}<p>${chip('pop-f', '福德', g[0])}${chip('pop-w', '智慧', g[1])}</p>`;
    popsEl.appendChild(el);
    const now = performance.now() / 1000, start = Math.max(now, popNext);
    popNext = start + 0.7;
    pops.push({ el, start });
    renderLists();
  }
  const POP_T = 2.4;
  let popRate = 1;                                   // 自動化測試用：放慢飄字，方便截圖
  function updatePops() {
    if (!pops.length) return;
    const now = performance.now() / 1000;
    tmp.set(explorer.pos.x, explorer.object.position.y + 2.2, explorer.pos.y).project(view.camera);
    let x = (tmp.x + 1) / 2 * innerWidth, y = (1 - tmp.y) / 2 * innerHeight;
    if (tmp.z > 1) { x = innerWidth / 2; y = innerHeight * 0.4; }
    const panel = card.open ? $('card') : !drawer.hidden ? drawer : null;
    if (panel) {
      const r = panel.getBoundingClientRect();
      if (narrow()) y = Math.min(y, r.top - 12);
      else x = Math.min(x, r.left - 110);
    }
    if (!narrow()) { const pl = placesEl.getBoundingClientRect(); if (pl.width && onIsland) x = Math.max(x, pl.right + 100); }      // 不要疊在左側的善念地圖上
    x = Math.max(90, Math.min(innerWidth - 90, x)); y = Math.max(200, y);
    for (let i = pops.length - 1; i >= 0; i--) {
      const p = pops[i], t = (now - p.start) * popRate;
      if (t < 0) { p.el.style.opacity = '0'; continue; }
      if (t > POP_T) { p.el.remove(); pops.splice(i, 1); continue; }
      const k = Math.min(1, t / POP_T), rise = 8 + (narrow() ? 56 : 78) * (1 - (1 - k) * (1 - k));      // 手機畫面上方比較擠，飄得低一點
      const sc = t < 0.16 ? 0.55 + (t / 0.16) * 0.6 : t < 0.3 ? 1.15 - ((t - 0.16) / 0.14) * 0.15 : 1;
      p.el.style.transform = `translate3d(${x.toFixed(0)}px, ${(y - rise).toFixed(0)}px, 0) translate(-50%, -100%) scale(${sc.toFixed(3)})`;
      p.el.style.opacity = (t < 0.12 ? t / 0.12 : t > POP_T - 0.6 ? Math.max(0, (POP_T - t) / 0.6) : 1).toFixed(2);
    }
  }
  /** 過關：大大的徽章（加上這一關的福德與智慧；徽章收起來時，人物頭上也會冒出來） */
  let luToken = 0;
  function levelUp(l) {
    const g = state.addMerit(`level:${l.id}`, MERIT.level);
    if (finale) return;                    // 煙火已經開始了，就不再跳出徽章
    const box = $('levelup'), my = ++luToken;
    box.innerHTML = `<div class="lu-card" style="--bc:${l.color}"><span class="lu-mark">${l.mark}</span><p class="lu-t">過關！</p><h3>${l.name}</h3><p>獲得「${l.badge}」</p>${g ? `<p class="lu-gain"><span class="pop-f"><i>福德</i>+${g[0]}</span><span class="pop-w"><i>智慧</i>+${g[1]}</span></p>` : ''}<button type="button" class="btn btn-primary">繼續</button></div>`;
    box.hidden = false;
    const close = () => { if (my !== luToken || box.hidden) return; box.hidden = true; gain(g, `過關・${l.badge}`); };
    box.querySelector('button').addEventListener('click', close);
    setTimeout(close, 5000);
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
  /** 找到小安的作品時，畫面下方浮出的小卡（不擋路，幾秒後自己消失） */
  let discoverT = 0;
  function discover(t, idx) {
    const msg = t.quest.msgs?.[idx]; if (!msg) return;
    const pr = questProgress(t.id), el = $('discover');
    el.style.setProperty('--tc', t.color);
    el.innerHTML = `<b>✦ 找到了（${pr.done} / ${pr.total}）</b><p>${esc(msg)}</p>`;
    el.hidden = false; el.classList.remove('is-in'); void el.offsetWidth; el.classList.add('is-in');
    clearTimeout(discoverT);
    discoverT = setTimeout(() => { el.classList.remove('is-in'); setTimeout(() => { el.hidden = true; }, 400); }, 5500);
  }

  /* ---------- 島上任務 ---------- */
  const activeQuest = () => {
    for (const t of TASKS) if (t.quest && state.get().tasks[t.id]?.quest === 'active') return { task: t, spot: SPOTS.find((s) => s.task === t.id) };
    return null;
  };
  const questProgress = (taskId) => {
    const t = TASKS.find((x) => x.id === taskId);
    if (t.quest.type === 'escort') return { done: state.get().tasks[taskId]?.quest === 'done' ? 1 : 0, total: 1 };
    const list = itemsOf(taskId);
    return { done: list.filter((i) => i.done).length, total: list.length };
  };
  /** 讓這個任務還沒完成的物件出現（心火要等靜心之後才燃起） */
  function showQuestItems(t) {
    const list = itemsOf(t.id);
    list.forEach((it) => { if (!it.done) it.group.visible = it.kind === 'fire' ? list[0].done : true; });
  }
  function startQuest(taskId) {
    const cur = activeQuest();
    if (cur && cur.task.id !== taskId) { toast(`請先完成：${cur.task.quest.label}`); return; }
    const t = TASKS.find((x) => x.id === taskId);
    state.setTask(taskId, { quest: 'active' });
    showQuestItems(t);
    closeCard();
    toast(`任務開始：${t.quest.label}`);
    hint('看畫面上方的「目前目標」，跟著地上的金色箭頭走。', 6000);
    renderLists();
  }
  function finishQuest(q) {
    state.setTask(q.task.id, { quest: 'done' });
    $('breath').hidden = true;
    if (q.task.quest.type === 'escort') {
      gain(state.addMerit(`q:${q.task.id}:escort`, MERIT.escort), '帶到了');
      toast(`✦ 帶到了！${q.task.npc.name}想跟你說句話`);
      openSpot(q.spot.id);
    } else {
      toast(`✦ 完成！回去找${q.task.npc.name}吧`);
    }
    obT = 1;
    renderLists();
  }
  /** 完成任務裡的一件事：記錄進度（重新整理也不會不見）、增加福德與智慧，全部完成就結束任務 */
  function gotItem(t, idx, g, label = '') {
    const it = itemsOf(t.id)[idx];
    it.collect();
    const got = state.get().tasks[t.id]?.got || [];
    state.setTask(t.id, { got: got.includes(idx) ? got : [...got, idx] });
    gain(state.addMerit(`q:${t.id}:${idx}`, g), label);
    obT = 1;
    const pr = questProgress(t.id);
    if (pr.done >= pr.total) { finishQuest({ task: t, spot: SPOTS.find((s) => s.task === t.id) }); return true; }
    return false;
  }
  function stillTick(q, it, dt, onDone) {
    const p = explorer.pos, gp = it.group.position;
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
      if (stillT >= q.task.quest.secs) { br.hidden = true; stillT = 0; onDone(); }
    } else if (near) {
      br.hidden = false;
      br.querySelector('b').textContent = '先停下來';
      br.querySelector('small').textContent = '';
      br.querySelector('span').textContent = touch ? '放開搖桿，站在蒲團上不要動' : '放開方向鍵，站在蒲團上不要動';
    } else { br.hidden = true; stillT = 0; }
  }
  function questTick(dt) {
    const q = activeQuest();
    if (!q) return;
    const p = explorer.pos, type = q.task.quest.type, list = itemsOf(q.task.id);
    if (type === 'escort') {
      const v = world.npcs.get(q.spot.id);
      const g = v.group.position, d = Math.hypot(p.x - g.x, p.y - g.z);
      if (d > 1.6) {
        const step = Math.min(d - 1.4, FOLLOW * dt);
        const dx = (p.x - g.x) / d, dz = (p.y - g.z) / d;
        g.x += dx * step; g.z += dz * step; g.y = ground(g.x, g.z);
        let a = Math.atan2(dx, dz) - v.group.rotation.y; a = Math.atan2(Math.sin(a), Math.cos(a));
        v.group.rotation.y += a * Math.min(1, dt * 10); v.moving = true; v.stepBy(step);
      } else v.moving = false;
      if (d > 14) { const f = view.forward(); g.x = p.x - f.x * 1.4; g.z = p.y - f.y * 1.4; }      // 跟丟了就跳到身邊
      const to = world.spots.get(q.task.quest.to).frontV;
      if (Math.hypot(p.x - to.x, p.y - to.y) < TALK_R && d < 3) { v.moving = false; finishQuest(q); }
      return;
    }
    if (type === 'heart') {
      // 第一步：在蒲團上靜心呼吸；之後三把心火才會燃起（用對話熄滅）
      if (!list[0].done) stillTick(q, list[0], dt, () => {
        gotItem(q.task, 0, MERIT.item.lotus, '心靜下來了');
        showQuestItems(q.task);
        toast('心靜下來了。湖邊燃起了三把心火');
        hint('走到火盆旁，選出用「戒、定、慧」哪一種方法熄滅它。', 7000);
      });
      return;
    }
    if (type === 'talk') return;                       // 組員：走近按 Enter 對話
    list.forEach((it, i) => {
      if (it.done || !it.group.visible) return;
      const gp = it.group.position;
      if (Math.hypot(gp.x - p.x, gp.z - p.y) < (it.kind === 'lamp' ? 2.2 : WORKS.has(it.kind) ? 2.1 : 1.7)) {
        const fin = gotItem(q.task, i, MERIT.item[it.kind] || [3, 1]);
        if (WORKS.has(it.kind)) discover(q.task, i);
        else if (!fin) { const pr = questProgress(q.task.id); toast(`${it.kind === 'lamp' ? '點亮了' : '撿到了'}！還差 ${pr.total - pr.done} 個`); }
      }
    });
  }
  function restoreQuests() {
    for (const t of TASKS) {
      if (!t.quest) continue;
      const ts = state.get().tasks[t.id] || {}, list = itemsOf(t.id);
      if (ts.quest === 'done' || (state.isDone(t.id) && t.quest.type !== 'escort')) {
        list.forEach((it) => it.collect(true));
      } else if (ts.quest === 'active') {
        if (t.quest.type === 'escort') { state.setTask(t.id, { quest: undefined }); continue; }      // 重新整理後從頭帶路
        (ts.got || []).forEach((i) => list[i]?.collect(true));
        showQuestItems(t);
      }
    }
  }

  /* ---------- 和組員說話、熄滅心火：畫面下方的對話框 ---------- */
  const talkEl = $('talk');
  function nearestTalkItem() {
    const q = activeQuest();
    if (!q || (q.task.quest.type !== 'talk' && q.task.quest.type !== 'heart')) return null;
    const list = itemsOf(q.task.id), p = explorer.pos;
    let best = null, bd = TALK_R;
    list.forEach((it, i) => {
      if (!it.talk || it.done || !it.group.visible) return;
      const d = Math.hypot(it.group.position.x - p.x, it.group.position.z - p.y);
      if (d < bd) { bd = d; best = { task: q.task, i, it }; }
    });
    return best;
  }
  const itemVerb = (n) => (n.it.talk.kind === 'fire' ? `熄滅「${n.it.talk.name}」` : `和 ${n.it.talk.name} 說話`);
  function openTalk(n) {
    const { task: t, i: idx, it } = n, d = it.talk, fire = d.kind === 'fire';
    talking = { t, idx, it, miss: 0 };
    keys.clear(); joy.set(0, 0);
    const order = d.options.map((_, k) => k).sort(() => Math.random() - 0.5);
    talkEl.style.setProperty('--tc', t.color);
    talkEl.innerHTML = `
      <div class="talk-box" role="dialog" aria-modal="true" aria-labelledby="talk-who" tabindex="-1">
        <button type="button" class="icon-btn talk-x" aria-label="先離開">×</button>
        <p class="talk-who" id="talk-who"><b>${esc(d.name)}</b><small>${esc(fire ? '心火・三毒之一' : d.role || '')}</small></p>
        <p class="talk-line">${esc(fire ? d.line : `「${d.line}」`)}</p>
        <p class="talk-ask">${fire ? '這把火，要用「戒、定、慧」哪一種方法熄滅？' : '你會怎麼回應？選一句能化解火氣的話。'}</p>
        <div class="talk-opts">${order.map((k, j) => `<button type="button" class="opt" data-k="${k}"><b>${j + 1}</b><span>${esc(d.options[k].t)}</span></button>`).join('')}</div>
        <div class="talk-why" aria-live="polite"></div>
      </div>`;
    talkEl.hidden = false;
    document.body.classList.add('talk-open');
    talkEl.querySelector('.talk-x').addEventListener('click', closeTalk);
    talkEl.querySelectorAll('.talk-opts .opt').forEach((b) => b.addEventListener('click', () => pickTalk(b)));
    setNear(null, null);
    requestAnimationFrame(() => { talkEl.classList.add('is-in'); talkEl.querySelector('.talk-box').focus({ preventScroll: true }); });
  }
  function pickTalk(b) {
    if (!talking) return;
    const { t, idx, it } = talking, d = it.talk, o = d.options[Number(b.dataset.k)], fire = d.kind === 'fire';
    const why = talkEl.querySelector('.talk-why');
    if (!o.ok) {
      talking.miss++;
      b.disabled = true; b.classList.add('is-wrong');
      why.innerHTML = `<p class="mg-no"><b>不太好喔。</b>${esc(o.why)}再選一次。</p>`;
      return;
    }
    talkEl.querySelectorAll('.talk-opts .opt').forEach((x) => { x.disabled = true; x.classList.toggle('is-right', x === b); });
    why.innerHTML = `<p class="mg-ok"><b>${fire ? `✦ ${esc(d.name)}熄滅了，化成一盞小蓮燈。` : `✦ ${esc(d.name)}的火氣消了。`}</b>${esc(o.why)}</p><button type="button" class="btn btn-primary talk-go">繼續</button>`;
    const go = why.querySelector('.talk-go');
    go.focus({ preventScroll: true });
    go.addEventListener('click', () => {
      const miss = talking?.miss || 0;
      closeTalk();
      const k = fire ? 'fire' : 'person';
      if (!gotItem(t, idx, MERIT.item[miss ? `${k}Retry` : k], fire ? `熄滅${d.name}` : '化解了火氣')) {
        const pr = questProgress(t.id), left = pr.total - pr.done;
        toast(fire ? `還有 ${left} 把心火` : `還有 ${left} 位組員`);
      }
    });
  }
  function closeTalk() {
    talking = null;
    talkEl.hidden = true; talkEl.classList.remove('is-in');
    document.body.classList.remove('talk-open');
    canvas.focus?.();
    obT = 1;
  }

  /* ---------- 目前目標：整個遊戲只有一個「下一步」，畫面上方、地上的箭頭與光柱都跟著它 ---------- */
  const v2 = (it) => new THREE.Vector2(it.group.position.x, it.group.position.z);
  const nearest = (list) => { const p = explorer.pos; return list.reduce((b, it) => (b === null || v2(it).distanceToSquared(p) < v2(b).distanceToSquared(p) ? it : b), null); };
  function objective() {
    const st = state.get();
    const q = activeQuest();
    if (q) {
      const t = q.task, type = t.quest.type, npc = t.npc.name;
      if (type === 'escort') {
        const to = world.spots.get(t.quest.to);
        return { kind: 'quest', tag: '任務', color: t.color, title: `帶${npc}走到「${to.place}」`, sub: `${npc}會跟在你身後`, target: to.frontV, key: 'esc:' + t.id, spot: t.quest.to };
      }
      const items = itemsOf(t.id);
      const pr = questProgress(t.id);
      if (type === 'heart' && !items[0].done) {
        return { kind: 'quest', tag: '任務・第 1 步', color: t.color, title: '走到湖邊發光的蒲團上，站著不要動', sub: '站好後，跟著畫面中間的光圈呼吸三次', target: v2(items[0]), key: 'still:' + t.id, still: true };
      }
      const left = items.filter((it) => !it.done && it.group.visible);
      if (left.length) {
        const best = nearest(left), idx = items.indexOf(best);
        const how = touch ? '點畫面下方的按鈕' : '按 Enter';
        let title = t.quest.label, sub = '走到光柱裡就會自動撿起來', tag = `任務 ${pr.done}/${pr.total}`;
        if (type === 'talk') sub = `走到 ${best.talk.name} 旁邊，${how}和他說話`;
        else if (type === 'heart') { title = '熄滅湖邊的三把心火：貪・瞋・痴'; sub = `走到「${best.talk.name}」旁，${how}，選出熄滅它的方法`; tag = `任務・第 2 步 ${pr.done - 1}/${pr.total - 1}`; }
        else if (type === 'light') sub = '走到發光的石燈旁，燈就會亮';
        else if (WORKS.has(best.kind)) sub = '走到光柱那裡，看看小安做了什麼';
        return { kind: 'quest', tag, color: t.color, title, sub, target: v2(best), key: `item:${t.id}:${idx}`, extras: left.filter((x) => x !== best).map(v2), item: best };
      }
    }
    for (const t of TASKS) if (t.quest && st.tasks[t.id]?.quest === 'done') {
      const s = SPOTS.find((x) => x.task === t.id);
      if (!state.isDone(s.id)) return { kind: 'return', tag: '回報', color: t.color, title: `回去找 ${t.npc.name}`, sub: `告訴${t.npc.name}你幫好了，再完成「佛法挑戰」`, target: world.spots.get(s.id).frontV, key: 'spot:' + s.id, spot: s.id };
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
    if (!st.finale) return { kind: 'final', tag: '最後一步', color: '#b0565a', title: '回到山頂，看看被你點亮的島', sub: '走到山頂的願行台', target: SUMMIT.frontV, key: 'final' };
    return { kind: 'free', tag: '全部完成', color: '#b8863b', title: '整座島都被你點亮了！', sub: '可以自由走走；回到山頂的願行台，還可以再看一次煙火', target: null, key: 'free' };
  }

  const obEl = $('objective'), obArrow = obEl.querySelector('.ob-arrow');
  let obLast = '', obT = 0, ob = objective(), obSpot = null;
  function renderObjective(dt) {
    obT += dt;
    if (obT < 0.2) return;
    obT = 0;
    ob = objective();
    const p = explorer.pos;
    let sub = ob.sub;
    if (ob.target) {
      const d = Math.hypot(ob.target.x - p.x, ob.target.y - p.y);
      const how = touch ? '點下方的按鈕' : '按 Enter';
      if (nearItem && ob.item === nearItem.it) sub = `${how}，${itemVerb(nearItem)}`;
      else if (ob.spot && nearId === ob.spot) sub = `${how}，${talkVerb(ob.spot)}`;
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
  const talkVerb = (id) => { const s = spotOf(id), t = taskOf(id); return t ? `和 ${t.npc.name} 說話` : s.npc ? `和 ${s.npc.name} 說話` : `進入「${s.place}」`; };

  /** 地上箭頭與目標光圈 */
  const showWorld = () => onIsland && !card.open && intro.hidden && !finale;
  function updateGuide() {
    const on = showWorld();
    guide.setTarget(on ? ob.target : null, ob.key, ob.extras || []);
    const escort = activeQuest()?.task.quest.type === 'escort';
    world.rings.forEach((r, id) => { r.show = on && (id === ob.spot || (id === nearId && !escort)); r.hot = id === nearId; });
  }
  /** 名牌（畫完 3D 之後投影到螢幕上）與「往哪走」的小箭頭 */
  const tmp = new THREE.Vector3();
  const setStyle = (tg, k, v) => { if (tg[k] !== v) { tg[k] = v; if (k === 'tr') tg.el.style.transform = v; else if (k === 'op') tg.el.style.opacity = v; else if (k === 'vis') tg.el.style.visibility = v; else tg.el.classList.toggle('is-target', v); } };
  const place = (tg, isT, dd) => {
    const x = (tmp.x + 1) / 2 * innerWidth, y = (1 - tmp.y) / 2 * innerHeight;
    setStyle(tg, 'tr', `translate3d(${x.toFixed(0)}px, ${y.toFixed(0)}px, 0) translate(-50%, -100%)`);
    setStyle(tg, 'isT', isT);
    setStyle(tg, 'op', isT ? '1' : (Math.max(0.4, Math.min(1, (34 - dd) / 10))).toFixed(2));
  };
  const onScreen = () => tmp.z < 1 && Math.abs(tmp.x) < 1.1 && Math.abs(tmp.y) < 1.15;
  function updateTags() {
    const on = showWorld();
    for (const [id, tg] of tags) {
      const sp = world.spots.get(id), v = world.npcs.get(id);
      if (v) tmp.set(v.group.position.x, v.group.position.y + 2.12 * (v.group.children[0].scale.y || 1), v.group.position.z);
      else tmp.copy(sp.anchor);
      const dd = Math.hypot(tmp.x - explorer.pos.x, tmp.z - explorer.pos.y);
      const isT = id === ob.spot;
      tmp.project(view.camera);
      const vis = on && onScreen() && (dd < 34 || isT) && !(v && dd < 1.0);
      setStyle(tg, 'vis', vis ? 'visible' : 'hidden');
      if (vis) place(tg, isT, dd);
    }
    const aq = activeQuest()?.task.id;
    for (const tg of itemTags) {
      const it = tg.it, gp = it.group.position;
      let vis = on && aq === tg.t.id && it.group.visible && !it.done;
      let dd = 0;
      if (vis) {
        tmp.set(gp.x, gp.y + tg.h, gp.z);
        dd = Math.hypot(gp.x - explorer.pos.x, gp.z - explorer.pos.y);
        tmp.project(view.camera);
        vis = onScreen() && dd < 40 && dd > 0.8;
      }
      setStyle(tg, 'vis', vis ? 'visible' : 'hidden');
      if (vis) place(tg, ob.item === it, dd);
    }
    // 心魔與小精靈的名牌
    for (const tg of ghostTags) {
      const gh = tg.gh;
      let vis = on && ghostShown, dd = 0;
      if (vis) { trial.tagPos(gh, tmp); dd = Math.hypot(gh.pos.x - explorer.pos.x, gh.pos.y - explorer.pos.y); tmp.project(view.camera); vis = onScreen() && dd < 32; }
      setStyle(tg, 'vis', vis ? 'visible' : 'hidden');
      if (!vis) continue;
      place(tg, false, dd);
      const st = gh.tamed ? 'tamed' : gh.mode === 'chase' ? 'chase' : gh.mode === 'flee' ? 'flee' : 'roam';
      if (st !== tg.st) {
        tg.st = st; tg.el.dataset.st = st;
        tg.el.querySelector('b').textContent = gh.tamed ? gh.tamedName : gh.name;
        tg.el.querySelector('small').textContent = { tamed: '已感化', chase: '追你中！', flee: '怕光・快追上它', roam: '遊蕩中' }[st];
      }
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
          gain(state.addMerit(`done:${id}`, MERIT.done), '完成這一站');
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
      points: (g, label) => gain(g, label),
    },
  });
  function openSpot(id) {
    here = id;
    keys.clear(); joy.set(0, 0);
    const s = world.spots.get(id);
    explorer.faceTowards(s.at[0], s.at[1]);
    state.visit(id);
    if (navTarget === id) navTarget = null;
    hint(''); setNear(null, null);
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

  /* ---------- 靠近互動：島民的站點，或任務中的組員與心火 ---------- */
  const promptEl = $('prompt');
  let nearKey = '';
  function setNear(spotId, item, fin = false) {
    nearItem = item; nearId = item ? null : spotId; nearFinale = !item && !spotId && fin;
    const key = item ? `i:${item.task.id}:${item.i}` : spotId ? `s:${spotId}` : nearFinale ? 'finale' : '';
    if (key === nearKey) return;
    nearKey = key;
    if (!key) { promptEl.hidden = true; return; }
    let what;
    if (nearFinale) what = '再看一次 <b>煙火</b>';
    else if (item) what = item.it.talk.kind === 'fire' ? `熄滅 <b>${esc(item.it.talk.name)}</b>` : `和 <b>${esc(item.it.talk.name)}</b> 說話`;
    else { const s = spotOf(spotId), t = taskOf(spotId); what = t ? `和 <b>${esc(t.npc.name)}</b> 說話` : s.npc ? `和 <b>${esc(s.npc.name)}</b> 說話` : `進入 <b>${esc(s.place)}</b>`; }
    promptEl.hidden = false;
    promptEl.innerHTML = `<kbd>${touch ? '點這裡' : 'Enter'}</kbd><span>${what}</span>`;
    obT = 1;
  }
  const interact = () => { if (nearItem) openTalk(nearItem); else if (nearId) openSpot(nearId); else if (nearFinale) startFinale(); };
  promptEl.addEventListener('click', interact);
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

  /* ---------- 終點：全部完成後回到山頂，黃昏的天空放滿煙火 ---------- */
  let summitArmed = true;
  const _fp = new THREE.Vector3();
  const fw = new Fireworks(world.scene, (color, k, x, y, z) => {
    world.flash(color, 0.32 * k);
    const d = view.camera.position.distanceTo(_fp.set(x, y, z));
    sfx.boom(k * Math.min(1, 75 / d), d / 340);          // 聲音比光慢：遠的煙火晚一點才聽到
    if (k < 1) sfx.crackle(d / 340 + 0.6, 1.4, 0.8);
  });
  const finaleEl = $('finale');
  const TYPES = ['peony', 'peony', 'ring', 'lotus', 'glitter', 'peony', 'willow'];
  /** 這一場煙火的節目單：先零星幾發，越放越密，最後齊放，以三發金色垂柳收尾 */
  function finalePlan() {
    const plan = [], R = Math.random;
    const spread = innerWidth / innerHeight >= 1 ? 28 : 17;          // 直式手機畫面比較窄，煙火集中一點
    const shot = (t, type, pal, near = 1) => {
      const a = R() * 6.283, r = Math.sqrt(R()) * spread * near, x = Math.cos(a) * r, z = -3 + Math.sin(a) * r;
      const y0 = Math.max(0, heightAt(x, z));
      plan.push({ t, x, z, y0, type: type ?? TYPES[Math.floor(R() * TYPES.length)], pal: pal ?? Math.floor(R() * 6), h: 44 + R() * 24 - y0 });
    };
    let t = 2.4;
    while (t < 9.5) { shot(t); t += 0.85 + R() * 0.6; }
    while (t < 15.5) { shot(t); if (R() < 0.55) shot(t + 0.12 + R() * 0.25); t += 0.42 + R() * 0.3; }
    for (let k = 0; k < 24; k++) shot(15.8 + R() * 3.6);
    for (let k = 0; k < 3; k++) shot(20.2 + k * 0.25, 'willow', 0, 0.45);
    shot(20.9, 'glitter', 4, 0.2);
    return plan.sort((a, b) => a.t - b.t);
  }
  function finaleCaption() {
    const vow = state.get().vow?.text;
    finaleEl.innerHTML = `
      <div class="fin-box" role="dialog" aria-label="完成">
        <p class="fin-eyebrow" data-at="3.2">恭喜你</p>
        <h2 class="fin-title" data-at="3.4">完成三好四給的探索學習</h2>
        <p class="fin-line" data-at="6">做好事・說好話・存好心</p>
        <p class="fin-line" data-at="7.3">給人信心・給人歡喜・給人希望・給人方便</p>
        <p class="fin-wish" data-at="9.6">請把這份善念，實踐在生活中。</p>
        ${vow ? `<p class="fin-vow" data-at="11.5"><span>你的願</span>${esc(vow)}</p>` : ''}
        <div class="fin-actions" data-at="12.5">
          <button type="button" class="btn btn-primary fin-back">回到島上</button>
          <button type="button" class="btn btn-ghost fin-again">再放一次煙火</button>
        </div>
      </div>`;
    finaleEl.querySelector('.fin-back').addEventListener('click', endFinale);
    finaleEl.querySelector('.fin-again').addEventListener('click', () => { if (finale) { finale.plan = finalePlan(); finale.i = 0; finale.t = 1.8; } });
    finaleEl.hidden = false;
  }
  function startFinale() {
    if (finale) return;
    if (card.open) closeCard();
    if (!drawer.hidden) closeDrawer();
    if (talking) closeTalk();
    $('levelup').hidden = true; $('breath').hidden = true;
    keys.clear(); joy.set(0, 0); speedNow = 0; hint(''); setNear(null, null);
    finale = { t: 0, i: 0, plan: finalePlan() };
    state.setFinale(true);
    document.body.classList.add('finale');
    const aspect = innerWidth / innerHeight;
    // 鏡頭降到比煙火低、微微仰望：煙火在暮色的天空裡綻放，島在畫面下方
    view.setCinema(true, { center: new THREE.Vector3(0, 32, -3), pitch: -0.05, dist: aspect >= 1 ? 96 : 96 + (1 - aspect) * 95, spin: 0.035 });
    finaleCaption();
    reframe();
  }
  function finaleTick(dt) {
    const f = finale;
    f.t += dt;
    while (f.i < f.plan.length && f.plan[f.i].t <= f.t) {
      const p = f.plan[f.i++];
      fw.launch(p.x, p.y0, p.z, p);
      if (Math.random() < 0.3) sfx.whoosh(0.1);
    }
    finaleEl.querySelectorAll('[data-at]').forEach((el) => { if (f.t >= Number(el.dataset.at)) el.classList.add('is-on'); });
  }
  function endFinale() {
    if (!finale) return;
    finale = null;
    document.body.classList.remove('finale');
    finaleEl.hidden = true; finaleEl.innerHTML = '';
    view.setCinema(false, { facing: explorer.facing });
    summitArmed = false;
    obT = 1;
    canvas.focus?.();
    reframe();
  }

  /* ---------- 心魔試煉：自私鬼、懈怠鬼與善念光球（完成第一站之後開始） ---------- */
  const NOGHOST = /[?&]noghost\b/.test(location.search), NOINTRO = /[?&]nointro\b/.test(location.search);      // 自動化測試用
  const trialOn = () => !NOGHOST && state.isDone('origin');
  /** 心魔遊蕩的範圍 [x, z, 半徑]：自私鬼守在山腳的十字路口，懈怠鬼在東邊往四給街的路上 */
  const HOMES = { selfish: [-4, 13, 7], lazy: [10, 7, 6.5] };
  const fronts = SPOTS.map((s) => world.spots.get(s.id).front);
  const allItems = [...world.items.values()].flat();
  /** 安全的地方：站點前（和島民說話的地方）、組員與心火旁、靜心的蒲團旁、上岸的碼頭。在這裡心魔不會追你 */
  const SAFE = [
    ...fronts.map(([x, z]) => [x, z, 5.5]),
    ...allItems.filter((it) => it.talk || it.kind === 'lotus').map((it) => [it.group.position.x, it.group.position.z, 3.2]),
    [START[0], START[1], 7],
  ];
  const isSafe = (x, z) => SAFE.some(([sx, sz, r]) => (x - sx) ** 2 + (z - sz) ** 2 < r * r);
  const offLimits = (x, z) => islandD(x, z) > 0.88 || world.inBox(x, z);
  /** 善念光球放在步道上：每隻心魔的地盤邊各兩顆（撿了就能就近感化它），其餘平均撒在全島（位置固定，每次都一樣） */
  function orbSpots() {
    const items = allItems.map((it) => [it.group.position.x, it.group.position.z]), cand = [];
    for (let x = -40; x <= 40; x += 1.5) for (let z = -40; z <= 40; z += 1.5) {
      if (islandD(x, z) > 0.86 || world.edge(x, z) > -0.2 || world.deckAt(x, z) || !walkable(x, z) || Math.hypot(START[0] - x, START[1] - z) < 9) continue;
      if (Math.abs(x - STAIR.x) < STAIR.hw + 0.8 && z < STAIR.z0 + 0.8 && z > STAIR.z1 - 0.8) continue;           // 不放在登山的石階上
      if (fronts.some(([fx, fz]) => Math.hypot(fx - x, fz - z) < 4.5) || items.some(([ix, iz]) => Math.hypot(ix - x, iz - z) < 2.5)) continue;
      cand.push([x, z]);
    }
    const pick = [], gap = (x, z) => pick.reduce((m, [px, pz]) => Math.min(m, Math.hypot(px - x, pz - z)), Infinity);
    for (const [hx, hz] of Object.values(HOMES)) for (let k = 0; k < 2; k++) {
      let best = null, bs = -Infinity;
      for (const c of cand) {
        const d = Math.hypot(c[0] - hx, c[1] - hz);
        if (d < 5 || d > 12 || gap(c[0], c[1]) < 7) continue;
        if (-Math.abs(d - 8) > bs) { bs = -Math.abs(d - 8); best = c; }
      }
      if (best) pick.push(best);
    }
    while (pick.length < 12) {
      let best = null, bd = 6;
      for (const c of cand) { const d = gap(c[0], c[1]); if (d > bd) { bd = d; best = c; } }
      if (!best) break;
      pick.push(best);
    }
    return pick.map(([x, z]) => [x, ground(x, z), z]);
  }
  const trial = new MindTrial(world.scene, { homes: HOMES, orbs: orbSpots(), ground, safe: isSafe, blocked: (x, z) => offLimits(x, z) || isSafe(x, z), soft: offLimits });
  const aura = makeAura(world.scene);
  for (const id of Object.keys(GHOSTS)) if (state.get().ghosts?.[id]) trial.tame(id, true);
  let shield = 0, ghostShown = null, flashK = 0, vigK = 0, mindLast = '';
  const lastWarn = {};
  const ghostTags = trial.ghosts.map((gh) => { const el = makeTag('#5b4a78', gh.name, '遊蕩中'); el.classList.add('tag-ghost'); return { el, gh, vis: 'hidden', st: '' }; });

  /** 第一次遇到：說明心魔試煉怎麼玩 */
  const mindIntro = $('mind-intro');
  function openMindIntro() {
    mindIntro.hidden = false;
    keys.clear(); joy.set(0, 0); speedNow = 0;
    requestAnimationFrame(() => mindIntro.classList.add('is-in'));
    mindIntro.querySelector('.intro-go').focus({ preventScroll: true });
  }
  function closeMindIntro() {
    mindIntro.hidden = true; mindIntro.classList.remove('is-in');
    state.setGhost({ intro: true });
    canvas.focus?.();
    hint('路上發光的小蓮花就是善念光球。', 5000);
  }
  mindIntro.querySelector('.intro-go').addEventListener('click', closeMindIntro);

  /** 感化之後：畫面下方浮出的小卡，說明這份轉化背後的佛法（經文出自《佛說八大人覺經》） */
  const noteEl = $('mind-note');
  let noteT = 0;
  const TAME = {
    selfish: { line: '它放下緊抱的錢袋，開心地繞著你飛。願意分享、給人歡喜，自私就轉成了布施。', q: '菩薩佈施，等念怨親', at: '第六覺知' },
    lazy: { line: '它睜開眼睛、伸了個懶腰。一次做好一件小小的好事，懈怠就轉成了精進。', q: '懈怠墜落；常行精進，破煩惱惡', at: '第四覺知' },
  };
  function tameNote(id) {
    const g = GHOSTS[id], d = TAME[id];
    noteEl.innerHTML = `<p class="mn-eyebrow">心念轉化</p><h3>${esc(g.name)}變成了「${esc(g.tamedName)}」</h3><p>${esc(d.line)}</p>
      <blockquote>「${esc(d.q)}」<cite>——<a href="${SOURCES.badaren.u}" target="_blank" rel="noopener">《佛說八大人覺經》</a>${esc(d.at)}</cite></blockquote>
      <div class="mn-foot"><p class="mn-tip">修行不是消滅煩惱，而是看見它、轉化它。</p><button type="button" class="btn btn-quiet btn-sm mn-ok">知道了</button></div>`;
    clearTimeout(noteT);
    noteEl.hidden = false; noteEl.classList.remove('is-in'); void noteEl.offsetWidth; noteEl.classList.add('is-in');
    noteEl.querySelector('.mn-ok').addEventListener('click', hideNote);
    noteT = setTimeout(hideNote, 13000);
  }
  function hideNote() { clearTimeout(noteT); noteEl.classList.remove('is-in'); noteT = setTimeout(() => { noteEl.hidden = true; }, 400); canvas.focus?.(); }

  function onTrial(e) {
    const gh = e.id ? trial.get(e.id) : null;
    if (e.type === 'orb') {
      shield = 15;
      sfx.chime();
      gain(state.addMerit(`orb:${e.i}`, MERIT.orb), '善念之光');
      toast(trial.tamedCount < 2 ? '✦ 善念之光！15 秒內追上心魔，就能感化它' : '✦ 善念之光照亮了你');
    } else if (e.type === 'warn') {
      sfx.warn();
      if (t - (lastWarn[e.id] ?? -1e9) > 60) toast(`⚠ ${gh.name}發現你了！`);
      lastWarn[e.id] = t;
    } else if (e.type === 'catch') {
      sfx.caught();
      flashK = 1; vigEl.dataset.c = e.id;
      const [f0, w0] = MERIT.caught[e.id], g = [-Math.min(-f0, state.fu), -Math.min(-w0, state.hui)];
      if (g[0] || g[1]) { state.addMerit(`ghost:${e.id}:${Date.now()}`, g); gain(g, `被${gh.name}追上`); }
      toast(e.id === 'selfish' ? '被自私鬼追上了：只想到自己，福德就少了一點' : '被懈怠鬼抓住了：全身懶洋洋的，智慧也少了一點');
    } else if (e.type === 'tame') {
      sfx.bless();
      state.setGhost({ [e.id]: true });
      gain(state.addMerit(`tame:${e.id}`, MERIT.tame[e.id]), `感化${gh.name}`);
      tameNote(e.id);
      if (trial.tamedCount === 2) setTimeout(() => { toast('✦ 心魔試煉完成！兩隻心魔都變成了小精靈'); gain(state.addMerit('mind:done', MERIT.mindDone), '心魔試煉完成'); }, 1800);
    }
  }

  /** 畫面下方的狀態提示，和畫面四周的氣息（被追時暗紫、懈怠時灰、受善念之光守護時金色） */
  const mindEl = $('mind'), vigEl = $('mind-vig');
  function renderMind(dt, paused, canChase) {
    const p = explorer.pos;
    let html = '', cls = '', k = 0, c = '';
    if (ghostShown && !paused) {
      const th = trial.threat(p), slow = trial.speedFactor(p, shield, canChase);
      if (shield > 0) { cls = 'is-light'; c = 'light'; k = 0.55; html = `<b>✦ 善念之光守護中・${Math.ceil(shield)}</b><span>${trial.tamedCount < 2 ? '追上心魔、碰到它，就能感化它' : '兩隻心魔都已經感化了'}</span>`; }
      else if (trial.debuff > 0) { cls = 'is-lazy'; c = 'lazy'; k = 0.75; html = '<b>Z z　懶洋洋的……</b><span>被懈怠鬼抓住了，等一下就有力氣</span>'; }
      else if (th.gh) { cls = `is-${th.gh.id}`; c = th.gh.id; k = 0.3 + th.k * 0.6; html = `<b>⚠ ${esc(th.gh.name)}在追你！</b><span>繞開它、走到島民身邊，或去撿發光的善念光球</span>`; }
      else if (slow < 0.93) { cls = 'is-lazy'; c = 'lazy'; k = (1 - slow) * 1.3; html = '<b>腳步變沉重了……</b><span>懈怠鬼就在附近，離它遠一點</span>'; }
    }
    const key = cls + html;
    if (key !== mindLast) { mindLast = key; mindEl.hidden = !html; if (html) { mindEl.className = `mind ${cls}`; mindEl.innerHTML = html; } }
    if (c && !flashK) vigEl.dataset.c = c;
    flashK = Math.max(0, flashK - dt * 1.2);
    vigK += (Math.min(1, k + flashK) - vigK) * Math.min(1, dt * 4);
    vigEl.style.opacity = vigK < 0.005 ? '0' : vigK.toFixed(3);
  }

  /* ---------- 鍵盤與觸控搖桿 ---------- */
  const MOVE = { KeyW: [0, 1], ArrowUp: [0, 1], KeyS: [0, -1], ArrowDown: [0, -1], KeyA: [-1, 0], ArrowLeft: [-1, 0], KeyD: [1, 0], ArrowRight: [1, 0] };
  const typing = (e) => /INPUT|TEXTAREA|SELECT/.test(e.target?.tagName || '') || e.target?.isContentEditable;
  const intro = $('intro');
  addEventListener('keydown', (e) => {
    if (!intro.hidden) { if (e.key === 'Enter' || e.key === 'Escape' || e.code === 'Space') { e.preventDefault(); closeIntro(); } return; }
    if (!mindIntro.hidden) { if (e.key === 'Enter' || e.key === 'Escape' || e.code === 'Space') { e.preventDefault(); closeMindIntro(); } return; }
    if (finale) { if (e.key === 'Escape') endFinale(); return; }
    if (talking) {
      if (e.key === 'Escape') { closeTalk(); return; }
      const n = Number(e.key);
      if (n >= 1 && n <= 3) { const b = talkEl.querySelectorAll('.talk-opts .opt')[n - 1]; if (b && !b.disabled) b.click(); }
      return;
    }
    if (e.key === 'Escape') {
      if (!$('modal').hidden) closeModal();
      else if (!drawer.hidden) closeDrawer();
      else if (card.open) closeCard();
      else if (!noteEl.hidden) hideNote();
      return;
    }
    if (typing(e) || !onIsland || card.open || !$('modal').hidden) return;
    if (MOVE[e.code]) { keys.add(e.code); e.preventDefault(); }
    if ((e.code === 'Enter' || e.code === 'Space') && (nearItem || nearId || nearFinale) && drawer.hidden) { e.preventDefault(); interact(); }
    if (e.code === 'KeyQ') keys.add('TurnL');
    if (e.code === 'KeyE') keys.add('TurnR');
    if (e.code === 'Equal' || e.code === 'NumpadAdd') view.zoom(0.85);
    if (e.code === 'Minus' || e.code === 'NumpadSubtract') view.zoom(1.18);
  });
  addEventListener('keyup', (e) => { keys.delete(e.code); if (e.code === 'KeyQ') keys.delete('TurnL'); if (e.code === 'KeyE') keys.delete('TurnR'); });
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
      if (pts.size === 2 && pinch0) { const [a, b] = [...pts.values()]; view.distT = Math.min(34, Math.max(3.5, dist0 * pinch0 / Math.hypot(a.x - b.x, a.y - b.y))); view.hold = 1.5; }
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
    loadingOut();
    $('home').classList.add('is-out');
    setTimeout(() => { $('home').hidden = true; }, 600);
    document.body.classList.add('on-island');
    view.behind(explorer.facing);
    canvas.focus?.();
    let seen = false; try { seen = localStorage.getItem(INTRO_KEY) === '1'; } catch { /* 無痕模式 */ }
    if (!seen && !/[?&]nointro\b/.test(location.search)) openIntro();
    else hint(state.isDone('origin') ? '歡迎回來！看畫面上方的「目前目標」，跟著地上的金色箭頭走。' : '跟著地上的金色箭頭，先去找導覽員小蓮。', 6000);
    obT = 1;
    renderLists();
    reframe();
  }
  function goHome() {
    if (finale) endFinale();
    closeCard(); closeDrawer(); if (talking) closeTalk();
    onIsland = false;
    document.body.classList.remove('on-island');
    $('home').hidden = false;
    requestAnimationFrame(() => $('home').classList.remove('is-out'));
    hint(''); setNear(null, null);
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
  music.onChange(paintMusic);
  paintMusic();

  /* ---------- 載入完成：能自動播放音樂就直接進首頁；被瀏覽器擋下時，點一下就伴著音樂開始 ---------- */
  const loadingEl = $('loading');
  function loadingOut() { loadingEl.classList.add('is-out'); }
  function ready() {
    if (!music.on) { loadingOut(); return; }
    const slow = new Promise((r) => setTimeout(() => r('slow'), 1500));
    Promise.race([music.start(), slow]).then((ok) => {
      if (ok || loadingEl.classList.contains('is-out')) { loadingOut(); return; }
      loadingEl.classList.add('is-gate');
      loadingEl.innerHTML = '<button type="button" class="gate-btn"><span class="gate-note" aria-hidden="true">♪</span><b>點一下，進入星雲之島</b><small>伴著音樂開始</small></button>';
      const btn = loadingEl.querySelector('.gate-btn');
      loadingEl.addEventListener('click', () => { music.start(); loadingOut(); }, { once: true });      // 點畫面任何地方都可以
      btn.focus({ preventScroll: true });
    });
  }

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
  const levelupEl = $('levelup');
  const clock = new THREE.Clock();
  let t = 0, timeScale = 1, fpsAcc = 0, fpsN = 0, lowN = 0, highN = 0, lastDrop = -1e9;
  const mv = new THREE.Vector2();
  renderer.setAnimationLoop(() => {
    const raw = clock.getDelta();
    const dt = Math.min(raw, 0.05) * timeScale;
    t += dt;
    const paused = !onIsland || card.open || !modal.hidden || !intro.hidden || !mindIntro.hidden || !!talking || !!finale || !drawer.hidden || !levelupEl.hidden;
    const canChase = !paused && trialOn() && activeQuest()?.task.quest.type !== 'escort';
    if (onIsland && !card.open && modal.hidden && intro.hidden && mindIntro.hidden && !talking && !finale) {
      mv.set(0, 0);
      for (const k of keys) if (MOVE[k]) { mv.x += MOVE[k][0]; mv.y += MOVE[k][1]; }
      // 搖桿：中間一小圈不動（手指輕放不會亂走），推到七成左右就是全速
      const jl = joy.length();
      if (jl > 0.12) { const k = Math.min(1, (jl - 0.12) / 0.55); mv.x += joy.x / jl * k; mv.y += joy.y / jl * k; }
      if (keys.has('TurnL')) view.turn(dt * 1.6);
      if (keys.has('TurnR')) view.turn(-dt * 1.6);
      const want = Math.min(1, mv.length()), pushing = want > 0.02;
      if (pushing) {
        // 方向以「現在的畫面」為準：往上推就是往畫面前方走
        const F = view.forward(), R = view.right();
        const dx = R.x * mv.x + F.x * mv.y, dz = R.y * mv.x + F.y * mv.y, dl = Math.hypot(dx, dz) || 1;
        lastDir.set(dx / dl, dz / dl);
      }
      // 起步、停下都有一點加減速，不會瞬間全速或瞬間定住
      const goal = pushing ? WALK * want * trial.speedFactor(explorer.pos, shield, canChase) : 0;      // 懈怠鬼在旁邊時，腳步變沉重
      speedNow += (goal - speedNow) * (1 - Math.exp(-(goal > speedNow ? 9 : 13) * dt));
      let moved = false;
      if (speedNow > 0.05) {
        const [dx, dz] = world.bridgeAssist(explorer.pos.x, explorer.pos.y, lastDir.x, lastDir.y);      // 走到橋頭時，自動對準橋面
        moved = explorer.drive(dx, dz, speedNow * dt, dt, walkable);
      } else speedNow = 0;
      // 鏡頭跟著「玩家想走的方向」轉，而不是撞到牆、沿著岸邊滑動時的方向（撞到東西時畫面不會亂晃）
      view.autoFollow(Math.atan2(lastDir.x, lastDir.y), dt, pushing && moved);
      questTick(dt);
      const ni = nearestTalkItem(), ns = ni ? null : nearestStation();
      // 全部完成後回到山頂：第一次自動放煙火；之後走到山頂可以再看一次
      let fin = false;
      if (allDone()) {
        const d = Math.hypot(SUMMIT.front[0] - explorer.pos.x, SUMMIT.front[1] - explorer.pos.y);
        if (d > 14) summitArmed = true;
        else if (!state.get().finale && summitArmed) { summitArmed = false; startFinale(); }
        fin = d < 9 && state.get().finale;
      }
      setNear(ns, ni, fin);
      // 自選的目的地到了
      if (navTarget) { const s = world.spots.get(navTarget); if (Math.hypot(s.front[0] - explorer.pos.x, s.front[1] - explorer.pos.y) <= TALK_R) { navTarget = null; obT = 1; } }
    } else { speedNow = 0; view.autoFollow(explorer.facing, dt, false); }
    view.follow(explorer.pos.x, explorer.object.position.y, explorer.pos.y);
    const fwd = view.forward();
    world.follow(explorer.pos.x, explorer.pos.y, fwd.x, fwd.y);
    explorer.update(dt);
    for (const v of world.npcs.values()) v.watch(explorer.pos.x, explorer.pos.y);
    for (const w of watchers) w.watch(explorer.pos.x, explorer.pos.y);
    // 心魔試煉：心魔遊蕩、追人；撿光球、感化
    const showG = trialOn() && !finale;
    if (showG !== ghostShown) { ghostShown = showG; trial.visible = showG; }
    if (ghostShown && !paused && !NOINTRO && !state.get().ghosts?.intro) openMindIntro();
    if (!paused) shield = Math.max(0, shield - dt);
    const pscale = renderer.domElement.height / (2 * Math.tan(THREE.MathUtils.degToRad(view.camera.fov) / 2));
    for (const e of trial.update(dt, explorer.pos, { paused, canChase, canGreet: !paused, shield, scale: pscale })) onTrial(e);
    aura.update(dt, explorer.pos.x, explorer.object.position.y, explorer.pos.y, shield > 0 && ghostShown, pscale);
    renderMind(dt, paused, canChase);
    if (onIsland) renderObjective(dt);
    if (finale) finaleTick(dt);
    // 島嶼光明度：善念越多，畫面越明亮；放煙火時天色轉為黃昏
    glowNow += (brightness() - glowNow) * Math.min(1, dt * 1.5);
    const duskT = finale ? 1 : 0;
    if (Math.abs(duskT - duskNow) > 0.0005) { duskNow += (duskT - duskNow) * (1 - Math.exp(-(finale ? 0.8 : 1.1) * dt)); if (Math.abs(duskT - duskNow) < 0.002) duskNow = duskT; world.setDusk(duskNow); }
    renderer.toneMappingExposure = (0.95 + 0.1 * glowNow) * (1 - 0.36 * duskNow);
    fw.update(dt, view.camera, renderer.domElement.height);
    world.update(t, dt);
    updateGuide();
    guide.update(dt, explorer.pos, ground);
    view.update(dt, innerWidth, innerHeight);
    renderer.render(world.scene, view.camera);
    updateTags();
    updatePops();
    // 依實際幀率調整解析度：連續偏慢才降低；要穩定很久、而且離上次降低超過 20 秒才慢慢升回
    // （避免在兩個解析度之間來回切換，每次切換都會讓畫面頓一下）
    fpsAcc += raw; fpsN++;
    if (fpsAcc > 2) {
      const fps = fpsN / fpsAcc; fpsAcc = 0; fpsN = 0;
      if (!fixedRes && !document.hidden) {
        if (fps < 38) { lowN++; highN = 0; } else if (fps > 58) { highN++; lowN = 0; } else { lowN = 0; highN = 0; }
        let next = prNow;
        const now = performance.now();
        if (lowN >= 2 && prNow > 0.75) { next = Math.max(0.75, prNow - 0.2); lowN = 0; lastDrop = now; }
        else if (highN >= 4 && prNow < prMax && now - lastDrop > 20000) { next = Math.min(prMax, prNow + 0.1); highN = 0; }
        if (next !== prNow) { prNow = next; renderer.setPixelRatio(prNow); resize(); }
      }
    }
  });

  requestAnimationFrame(() => setTimeout(ready, 300));
  document.fonts?.ready.then(() => reframe());

  // 自動化測試用（不影響使用者）
  window.__isle = {
    world, explorer, card, view, state, renderer, guide, enterIsland, openDrawer, openSpot, startQuest, setNav, closeIntro, openTalk, startFinale, endFinale, fw,
    get finale() { return finale; },
    trial, get shield() { return shield; }, set shield(v) { shield = v; }, gain, get pops() { return pops.length; }, set popRate(v) { popRate = v; },
    keys, joy, buildMs, get near() { return nearId; }, get nearItem() { return nearItem; }, get talking() { return talking; }, get objective() { return objective(); }, get pixelRatio() { return prNow; },
    teleport(x, z) { explorer.place(x, z); },
    set timeScale(v) { timeScale = v; },
  };
}

try { boot(); } catch (err) {
  console.error(err);
  fail(`載入時發生錯誤：${err.message}。請重新整理頁面。`);
}
