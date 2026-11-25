/**
 * 背景音樂：進入首頁就開始循環播放。
 * 瀏覽器規定「使用者互動前不能自動播放有聲音的媒體」，
 * 所以先嘗試直接播放；被擋下時，等使用者第一次點擊或按鍵就立刻開始。
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

function tryPlay() {
  if (!on) return;
  audio.play().then(() => { unbind(); }).catch(() => { /* 等使用者互動 */ });
}
const kick = () => tryPlay();
const EVTS = ['pointerdown', 'keydown', 'touchstart'];
const unbind = () => EVTS.forEach((e) => removeEventListener(e, kick, true));
EVTS.forEach((e) => addEventListener(e, kick, true));

export const music = {
  get on() { return on; },
  start: tryPlay,
  set(v) {
    on = v;
    try { localStorage.setItem(KEY, v ? 'on' : 'off'); } catch { /* 忽略 */ }
    if (v) { audio.play().catch(() => EVTS.forEach((e) => addEventListener(e, kick, true))); } else audio.pause();
    notify();
  },
  onChange(f) { subs.add(f); return () => subs.delete(f); },
};
// 分頁切到背景時暫停，回來再繼續
document.addEventListener('visibilitychange', () => { if (document.hidden) audio.pause(); else if (on) audio.play().catch(() => {}); });
