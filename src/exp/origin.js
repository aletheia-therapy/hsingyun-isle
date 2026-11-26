import { state } from '../state.js';
import { MERIT } from '../data/merit.js';
import { esc } from '../ui/chat.js';

/** 山門・源頭碑：導覽員小蓮用語音介紹三好四給，再玩快問快答與配對 */
const TALK = [
  { h: '三好：身口意都往善的方向走', p: '佛教說人有身、口、意三業。星雲大師把它說得簡單好懂：身做好事、口說好話、心存好念，這就是三好。大師在 1998 年正式倡導三好運動，從佛光山推廣到世界各地。' },
  { h: '四給：慈悲喜捨的生活實踐', p: '四給是大師訂下的佛光人工作信條：給人信心、給人歡喜、給人希望、給人方便，正好對應佛教的慈、悲、喜、捨四無量心。這就是大師提倡的人間佛教：佛法不離生活，就在待人處事之間。島上有七位島民需要幫忙，先回答四個小問題，就出發吧！' },
];
const BIO = [['1927', '生於江蘇江都'], ['12 歲', '於南京棲霞山禮志開上人出家'], ['1949', '渡海來台'], ['1967', '開創佛光山，立下四大宗旨'], ['1998', '正式倡導三好運動'], ['2023', '圓寂，享耆壽九十七']];
const QUIZ = [
  { q: '「三好」指的是哪三件事？', a: ['讀好書、交好友、做好人', '做好事、說好話、存好心', '吃好飯、睡好覺、走好路'], c: 1, why: '三好就是身做好事、口說好話、心存好念。' },
  { q: '佛教說人的一切行為，不出身、口、意三業。「說好話」是在修哪一業？', a: ['身業', '口業', '意業'], c: 1, why: '說話是口業。說好話，就是讓口業清淨；做好事是身業，存好心是意業。' },
  { q: '下列哪一項「不是」四給的內容？', a: ['給人信心', '給人方便', '給人財富'], c: 2, why: '四給是：給人信心、給人歡喜、給人希望、給人方便。' },
  { q: '四給可以對應佛教的哪一組修行？', a: ['戒、定、慧三學', '慈、悲、喜、捨四無量心', '貪、瞋、痴三毒'], c: 1, why: '四給對應慈、悲、喜、捨四無量心。戒定慧是三種修學，貪瞋痴則是要熄滅的三毒，島上的「存好心」會遇到它們。' },
];
const MATCH = [
  { k: '給人信心', t: '同學說「我不行」，你陪他找出可以進步的地方' },
  { k: '給人歡喜', t: '對忙了一整天的阿姨說聲真誠的謝謝' },
  { k: '給人希望', t: '讓失意的長輩看見自己這些年留下的價值' },
  { k: '給人方便', t: '把複雜的手續寫成步驟，交給新來的同學' },
];

