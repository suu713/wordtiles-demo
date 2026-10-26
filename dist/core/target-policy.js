import {createWordGate} from './whitelist.js?v=1';
import {createBankDictionary,bankDictionaryError,bankTargetPolicy} from './dictionary-banks.js?v=1';
import {WORDLIST_VERSION,ORIGINAL_ENGLISH_TARGETS,wordEntryFor} from './word-source.js?v=1';

export const COMMON_DICTIONARY=Object.freeze({version:WORDLIST_VERSION,words:Object.freeze([...ORIGINAL_ENGLISH_TARGETS])});
export const POLICY_VERSION=WORDLIST_VERSION;
export const wordGate=createWordGate(COMMON_DICTIONARY);
export const isTargetAllowed=word=>wordGate.isAllowed(word)&&wordEntryFor(word)?.role==='required';
export function createBaseDictionary(lengths){return createBankDictionary(lengths);}
export function runtimeDictionaryError(dictionary){
  if(dictionary?.metadata?.origin!=='wt-workbook')return {code:'DICTIONARY_POLICY',message:'关卡仅允许使用 WT词库.xlsx。'};
  return bankDictionaryError(dictionary);
}
export function checkTargetPolicy(level,dictionary){
  if(dictionary?.metadata?.origin!=='wt-workbook')return {ok:false,code:'DICTIONARY_POLICY',rejectedWords:[]};
  return bankTargetPolicy(level,dictionary);
}
