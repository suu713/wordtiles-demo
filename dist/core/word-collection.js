import {bankContainsWord,WEB_BANK_VERSION,WORD_BANK_ORIGIN} from './dictionary-banks.js?v=1';
import {dataEpoch,sameDataEpoch} from './app-data.js?v=25';
const GAME_POLICY_VERSION=WEB_BANK_VERSION;
export const COLLECTION_KEY='wordtiles.collection.v1';
const languages=new Set(['english']);
const normalized=(word,language)=>typeof word==='string'&&/^\p{L}{1,45}$/u.test(word)&&languages.has(language)?{word:word.toUpperCase(),language}:null;

export function createWordCollection(storage,now=()=>new Date().toISOString()) {
  const epoch=dataEpoch(storage);
  const collected=new Map(),archived=new Map();let persistent=true,migratedCount=0;
  const isAllowed=entry=>entry.origin===WORD_BANK_ORIGIN&&bankContainsWord(entry.word,WORD_BANK_ORIGIN,entry.language);
  const keyFor=entry=>(entry.origin?entry.origin+':':'')+entry.language+':'+entry.word;
  try {
    const saved=JSON.parse(storage?.getItem(COLLECTION_KEY)||'null');
    if([1,2].includes(saved?.version)&&Array.isArray(saved.entries)) for(const entry of [...saved.entries,...(Array.isArray(saved.archivedEntries)?saved.archivedEntries:[])]) {
      const valid=normalized(entry?.word,entry?.language);
      if(valid)valid.origin=WORD_BANK_ORIGIN;
      if(valid&&typeof entry.firstFoundAt==='string') {
        const record={...valid,firstFoundAt:entry.firstFoundAt},key=keyFor(valid);
        if(isAllowed(valid)) {
          const prior=collected.get(key);
          if(!prior||record.firstFoundAt<prior.firstFoundAt)collected.set(key,record);
        }else {archived.set(key,record);migratedCount++;}
      }
    }
    if(!storage) persistent=false;
    else if([1,2].includes(saved?.version)&&(saved.version!==2||saved.policyVersion!==GAME_POLICY_VERSION||migratedCount))save();
  } catch { persistent=false; }
  function save() {
    try { if(!storage||!sameDataEpoch(storage,epoch)) throw new Error('storage unavailable or reset');storage.setItem(COLLECTION_KEY,JSON.stringify({version:2,policyVersion:GAME_POLICY_VERSION,entries:[...collected.values()],archivedEntries:[...archived.values()]}));persistent=true; }
    catch { persistent=false; }
  }
  function collect(result,language='english',origin=WORD_BANK_ORIGIN,persist=true){
    if(!sameDataEpoch(storage,epoch)||!result||(result.accepted!==true&&result.reason!=='extra-word')||result.reason==='anomaly'||result.status==='anomaly')return false;
    const entry=normalized(result.word,language);if(entry)entry.origin=WORD_BANK_ORIGIN;if(!entry||!isAllowed(entry))return false;
    const key=keyFor(entry);if(collected.has(key))return false;
    collected.set(key,{...entry,firstFoundAt:now()});if(persist)save();return true;
  }
  return {
    get size(){return collected.size;},get persistent(){return persistent;},get migratedCount(){return migratedCount;},
    entries(){return [...collected.values()].map(entry=>({...entry})).sort((a,b)=>a.word.localeCompare(b.word)||a.language.localeCompare(b.language));},
    collect,
    collectMany(words,language='english',origin=WORD_BANK_ORIGIN){let count=0;for(const word of words)if(collect({accepted:true,word},language,origin,false))count++;if(count)save();return count;},
  };
}
