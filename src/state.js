import { SPOTS, ZONES } from './data/spots.js';

/** 學習進度：走過的地點、任務選擇、小測驗成績、願行卡。存在瀏覽器本機。 */
const KEY = 'hsingyun-isle:v1';
const blank = () => ({ visited: [], done: [], tasks: {}, quiz: null, timeline: [], vow: null, chat: [], points: {}, finale: false, ghosts: {} });

/** 舊版只有一個「善念值」：依照那件事的性質，換算成 [福德, 智慧] */
function legacy(key, n) {
  const k = key === 'trial:done' ? 0.5 : /^(origin|trial):/.test(key) ? 0.8 : /^q:/.test(key) ? 0.2 : /^(orb|ghost:selfish)/.test(key) ? 0 : /^ghost:lazy/.test(key) ? 1 : 0.5;
  const w = Math.round(n * k);
  return [n - w, w];
}
let s = blank();
try {
  s = { ...blank(), ...JSON.parse(localStorage.getItem(KEY) || '{}') };
  for (const [k, v] of Object.entries(s.points)) if (typeof v === 'number') s.points[k] = legacy(k, v);
} catch { /* 從零開始 */ }
const subs = new Set();
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* 無痕模式等情況 */ } subs.forEach((f) => f(s)); };

export const state = {
  get: () => s,
  on: (f) => { subs.add(f); return () => subs.delete(f); },
  visit(id) { if (!s.visited.includes(id)) { s.visited.push(id); save(); } },
  /** 地點「完成」：互動做完（任務已選擇、時間軸看完、測驗做完……） */
  complete(id) { if (!s.done.includes(id)) { s.done.push(id); save(); } else save(); },
  isDone: (id) => s.done.includes(id),
  setTask(id, data) { s.tasks[id] = { ...(s.tasks[id] || {}), ...data }; save(); },
  setQuiz(q) { s.quiz = q; save(); },
  seeNode(i) { if (!s.timeline.includes(i)) { s.timeline.push(i); save(); } },
  setVow(v) { s.vow = v; save(); },
  /** 心魔試煉：看過說明了沒、哪幾隻心魔已經被感化（{ intro, selfish, lazy }） */
  setGhost(data) { s.ghosts = { ...(s.ghosts || {}), ...data }; save(); },
  /** 看過最後的煙火了 */
  setFinale(v) { if (s.finale !== v) { s.finale = v; save(); } },
  pushChat(m) { s.chat.push(m); s.chat = s.chat.slice(-40); save(); },
  clearChat() { s.chat = []; save(); },
  reset() { s = blank(); save(); },
  /** 福德與智慧：同一件事只算一次。回傳這次增加的 [福德, 智慧]；已經算過就回傳 null */
  addMerit(key, [f, w]) { if (s.points[key]) return null; s.points[key] = [f, w]; save(); return [f, w]; },
  /** 累積的福德、智慧，以及兩者合計 */
  get fu() { return Object.values(s.points).reduce((a, p) => a + p[0], 0); },
  get hui() { return Object.values(s.points).reduce((a, p) => a + p[1], 0); },
  get score() { return state.fu + state.hui; },
  zoneProgress(zid) {
    const ids = SPOTS.filter((x) => x.zone === zid).map((x) => x.id);
    return { done: ids.filter((i) => s.done.includes(i)).length, total: ids.length };
  },
  summary() {
    return ZONES.map((z) => ({ ...z, ...state.zoneProgress(z.id) }));
  },
};
