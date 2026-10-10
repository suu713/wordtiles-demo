export const COLLECTION_KEY='wordtiles.collection.v1';
const languages=new Set(['english','portuguese','russian','spanish','turkish']);
const normalized=(word,language)=>typeof word==='string'&&/^\p{L}{1,45}$/u.test(word)&&languages.has(language)?{word:word.toUpperCase(),language}:null;

export function createWordCollection(storage,now=()=>new Date().toISOString()) {
  const collected=new Map();let persistent=true;
  try {
    const saved=JSON.parse(storage?.getItem(COLLECTION_KEY)||'null');
    if(saved?.version===1&&Array.isArray(saved.entries)) for(const entry of saved.entries) {
      const valid=normalized(entry?.word,entry?.language);
      if(valid&&typeof entry.firstFoundAt==='string') collected.set(valid.language+':'+valid.word,{...valid,firstFoundAt:entry.firstFoundAt});
    }
    if(!storage) persistent=false;
  } catch { persistent=false; }
  function save() {
    try { if(!storage) throw new Error('storage unavailable');storage.setItem(COLLECTION_KEY,JSON.stringify({version:1,entries:[...collected.values()]}));persistent=true; }
    catch { persistent=false; }
  }
  return {
    get size(){return collected.size;},get persistent(){return persistent;},
    entries(){return [...collected.values()].map(entry=>({...entry})).sort((a,b)=>a.word.localeCompare(b.word)||a.language.localeCompare(b.language));},
    collect(result,language='english') {
      if(!result||(result.accepted!==true&&result.reason!=='extra-word')||result.reason==='anomaly'||result.status==='anomaly') return false;
      const entry=normalized(result.word,language);if(!entry) return false;
      const key=entry.language+':'+entry.word;if(collected.has(key)) return false;
      collected.set(key,{...entry,firstFoundAt:now()});save();return true;
    },
  };
}
