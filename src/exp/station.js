import { TASKS } from '../data/tasks.js';
import { VIDEOS } from '../data/videos.js';
import { SOURCES } from '../data/sources.js';
import { ask, AIError } from '../ai/client.js';
import { state } from '../state.js';
import { esc, richText, sourcesHTML, OFFLINE_NOTE } from '../ui/chat.js';
import { voice, speakButton } from '../ui/voice.js';
import { mountGame } from './minigame.js';

const L = 'ABC';
const roleOf = (look) => (look === 'elder' ? 'elder' : look === 'guide' ? 'guide' : 'student');

/**
 * 島民站點：觀看（島上發生的事）→ 聆聽（島民說話）→ 操作（島上任務）→ 互動（回到生活的情境選擇、AI 回饋、寫一句話）
 */
export function mount(el, spot, ctx) {
  const task = TASKS.find((t) => t.id === spot.task);
  const role = roleOf(task.npc.look);
  let alive = true;
  const saved = () => state.get().tasks[task.id] || {};
  const questDone = () => !task.quest || saved().quest === 'done';
  const doneCount = () => TASKS.filter((t) => state.get().tasks[t.id]?.choice !== undefined).length;

  const aiBlock = (r, title) => r.via === 'offline'
    ? `<h4>${title}</h4><p class="via via-off">${OFFLINE_NOTE}</p>${sourcesHTML(r.sources, true)}`
    : `<h4><span class="ai-dot"></span>${title}</h4><p class="ai-text">${richText(r.text)}</p><p class="via">AI 即時生成・依據島上知識庫</p>${sourcesHTML(r.sources)}`;
  const loading = (t) => `<p class="loading-line"><span class="dots"><i></i><i></i><i></i></span>${t}</p>`;
  const addSpeak = (box, role2 = 'ai') => {
    const t = box.querySelector('.ai-text'); if (!t) return;
    const b = speakButton(() => t.textContent, role2, '朗讀回饋'); if (b) box.querySelector('h4').appendChild(b);
  };

  const s0 = saved();
  el.innerHTML = `
    <div class="tk" style="--tc:${task.color}">
      <div class="tk-head"><span class="tk-group">${task.group}</span><h2 class="tk-virtue">${esc(task.virtue)}</h2><span class="tk-count">善念 ${doneCount()} / 7</span></div>
      <section class="st-watch">
        <span class="st-step">觀看・聆聽</span>
        ${task.story ? `<p class="st-story">${esc(task.story)}</p>` : ''}
        <div class="bubble"><b>${esc(task.npc.name)}</b><p class="bubble-say">${esc(task.npc && (questDone() && task.quest ? task.thanks : task.say))}</p></div>
      </section>
      <section class="st-quest" hidden></section>
      <section class="st-life" hidden>
        <span class="st-step">${task.quest ? '回到生活・互動' : '互動'}</span>
        ${task.quest ? '<p class="exp-hint">在島上幫了忙，現在換個場景：如果這件事發生在你的生活裡呢？</p>' : ''}
        <div class="tk-scene"><span class="tk-label">情境</span><p>${esc(task.scene)}</p></div>
        <h3 class="tk-q">${esc(task.q)}</h3>
        <div class="opts tk-opts">${task.options.map((o, i) => `<button type="button" class="opt" data-i="${i}"><b>${L[i]}</b><span>${esc(o.t)}</span></button>`).join('')}</div>
        <section class="tk-ai" hidden></section>
        <section class="st-game" hidden></section>
        <details class="tk-all" hidden><summary>看看每個選擇可能帶來的影響（作品解說）</summary><ul>${task.options.map((o, i) => `<li><b>${L[i]}</b>${esc(o.n)}</li>`).join('')}</ul></details>
        <details class="tk-reflect" hidden>
          <summary>加碼練習（選做）：換你說說看</summary>
          <p>${esc(task.reflect)}</p>
          <textarea class="tk-text" rows="3" maxlength="300" placeholder="寫下你的句子或做法……"></textarea>
          <button type="button" class="btn btn-primary btn-sm tk-send"><span class="ai-dot"></span>請 AI 給我回饋</button>
          <div class="tk-fb"></div>
        </details>
      </section>
      <div class="exp-done tk-done" hidden></div>
    </div>`;

  // 聆聽：打開時唸出島上的故事與島民的話
  const watch = el.querySelector('.st-watch');
  const sayText = () => el.querySelector('.bubble-say').textContent;
  const sb = speakButton(() => `${task.story && !(questDone() && task.quest) ? task.story + '。' : ''}${sayText()}`, role, '聽故事');
  if (sb) watch.querySelector('.st-step').after(sb);
  (async () => {
    if (task.story && !(questDone() && task.quest) && s0.choice === undefined) await voice.say(task.story, 'narrator');
    if (alive) voice.say(sayText(), role);
  })();

  // 操作：島上任務
  const quest = el.querySelector('.st-quest');
  const renderQuest = () => {
    if (!task.quest || questDone()) { quest.hidden = true; el.querySelector('.st-life').hidden = false; return; }
    quest.hidden = false;
    const active = saved().quest === 'active';
    const prog = ctx.questProgress(task.id);
    quest.innerHTML = `
      <span class="st-step">操作</span>
      <p class="st-quest-t"><b>島上任務：</b>${esc(task.quest.label)}${task.quest.n > 1 ? `（${task.quest.n} 個）` : ''}</p>
      <p class="exp-hint">${task.quest.type === 'escort' ? `接下任務後，${esc(task.npc.name)}會跟在你身後。用方向鍵帶路，走到講堂前的光圈。` : task.quest.type === 'still' ? '走到湖邊的蓮花旁，放開方向鍵站好，跟著畫面上的光圈呼吸三次。這是佛教最基本的修行：先讓心靜下來。' : '接下任務後，地圖上會出現發光的目標。用方向鍵走過去就會完成。'}</p>
      ${active ? `<p class="st-prog">進行中：${prog.done} / ${prog.total}</p>` : ''}
      <button type="button" class="btn btn-primary st-go">${active ? '繼續任務' : '好，我來幫忙！'}</button>`;
    quest.querySelector('.st-go').addEventListener('click', () => { voice.stop(); ctx.startQuest(task.id); });
  };
  renderQuest();

  const aiBox = el.querySelector('.tk-ai');
  const showChoice = (i, fresh) => {
    el.querySelectorAll('.tk-opts .opt').forEach((b, j) => { b.disabled = true; b.classList.toggle('is-picked', j === i); b.classList.toggle('is-dim', j !== i); });
    el.querySelector('.tk-all').hidden = false;
    el.querySelector('.tk-reflect').hidden = false;
    const gm = el.querySelector('.st-game');
    if (gm.hidden) { gm.hidden = false; mountGame(gm, task.id, ctx); }
    aiBox.hidden = false;
    const s = saved();
    if (!fresh && s.ai) { aiBox.innerHTML = aiBlock(s.ai, 'AI 怎麼看你的選擇'); addSpeak(aiBox); return; }
    aiBox.innerHTML = `<h4><span class="ai-dot"></span>AI 怎麼看你的選擇</h4>${loading('正在分析這個選擇對情境中的人可能帶來的影響……')}`;
    ask('task', { taskId: task.id, choice: i })
      .then((r) => {
        if (r.via !== 'offline') state.setTask(task.id, { ai: r });
        if (!alive) return;
        aiBox.innerHTML = aiBlock(r, 'AI 怎麼看你的選擇'); addSpeak(aiBox);
        if (r.via !== 'offline') voice.say(r.text, 'ai');
      })
      .catch((e) => { if (alive) aiBox.innerHTML = `<p class="msg-err">${esc(e instanceof AIError ? e.message : 'AI 服務暫時沒有回應。')}你可以先展開下方「作品解說」看看每個選擇的影響。</p>`; });
  };
  const finish = () => {
    const d = el.querySelector('.tk-done');
    d.hidden = false;
    const n = doneCount();
    const v = VIDEOS[task.video];
    d.innerHTML = `<b>✦ 完成「${esc(task.virtue)}」，島上又亮了一角</b><span>${n < 7 ? `還有 ${7 - n} 位島民需要你。` : '七位島民都幫到了！上山頂的願行台，帶一張願行卡回到生活吧。'}</span>
      ${task.dharma ? `<div class="dharma"><span class="dharma-tag">佛法小語</span><h4>${esc(task.dharma.h)}</h4><p>${esc(task.dharma.t)}</p><small>出處：${task.dharma.src.map((k) => `<a href="${esc(SOURCES[k].u)}" target="_blank" rel="noopener">${esc(SOURCES[k].t)}</a>`).join('、')}</small></div>` : ''}
      ${v ? `<a class="video-link" href="${esc(v.u)}" target="_blank" rel="noopener"><span class="play" aria-hidden="true">▶</span><span><b>延伸觀看：${esc(v.t)}</b><small>${esc(v.by)}・${esc(v.d)}</small></span></a>` : ''}`;
    el.querySelector('.tk-count').textContent = `善念 ${n} / 7`;
  };

  el.querySelectorAll('.tk-opts .opt').forEach((b) => b.addEventListener('click', () => {
    const i = Number(b.dataset.i);
    state.setTask(task.id, { choice: i, ai: null });
    const pts = { best: 30, ok: 20, weak: 10 }[task.options[i].k] || 10;
    const got = state.addPoints(`choice:${task.id}`, pts);
    if (got) ctx.points?.(got);
    ctx.complete(spot.id);
    if (!task.quest) { el.querySelector('.bubble-say').textContent = task.thanks; }
    showChoice(i, true);
    finish();
  }));

  const fb = el.querySelector('.tk-fb');
  el.querySelector('.tk-send').addEventListener('click', async () => {
    const text = el.querySelector('.tk-text').value.trim();
    if (!text) { fb.innerHTML = '<p class="msg-err">先寫下一句話再送出喔。</p>'; return; }
    const btn = el.querySelector('.tk-send'); btn.disabled = true;
    fb.innerHTML = loading('AI 正在讀你的句子……');
    try {
      const r = await ask('reflect', { taskId: task.id, text });
      state.setTask(task.id, { reflect: text, reflectAi: r.via === 'offline' ? null : r });
      if (alive) {
        fb.innerHTML = r.via === 'offline' ? `<p class="via via-off">AI 暫時無法連線，你寫下的句子已經保存。可以對照下面的段落，自己檢查看看。</p>${sourcesHTML(r.sources, true)}` : aiBlock(r, 'AI 的回饋');
        addSpeak(fb);
        if (r.via !== 'offline') voice.say(r.text, 'ai');
      }
    } catch (e) {
      if (alive) fb.innerHTML = `<p class="msg-err">${esc(e instanceof AIError ? e.message : 'AI 服務暫時沒有回應，請稍後再試。')}</p>`;
    }
    btn.disabled = false;
  });

  if (s0.choice !== undefined) {
    if (!task.quest) el.querySelector('.bubble-say').textContent = task.thanks;
    showChoice(s0.choice, false);
    if (s0.reflect) el.querySelector('.tk-text').value = s0.reflect;
    if (s0.reflectAi) { fb.innerHTML = aiBlock(s0.reflectAi, 'AI 的回饋'); addSpeak(fb); }
    finish();
  }
  return () => { alive = false; voice.stop(); };
}
