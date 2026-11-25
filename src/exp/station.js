import { TASKS } from '../data/tasks.js';
import { VIDEOS } from '../data/videos.js';
import { SOURCES } from '../data/sources.js';
import { TRIALS } from '../data/games.js';
import { ask, AIError } from '../ai/client.js';
import { state } from '../state.js';
import { esc, richText, sourcesHTML, OFFLINE_NOTE } from '../ui/chat.js';
import { mountTrial } from './minigame.js';

const L = 'ABC';
const QUEST_HOW = {
  escort: (t) => `接下任務後，${esc(t.npc.name)}會跟在你身後。跟著地上的金色箭頭，走到 AI 智慧講堂前就完成了。`,
  talk: () => '接下任務後，跟著地上的金色箭頭找到三位組員（頭上有名字）。走到他們旁邊按 Enter（手機點畫面下方的按鈕），選一句能化解火氣的話。選錯了會告訴你為什麼，可以再選一次。',
  heart: () => '接下任務後，先走到湖邊發光的蒲團上，放開方向鍵站好，跟著光圈呼吸三次，讓心靜下來。接著湖邊會燃起三把「心火」：貪、瞋、痴。走到火盆旁，選出用「戒、定、慧」哪一種方法熄滅它。',
  light: () => '接下任務後，跟著地上的金色箭頭走到石燈旁，燈就會亮。',
  collect: (t) => (t.quest.kinds ? '接下任務後，小安做過的事會出現光柱。跟著地上的金色箭頭走過去，看看他做了什麼。' : '接下任務後，要撿的東西會出現光柱。跟著地上的金色箭頭走過去，就會自動撿起來。'),
};

/**
 * 島民站點，五個步驟：
 *   觀看・聆聽（島上發生的事）→ 操作（島上任務）→ 回到生活（情境選擇＋AI 回饋）
 *   → 佛法小課（這份善行背後的佛法）→ 佛法挑戰（全部答對才完成這一站）
 */
