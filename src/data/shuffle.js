/** 隨機排列 0..n-1；n ≥ 2 時保證不是原本的順序，避免正解總是在固定位置 */
export function perm(n) {
  const p = [...Array(n).keys()];
  if (n < 2) return p;
  do {
    for (let i = n - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [p[i], p[j]] = [p[j], p[i]]; }
  } while (p.every((v, i) => v === i));
  return p;
}
