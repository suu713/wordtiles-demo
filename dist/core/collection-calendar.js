// Calendar dates follow the browser's local day, matching the collection history.
export function localCollectionDate(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  return [String(date.getFullYear()).padStart(4, '0'),
    String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('-');
}

export function groupCollectionDays(entries) {
  const days = new Map();
  for (const entry of entries) {
    if (typeof entry.firstFoundAt !== 'string' || !entry.firstFoundAt.trim()) continue;
    const key = localCollectionDate(entry.firstFoundAt);
    if (!key) continue;
    if (!days.has(key)) days.set(key, []);
    days.get(key).push(entry);
  }
  for (const words of days.values()) words.sort((a, b) => a.word.localeCompare(b.word) || a.language.localeCompare(b.language));
  return days;
}

export function shiftCollectionMonth({year, month}, amount) {
  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 0 || month > 11 || !Number.isInteger(amount)) return null;
  const total = year * 12 + month + amount;
  const nextYear = Math.floor(total / 12);
  if (nextYear < 1 || nextYear > 9999) return null;
  return {year: nextYear, month: ((total % 12) + 12) % 12};
}

export function collectionMonthCells({year, month}, days = new Map()) {
  if (!shiftCollectionMonth({year, month}, 0)) return [];
  // UTC is used only for month geometry, so DST cannot shift a weekday or date.
  const first = new Date(0);
  first.setUTCFullYear(year, month, 1);
  const last = new Date(0);
  last.setUTCFullYear(year, month + 1, 0);
  const cells = Array((first.getUTCDay() + 6) % 7).fill(null);
  const prefix = `${String(year).padStart(4, '0')}-${String(month + 1).padStart(2, '0')}-`;
  for (let day = 1; day <= last.getUTCDate(); day++) {
    const date = prefix + String(day).padStart(2, '0');
    cells.push({day, date, count: days.get(date)?.length || 0});
  }
  while (cells.length % 7) cells.push(null);
  return cells;
}

export function collectionMonthGroups(days, {year, month}, selectedDate = null) {
  const prefix = `${String(year).padStart(4, '0')}-${String(month + 1).padStart(2, '0')}-`;
  return [...days.entries()].filter(([date]) => date.startsWith(prefix) && (!selectedDate || date === selectedDate))
    .sort(([a], [b]) => b.localeCompare(a));
}
