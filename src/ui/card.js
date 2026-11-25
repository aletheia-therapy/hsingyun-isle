import { SOURCES } from '../data/sources.js';
import { ZONES } from '../data/spots.js';
import { esc } from './chat.js';
import * as origin from '../exp/origin.js';
import * as station from '../exp/station.js';
import * as videos from '../exp/videos.js';
import * as lecture from '../exp/lecture.js';
import * as vow from '../exp/vow.js';

const EXPS = { origin, station, videos, lecture, vow };

/** 抵達地點時打開的內容面板 */
export class Card {
  constructor(el, { onClose, onNext, ctx }) {
    this.el = el; this.onClose = onClose; this.onNext = onNext; this.ctx = ctx;
    this.cleanup = null; this.spot = null;
  }

  get open() { return !this.el.hidden; }

  show(spot, next) {
    this.cleanup?.();
    this.spot = spot;
    const z = ZONES.find((x) => x.id === spot.zone);
    const sources = (spot.sources || []).map((k) => SOURCES[k]).filter(Boolean)
      .map((s) => `<li><a href="${esc(s.u)}" target="_blank" rel="noopener">${esc(s.t)}</a></li>`).join('');
    this.el.className = `card z-${spot.zone}${spot.exp === 'lecture' ? ' card-wide' : ''}`;
    this.el.innerHTML = `
      <div class="c-scroll">
        <header class="c-head">
          <span class="zone-tag" style="--zc:${z.color}">${z.no}・${esc(z.name)}</span>
          <span class="c-place">${esc(spot.place)}</span>
          <button type="button" class="icon-btn c-close" aria-label="關閉">×</button>
        </header>
        ${spot.exp === 'station' ? '' : `<h2 class="c-title">${esc(spot.title)}</h2>${spot.lede ? `<p class="c-lede">${esc(spot.lede)}</p>` : ''}`}
        <div class="c-exp"></div>
        ${sources ? `<details class="c-src"><summary>內容依據（${spot.sources.length}）</summary><ul>${sources}</ul><p class="c-src-note">島上文字由作者依上列公開資料整理改寫；以「」標示者為原文用語。</p></details>` : ''}
      </div>
      <footer class="c-foot">
        <button type="button" class="btn btn-quiet c-done">回到島上（Esc）</button>
      </footer>`;
    this.el.querySelector('.c-close').addEventListener('click', () => this.onClose());
    this.el.querySelector('.c-done').addEventListener('click', () => this.onClose());
    const exp = EXPS[spot.exp];
    if (exp) this.cleanup = exp.mount(this.el.querySelector('.c-exp'), spot, this.ctx) || null;
    this.el.hidden = false;
    document.body.classList.add('card-open');
    this.el.classList.remove('is-in');
    requestAnimationFrame(() => this.el.classList.add('is-in'));
    this.el.querySelector('.c-scroll').scrollTop = 0;
    this.el.querySelector('.c-close').focus({ preventScroll: true });
  }

  /** 完成這一站後，面板底部出現「下一步：……」按鈕（按下就關掉面板，跟著箭頭去下一站） */
  setNext(label) {
    const foot = this.el.querySelector('.c-foot'); if (!foot) return;
    let b = foot.querySelector('.c-next');
    if (!label) { b?.remove(); return; }
    if (!b) {
      b = document.createElement('button'); b.type = 'button'; b.className = 'btn btn-primary c-next';
      b.addEventListener('click', () => this.onNext?.());
      foot.appendChild(b);
    }
    b.innerHTML = `<span>下一步：${esc(label)}</span><span aria-hidden="true">→</span>`;
    b.classList.remove('is-pop'); void b.offsetWidth; b.classList.add('is-pop');
  }

  hide() {
    this.cleanup?.(); this.cleanup = null;
    this.el.hidden = true;
    document.body.classList.remove('card-open');
    this.el.classList.remove('is-in');
    this.spot = null;
  }
}
