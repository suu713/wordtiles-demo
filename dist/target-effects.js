import {captureLetterOrigins,createLetterFlight,LETTER_FLIGHT_TIMING} from './letter-flight.js?v=2';

// Presentation only. Completion and tile consumption stay in the game session.
export const TARGET_LANDING = Object.freeze({step:110,colorLead:75,duration:340,glowDuration:360});
export const TARGET_MILESTONES = Object.freeze({waveDuration:520,flipDelay:450,flipDuration:620});
export const TARGET_RAINBOW = Object.freeze({delay:160,step:110,duration:620});

export class TargetEffects {
  constructor({board=null,onIdle=()=>{},onWordSettled=()=>{},isVisible=()=>true,reducedMotion=()=>globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches===true,captureFlight=captureLetterOrigins,createFlight=createLetterFlight,setTimer=(fn,delay)=>globalThis.setTimeout(fn,delay),clearTimer=timer=>globalThis.clearTimeout(timer)}={}){
    this.board=board;
    this.onIdle=onIdle;this.onWordSettled=onWordSettled;this.isVisible=isVisible;this.reducedMotion=reducedMotion;
    this.setTimer=setTimer;this.clearTimer=clearTimer;
    this.captureFlight=captureFlight;this.createFlight=createFlight;
    this.session=null;this.completed=new Set();this.active=new Map();this.pendingFlights=new Map();this.reminders=new Map();
  }
  capturePath(tiles,panel,readout=null){
    if(!this.isVisible()||this.reducedMotion())return null;
    try{return this.captureFlight(tiles,panel,readout);}catch{return null;}
  }
  dismissReadouts(){for(const record of this.active.values())record.flight?.dismissReadout?.();}
  remind(session,word,target){
    if(this.session!==session||!session.completed.has(word)||!target||!this.isVisible()||this.reducedMotion())return false;
    const old=this.reminders.get(word);if(old){this.clearTimer(old.timer);old.target.classList.remove('target-repeat');}
    this.revealTarget(target);target.classList.remove('target-repeat');void target.offsetWidth;target.classList.add('target-repeat');
    const record={target,timer:null};this.reminders.set(word,record);
    record.timer=this.setTimer(()=>{if(this.reminders.get(word)!==record)return;target.classList.remove('target-repeat');this.reminders.delete(word);},560);
    return true;
  }
  revealTarget(target){
    const root=target.closest?.('.targets');
    if(root&&root.scrollHeight>root.clientHeight){
      const bounds=root.getBoundingClientRect(),rect=target.getBoundingClientRect(),scale=bounds.height?root.clientHeight/bounds.height:1;
      if(rect.top<bounds.top)root.scrollTop-=(bounds.top-rect.top)*scale;
      else if(rect.bottom>bounds.bottom)root.scrollTop+=(rect.bottom-bounds.bottom)*scale;
    }
  }
  queueFlight(session,word,snapshot){
    if(this.session!==session||this.completed.has(word)||!snapshot||snapshot.letters.map(letter=>letter.letter).join('')!==word)return false;
    this.pendingFlights.set(word,snapshot);return true;
  }
  isRunning(session){return this.session===session&&this.active.size>0;}
  isWordRunning(session,word){return this.session===session&&this.active.has(word);}
  sync(session,targets){
    if(this.session!==session){
      this.cancel();this.session=session;this.completed=new Set(session.completed);return;
    }
    const previousCount=this.completed.size,added=[...session.completed].filter(word=>!this.completed.has(word));
    this.completed=new Set(session.completed);
    if(!this.isVisible()||this.reducedMotion()){this.pendingFlights.clear();return;}
    for(const [index,word] of added.entries()){
      const total=session.initial?.targets?.length,ordinal=previousCount+index+1,remaining=total-ordinal;
      const motion=total&&ordinal===1?'rainbow':remaining===1?'wave':remaining===0?'finale':null;
      const snapshot=this.pendingFlights.get(word);this.pendingFlights.delete(word);
      const target=targets.get(word);if(target)this.start(word,target,motion,snapshot);
    }
  }
  start(word,target,motion=null,snapshot=null){
    const slots=[...target.querySelectorAll('.target-letter')];
    const glyphs=slots.map(slot=>slot.querySelector('.target-glyph'));
    if(!glyphs.length||glyphs.some(glyph=>!glyph))return;
    const root=target.closest?.('.targets');
    const motionRoot=motion&&root&&root.scrollHeight<=root.clientHeight+1?root:null;
    const record={word,target,slots,glyphs,motion,motionRoot,timers:[],receivers:[],flight:null,session:this.session};
    this.active.set(word,record);target.classList.add('target-collecting');
    if(motion)target.classList.add('target-'+motion);
    motionRoot?.classList.add('target-motion-overflow');
    try{
      if(snapshot){
        target.classList.add('target-inflight');
        this.revealTarget(target);
        record.flight=this.createFlight(snapshot,slots);
      }
      const flight=record.flight;
      if(!flight)target.classList.remove('target-inflight');
      if(this.board){this.board.classList.remove('word-accepted');void this.board.offsetWidth;this.board.classList.add('word-accepted');}
      let duration=0;
      slots.forEach((slot,index)=>{
        const colorAt=flight?flight.arrivals[index]:motion==='rainbow'?0:index*TARGET_LANDING.step;
        const land=()=>{if(this.active.get(word)===record){slot.classList.add('target-landed');flight?.arrive(index);}};
        if(colorAt===0)land();else record.timers.push(this.setTimer(land,colorAt));
        if(flight&&slot.animate)record.receivers.push(slot.animate([{scale:'1'},{scale:'.94',offset:.24},{scale:'1.035',offset:.62},{scale:'1'}],{delay:colorAt,duration:LETTER_FLIGHT_TIMING.receive,easing:'ease-out'}));
        if(!flight&&motion!=='rainbow'){
          glyphs[index].style.setProperty('--letter-delay',`${colorAt+TARGET_LANDING.colorLead}ms`);
          glyphs[index].style.setProperty('--letter-duration',`${TARGET_LANDING.duration}ms`);
        }
        let glowAt=flight?colorAt:colorAt+TARGET_LANDING.colorLead+TARGET_LANDING.duration;
        if(motion==='rainbow'){
          const waveAt=flight?Math.max(colorAt,flight.arrivals[0]+LETTER_FLIGHT_TIMING.settle+index*TARGET_RAINBOW.step):TARGET_RAINBOW.delay+index*TARGET_RAINBOW.step;
          slot.style.setProperty('--motion-delay',waveAt+'ms');slot.style.setProperty('--motion-duration',TARGET_RAINBOW.duration+'ms');
          slot.style.setProperty('--rainbow-hue',(40-index/Math.max(1,slots.length-1)*260)+'deg');
          glowAt=waveAt+TARGET_RAINBOW.duration;
        }else if(motion==='wave'){
          const waveAt=flight?Math.max(colorAt,flight.arrivals[0]+index*TARGET_LANDING.step):colorAt;
          slot.style.setProperty('--motion-delay',waveAt+'ms');slot.style.setProperty('--motion-duration',TARGET_MILESTONES.waveDuration+'ms');
          glowAt=waveAt+TARGET_MILESTONES.waveDuration;
        }else if(motion==='finale'&&index===0){
          const flipAt=flight?flight.arrivals.at(-1)+LETTER_FLIGHT_TIMING.settle:TARGET_MILESTONES.flipDelay;
          slot.style.setProperty('--motion-delay',flipAt+'ms');slot.style.setProperty('--motion-duration',TARGET_MILESTONES.flipDuration+'ms');
          glowAt=flipAt+TARGET_MILESTONES.flipDuration;
        }
        slot.style.setProperty('--glow-delay',`${glowAt}ms`);
        slot.style.setProperty('--glow-duration',`${TARGET_LANDING.glowDuration}ms`);
        duration=Math.max(duration,glowAt+TARGET_LANDING.glowDuration);
      });
      flight?.play();
      record.timers.push(this.setTimer(()=>this.finish(record,true),duration));
    }catch(error){
      console.warn('Target landing animation could not start.',error);
      this.finish(record,false);
    }
  }
  finish(record,notify){
    if(this.active.get(record.word)!==record)return;
    this.active.delete(record.word);
    for(const timer of record.timers)this.clearTimer(timer);
    record.flight?.cancel();
    for(const animation of record.receivers)animation.cancel();
    record.target.classList.remove('target-collecting');
    record.target.classList.remove('target-inflight');
    if(record.motion)record.target.classList.remove('target-'+record.motion);
    if(record.motionRoot&&![...this.active.values()].some(active=>active.motionRoot===record.motionRoot))record.motionRoot.classList.remove('target-motion-overflow');
    for(const glyph of record.glyphs){glyph.style.removeProperty('--letter-delay');glyph.style.removeProperty('--letter-duration');}
    for(const slot of record.slots){slot.classList.remove('target-landed');slot.style.removeProperty('--glow-delay');slot.style.removeProperty('--glow-duration');slot.style.removeProperty('--motion-delay');slot.style.removeProperty('--motion-duration');slot.style.removeProperty('--rainbow-hue');}
    if(this.active.size===0)this.board?.classList.remove('word-accepted');
    if(notify&&this.session===record.session)this.onWordSettled(record.session,record.word,record.target);
    if(notify&&this.active.size===0&&this.session===record.session)this.onIdle(record.session);
  }
  cancel(){
    for(const record of [...this.active.values()])this.finish(record,false);
    for(const {target,timer} of this.reminders.values()){this.clearTimer(timer);target.classList.remove('target-repeat');}
    this.reminders.clear();this.pendingFlights.clear();
  }
}
