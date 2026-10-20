import input from '../common-v2/dictionary.json?v=15' with {type:'json'};
import blocks from '../common-v2/blocked-words.json?v=15' with {type:'json'};
import {WORD_ENTRIES,WORDLIST_HASH,WORDLIST_VERSION,ORIGINAL_ENGLISH_WORDS,ORIGINAL_ENGLISH_TARGETS,packageHasWord,wordEntryFor} from './word-source.js?v=15';

// This code-only release keeps using the reviewed vocabulary already present in
// the repository. New package extracts and their combined word bank are omitted.
export const WEB_BANK_VERSION='reviewed-'+input.version+'-'+WORDLIST_VERSION;
const packageWords=new Set(ORIGINAL_ENGLISH_WORDS);
const packageTargets=new Set(ORIGINAL_ENGLISH_TARGETS);
const sourceWords=new Set(WORD_ENTRIES.map(entry=>entry.word));
const blocked=new Set(blocks.words);
const approvedCommon=new Set(input.words.filter(word=>sourceWords.has(word)&&(packageHasWord(word)||!blocked.has(word))));
const targetBanks={
  'web-supplied':[...new Set([...approvedCommon,...packageTargets])].sort(),
  'wt-package':[...packageTargets].sort()
};
const targetBankSets=Object.fromEntries(Object.entries(targetBanks).map(([origin,words])=>[origin,new Set(words)]));
const bonusBanks={
  'web-supplied':[...sourceWords].sort(),
  'wt-package':[...packageWords].sort()
};
const hashes={'web-supplied':WORDLIST_HASH,'wt-package':WORDLIST_HASH};
export const BANK_NAMES=Object.freeze({'web-supplied':'审核词库','wt-package':'WT 原包词库',zen:'Zen 词库未随代码版发布'});
export const WEB_BANK_STATISTICS=Object.freeze({totalWords:sourceWords.size,targetWords:targetBanks['web-supplied'].length});

export function bankWordEntry(word,origin=null){
  const key=typeof word==='string'?word.toUpperCase():'';
  if(origin==='wt-package'&&!packageHasWord(key,'english'))return null;
  return wordEntryFor(key);
}
export function bankContainsWord(word,origin,language='english'){
  const key=typeof word==='string'?word.toUpperCase():'';
  if(origin==='web-supplied')return language==='english'&&targetBankSets['web-supplied'].has(key);
  if(origin==='wt-package')return packageHasWord(key,language);
  return false;
}
export function createBankDictionary(lengths,origin='web-supplied',tiers=null){
  if(!targetBanks[origin])throw new Error('请选择当前版本提供的审核词库或 WT 原包词库');
  const selected=[...new Set(lengths)].sort((a,b)=>a-b);
  if(!selected.length||selected.some(n=>!Number.isInteger(n)||n<2||n>10))throw new Error('目标词长必须为2～10');
  const grades=tiers?[...new Set(tiers)].sort((a,b)=>a-b):null;
  if(grades?.some(n=>!Number.isInteger(n)||n<1||n>5))throw new Error('词频档位必须为1～5');
  const words=targetBanks[origin].filter(word=>selected.includes(word.length));
  const sourceSha256=hashes[origin];
  return {version:'reviewed-'+origin+'-'+WEB_BANK_VERSION+'-s'+sourceSha256.slice(0,12)+'-l'+selected.join('_')+(grades?'-t'+grades.join('_'):''),words,
    metadata:{origin,sourceSha256,sourceFile:origin==='wt-package'?'WT 原包审核目标':'仓库已有审核词库',lengths:selected,tiers:grades,
      sourceKind:'existing-reviewed-vocabulary',sourceVersion:WEB_BANK_VERSION,totalWords:WEB_BANK_STATISTICS.totalWords}};
}
export function bankDictionaryError(dictionary){
  const m=dictionary?.metadata;let expected;
  try{expected=createBankDictionary(m.lengths,m.origin,m.tiers);}catch{return {code:'DICTIONARY_POLICY',message:'词库来源或词长参数无效'};}
  if(m.sourceSha256!==expected.metadata.sourceSha256||dictionary.version!==expected.version||!Array.isArray(dictionary.words)||dictionary.words.length!==expected.words.length||dictionary.words.some((word,index)=>word!==expected.words[index]))
    return {code:'DICTIONARY_POLICY',message:'词库与当前选择的审核来源或版本不一致'};
  return null;
}
export function bankBonusDictionary(dictionary){
  const error=bankDictionaryError(dictionary);if(error)throw new Error(error.message);
  return {version:dictionary.version+'-bonus',metadata:dictionary.metadata,words:bonusBanks[dictionary.metadata.origin]};
}
export function bankTargetPolicy(level,dictionary){
  const error=bankDictionaryError(dictionary);if(error)return {ok:false,code:error.code,rejectedWords:[]};
  const words=new Set(dictionary.words),rejectedWords=(level.targets||[]).filter(target=>!words.has(target.word)).map(target=>target.word);
  return {ok:!!level.targets?.length&&!rejectedWords.length,code:'BANK_TARGET_POLICY',rejectedWords};
}
export function bankLengthRange(origin='web-supplied'){
  return [...new Set((targetBanks[origin]||[]).map(word=>[...word].length))].filter(length=>length>=2&&length<=10).sort((a,b)=>a-b);
}
export function recommendedLengths(rows,cols,available=[2,3,4,5,6,7,8,9,10],requestedCount=null){
  const cells=rows*cols,lens=[...new Set(available.filter(length=>length<=cells&&length>=2&&length<=10))].sort((a,b)=>a-b);
  if(!lens.length)return [];
  if(requestedCount!==null&&(!Number.isInteger(requestedCount)||requestedCount<1||requestedCount>16))return [];
  const slots=requestedCount??Math.min(16,Math.max(3,Math.ceil(cells/5)+1));
  const preferred=cells<=16?[2,3,4,5,6]:[3,4,5,6,7,8,9,10];
  const options=preferred.filter(length=>lens.includes(length));if(!options.length)options.push(...lens);
  const result=Array.from({length:slots},(_,index)=>options[Math.min(index,options.length-1)]);
  while(result.reduce((a,b)=>a+b,0)<cells&&result.some(length=>length<lens.at(-1))){const index=result.findIndex(length=>length<lens.at(-1));result[index]=lens.find(length=>length>result[index]);}
  const capacity=cells*Math.min(3,slots);
  while(result.reduce((a,b)=>a+b,0)>capacity&&result.some(length=>length>lens[0])){const highest=Math.max(...result),index=result.indexOf(highest);result[index]=lens.filter(length=>length<highest).at(-1);}
  return result;
}
