import { buildPrompt, flatten } from './prompts.js';
import { cite } from './retrieve.js';

/**
 * AI 呼叫的三層路徑：
 *  1. 正式部署：後端 /api/ai（金鑰只存在伺服器環境變數）
 *  2. claude.ai 預覽：平台提供的內建 Claude（window.claude.use('sample')）
 *  3. 都不可用：回傳 offline，介面會清楚標示「AI 暫時無法連線」並只顯示知識庫原文
 * 絕不把固定文字偽裝成 AI 回答。
 */
let serverDown = /(^|\.)claude(usercontent)?\.(ai|com)$/.test(location.hostname) || location.protocol === 'file:';
let samplePromise = null;

function getSample() {
  if (!samplePromise) {
    samplePromise = (async () => {
      const use = window.claude?.use;
      if (typeof use !== 'function') return null;
      try { return await Promise.race([use('sample'), new Promise((r) => setTimeout(() => r(null), 12000))]); } catch { return null; }
    })();
  }
  return samplePromise;
}
// 預覽環境：提早向平台要內建 Claude，避免第一次提問時才等待
if (window.claude?.use) getSample();

export class AIError extends Error {
  constructor(msg, code) { super(msg); this.code = code; }
}

/**
 * @param {'chat'|'task'|'reflect'|'vow'} kind
 * @returns {Promise<{ text: string|null, sources: object[], via: 'server'|'claude'|'offline' }>}
 */
export async function ask(kind, body, { onText } = {}) {
  // 1. 後端
  if (!serverDown) {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 45000);
    try {
      const res = await fetch('/api/ai', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind, ...body }), signal: ctl.signal,
      });
      const type = res.headers.get('content-type') || '';
      if (res.status === 429) throw new AIError('提問有點頻繁，請稍等一分鐘再試。', 'rate');
      if (type.includes('application/json')) {
        const data = await res.json();
        if (res.ok && data.text) return { text: data.text, sources: data.sources || [], via: 'server' };
        if (res.status === 400) throw new AIError(data.error || '問題格式不正確。', 'bad');
      }
      if (res.status === 404 || res.status === 503 || !type.includes('application/json')) serverDown = true;   // 沒有後端或尚未設定金鑰
    } catch (e) {
      if (e instanceof AIError) throw e;
    } finally { clearTimeout(timer); }
  }

  // 2. 平台內建 Claude（預覽環境）
  const p = buildPrompt(kind, body);
  const sources = cite(p.passages);
  const sample = await getSample();
  if (sample) {
    try {
      const r = await sample(flatten(p), {
        modelTier: 'default', cache: false,
        onText: onText ? ({ text }) => onText(text) : undefined,
      });
      if (r?.text) return { text: r.text.trim(), sources, via: 'claude' };
    } catch (e) {
      if (e?.code === 'rate_limited') throw new AIError('提問有點頻繁，請稍等一分鐘再試。', 'rate');
    }
  }

  // 3. 離線：不產生假回答
  return { text: null, sources, via: 'offline' };
}

export const aiAvailable = async () => !serverDown || !!(await getSample());
