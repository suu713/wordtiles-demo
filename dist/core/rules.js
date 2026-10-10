export const RULES_VERSION = 'wordtiles-v1.0.0';
export const LENGTHS = [3, 3, 3, 4, 5];
export const NEIGHBORS = Array.from({ length: 9 }, (_, i) =>
  [i - 3, i + 3, i - 1, i + 1].filter(j => j >= 0 && j < 9 &&
    Math.abs(Math.floor(i / 3) - Math.floor(j / 3)) + Math.abs(i % 3 - j % 3) === 1));

export function normalizeDictionary(input) {
  const words = Array.isArray(input) ? input : input?.words;
  return [...new Set((Array.isArray(words) ? words : [])
    .filter(x => typeof x === 'string').map(x => x.toUpperCase())
    .filter(x => /^[A-Z]{3,5}$/.test(x)))].sort();
}

export const signature = path => [...path].sort((a, b) => a - b).join(',');
export const clone = value => JSON.parse(JSON.stringify(value));
export function freeze(value) {
  if (value && typeof value === 'object') {
    Object.freeze(value);
    Object.values(value).forEach(freeze);
  }
  return value;
}

// Empty letters are unavailable. This search never treats an unfinished board as wildcards.
export function findWordPaths(letters, word, counts = null, onVisit = null) {
  const paths = [];
  function walk(cell, offset, visited, path) {
    onVisit?.();
    if ((visited & (1 << cell)) || letters[cell] !== word[offset] ||
        (counts && counts[cell] <= 0)) return;
    const next = [...path, cell];
    if (offset === word.length - 1) { paths.push(next); return; }
    for (const neighbor of NEIGHBORS[cell]) walk(neighbor, offset + 1, visited | (1 << cell), next);
  }
  for (let cell = 0; cell < 9; cell++) walk(cell, 0, 0, []);
  return paths;
}

export function inspectPath(letters, path, counts = null) {
  if (!Array.isArray(path) || !path.length || path.length > 9) return { valid: false, reason: '路径长度不合法' };
  const seen = new Set();
  for (let i = 0; i < path.length; i++) {
    const cell = path[i];
    if (!Number.isInteger(cell) || cell < 0 || cell > 8) return { valid: false, reason: '格子编号不合法' };
    if (seen.has(cell)) return { valid: false, reason: '同一格不能重复使用' };
    if (!letters[cell] || (counts && counts[cell] <= 0)) return { valid: false, reason: '不能经过空位' };
    if (i && !NEIGHBORS[path[i - 1]].includes(cell)) return { valid: false, reason: '只能连接上下左右相邻格' };
    seen.add(cell);
  }
  return { valid: true, word: path.map(i => letters[i]).join('') };
}

