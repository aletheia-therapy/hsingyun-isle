/**
 * 島上五大區域與各地點。座標：1 單位 = 1 公尺，-z 為北（畫面上方），+x 為東。
 * kind 對應 scene/props.js 的建造函式；exp 對應 exp/ 下的互動模組。
 */
export const ZONES = [
  { id: 'life', no: '一', name: '生命之路', sub: '大師的一生', color: '#b8863b' },
  { id: 'wisdom', no: '二', name: '智慧之境', sub: '人間佛教', color: '#4f8a83' },
  { id: 'practice', no: '三', name: '善念實踐園', sub: '三好四給', color: '#c4724f' },
  { id: 'hall', no: '四', name: 'AI 智慧講堂', sub: '大師智慧', color: '#5a6fa6' },
  { id: 'vow', no: '五', name: '願行之境', sub: '把智慧帶回生活', color: '#b0565a' },
];

// 善念實踐園：七座亭子環繞蓮池
export const GARDEN = { x: 16.5, z: 2.5, r: 6.6, ring: 4.0, pond: 2.5 };
const GARDEN_DEG = [210, 255, 300, 345, 30, 75, 120];   // 西側（180°）留作入口
const gardenSpot = (i, id, place, title) => {
  const a = GARDEN_DEG[i] * Math.PI / 180;
  const x = GARDEN.x + Math.cos(a) * GARDEN.r, z = GARDEN.z + Math.sin(a) * GARDEN.r;
  const k = GARDEN.ring / GARDEN.r;
  const fx = GARDEN.x + Math.cos(a) * GARDEN.r * k, fz = GARDEN.z + Math.sin(a) * GARDEN.r * k;
  return { id, zone: 'practice', kind: 'pavilion', place, title, at: [x, z], front: [fx, fz], rot: Math.atan2(GARDEN.x - x, GARDEN.z - z), r: 2.2, exp: 'task', task: id };
};

export const SPOTS = [
  /* 一、生命之路（西） */
  { id: 'corridor', zone: 'life', kind: 'corridor', place: '生命長廊', title: '從江都到五大洲',
    lede: '沿著長廊走過大師的一生。點時間軸上的每一個節點，看見一個年輕僧人如何把一個願，化成遍布世界的事業。',
    at: [-18.5, 4], front: [-14.6, 4.2], rot: Math.PI / 2, r: 4.2, exp: 'timeline',
    sources: ['bio', 'obit', 'youth', 'yilan', 'open57', 'gongyi', 'obitTime', 'revolution'] },
  { id: 'quizpav', zone: 'life', kind: 'stele', place: '時光碑林', title: '把一生排回順序',
    lede: '石碑上的年份被風吹亂了。把大師一生的重要時刻排回正確的順序，再回答三個小問題。',
    at: [-16, -9.5], front: [-12.6, -8], rot: 1.1, r: 3.2, exp: 'quiz',
    sources: ['bio', 'obit', 'sanhao1998', 'sanbao'] },

  /* 二、智慧之境（北） */
  { id: 'dharmahall', zone: 'wisdom', kind: 'hall', place: '人間佛教殿', title: '佛說的、人要的、淨化的、善美的',
    lede: '什麼是人間佛教？大師的回答只有四句。點亮殿前的四盞燈，看看每一句守護的是什麼。',
    at: [-3, -21], front: [-3, -16.2], rot: 0, r: 5, exp: 'sijujiao',
    sources: ['zongyao', 'sijujiao', 'benhuai2', 'revolution', 'benhuai', 'jingtu'] },
  { id: 'courtyard', zone: 'wisdom', kind: 'courtyard', place: '四宗旨苑', title: '把理念變成事業',
    lede: '1967 年開山時立下的四大宗旨，是人間佛教走進社會的四條路。試著把生活裡的事情，放進它所屬的院落。',
    at: [9.5, -17.5], front: [7.4, -13.4], rot: -0.35, r: 4.6, exp: 'zongzhi',
    sources: ['sanbao', 'chuandeng', 'obit', 'gongyi'] },

  /* 三、善念實踐園（東） */
  gardenSpot(0, 'deed', '行善亭', '做好事'),
  gardenSpot(1, 'speech', '愛語亭', '說好話'),
  gardenSpot(2, 'heart', '心蓮亭', '存好心'),
  gardenSpot(3, 'confidence', '信心亭', '給人信心'),
  gardenSpot(4, 'joy', '歡喜亭', '給人歡喜'),
  gardenSpot(5, 'hope', '希望亭', '給人希望'),
  gardenSpot(6, 'ease', '方便亭', '給人方便'),

  /* 四、AI 智慧講堂（東南） */
  { id: 'lecture', zone: 'hall', kind: 'lecture', place: 'AI 智慧講堂', title: '向知識庫提問',
    lede: '這裡的 AI 導覽不是大師本人，而是一位依據公開資料回答的學習助理。你可以問大師的生平、人間佛教的思想，或把生活裡的難題拿來，一起想想三好四給可以怎麼用。',
    at: [8, 17], front: [5.2, 14.2], rot: -0.78, r: 4.4, exp: 'lecture',
    sources: [] },

  /* 五、願行之境（山頂） */
  { id: 'vowterrace', zone: 'vow', kind: 'terrace', place: '願行台', title: '把智慧帶回生活',
    lede: '走到山頂，回頭看看這一路。選一個你願意做到的小行動，帶著一張屬於你的願行卡下山。',
    at: [0, -4], front: [0, -0.6], rot: 0, r: 4, exp: 'vow',
    sources: ['sanhaoText', 'sigei', 'will'] },
];

for (const s of SPOTS) if (s.zone === 'practice') {
  s.lede = '';
  s.sources = ['sanhaoText', 'sanhaoWork', 'sigei', 'creed'];
}

export const START = [0, 28.2];
export const GATE = { at: [0, 25.6], dock: [0, 31.2] };
