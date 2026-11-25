import { retrieve } from './retrieve.js';
import { TASKS } from '../data/tasks.js';

/**
 * 依請求種類組出「系統規則＋檢索資料＋使用者內容」。前端與後端共用，
 * 後端一律自行重新檢索，不採信前端送來的資料段落。
 */
export const MODES = {
  knowledge: { label: '知識導覽', hint: '問大師的生平、佛光山與人間佛教的史實' },
  understand: { label: '思想理解', hint: '把較抽象的觀念說得更清楚' },
  practice: { label: '生活實踐', hint: '把生活裡的情境拿來，一起想三好四給可以怎麼做' },
};

const RULES = `你是《星雲之島》數位學習平台上的「AI 學習助理」，協助使用者認識星雲大師、人間佛教與三好四給。
必須遵守：
1. 你是人工智慧助理，不是星雲大師本人。絕對不要用大師的口吻或第一人稱說話，不要寫「我（大師）認為」「師父說」之類的句子。
2. 關於大師的生平、年份、事蹟、言論與佛光山的史實，只能根據下方【資料】回答。資料沒有的，直接說「這一點在島上的資料裡找不到可靠依據，我無法確認」，並建議查閱佛光山或《星雲大師全集》等正式出版品。不要猜測、不要補充記憶中的細節。
3. 不可捏造語錄。只有【資料】中以「」標示的文字可以當作引文原樣引用；其他內容請用自己的話轉述，不要加引號。
4. 引用資料時，在句尾標上對應編號，例如 [1]、[2]。
5. 不提供資料以外的教義詮釋，也不評論其他宗教或宗派的是非。
6. 生活實踐的部分，可以依據三好四給提出具體、溫和的建議，並清楚表示這是「建議」，不是大師的話。
7. 不做心理或醫療診斷，不替使用者下人格判斷。若使用者提到想傷害自己或他人、或處於危機，請溫和地建議立即聯絡身邊信任的人，或撥打台灣安心專線 1925、生命線 1995。
8. 使用台灣慣用的繁體中文，語氣溫暖、清楚、適合一般大眾與大學生。純文字，不用 Markdown 標題或粗體；可以分段或用「・」條列。`;

const fmt = (ps) => ps.length
  ? ps.map((p, i) => `[${i + 1}] ${p.title}：${p.text}`).join('\n')
  : '（沒有找到相關資料）';

const clip = (s, n) => String(s || '').replace(/\s+/g, ' ').trim().slice(0, n);

/**
 * @returns {{ system: string, messages: {role:string,content:string}[], passages: object[], maxTokens: number }}
 */
