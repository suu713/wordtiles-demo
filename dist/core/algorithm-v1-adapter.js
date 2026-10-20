import { validateLevel as validateV1 } from './wordtiles-algorithm.js';
import { GameSession, validateLevel as validateDemo, clone, freeze } from './rules.js?v=21';
import { runtimeDictionaryError, checkTargetPolicy } from './target-policy.js?v=21';
import {BONUS_DICTIONARY,sourceHasWord} from './word-source.js?v=15';
import {zenBonusDictionary} from './zen-dictionary.js?v=21';
import {bankBonusDictionary} from './dictionary-banks.js?v=21';

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
    ...(level.source?{source:clone(level.source)}:{}),...(level.kind?{kind:level.kind}:{}),
    board: { rows: level.rows, cols: level.cols, letters: [...level.letters], counts: [...level.initialCounts] },
    targets: level.targets.map(target => ({ word: target.word, path: [...target.canonicalPath] })),
  };
}
// Older supplied V1 files did not record a bank. Revalidate their words and
// geometry against one explicitly selected bank, preserving the original file.
export function migrateLegacyLevel(level,dictionary){
  if(!isV1Level(level)||level.source?.dictionaryOrigin||!['web-supplied','wt-package','zen'].includes(dictionary?.metadata?.origin))throw new Error('这份关卡不能按旧网页格式迁移');
  const error=runtimeDictionaryError(dictionary);if(error)throw new Error(error.message);
  const policy=checkTargetPolicy(level,dictionary);if(!policy.ok)throw new Error('旧关卡目标不属于当前所选单一词库：'+policy.rejectedWords.join('、'));
  const originalCheck=validateV1(level,{...dictionary,version:level.dictionaryVersion});if(!originalCheck.ok)throw new Error(originalCheck.errors.join('；'));
  const next={...toDemoLevel(level),schemaVersion:2,kind:'web',dictionaryVersion:dictionary.version,
    config:{rows:level.rows,cols:level.cols,wordLengths:level.targets.map(t=>t.word.length)},
    source:{language:'english',dictionaryOrigin:dictionary.metadata.origin,dictionaryVersion:dictionary.version,dictionaryMetadata:dictionary.metadata,sourceSha256:dictionary.metadata.sourceSha256,generationEngine:'supplied-v1',legacyDictionaryVersion:level.dictionaryVersion,importedOriginal:clone(level)}};
  const checked=validateAlgorithmLevel(next,dictionary);if(!checked.valid)throw new Error(checked.errors.map(e=>e.message).join('；'));
  return next;
}
export function validateAlgorithmLevel(level, dictionary) {
  const policy=checkTargetPolicy(level,dictionary);
  if(!policy.ok) return {valid:false,errors:[{code:policy.code,message:'目标词未通过当前目标候选政策：'+policy.rejectedWords.join('、')+'。整关拒绝，请重新生成。'}]};
  const dictionaryError=runtimeDictionaryError(dictionary);
  if(dictionaryError) return {valid:false,errors:[dictionaryError]};
  if(level.source?.dictionaryOrigin&&dictionary.metadata?.origin&&level.source.dictionaryOrigin!==dictionary.metadata.origin)
    return {valid:false,errors:[{code:'DICTIONARY_SOURCE',message:'关卡与所选词库来源不一致。'}]};
  if (!isV1Level(level)) {
    if(['web-supplied','wt-package','zen'].includes(dictionary?.metadata?.origin)&&(level.dictionaryVersion!==dictionary.version||level.source?.dictionaryOrigin!==dictionary.metadata.origin))
      return {valid:false,errors:[{code:'DICTIONARY_SOURCE',message:'关卡与所选词库来源或版本不一致，拒绝跨来源载入。'}]};
    return validateDemo(level, dictionary);
  }
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
  if(['web-supplied','wt-package'].includes(dictionary.metadata?.origin))bonusDictionary=bankBonusDictionary(dictionary);
  else if(dictionary.metadata?.origin==='zen')bonusDictionary=zenBonusDictionary(dictionary);
  else if(!Array.isArray(bonusDictionary?.words)||bonusDictionary.words.some(word=>!sourceHasWord(word)))throw Object.assign(new Error('额外词库包含未通过审核的词，已拒绝载入'),{code:'DICTIONARY_POLICY'});
  const normalized = isV1Level(level) ? toDemoLevel(level) : level;
  const session = new GameSession(normalized, dictionary, { validator: () => report,bonusDictionary });
  Object.defineProperty(session, 'dictionary', { value: dictionary });
  session.exportInitial = freeze(clone(level));
  return session;
}
