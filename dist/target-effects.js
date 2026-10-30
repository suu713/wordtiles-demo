// Presentation only. Completion and tile consumption stay in the game session.
export const TARGET_LANDING = Object.freeze({step:110,colorLead:75,duration:340,glowDuration:360});
export const TARGET_MILESTONES = Object.freeze({waveDuration:520,flipDelay:450,flipDuration:620});

export class TargetEffects {
  constructor({board=null,onIdle=()=>{},isVisible=()=>true,reducedMotion=()=>globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches===true,setTimer=(fn,delay)=>globalThis.setTimeout(fn,delay),clearTimer=timer=>globalThis.clearTimeout(timer)}={}){
    this.board=board;
    this.onIdle=onIdle;this.isVisible=isVisible;this.reducedMotion=reducedMotion;
    this.setTimer=setTimer;this.clearTimer=clearTimer;
    this.session=null;this.completed=new Set();this.active=new Map();
  }
  isRunning(session){return this.session===session&&this.active.size>0;}
  sync(session,targets){
    if(this.session!==session){
      this.cancel();this.session=session;this.completed=new Set(session.completed);return;
    }
    const previousCount=this.completed.size,added=[...session.completed].filter(word=>!this.completed.has(word));
    this.completed=new Set(session.completed);
    if(!this.isVisible()||this.reducedMotion())return;
    for(const [index,word] of added.entries()){
      const remaining=session.initial?.targets?.length-previousCount-index-1;
      const motion=remaining===1?'wave':remaining===0?'finale':null;
      const target=targets.get(word);if(target)this.start(word,target,motion);
    }
  }
  start(word,target,motion=null){
    const slots=[...target.querySelectorAll('.target-letter')];
    const glyphs=slots.map(slot=>slot.querySelector('.target-glyph'));
    if(!glyphs.length||glyphs.some(glyph=>!glyph))return;
    const root=target.closest?.('.targets');
    const motionRoot=motion&&root&&root.scrollHeight<=root.clientHeight+1?root:null;
    const record={word,target,slots,glyphs,motion,motionRoot,timers:[],session:this.session};
    this.active.set(word,record);target.classList.add('target-collecting');
    if(motion)target.classList.add('target-'+motion);
    motionRoot?.classList.add('target-motion-overflow');
    try{
      if(this.board){this.board.classList.remove('word-accepted');void this.board.offsetWidth;this.board.classList.add('word-accepted');}
      let duration=0;
      slots.forEach((slot,index)=>{
        const colorAt=index*TARGET_LANDING.step;
        const land=()=>{if(this.active.get(word)===record)slot.classList.add('target-landed');};
        if(colorAt===0)land();else record.timers.push(this.setTimer(land,colorAt));
        glyphs[index].style.setProperty('--letter-delay',`${colorAt+TARGET_LANDING.colorLead}ms`);
        glyphs[index].style.setProperty('--letter-duration',`${TARGET_LANDING.duration}ms`);
        let glowAt=colorAt+TARGET_LANDING.colorLead+TARGET_LANDING.duration;
        if(motion==='wave'){
          slot.style.setProperty('--motion-delay',colorAt+'ms');slot.style.setProperty('--motion-duration',TARGET_MILESTONES.waveDuration+'ms');
          glowAt=colorAt+TARGET_MILESTONES.waveDuration;
        }else if(motion==='finale'&&index===0){
          slot.style.setProperty('--motion-delay',TARGET_MILESTONES.flipDelay+'ms');slot.style.setProperty('--motion-duration',TARGET_MILESTONES.flipDuration+'ms');
          glowAt=TARGET_MILESTONES.flipDelay+TARGET_MILESTONES.flipDuration;
        }
        slot.style.setProperty('--glow-delay',`${glowAt}ms`);
        slot.style.setProperty('--glow-duration',`${TARGET_LANDING.glowDuration}ms`);
        duration=Math.max(duration,glowAt+TARGET_LANDING.glowDuration);
      });
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
    record.target.classList.remove('target-collecting');
    if(record.motion)record.target.classList.remove('target-'+record.motion);
    if(record.motionRoot&&![...this.active.values()].some(active=>active.motionRoot===record.motionRoot))record.motionRoot.classList.remove('target-motion-overflow');
    for(const glyph of record.glyphs){glyph.style.removeProperty('--letter-delay');glyph.style.removeProperty('--letter-duration');}
    for(const slot of record.slots){slot.classList.remove('target-landed');slot.style.removeProperty('--glow-delay');slot.style.removeProperty('--glow-duration');slot.style.removeProperty('--motion-delay');slot.style.removeProperty('--motion-duration');}
    if(this.active.size===0)this.board?.classList.remove('word-accepted');
    if(notify&&this.active.size===0&&this.session===record.session)this.onIdle(record.session);
  }
  cancel(){for(const record of [...this.active.values()])this.finish(record,false);}
}
