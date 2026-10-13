import { generateLevel as generateRaw, GENERATOR_VERSION } from './wordtiles-algorithm.js?v=15';
import { runtimeDictionaryError, checkTargetPolicy } from './target-policy.js?v=15';
export { GENERATOR_VERSION };

// The supplied engine remains intact. Every live algorithm2 search goes through
// this policy gate before search and before its result can reach the importer.
export function generateLevel(config,dictionary,seed,hooks) {
  const error=runtimeDictionaryError(dictionary);
  if(error) return {ok:false,...error};
  const result=generateRaw(config,dictionary,seed,hooks);
  if(!result.ok) return result;
  const policy=checkTargetPolicy(result.level);
  if(!policy.ok) return {ok:false,code:policy.code,message:'生成目标不符合常用原形词 V2 白名单，整关已拒绝。',rejectedWords:policy.rejectedWords,stats:result.stats};
  return result;
}