export function validateLevel(level, dictionary, { onVisit = null } = {}) {
  const report = { valid: false, errors: [], checks: [], targets: [], demand: null, stateChecks: 0 };
  const error = (code, message, details = null) => report.errors.push({ code, message, details });
  const check = (name, pass, detail) => report.checks.push({ name, pass, detail });
  if (!level || typeof level !== 'object' || Array.isArray(level)) {
    error('SHAPE', '关卡必须是 JSON 对象'); return report;
  }
  const board = level.board;
  if (level.schemaVersion !== 1) error('VERSION', 'schemaVersion 必须为 1');
  if (!board || board.rows !== 3 || board.cols !== 3 ||
      !Array.isArray(board.letters) || board.letters.length !== 9 ||
      !board.letters.every(x => typeof x === 'string' && /^[A-Z]$/.test(x)) ||
      !Array.isArray(board.counts) || board.counts.length !== 9 ||
      !board.counts.every(x => Number.isInteger(x) && x >= 1 && x <= 3)) {
    error('BOARD', '棋盘必须为 3×3，包含 9 个大写字母和 1～3 的整数次数');
  }
  const targets = level.targets;
  if (!Array.isArray(targets) || targets.length !== 5 ||
      !targets.every(t => t && typeof t.word === 'string' && /^[A-Z]{3,5}$/.test(t.word))) {
    error('TARGETS', '必须提供 5 个 3～5 字母的大写目标词');
  }
  if (report.errors.length) { check('数据结构', false, '尺寸、格式或范围错误'); return report; }
  const whitelist = new Set(normalizeDictionary(dictionary));
  if (new Set(targets.map(t => t.word)).size !== 5) error('DUPLICATE', '目标词不能重复');
  if (targets.map(t => t.word.length).sort().join(',') !== LENGTHS.join(',')) error('LENGTHS', '目标长度必须为 3、3、3、4、5');
  for (const target of targets) if (!whitelist.has(target.word)) error('DICTIONARY', `${target.word} 不在本地白名单中`);
  if (board.counts.reduce((a, b) => a + b, 0) !== 18) error('TOTAL', '初始次数总和必须为 18');
  for (const target of targets) {
    const reference = inspectPath(board.letters, target.path);
    if (!reference.valid || reference.word !== target.word) error('REFERENCE', `${target.word} 的参考路径不合法`, reference);
  }
  check('数据与参考路径', report.errors.length === 0, '目标数量、长度、词库、次数与四向路径');

  const demand = Array(9).fill(0);
  for (const target of targets) {
    const paths = findWordPaths(board.letters, target.word, null, onVisit);
    const sets = new Map();
    for (const path of paths) sets.set(signature(path), [...path].sort((a, b) => a - b));
    const consumption = sets.size === 1 ? [...sets.values()][0] : null;
    report.targets.push({ word: target.word, pathCount: paths.length, setCount: sets.size, consumption, paths });
    if (!paths.length) error('NO_PATH', `${target.word} 没有合法路径`);
    else if (sets.size !== 1) error('AMBIGUOUS', `${target.word} 存在 ${sets.size} 种消耗集合`, [...sets.keys()]);
    if (consumption) consumption.forEach(cell => demand[cell]++);
  }
  const unique = report.targets.every(t => t.setCount === 1);
  check('全路径重搜', unique, '允许同集合多路径；每个词的消耗集合必须唯一');
  report.demand = demand;
  const matching = unique && demand.every((n, i) => n === board.counts[i]);
  if (unique && !matching) error('COUNTS', '逐格需求与初始次数不一致', { expected: demand, actual: board.counts });
  check('逐格次数', matching, `反算需求：${demand.join('、')}`);

  let statesPass = true;
  if (unique) {
    for (let mask = 0; mask < 32; mask++) {
      onVisit?.();
      const counts = [...board.counts];
      let pendingLength = 0;
      for (let i = 0; i < 5; i++) {
        if (mask & (1 << i)) report.targets[i].consumption.forEach(cell => counts[cell]--);
        else pendingLength += targets[i].word.length;
      }
      const unreachable = [];
      for (let i = 0; i < 5; i++) if (!(mask & (1 << i)) &&
          !findWordPaths(board.letters, targets[i].word, counts, onVisit).length) unreachable.push(targets[i].word);
      const valid = counts.every(n => n >= 0) && counts.reduce((a, b) => a + b, 0) === pendingLength &&
        unreachable.length === 0 && (mask !== 31 || counts.every(n => n === 0));
      report.stateChecks++;
      if (!valid) { statesPass = false; error('STATE', `完成状态 ${mask} 不满足安全性约束`, { mask, counts, unreachable }); }
    }
  } else statesPass = false;
  check('32 种完成状态', statesPass && report.stateChecks === 32, `${report.stateChecks}/32 状态已检查`);
  report.valid = report.errors.length === 0 && statesPass;
  return report;
}

export class GameSession {
  constructor(level, dictionary) {
    const report = validateLevel(level, dictionary);
    if (!report.valid) throw Object.assign(new Error('关卡未通过完整校验'), { report });
    this.initial = freeze(clone(level));
    this.report = report;
    this.counts = [...level.board.counts];
    this.completed = new Set();
    this.status = 'playing';
    this.debug = null;
  }
  get pending() { return this.initial.targets.filter(t => !this.completed.has(t.word)); }
  get total() { return this.counts.reduce((a, b) => a + b, 0); }
  audit() {
    const expected = Array(9).fill(0);
    this.report.targets.filter(t => !this.completed.has(t.word)).forEach(t => t.consumption.forEach(i => expected[i]++));
    const unavailable = this.pending.filter(t => !findWordPaths(this.initial.board.letters, t.word, this.counts).length).map(t => t.word);
    if (!expected.every((n, i) => n === this.counts[i]) || unavailable.length ||
        (this.pending.length === 0 && this.total !== 0)) {
      this.status = 'anomaly';
      this.debug = { counts: [...this.counts], expected, completed: [...this.completed], unavailable };
      return false;
    }
    this.status = this.pending.length ? 'playing' : 'won';
    return true;
  }
  submit(path) {
    if (this.status !== 'playing') return { accepted: false, reason: this.status };
    if (!this.audit()) return { accepted: false, reason: 'anomaly', debug: this.debug };
    const inspected = inspectPath(this.initial.board.letters, path, this.counts);
    if (!inspected.valid) return { accepted: false, reason: 'invalid-path', message: inspected.reason };
    const word = inspected.word;
    if (!this.initial.targets.some(t => t.word === word)) return { accepted: false, reason: 'not-target', word };
    if (this.completed.has(word)) return { accepted: false, reason: 'already-completed', word };
    // The complete transaction happens before UI effects. No animation callback can consume a tile.
    const nextCounts = this.counts.map((n, cell) => n - (path.includes(cell) ? 1 : 0));
    if (nextCounts.some(n => n < 0)) return { accepted: false, reason: 'invalid-path' };
    this.counts = nextCounts;
    this.completed = new Set([...this.completed, word]);
    this.audit();
    return { accepted: true, word, status: this.status, counts: [...this.counts], debug: this.debug };
  }
  hint() {
    if (this.status !== 'playing' || !this.audit()) return null;
    for (const target of this.pending) {
      const path = findWordPaths(this.initial.board.letters, target.word, this.counts)[0];
      if (path) return { word: target.word, path };
    }
    return null;
  }
  snapshot() { return { counts: [...this.counts], completed: [...this.completed], status: this.status, total: this.total }; }
}