export function buildPrompt(kind, body = {}) {
  if (kind === 'chat') {
    const mode = MODES[body.mode] ? body.mode : 'knowledge';
    const question = clip(body.question, 400);
    const history = (Array.isArray(body.history) ? body.history : []).slice(-6)
      .filter((m) => m && (m.role === 'user' || m.role === 'assistant'))
      .map((m) => ({ role: m.role, content: clip(m.content, 600) }));
    const recent = history.filter((m) => m.role === 'user').slice(-1).map((m) => m.content).join(' ');
    const passages = retrieve(`${question} ${recent}`, { k: mode === 'practice' ? 4 : 5, zone: body.zone });
    const modeRule = {
      knowledge: '本次模式：知識導覽。以史實為主，簡潔回答，控制在 200 字內。',
      understand: '本次模式：思想理解。先用一句白話說明核心意思，再舉一個生活化的例子幫助理解，控制在 250 字內。例子要標明是舉例。',
      practice: '本次模式：生活實踐。先回應使用者的處境與感受，再依三好四給給出 2 到 3 個具體可做的小建議（標明是建議），最後可以附上一個相關的觀念來源。控制在 260 字內。',
    }[mode];
    const where = body.zoneName ? `使用者目前在島上的「${clip(body.zoneName, 20)}」。` : '';
    return {
      system: `${RULES}\n\n${modeRule}${where}\n\n【資料】\n${fmt(passages)}`,
      messages: [...history, { role: 'user', content: question }],
      passages,
      maxTokens: 700,
    };
  }

  if (kind === 'task') {
    const task = TASKS.find((t) => t.id === body.taskId);
    if (!task) throw new Error('unknown task');
    const pick = task.options[Number(body.choice)];
    if (!pick) throw new Error('bad choice');
    const passages = retrieve(`${task.virtue} ${task.scene}`, { k: 3, must: task.kb });
    const user = `情境（${task.group}・${task.virtue}）：${task.scene}
題目：${task.q}
選項：
${task.options.map((o, i) => `${'ABC'[i]}. ${o.t}`).join('\n')}
使用者選了：${'ABC'[Number(body.choice)]}. ${pick.t}

請針對這個選擇做回饋：
・不要只說對錯，說明這個選擇對情境中的人可能帶來什麼感受與影響。
・連結到「${task.virtue}」的精神，必要時引用資料編號。
・如果有更好的做法，用鼓勵的方式提一個具體的調整。
・120 到 170 字，語氣溫暖，直接對使用者說話（用「你」）。`;
    return { system: `${RULES}\n\n【資料】\n${fmt(passages)}`, messages: [{ role: 'user', content: user }], passages, maxTokens: 500 };
  }

  if (kind === 'reflect') {
    const task = TASKS.find((t) => t.id === body.taskId);
    if (!task) throw new Error('unknown task');
    const text = clip(body.text, 300);
    const passages = retrieve(`${task.virtue} ${text}`, { k: 3, must: task.kb.slice(0, 2) });
    const user = `練習主題：${task.virtue}（${task.group}）
情境：${task.scene}
練習題：${task.reflect}
使用者寫的是：「${text}」

請給這段練習一個溫暖、具體的回饋：
・先指出寫得好的地方（具體到用字或做法）。
・如果有可以更好的地方，給一個修改後的示範句或做法（標明「可以試試」）。
・最後一句鼓勵他在生活中真的做做看。
・100 到 150 字。若內容與練習無關或不適當，溫和地引導回練習主題。`;
    return { system: `${RULES}\n\n【資料】\n${fmt(passages)}`, messages: [{ role: 'user', content: user }], passages, maxTokens: 450 };
  }

  if (kind === 'vow') {
    const done = (Array.isArray(body.done) ? body.done : []).map((d) => {
      const t = TASKS.find((x) => x.id === d.id);
      return t ? `${t.virtue}：選了「${clip(t.options[d.choice]?.t, 60)}」` : null;
    }).filter(Boolean);
    const ctx = clip(body.context, 200);
    const passages = retrieve(`三好 四給 ${done.join(' ')} ${ctx}`, { k: 3, must: ['sh-what', 'sg-what'] });
    const user = `使用者在島上完成了這些情境任務：
${done.length ? done.join('\n') : '（還沒有完成任務）'}
${ctx ? `使用者說他最近的生活情況：「${ctx}」` : ''}

請做兩件事，用下面的格式回覆，不要多寫其他東西：
回饋：（60 到 90 字，描述他在任務中展現的特質與可以再往前一步的方向；只根據上面的選擇，不做人格或心理判斷）
挑戰：（一句以「今天，我願意」或「這星期，我願意」開頭、30 字以內、具體可做的三好四給小行動）`;
    return { system: `${RULES}\n\n【資料】\n${fmt(passages)}`, messages: [{ role: 'user', content: user }], passages, maxTokens: 400 };
  }

  throw new Error('unknown kind');
}

/** 給「平台內建 Claude」這類只吃單一字串的介面使用 */
export function flatten({ system, messages }) {
  const convo = messages.map((m) => `${m.role === 'user' ? '使用者' : '助理'}：${m.content}`).join('\n\n');
  return `${system}\n\n【對話】\n${convo}\n\n請以「助理」的身分，依上述規則回覆最後一則使用者訊息。只輸出回覆內容本身。`;
}
