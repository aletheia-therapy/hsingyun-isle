import { state } from '../state.js';
import { esc } from '../ui/chat.js';

const EVENTS = [
  { y: 1927, t: '生於江蘇江都' },
  { y: 1949, t: '渡海來到台灣' },
  { y: 1953, t: '到宜蘭雷音寺主持念佛會' },
  { y: 1967, t: '開創佛光山，立下四大宗旨' },
  { y: 1992, t: '國際佛光會在洛杉磯成立' },
  { y: 1998, t: '正式倡導三好運動' },
];
const QS = [
  { q: '佛光山的四大宗旨中，「以教育」是為了什麼？', a: ['培養人才', '弘揚佛法', '淨化人心'], c: 0, why: '四大宗旨是：以文化弘揚佛法、以教育培養人才、以慈善福利社會、以共修淨化人心。' },
  { q: '「三好」指的是哪三件事？', a: ['讀好書、交好友、做好人', '做好事、說好話、存好心', '吃好飯、睡好覺、走好路'], c: 1, why: '三好就是身做好事、口說好話、心存好念，也就是身口意三業清淨。' },
  { q: '下列哪一項「不是」四給的內容？', a: ['給人信心', '給人方便', '給人財富'], c: 2, why: '四給是佛光人工作信條：給人信心、給人歡喜、給人希望、給人方便。' },
];
const shuffle = (a) => { const b = a.slice(); for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; } return b; };

export function mount(el, spot, ctx) {
  let pool = shuffle(EVENTS), order = [], step = 'order', qi = 0, score = 0, tries = 0;
  const render = () => {
    if (step === 'order') {
      el.innerHTML = `
        <div class="qz">
          <p class="exp-hint">依照時間先後，依序點下石碑（最早的先點）。點錯了可以按「重來」。</p>
          <ol class="qz-slots">${EVENTS.map((_, i) => `<li class="${order[i] ? 'is-filled' : ''}">${order[i] ? `<b>${order[i].y}</b>${esc(order[i].t)}` : `<span>第 ${i + 1} 塊</span>`}</li>`).join('')}</ol>
          <div class="qz-pool">${pool.map((e, i) => `<button type="button" class="stone" data-i="${i}" ${order.includes(e) ? 'disabled' : ''}>${esc(e.t)}</button>`).join('')}</div>
          <div class="qz-actions"><button type="button" class="btn btn-quiet qz-reset">重來</button><button type="button" class="btn btn-primary qz-check" ${order.length < EVENTS.length ? 'disabled' : ''}>檢查順序</button></div>
          <p class="qz-msg" aria-live="polite"></p>
        </div>`;
      el.querySelectorAll('.stone').forEach((b) => b.addEventListener('click', () => { order.push(pool[Number(b.dataset.i)]); render(); }));
      el.querySelector('.qz-reset').addEventListener('click', () => { order = []; render(); });
      el.querySelector('.qz-check').addEventListener('click', () => {
        tries++;
        const ok = order.every((e, i) => e === EVENTS[i]);
        if (ok) { step = 'q'; render(); return; }
        const right = order.filter((e, i) => e === EVENTS[i]).length;
        el.querySelector('.qz-msg').textContent = `有 ${right} 塊放對了。提示：大師先在台灣弘法，之後才開山、走向世界。再試一次！`;
        el.querySelectorAll('.qz-slots li').forEach((li, i) => li.classList.toggle('is-wrong', order[i] !== EVENTS[i]));
        setTimeout(() => { let k = 0; while (k < order.length && order[k] === EVENTS[k]) k++; order = order.slice(0, k); render(); }, 1800);
      });
      return;
    }
    if (step === 'q') {
      const q = QS[qi];
      el.innerHTML = `
        <div class="qz">
          <p class="qz-ok">✓ 順序正確${tries > 1 ? `（試了 ${tries} 次）` : '，一次就排對！'}</p>
          <p class="exp-hint">小問題 ${qi + 1} / ${QS.length}</p>
          <h3 class="qz-q">${esc(q.q)}</h3>
          <div class="opts">${q.a.map((a, i) => `<button type="button" class="opt" data-i="${i}">${esc(a)}</button>`).join('')}</div>
          <div class="qz-why" aria-live="polite"></div>
        </div>`;
      el.querySelectorAll('.opt').forEach((b) => b.addEventListener('click', () => {
        const i = Number(b.dataset.i), right = i === q.c;
        if (right) score++;
        el.querySelectorAll('.opt').forEach((o, j) => { o.disabled = true; o.classList.toggle('is-right', j === q.c); o.classList.toggle('is-wrong', j === i && !right); });
        el.querySelector('.qz-why').innerHTML = `<p>${right ? '答對了！' : '再想想看。'}${esc(q.why)}</p><button type="button" class="btn btn-primary btn-sm qz-go">${qi < QS.length - 1 ? '下一題' : '看結果'}</button>`;
        el.querySelector('.qz-go').addEventListener('click', () => { qi++; if (qi >= QS.length) { step = 'end'; state.setQuiz({ score, total: QS.length, tries }); ctx.complete(spot.id); } render(); });
      }));
      return;
    }
    el.innerHTML = `
      <div class="qz">
        <div class="exp-done"><b>✦ 時光碑林完成：答對 ${score} / ${QS.length}</b><span>${score === QS.length ? '你已經把大師的一生和三好四給記在心裡了。' : '沒關係，答錯的題目在生命長廊和智慧之境都找得到答案。'}</span></div>
        <button type="button" class="btn btn-quiet qz-again">再玩一次</button>
      </div>`;
    el.querySelector('.qz-again').addEventListener('click', () => { pool = shuffle(EVENTS); order = []; step = 'order'; qi = 0; score = 0; tries = 0; render(); });
  };
  render();
}