export function mount(el, spot, ctx) {
  const task = TASKS.find((t) => t.id === spot.task);
  const trial = TRIALS[task.id];
  let alive = true;
  const saved = () => state.get().tasks[task.id] || {};
  const questDone = () => !task.quest || saved().quest === 'done' || state.isDone(spot.id);
  const passed = () => saved().trial === 'passed' || state.isDone(spot.id);
  const doneCount = () => TASKS.filter((t) => state.isDone(t.id)).length;

  const aiBlock = (r, title) => r.via === 'offline'
    ? `<h4>${title}</h4><p class="via via-off">${OFFLINE_NOTE}</p>${sourcesHTML(r.sources, true)}`
    : `<h4><span class="ai-dot"></span>${title}</h4><p class="ai-text">${richText(r.text)}</p><p class="via">AI 即時生成・依據島上知識庫</p>${sourcesHTML(r.sources)}`;
  const loading = (t) => `<p class="loading-line"><span class="dots"><i></i><i></i><i></i></span>${t}</p>`;
  const reveal = (node) => { node.hidden = false; requestAnimationFrame(() => node.scrollIntoView({ behavior: 'smooth', block: 'nearest' })); };
  const steps = ['島上任務', '生活情境', '佛法小課', '佛法挑戰'];

  el.innerHTML = `
    <div class="tk" style="--tc:${task.color}">
      <div class="tk-head"><span class="tk-group">${task.group}</span><h2 class="tk-virtue">${esc(task.virtue)}</h2><span class="tk-count">島民 ${doneCount()} / 7</span></div>
      <ol class="tk-steps" aria-label="這一站的步驟">${steps.map((s, i) => `<li data-i="${i}"><i>${i + 1}</i>${s}</li>`).join('')}</ol>
      <section class="st-watch">
        <span class="st-step">觀看・聆聽</span>
        ${task.story ? `<p class="st-story">${esc(task.story)}</p>` : ''}
        <div class="bubble"><b>${esc(task.npc.name)}</b><p class="bubble-say">${esc(questDone() ? task.thanks : task.say)}</p></div>
      </section>
      <section class="st-quest" hidden></section>
      <section class="st-life" hidden>
        <span class="st-step">回到生活・情境選擇</span>
        <p class="exp-hint">在島上幫了忙，現在換個場景：如果這件事發生在你的生活裡呢？</p>
        <div class="tk-scene"><span class="tk-label">情境</span><p>${esc(task.scene)}</p></div>
        <h3 class="tk-q">${esc(task.q)}</h3>
        <div class="opts tk-opts">${task.options.map((o, i) => `<button type="button" class="opt" data-i="${i}"><b>${L[i]}</b><span>${esc(o.t)}</span></button>`).join('')}</div>
        <section class="tk-ai" hidden></section>
        <details class="tk-all" hidden><summary>看看每個選擇可能帶來的影響（作品解說）</summary><ul>${task.options.map((o, i) => `<li><b>${L[i]}</b>${esc(o.n)}</li>`).join('')}</ul></details>
      </section>
      <section class="st-dharma" hidden>
        <span class="st-step">佛法小課</span>
        <div class="dharma"><span class="dharma-tag">這份善行背後的佛法</span><h4>${esc(task.dharma.h)}</h4><p>${esc(task.dharma.t)}</p><small>出處：${task.dharma.src.map((k) => `<a href="${esc(SOURCES[k].u)}" target="_blank" rel="noopener">${esc(SOURCES[k].t)}</a>`).join('、')}</small></div>
        <p class="exp-hint">讀完了嗎？接下來是「${esc(trial?.title || '佛法挑戰')}」，全部答對才算完成這一站。</p>
      </section>
      <section class="st-game" hidden></section>
      <div class="exp-done tk-done" hidden></div>
      <details class="tk-reflect" hidden>
        <summary>加碼練習（選做）：換你說說看</summary>
        <p>${esc(task.reflect)}</p>
        <textarea class="tk-text" rows="3" maxlength="300" placeholder="寫下你的句子或做法……"></textarea>
        <button type="button" class="btn btn-primary btn-sm tk-send"><span class="ai-dot"></span>請 AI 給我回饋</button>
        <div class="tk-fb"></div>
      </details>
    </div>`;

  const stepAt = (n) => el.querySelectorAll('.tk-steps li').forEach((li, i) => { li.classList.toggle('is-done', i < n); li.classList.toggle('is-now', i === n); });

  // 操作：島上任務
  const quest = el.querySelector('.st-quest');
  const life = el.querySelector('.st-life');
  const renderQuest = () => {
    if (questDone()) { quest.hidden = true; life.hidden = false; return; }
    quest.hidden = false;
    const active = saved().quest === 'active';
    const prog = ctx.questProgress(task.id);
    quest.innerHTML = `
      <span class="st-step">操作・島上任務</span>
      <p class="st-quest-t"><b>島上任務：</b>${esc(task.quest.label)}</p>
      <p class="exp-hint">${(QUEST_HOW[task.quest.type] || QUEST_HOW.collect)(task)}</p>
      ${active ? `<p class="st-prog">進行中：${prog.done} / ${prog.total}</p>` : ''}
      <button type="button" class="btn btn-primary st-go">${active ? '繼續任務' : '好，我來幫忙！'}</button>`;
    quest.querySelector('.st-go').addEventListener('click', () => ctx.startQuest(task.id));
  };
  renderQuest();
  stepAt(questDone() ? 1 : 0);

  const aiBox = el.querySelector('.tk-ai');
  const dharma = el.querySelector('.st-dharma');
  const game = el.querySelector('.st-game');
  const finish = () => {
    const d = el.querySelector('.tk-done');
    const n = doneCount();
    const v = VIDEOS[task.video];
    d.innerHTML = `<b>✦ 完成「${esc(task.virtue)}」，島上又亮了一角</b><span>${n < 7 ? `還有 ${7 - n} 位島民需要你。` : '七位島民都幫到了！上山頂的願行台，帶一張願行卡回到生活吧。'}</span>
      ${v ? `<a class="video-link" href="${esc(v.u)}" target="_blank" rel="noopener"><span class="play" aria-hidden="true">▶</span><span><b>延伸觀看：${esc(v.t)}</b><small>${esc(v.by)}・${esc(v.d)}</small></span></a>` : ''}`;
    d.hidden = false;
    el.querySelector('.tk-reflect').hidden = false;
    el.querySelector('.tk-count').textContent = `島民 ${n} / 7`;
    stepAt(4);
  };
  const showChoice = (i, fresh) => {
    el.querySelectorAll('.tk-opts .opt').forEach((b, j) => { b.disabled = true; b.classList.toggle('is-picked', j === i); b.classList.toggle('is-dim', j !== i); });
    el.querySelector('.tk-all').hidden = false;
    aiBox.hidden = false;
    dharma.hidden = false;
    if (game.hidden) {
      game.hidden = false;
      mountTrial(game, task.id, ctx, {
        passed: passed(),
        onPass: () => {
          state.setTask(task.id, { trial: 'passed' });
          ctx.complete(spot.id);
          finish();
          requestAnimationFrame(() => el.querySelector('.tk-done').scrollIntoView({ behavior: 'smooth', block: 'nearest' }));
        },
      });
    }
    stepAt(passed() ? 4 : 3);
    if (fresh) reveal(aiBox);
    const s = saved();
    if (!fresh && s.ai) { aiBox.innerHTML = aiBlock(s.ai, 'AI 怎麼看你的選擇'); return; }
    aiBox.innerHTML = `<h4><span class="ai-dot"></span>AI 怎麼看你的選擇</h4>${loading('正在分析這個選擇對情境中的人可能帶來的影響……')}`;
    ask('task', { taskId: task.id, choice: i })
      .then((r) => {
        if (r.via !== 'offline') state.setTask(task.id, { ai: r });
        if (alive) aiBox.innerHTML = aiBlock(r, 'AI 怎麼看你的選擇');
      })
      .catch((e) => { if (alive) aiBox.innerHTML = `<p class="msg-err">${esc(e instanceof AIError ? e.message : 'AI 服務暫時沒有回應。')}你可以先展開下方「作品解說」看看每個選擇的影響。</p>`; });
  };

  el.querySelectorAll('.tk-opts .opt').forEach((b) => b.addEventListener('click', () => {
    const i = Number(b.dataset.i);
    state.setTask(task.id, { choice: i, ai: null });
    const pts = { best: 30, ok: 20, weak: 10 }[task.options[i].k] || 10;
    const got = state.addPoints(`choice:${task.id}`, pts);
    if (got) ctx.points?.(got);
    showChoice(i, true);
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
      if (alive) fb.innerHTML = r.via === 'offline' ? `<p class="via via-off">AI 暫時無法連線，你寫下的句子已經保存。可以對照下面的段落，自己檢查看看。</p>${sourcesHTML(r.sources, true)}` : aiBlock(r, 'AI 的回饋');
    } catch (e) {
      if (alive) fb.innerHTML = `<p class="msg-err">${esc(e instanceof AIError ? e.message : 'AI 服務暫時沒有回應，請稍後再試。')}</p>`;
    }
    btn.disabled = false;
  });

  const s0 = saved();
  if (s0.choice !== undefined && questDone()) {
    showChoice(s0.choice, false);
    if (s0.reflect) el.querySelector('.tk-text').value = s0.reflect;
    if (s0.reflectAi) fb.innerHTML = aiBlock(s0.reflectAi, 'AI 的回饋');
    if (passed()) finish();
  }
  return () => { alive = false; };
}
