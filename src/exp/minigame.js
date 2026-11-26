import { TRIALS } from '../data/games.js';
import { state } from '../state.js';
import { MERIT } from '../data/merit.js';
import { esc } from '../ui/chat.js';

/**
 * 佛法挑戰：每一題都要答對才能前進。答錯會提示原因、可以再選；
 * 每一題答對都會增加福德與智慧（一次就答對，得到的更多，見 data/merit.js）。全部通過後呼叫 onPass。
 */
export function mountTrial(el, taskId, ctx, { passed = false, onPass } = {}) {
  const T = TRIALS[taskId];
  if (!T) { onPass?.(); return; }
  const N = T.rounds.length;
  const award = (key, g, label) => ctx.points?.(state.addMerit(key, g), label);
  const head = `<div class="mg-head"><span class="st-step">佛法挑戰</span><b>${esc(T.title)}</b><small>全部答對才算過關</small></div><p class="exp-hint">${esc(T.hint)}</p>`;
  let r = 0, replay = false;

  const summary = () => {
    el.innerHTML = `${head}<div class="exp-done"><b>✦ 通過「${esc(T.title)}」</b><span>${N} 題全部答對。</span></div>
      <button type="button" class="btn btn-quiet btn-sm mg-again">再挑戰一次</button>`;
    el.querySelector('.mg-again').addEventListener('click', () => { r = 0; replay = true; round(); });
  };

  const next = (box, last) => {
    box.insertAdjacentHTML('beforeend', `<button type="button" class="btn btn-primary btn-sm mg-next">${last ? '完成挑戰' : '下一題'}</button>`);
    box.querySelector('.mg-next').addEventListener('click', () => {
      r++;
      if (r >= N) { if (!replay) onPass?.(); summary(); } else round();
    });
  };

  const round = () => {
    const q = T.rounds[r];
    let miss = 0;
    const done = () => { if (!replay) award(`trial:${taskId}:${r}`, miss ? MERIT.trialRetry : MERIT.trial, miss ? '答對了' : '一次就答對'); };
    if (q.type === 'sort') {
      const placed = new Map();
      let sel = null;
      const draw = () => {
        el.innerHTML = `${head}
          <p class="mg-round">第 ${r + 1} / ${N} 題</p>
          <div class="mg-q">${esc(q.q)}</div>
          <div class="sort-pool">${q.items.map((it, i) => placed.has(i) ? '' : `<button type="button" class="thought${sel === i ? ' is-sel' : ''}" data-i="${i}">${esc(it.t)}</button>`).join('') || '<p class="zz-all">全部放好了！</p>'}</div>
          <div class="sort-bins" style="grid-template-columns: repeat(${Math.min(q.bins.length, 4)}, 1fr)">${q.bins.map((b, bi) => `<div class="bin bin-${bi % 4}" data-b="${bi}" role="button" tabindex="0"><b>${esc(b)}</b>${[...placed.keys()].filter((i) => q.items[i].b === bi).map((i) => `<span>${esc(q.items[i].t)}${q.items[i].hint && q.bins.length === 2 && bi === 1 ? `<em>${esc(q.items[i].hint)}</em>` : ''}</span>`).join('')}</div>`).join('')}</div>
          <div class="qz-why" aria-live="polite"></div>`;
        el.querySelectorAll('.thought').forEach((b) => b.addEventListener('click', () => { sel = Number(b.dataset.i); draw(); }));
        el.querySelectorAll('.bin').forEach((bin) => bin.addEventListener('click', () => {
          const why = el.querySelector('.qz-why');
          if (sel === null) { why.innerHTML = '<p>先點一張卡片，再點要放的格子。</p>'; return; }
          const it = q.items[sel], bi = Number(bin.dataset.b);
          if (it.b === bi) {
            placed.set(sel, true); sel = null; draw();
            if (placed.size === q.items.length) {
              done();
              const box = el.querySelector('.qz-why');
              box.innerHTML = `<p class="mg-ok"><b>✦ 全部正確！</b>${esc(q.why)}</p>`;
              next(box, r === N - 1);
            }
          } else {
            miss++;
            why.innerHTML = `<p class="mg-no">不太對喔。${it.hint ? `提示：${esc(it.hint)}` : '再想想看。'}</p>`;
            bin.classList.add('shake'); setTimeout(() => bin.classList.remove('shake'), 450);
          }
        }));
      };
      draw();
      return;
    }
    el.innerHTML = `${head}
      <p class="mg-round">第 ${r + 1} / ${N} 題</p>
      <div class="mg-q${q.type === 'rewrite' ? ' mg-harsh' : ''}">${q.type === 'rewrite' ? '把這句刺耳的話換成「愛語」：' : ''}${esc(q.q)}</div>
      <div class="opts">${q.a.map((a, i) => `<button type="button" class="opt" data-i="${i}">${esc(a)}</button>`).join('')}</div>
      <div class="qz-why" aria-live="polite"></div>`;
    el.querySelectorAll('.opt').forEach((b) => b.addEventListener('click', () => {
      const i = Number(b.dataset.i), box = el.querySelector('.qz-why');
      if (i !== q.c) {
        miss++;
        b.disabled = true; b.classList.add('is-wrong');
        box.innerHTML = '<p class="mg-no">不太對喔，再想想看哪一個更好。</p>';
        return;
      }
      done();
      el.querySelectorAll('.opt').forEach((o, j) => { o.disabled = true; o.classList.toggle('is-right', j === q.c); });
      box.innerHTML = `<p class="mg-ok"><b>${miss ? '答對了！' : '一次就答對！'}</b>${esc(q.why)}</p>`;
      next(box, r === N - 1);
    }));
  };

  if (passed) summary(); else round();
}
