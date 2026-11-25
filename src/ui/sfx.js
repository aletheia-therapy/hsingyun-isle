import { music } from './music.js';

/**
 * 煙火的聲音：全部用 Web Audio 即時合成（不使用任何音效檔，沒有版權問題）。
 * 音樂關掉時也不發出音效。
 */
let ctx = null, out = null, noise = null;
function ac() {
  if (!music.on) return null;
  if (!ctx) {
    const C = window.AudioContext || window.webkitAudioContext;
    if (!C) return null;
    ctx = new C();
    out = ctx.createGain(); out.gain.value = 0.45; out.connect(ctx.destination);
    noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = noise.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}
const env = (g, t, peak, attack, decay) => {
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
};

export const sfx = {
  /** 炸開：一聲悶響加上逐漸消散的空氣聲；delay 讓遠處的煙火晚一點聽到（聲音比光慢） */
  boom(strength = 1, delay = 0) {
    const c = ac(); if (!c) return;
    const t = c.currentTime + delay, k = Math.max(0.05, Math.min(1, strength));
    const n = c.createBufferSource(); n.buffer = noise; n.playbackRate.value = 0.55 + Math.random() * 0.3;
    const f = c.createBiquadFilter(); f.type = 'lowpass';
    f.frequency.setValueAtTime(1500, t); f.frequency.exponentialRampToValueAtTime(160, t + 1.3);
    const g = c.createGain(); env(g, t, 0.5 * k, 0.012, 1.6);
    n.connect(f); f.connect(g); g.connect(out); n.start(t, Math.random()); n.stop(t + 1.8);
    const o = c.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(72, t); o.frequency.exponentialRampToValueAtTime(30, t + 0.4);
    const og = c.createGain(); env(og, t, 0.55 * k, 0.01, 0.45);
    o.connect(og); og.connect(out); o.start(t); o.stop(t + 0.5);
  },
  /** 升空：細細的「咻」聲 */
  whoosh(delay = 0) {
    const c = ac(); if (!c) return;
    const t = c.currentTime + delay;
    const n = c.createBufferSource(); n.buffer = noise;
    const f = c.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 6;
    f.frequency.setValueAtTime(500, t); f.frequency.exponentialRampToValueAtTime(2400, t + 1.1);
    const g = c.createGain(); env(g, t, 0.06, 0.25, 0.9);
    n.connect(f); f.connect(g); g.connect(out); n.start(t, Math.random()); n.stop(t + 1.3);
  },
  /** 垂柳與銀星的劈啪聲 */
  crackle(delay = 0, dur = 1.2, strength = 1) {
    const c = ac(); if (!c) return;
    const t0 = c.currentTime + delay;
    for (let i = 0; i < 26; i++) {
      const t = t0 + Math.random() * dur;
      const n = c.createBufferSource(); n.buffer = noise;
      const f = c.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 2500;
      const g = c.createGain(); env(g, t, 0.05 * strength * (0.4 + Math.random() * 0.6), 0.002, 0.04);
      n.connect(f); f.connect(g); g.connect(out); n.start(t, Math.random() * 1.5); n.stop(t + 0.06);
    }
  },
};
