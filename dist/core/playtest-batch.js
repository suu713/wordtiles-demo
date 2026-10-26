import {SimulationRun} from './playtest.js?v=46';
import {createPlaySession} from './play-session.js?v=40';
import {operationMetrics} from './playtest-metrics.js?v=46';

export function selectSimulationRange(entries,start,end,repeats) {
  if(!Number.isSafeInteger(repeats)||repeats<1||repeats>1000)throw new Error('每关试玩次数请填写 1～1000 的整数');
  if(![start,end].every(Number.isSafeInteger)||start<1||end<start)throw new Error('请填写有效的起始关号和结束关号');
  const count=end-start+1;
  if(count>10000||count*repeats>200000)throw new Error('每批最多 10,000 关、200,000 局，请缩小范围或每关次数');
  const selected=entries.filter(entry=>entry.number>=start&&entry.number<=end).sort((a,b)=>a.number-b.number);
  for(let index=0;index<count;index++)if(selected[index]?.number!==start+index)throw new Error(`第 ${start+index} 关尚未保存在关序中，请先生成或导入`);
  if(selected.length!==count)throw new Error('关序存在重复关号，请检查关卡数据');
  return selected;
}

const MEANS={elapsedSeconds:'meanSeconds',completed:'meanCompleted',bonusWords:'meanBonusWords',scans:'meanScans',turnOperations:'meanTurnOperations',reverseConnections:'meanReverseConnections',hints:'meanHints',mistakes:'meanMistakes',attempts:'meanAttempts',trialSwipes:'meanTrialSwipes',failedSwipes:'meanFailedSwipes',knownCount:'meanKnownCount',knownRate:'meanKnownRate',knownMissedTargets:'meanKnownMissedTargets',missedRecognitions:'meanMissedRecognitions',knownUnsolvedTargets:'meanKnownUnsolvedTargets'};
class TimeHeap {
  constructor(direction){this.direction=direction;this.values=[];}
  push(value){const a=this.values;let index=a.length;a.push(value);while(index){const parent=(index-1)>>1;if(this.direction*(a[parent]-value)<=0)break;a[index]=a[parent];index=parent;}a[index]=value;}
  pop(){const a=this.values,first=a[0],last=a.pop();if(a.length){let index=0;while(index*2+1<a.length){let child=index*2+1;if(child+1<a.length&&this.direction*(a[child+1]-a[child])<0)child++;if(this.direction*(last-a[child])<=0)break;a[index]=a[child];index=child;}a[index]=last;}return first;}
}
// Keep the existing percentile convention (upper middle for even samples).
// Two heaps avoid sorting up to 200,000 range samples on every progress update.
class CompletionTimes {
  constructor(){this.lower=new TimeHeap(-1);this.upper=new TimeHeap(1);}
  add(value){if(!Number.isFinite(value)||value<0)return;const {lower,upper}=this;if(!upper.values.length||value>=upper.values[0])upper.push(value);else lower.push(value);if(upper.values.length>lower.values.length+1)lower.push(upper.pop());if(lower.values.length>upper.values.length)upper.push(lower.pop());}
  get median(){return this.upper.values[0]??null;}
}
// Keep memory bounded across large ranges; every valid run carries equal weight.
export class SimulationTotals {
  constructor(){this.attempted=0;this.samples=0;this.wins=0;this.sums={};this.counts={};this.completionTimes=new CompletionTimes();}
  add(run){
    this.attempted++;
    if(!['won','gave-up'].includes(run.outcome))return;
    this.samples++;this.wins+=Number(run.outcome==='won');
    if(run.outcome==='won')this.completionTimes.add(run.elapsedSeconds);
    for(const key of Object.keys(MEANS))if(Number.isFinite(run[key])){this.sums[key]=(this.sums[key]||0)+run[key];this.counts[key]=(this.counts[key]||0)+1;}
  }
  snapshot(){return {attempted:this.attempted,samples:this.samples,wins:this.wins,winRate:this.samples?this.wins/this.samples:null,errors:this.attempted-this.samples,medianWinSeconds:this.completionTimes.median,
    ...Object.fromEntries(Object.entries(MEANS).map(([key,mean])=>[mean,this.counts[key]?this.sums[key]/this.counts[key]:null]))};}
}

// A fresh session resets all counts, solved words and hints for every sample.
// No behavior seed is supplied: each sample uses independent system randomness.
export function* simulateLevelBatch(level,dictionary,{repeats,frequency,profile}={}) {
  if(!Number.isSafeInteger(repeats)||repeats<1||repeats>1000)throw new Error('批量试玩次数请填写 1～1000 的整数');
  for(let repeat=1;repeat<=repeats;repeat++) {
    try {
      const session=createPlaySession(level,dictionary);
      const {events,wordStats,profile:runProfile,...summary}=new SimulationRun(session,{frequency,profile,mode:'ordinary'}).run();
      yield {...summary,...operationMetrics(session.initial,events),repeat};
    } catch(error) {
      yield {mode:'ordinary',outcome:'error',runId:crypto.randomUUID(),repeat,error:error.message};
    }
  }
}
