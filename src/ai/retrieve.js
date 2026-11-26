import { KB } from '../data/kb.js';
import { SOURCES } from '../data/sources.js';

/**
 * 中文 BM25 檢索：以單字＋相鄰雙字為詞彙單位（不需斷詞器、不需向量資料庫），
 * 前端與後端共用。對「大師」「三好」這類常見說法加一點同義擴充。
 */
const SYN = [
  [/大師|師父|星雲/g, ' 星雲大師 '],
  [/佛光山|開山/g, ' 佛光山 開山 '],
  [/說好話|講好話|好話/g, ' 說好話 三好 '],
  [/做好事|行善|幫助|幫忙/g, ' 做好事 三好 '],
  [/存好心|好心|善念|包容/g, ' 存好心 三好 '],
  [/鼓勵|打氣|安慰|挫折|失敗|沒信心|自信/g, ' 給人信心 給人希望 鼓勵 '],
  [/開心|快樂|歡喜|微笑/g, ' 給人歡喜 '],
  [/低潮|絕望|希望/g, ' 給人希望 '],
  [/方便|體諒|協助/g, ' 給人方便 '],
  [/傳統佛教|以前的佛教|不同|差別|差異/g, ' 人間佛教 過去 不同 迷信 山林 '],
  [/是什麼|定義|意思/g, ' 定義 什麼是 '],
  [/學校|同學|老師|上課/g, ' 學校 生活 '],
  [/工作|家庭|家人|同事|職場/g, ' 工作 家庭 生活 '],
  [/出生|小時候|童年/g, ' 出生 家鄉 '],
  [/出家|剃度/g, ' 出家 志開上人 '],
  [/台灣|臺灣|來台/g, ' 來台 台灣 '],
  [/去世|過世|圓寂|往生/g, ' 圓寂 '],
  [/大學|學校|教育/g, ' 教育 大學 '],
  [/心魔|自私鬼|懈怠鬼|貪心鬼|嫉妒鬼|懶惰|偷懶|自私|貪心|嫉妒|比較|精進|知足|隨喜|小精靈|光球|光明之境/g, ' 四大心魔 八大人覺經 懈怠 精進 布施 知足 隨喜 '],
];
const CJK = /[㐀-鿿]/;

export function tokens(text) {
  let t = String(text || '').replace(/臺/g, '台');
  for (const [re, add] of SYN) if (re.test(t)) t += add;
  const out = [];
  const words = t.toLowerCase().match(/[a-z0-9]+|[㐀-鿿]+/g) || [];
  for (const w of words) {
    if (!CJK.test(w)) { out.push(w); continue; }
    for (let i = 0; i < w.length; i++) {
      if (!'的了是在有和與也就都而及或之其'.includes(w[i])) out.push(w[i]);
      if (i < w.length - 1) out.push(w.slice(i, i + 2));
    }
  }
  return out;
}

const DOCS = KB.map((d) => {
  const tk = tokens(`${d.title} ${d.title} ${d.text}`);
  const tf = new Map();
  for (const x of tk) tf.set(x, (tf.get(x) || 0) + 1);
  return { d, tf, len: tk.length };
});
const AVG = DOCS.reduce((s, x) => s + x.len, 0) / DOCS.length;
const DF = new Map();
for (const x of DOCS) for (const k of x.tf.keys()) DF.set(k, (DF.get(k) || 0) + 1);

/**
 * @param {string} query
 * @param {{ k?: number, zone?: string, must?: string[] }} opt  zone：目前所在區域（加權）；must：一定要帶入的段落 id
 */
export function retrieve(query, { k = 5, zone = null, must = [] } = {}) {
  const q = [...new Set(tokens(query))];
  const N = DOCS.length, k1 = 1.4, b = 0.7;
  const scored = DOCS.map((x) => {
    let s = 0;
    for (const t of q) {
      const f = x.tf.get(t); if (!f) continue;
      const idf = Math.log(1 + (N - DF.get(t) + 0.5) / (DF.get(t) + 0.5));
      s += idf * (f * (k1 + 1)) / (f + k1 * (1 - b + b * x.len / AVG));
    }
    if (zone && x.d.zone === zone) s *= 1.15;
    if (must.includes(x.d.id)) s += 1000;
    return { d: x.d, s };
  }).filter((x) => x.s > 0.8).sort((a, c) => c.s - a.s).slice(0, k);
  return scored.map(({ d, s }) => ({ ...d, score: Math.round(s * 100) / 100 }));
}

/** 轉成前端顯示用的來源清單（含可點擊的原始出處） */
export function cite(passages) {
  return passages.map((p, i) => ({
    n: i + 1, id: p.id, title: p.title, text: p.text,
    refs: p.src.map((k) => SOURCES[k]).filter(Boolean),
  }));
}