export function mount(el, spot, ctx) {
  el.innerHTML = `
    <div class="og">
      <div class="bubble bubble-guide"><b>導覽員 小蓮</b><p>嗨，我是導覽員小蓮！30 秒認識三好四給，再答對四題就能出發。</p></div>
      <div class="og-talk">${TALK.map((x, i) => `<section class="og-sec" data-i="${i}"><h3>${esc(x.h)}</h3><p>${esc(x.p)}</p></section>`).join('')}</div>
      <details class="og-bio"><summary>星雲大師小檔案（三好四給的倡導者）</summary><ol>${BIO.map(([y, t]) => `<li><b>${esc(y)}</b>${esc(t)}</li>`).join('')}</ol></details>
      <section class="og-play">
        <span class="st-step">互動・快問快答</span>
        <div class="og-quiz"></div>
      </section>
      <section class="og-match" hidden>
        <span class="st-step">加碼小遊戲（選玩）</span>
        <p class="exp-hint">把每個生活片段，配到它最接近的「四給」。先點左邊的片段，再點右邊的四給。</p>
        <div class="mt"><div class="mt-l"></div><div class="mt-r"></div></div>
        <p class="mt-msg" aria-live="polite"></p>
      </section>
      <div class="exp-done" hidden></div>
    </div>`;

  // 快問快答：每一題都要答對才能前進（答錯可以再選）
  let qi = 0, miss = 0;
  const quiz = el.querySelector('.og-quiz');
  const renderQ = () => {
    if (qi >= QUIZ.length) {
      quiz.innerHTML = `<p class="qz-ok">✦ ${QUIZ.length} 題全部答對！</p>`;
      done();
      el.querySelector('.og-match').hidden = false;
      renderMatch();
      return;
    }
    const q = QUIZ[qi];
    miss = 0;
    quiz.innerHTML = `<p class="exp-hint">第 ${qi + 1} / ${QUIZ.length} 題・答對才能前進</p><h3 class="qz-q">${esc(q.q)}</h3><div class="opts">${q.a.map((a, i) => `<button type="button" class="opt" data-i="${i}">${esc(a)}</button>`).join('')}</div><div class="qz-why" aria-live="polite"></div>`;
    quiz.querySelectorAll('.opt').forEach((b) => b.addEventListener('click', () => {
      const i = Number(b.dataset.i), why = quiz.querySelector('.qz-why');
      if (i !== q.c) {
        miss++;
        b.disabled = true; b.classList.add('is-wrong');
        why.innerHTML = '<p class="mg-no">不太對喔，再想想看。</p>';
        return;
      }
      ctx.points?.(state.addMerit(`origin:${qi}`, miss ? MERIT.originRetry : MERIT.originQ), miss ? '答對了' : '一次就答對');
      quiz.querySelectorAll('.opt').forEach((o, j) => { o.disabled = true; o.classList.toggle('is-right', j === q.c); });
      why.innerHTML = `<p class="mg-ok"><b>${miss ? '答對了！' : '一次就答對！'}</b>${esc(q.why)}</p><button type="button" class="btn btn-primary btn-sm">${qi < QUIZ.length - 1 ? '下一題' : '完成'}</button>`;
      why.querySelector('button').addEventListener('click', () => { qi++; renderQ(); });
    }));
  };

  // 配對遊戲
  const placed = new Map(); let sel = null;
  const order = MATCH.map((_, i) => i).sort(() => Math.random() - 0.5);
  const renderMatch = () => {
    const l = el.querySelector('.mt-l'), r = el.querySelector('.mt-r');
    l.innerHTML = order.map((i) => `<button type="button" class="mt-card${placed.has(i) ? ' is-ok' : ''}${sel === i ? ' is-sel' : ''}" data-i="${i}" ${placed.has(i) ? 'disabled' : ''}>${esc(MATCH[i].t)}${placed.has(i) ? `<em>${esc(MATCH[i].k)}</em>` : ''}</button>`).join('');
    r.innerHTML = MATCH.map((m) => `<button type="button" class="mt-key" data-k="${esc(m.k)}">${esc(m.k)}</button>`).join('');
    l.querySelectorAll('.mt-card').forEach((b) => b.addEventListener('click', () => { sel = Number(b.dataset.i); renderMatch(); }));
    r.querySelectorAll('.mt-key').forEach((b) => b.addEventListener('click', () => {
      const msg = el.querySelector('.mt-msg');
      if (sel === null) { msg.textContent = '先點左邊的一個生活片段喔。'; return; }
      if (MATCH[sel].k === b.dataset.k) {
        placed.set(sel, true); sel = null; renderMatch();
        if (placed.size === MATCH.length) { el.querySelector('.mt-msg').innerHTML = '<b>✦ 全部配對正確！</b>'; ctx.points?.(state.addMerit('match:origin', MERIT.match), '配對完成'); }
      } else {
        msg.textContent = '再想想看：這件事最主要帶給對方的是什麼？';
        b.classList.add('shake'); setTimeout(() => b.classList.remove('shake'), 450);
      }
    }));
  };
  let finished = false;
  const done = () => {
    if (finished) return; finished = true;
    ctx.complete(spot.id);
    const d = el.querySelector('.exp-done');
    d.hidden = false;
    d.innerHTML = '<b>✦ 出發吧！</b><span>按下方的「下一步」回到島上，跟著地上的金色箭頭，去三好村找第一位需要幫忙的島民：阿婆。下面還有一個選玩的配對小遊戲。</span>';
  };

  if (state.isDone(spot.id)) qi = QUIZ.length;
  renderQ();
  return null;
}
