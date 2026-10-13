export const RULES_VERSION = 'wordtiles-v2.0.0';
export const LENGTHS = [3, 3, 3, 4, 5];
export const LIMITS = Object.freeze({ minSize: 2, maxSize: 6, minTargets: 1, maxTargets: 10, minLength: 3, maxLength: 8, maxUses: 3 });
export const DEFAULT_CONFIG = Object.freeze({ rows: 3, cols: 3, wordLengths: Object.freeze([...LENGTHS]) });
const neighborCache = new Map();
export function createNeighbors(rows = 3, cols = 3) {
  const key = `${rows},${cols}`;
  if (!neighborCache.has(key)) neighborCache.set(key, Array.from({ length: rows * cols }, (_, i) =>
    [i - cols, i + cols, i - 1, i + 1].filter(j => j >= 0 && j < rows * cols &&
      Math.abs(Math.floor(i / cols) - Math.floor(j / cols)) + Math.abs(i % cols - j % cols) === 1)));
  return neighborCache.get(key);
}
export const NEIGHBORS = createNeighbors();
export const clone = value => JSON.parse(JSON.stringify(value));
export const signature = path => [...path].sort((a, b) => a - b).join(',');
export function freeze(value) {
  if (value && typeof value === 'object') { Object.freeze(value); Object.values(value).forEach(freeze); }
  return value;
}
export function normalizeDictionary(input) {
  const words = Array.isArray(input) ? input : input?.words;
  return [...new Set((Array.isArray(words) ? words : []).filter(x => typeof x === 'string')
    .map(x => x.toUpperCase()).filter(x => /^[A-Z]{3,8}$/.test(x)))].sort();
}
// Target generation still uses the configured 3–8 letter limit. Bonus words
// have their own exact spelling list, including longer packaged words.
export function normalizeBonusDictionary(input) {
  const words=Array.isArray(input)?input:input?.words;
  return [...new Set((Array.isArray(words)?words:[]).filter(w=>typeof w==='string')
    .map(w=>w.toUpperCase()).filter(w=>/^\p{L}{3,45}$/u.test(w)))].sort();
}
export function configForLevel(level) {
  return level.schemaVersion === 2 ? clone(level.config) : {
    rows: level.board.rows, cols: level.board.cols, wordLengths: level.targets.map(t => t.word.length)
  };
}
export function checkConfiguration(config, dictionary = null) {
  const errors = [];
  const error = (code, message) => errors.push({ code, message });
  if (!config || !Number.isInteger(config.rows) || !Number.isInteger(config.cols) ||
      config.rows < LIMITS.minSize || config.rows > LIMITS.maxSize || config.cols < LIMITS.minSize || config.cols > LIMITS.maxSize) {
    error('SIZE', `棋盘行列必须为 ${LIMITS.minSize}～${LIMITS.maxSize} 的整数`);
  }
  if (!Array.isArray(config?.wordLengths) || config.wordLengths.length < LIMITS.minTargets || config.wordLengths.length > LIMITS.maxTargets ||
      !config.wordLengths.every(n => Number.isInteger(n) && n >= LIMITS.minLength && n <= LIMITS.maxLength)) error('LENGTHS', '目标数量必须为 1～10，每个目标长度为 3～8 的整数');
  if (errors.length) return { valid: false, errors, cells: 0, totalLetters: 0, stateCount: 0 };
  const cells = config.rows * config.cols;
  const totalLetters = config.wordLengths.reduce((a,b) => a+b, 0);
  if (config.wordLengths.some(n => n > cells)) error('WORD_TOO_LONG', '目标词长度不能超过棋盘格子数');
  if (totalLetters < cells) error('COVERAGE', `总字母数 ${totalLetters} 小于 ${cells} 个格子，无法覆盖整块棋盘`);
  const capacity = cells * Math.min(LIMITS.maxUses, config.wordLengths.length);
  if (totalLetters > capacity) error('CAPACITY', `总字母数 ${totalLetters} 超过棋盘可用次数 ${capacity}，请减少目标或缩短单词`);
  if (dictionary) {
    const words = normalizeDictionary(dictionary), needed = new Map();
    config.wordLengths.forEach(n => needed.set(n, (needed.get(n) || 0) + 1));
    for (const [length, count] of needed) if (words.filter(w => w.length === length).length < count) error('DICTIONARY', `词库中 ${length} 字母词不足 ${count} 个`);
  }
  return { valid: !errors.length, errors, cells, totalLetters, stateCount: 2 ** config.wordLengths.length };
}
export function findWordPaths(letters, word, counts = null, onVisit = null, shape = DEFAULT_CONFIG) {
  const neighbors = createNeighbors(shape.rows, shape.cols), paths = [], used = new Set(), path = [];
  function walk(cell, offset) {
    onVisit?.();
    if (used.has(cell) || letters[cell] !== word[offset] || (counts && counts[cell] <= 0)) return;
    used.add(cell); path.push(cell);
    if (offset === word.length - 1) paths.push([...path]);
    else for (const neighbor of neighbors[cell]) walk(neighbor, offset + 1);
    path.pop(); used.delete(cell);
  }
  for (let cell = 0; cell < neighbors.length; cell++) walk(cell, 0);
  return paths;
}
export function inspectPath(letters, path, counts = null, shape = DEFAULT_CONFIG) {
  const size = shape.rows * shape.cols;
  if (!Array.isArray(path) || !path.length || path.length > size) return { valid: false, reason: '路径长度不合法' };
  const neighbors = createNeighbors(shape.rows, shape.cols), seen = new Set();
  for (let i = 0; i < path.length; i++) {
    const cell = path[i];
    if (!Number.isInteger(cell) || cell < 0 || cell >= size) return { valid: false, reason: '格子编号不合法' };
    if (seen.has(cell)) return { valid: false, reason: '同一格不能重复使用' };
    if (!letters[cell] || (counts && counts[cell] <= 0)) return { valid: false, reason: '不能经过空位' };
    if (i && !neighbors[path[i-1]].includes(cell)) return { valid: false, reason: '只能连接上下左右相邻格' };
    seen.add(cell);
  }
  return { valid: true, word: path.map(i => letters[i]).join('') };
}
export function validateLevel(level, dictionary, { onVisit = null } = {}) {
  const report = { valid: false, errors: [], checks: [], targets: [], demand: null, stateChecks: 0, stateCount: 0 };
  const error = (code, message, details = null) => report.errors.push({ code, message, details });
  const check = (name, pass, detail) => report.checks.push({ name, pass, detail });
  if (!level || typeof level !== 'object' || Array.isArray(level)) { error('SHAPE', '关卡必须是 JSON 对象'); return report; }
  if (![1,2].includes(level.schemaVersion)) error('VERSION', 'schemaVersion 必须为 1 或 2');
  const board = level.board, targets = level.targets;
  const dimensionsValid = board && Number.isInteger(board.rows) && Number.isInteger(board.cols) && board.rows >= 2 && board.rows <= 6 && board.cols >= 2 && board.cols <= 6;
  if (!dimensionsValid || !Array.isArray(board.letters) || board.letters.length !== board.rows*board.cols || !board.letters.every(x => typeof x === 'string' && /^[A-Z]$/.test(x)) || !Array.isArray(board.counts) || board.counts.length !== board.rows*board.cols || !board.counts.every(x => Number.isInteger(x) && x >= 1 && x <= LIMITS.maxUses)) error('BOARD', '棋盘行列必须为 2～6，字母与次数数组必须对应全部格子，每格 1～3 次');
  if (!Array.isArray(targets) || targets.length < 1 || targets.length > 10 || !targets.every(t => t && typeof t.word === 'string' && /^[A-Z]{3,8}$/.test(t.word))) error('TARGETS', '必须提供 1～10 个长度为 3～8 的大写目标词');
  if (report.errors.length) { check('数据结构', false, '尺寸、格式或范围错误'); return report; }
  let config;
  if (level.schemaVersion === 1) {
    config = { rows:3, cols:3, wordLengths:[...LENGTHS] };
    if (board.rows !== 3 || board.cols !== 3 || targets.length !== 5) error('V1_RULES', 'V1 关卡要求 3×3 棋盘和 5 个目标');
  } else config = level.config;
  const configuration = checkConfiguration(config, dictionary);
  if (!configuration.valid) { configuration.errors.forEach(e => error(e.code,e.message)); return report; }
  report.config = clone(config); report.stateCount = configuration.stateCount;
  if (board.rows !== config.rows || board.cols !== config.cols) error('CONFIG_SIZE', '配置行列与棋盘尺寸不一致');
  const actualLengths = targets.map(t => t.word.length);
  const lengthsMatch = level.schemaVersion === 1
    ? [...actualLengths].sort((a,b)=>a-b).join(',') === [...config.wordLengths].sort((a,b)=>a-b).join(',')
    : actualLengths.every((length, index) => length === config.wordLengths[index]);
  if (targets.length !== config.wordLengths.length || !lengthsMatch) error('LENGTHS', '实际目标数量或逐词长度不符合配置');
  const whitelist = new Set(normalizeDictionary(dictionary));
  if (new Set(targets.map(t=>t.word)).size !== targets.length) error('DUPLICATE', '目标词不能重复');
  for (const target of targets) if (!whitelist.has(target.word)) error('DICTIONARY', `${target.word} 不在本地白名单中`);
  if (board.counts.reduce((a,b)=>a+b,0) !== configuration.totalLetters) error('TOTAL', `初始次数总和必须为 ${configuration.totalLetters}`);
  for (const target of targets) {
    const reference = inspectPath(board.letters,target.path,null,board);
    if (!reference.valid || reference.word !== target.word) error('REFERENCE', `${target.word} 的参考路径不合法`, reference);
  }
  check('数据与参考路径', !report.errors.length, `${board.rows}×${board.cols}，${targets.length} 词，${configuration.totalLetters} 次`);
  const demand = Array(board.rows*board.cols).fill(0);
  for (const target of targets) {
    const paths = findWordPaths(board.letters,target.word,null,onVisit,board), sets = new Map();
    for (const path of paths) sets.set(signature(path),[...path].sort((a,b)=>a-b));
    const consumption = sets.size === 1 ? [...sets.values()][0] : null;
    report.targets.push({ word:target.word, pathCount:paths.length, setCount:sets.size, consumption, paths });
    if (!paths.length) error('NO_PATH', `${target.word} 没有合法路径`);
    else if (sets.size !== 1) error('AMBIGUOUS', `${target.word} 存在 ${sets.size} 种消耗集合`, [...sets.keys()]);
    if (consumption) consumption.forEach(cell=>demand[cell]++);
  }
  const unique = report.targets.every(t=>t.setCount === 1); report.demand = demand;
  check('全路径重搜',unique,'允许同集合多路径，每个词的消耗集合必须唯一');
  const matching = unique && demand.every((n,i)=>n === board.counts[i]);
  if (unique && !matching) error('COUNTS','逐格需求与初始次数不一致',{ expected:demand, actual:board.counts });
  check('逐格次数',matching,`反算需求：${demand.join('、')}`);
  let statesPass = true;
  const stateCount = 2 ** targets.length; report.stateCount = stateCount;
  if (unique) {
    for (let mask=0; mask<stateCount; mask++) {
      onVisit?.();
      const counts=[...board.counts]; let pendingLength=0;
      for (let i=0; i<targets.length; i++) {
        if (mask & (1<<i)) report.targets[i].consumption.forEach(cell=>counts[cell]--);
        else pendingLength += targets[i].word.length;
      }
      const unreachable=[];
      // Recheck an independently discovered path in every state. Depletion only
      // removes cells; it cannot introduce paths or change letters.
      for (let i=0; i<targets.length; i++) if (!(mask & (1<<i)) && !inspectPath(board.letters,report.targets[i].paths[0],counts,board).valid) unreachable.push(targets[i].word);
      const valid = counts.every(n=>n>=0) && counts.reduce((a,b)=>a+b,0) === pendingLength && !unreachable.length && (mask !== stateCount-1 || counts.every(n=>n===0));
      report.stateChecks++;
      if (!valid) { statesPass=false; error('STATE',`完成状态 ${mask} 不满足安全性约束`,{ mask,counts,unreachable }); }
    }
  } else statesPass=false;
  check(`${stateCount} 种完成状态`,statesPass && report.stateChecks===stateCount,`${report.stateChecks}/${stateCount} 状态已检查`);
  report.valid = !report.errors.length && statesPass; return report;
}
export class GameSession {
  constructor(level,dictionary,{ validator=validateLevel,bonusDictionary=dictionary }={}) {
    const report=validator(level,dictionary);
    if (!report.valid) throw Object.assign(new Error('关卡未通过完整校验'),{ report });
    this.initial=freeze(clone(level)); this.report=report;
    this.neighbors=createNeighbors(level.board.rows,level.board.cols);
    this.counts=[...level.board.counts]; this.completed=new Set(); this.status='playing'; this.debug=null;
    this.bonusCompleted=new Set(); this.bonusDictionaryInput=bonusDictionary; this.bonusWords=null;
  }
  get pending() { return this.initial.targets.filter(t=>!this.completed.has(t.word)); }
  get total() { return this.counts.reduce((a,b)=>a+b,0); }
  audit() {
    const expected=Array(this.counts.length).fill(0);
    this.report.targets.filter(t=>!this.completed.has(t.word)).forEach(t=>t.consumption.forEach(i=>expected[i]++));
    const unavailable=this.pending.filter(t=>!findWordPaths(this.initial.board.letters,t.word,this.counts,null,this.initial.board).length).map(t=>t.word);
    if (!expected.every((n,i)=>n===this.counts[i]) || unavailable.length || (!this.pending.length && this.total!==0)) {
      this.status='anomaly'; this.debug={ counts:[...this.counts],expected,completed:[...this.completed],unavailable }; return false;
    }
    this.status=this.pending.length ? 'playing' : 'won'; return true;
  }
  submit(path) {
    if (this.status!=='playing') return { accepted:false,reason:this.status };
    if (!this.audit()) return { accepted:false,reason:'anomaly',debug:this.debug };
    const inspected=inspectPath(this.initial.board.letters,path,this.counts,this.initial.board);
    if (!inspected.valid) return { accepted:false,reason:'invalid-path',message:inspected.reason };
    const word=inspected.word;
    if (!this.initial.targets.some(t=>t.word===word)) {
      this.bonusWords ||= new Set(normalizeBonusDictionary(this.bonusDictionaryInput));
      if (this.bonusWords.has(word)) {
        const isNew=!this.bonusCompleted.has(word); this.bonusCompleted.add(word);
        return { accepted:false,reason:'extra-word',word,isNew };
      }
      return { accepted:false,reason:'not-target',word };
    }
    if (this.completed.has(word)) return { accepted:false,reason:'already-completed',word };
    if (this.report.enforceConsumption) {
      const expected=this.report.targets.find(t=>t.word===word).consumption;
      if (signature(path)!==signature(expected)) return { accepted:false,reason:'different-consumption',word,message:'这个词需要换一条消耗路径，可点击提示查看。次数保持不变。' };
    }
    const nextCounts=this.counts.map((n,cell)=>n-(path.includes(cell)?1:0));
    if (nextCounts.some(n=>n<0)) return { accepted:false,reason:'invalid-path' };
    this.counts=nextCounts; this.completed=new Set([...this.completed,word]); this.audit();
    return { accepted:true,word,status:this.status,counts:[...this.counts],debug:this.debug };
  }
  hint() {
    if (this.status!=='playing' || !this.audit()) return null;
    for (const target of this.pending) {
      const path=this.report.enforceConsumption ? [...target.path] : findWordPaths(this.initial.board.letters,target.word,this.counts,null,this.initial.board)[0];
      if (path) return { word:target.word,path };
    }
    return null;
  }
  snapshot() { return { counts:[...this.counts],completed:[...this.completed],status:this.status,total:this.total }; }
}
