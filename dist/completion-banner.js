import {FLORAL_BANNERS} from './floral-banner-art.js?v=1';

export const COMPLETION_BANNER_DURATION=2200;
const wordsFor=session=>(session?.initial?.targets||[]).map(target=>typeof target==='string'?target:target.word);

// A once-only transition for a genuinely completed player session. Ordinary
// in-level encouragement, its cooldown and its quotas remain separate.
export class CompletionBanner{
  constructor({view,onIdle=()=>{},isVisible=()=>true,
    reducedMotion=()=>globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches===true,
    random=()=>Math.random(),setTimer=(fn,delay)=>globalThis.setTimeout(fn,delay),clearTimer=id=>globalThis.clearTimeout(id)}={}){
    Object.assign(this,{view,onIdle,isVisible,reducedMotion,random,setTimer,clearTimer});
    this.observed=new WeakSet();this.shown=new WeakSet();this.active=null;this.remaining=[];this.lastVariant=null;
  }
  sync(session){
    if(this.active&&this.active.session!==session)this.cancel();
    if(!session||this.observed.has(session))return;
    this.observed.add(session);
    if(session.status==='won')this.shown.add(session);
  }
  nextArt(){
    if(!this.remaining.length)this.remaining=[...FLORAL_BANNERS];
    const candidates=this.remaining.filter(art=>art.id!==this.lastVariant),pool=candidates.length?candidates:this.remaining;
    const random=Math.max(0,Math.min(.999999999,Number(this.random())||0)),art=pool[Math.floor(random*pool.length)];
    this.remaining.splice(this.remaining.indexOf(art),1);this.lastVariant=art.id;return art;
  }
  play(session){
    this.sync(session);if(this.isRunning(session))return true;
    const words=wordsFor(session);
    if(!session||session.status!=='won'||!words.length||!words.every(word=>session.completed.has(word))||this.shown.has(session))return false;
    this.shown.add(session);
    if(!this.isVisible()||this.reducedMotion())return false;
    const record={session,timer:null};this.active=record;
    try{this.view.show(this.nextArt(),'Level Complete!',COMPLETION_BANNER_DURATION);}
    catch(error){this.active=null;this.view.hide();console.warn('Completion banner could not start.',error);return false;}
    record.timer=this.setTimer(()=>{
      if(this.active!==record)return;
      this.active=null;this.view.hide();this.onIdle(session);
    },COMPLETION_BANNER_DURATION);
    return true;
  }
  isRunning(session){return !!this.active&&this.active.session===session;}
  cancel(){const record=this.active;if(!record)return;this.clearTimer(record.timer);this.active=null;this.view.hide();}
}
