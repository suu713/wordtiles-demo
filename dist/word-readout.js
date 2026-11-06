export const WORD_FEEDBACK_TIMING=Object.freeze({rejected:980,repeated:620});

// Owns only the transient readout; it never submits a word or changes a session.
export class WordReadout {
  constructor(element,{onExpire=()=>{},reducedMotion=()=>globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches===true,setTimer=(fn,ms)=>globalThis.setTimeout(fn,ms),clearTimer=id=>globalThis.clearTimeout(id)}={}){
    this.element=element;this.onExpire=onExpire;this.reducedMotion=reducedMotion;this.setTimer=setTimer;this.clearTimer=clearTimer;
    this.mode='';this.timer=null;this.typing=null;this.version=0;
  }
  write(word){
    if(this.element.textContent===word)return false;
    const document=this.element.ownerDocument;
    this.element.replaceChildren(...[...word].map(letter=>{const span=document.createElement('span');span.className='readout-letter';span.textContent=letter;return span;}));
    return true;
  }
  select(word){
    if(!word){if(!this.mode)this.write('');return;}
    if(this.mode)this.clear();
    if(this.write(word)&&!this.reducedMotion()){
      this.freeze();
      this.typing=this.element.animate?.([{transform:'scale(.97)'},{transform:'scale(1.035)',offset:.42},{transform:'scale(1)'}],{duration:150,easing:'ease-out'});
    }
  }
  freeze(){this.typing?.cancel();this.typing=null;}
  show(word,mode){
    this.clear();this.mode=mode;this.write(word);this.element.classList.add(mode+'-word');
    const version=this.version;
    this.timer=this.setTimer(()=>{if(version!==this.version)return;this.clear();this.onExpire();},WORD_FEEDBACK_TIMING[mode]);
  }
  reject(word){this.show(word,'rejected');}
  repeat(word){this.show(word,'repeated');}
  clear(){
    this.version++;this.clearTimer(this.timer);this.timer=null;this.freeze();this.mode='';
    this.element.classList.remove('rejected-word','repeated-word');this.write('');
  }
}
