import {ENCOURAGEMENT_CONFIG,ENCOURAGEMENT_STORAGE_KEY} from './core/encouragement-config.js?v=2';

const WRONG_ATTEMPTS=new Set(['not-target','invalid-path']);
const targetWords=session=>(session.initial?.targets||[]).map(target=>typeof target==='string'?target:target.word);

function readProgress(storage,time){
  const empty={totalTargets:0,lastIconAt:null,lastGroupEndedAt:null,lastText:''};
  try{
    const saved=JSON.parse(storage?.getItem(ENCOURAGEMENT_STORAGE_KEY)||'null');
    if(!saved||![1,2].includes(saved.version)||!Number.isSafeInteger(saved.totalTargets)||saved.totalTargets<0)return empty;
    const timestamp=value=>Number.isFinite(value)&&value>=0&&value<=time+60000?value:null;
    return {totalTargets:saved.totalTargets,
      // Version 1 stored a target count in lastIconAt, not a timestamp.
      lastIconAt:saved.version===2?timestamp(saved.lastIconAt):null,
      lastGroupEndedAt:saved.version===2?timestamp(saved.lastGroupEndedAt):null,
      lastText:typeof saved.lastText==='string'?saved.lastText.slice(0,96):''};
  }catch{return empty;}
}

// Visual rewards only. Accepted results and completed words come from the game session.
export class EncouragementBanners {
  constructor({show=()=>{},hide=()=>{},showIcon=()=>{},hideIcon=()=>{},onIdle=()=>{},isVisible=()=>true,
    reducedMotion=()=>globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches===true,
    now=()=>Date.now(),random=()=>Math.random(),storage=null,config=ENCOURAGEMENT_CONFIG,
    setTimer=(fn,delay)=>globalThis.setTimeout(fn,delay),clearTimer=id=>globalThis.clearTimeout(id)}={}){
    Object.assign(this,{show,hide,showIcon,hideIcon,onIdle,isVisible,reducedMotion,now,random,storage,config,setTimer,clearTimer});
    this.progress=readProgress(storage,this.now());
    this.levels=new WeakMap();this.session=null;this.state=null;
    this.banner=null;this.icon=null;
  }
  save(){
    try{this.storage?.setItem(ENCOURAGEMENT_STORAGE_KEY,JSON.stringify({version:2,...this.progress}));}catch{}
  }
  sync(session){
    if(!session||this.session===session)return;
    this.cancel();this.session=session;
    let state=this.levels.get(session);
    if(!state){
      const words=targetWords(session);
      state={words,newTargets:new Set(session.completed),extras:new Set(session.bonusCompleted||[]),
        longest:Math.max(0,...words.map(word=>[...word].length)),streak:0,errors:0,once:new Set(),
        bannerCount:0,performanceCount:0,almostCount:0,iconCount:0,elapsedWithoutTarget:0,activeSince:null};
      this.levels.set(session,state);
    }
    this.state=state;
    if(this.isVisible()&&session.status==='playing')this.resume(session);
  }
  resume(session){
    if(!session)return;
    this.sync(session);
    if(session.status==='playing'&&this.isVisible()&&this.state.activeSince===null)this.state.activeSince=this.now();
  }
  pause(){
    if(!this.state||this.state.activeSince===null)return;
    this.state.elapsedWithoutTarget+=Math.max(0,this.now()-this.state.activeSince);
    this.state.activeSince=null;
  }
  withoutTargetMs(){
    const state=this.state;
    return state.elapsedWithoutTarget+(state.activeSince===null?0:Math.max(0,this.now()-state.activeSince));
  }
  record(session,result,{source='manual',assisted=false}={}){
    if(!session||!result)return null;
    const fresh=!this.levels.has(session);
    this.sync(session);
    const state=this.state;
    // A first accepted result may arrive before the caller's first render.
    if(fresh&&result.accepted)state.newTargets.delete(result.word);
    if(fresh&&result.reason==='extra-word'&&result.isNew===true)state.extras.delete(result.word);
    if(result.accepted&&session.status!=='anomaly'){
      const word=result.word;
      if(!state.words.includes(word)||!session.completed.has(word)||state.newTargets.has(word))return null;
      const elapsed=this.withoutTargetMs(),errors=state.errors;
      state.newTargets.add(word);this.progress.totalTargets++;this.save();
      state.errors=0;state.elapsedWithoutTarget=0;
      state.activeSince=session.status==='playing'&&this.isVisible()?this.now():null;
      // Completion praise belongs to settlement; do not add a final in-level reward.
      if(session.status==='won')return null;
      const manual=source==='manual',candidates=new Set();
      if(manual){
        state.streak++;
        if(!state.once.has('recovery')&&(errors>=this.config.recovery.errors||elapsed>=this.config.recovery.withoutTargetMs)){
          candidates.add('recovery');
        }
        if(!assisted&&!state.once.has('long')&&[...word].length>=this.config.longWord.minimumLength&&[...word].length===state.longest){
          candidates.add('long');
        }
        const combo=this.config.combo;
        if(state.words.length>=combo.minimumTargets){
          if(state.streak===combo.advancedFirst||(state.streak>combo.advancedFirst&&(state.streak-combo.advancedFirst)%combo.advancedStep===0))candidates.add('advanced');
          if(state.streak===combo.ordinary)candidates.add('ordinary');
        }
      }
      if(!state.once.has('almost')&&state.words.length>=this.config.almost.minimumTargets&&state.words.length-session.completed.size===this.config.almost.remaining){
        candidates.add('almost');
      }
      const scene=this.config.priority.find(kind=>candidates.has(kind));
      return scene?this.present(scene):null;
    }
    if(result.reason==='extra-word'){
      if(result.isNew!==true||typeof result.word!=='string'||state.extras.has(result.word))return null;
      state.extras.add(result.word);
      if(!state.once.has('bonus')&&state.extras.size===this.config.bonus.distinctWords){
        return this.present('bonus');
      }
    }else if(WRONG_ATTEMPTS.has(result.reason)){
      state.streak=0;state.errors++;
    }
    return null;
  }
  present(scene){
    const result={scene,banner:false,icon:false};
    if(!this.isVisible()||this.reducedMotion())return result;
    const state=this.state,definition=this.config.scenes[scene],time=this.now(),banner=this.config.banner;
    if(!state||!definition||this.session.status!=='playing')return result;
    // A reward group must completely disappear before the shared hard cooldown starts.
    if(this.banner||this.icon||(this.progress.lastGroupEndedAt!==null&&time-this.progress.lastGroupEndedAt<banner.minGapMs))return result;
    const almost=scene==='almost',performanceMax=state.words.length<=banner.shortLevelMaxTargets?banner.shortPerformanceMax:banner.longPerformanceMax;
    if(almost?state.almostCount>=banner.almostMax:state.performanceCount>=performanceMax)return result;
    const pool=definition.words.filter(word=>word!==this.progress.lastText);
    const random=Math.max(0,Math.min(.999999999,Number(this.random())||0));
    const text=pool[Math.floor(random*pool.length)];
    const sinceIcon=this.progress.lastIconAt===null?Infinity:time-this.progress.lastIconAt;
    result.icon=!!definition.icon&&state.iconCount<this.config.icon.perLevelMax&&sinceIcon>=this.config.icon.minGapMs;
    const record={scene,session:this.session,timer:null};this.banner=record;
    if(result.icon)this.icon={scene,session:this.session,timer:null};
    this.show(scene,banner.durationMs,{text,frame:definition.frame});
    state.bannerCount++;if(almost)state.almostCount++;else state.performanceCount++;
    state.once.add(scene);this.progress.lastText=text;
    // Save the planned end too, so reloading during a live reward cannot reset its cooldown.
    this.progress.lastGroupEndedAt=time+Math.max(banner.durationMs,result.icon?this.config.icon.durationMs:0);
    if(result.icon){
      state.iconCount++;this.progress.lastIconAt=time;
      const iconRecord=this.icon,duration=this.config.icon.durationMs;
      this.showIcon(definition.icon,duration,{scene});
      iconRecord.timer=this.setTimer(()=>this.finishChannel('icon',iconRecord),duration);
    }
    this.save();
    record.timer=this.setTimer(()=>this.finishChannel('banner',record),banner.durationMs);result.banner=true;
    return result;
  }
  clearChannel(channel){
    const record=this[channel];if(!record)return;
    this.clearTimer(record.timer);this[channel]=null;
    if(channel==='banner')this.hide();else this.hideIcon();
    if(!this.banner&&!this.icon){this.progress.lastGroupEndedAt=this.now();this.save();}
  }
  finishChannel(channel,record){
    if(this[channel]!==record)return;
    this.clearChannel(channel);
    if(this.session===record.session&&!this.banner&&!this.icon)this.onIdle(record.session);
  }
  isRunning(session){return this.session===session&&!!(this.banner||this.icon);}
  cancel(){
    this.pause();this.clearChannel('banner');this.clearChannel('icon');
  }
}
