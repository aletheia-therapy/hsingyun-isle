import { TASKS } from '../data/tasks.js';
import { ask, AIError } from '../ai/client.js';
import { state } from '../state.js';
import { esc, richText, sourcesHTML, OFFLINE_NOTE } from '../ui/chat.js';

const L = 'ABC';

/** 善念實踐園的情境任務：選擇 → AI 分析 → 換你寫一句 → AI 回饋 */
export function mount(el, spot, ctx) {
  const task = TASKS.find((t) => t.id === spot.task);
  let alive = true;
  const saved = () => state.get().tasks[task.id] || {};
  const doneCount = () => TASKS.filter((t) => state.get().tasks[t.id]?.choice !== undefined).length;

  el.innerHTML = `
    <div class="tk" style="--tc:${task.color}">
      <div class="tk-head"><span class="tk-group">${task.group}</span><h2 class="tk-virtue">${esc(task.virtue)}</h2><span class="tk-count"></span></div>
      <div class="tk-scene"><span class="tk-label">情境</span><p>${esc(task.scene)}</p></div>
      <h3 class="tk-q">${esc(task.q)}</h3>
      <div class="opts tk-opts">${task.options.map((o, i) => `<button type="button" class="opt" data-i="${i}"><b>${L[i]}</b><span>${esc(o.t)}</span></button>`).join('')}</div>
      <section class="tk-ai" hidden></section>
      <details class="tk-all" hidden><summary>看看每個選擇可能帶來的影響（作品解說）</summary><ul>${task.options.map((o, i) => `<li><b>${L[i]}</b>${esc(o.n)}</li>`).join('')}</ul></details>
      <section class="tk-reflect" hidden>
        <h3>換你練習</h3>
        <p>${esc(task.reflect)}</p>
        <textarea class="tk-text" rows="3" maxlength="300" placeholder="寫下你的句子或做法……"></textarea>
        <button type="button" class="btn btn-primary btn-sm tk-send"><span class="ai-dot"></span>請 AI 給我回饋</button>
        <div class="tk-fb"></div>
      </section>
      <div class="exp-done tk-done" hidden></div>
    </div>`;
  const aiBox = el.querySelector('.tk-ai');
  el.querySelector('.tk-count').textContent = `善念任務 ${doneCount()} / 7`;

  const aiBlock = (r, title) => r.via === 'offline'
    ? `<h4>${title}</h4><p class="via via-off">${OFFLINE_NOTE}</p>${sourcesHTML(r.sources, true)}`
    : `<h4><span class="ai-dot"></span>${title}</h4><p>${richText(r.text)}</p><p class="via">AI 即時生成・依據島上知識庫</p>${sourcesHTML(r.sources)}`;
  const loading = (t) => `<p class="loading-line"><span class="dots"><i></i><i></i><i></i></span>${t}</p>`;

  const showChoice = (i, fresh) => {
    el.querySelectorAll('.tk-opts .opt').forEach((b, j) => { b.disabled = true; b.classList.toggle('is-picked', j === i); b.classList.toggle('is-dim', j !== i); });
    el.querySelector('.tk-all').hidden = false;
    el.querySelector('.tk-reflect').hidden = false;
    aiBox.hidden = false;
    const s = saved();
    if (!fresh && s.ai) { aiBox.innerHTML = aiBlock(s.ai, 'AI 怎麼看你的選擇'); return; }
    aiBox.innerHTML = `<h4><span class="ai-dot"></span>AI 怎麼看你的選擇</h4>${loading('正在分析這個選擇對情境中的人可能帶來的影響……')}`;
    ask('task', { taskId: task.id, choice: i }, { onText: (t) => { if (alive) aiBox.querySelector('.loading-line')?.replaceWith(Object.assign(document.createElement('p'), { innerHTML: richText(t) })); } })
      .then((r) => {
        if (r.via !== 'offline') state.setTask(task.id, { ai: r });
        if (alive) aiBox.innerHTML = aiBlock(r, 'AI 怎麼看你的選擇');
      })
      .catch((e) => { if (alive) aiBox.innerHTML = `<p class="msg-err">${esc(e instanceof AIError ? e.message : 'AI 服務暫時沒有回應。')}你可以先展開下方「作品解說」看看每個選擇的影響。</p>`; });
  };
  const finish = () => {
    const d = el.querySelector('.tk-done');
    d.hidden = false;
    const n = doneCount();
    d.innerHTML = `<b>✦ 完成「${esc(task.virtue)}」</b><span>${n < 7 ? `還有 ${7 - n} 座亭子等你。` : '七項善念任務全部完成！到山頂的願行台，帶一張願行卡回到生活吧。'}</span>`;
    el.querySelector('.tk-count').textContent = `善念任務 ${n} / 7`;
  };

  el.querySelectorAll('.tk-opts .opt').forEach((b) => b.addEventListener('click', () => {
    const i = Number(b.dataset.i);
    state.setTask(task.id, { choice: i, ai: null });
    ctx.complete(spot.id);
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
      const r = await ask('reflect', { taskId: task.id, text }, { onText: (t) => { if (alive) fb.innerHTML = `<p>${richText(t)}</p>`; } });
      state.setTask(task.id, { reflect: text, reflectAi: r.via === 'offline' ? null : r });
      if (alive) fb.innerHTML = r.via === 'offline' ? `<p class="via via-off">AI 暫時無法連線，你寫下的句子已經保存。可以對照下面的段落，自己檢查看看。</p>${sourcesHTML(r.sources, true)}` : aiBlock(r, 'AI 的回饋');
    } catch (e) {
      if (alive) fb.innerHTML = `<p class="msg-err">${esc(e instanceof AIError ? e.message : 'AI 服務暫時沒有回應，請稍後再試。')}</p>`;
    }
    btn.disabled = false;
  });

  const s = saved();
  if (s.choice !== undefined) {
    showChoice(s.choice, false);
    if (s.reflect) el.querySelector('.tk-text').value = s.reflect;
    if (s.reflectAi) fb.innerHTML = aiBlock(s.reflectAi, 'AI 的回饋');
    finish();
  }
  return () => { alive = false; };
}
