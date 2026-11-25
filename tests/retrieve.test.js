import { retrieve } from '../src/ai/retrieve.js';
import { buildPrompt } from '../src/ai/prompts.js';
const qs = ['什麼是人間佛教？', '星雲大師為什麼提倡三好四給？', '人間佛教和傳統佛教有什麼不同？', '如何在學校實踐說好話？', '面對挫折時，可以如何運用正向思考？', '如何把佛法落實在工作及家庭生活？', '大師幾歲出家？', '大師什麼時候來台灣？', '佛光山哪一年開山？', '大師喜歡吃什麼？'];
for (const q of qs) console.log(q, '→', retrieve(q, { k: 4 }).map((p) => `${p.id}(${p.score})`).join(' '));
for (const k of ['chat', 'task', 'reflect', 'vow']) {
  const p = buildPrompt(k, { question: '什麼是三好', mode: 'practice', taskId: 'speech', choice: 0, text: '阿哲辛苦了', done: [{ id: 'speech', choice: 0 }] });
  console.log(k, p.system.length, p.messages.length, p.passages.map((x) => x.id).join(','));
}
