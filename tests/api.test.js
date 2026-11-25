// 以假的 fetch 模擬 Claude API，驗證 /api/ai 的驗證、限流、組請求與回傳格式
import handler from '../api/ai.js';
let lastBody = null;
globalThis.fetch = async (url, opt) => { lastBody = JSON.parse(opt.body); return { ok: true, json: async () => ({ content: [{ type: 'text', text: '人間佛教就是「佛說的、人要的、淨化的、善美的」[1]。' }] }) }; };
const call = async (body, method = 'POST', ip = '1.1.1.1') => {
  let status = 0, out = null;
  const res = { setHeader() {}, status(s) { status = s; return this; }, json(j) { out = j; return this; } };
  await handler({ method, body, headers: { 'x-forwarded-for': ip }, socket: {} }, res);
  return { status, out };
};
process.env.ANTHROPIC_API_KEY = 'test';
const ok = (c, m) => { if (!c) { console.error('FAIL', m); process.exitCode = 1; } else console.log('ok', m); };
let r = await call(null, 'GET'); ok(r.status === 200 && r.out.ai === true, 'GET health');
r = await call({ kind: 'chat', question: '什麼是人間佛教？', mode: 'understand' });
ok(r.status === 200 && r.out.text.includes('佛說的') && r.out.sources.length > 0, 'chat answer + sources');
ok(lastBody.system.includes('不是星雲大師本人') && lastBody.messages.at(-1).content === '什麼是人間佛教？', 'system rules + question sent');
ok(lastBody.model === 'claude-haiku-5-5', 'default model');
r = await call({ kind: 'task', taskId: 'speech', choice: 1 }); ok(r.status === 200, 'task feedback');
r = await call({ kind: 'task', taskId: 'nope', choice: 1 }); ok(r.status === 400, 'bad task rejected');
r = await call({ kind: 'reflect', taskId: 'joy', text: '' }); ok(r.status === 400, 'empty reflect rejected');
r = await call({ kind: 'vow', done: [{ id: 'deed', choice: 0 }], context: '想和室友好好相處' }); ok(r.status === 200, 'vow');
r = await call({ kind: 'hack' }); ok(r.status === 400, 'unknown kind rejected');
r = await call({ kind: 'chat', question: 'x'.repeat(9000) }); ok(r.status === 400, 'too long rejected');
let last; for (let i = 0; i < 14; i++) last = await call({ kind: 'chat', question: '你好' }, 'POST', '9.9.9.9');
ok(last.status === 429, 'rate limit per IP');
delete process.env.ANTHROPIC_API_KEY;
r = await call({ kind: 'chat', question: '你好' }, 'POST', '2.2.2.2'); ok(r.status === 503, 'no key -> 503');
