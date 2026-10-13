import { GameSession, clone, signature, findWordPaths, inspectPath } from './rules.js?v=15';

export const SOURCE_VERSION = 'xapk-levels-v1';
export const LANGUAGE_NAMES = Object.freeze({ english:'英语', portuguese:'葡萄牙语', russian:'俄语', spanish:'西班牙语', turkish:'土耳其语' });

function inspectSource(raw) {
  if (!raw || typeof raw !== 'object' || !Number.isInteger(raw.width) || !Number.isInteger(raw.height) || raw.width < 2 || raw.width > 6 || raw.height < 2 || raw.height > 6 || typeof raw.letters !== 'string') throw new Error('原包棋盘格式不合法');
  const rows = raw.letters.split(',');
  // The APK places row 0 at local Y=0 and subsequent rows at positive Y.
  // Preserve that bottom-up index order for paths, counts and JSON roundtrips.
  // The renderer maps it to browser screen rows; see apk-grid-orientation.json.
  if (rows.length !== raw.height || rows.some(row => [...row].length !== raw.width)) throw new Error('原包字母数量与行列不一致');
  const letters = rows.flatMap(row => [...row]);
  if (!letters.every(letter => /^\p{L}$/u.test(letter))) throw new Error('原包字母格式不合法');
  if (!Array.isArray(raw.target_words) || raw.target_words.length < 1 || raw.target_words.length > 18 || !raw.target_words.every(t => t && typeof t.word === 'string' && /^\p{L}{3,10}$/u.test(t.word))) throw new Error('原包目标格式不合法');
  if (new Set(raw.target_words.map(t => t.word)).size !== raw.target_words.length) throw new Error('原包目标词重复');
  if (raw.extra_words != null && (!Array.isArray(raw.extra_words) || !raw.extra_words.every(entry => entry && typeof entry.word === 'string' && entry.word.length)))
    throw new Error('原包额外词列表格式不合法');
  const shape = { rows:raw.height, cols:raw.width }, counts = Array(letters.length).fill(0);
  const targets = [], details = [];
  for (const target of raw.target_words) {
    const paths = findWordPaths(letters, target.word, null, null, shape);
    if (!paths.length) throw new Error(`${target.word} 没有合法路径`);
    const reference = paths[0], consumption = [...reference].sort((a,b) => a-b);
    consumption.forEach(cell => counts[cell]++);
    targets.push({ word:target.word, path:reference, sourceType:target.type });
    details.push({ word:target.word, pathCount:paths.length, setCount:new Set(paths.map(signature)).size, consumption, paths });
  }
  if (counts.some(n => n < 1 || n > 18)) throw new Error('原包目标无法覆盖整个棋盘');
  return { board:{ ...shape, letters, counts }, targets, details };
}

export function convertSourceLevel(raw, metadata={}) {
  const parsed = inspectSource(raw);
  return { schemaVersion:3, algorithm:1, id:`source-${metadata.language || 'unknown'}-${raw.id}`, seed:`APK-${metadata.language || 'unknown'}-${raw.id}`,
    algorithmVersion:SOURCE_VERSION,
    config:{ rows:raw.height, cols:raw.width, wordLengths:raw.target_words.map(t => t.word.length) },
    board:parsed.board, targets:parsed.targets,
    source:{ packageName:'com.agavegames.wordtiles', version:'1.4.0', ...clone(metadata), original:clone(raw), consumptionPolicy:'reference-set' } };
}

export function validateSourceStructure(level) {
  const report = { valid:false, errors:[], checks:[], targets:[], demand:null, stateChecks:0, stateCount:0, validationMode:'source-invariant', enforceConsumption:true };
  const error = (code,message) => report.errors.push({ code,message });
  const check = (name,pass,detail) => report.checks.push({ name,pass,detail });
  if (!level || level.schemaVersion !== 3 || level.algorithm !== 1 || level.source?.packageName !== 'com.agavegames.wordtiles' || level.source?.consumptionPolicy !== 'reference-set') {
    error('SOURCE_VERSION','算法1关卡需要完整的原包来源数据'); return report;
  }
  let parsed;
  try { parsed=inspectSource(level.source.original); }
  catch(e) { error('SOURCE_DATA',e.message); return report; }
  const sameArray = (a,b) => Array.isArray(a) && a.length===b.length && a.every((value,i)=>value===b[i]);
  if (level.board?.rows!==parsed.board.rows || level.board?.cols!==parsed.board.cols || !sameArray(level.board?.letters,parsed.board.letters) || !sameArray(level.board?.counts,parsed.board.counts)) error('SOURCE_BOARD','棋盘字母或反算次数与原包不一致');
  const expectedConfig = { rows:parsed.board.rows, cols:parsed.board.cols, wordLengths:parsed.targets.map(t => t.word.length) };
  if (level.config?.rows!==expectedConfig.rows || level.config?.cols!==expectedConfig.cols || !sameArray(level.config?.wordLengths,expectedConfig.wordLengths)) error('SOURCE_CONFIG','算法1参数与原包不一致');
  if (!Array.isArray(level.targets) || level.targets.length !== parsed.targets.length) error('SOURCE_TARGETS','目标数量与原包不一致');
  else level.targets.forEach((target,i) => {
    const inspected=inspectPath(parsed.board.letters,target?.path,null,parsed.board);
    if (target?.word!==parsed.targets[i].word || target?.sourceType!==parsed.targets[i].sourceType || !inspected.valid || inspected.word!==target.word || signature(target.path)!==signature(parsed.targets[i].path)) error('SOURCE_TARGETS','目标或参考消耗集合与原包不一致');
  });
  report.targets=parsed.details; report.demand=parsed.board.counts; report.config=expectedConfig;
  report.stateCount=2**parsed.targets.length;
  check('原包对照',!report.errors.length,`${parsed.board.cols}×${parsed.board.rows}，${parsed.targets.length} 个原始目标`);
  check('全路径重搜',true,`全部目标可达；${parsed.details.filter(t=>t.setCount>1).length} 个目标采用固定参考消耗集合`);
  check('逐格次数',!report.errors.length,`按参考集合独立反算：${report.demand.join('、')}`);
  // Every cell's count is exactly the number of pending reference sets containing
  // it. A pending target therefore retains every cell of its reference path.
  // This invariant proves order independence for all subsets, without pretending
  // that the 2^N states have been enumerated for large original levels.
  check('完成顺序安全性',!report.errors.length,`需求不变量覆盖 ${report.stateCount} 种完成状态；每个未完成目标仍有参考路径`);
  report.valid=!report.errors.length; return report;
}

export class SourceGameSession extends GameSession {
  constructor(level) {
    const originalExtras=Array.isArray(level?.source?.original?.extra_words)?level.source.original.extra_words:[];
    super(level,null,{validator:validateSourceLevel,bonusDictionary:null});
    // Packaged extras include non-ASCII spellings and words longer than the
    // algorithm2 dictionary's 3–8 limit. Preserve their exact packaged spelling.
    this.bonusWords=new Set(originalExtras.map(entry=>entry.word));
  }
}
export function validateSourceLevel(level) {
  return validateSourceStructure(level);
}
