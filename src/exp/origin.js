import { state } from '../state.js';
import { esc } from '../ui/chat.js';
import { voice, speakButton } from '../ui/voice.js';

/** 山門・源頭碑：導覽員小蓮用語音介紹三好四給，再玩快問快答與配對 */
const TALK = [
  { h: '歡迎來到三好四給之島', p: '這座島上住著七位需要幫忙的島民。你會用自己的腳走過去，看看發生了什麼事、聽聽他們說的話，再選擇你要怎麼回應。每幫到一位，島上就會亮起一角。' },
  { h: '三好：身、口、意都往善的方向走', p: '三好就是做好事、說好話、存好心。星雲大師說明，這就是佛教徒常說的身口意三業清淨：身做好事、口說好話、心存好念。大師在 1998 年正式倡導三好運動，希望安定人心、找回社會良知。' },
  { h: '四給：把善意送給別人', p: '四給是大師訂下的佛光人工作信條：給人信心、給人歡喜、給人希望、給人方便。大師在〈真誠的告白〉裡寫道，他一生服膺「給」的哲學。也有研究指出，四給正好對應慈、悲、喜、捨四無量心。' },
  { h: '不需要宗教背景也做得到', p: '三好四給不是口號，而是每天都能做的小事：一句鼓勵、一次幫忙、一個善意的念頭。準備好了，就從三好村出發吧。' },
];
const BIO = [['1927', '生於江蘇江都'], ['12 歲', '於南京棲霞山禮志開上人出家'], ['1949', '渡海來台'], ['1967', '開創佛光山，立下四大宗旨'], ['1998', '正式倡導三好運動'], ['2023', '圓寂，享耆壽九十七']];
const QUIZ = [
  { q: '「三好」指的是哪三件事？', a: ['讀好書、交好友、做好人', '做好事、說好話、存好心', '吃好飯、睡好覺、走好路'], c: 1, why: '三好就是身做好事、口說好話、心存好念。' },
  { q: '三好對應的是我們的哪三個部分？', a: ['身、口、意', '眼、耳、鼻', '家、校、國'], c: 0, why: '大師說明，三好就是身口意三業清淨。' },
  { q: '下列哪一項「不是」四給的內容？', a: ['給人信心', '給人方便', '給人財富'], c: 2, why: '四給是：給人信心、給人歡喜、給人希望、給人方便。' },
  { q: '朋友迷了路，你陪他走到目的地，最接近哪一給？', a: ['給人方便', '給人希望', '給人信心'], c: 0, why: '大師舉例：迷路了，我為你引路，這就是給人方便。' },
];
const MATCH = [
  { k: '給人信心', t: '同學說「我不行」，你陪他找出可以進步的地方' },
  { k: '給人歡喜', t: '對忙了一整天的阿姨說聲真誠的謝謝' },
  { k: '給人希望', t: '讓失意的長輩看見自己這些年留下的價值' },
  { k: '給人方便', t: '把複雜的手續寫成步驟，交給新來的同學' },
];

export function mount(el, spot, ctx) {
  let alive = true;
  el.innerHTML = `
    <div class="og">
      <div class="bubble bubble-guide"><b>導覽員 小蓮</b><p>嗨，我是島上的導覽員小蓮！我先用一分鐘，帶你認識三好四給。</p></div>
      <div class="og-talk">${TALK.map((x, i) => `<section class="og-sec" data-i="${i}"><h3>${esc(x.h)}</h3><p>${esc(x.p)}</p></section>`).join('')}</div>
      <details class="og-bio"><summary>星雲大師小檔案（三好四給的倡導者）</summary><ol>${BIO.map(([y, t]) => `<li><b>${esc(y)}</b>${esc(t)}</li>`).join('')}</ol></details>
      <section class="og-play">
        <span class="st-step">互動・快問快答</span>
        <div class="og-quiz"></div>
      </section>
      <section class="og-match" hidden>
        <span class="st-step">互動・配對遊戲</span>
        <p class="exp-hint">把每個生活片段，配到它最接近的「四給」。先點左邊的片段，再點右邊的四給。</p>
        <div class="mt"><div class="mt-l"></div><div class="mt-r"></div></div>
        <p class="mt-msg" aria-live="polite"></p>
      </section>
      <div class="exp-done" hidden></div>
    </div>`;

  // 聆聽：逐段朗讀，正在唸的段落會亮起來
  const secs = [...el.querySelectorAll('.og-sec')];
  const playAll = async () => {
    for (let i = 0; i < TALK.length && alive; i++) {
      secs.forEach((s, j) => s.classList.toggle('is-reading', j === i));
      await voice.say(`${TALK[i].h}。${TALK[i].p}`, 'guide');
      if (!voice.on) break;
    }
    secs.forEach((s) => s.classList.remove('is-reading'));
  };
  const sb = speakButton(() => TALK.map((x) => `${x.h}。${x.p}`).join('。'), 'guide', '聽小蓮導覽');
  if (sb) el.querySelector('.bubble-guide').appendChild(sb);
  if (!state.isDone(spot.id)) playAll();

  // 快問快答
  let qi = 0, score = 0;
  const quiz = el.querySelector('.og-quiz');
  const renderQ = () => {
    if (qi >= QUIZ.length) {
      quiz.innerHTML = `<p class="qz-ok">快問快答：答對 ${score} / ${QUIZ.length}</p>`;
      el.querySelector('.og-match').hidden = false;
      renderMatch();
      return;
    }
    const q = QUIZ[qi];
    quiz.innerHTML = `<p class="exp-hint">第 ${qi + 1} / ${QUIZ.length} 題</p><h3 class="qz-q">${esc(q.q)}</h3><div class="opts">${q.a.map((a, i) => `<button type="button" class="opt" data-i="${i}">${esc(a)}</button>`).join('')}</div><div class="qz-why"></div>`;
    quiz.querySelectorAll('.opt').forEach((b) => b.addEventListener('click', () => {
      const i = Number(b.dataset.i), right = i === q.c;
      if (right) score++;
      quiz.querySelectorAll('.opt').forEach((o, j) => { o.disabled = true; o.classList.toggle('is-right', j === q.c); o.classList.toggle('is-wrong', j === i && !right); });
      const msg = `${right ? '答對了！' : '再想想。'}${q.why}`;
      quiz.querySelector('.qz-why').innerHTML = `<p>${esc(msg)}</p><button type="button" class="btn btn-primary btn-sm">${qi < QUIZ.length - 1 ? '下一題' : '繼續'}</button>`;
      voice.say(msg, 'guide');
      quiz.querySelector('.qz-why button').addEventListener('click', () => { qi++; renderQ(); });
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
        if (placed.size === MATCH.length) done();
      } else {
        msg.textContent = '再想想看：這件事最主要帶給對方的是什麼？';
        b.classList.add('shake'); setTimeout(() => b.classList.remove('shake'), 450);
      }
    }));
  };
  const done = () => {
    ctx.complete(spot.id);
    const d = el.querySelector('.exp-done');
    d.hidden = false;
    d.innerHTML = '<b>✦ 你已經認識三好四給了</b><span>接下來，沿著石板路往西走到三好村，阿婆正需要幫忙。按 Esc 或「回到地圖」繼續探索。</span>';
    voice.say('太棒了！你已經認識三好四給了。往西走到三好村，阿婆正需要你的幫忙喔。', 'guide');
  };

  if (state.isDone(spot.id)) { qi = QUIZ.length; score = QUIZ.length; MATCH.forEach((_, i) => placed.set(i, true)); renderQ(); done(); } else renderQ();
  return () => { alive = false; voice.stop(); };
}
