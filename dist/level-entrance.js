export const LEVEL_ENTRANCE=Object.freeze({duration:560,targetStep:22,boardLead:120,rowStep:55,columnStep:25,maxDelay:380});

// Only fresh, visible player sessions enter; rendering and resuming never replay it.
export class LevelEntrance {
  constructor({isVisible=()=>true,reducedMotion=()=>globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches===true,prepare=()=>{},onDone=()=>{},setTimer=(fn,delay)=>globalThis.setTimeout(fn,delay),clearTimer=id=>globalThis.clearTimeout(id)}={}){
    this.isVisible=isVisible;this.reducedMotion=reducedMotion;this.prepare=prepare;this.onDone=onDone;this.setTimer=setTimer;this.clearTimer=clearTimer;
    this.played=new WeakSet();this.active=null;
  }
  play(session,{targets,tiles,panel,locks=[]}){
    if(this.active&&this.active.session!==session)this.cancel();
    if(!session||session.status!=='playing'||this.played.has(session)||!this.isVisible())return false;
    this.played.add(session);
    if(session.completed.size||this.reducedMotion())return false;
    this.prepare();
    const entries=[...targets.querySelectorAll('.target-letter')].map((node,index)=>({node,delay:Math.min(LEVEL_ENTRANCE.maxDelay,index*LEVEL_ENTRANCE.targetStep)}));
    for(const node of tiles){
      if(node.dataset.remaining==='0')continue;
      const row=Math.max(0,Number(node.style.gridRow)-1),column=Math.max(0,Number(node.style.gridColumn)-1);
      entries.push({node,delay:Math.min(LEVEL_ENTRANCE.maxDelay,LEVEL_ENTRANCE.boardLead+row*LEVEL_ENTRANCE.rowStep+column*LEVEL_ENTRANCE.columnStep)});
    }
    if(!entries.length)return false;
    const record={session,entries,panel,locks:locks.map(node=>({node,inert:node.inert})),timer:null};this.active=record;
    panel.classList.add('level-entering');panel.setAttribute('aria-busy','true');
    for(const {node} of record.locks)node.inert=true;
    for(const {node,delay} of entries){
      node.style.setProperty('--entry-delay',delay+'ms');node.style.setProperty('--entry-duration',LEVEL_ENTRANCE.duration+'ms');
      node.classList.add('level-entry-tile');
    }
    record.timer=this.setTimer(()=>this.finish(record,true),Math.max(...entries.map(entry=>entry.delay))+LEVEL_ENTRANCE.duration);
    return true;
  }
  isRunning(session){return !!this.active&&this.active.session===session;}
  finish(record,notify){
    if(this.active!==record)return;
    this.clearTimer(record.timer);this.active=null;
    for(const {node} of record.entries){node.classList.remove('level-entry-tile');node.style.removeProperty('--entry-delay');node.style.removeProperty('--entry-duration');}
    record.panel.classList.remove('level-entering');record.panel.removeAttribute('aria-busy');
    for(const {node,inert} of record.locks)node.inert=inert;
    if(notify)this.onDone(record.session);
  }
  cancel(){if(this.active)this.finish(this.active,false);}
}
