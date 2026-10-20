import {checkConfiguration, DEFAULT_CONFIG, LIMITS, clone} from './rules.js?v=21';
import {normalizeComposition,planTargetLengths,compositionCounts} from './target-composition.js?v=28';

export const BATCH_SIZES = Object.freeze([[3,2],[3,3],[4,2],[4,3],[5,3],[4,4],[5,4],[6,4],[6,5],[6,6]]);
const clamp = (n,a,b) => Math.max(a,Math.min(b,n));
function integer(value,min,max,label) {
  if (!Number.isInteger(value) || value<min || value>max) throw new Error(`${label}必须为${min}～${max}的整数`);
  return value;
}
export function normalizeBatchPlan(input, count) {
  const curve=input.curve||{};
  const plan={startNumber:integer(input.startNumber,1,1000000,'起始关号'),placement:input.placement||'after',
    curve:{enabled:curve.enabled!==false,start:integer(curve.start??5,0,100,'起点难度'),end:integer(curve.end??80,0,100,'终点难度'),
      rampLevels:integer(curve.rampLevels??60,1,10000,'爬升关数'),peakEvery:integer(curve.peakEvery??10,0,1000,'峰值间隔'),drop:integer(curve.drop??20,0,60,'峰后回落幅度')},
    targetMode:input.targetMode||'curve',fixedTargets:integer(input.fixedTargets??4,1,LIMITS.maxTargets,'每关目标词数'),
    startTargets:integer(input.startTargets??4,1,LIMITS.maxTargets,'起点目标词数'),endTargets:integer(input.endTargets??11,1,LIMITS.maxTargets,'终点目标词数'),
    maxUses:integer(input.maxUses??9,1,9,'每格使用上限'),minLength:integer(input.minLength??3,2,10,'最短词长'),maxLength:integer(input.maxLength??7,2,10,'最长词长'),
    repeatWindow:integer(input.repeatWindow??10,0,100,'相邻关卡避重范围'),minZipfEasy:Number(input.minZipfEasy??4.4),minZipfHard:Number(input.minZipfHard??2.8),
    maxRareTargets:integer(input.maxRareTargets??1,0,16,'最多低频目标词数'),sizes:input.sizes?.map(s=>({cols:s.cols,rows:s.rows}))||[],...(input.composition?{composition:normalizeComposition(input.composition)}:{})};
  integer(count,1,10000,'生成关数');
  if(!['after','before','end'].includes(plan.placement))throw new Error('请选择关卡插入位置');
  if(!['fixed','curve'].includes(plan.targetMode))throw new Error('请选择目标词数策略');
  if(plan.minLength>plan.maxLength)throw new Error('最短词长不能大于最长词长');
  if([plan.minZipfEasy,plan.minZipfHard].some(n=>!Number.isFinite(n)||n<0||n>8))throw new Error('词频门槛必须为0～8');
  if(!plan.sizes.length||plan.sizes.some(s=>![s.cols,s.rows].every(n=>Number.isInteger(n)&&n>=2&&n<=6)))throw new Error('至少选择一种有效的棋盘规格（2～6列/行）');
  plan.sizes=plan.sizes.filter((s,i,a)=>a.findIndex(t=>t.cols===s.cols&&t.rows===s.rows)===i);
  return plan;
}
export function difficultyAt(plan,index) {
  const c=plan.curve;
  const progress=c.rampLevels===1?1:clamp(index/(c.rampLevels-1),0,1);
  const base=c.start+(c.end-c.start)*progress;
  const number=plan.startNumber+index,phase=c.peakEvery?((number-1)%c.peakEvery):0;
  const lastPeak=number-phase-1;
  const dip=c.peakEvery>1&&lastPeak>=plan.startNumber?c.drop*(1-phase/(c.peakEvery-1)):0;
  return Math.round(clamp(base-dip,0,100));
}
export function targetCountAt(plan,index) {
  if(plan.targetMode==='fixed'||!plan.curve.enabled)return plan.fixedTargets;
  const {start,end}=plan.curve,d=difficultyAt(plan,index);
  const ratio=start===end?0:clamp((d-start)/(end-start),0,1);
  return Math.round(plan.startTargets+(plan.endTargets-plan.startTargets)*ratio);
}
export function planLevelOptions(plan,index,dictionary,engine='flexible',random=()=>.5) {
  const degree=difficultyAt(plan,index),targetCount=targetCountAt(plan,index);
  const minimumZipf=Number((plan.minZipfEasy+(plan.minZipfHard-plan.minZipfEasy)*degree/100).toFixed(2));
  if(engine==='supplied-v1')return [{config:clone(DEFAULT_CONFIG),degree,targetCount:5,minimumZipf,maxTurns:null,maxRareTargets:plan.maxRareTargets}];
  const counts=new Map();for(const w of dictionary.words)counts.set(w.length,(counts.get(w.length)||0)+1);
  const result=[];
  for(const shape of plan.sizes){
    const cells=shape.rows*shape.cols;let upper=Math.min(plan.maxLength,Math.max(plan.minLength,Math.round(4+(plan.maxLength-4)*degree/100)),cells);
    let lens=[...counts.keys()].filter(n=>n>=plan.minLength&&n<=upper).sort((a,b)=>a-b);
    if(plan.composition&&compositionCounts(targetCount,plan.composition).other>0&&!lens.some(n=>n!==3&&n!==4)){
      const shortestOther=[...counts.keys()].filter(n=>n>=plan.minLength&&n<=plan.maxLength&&n<=cells&&n!==3&&n!==4).sort((a,b)=>a-b)[0];
      if(shortestOther){upper=Math.max(upper,shortestOther);lens=[...counts.keys()].filter(n=>n>=plan.minLength&&n<=upper).sort((a,b)=>a-b);}
    }
    if(!lens.length)continue;
    const short=lens.filter(n=>n<=4),base=short.length?short:lens;
    const lengths=Array.from({length:targetCount},(_,i)=>base[i%base.length]);
    if(lengths.length)lengths[lengths.length-1]=lens.at(-1);
    // Coverage takes priority over the preferred short/long distribution.
    while(lengths.reduce((a,b)=>a+b,0)<cells&&lengths.some(n=>n<lens.at(-1))){const k=lengths.findLastIndex(n=>n<lens.at(-1));lengths[k]=lens.find(n=>n>lengths[k]);}
    if(plan.composition){try{lengths.splice(0,lengths.length,...planTargetLengths({...shape,targetCount,composition:plan.composition,maxUses:plan.maxUses},lens,random));}catch{continue;}}
    const total=lengths.reduce((a,b)=>a+b,0),required=Math.ceil(total/cells);
    const maxUses=Math.min(plan.maxUses,Math.max(required,Math.round(2+(plan.maxUses-2)*degree/100)));
    const config={rows:shape.rows,cols:shape.cols,wordLengths:lengths,maxUses};
    if(checkConfiguration(config,dictionary).valid)result.push({config,degree,targetCount,minimumZipf,maxTurns:2+Math.floor(degree/33),maxRareTargets:plan.maxRareTargets});
  }
  const idealCells=9+degree*.12;
  return result.sort((a,b)=>Math.abs(a.config.rows*a.config.cols-idealCells)-Math.abs(b.config.rows*b.config.cols-idealCells));
}
export function previewBatchPlan(plan,count,dictionary,engine) {
  const indices=[...new Set([0,count-1,...Array.from({length:Math.min(count,160)},(_,i)=>Math.round(i*(count-1)/Math.max(1,Math.min(count,160)-1)))])].sort((a,b)=>a-b);
  const points=indices.map(index=>({index,number:plan.startNumber+index,degree:difficultyAt(plan,index),targets:engine==='supplied-v1'?5:targetCountAt(plan,index)}));
  const first=planLevelOptions(plan,0,dictionary,engine)[0],last=planLevelOptions(plan,count-1,dictionary,engine)[0];
  if(!first||!last){if(!dictionary.words.some(w=>w.length>=plan.minLength&&w.length<=plan.maxLength))throw new Error(`所选词库没有 ${plan.minLength}～${plan.maxLength} 字的目标词，请调整词长范围。`);throw new Error('目标词数和词长无法覆盖所选棋盘，请增加目标词数、放宽词长或选择较小棋盘。');}
  return {points,first,last};
}
