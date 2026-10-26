import {ORIGINAL_ENGLISH_WORDS} from './word-source.js?v=1';
import {bankBonusDictionary} from './dictionary-banks.js?v=1';
import {ENGLISH_FREQUENCY} from './playtest-frequency.js?v=34';
const contexts=new WeakMap();
const reviewDictionary=Object.freeze({words:ORIGINAL_ENGLISH_WORDS,metadata:{complete:false,scope:'WT 工作簿全量必答词＋额外词；未接入外部完整审核词典'}});
export function qualityRuntimeContext(dictionary){
  if(!contexts.has(dictionary)){
    const extraDictionary=bankBonusDictionary(dictionary);
    contexts.set(dictionary,{mainDictionary:dictionary,extraDictionary,legalDictionary:extraDictionary,reviewDictionary,frequency:ENGLISH_FREQUENCY});
  }
  return contexts.get(dictionary);
}
