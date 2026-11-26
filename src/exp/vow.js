import { TASKS } from '../data/tasks.js';
import { ask, AIError } from '../ai/client.js';
import { state } from '../state.js';
import { MERIT } from '../data/merit.js';
import { esc, richText } from '../ui/chat.js';
import { drawVowCard } from '../ui/vowcard.js';

/** 願行台：回顧這一路 → AI 學習回饋與挑戰 → 選一個願 → 產生願行卡 */
export function mount(el, spot, ctx) {
  let alive = true;
  const st = state.get();
  const doneTasks = TASKS.filter((t) => st.tasks[t.id]?.choice !== undefined);
  const zones = state.summary();
  let aiVow = st.vow?.aiVow || null, aiFeedback = st.vow?.aiFeedback || null;

  el.innerHTML = `
    <div class="vw">
      <section class="vw-sec">
        <h3>這一路，你走過了</h3>
        <ul class="vw-zones">${zones.map((z) => `<li class="${z.done >= z.total ? 'is-done' : ''}" style="--zc:${z.color}"><span>${z.no}</span><b>${esc(z.name)}</b><em>${z.done} / ${z.total}</em></li>`).join('')}</ul>
        <div class="vw-tasks">${TASKS.map((t) => `<span class="vchip${st.tasks[t.id]?.choice !== undefined ? ' is-on' : ''}" style="--tc:${t.color}">${esc(t.virtue)}</span>`).join('')}</div>
        ${doneTasks.length < 7 ? `<p class="exp-hint">還有 ${7 - doneTasks.length} 項善念任務沒完成。你可以先回善念實踐園，也可以直接在這裡許下一個願。</p>` : '<p class="exp-hint">七項善念任務都完成了，很棒！</p>'}
      </section>

      <section class="vw-sec">
        <h3><span class="ai-dot"></span>AI 學習回饋</h3>
        <p class="exp-hint">AI 會根據你在任務中的選擇，給一段簡短回饋，並建議一個生活挑戰。不做任何心理或人格判斷。</p>
        <textarea class="vw-ctx" rows="2" maxlength="200" placeholder="（選填）最近生活裡，有沒有想讓它變得更好的地方？例如：和室友常常有摩擦。"></textarea>
        <button type="button" class="btn btn-primary btn-sm vw-ai-btn">請 AI 給我回饋與挑戰</button>
        <div class="vw-ai"></div>
      </section>

      <section class="vw-sec">
        <h3>選一個你願意做到的小行動</h3>
        <div class="vw-choices"></div>
        <label class="vw-own"><input type="radio" name="vow" value="own"> <span>我自己寫：</span><input type="text" class="vw-own-text" maxlength="40" placeholder="今天，我願意……"></label>
      </section>

      <section class="vw-sec">
        <h3>產生願行卡</h3>
        <label class="vw-name">署名（選填）<input type="text" class="vw-name-in" maxlength="12" placeholder="旅人"></label>
        <button type="button" class="btn btn-primary vw-make">產生我的願行卡</button>
        <div class="vw-card" hidden>
          <img class="vw-img" alt="我的願行卡">
          <div class="vw-actions"><a class="btn btn-primary btn-sm vw-dl" download="三好四給島-願行卡.png">下載願行卡</a><button type="button" class="btn btn-ghost btn-sm vw-share" hidden>分享</button></div>
          <p class="exp-hint">願行卡只在你的瀏覽器裡產生，不會上傳。</p>
        </div>
      </section>
    </div>`;

  const choices = el.querySelector('.vw-choices');
  const renderChoices = () => {
    const base = (doneTasks.length ? doneTasks : TASKS).map((t) => ({ v: t.vow, tag: t.virtue }));
    const list = aiVow ? [{ v: aiVow, tag: 'AI 建議', ai: true }, ...base] : base;
    const cur = st.vow?.text;
    choices.innerHTML = list.map((x, i) => `<label class="vw-opt${x.ai ? ' is-ai' : ''}"><input type="radio" name="vow" value="${i}" ${cur ? (cur === x.v ? 'checked' : '') : (i === 0 ? 'checked' : '')}><span class="vw-tag">${esc(x.tag)}</span><span>${esc(x.v)}</span></label>`).join('');
    choices._list = list;
  };
  renderChoices();
  const aiOut = el.querySelector('.vw-ai');
  const showAI = () => { if (aiFeedback) aiOut.innerHTML = `<p>${richText(aiFeedback)}</p>${aiVow ? `<p class="vw-ai-vow"><b>建議的挑戰：</b>${esc(aiVow)}</p>` : ''}<p class="via">AI 即時生成・依據你的任務選擇與島上知識庫</p>`; };
  showAI();

  el.querySelector('.vw-ai-btn').addEventListener('click', async (e) => {
    const btn = e.currentTarget; btn.disabled = true;
    aiOut.innerHTML = '<p class="loading-line"><span class="dots"><i></i><i></i><i></i></span>AI 正在回顧你的旅程……</p>';
    try {
      const r = await ask('vow', { done: doneTasks.map((t) => ({ id: t.id, choice: st.tasks[t.id].choice })), context: el.querySelector('.vw-ctx').value });
      if (!alive) return;
      if (r.via === 'offline') {
        aiOut.innerHTML = '<p class="via via-off">AI 暫時無法連線，暫時無法產生個人化回饋。你仍然可以從下方挑一個願，製作願行卡。</p>';
      } else {
        const t = r.text, k = t.search(/挑戰[:：]/);
        const head = k >= 0 ? t.slice(0, k) : t;
        aiFeedback = head.replace(/^[\s\S]*?回饋[:：]/, '').trim() || head.trim();
        aiVow = k >= 0 ? t.slice(k).replace(/^挑戰[:：]\s*/, '').split('\n')[0].replace(/[「」"*]/g, '').trim().slice(0, 40) || null : null;
        state.setVow({ ...(state.get().vow || {}), aiFeedback, aiVow });
        showAI(); renderChoices();
        ctx.points?.(state.addMerit('vow:ai', MERIT.vowAI), 'AI 學習回饋');
      }
    } catch (err) {
      if (alive) aiOut.innerHTML = `<p class="msg-err">${esc(err instanceof AIError ? err.message : 'AI 服務暫時沒有回應，請稍後再試。')}</p>`;
    }
    btn.disabled = false;
  });

  el.querySelector('.vw-own-text').addEventListener('focus', () => { el.querySelector('.vw-own input[type=radio]').checked = true; });
  el.querySelector('.vw-make').addEventListener('click', async () => {
    const pick = el.querySelector('input[name=vow]:checked');
    let text = '';
    if (pick?.value === 'own') text = el.querySelector('.vw-own-text').value.trim();
    else if (pick) text = choices._list[Number(pick.value)].v;
    if (!text) { el.querySelector('.vw-own-text').focus(); return; }
    const name = el.querySelector('.vw-name-in').value.trim() || '旅人';
    const url = await drawVowCard({ text, name, done: TASKS.map((t) => ({ virtue: t.virtue, on: st.tasks[t.id]?.choice !== undefined, color: t.color })) });
    if (!alive) return;
    state.setVow({ ...(state.get().vow || {}), text, name, at: Date.now() });
    ctx.complete(spot.id);
    const wrap = el.querySelector('.vw-card');
    wrap.hidden = false;
    el.querySelector('.vw-img').src = url;
    el.querySelector('.vw-dl').href = url;
    const share = el.querySelector('.vw-share');
    const blob = await (await fetch(url)).blob();
    // 在 claude.ai 預覽中，一般下載連結會被擋下，改用平台的下載功能
    el.querySelector('.vw-dl').onclick = async (ev) => {
      const use = window.claude?.use;
      if (typeof use !== 'function') return;
      ev.preventDefault();
      try { const dls = await use('downloads'); if (dls) await dls.save({ filename: '三好四給島-願行卡.png', data: blob }); } catch { /* 使用者取消 */ }
    };
    const file = new File([blob], '三好四給島-願行卡.png', { type: 'image/png' });
    if (navigator.canShare?.({ files: [file] })) {
      share.hidden = false;
      share.onclick = () => { try { navigator.share({ files: [file], title: '我的願行卡', text }).catch(() => {}); } catch { /* 不支援 */ } };
    }
    wrap.scrollIntoView({ behavior: 'smooth', block: 'center' });
  });
  if (st.vow?.name) el.querySelector('.vw-name-in').value = st.vow.name === '旅人' ? '' : st.vow.name;
  return () => { alive = false; };
}
