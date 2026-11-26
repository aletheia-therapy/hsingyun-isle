/** 願行卡：1080×1350 的直式圖卡，在瀏覽器以 canvas 繪製 */
const W = 1080, H = 1350;
const SERIF = '"Noto Serif TC", "Songti TC", "PMingLiU", serif';
const SANS = '"Noto Sans TC", "PingFang TC", "Microsoft JhengHei", sans-serif';

function wrap(ctx, text, maxW) {
  const lines = []; let line = '';
  for (const ch of text) {
    if (ctx.measureText(line + ch).width > maxW && line) {
      // 避免標點落在行首
      if ('，。、！？；：」）'.includes(ch)) { line += ch; lines.push(line); line = ''; continue; }
      lines.push(line); line = ch;
    } else line += ch;
  }
  if (line) lines.push(line);
  return lines;
}

function lotus(ctx, cx, cy, s, color) {
  ctx.save(); ctx.translate(cx, cy); ctx.strokeStyle = color; ctx.lineWidth = 3; ctx.lineCap = 'round';
  const petal = (ang, len, wid) => {
    ctx.save(); ctx.rotate(ang);
    ctx.beginPath(); ctx.moveTo(0, 0);
    ctx.bezierCurveTo(-wid, -len * 0.45, -wid * 0.55, -len * 0.85, 0, -len);
    ctx.bezierCurveTo(wid * 0.55, -len * 0.85, wid, -len * 0.45, 0, 0);
    ctx.stroke(); ctx.restore();
  };
  petal(0, 120 * s, 46 * s);
  for (const a of [0.42, -0.42]) petal(a, 108 * s, 42 * s);
  for (const a of [0.85, -0.85]) petal(a, 92 * s, 38 * s);
  for (const a of [1.25, -1.25]) petal(a, 70 * s, 30 * s);
  ctx.beginPath(); ctx.moveTo(-150 * s, 8 * s); ctx.quadraticCurveTo(0, 30 * s, 150 * s, 8 * s); ctx.stroke();
  ctx.restore();
}

export async function drawVowCard({ text, name, done }) {
  try { await Promise.all([document.fonts.load(`900 64px ${SERIF}`), document.fonts.load(`500 30px ${SANS}`)]); } catch { /* 用系統字型 */ }
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const x = c.getContext('2d');
  // 紙張
  const bg = x.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, '#fbf6ea'); bg.addColorStop(1, '#f1e6cd');
  x.fillStyle = bg; x.fillRect(0, 0, W, H);
  // 遠山
  x.fillStyle = 'rgba(79,138,131,0.10)';
  x.beginPath(); x.moveTo(0, 1030); x.bezierCurveTo(200, 930, 330, 990, 470, 940); x.bezierCurveTo(620, 885, 760, 980, 1080, 900); x.lineTo(1080, 1350); x.lineTo(0, 1350); x.fill();
  x.fillStyle = 'rgba(79,138,131,0.14)';
  x.beginPath(); x.moveTo(0, 1110); x.bezierCurveTo(240, 1040, 420, 1100, 620, 1050); x.bezierCurveTo(820, 1000, 960, 1080, 1080, 1040); x.lineTo(1080, 1350); x.lineTo(0, 1350); x.fill();
  // 金框
  x.strokeStyle = '#b8863b'; x.lineWidth = 4; x.strokeRect(48, 48, W - 96, H - 96);
  x.lineWidth = 1.5; x.strokeRect(64, 64, W - 128, H - 128);
  // 標題
  x.textAlign = 'center'; x.fillStyle = '#8a6a32';
  x.font = `500 30px ${SANS}`; x.fillText('星 雲 之 島 ・ 願 行 卡', W / 2, 150);
  lotus(x, W / 2, 370, 1.25, '#b8863b');
  // 願文
  x.fillStyle = '#2c2a26';
  x.font = `900 64px ${SERIF}`;
  const lines = wrap(x, text, W - 260).slice(0, 5);
  const lh = 96, top = 560 - ((lines.length - 1) * lh) / 2 + 40;
  lines.forEach((l, i) => x.fillText(l, W / 2, top + i * lh));
  // 署名與日期
  const d = new Date();
  x.font = `500 34px ${SERIF}`; x.fillStyle = '#5a4a32';
  x.fillText(`${name}　${d.getFullYear()} 年 ${d.getMonth() + 1} 月 ${d.getDate()} 日`, W / 2, top + lines.length * lh + 50);
  // 七項善念
  x.font = `500 26px ${SANS}`;
  const cw = 132, sx = W / 2 - (cw * 7) / 2 + cw / 2, cy = 1080;
  done.forEach((t, i) => {
    const cx0 = sx + i * cw;
    x.beginPath(); x.arc(cx0, cy, 34, 0, Math.PI * 2);
    x.fillStyle = t.on ? t.color : 'rgba(0,0,0,0.06)'; x.fill();
    x.fillStyle = t.on ? '#ffffff' : '#a09a8a'; x.font = `700 26px ${SERIF}`;
    x.fillText(t.on ? '✓' : '・', cx0, cy + 9);
    x.fillStyle = t.on ? '#3a352d' : '#a09a8a'; x.font = `500 22px ${SANS}`;
    x.fillText(t.virtue, cx0, cy + 72);
  });
  x.fillStyle = '#6b5e48'; x.font = `500 24px ${SANS}`;
  x.fillText('做好事・說好話・存好心　｜　給人信心・給人歡喜・給人希望・給人方便', W / 2, 1230);
  x.fillStyle = '#9a8c70'; x.font = `400 20px ${SANS}`;
  x.fillText('《三好四給島》AI 沉浸式互動探索與實踐平台', W / 2, 1265);
  return c.toDataURL('image/png');
}
