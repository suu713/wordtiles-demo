import {createBankDictionary,bankWordEntry} from './dictionary-banks.js?v=23';
import {collectionTheme,COLLECTION_THEMES} from './collection-themes.js?v=24';

function randomIndex(max){
  const value=new Uint32Array(1),limit=Math.floor(0x100000000/max)*max;
  do{globalThis.crypto.getRandomValues(value);}while(value[0]>=limit);
  return value[0]%max;
}
export function previewCollectionWords(existing,count=300){
  if(!Number.isInteger(count)||count<1||count>1000)throw new Error('收录数量应为1～1000');
  const owned=new Set(existing.filter(e=>e.language==='english').map(e=>e.word));
  const candidates=createBankDictionary([2,3,4,5,6,7,8,9,10]).words.filter(word=>!owned.has(word));
  if(candidates.length<count)throw new Error('未收录单词不足');
  const pools=new Map(COLLECTION_THEMES.map(theme=>[theme.id,[]]));
  for(const word of candidates)pools.get(collectionTheme(word,bankWordEntry(word))).push(word);
  const result=[];
  // Stratified random sampling keeps a 300-word preview useful in every theme.
  while(result.length<count)for(const pool of pools.values()){
    if(!pool.length)continue;
    const index=randomIndex(pool.length);result.push(pool[index]);pool[index]=pool.at(-1);pool.pop();
    if(result.length===count)break;
  }
  return result;
}

export function topUpPreviewCollection(collection,target=300){
  if(!Number.isInteger(target)||target<1||target>1000)throw new Error('预览数量应为1～1000');
  const entries=collection.entries(),owned=new Set(entries.map(entry=>entry.language+':'+entry.word)).size;
  const missing=Math.max(0,target-owned),words=missing?previewCollectionWords(entries,missing):[];
  const added=words.length?collection.collectMany(words):0;
  if(added!==missing||!collection.persistent)throw new Error('收录未保存，请重试');
  return {added,total:owned+added,words};
}
