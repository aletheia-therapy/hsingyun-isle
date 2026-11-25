/**
 * 三好四給之島：六個區域、十二個站點。座標：1 單位 = 1 公尺，-z 為北，+x 為東。
 * kind 對應 scene/props.js 的建造函式；exp 對應 exp/ 下的互動模組；
 * front 是互動點（島民站的位置／地上的光圈）。
 */
export const ZONES = [
  { id: 'origin', no: '源', name: '山門', sub: '三好四給從哪裡來', color: '#b8863b' },
  { id: 'sanhao', no: '三', name: '三好村', sub: '做好事・說好話・存好心', color: '#c4724f' },
  { id: 'sigei', no: '四', name: '四給街', sub: '信心・歡喜・希望・方便', color: '#4f8a83' },
  { id: 'media', no: '看', name: '善念影音堂', sub: '延伸觀看', color: '#8a6aa8' },
  { id: 'hall', no: '問', name: 'AI 智慧講堂', sub: '生活中的三好四給', color: '#5a6fa6' },
  { id: 'vow', no: '願', name: '願行台', sub: '把善念帶回生活', color: '#b0565a' },
];

/** 世界尺度：地點之間的距離放大，建築維持真人比例 */
export const S = 2.2;

// 四給街：四座亭子環繞蓮池
export const GARDEN = { x: 16.5 * S, z: 2.5 * S, r: 9.5, ring: 6.0, pond: 3.8 };
const pav = (deg, id, place) => {
  const a = deg * Math.PI / 180;
  const x = GARDEN.x + Math.cos(a) * GARDEN.r, z = GARDEN.z + Math.sin(a) * GARDEN.r;
  const k = GARDEN.ring / GARDEN.r;
  return { id, zone: 'sigei', kind: 'pavilion', place, at: [x, z], front: [GARDEN.x + Math.cos(a) * GARDEN.r * k, GARDEN.z + Math.sin(a) * GARDEN.r * k], rot: Math.atan2(GARDEN.x - x, GARDEN.z - z), r: 2.2, exp: 'station', task: id };
};

export const SPOTS = [
  { id: 'origin', zone: 'origin', kind: 'stele', place: '源頭碑', title: '三好四給從哪裡來',
    at: [5.2, 20.4], front: [2.2, 20.8], rot: -Math.PI / 2, r: 3, exp: 'origin',
    npc: { name: '小蓮', look: 'guide', color: '#b8863b' },
    sources: ['sanhaoText', 'sanhao1998', 'sigei', 'will', 'creed', 'bio', 'obit', 'wuliang'] },

  { id: 'deed', zone: 'sanhao', kind: 'house', place: '柳丁坡', at: [-17, 9.2], front: [-13.6, 9.4], rot: Math.PI / 2, r: 3, exp: 'station', task: 'deed' },
  { id: 'speech', zone: 'sanhao', kind: 'house', place: '小組屋', at: [-19.4, -1.2], front: [-16, -1], rot: Math.PI / 2, r: 3, exp: 'station', task: 'speech' },
  { id: 'heart', zone: 'sanhao', kind: 'pavilion', place: '心湖亭', at: [-15.4, -9.6], front: [-12.6, -8.2], rot: 1.1, r: 2.2, exp: 'station', task: 'heart' },

  pav(230, 'confidence', '信心亭'),
  pav(315, 'hope', '希望亭'),
  pav(35, 'joy', '歡喜亭'),
  pav(125, 'ease', '方便亭'),

  { id: 'media', zone: 'media', kind: 'hall', place: '善念影音堂', title: '延伸觀看：三好四給在世界各地',
    lede: '殿裡收藏著佛光山、人間衛視與三好微電影節的公開影片。點選就能在新視窗觀看。',
    at: [-3, -21], front: [-3, -14.5], rot: 0, r: 5, exp: 'videos', sources: [] },
  { id: 'lecture', zone: 'hall', kind: 'lecture', place: 'AI 智慧講堂', title: '把生活的難題帶進來',
    lede: '這裡的 AI 學習助理不是星雲大師本人，而是依據公開資料回答的學習夥伴。說說你遇到的情況，一起想想三好四給可以怎麼做；也可以問三好四給與人間佛教的知識。',
    at: [8, 17], front: [5.2, 14.2], rot: -0.78, r: 4.4, exp: 'lecture', sources: [] },
  { id: 'vowterrace', zone: 'vow', kind: 'terrace', place: '願行台', title: '把善念帶回生活',
    lede: '走到山頂，回頭看看這座被你點亮的島。選一個你願意做到的小行動，帶著一張屬於你的願行卡下山。',
    at: [0, -4], front: [0, -0.4], rot: 0, r: 4, exp: 'vow', sources: ['sanhaoText', 'sigei', 'will'] },
];

for (const s of SPOTS) {
  if (s.exp === 'station') s.sources = ['sanhaoText', 'sanhaoWork', 'sigei', 'creed'];
  // 放大世界：位置乘上 S，互動點與建築的相對距離不變（四給街的亭子已用放大後的座標）
  if (s.zone !== 'sigei') {
    const off = [s.front[0] - s.at[0], s.front[1] - s.at[1]];
    s.at = [s.at[0] * S, s.at[1] * S];
    s.front = [s.at[0] + off[0], s.at[1] + off[1]];
  }
}

export const GATE = { at: [0, 25.6 * S], dock: [0, 31.2 * S] };
export const START = [0, GATE.dock[1] - 1];
