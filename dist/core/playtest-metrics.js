import { calculateLevelStatistics } from './level-statistics.js?v=15';
import {spatialLevelMetrics} from './spatial-perception.js?v=46';

export function pathMetrics(path,board,bottomUp=false) {
  if(!Array.isArray(path)||!board)return {turns:null,reverse:null};
  let turns=0;
  for(let i=2;i<path.length;i++)if(path[i]-path[i-1]!==path[i-1]-path[i-2])turns++;
  const start=path[0],end=path.at(-1),row=cell=>bottomUp?board.rows-1-Math.floor(cell/board.cols):Math.floor(cell/board.cols);
  const reverse=path.length>1&&(end%board.cols<start%board.cols||row(end)<row(start));
  return {turns,reverse};
}
const gcd=(a,b)=>b?gcd(b,a%b):a;
export const TARGET_LENGTH_RATIO_ORDER=Object.freeze([3,4,5,6]);
export const TARGET_LENGTH_RATIO_TITLE='目标词长分布（3：4：5：6）';
export const targetLengthRatio=lengths=>lengths?TARGET_LENGTH_RATIO_ORDER.map(length=>lengths[length]||0).join('：'):null;
export function levelMetrics(level,dictionary=null) {
  const zen=level.kind==='zen',words=zen?level.targets:level.targets.map(t=>t.word),lengths={};
  for(const word of words){const length=[...word].length;lengths[length]=(lengths[length]||0)+1;}
  const counts=[3,4,5].map(n=>lengths[n]||0),divisor=counts.reduce(gcd,0)||1;
  const wordLengthRatio=targetLengthRatio(lengths);
  const stats=zen?null:calculateLevelStatistics(level,dictionary||{words:words,version:'metrics-target-only'});
  const extraWords=zen?[...new Set([...(level.wordRoles.extra||[]),...(level.wordRoles.onlyExtra||[]),...(level.wordRoles.bonus||[])].filter(w=>!words.includes(w)))]:stats.extraWords;
  const extras=extraWords.length,extraWordLengths={},wordLengthShares={};
  for(const word of extraWords){const length=[...word].length;extraWordLengths[length]=(extraWordLengths[length]||0)+1;}
  for(const [length,count] of Object.entries(lengths))wordLengthShares[length]=words.length?count/words.length:0;
  const {words:spatialWords,applicable:spatialApplicable,...spatial}=spatialLevelMetrics(level);
  return {targetCount:words.length,wordCount:words.length+extras,extras,wordLengths:lengths,extraWordLengths,wordLengthShares,wordLengthRatio,wordLengthRatioOrder:[...TARGET_LENGTH_RATIO_ORDER],
    spatialApplicable,...spatial,
    length2:lengths[2]||0,length3:lengths[3]||0,length4:lengths[4]||0,length5:lengths[5]||0,
    share3:words.length?(lengths[3]||0)/words.length:0,share4:words.length?(lengths[4]||0)/words.length:0,share5:words.length?(lengths[5]||0)/words.length:0,
    ratio345:counts.map(n=>n/divisor).join(':') ,cols:level.board?.cols??null,rows:level.board?.rows??null,
    totalTurns:stats?stats.targetPaths.reduce((s,t)=>s+t.turns,0):null,reverseTargets:stats?.reverseWordCount??null,
    sharedTiles:stats?stats.tileUses.filter(n=>n>=2).length:null,maxTileUses:stats?Math.max(...stats.tileUses):null,
    straightWords:stats?.straightWordCount??null,multiTurnTargets:stats?.multiTurnWordCount??null};
}
export function operationMetrics(level,events) {
  if(level.kind==='zen')return {turnOperations:null,reverseConnections:null};
  let turnOperations=0,reverseConnections=0;
  for(const e of events||[])if(e.type==='submit'&&Array.isArray(e.value)) {
    const m=pathMetrics(e.value,level.board,level.algorithm===1);turnOperations+=m.turns;reverseConnections+=Number(m.reverse);
  }
  return {turnOperations,reverseConnections};
}
export class SessionMetrics {
  constructor(session,{now=()=>performance.now()}={}) {
    this.session=session;this.now=now;this.elapsed=0;this.runningSince=null;this.events=[];this.attempts=0;this.mistakes=0;this.hints=0;this.finished=false;this.started=false;this.simulation=null;
  }
  pause() {if(this.runningSince!==null){this.elapsed+=Math.max(0,this.now()-this.runningSince)/1000;this.runningSince=null;}}
  start() {if(!this.finished){this.started=true;this.resume();}}
  end() {this.pause();this.finished=true;}
  resume() {if(this.started&&!this.finished&&this.runningSince===null)this.runningSince=this.now();}
  submit(value,result) {
    if(!this.started||this.finished)return;this.attempts++;
    if(!result.accepted&&!['extra-word','already-completed'].includes(result.reason))this.mistakes++;
    this.events.push({type:'submit',value});if(this.session.status==='won'){this.pause();this.finished=true;}
  }
  useHint() {if(this.started&&!this.finished){this.hints++;if(this.session.status==='won')this.end();}}
  setSimulation(summary) {this.pause();this.finished=true;this.simulation=summary;}
  snapshot() {
    if(this.simulation)return {...this.simulation,...operationMetrics(this.session.initial,this.simulation.events),timeKind:'virtual'};
    return {started:this.started,finished:this.finished,attempts:this.attempts,mistakes:this.mistakes,hints:this.hints,
      elapsedSeconds:this.elapsed+(this.runningSince===null?0:Math.max(0,this.now()-this.runningSince)/1000),
      ...operationMetrics(this.session.initial,this.events),timeKind:'real'};
  }
}
