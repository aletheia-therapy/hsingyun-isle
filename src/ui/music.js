/**
 * 背景音樂：一打開首頁就循環播放。
 * 瀏覽器規定「使用者互動前不能自動播放有聲音的媒體」，所以：
 *   1. 先直接嘗試播放（有些瀏覽器允許）；
 *   2. 被擋下時，載入畫面會出現「點一下，進入星雲之島」，第一次點擊就開始播放；
 *   3. 之後任何一次點擊、放開手指或按鍵也都會再試一次。
 * 注意：手機上「手指按下」那一刻不算互動（放開才算），所以 pointerup、touchend、click 都要聽。
 */
const KEY = 'hsingyun-isle:music';
const audio = new Audio('assets/bgm.mp3');
audio.loop = true;
audio.preload = 'auto';
audio.volume = 0.38;
let on = true;
try { on = localStorage.getItem(KEY) !== 'off'; } catch { /* 預設開啟 */ }
const subs = new Set();
const notify = () => subs.forEach((f) => f(on));

/** 嘗試播放：回傳 Promise<boolean>，true 代表正在播放 */
function tryPlay() {
  if (!on) return Promise.resolve(false);
  let p;
  try { p = audio.play(); } catch { return Promise.resolve(false); }
  return Promise.resolve(p).then(() => { unbind(); return true; }).catch(() => false);
}
const kick = () => { tryPlay(); };
const EVTS = ['pointerdown', 'pointerup', 'touchend', 'click', 'keydown'];
const bind = () => EVTS.forEach((e) => addEventListener(e, kick, true));
const unbind = () => EVTS.forEach((e) => removeEventListener(e, kick, true));
bind();

export const music = {
  get on() { return on; },
  get playing() { return !audio.paused; },
  start: tryPlay,
  set(v) {
    on = v;
    try { localStorage.setItem(KEY, v ? 'on' : 'off'); } catch { /* 忽略 */ }
    if (v) tryPlay().then((ok) => { if (!ok) bind(); }); else audio.pause();
    notify();
  },
  onChange(f) { subs.add(f); return () => subs.delete(f); },
};
// 分頁切到背景時暫停，回來再繼續
document.addEventListener('visibilitychange', () => { if (document.hidden) audio.pause(); else if (on) audio.play().catch(() => {}); });
