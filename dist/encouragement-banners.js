export const ENCOURAGEMENT_TIMING=Object.freeze({streakDelay:180,streak:1100,complete:1350});

// Presentation-only milestones; the game session remains the scoring authority.
export class EncouragementBanners {
  constructor({show=()=>{},hide=()=>{},onIdle=()=>{},isVisible=()=>true,reducedMotion=()=>globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches===true,setTimer=(fn,delay)=>globalThis.setTimeout(fn,delay),clearTimer=id=>globalThis.clearTimeout(id)}={}){
    this.show=show;this.hide=hide;this.onIdle=onIdle;this.isVisible=isVisible;this.reducedMotion=reducedMotion;this.setTimer=setTimer;this.clearTimer=clearTimer;
    this.session=null;this.streak=0;this.queue=[];this.active=null;this.completed=new WeakSet();
  }
  sync(session){
    if(this.session===session)return;
    this.cancel();this.session=session;this.streak=0;
  }
  record(session,result){
    if(!session||!result)return;
    this.sync(session);
    if(result.accepted&&session.status!=='anomaly'){
      this.streak++;
      if(this.streak%3===0)this.enqueue('streak');
    }else if(!['extra-word','already-completed'].includes(result.reason)){
      this.streak=0;this.dismissStreak();
    }
  }
  complete(session){
    if(!session||session.status!=='won')return false;
    this.sync(session);
    if(this.completed.has(session))return false;
    this.completed.add(session);
    return this.enqueue('complete');
  }
  enqueue(kind){
    if(!this.isVisible()||this.reducedMotion())return false;
    this.queue.push({kind,session:this.session,timer:null});this.next();return true;
  }
  next(){
    if(this.active||!this.queue.length)return;
    if(!this.isVisible()||this.reducedMotion()){
      this.queue=[];this.hide();this.onIdle(this.session);return;
    }
    const record=this.queue.shift();this.active=record;
    // Let the first target letter begin falling before the combo ribbon enters.
    if(record.kind==='streak')record.timer=this.setTimer(()=>this.start(record),ENCOURAGEMENT_TIMING.streakDelay);
    else this.start(record);
  }
  start(record){
    if(this.active!==record)return;
    if(!this.isVisible()||this.reducedMotion()){this.finish(record);return;}
    const duration=ENCOURAGEMENT_TIMING[record.kind];
    this.show(record.kind,duration);
    record.timer=this.setTimer(()=>this.finish(record),duration);
  }
  finish(record){
    if(this.active!==record)return;
    this.clearTimer(record.timer);this.active=null;this.hide();
    if(this.queue.length)this.next();
    else if(this.session===record.session)this.onIdle(record.session);
  }
  isRunning(session){return this.session===session&&!!(this.active||this.queue.length);}
  dismissStreak(){
    this.queue=this.queue.filter(record=>record.kind!=='streak');
    if(this.active?.kind==='streak')this.finish(this.active);
  }
  cancel(){
    if(this.active)this.clearTimer(this.active.timer);
    this.active=null;this.queue=[];this.hide();
  }
}
