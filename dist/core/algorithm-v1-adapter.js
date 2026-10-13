import { validateLevel as validateV1 } from './wordtiles-algorithm.js';
import { GameSession, validateLevel as validateDemo, clone, freeze } from './rules.js?v=15';
import { runtimeDictionaryError, checkTargetPolicy } from './target-policy.js?v=15';
import {BONUS_DICTIONARY,sourceHasWord} from './word-source.js?v=15';

// V1 files use flat arrays; the existing renderer and session use board/targets.path.
// Keep the original file separately so exporting or restarting never changes its schema.
export function isV1Level(level) {
  return !!level && typeof level === 'object' &&
    (level.rulesVersion === 'wordtiles-v1' || 'letters' in level || 'initialCounts' in level ||
      (Array.isArray(level.targets) && level.targets.some(target => target && typeof target === 'object' && 'canonicalPath' in target)));
}
function toDemoLevel(level) {
  return {
    schemaVersion: 1, seed: level.seed,
    board: { rows: level.rows, cols: level.cols, letters: [...level.letters], counts: [...level.initialCounts] },
    targets: level.targets.map(target => ({ word: target.word, path: [...target.canonicalPath] })),
  };
}
export function validateAlgorithmLevel(level, dictionary) {
  const policy=checkTargetPolicy(level);
  if(!policy.ok) return {valid:false,errors:[{code:policy.code,message:'目标词未通过当前目标候选政策：'+policy.rejectedWords.join('、')+'。整关拒绝，请重新生成。'}]};
  const dictionaryError=runtimeDictionaryError(dictionary);
  if(dictionaryError) return {valid:false,errors:[dictionaryError]};
  if (!isV1Level(level)) return validateDemo(level, dictionary);
  if (level.dictionaryVersion !== dictionary?.version) return {
    valid: false, errors: [{ code: 'DICTIONARY_VERSION', message: '关卡词库版本与当前运行时词库不一致，请选择生成本关时的词库和频率档位。' }],
  };
  const algorithmValidation = validateV1(level, dictionary);
  if (!algorithmValidation.ok) return {
    valid: false,
    errors: algorithmValidation.errors.map(message => ({ code: message.split(':')[0], message })),
    algorithmValidation,
  };
  // This validator has its own DFS implementation, independent of the supplied generator.
  return { ...validateDemo(toDemoLevel(level), dictionary), algorithmValidation };
}
export function createAlgorithmSession(level, dictionary, {bonusDictionary=BONUS_DICTIONARY}={}) {
  const report = validateAlgorithmLevel(level, dictionary);
  if (!report.valid) throw Object.assign(new Error('关卡未通过完整校验'), { report });
  if(!Array.isArray(bonusDictionary?.words)||bonusDictionary.words.some(word=>!sourceHasWord(word)))throw Object.assign(new Error('额外词库包含未通过审核的词，已拒绝载入'),{code:'DICTIONARY_POLICY'});
  const normalized = isV1Level(level) ? toDemoLevel(level) : level;
  const session = new GameSession(normalized, dictionary, { validator: () => report,bonusDictionary });
  Object.defineProperty(session, 'dictionary', { value: dictionary });
  session.exportInitial = freeze(clone(level));
  return session;
}
