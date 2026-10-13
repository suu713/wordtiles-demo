import {sourceHasWord,packageHasWord,GAME_POLICY_VERSION} from './word-source.js?v=15';
export const COLLECTION_KEY='wordtiles.collection.v1';
const languages=new Set(['english','portuguese','russian','spanish','turkish']);
const normalized=(word,language)=>typeof word==='string'&&/^\p{L}{1,45}$/u.test(word)&&languages.has(language)?{word:word.toUpperCase(),language}:null;

export function createWordCollection(storage,now=()=>new Date().toISOString()) {
  const collected=new Map(),archived=new Map();let persistent=true,migratedCount=0;
  const isAllowed=entry=>packageHasWord(entry.word,entry.language)||(entry.language==='english'&&sourceHasWord(entry.word));
  try {
    const saved=JSON.parse(storage?.getItem(COLLECTION_KEY)||'null');
    if([1,2].includes(saved?.version)&&Array.isArray(saved.entries)) for(const entry of [...saved.entries,...(Array.isArray(saved.archivedEntries)?saved.archivedEntries:[])]) {
      const valid=normalized(entry?.word,entry?.language);
      if(valid&&typeof entry.firstFoundAt==='string') {
        const record={...valid,firstFoundAt:entry.firstFoundAt},key=valid.language+':'+valid.word;
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
    try { if(!storage) throw new Error('storage unavailable');storage.setItem(COLLECTION_KEY,JSON.stringify({version:2,policyVersion:GAME_POLICY_VERSION,entries:[...collected.values()],archivedEntries:[...archived.values()]}));persistent=true; }
    catch { persistent=false; }
  }
  return {
    get size(){return collected.size;},get persistent(){return persistent;},get migratedCount(){return migratedCount;},
    entries(){return [...collected.values()].map(entry=>({...entry})).sort((a,b)=>a.word.localeCompare(b.word)||a.language.localeCompare(b.language));},
    collect(result,language='english') {
      if(!result||(result.accepted!==true&&result.reason!=='extra-word')||result.reason==='anomaly'||result.status==='anomaly') return false;
      const entry=normalized(result.word,language);if(!entry||!isAllowed(entry)) return false;
      const key=entry.language+':'+entry.word;if(collected.has(key)) return false;
      collected.set(key,{...entry,firstFoundAt:now()});save();return true;
    },
  };
}
