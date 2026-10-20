import { generateLevel as generateRaw, GENERATOR_VERSION } from './wordtiles-algorithm.js?v=15';
import { runtimeDictionaryError, checkTargetPolicy } from './target-policy.js?v=21';
import {generateLevel as generateFlexible} from './generator.js?v=21';
import {DEFAULT_CONFIG} from './rules.js?v=21';
export { GENERATOR_VERSION };

// The supplied engine remains intact. Every live algorithm2 search goes through
// this policy gate before search and before its result can reach the importer.
export function generateLevel(config,dictionary,seed,hooks) {
  const error=runtimeDictionaryError(dictionary);
  if(error) return {ok:false,...error};
  if(hooks?.candidateWords){const allowed=new Set(dictionary.words);if(!Array.isArray(hooks.candidateWords)||hooks.candidateWords.some(w=>!allowed.has(w)))return {ok:false,code:'DICTIONARY_POLICY',message:'生成候选不属于所选词库'};}
  let result;
  if(hooks?.engine!=='supplied-v1'&&(hooks?.levelConfig||['web-supplied','wt-package'].includes(dictionary.metadata?.origin))){
    const generated=generateFlexible(dictionary,seed,{config:hooks?.levelConfig||DEFAULT_CONFIG,budget:config,onProgress:hooks?.onProgress,isCancelled:hooks?.isCancelled,candidateWords:hooks?.candidateWords,constraints:hooks?.constraints});
    result={ok:generated.success,level:generated.level,validation:generated.validation,stats:generated.stats,code:generated.success?undefined:generated.reason,message:generated.message};
    if(result.ok){result.level.dictionaryVersion=dictionary.version;result.level.kind='web';result.level.source={language:'english',dictionaryOrigin:dictionary.metadata.origin,dictionaryVersion:dictionary.version,dictionaryMetadata:dictionary.metadata,sourceSha256:dictionary.metadata.sourceSha256};}
  }else result=generateRaw(config,hooks?.candidateWords?{...dictionary,words:hooks.candidateWords}:dictionary,seed,hooks);
  if(!result.ok) return result;
  if(['web-supplied','wt-package','zen'].includes(dictionary.metadata?.origin)){
    result.level.kind='web';result.level.source={...result.level.source,language:'english',dictionaryOrigin:dictionary.metadata.origin,dictionaryVersion:dictionary.version,dictionaryMetadata:dictionary.metadata,sourceSha256:dictionary.metadata.sourceSha256,generationEngine:hooks?.engine||(result.level.rulesVersion==='wordtiles-v1'?'supplied-v1':'flexible')};
  }
  const policy=checkTargetPolicy(result.level,dictionary);
  if(!policy.ok) return {ok:false,code:policy.code,message:'生成目标不符合常用原形词 V2 白名单，整关已拒绝。',rejectedWords:policy.rejectedWords,stats:result.stats};
  return result;
}
