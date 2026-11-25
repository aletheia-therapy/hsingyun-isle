import { ask, AIError } from '../ai/client.js';
import { MODES } from '../ai/prompts.js';
import { state } from '../state.js';

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const safeUrl = (u) => (/^https:\/\//.test(u) ? u : '#');

/** AI 回答：跳脫後再把 [1] 變成上標的來源編號 */
export function richText(t) {
  return esc(t).replace(/\[(\d{1,2})\]/g, '<sup class="cite">$1</sup>').replace(/\n/g, '<br>');
}
export function sourcesHTML(sources, open = false) {
  if (!sources?.length) return '';
  return `<details class="srcs"${open ? ' open' : ''}><summary>回答依據（${sources.length} 段資料）</summary><ol>${sources.map((s) => `
    <li><b>${esc(s.title)}</b><p>${esc(s.text)}</p>${s.refs.map((r) => `<a href="${safeUrl(r.u)}" target="_blank" rel="noopener">${esc(r.t)}</a>`).join('')}</li>`).join('')}</ol></details>`;
}
export const OFFLINE_NOTE = 'AI 暫時無法連線。以下是知識庫中最相關的原文段落（非 AI 生成），你可以直接閱讀，或稍後再問一次。';
export function viaBadge(via) {
  return via === 'offline' ? `<p class="via via-off">${OFFLINE_NOTE}</p>` : '<p class="via">AI 即時生成・依據島上知識庫</p>';
}

const SAMPLES = {
  knowledge: ['什麼是人間佛教？', '星雲大師幾歲出家？', '佛光山是哪一年開山的？', '四大宗旨是什麼？'],
  understand: ['人間佛教和傳統佛教有什麼不同？', '「佛說的、人要的」是什麼意思？', '為什麼說「佛教就是教育」？', '星雲大師為什麼提倡三好四給？'],
  practice: ['如何在學校實踐說好話？', '面對挫折時，可以如何正向思考？', '如何把三好四給用在工作和家庭？', '朋友心情很差，我可以怎麼陪他？'],
};

/** AI 對話元件：可放在講堂的內容面板，也可放在隨處可開的 AI 導覽抽屜 */
export class Chat {
  constructor(el, { getZone, onClose, title = 'AI 學習助理' } = {}) {
    this.el = el;
    this.getZone = getZone || (() => null);
    this.mode = 'knowledge';
    this.busy = false;
    el.innerHTML = `
      <div class="chat">
        <div class="chat-head">
          <div><h3 class="chat-title"><span class="ai-dot" aria-hidden="true"></span>${esc(title)}</h3>
          <p class="chat-sub">我是 AI，不是星雲大師本人。回答依據島上整理的公開資料，並附上出處。</p></div>
          ${onClose ? '<button type="button" class="icon-btn chat-close" aria-label="關閉">×</button>' : ''}
        </div>
        <div class="chat-modes" role="tablist">${Object.entries(MODES).map(([k, m]) => `<button type="button" role="tab" class="mode" data-mode="${k}" aria-selected="${k === this.mode}"><b>${m.label}</b><small>${m.hint}</small></button>`).join('')}</div>
        <div class="chat-log" aria-live="polite"></div>
        <div class="chat-samples"></div>
        <form class="chat-form">
          <textarea class="chat-input" rows="2" maxlength="400" placeholder="輸入你的問題，例如：什麼是人間佛教？" aria-label="輸入問題"></textarea>
          <button type="submit" class="btn btn-primary chat-send">送出</button>
        </form>
        <div class="chat-foot"><button type="button" class="link-btn chat-clear">清除對話紀錄</button><span>對話紀錄只存在你的瀏覽器中。</span></div>
      </div>`;
    this.log = el.querySelector('.chat-log');
    this.input = el.querySelector('.chat-input');
    el.querySelector('.chat-close')?.addEventListener('click', onClose);
    el.querySelectorAll('.mode').forEach((b) => b.addEventListener('click', () => this.setMode(b.dataset.mode)));
    el.querySelector('.chat-form').addEventListener('submit', (e) => { e.preventDefault(); this.send(); });
    this.input.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); this.send(); } });
    el.querySelector('.chat-clear').addEventListener('click', () => { state.clearChat(); this.render(); });
    this.setMode(this.mode);
    this.render();
  }

  setMode(m) {
    this.mode = m;
    this.el.querySelectorAll('.mode').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.mode === m)));
    this.el.querySelector('.chat-samples').innerHTML = SAMPLES[m].map((q) => `<button type="button" class="chip">${esc(q)}</button>`).join('');
    this.el.querySelectorAll('.chip').forEach((c) => c.addEventListener('click', () => { this.input.value = c.textContent; this.send(); }));
    this.input.placeholder = m === 'practice' ? '說說你遇到的情況，例如：組員沒做好報告，我該怎麼說？' : `輸入你的問題，例如：${SAMPLES[m][0]}`;
  }

  render() {
    const msgs = state.get().chat;
    if (!msgs.length) {
      this.log.innerHTML = `<div class="msg msg-ai msg-hello"><p>你好，歡迎來到 AI 智慧講堂。你可以選擇上方三種模式：<br>・<b>知識導覽</b>：認識大師的生平與佛光山的史實<br>・<b>思想理解</b>：把抽象的觀念說得白話一點<br>・<b>生活實踐</b>：把生活裡的難題拿來，一起想三好四給可以怎麼做<br>資料裡找不到的，我會老實說無法確認。</p></div>`;
      return;
    }
    this.log.innerHTML = msgs.map((m) => this.#msg(m)).join('');
    this.log.scrollTop = this.log.scrollHeight;
  }

  #msg(m) {
    if (m.role === 'user') return `<div class="msg msg-user"><span class="msg-mode">${esc(MODES[m.mode]?.label || '')}</span><p>${esc(m.content)}</p></div>`;
    if (m.role === 'error') return `<div class="msg msg-err"><p>${esc(m.content)}</p></div>`;
    if (m.via === 'offline') return `<div class="msg msg-ai msg-off">${viaBadge('offline')}${sourcesHTML(m.sources, true)}</div>`;
    return `<div class="msg msg-ai"><p>${richText(m.content)}</p>${viaBadge(m.via)}${sourcesHTML(m.sources)}</div>`;
  }

  /** 從其他地方帶著問題打開（例如人間佛教殿的「請 AI 解釋」） */
  askNow(question, mode = 'understand') { this.setMode(mode); this.input.value = question; this.send(); }

  async send() {
    const q = this.input.value.trim();
    if (!q || this.busy) return;
    this.busy = true;
    this.input.value = '';
    const history = state.get().chat.filter((m) => (m.role === 'user' || m.role === 'assistant') && m.content).slice(-6).map(({ role, content }) => ({ role, content }));
    state.pushChat({ role: 'user', content: q, mode: this.mode });
    this.render();
    const pending = document.createElement('div');
    pending.className = 'msg msg-ai msg-pending';
    pending.innerHTML = '<p><span class="dots"><i></i><i></i><i></i></span> 正在查找資料並整理回答……</p>';
    this.log.appendChild(pending);
    this.log.scrollTop = this.log.scrollHeight;
    this.el.querySelector('.chat-send').disabled = true;
    const zone = this.getZone();
    try {
      const r = await ask('chat', { question: q, mode: this.mode, history, zone: zone?.id, zoneName: zone?.name }, {
        onText: (t) => { pending.querySelector('p').innerHTML = richText(t); this.log.scrollTop = this.log.scrollHeight; },
      });
      state.pushChat(r.via === 'offline' ? { role: 'assistant', content: '', via: 'offline', sources: r.sources } : { role: 'assistant', content: r.text, via: r.via, sources: r.sources });
    } catch (e) {
      state.pushChat({ role: 'error', content: e instanceof AIError ? e.message : 'AI 服務暫時沒有回應，請稍後再試。' });
    }
    this.busy = false;
    this.el.querySelector('.chat-send').disabled = false;
    this.render();
  }
}
