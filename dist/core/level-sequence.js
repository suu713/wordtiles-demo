import {clone} from './rules.js?v=21';
import {dataEpoch,sameDataEpoch} from './app-data.js?v=25';
export function levelFingerprint(level) {
  const b=level.board||{};
  return JSON.stringify({rows:b.rows||level.rows,cols:b.cols||level.cols,letters:b.letters||level.letters,counts:b.counts||level.initialCounts,targets:level.targets.map(t=>t.word).sort()});
}
export class LevelSequence {
  constructor(){this.groups=new Map();this.dictionaries=new Map();this.keys=new Set();}
  origin(entry){return entry.dictionary.metadata?.origin||'legacy-web';}
  list(origin){return this.groups.get(origin)||[];}
  find(level,dictionary){const origin=dictionary.metadata?.origin||'legacy-web',key=origin+':'+levelFingerprint(level);return this.list(origin).find(e=>e.dictionary.version===dictionary.version&&e.key===key);}
  insert(entry,{index,number}={}) {
    const origin=this.origin(entry),list=this.list(origin),key=origin+':'+levelFingerprint(entry.level);
    if(this.keys.has(key))return null;
    index=index??list.length;
    if(!Number.isInteger(index)||index<0||index>list.length)throw new Error('关卡插入位置无效');
    number=number??(index?list[index-1].number+1:1);
    if(!Number.isInteger(number)||number<1||(index&&number<=list[index-1].number))throw new Error('起始关号必须大于前一关的关号');
    if(!this.dictionaries.has(entry.dictionary.version))this.dictionaries.set(entry.dictionary.version,entry.dictionary);
    const item={level:clone(entry.level),dictionary:this.dictionaries.get(entry.dictionary.version),number,key};
    list.splice(index,0,item);this.groups.set(origin,list);this.keys.add(key);
    for(let i=index;i<list.length;i++){list[i].number=number+i-index;list[i].level.source={...list[i].level.source,editorNumber:list[i].number};}
    return item;
  }
  replace(item,level){
    const key=this.origin(item)+':'+levelFingerprint(level);
    if(key!==item.key&&this.keys.has(key))throw new Error('修改后的棋盘和目标已在该词库关序中存在');
    this.keys.delete(item.key);this.keys.add(key);item.key=key;item.level=clone(level);item.level.source={...item.level.source,editorNumber:item.number};
  }
  serialize(origin){const entries=origin?this.list(origin):[...this.groups.values()].flat(),versions=new Set(entries.map(e=>e.dictionary.version));return {schemaVersion:1,dictionaries:[...this.dictionaries.values()].filter(d=>versions.has(d.version)),levels:entries.map(e=>({level:e.level,dictionaryVersion:e.dictionary.version,number:e.number}))};}
  restore(snapshot,validate){
    if(snapshot?.schemaVersion!==1||!Array.isArray(snapshot.dictionaries)||!Array.isArray(snapshot.levels))throw new Error('保存的关序格式无效');
    const dictionaries=new Map(snapshot.dictionaries.map(d=>[d.version,d]));let rejected=0;
    for(const e of snapshot.levels){try{const dictionary=dictionaries.get(e.dictionaryVersion);if(!dictionary)throw new Error('缺少词库');validate(e.level,dictionary);this.insert({level:e.level,dictionary},{number:e.number});}catch{rejected++;}}
    return {restored:[...this.groups.values()].reduce((n,g)=>n+g.length,0),rejected};
  }
}
export async function openSequenceStorage() {
  if(typeof indexedDB==='undefined')return null;
  let storage;try{storage=globalThis.localStorage;}catch{}
  const epoch=dataEpoch(storage);
  const db=await new Promise((resolve,reject)=>{const r=indexedDB.open('wordtiles-generated-sequence',1);r.onupgradeneeded=()=>r.result.createObjectStore('state');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
  const transact=(mode,value)=>new Promise((resolve,reject)=>{const t=db.transaction('state',mode),s=t.objectStore('state'),r=mode==='readonly'?s.get('sequence'):s.put(value,'sequence');let result;r.onsuccess=()=>result=r.result;t.oncomplete=()=>resolve(result);t.onerror=()=>reject(t.error);t.onabort=()=>reject(t.error||new Error('关序保存失败'));});
  return {load:()=>transact('readonly'),save:snapshot=>sameDataEpoch(storage,epoch)?transact('readwrite',snapshot):Promise.resolve(),close:()=>db.close()};
}
