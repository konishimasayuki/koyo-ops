// 日本の祝日（振替休日・国民の休日を含む）
const pad = (n) => String(n).padStart(2, '0');
const ymd = (y, m, d) => `${y}-${pad(m)}-${pad(d)}`;
const nthMonday = (y, m, n) => {
  const first = new Date(y, m - 1, 1).getDay();
  return 1 + ((8 - first) % 7) + (n - 1) * 7;
};
const spring = (y) => Math.floor(20.8431 + 0.242194 * (y - 1980) - Math.floor((y - 1980) / 4));
const autumn = (y) => Math.floor(23.2488 + 0.242194 * (y - 1980) - Math.floor((y - 1980) / 4));

const cache = new Map();
export function holidaysOf(y) {
  if (cache.has(y)) return cache.get(y);
  const h = new Map([
    [ymd(y, 1, 1), '元日'],
    [ymd(y, 1, nthMonday(y, 1, 2)), '成人の日'],
    [ymd(y, 2, 11), '建国記念の日'],
    [ymd(y, 2, 23), '天皇誕生日'],
    [ymd(y, 3, spring(y)), '春分の日'],
    [ymd(y, 4, 29), '昭和の日'],
    [ymd(y, 5, 3), '憲法記念日'],
    [ymd(y, 5, 4), 'みどりの日'],
    [ymd(y, 5, 5), 'こどもの日'],
    [ymd(y, 7, nthMonday(y, 7, 3)), '海の日'],
    [ymd(y, 8, 11), '山の日'],
    [ymd(y, 9, nthMonday(y, 9, 3)), '敬老の日'],
    [ymd(y, 9, autumn(y)), '秋分の日'],
    [ymd(y, 10, nthMonday(y, 10, 2)), 'スポーツの日'],
    [ymd(y, 11, 3), '文化の日'],
    [ymd(y, 11, 23), '勤労感謝の日'],
  ]);
  // 国民の休日（祝日に挟まれた平日）
  for (let d = new Date(y, 0, 2); d.getFullYear() === y; d.setDate(d.getDate() + 1)) {
    const k = ymd(y, d.getMonth() + 1, d.getDate());
    const prev = new Date(d);
    prev.setDate(d.getDate() - 1);
    const next = new Date(d);
    next.setDate(d.getDate() + 1);
    const kp = ymd(prev.getFullYear(), prev.getMonth() + 1, prev.getDate());
    const kn = ymd(next.getFullYear(), next.getMonth() + 1, next.getDate());
    if (!h.has(k) && d.getDay() !== 0 && h.has(kp) && h.has(kn)) h.set(k, '国民の休日');
  }
  // 振替休日（日曜の祝日の次の平日）
  for (const k of [...h.keys()].sort()) {
    const d = new Date(`${k}T00:00:00`);
    if (d.getDay() !== 0) continue;
    const s = new Date(d);
    do {
      s.setDate(s.getDate() + 1);
    } while (h.has(ymd(s.getFullYear(), s.getMonth() + 1, s.getDate())));
    h.set(ymd(s.getFullYear(), s.getMonth() + 1, s.getDate()), '振替休日');
  }
  cache.set(y, h);
  return h;
}

export const holidayName = (key) => holidaysOf(Number(key.slice(0, 4))).get(key) || '';
