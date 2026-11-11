import {dataEpoch,sameDataEpoch} from './app-data.js?v=25';

export const SUMMIT_KEY='wordtiles.summit.v1';
export const SUMMIT_STEPS=12;
export const SUMMIT_REWARD=15;
const empty=()=>({version:1,totalSteps:0,coins:0,recent:[]});
function valid(value){
  return value?.version===1&&Number.isSafeInteger(value.totalSteps)&&value.totalSteps>=0&&value.totalSteps<=10000000&&
    Number.isSafeInteger(value.coins)&&value.coins>=0&&value.coins<=1000000000&&Array.isArray(value.recent)&&
    value.recent.length<=200&&value.recent.every(id=>typeof id==='string'&&id.length<=100);
}
export function summitAdvance(state){
  const fromStep=state.totalSteps%SUMMIT_STEPS,toStep=fromStep+1;
  return {fromStep,toStep,coinsBefore:state.coins,coinsAfter:state.coins+SUMMIT_REWARD,reward:SUMMIT_REWARD,
    totalSteps:state.totalSteps+1,peak:toStep===SUMMIT_STEPS,peaks:Math.floor((state.totalSteps+1)/SUMMIT_STEPS)};
}
export function createSummitProgress(storage){
  const epoch=dataEpoch(storage);let memory=empty(),persistent=!!storage,dirty=false;
  function snapshot(){
    if(!dirty)try{const value=JSON.parse(storage?.getItem(SUMMIT_KEY)||'null');if(valid(value))memory=value;}catch{persistent=false;}
    return structuredClone(memory);
  }
  function award(id){
    if(typeof id!=='string'||!id||id.length>100||!sameDataEpoch(storage,epoch))return null;
    const state=snapshot();if(state.recent.includes(id))return null;
    const result=summitAdvance(state);memory={version:1,totalSteps:result.totalSteps,coins:result.coinsAfter,recent:[...state.recent,id].slice(-200)};
    try{if(storage){storage.setItem(SUMMIT_KEY,JSON.stringify(memory));dirty=false;}else{persistent=false;dirty=true;}}catch{persistent=false;dirty=true;}
    return result;
  }
  return {snapshot,award,get persistent(){return persistent;}};
}
