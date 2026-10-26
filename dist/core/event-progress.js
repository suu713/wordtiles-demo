import {dataEpoch,sameDataEpoch} from './app-data.js?v=25';

export const EVENTS_KEY='wordtiles.events.v1';
export const WHEEL_REWARDS=[10,5,25,5,50,5];
export const WEEKLY_STAGES=[{target:15,coins:20},{target:30,coins:30},{target:20,coins:25},{target:40,coins:40},{target:60,coins:50},{target:45,coins:40},{target:90,coins:80},{target:60,coins:50},{target:75,coins:60},{target:120,coins:100},{target:90,coins:80},{target:120,coins:100},{target:60,coins:40},{target:180,coins:150},{target:90,coins:80},{target:240,coins:250}];
export function eventDate(date=new Date()) {return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;}
export function eventWeek(date=new Date()) {const start=new Date(date);start.setHours(0,0,0,0);start.setDate(start.getDate()-(start.getDay()+6)%7);const end=new Date(start);end.setDate(end.getDate()+7);return {key:eventDate(start),start,end};}
const blank=()=>({version:1,coins:0,gems:0,wheel:{},weekly:{},daily:{}});
const number=value=>Number.isSafeInteger(value)&&value>=0?value:0;
export function createEventProgress(storage,{now=()=>new Date(),random=()=>{if(globalThis.crypto?.getRandomValues){const sample=new Uint32Array(1);globalThis.crypto.getRandomValues(sample);return sample[0]/4294967296;}return Math.random();}}={}) {
  const epoch=dataEpoch(storage);let memory=blank(),persistent=!!storage;
  function read(){try{const value=JSON.parse(storage?.getItem(EVENTS_KEY)||'null');if(value?.version===1&&['wheel','weekly','daily'].every(key=>value[key]&&typeof value[key]==='object'&&!Array.isArray(value[key])))memory={...value,coins:number(value.coins),gems:number(value.gems)};}catch{persistent=false;}return structuredClone(memory);}
  function commit(state){if(!sameDataEpoch(storage,epoch))return false;memory=state;try{storage?.setItem(EVENTS_KEY,JSON.stringify(state));persistent=!!storage;}catch{persistent=false;}return true;}
  function snapshot(){const state=read(),date=eventDate(now()),week=eventWeek(now()),wheel=state.wheel[date]||{spins:0,rewards:[...WHEEL_REWARDS]},weekly=state.weekly[week.key]||{items:0,claimed:0};return {...state,date,week,wheel:{...wheel,spins:number(wheel.spins),rewards:Array.isArray(wheel.rewards)&&wheel.rewards.length===6?wheel.rewards:[...WHEEL_REWARDS]},weekly:{items:number(weekly.items),claimed:number(weekly.claimed)}};}
  function spin(){
    const state=read(),date=eventDate(now()),wheel=state.wheel[date]||{spins:0,rewards:[...WHEEL_REWARDS]};
    if(wheel.spins>=6||!sameDataEpoch(storage,epoch))return null;
    const weights=wheel.rewards.map(value=>100/value),total=weights.reduce((sum,w)=>sum+w,0);let pick=Math.max(0,Math.min(.999999999,random()))*total,slice=weights.length-1;
    for(let i=0;i<weights.length;i++){pick-=weights[i];if(pick<0){slice=i;break;}}
    const coins=wheel.rewards[slice];state.coins+=coins;wheel.spins++;wheel.rewards[slice]*=2;wheel.last={slice,coins};state.wheel={[date]:wheel};
    return commit(state)?{slice,coins,spins:wheel.spins}:null;
  }
  function addWeeklyItems(count=1){if(!Number.isSafeInteger(count)||count<1)return false;const state=read(),key=eventWeek(now()).key;const week=state.weekly[key]||{items:0,claimed:0};week.items+=count;state.weekly={[key]:week};return commit(state);}
  function weeklyStatus(){const value=snapshot().weekly,stage=WEEKLY_STAGES[Math.min(value.claimed,15)],spent=WEEKLY_STAGES.slice(0,Math.min(value.claimed,16)).reduce((sum,row)=>sum+row.target,0)+Math.max(0,value.claimed-16)*WEEKLY_STAGES[15].target;return {...value,stage,progress:Math.max(0,value.items-spent),number:value.claimed+1};}
  function claimWeekly(){const current=weeklyStatus();if(current.progress<current.stage.target)return null;const state=read(),key=eventWeek(now()).key;if((state.weekly[key]?.claimed||0)!==current.claimed)return null;state.weekly[key].claimed++;state.coins+=current.stage.coins;return commit(state)?current.stage.coins:null;}
  function daily(date=eventDate(now())){return read().daily[date]||null;}
  function saveDaily({levelId,seed,gemCells,paths,gemCount,finished}){
    const state=read(),key=eventDate(now()),prior=state.daily[key];
    const sameLevel=prior?.levelId===levelId;
    const record=sameLevel?prior:{levelId,seed,gemCells:[...gemCells],paths:[],gems:number(prior?.gems),finished:false};
    if(seed!==undefined)record.seed=seed;
    for(const path of paths){const signature=path.join(',');if(!record.paths.some(p=>p.join(',')===signature))record.paths.push([...path]);}
    const total=Math.min(gemCells.length,Math.max(record.gems,number(gemCount)));state.gems+=total-record.gems;record.gems=total;record.finished=record.finished||!!finished;state.daily[key]=record;return commit(state);
  }
  function claimGems(){const state=read();if(state.gems<50)return false;state.gems-=50;state.coins+=40;return commit(state);}
  return {snapshot,spin,addWeeklyItems,weeklyStatus,claimWeekly,daily,saveDaily,claimGems,get persistent(){return persistent;}};
}
