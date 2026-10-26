import { completedCount, targetCount, DEFAULT_PROFILE, percentile, normalizeProfile } from './playtest.js?v=46';

export const RECORD_KEY='wordtiles.playtests.v1';
export const PROFILE_KEY='wordtiles.playtest.profile.v1';
export class HumanRecorder {
  constructor(session,{participant='本机测试者',audience='ordinary-english',now=()=>performance.now()}={}) {
    this.session=session;this.now=now;this.startedAt=now();this.runningSince=now();this.elapsed=0;this.events=[];this.finished=false;
    this.record={id:globalThis.crypto?.randomUUID?.()||String(Date.now())+'-'+Math.random(),participant,audience,mode:'human',
      language:session.initial.source?.language||'english',level:session.exportInitial||session.initial,
      startedAt:new Date().toISOString(),attempts:0,mistakes:0,hints:0};
  }
  pause() {if(this.runningSince!==null){this.elapsed+=Math.max(0,this.now()-this.runningSince)/1000;this.runningSince=null;}}
  resume() {if(!this.finished&&this.runningSince===null)this.runningSince=this.now();}
  get seconds() {return this.elapsed+(this.runningSince===null?0:Math.max(0,this.now()-this.runningSince)/1000);}
  submit(value,result) {
    if(this.finished)return;
    this.record.attempts++;
    if(!result.accepted&&!['extra-word','already-completed'].includes(result.reason))this.record.mistakes++;
    this.events.push({type:'submit',value,word:result.word||'',reason:result.reason||'target',accepted:result.accepted,elapsed:this.seconds});
  }
  hint(hint) {if(!this.finished&&hint){this.record.hints++;this.events.push({type:'hint',word:hint.word,elapsed:this.seconds});}}
  finish(outcome) {
    if(this.finished)return null;this.pause();this.finished=true;
    return {...this.record,outcome,elapsedSeconds:this.elapsed,completed:completedCount(this.session),targetCount:targetCount(this.session),events:this.events};
  }
}
export function validHumanRecord(r) {
  return r&&typeof r.id==='string'&&typeof r.participant==='string'&&r.mode==='human'&&typeof r.language==='string'&&
    ['won','gave-up','interrupted'].includes(r.outcome)&&Number.isFinite(r.elapsedSeconds)&&r.elapsedSeconds>=0&&r.elapsedSeconds<=86400&&
    ['attempts','mistakes','hints','completed','targetCount'].every(k=>Number.isInteger(r[k])&&r[k]>=0)&&r.mistakes<=r.attempts&&r.completed<=r.targetCount&&
    r.targetCount>0&&Array.isArray(r.events)&&r.events.length<=5000;
}
export function mergeHumanRecords(current,input) {
  const list=Array.isArray(input)?input:input?.records;
  if(!Array.isArray(list)||list.length>10000||list.some(r=>!validHumanRecord(r)))throw new Error('真人记录格式不合法；未修改现有记录');
  const map=new Map(current.map(r=>[r.id,r]));for(const r of list)map.set(r.id,r);return [...map.values()];
}
export function calibrateEnglish(records,base=DEFAULT_PROFILE) {
  const eligible=records.filter(r=>validHumanRecord(r)&&r.language==='english'&&r.audience==='ordinary-english'&&['won','gave-up'].includes(r.outcome)&&r.elapsedSeconds>=3&&r.attempts>=1);
  const participants=new Set(eligible.map(r=>r.participant));
  if(eligible.length<30||participants.size<10)return {ok:false,message:`有效英语样本 ${eligible.length}/30 局，测试者 ${participants.size}/10 人。继续收集普通英语玩家记录。`};
  // Each participant has equal weight, so one prolific tester cannot dominate.
  const byPlayer=[...participants].map(id=>eligible.filter(r=>r.participant===id));
  const mean=xs=>xs.reduce((s,x)=>s+x,0)/xs.length;
  const errorRate=mean(byPlayer.map(rs=>rs.reduce((s,r)=>s+r.mistakes,0)/rs.reduce((s,r)=>s+r.attempts,0)));
  const perAttempt=percentile(byPlayer.map(rs=>percentile(rs.map(r=>r.elapsedSeconds/r.attempts),.5)),.5);
  const profile=normalizeProfile({...base,version:'english-observed-'+Date.now(),status:'observational-calibration',
    mistakeRate:Math.min(.7,errorRate),thinkSeconds:Math.max(.5,Math.min(60,perAttempt)),
    calibration:{sessions:eligible.length,participants:participants.size,createdAt:new Date().toISOString(),
      fitted:['thinkSeconds','mistakeRate'],
      unfitted:['spatialRecognition','scanBudget','fatigue'],basis:`Equal weight per self-reported ordinary English player. Target vocabulary uses the user-specified ${(base.knowledgeRate??.8)*100}%; spatial parameters retain engineering calibration, without population validation.`}});
  return {ok:true,profile,message:`已用 ${participants.size} 人、${eligible.length} 局校准思考时间与试错率。词汇和观察参数仍为先验，需留出真人样本验证。`};
}
