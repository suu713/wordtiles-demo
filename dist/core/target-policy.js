import input from '../common-v2/dictionary.json?v=13' with { type:'json' };
import blocks from '../common-v2/blocked-words.json?v=13' with { type:'json' };
import { createWordGate } from './whitelist.js?v=13';
import { WORDLIST_HASH, WORDLIST_VERSION, sourceHasWord } from './word-source.js?v=13';

export const COMMON_DICTIONARY=Object.freeze({version:input.version,words:Object.freeze([...input.words])});
export const POLICY_VERSION=COMMON_DICTIONARY.version;
export const wordGate=createWordGate(COMMON_DICTIONARY);
const blocked=new Set(blocks.words);
export const isTargetAllowed=word=>wordGate.isAllowed(word)&&sourceHasWord(word)&&!blocked.has(word.toUpperCase());
export function createBaseDictionary(lengths) {
  const view=wordGate.forLengths(lengths), words=view.words.filter(isTargetAllowed);
  return {version:view.version+`-s${WORDLIST_HASH.slice(0,12)}`+(blocked.size?`-r${blocks.sha256.slice(0,12)}`:''),words,
    metadata:{contentPolicyVersion:POLICY_VERSION,wordlistVersion:WORDLIST_VERSION,whitelistCount:COMMON_DICTIONARY.words.length,projectReviewVersion:blocks.version,projectReviewSha256:blocks.sha256}};
}
export function runtimeDictionaryError(dictionary) {
  if(!dictionary||Array.isArray(dictionary)||typeof dictionary.version!=='string'||!dictionary.version.startsWith(POLICY_VERSION+'-')||
      !dictionary.version.includes('-s'+WORDLIST_HASH.slice(0,12))||dictionary.metadata?.wordlistVersion!==WORDLIST_VERSION||!Array.isArray(dictionary.words))
    return {code:'DICTIONARY_POLICY',message:'算法2需要当前 words.tsv 与原形白名单交集的完整 { version, words } 对象；旧词库不能用于正式关卡。'};
  if(dictionary.metadata?.runtimeSelection?.allowUnreviewed===true)
    return {code:'DICTIONARY_POLICY',message:'常用原形词 V2 不允许未审核词出题旁路。'};
  const rejected=dictionary.words.filter(word=>typeof word!=='string'||!/^[A-Z]+$/.test(word)||!isTargetAllowed(word));
  if(rejected.length||new Set(dictionary.words).size!==dictionary.words.length)
    return {code:'DICTIONARY_POLICY',message:'候选词库包含白名单外、明确禁用或重复词，已拒绝；不能回退或合并旧词库。',rejectedWords:rejected};
  return null;
}
export function checkTargetPolicy(level) {
  const checked=wordGate.checkLevelTargets(level);
  if(!checked.ok) return checked;
  const rejectedWords=level.targets.filter(target=>!isTargetAllowed(target.word)).map(target=>target.word);
  return {ok:!rejectedWords.length,code:rejectedWords.length?'WORD_NOT_APPROVED':'OK',rejectedWords};
}
