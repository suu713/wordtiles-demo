// Zen package vocabulary is deliberately not bundled in this code-only release.
export const ZEN_GROUPS=Object.freeze({});
const unavailable=()=>({code:'ZEN_CONTENT_UNAVAILABLE',message:'Zen 原包关卡和词库未包含在此发布版本中。'});
export function createZenDictionary(){throw new Error(unavailable().message);}
export function zenDictionaryError(){return unavailable();}
export function zenTargetPolicy(){return {ok:false,...unavailable(),rejectedWords:[]};}
export function zenBonusDictionary(){throw new Error(unavailable().message);}
