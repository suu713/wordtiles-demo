import {createBaseDictionary,isTargetAllowed} from './target-policy.js?v=1';
import {WORD_ENTRIES,WORDLIST_VERSION,wordEntryFor} from './word-source.js?v=1';
export {WORD_ENTRIES,WORDLIST_VERSION,BONUS_DICTIONARY,wordEntryFor} from './word-source.js?v=1';
export const TIER_LABELS=Object.freeze({1:'范围库1级',2:'范围库2级',3:'范围库3级',4:'范围库4级'});
export const approvedWordCount=WORD_ENTRIES.filter(entry=>entry.role==='required'&&isTargetAllowed(entry.word)).length;
export function createFrequencyDictionary({wordLengths,tiers=[1,2,3,4],allowUnreviewed=false}){
  if(allowUnreviewed!==false)throw new Error('词库来源固定为 WT词库.xlsx。');
  if(!Array.isArray(tiers)||!tiers.length||!tiers.every(t=>Number.isInteger(t)&&t>=1&&t<=4))throw new Error('范围库档位必须为1～4。');
  const base=createBaseDictionary(wordLengths),selected=[...new Set(tiers)].sort((a,b)=>a-b);
  const words=base.words.filter(word=>selected.includes(wordEntryFor(word).rangeTier));
  return {...base,version:base.version+'-range'+selected.join('_'),words,metadata:{...base.metadata,tiers:selected}};
}
