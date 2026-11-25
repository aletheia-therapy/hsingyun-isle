import { GAMES } from '../data/games.js';
import { state } from '../state.js';
import { esc } from '../ui/chat.js';

/** 島民的小遊戲：pick / rewrite（選一個）與 sort（分類念頭） */
export function mountGame(el, taskId, ctx) {
  const g = GAMES[taskId];
  if (!g) return;
  let r = 0, right = 0;
  const award = (key, n) => { const got = state.addPoints(key, n); if (got) ctx.points?.(got); };
  const head = `<div class="mg-head"><span class="st-step">小遊戲</span><b>${esc(g.title)}</b><small>每答對一題 +10 善念值</small></div><p class="exp-hint">${esc(g.hint)}</p>`;

  if (g.type === 'sort') {
    const left = g.items.map((x, i) => i);
    const placed = new Map();
    const render = () => {
      el.innerHTML = `${head}
        <div class="sort-pool">${left.filter((i) => !placed.has(i)).map((i) => `<button type="button" class="thought" data-i="${i}">${esc(g.items[i].t)}</button>`).join('') || '<p class="zz-all">全部放好了！</p>'}</div>
        <div class="sort-bins">
          <div class="bin bin-good" data-good="1"><b>好心念</b>${[...placed].filter(([, v]) => v.good).map(([i]) => `<span>${esc(g.items[i].t)}</span>`).join('')}</div>
          <div class="bin bin-turn" data-good="0"><b>需要轉念</b>${[...placed].filter(([, v]) => !v.good).map(([i]) => `<span>${esc(g.items[i].t)}<em>轉念：${esc(g.items[i].turn)}</em></span>`).join('')}</div>
        </div>
        <p class="mt-msg" aria-live="polite"></p>`;
      let sel = null;
      el.querySelectorAll('.thought').forEach((b) => b.addEventListener('click', () => { el.querySelectorAll('.thought').forEach((x) => x.classList.remove('is-sel')); b.classList.add('is-sel'); sel = Number(b.dataset.i); }));
      el.querySelectorAll('.bin').forEach((bin) => bin.addEventListener('click', () => {
        const msg = el.querySelector('.mt-msg');
        if (sel === null) { msg.textContent = '先點一個念頭，再點要放的地方。'; return; }
        const it = g.items[sel], good = bin.dataset.good === '1';
        if (it.good === good) { placed.set(sel, { good }); award(`mg:${taskId}:${sel}`, 10); render(); if (placed.size === g.items.length) el.querySelector('.mt-msg').innerHTML = '<b>✦ 心湖清澈了。</b>覺察念頭、轉一個方向，就是存好心的修行。'; }
        else { msg.textContent = good ? '這個念頭可能會讓自己或別人受傷，再想想？' : '這其實是一個善良的念頭喔！'; bin.classList.add('shake'); setTimeout(() => bin.classList.remove('shake'), 450); }
      }));
    };
    render();
    return;
  }

  const render = () => {
    if (r >= g.rounds.length) {
      el.innerHTML = `${head}<div class="exp-done"><b>✦ ${esc(g.title)}：答對 ${right} / ${g.rounds.length}</b><span>${right === g.rounds.length ? '全對！你已經很會了。' : '沒關係，生活裡多練習幾次就會了。'}</span></div>
        <button type="button" class="btn btn-quiet btn-sm mg-again">再玩一次</button>`;
      el.querySelector('.mg-again').addEventListener('click', () => { r = 0; right = 0; render(); });
      return;
    }
    const q = g.rounds[r];
    el.innerHTML = `${head}
      <p class="mg-round">第 ${r + 1} / ${g.rounds.length} 題</p>
      <div class="mg-q${g.type === 'rewrite' ? ' mg-harsh' : ''}">${esc(q.q)}</div>
      <div class="opts">${q.a.map((a, i) => `<button type="button" class="opt" data-i="${i}">${esc(a)}</button>`).join('')}</div>
      <div class="qz-why"></div>`;
    el.querySelectorAll('.opt').forEach((b) => b.addEventListener('click', () => {
      const i = Number(b.dataset.i), ok = i === q.c;
      if (ok) { right++; award(`mg:${taskId}:${r}`, 10); }
      el.querySelectorAll('.opt').forEach((o, j) => { o.disabled = true; o.classList.toggle('is-right', j === q.c); o.classList.toggle('is-wrong', j === i && !ok); });
      el.querySelector('.qz-why').innerHTML = `<p>${ok ? '答對了！' : '再想想：'}${esc(q.why)}</p><button type="button" class="btn btn-primary btn-sm">${r < g.rounds.length - 1 ? '下一題' : '看結果'}</button>`;
      el.querySelector('.qz-why button').addEventListener('click', () => { r++; render(); });
    }));
  };
  render();
}
