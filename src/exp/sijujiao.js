import { state } from '../state.js';
import { esc } from '../ui/chat.js';

/** 人間佛教殿：點亮「四句教」的四盞燈，再認識人間佛教的六項特質 */
const FOUR = [
  { k: '佛說的', guard: '守住佛陀教法的根本，讓人間佛教「有法可依」，不是隨意發明的新說法。',
    eg: '例子：遇到一個說法時先問，它和佛陀的基本教導（慈悲、因緣、戒定慧）一致嗎？' },
  { k: '人要的', guard: '回應人真實的需要，讓佛法「有人可用」：教育、家庭、工作、心情，都是佛法可以照顧的地方。',
    eg: '例子：與其只談深奧的名相，不如先問一位焦慮的學生：此刻什麼能幫上你？' },
  { k: '淨化的', guard: '指向心的修持，讓人「有路可走」：佛法不只是知識，而是讓貪瞋痴慢慢變少的練習。',
    eg: '例子：吵架後先深呼吸、承認自己的怒氣，再決定要說什麼。' },
  { k: '善美的', guard: '指向良善美好的生活與社會，讓人「有福可享」：修行的結果，是自己和身邊的人都更好。',
    eg: '例子：一句好話讓組員願意再試一次，這就是看得見的善與美。' },
];
const SIX = [
  ['人間性', '佛陀出生、修行、成道都在人間，佛法是為人而說。'],
  ['生活性', '佛法要用在吃飯、工作、待人處事這些日常裡。'],
  ['利他性', '修行不只為自己，也要利益他人。'],
  ['喜樂性', '學佛帶來的應該是歡喜，而不是愁苦。'],
  ['時代性', '用這個時代聽得懂的方式說，回應這個時代的問題。'],
  ['普濟性', '普遍照顧一切人，不分身分、國籍與背景。'],
];

export function mount(el, spot, ctx) {
  const lit = new Set(state.isDone(spot.id) ? [0, 1, 2, 3] : []);
  el.innerHTML = `
    <div class="sj">
      <p class="exp-hint">有人問大師「什麼是人間佛教？」大師回答：人間佛教就是「佛說的、人要的、淨化的、善美的」。點亮四盞燈，看看每一句守護著什麼。</p>
      <div class="sj-lamps">${FOUR.map((f, i) => `<button type="button" class="lamp-btn" data-i="${i}" aria-pressed="false"><span class="lamp-ico" aria-hidden="true"></span><b>${esc(f.k)}</b></button>`).join('')}</div>
      <div class="sj-detail" aria-live="polite"><p class="sj-empty">選一盞燈開始。</p></div>
      <section class="sj-six" hidden>
        <h3>人間佛教的六項特質</h3>
        <p class="exp-hint">四盞燈都亮了。大師也指出，佛教本質上應具備六項特質。點卡片翻面看說明。</p>
        <div class="six-grid">${SIX.map(([a, b]) => `<button type="button" class="flip"><span class="flip-f">${esc(a)}</span><span class="flip-b">${esc(b)}</span></button>`).join('')}</div>
        <div class="sj-ask">
          <p>還想更深入？請 AI 學習助理用白話再說一次：</p>
          <button type="button" class="btn btn-ghost btn-sm" data-q="人間佛教和傳統佛教有什麼不同？"><span class="ai-dot"></span>人間佛教和過去的佛教有什麼不同？</button>
          <button type="button" class="btn btn-ghost btn-sm" data-q="請用一個大學生的生活例子，說明「人要的」是什麼意思。"><span class="ai-dot"></span>用大學生的例子說明「人要的」</button>
        </div>
      </section>
    </div>`;
  const detail = el.querySelector('.sj-detail');
  const paint = () => {
    el.querySelectorAll('.lamp-btn').forEach((b, i) => { b.classList.toggle('is-lit', lit.has(i)); b.setAttribute('aria-pressed', String(lit.has(i))); });
    ctx.lightHall?.(lit);
    if (lit.size === 4) {
      el.querySelector('.sj-six').hidden = false;
      if (!state.isDone(spot.id)) ctx.complete(spot.id);
    }
  };
  el.querySelectorAll('.lamp-btn').forEach((b) => b.addEventListener('click', () => {
    const i = Number(b.dataset.i), f = FOUR[i];
    lit.add(i);
    detail.innerHTML = `<h3>「${esc(f.k)}」</h3><p>${esc(f.guard)}</p><p class="sj-eg">${esc(f.eg)}</p><p class="sj-n">已點亮 ${lit.size} / 4</p>`;
    paint();
  }));
  el.querySelectorAll('.flip').forEach((b) => b.addEventListener('click', () => b.classList.toggle('is-flipped')));
  el.querySelectorAll('.sj-ask button').forEach((b) => b.addEventListener('click', () => ctx.openChat(b.dataset.q, 'understand')));
  paint();
  return () => ctx.lightHall?.(new Set(state.isDone(spot.id) ? [0, 1, 2, 3] : []));
}
