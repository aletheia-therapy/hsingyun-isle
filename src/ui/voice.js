/**
 * 語音導讀：使用瀏覽器內建的中文語音（Web Speech API），不需另外錄音或上傳。
 * 不同角色用不同的音高與語速；使用者可以整體開關。
 */
const KEY = 'hsingyun-isle:voice';
const synth = typeof window !== 'undefined' && 'speechSynthesis' in window ? window.speechSynthesis : null;
let on = true;
try { on = localStorage.getItem(KEY) !== 'off'; } catch { /* 預設開啟 */ }
const subs = new Set();
let voices = [];
const loadVoices = () => { voices = synth?.getVoices() || []; };
if (synth) { loadVoices(); synth.addEventListener?.('voiceschanged', loadVoices); }

const ROLES = {
  narrator: { pitch: 1.0, rate: 0.98 },
  guide: { pitch: 1.12, rate: 1.0 },
  elder: { pitch: 0.85, rate: 0.88 },
  student: { pitch: 1.18, rate: 1.04 },
  ai: { pitch: 1.0, rate: 1.02 },
};

function pickVoice() {
  return voices.find((v) => /zh[-_]TW/i.test(v.lang)) || voices.find((v) => /zh[-_](HK|Hant)/i.test(v.lang)) || voices.find((v) => /^zh/i.test(v.lang)) || null;
}

export const voice = {
  get supported() { return !!synth; },
  get on() { return on && !!synth; },
  set(v) {
    on = v;
    try { localStorage.setItem(KEY, v ? 'on' : 'off'); } catch { /* 忽略 */ }
    if (!v) this.stop();
    subs.forEach((f) => f(on));
  },
  onChange(f) { subs.add(f); return () => subs.delete(f); },
  /** 朗讀一段或多段文字；回傳結束時 resolve 的 Promise */
  say(text, role = 'narrator', { force = false } = {}) {
    if (!synth || (!on && !force)) return Promise.resolve();
    const clean = String(text || '').replace(/\[(\d+)\]/g, '').replace(/[「」『』]/g, '').trim();
    if (!clean) return Promise.resolve();
    synth.cancel();
    return new Promise((resolve) => {
      // 長文分段，避免部分瀏覽器朗讀到一半中斷
      const parts = clean.match(/[^。！？\n]+[。！？]?/g) || [clean];
      let i = 0;
      const next = () => {
        if (i >= parts.length) { resolve(); return; }
        const u = new SpeechSynthesisUtterance(parts[i++]);
        const v = pickVoice(); if (v) u.voice = v;
        u.lang = v?.lang || 'zh-TW';
        const r = ROLES[role] || ROLES.narrator;
        u.pitch = r.pitch; u.rate = r.rate;
        u.onend = next; u.onerror = () => resolve();
        synth.speak(u);
      };
      next();
    });
  },
  stop() { synth?.cancel(); },
  get speaking() { return !!synth?.speaking; },
};

/** 在一段文字旁放一個「朗讀」小按鈕 */
export function speakButton(getText, role = 'narrator', label = '朗讀') {
  if (!synth) return null;
  const b = document.createElement('button');
  b.type = 'button'; b.className = 'speak-btn'; b.setAttribute('aria-label', label);
  b.innerHTML = `<span class="speak-ico" aria-hidden="true"></span>${label}`;
  b.addEventListener('click', () => {
    if (b.classList.contains('is-on')) { voice.stop(); b.classList.remove('is-on'); return; }
    document.querySelectorAll('.speak-btn.is-on').forEach((x) => x.classList.remove('is-on'));
    b.classList.add('is-on');
    voice.say(getText(), role, { force: true }).then(() => b.classList.remove('is-on'));
  });
  return b;
}
