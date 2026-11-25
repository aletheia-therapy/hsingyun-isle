import { KB } from '../data/kb.js';
import { esc } from '../ui/chat.js';
import { state } from '../state.js';

/** 四宗旨苑：把生活中的事情放進它所屬的院落 */
const HALLS = [
  { id: 'culture', name: '文化', full: '以文化弘揚佛法', color: '#b8863b', kb: 'hb-culture' },
  { id: 'edu', name: '教育', full: '以教育培養人才', color: '#4f8a83', kb: 'hb-edu' },
  { id: 'charity', name: '慈善', full: '以慈善福利社會', color: '#c4724f', kb: 'hb-charity' },
  { id: 'gongxiu', name: '共修', full: '以共修淨化人心', color: '#5a6fa6', kb: 'hb-gongxiu' },
];
const ITEMS = [
  { t: '創辦一份每天發行的報紙', h: 'culture' },
  { t: '開一間美術館，用藝術接引大眾', h: 'culture' },
  { t: '興辦大學與佛學院', h: 'edu' },
  { t: '用一筆字義賣成立教育基金', h: 'edu' },
  { t: '把醫師和藥品送到偏遠地區義診', h: 'charity' },
  { t: '照顧孤兒與無依長者', h: 'charity' },
  { t: '大家一起參加讀書會與法會', h: 'gongxiu' },
  { t: '和同學組一個每週靜坐小組', h: 'gongxiu' },
];

export function mount(el, spot, ctx) {
  const placed = new Map();
  let sel = null, mistakes = 0;
  const render = () => {
    const left = ITEMS.map((x, i) => ({ ...x, i })).filter((x) => !placed.has(x.i));
    el.innerHTML = `
      <div class="zz">
        <p class="exp-hint">先點一張卡片，再點它所屬的院落。${left.length ? `還剩 ${left.length} 張。` : ''}</p>
        <div class="zz-items">${left.map((x) => `<button type="button" class="zz-card${sel === x.i ? ' is-sel' : ''}" data-i="${x.i}">${esc(x.t)}</button>`).join('') || '<p class="zz-all">全部歸位了！</p>'}</div>
        <div class="zz-halls">${HALLS.map((h) => `
          <button type="button" class="zz-hall" data-h="${h.id}" style="--hc:${h.color}">
            <b>${h.name}</b><small>${h.full}</small>
            <span class="zz-in">${[...placed].filter(([, v]) => v === h.id).map(([i]) => `<i>${esc(ITEMS[i].t)}</i>`).join('')}</span>
          </button>`).join('')}</div>
        <p class="zz-msg" aria-live="polite"></p>
        <section class="zz-learn" ${left.length ? 'hidden' : ''}>
          <h3>四大宗旨，四條走進社會的路</h3>
          ${HALLS.map((h) => `<details><summary style="--hc:${h.color}">${h.full}</summary><p>${esc(KB.find((k) => k.id === h.kb).text)}</p></details>`).join('')}
          <button type="button" class="btn btn-ghost btn-sm zz-ask"><span class="ai-dot"></span>問 AI：為什麼說「佛教就是教育」？</button>
        </section>
      </div>`;
    el.querySelectorAll('.zz-card').forEach((b) => b.addEventListener('click', () => { sel = Number(b.dataset.i); render(); }));
    el.querySelectorAll('.zz-hall').forEach((b) => b.addEventListener('click', () => {
      if (sel === null) { el.querySelector('.zz-msg').textContent = '先選一張卡片喔。'; return; }
      const item = ITEMS[sel];
      if (item.h === b.dataset.h) {
        placed.set(sel, item.h); sel = null; render();
        if (placed.size === ITEMS.length) {
          el.querySelector('.zz-msg').innerHTML = `<b>✦ 全部歸位${mistakes ? `（調整了 ${mistakes} 次）` : '，一次全對'}！</b>這些都是佛光山實際在做的事。1967 年開山時立下的四大宗旨，讓人間佛教不只是理念，而是可以長久運作的事業。`;
          if (!state.isDone(spot.id)) ctx.complete(spot.id);
        }
      } else {
        mistakes++;
        const h = HALLS.find((x) => x.id === b.dataset.h);
        el.querySelector('.zz-msg').textContent = `「${item.t}」比較不屬於「${h.full}」，再想想看。`;
        b.classList.add('shake'); setTimeout(() => b.classList.remove('shake'), 500);
      }
    }));
    el.querySelector('.zz-ask')?.addEventListener('click', () => ctx.openChat('為什麼說「佛教就是教育」？', 'understand'));
  };
  if (state.isDone(spot.id)) ITEMS.forEach((x, i) => placed.set(i, x.h));
  render();
}
