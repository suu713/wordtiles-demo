import {createBaseDictionary, isTargetAllowed} from './target-policy.js?v=14';
import {WORD_ENTRIES, WORDLIST_VERSION, wordEntryFor} from './word-source.js?v=14';
export {WORD_ENTRIES, WORDLIST_VERSION, BONUS_DICTIONARY, wordEntryFor} from './word-source.js?v=14';
export const TIER_LABELS=Object.freeze({1:'非常常用',2:'常用',3:'一般',4:'罕见',5:'非常罕见'});
export const approvedWordCount=WORD_ENTRIES.filter(entry=>isTargetAllowed(entry.word)).length;
export function createFrequencyDictionary({wordLengths,tiers=[1,2,3],allowUnreviewed=false}) {
  if(allowUnreviewed!==false) throw new Error('不能放行原形白名单外的目标词。');
  if(!Array.isArray(tiers)||!tiers.length||!tiers.every(t=>Number.isInteger(t)&&t>=1&&t<=5)) throw new Error('新词表的档位必须为1～5。');
  const base=createBaseDictionary(wordLengths), selected=[...new Set(tiers)].sort((a,b)=>a-b);
  const words=base.words.filter(word=>selected.includes(wordEntryFor(word).tier));
  return {...base,version:base.version+'-t'+selected.join('_'),words,metadata:{...base.metadata,runtimeSelection:{lengths:[...new Set(wordLengths)],tiers:selected,allowUnreviewed:false}}};
}
