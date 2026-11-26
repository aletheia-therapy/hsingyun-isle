/**
 * 三好四給島 AI 後端（Vercel Serverless Function）
 * POST /api/ai  { kind: 'chat'|'task'|'reflect'|'vow', ... }
 *
 * 環境變數：
 *   ANTHROPIC_API_KEY  （建議）Claude API 金鑰
 *   AI_MODEL           選用，預設 claude-haiku-5-5
 *   OPENAI_API_KEY     選用；未設定 Anthropic 金鑰時改用 OpenAI
 *   OPENAI_MODEL       選用，預設 gpt-4o-mini
 *   AI_DAILY_CAP       選用，全站每日請求上限（預設 150）
 * 金鑰只存在伺服器端，前端程式碼不含任何金鑰。
 */
import { buildPrompt } from '../src/ai/prompts.js';
import { cite } from '../src/ai/retrieve.js';

const KINDS = new Set(['chat', 'task', 'reflect', 'vow']);
const hits = new Map();       // ip -> [timestamps]（單一實例內的基本限流）
let day = '', dayCount = 0;

function limited(ip) {
  const now = Date.now();
  const arr = (hits.get(ip) || []).filter((t) => now - t < 60_000);
  arr.push(now); hits.set(ip, arr);
  if (hits.size > 5000) hits.clear();
  const d = new Date().toISOString().slice(0, 10);
  if (d !== day) { day = d; dayCount = 0; }
  dayCount++;
  return arr.length > 12 || dayCount > Number(process.env.AI_DAILY_CAP || 150);
}

async function callAnthropic({ system, messages, maxTokens }) {
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model: process.env.AI_MODEL || 'claude-haiku-5-5', max_tokens: Math.max(maxTokens * 4, 2400), system, messages }),
  });
  const j = await r.json();
  if (!r.ok) throw new Error(j?.error?.message || `anthropic ${r.status}`);
  const t = (j.content || []).filter((c) => c.type === 'text').map((c) => c.text).join('').trim();
  if (!t) throw new Error(`empty reply stop=${j.stop_reason} types=${(j.content || []).map((c) => c.type).join(',')} model=${j.model}`);
  return t;
}

async function callOpenAI({ system, messages, maxTokens }) {
  const r = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
    body: JSON.stringify({ model: process.env.OPENAI_MODEL || 'gpt-4o-mini', max_tokens: maxTokens, temperature: 0.4, messages: [{ role: 'system', content: system }, ...messages] }),
  });
  const j = await r.json();
  if (!r.ok) throw new Error(j?.error?.message || `openai ${r.status}`);
  return (j.choices?.[0]?.message?.content || '').trim();
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'GET') {
    return res.status(200).json({ ok: true, ai: !!(process.env.ANTHROPIC_API_KEY || process.env.OPENAI_API_KEY) });
  }
  if (req.method !== 'POST') return res.status(405).json({ error: 'method not allowed' });

  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = null; } }
  if (!body || !KINDS.has(body.kind)) return res.status(400).json({ error: '請求格式不正確。' });
  if (JSON.stringify(body).length > 8000) return res.status(400).json({ error: '內容太長了，請精簡後再試。' });
  if (body.kind === 'chat' && !String(body.question || '').trim()) return res.status(400).json({ error: '請先輸入問題。' });
  if (body.kind === 'reflect' && !String(body.text || '').trim()) return res.status(400).json({ error: '請先寫下你的句子。' });

  const ip = String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'x').split(',')[0].trim();
  if (limited(ip)) return res.status(429).json({ error: '提問有點頻繁，請稍等一分鐘再試。' });

  if (!process.env.ANTHROPIC_API_KEY && !process.env.OPENAI_API_KEY) {
    return res.status(503).json({ error: 'AI 服務尚未設定。' });
  }

  let prompt;
  try { prompt = buildPrompt(body.kind, body); } catch (e) { return res.status(400).json({ error: '請求內容不正確。' }); }

  const t0 = Date.now();
  try {
    const text = process.env.ANTHROPIC_API_KEY ? await callAnthropic(prompt) : await callOpenAI(prompt);
    // 基本互動紀錄（匿名；不記錄 IP）
    console.log(JSON.stringify({ at: new Date().toISOString(), kind: body.kind, mode: body.mode || null, q: String(body.question || body.text || body.taskId || '').slice(0, 120), passages: prompt.passages.map((p) => p.id), ms: Date.now() - t0, outLen: text.length }));
    return res.status(200).json({ text, sources: cite(prompt.passages) });
  } catch (e) {
    console.error('ai error', e.message);
    return res.status(502).json({ error: 'AI 服務暫時沒有回應。' });
  }
}
