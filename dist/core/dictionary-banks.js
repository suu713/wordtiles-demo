import {WORD_ENTRIES,WORDLIST_HASH,WORDLIST_VERSION,ORIGINAL_ENGLISH_WORDS,ORIGINAL_ENGLISH_TARGETS,BONUS_DICTIONARY,wordEntryFor} from './word-source.js?v=1';

export const WEB_BANK_VERSION=WORDLIST_VERSION;
export const WORD_BANK_ORIGIN='wt-workbook';
const targetEntries=WORD_ENTRIES.filter(entry=>entry.role==='required');
const targetWords=Object.freeze(targetEntries.map(entry=>entry.word).sort());
const targetSet=new Set(targetWords),allWords=new Set(ORIGINAL_ENGLISH_WORDS);
const targetSetByLength=new Map();
for(const entry of targetEntries){if(!targetSetByLength.has(entry.word.length))targetSetByLength.set(entry.word.length,[]);targetSetByLength.get(entry.word.length).push(entry);}
export const BANK_NAMES=Object.freeze({[WORD_BANK_ORIGIN]:'WT词库.xlsx'});
export const WEB_BANK_STATISTICS=Object.freeze({totalWords:WORD_ENTRIES.length,targetWords:targetWords.length,extraWords:WORD_ENTRIES.length-targetWords.length});

export function bankWordEntry(word,origin=null){
  if(origin&&origin!==WORD_BANK_ORIGIN)return null;
  return wordEntryFor(word);
}
export function bankContainsWord(word,origin=WORD_BANK_ORIGIN,language='english'){
  const key=typeof word==='string'?word.toUpperCase():'';
  return language==='english'&&(!origin||origin===WORD_BANK_ORIGIN)&&allWords.has(key);
}
export function createBankDictionary(lengths,origin=WORD_BANK_ORIGIN,tiers=null){
  if(origin!==WORD_BANK_ORIGIN)throw new Error('网页只使用 WT词库.xlsx');
  if(!Array.isArray(lengths)||!lengths.length||lengths.some(n=>!Number.isInteger(n)||n<2||n>10))throw new Error('目标词长必须为2～10');
  const availableLengths=[...targetSetByLength.keys()].sort((a,b)=>a-b);
  const selected=[...new Set(lengths)].filter(n=>availableLengths.includes(n)).sort((a,b)=>a-b);
  if(!selected.length)throw new Error('WT词库.xlsx 的必答词仅有3～8个字母');
  const grades=tiers?[...new Set(tiers)].sort((a,b)=>a-b):null;
  if(grades?.some(n=>!Number.isInteger(n)||n<1||n>4))throw new Error('范围库档位必须为1～4');
  const words=targetEntries.filter(entry=>selected.includes(entry.word.length)&&(!grades||grades.includes(entry.rangeTier))).map(entry=>entry.word).sort();
  if(!words.length)throw new Error('所选词长和范围库没有可用必答词');
  const sourceSha256=WORDLIST_HASH;
  return {version:`${WORDLIST_VERSION}-l${selected.join('_')}${grades?'-r'+grades.join('_'):''}`,words,
    metadata:{origin:WORD_BANK_ORIGIN,sourceSha256,sourceFile:'wt词库.xlsx',sourceSheet:'必答词',lengths:selected,tiers:grades,
      sourceKind:'user-workbook',sourceVersion:WORDLIST_VERSION,totalWords:targetWords.length}};
}
export function bankDictionaryError(dictionary){
  const m=dictionary?.metadata;let expected;
  try{expected=createBankDictionary(m?.lengths, m?.origin, m?.tiers);}catch{return {code:'DICTIONARY_POLICY',message:'关卡必须使用 WT词库.xlsx 的必答词'};}
  if(m.sourceSha256!==expected.metadata.sourceSha256||dictionary.version!==expected.version||!Array.isArray(dictionary.words)||dictionary.words.length!==expected.words.length||dictionary.words.some((word,index)=>word!==expected.words[index]))
    return {code:'DICTIONARY_POLICY',message:'词库版本或必答词范围与 WT词库.xlsx 不一致'};
  return null;
}
export function bankBonusDictionary(dictionary){
  const error=bankDictionaryError(dictionary);if(error)throw new Error(error.message);
  return {version:BONUS_DICTIONARY.version,words:BONUS_DICTIONARY.words,
    metadata:{origin:WORD_BANK_ORIGIN,sourceSha256:WORDLIST_HASH,sourceFile:'wt词库.xlsx',sourceSheet:'必答词＋额外词',
      sourceKind:'user-workbook',sourceVersion:WORDLIST_VERSION,totalWords:BONUS_DICTIONARY.words.length}};
}
export function bankTargetPolicy(level,dictionary){
  const error=bankDictionaryError(dictionary);if(error)return {ok:false,code:error.code,rejectedWords:[]};
  const words=new Set(dictionary.words),rejectedWords=(level.targets||[]).filter(target=>!words.has(target.word)).map(target=>target.word);
  return {ok:!!level.targets?.length&&!rejectedWords.length,code:'BANK_TARGET_POLICY',rejectedWords};
}
export function bankLengthRange(origin=WORD_BANK_ORIGIN){
  if(origin!==WORD_BANK_ORIGIN)return [];
  return [...targetSetByLength.keys()].sort((a,b)=>a-b);
}
export function recommendedLengths(rows,cols,available=bankLengthRange(),requestedCount=null){
  const cells=rows*cols,lens=[...new Set(available.filter(length=>length<=cells&&length>=3&&length<=8))].sort((a,b)=>a-b);
  if(!lens.length)return [];
  if(requestedCount!==null&&(!Number.isInteger(requestedCount)||requestedCount<1||requestedCount>16))return [];
  const slots=requestedCount??Math.min(16,Math.max(3,Math.ceil(cells/5)+1));
  const preferred=cells<=16?[3,4,5]:[3,4,5,6,7,8];
  const options=preferred.filter(length=>lens.includes(length));if(!options.length)options.push(...lens);
  const result=Array.from({length:slots},(_,index)=>options[Math.min(index,options.length-1)]);
  while(result.reduce((a,b)=>a+b,0)<cells&&result.some(length=>length<lens.at(-1))){const index=result.findIndex(length=>length<lens.at(-1));result[index]=lens.find(length=>length>result[index]);}
  const capacity=cells*Math.min(3,slots);
  while(result.reduce((a,b)=>a+b,0)>capacity&&result.some(length=>length>lens[0])){const highest=Math.max(...result),index=result.indexOf(highest);result[index]=lens.filter(length=>length<highest).at(-1);}
  return result;
}
