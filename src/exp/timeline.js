import { KB } from '../data/kb.js';
import { SOURCES } from '../data/sources.js';
import { state } from '../state.js';
import { esc } from '../ui/chat.js';

const kb = (id) => KB.find((k) => k.id === id);
export const NODES = [
  { y: '1927', t: '生於江蘇江都', id: 'life-birth', think: '一個家境清貧、讀書常中斷的孩子，後來一生最重視的是什麼？往下看看。' },
  { y: '12 歲', t: '棲霞山出家', id: 'life-ordain', think: '一次尋父的旅程，意外改變了一生的方向。你的人生有過這樣的轉角嗎？' },
  { y: '1947', t: '焦山佛學院畢業', id: 'life-study', think: '受完整傳統教育的年輕人，為什麼反而想改革？' },
  { y: '1949', t: '渡海來台', id: 'life-taiwan', think: '到一個陌生的地方，什麼都沒有，你會先做什麼？' },
  { y: '1953', t: '宜蘭弘法', id: 'life-yilan', think: '用歌聲接引青年。如果要讓同學認識一個好觀念，你會用什麼方式？' },
  { y: '1967', t: '開創佛光山', id: 'life-fgs', think: '四大宗旨把「理念」變成可以長久運作的「事業」。' },
  { y: '1990', t: '興辦大學', id: 'life-edu', think: '自己沒進過正規學校，後來辦了五所大學。' },
  { y: '1992', t: '國際佛光會成立', id: 'life-world', think: '「佛光普照三千界，法水長流五大洲」是一個怎樣的願？' },
  { y: '1998', t: '倡導三好運動', id: 'sh-1998', think: '做好事、說好話、存好心，為什麼要變成一個「運動」？' },
  { y: '2000', t: '創辦《人間福報》', id: 'life-culture', think: '以文化弘揚佛法：文字、報紙、電視都是方法。' },
  { y: '2023', t: '圓寂', id: 'life-end', think: '「問我一生何所求，平安幸福照五洲」。' },
  { y: '2026', t: '百歲誕辰', id: 'life-2026', think: '今年，也是你走進這座島的一年。' },
];

export function mount(el, spot, ctx) {
  let cur = 0;
  el.innerHTML = `
    <div class="tl">
      <p class="exp-hint">點時間軸上的節點。全部走過，就完成生命長廊。</p>
      <div class="tl-track" role="tablist" aria-label="生命時間軸">
        ${NODES.map((n, i) => `<button type="button" role="tab" class="tl-node" data-i="${i}"><span class="tl-dot"></span><b>${esc(n.y)}</b><small>${esc(n.t)}</small></button>`).join('')}
      </div>
      <article class="tl-detail" aria-live="polite"></article>
      <div class="tl-nav"><button type="button" class="btn btn-quiet tl-prev">← 前一段</button><span class="tl-count"></span><button type="button" class="btn btn-quiet tl-next">下一段 →</button></div>
      <div class="exp-done" hidden></div>
    </div>`;
  const detail = el.querySelector('.tl-detail');
  const show = (i) => {
    cur = Math.max(0, Math.min(NODES.length - 1, i));
    const n = NODES[cur], k = kb(n.id);
    state.seeNode(cur);
    detail.innerHTML = `
      <p class="tl-year">${esc(n.y)}</p>
      <h3>${esc(n.t)}</h3>
      <p>${esc(k.text)}</p>
      <p class="tl-think"><span>想一想</span>${esc(n.think)}</p>
      <div class="tl-src">出處：${k.src.map((s) => `<a href="${esc(SOURCES[s].u)}" target="_blank" rel="noopener">${esc(SOURCES[s].t)}</a>`).join('、')}</div>
      <button type="button" class="btn btn-ghost btn-sm tl-ask"><span class="ai-dot"></span>請 AI 多介紹這一段</button>`;
    detail.querySelector('.tl-ask').addEventListener('click', () => ctx.openChat(`請介紹星雲大師「${n.t}」這段經歷（${n.y}）。`, 'knowledge'));
    const seen = state.get().timeline;
    el.querySelectorAll('.tl-node').forEach((b, j) => { b.classList.toggle('is-seen', seen.includes(j)); b.setAttribute('aria-selected', String(j === cur)); });
    el.querySelector(`.tl-node[data-i="${cur}"]`).scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' });
    el.querySelector('.tl-count').textContent = `${cur + 1} / ${NODES.length}`;
    el.querySelector('.tl-prev').disabled = cur === 0;
    el.querySelector('.tl-next').disabled = cur === NODES.length - 1;
    if (seen.length >= NODES.length) {
      if (!state.isDone(spot.id)) ctx.complete(spot.id);
      const d = el.querySelector('.exp-done');
      d.hidden = false;
      d.innerHTML = '<b>✦ 完成生命長廊</b><span>從一個清貧的孩子，到遍布五大洲的人間佛教事業。下一站，到碑林把這一生排回順序。</span>';
    }
  };
  el.querySelectorAll('.tl-node').forEach((b) => b.addEventListener('click', () => show(Number(b.dataset.i))));
  el.querySelector('.tl-prev').addEventListener('click', () => show(cur - 1));
  el.querySelector('.tl-next').addEventListener('click', () => show(cur + 1));
  const seen = state.get().timeline;
  show(seen.length && seen.length < NODES.length ? Math.min(NODES.length - 1, Math.max(...seen) + 1) : 0);
}
