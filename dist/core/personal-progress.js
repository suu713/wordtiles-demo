import {localCollectionDate} from './collection-calendar.js?v=16';
import {dataEpoch,sameDataEpoch} from './app-data.js?v=25';

export const PERSONAL_PROGRESS_KEY='wordtiles.personal-progress.v1';
const fields=['seconds','hints','mistakes','targets','completedLevels','starts'];
const blank=()=>Object.fromEntries(fields.map(key=>[key,0]));
function validRecord(record){
  return record?.mode==='manual'&&typeof record.id==='string'&&record.id.length<=100&&
    Number.isFinite(Date.parse(record.startedAt))&&Number.isFinite(Date.parse(record.updatedAt))&&
    record.days&&typeof record.days==='object'&&Object.entries(record.days).every(([day,values])=>
      /^\d{4}-\d{2}-\d{2}$/.test(day)&&fields.every(key=>Number.isFinite(values?.[key])&&values[key]>=0&&values[key]<=1000000));
}
export function createPersonalProgress(storage,{now=()=>new Date()}={}){
  const epoch=dataEpoch(storage);
  const records=new Map(),watchers=new WeakMap();let dirty=false,persistent=!!storage,lastSaved=0;
  function read(){try{const saved=JSON.parse(storage?.getItem(PERSONAL_PROGRESS_KEY)||'null');return saved?.version===1&&Array.isArray(saved.sessions)?saved.sessions.filter(validRecord):[];}catch{return [];}}
  for(const record of read())records.set(record.id,record);
  function flush(){
    if(!dirty||!sameDataEpoch(storage,epoch))return;
    try{
      if(!storage)throw new Error('Storage unavailable');
      // Keep other tabs' sessions. A session ID belongs to a single live tracker.
      for(const record of read())if(!records.has(record.id)||record.updatedAt>records.get(record.id).updatedAt)records.set(record.id,record);
      storage.setItem(PERSONAL_PROGRESS_KEY,JSON.stringify({version:1,sessions:[...records.values()]}));persistent=true;dirty=false;lastSaved=now().getTime();
    }catch{persistent=false;}
  }
  function observe(session,snapshot){
    if(!sameDataEpoch(storage,epoch)||!session||snapshot?.timeKind!=='real'||!snapshot.started)return false;
    const date=now(),stamp=date.getTime();if(!Number.isFinite(stamp))return false;
    let watch=watchers.get(session);
    if(!watch){
      const record={id:globalThis.crypto?.randomUUID?.()||`${stamp}-${Math.random()}`,mode:'manual',startedAt:date.toISOString(),updatedAt:date.toISOString(),days:{}};
      watch={record,lastAt:stamp,seconds:0,hints:0,mistakes:0,targets:0,won:false};watchers.set(session,watch);records.set(record.id,record);
      record.days[localCollectionDate(date)]={...blank(),starts:1};dirty=true;
    }
    const {record}=watch,day=localCollectionDate(date);
    const today=()=>record.days[day]??(record.days[day]=blank());
    const totalSeconds=Math.max(0,Number(snapshot.elapsedSeconds)||0),delta=Math.max(0,totalSeconds-watch.seconds);
    if(delta){
      // Split active time at local midnight. Paused wall-clock gaps add no time.
      let cursor=Math.max(watch.lastAt,stamp-delta*1000),duration=Math.max(0,stamp-cursor);
      if(!duration)today().seconds+=delta;
      else while(cursor<stamp){
        const at=new Date(cursor),key=localCollectionDate(at),midnight=new Date(at);midnight.setHours(24,0,0,0);
        const end=Math.min(stamp,midnight.getTime()),share=(end-cursor)/duration;
        (record.days[key]??(record.days[key]=blank())).seconds+=delta*share;cursor=end;
      }
      dirty=true;
    }
    let event=false;
    const counters={hints:Math.max(0,Number(snapshot.hints)||0),mistakes:Math.max(0,Number(snapshot.mistakes)||0),targets:session.completed?.size??session.completedCount??0};
    for(const [key,value] of Object.entries(counters)){const added=Math.max(0,value-watch[key]);if(added){today()[key]+=added;event=true;dirty=true;}watch[key]=Math.max(watch[key],value);}
    if(!watch.won&&session.status==='won'&&snapshot.finished){today().completedLevels++;watch.won=true;event=true;dirty=true;}
    watch.seconds=Math.max(watch.seconds,totalSeconds);watch.lastAt=stamp;record.updatedAt=date.toISOString();
    if(event||snapshot.finished||stamp-lastSaved>=5000)flush();
    return true;
  }
  return {observe,flush,get persistent(){return persistent;},entries(){for(const record of read())if(!records.has(record.id)||record.updatedAt>records.get(record.id).updatedAt)records.set(record.id,record);return [...records.values()].map(record=>structuredClone(record));}};
}
