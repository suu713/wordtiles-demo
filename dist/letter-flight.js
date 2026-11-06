export const LETTER_FLIGHT_TIMING=Object.freeze({lead:130,duration:430,step:55,settle:35,receive:240});

function panelGeometry(panel){
  const bounds=panel?.getBoundingClientRect();
  if(!bounds?.width||!bounds.height||!panel.clientWidth||!panel.clientHeight)return null;
  return {bounds,width:panel.clientWidth,height:panel.clientHeight};
}
function center(rect,geometry){
  return {x:(rect.left+rect.width/2-geometry.bounds.left)/geometry.bounds.width*geometry.width,
    y:(rect.top+rect.height/2-geometry.bounds.top)/geometry.bounds.height*geometry.height};
}

// Prefer the current-word glyphs. Read them before submission clears the readout.
export function captureLetterOrigins(tiles,panel,readout=null){
  const geometry=panelGeometry(panel);if(!geometry||!tiles.length)return null;
  const preview=[...(readout?.querySelectorAll('.readout-letter')||[])];
  const fromReadout=preview.length===tiles.length&&preview.map(glyph=>glyph.textContent).join('')===tiles.map(tile=>tile?.querySelector('.tile-letter')?.textContent).join('');
  const letters=tiles.map((tile,index)=>{
    const glyph=fromReadout?preview[index]:tile?.querySelector('.tile-letter');if(!glyph)return null;
    const rect=glyph.getBoundingClientRect(),style=getComputedStyle(glyph),size=parseFloat(style.fontSize);
    if(!glyph.textContent||!rect.width||!rect.height||!Number.isFinite(size)||size<=0)return null;
    return {...center(rect,geometry),letter:glyph.textContent,size,fontFamily:style.fontFamily,fontWeight:style.fontWeight,
      color:style.color,textShadow:style.textShadow};
  });
  if(letters.some(letter=>!letter))return null;
  let plate=null;
  if(fromReadout){
    const rect=readout.getBoundingClientRect(),style=getComputedStyle(readout),position=center(rect,geometry);
    plate={...position,width:rect.width/geometry.bounds.width*geometry.width,height:rect.height/geometry.bounds.height*geometry.height,
      backgroundImage:style.backgroundImage,backgroundSize:style.backgroundSize,backgroundPosition:style.backgroundPosition,backgroundRepeat:style.backgroundRepeat,borderRadius:style.borderRadius};
  }
  return {panel,letters,plate,origin:fromReadout?'readout':'board'};
}

export function planLetterFlight(source,destination,index=0,count=1){
  const rise=source.y-destination.y,dx=destination.x-source.x;
  const bend=(index-(count-1)/2)*Math.min(10,Math.abs(rise)*.025);
  return {source,destination,
    c1:{x:source.x+dx*.18+bend,y:source.y-rise*.34-Math.min(12,source.size*.22)},
    c2:{x:destination.x-dx*.12+bend*.25,y:destination.y+rise*.24},
    delay:LETTER_FLIGHT_TIMING.lead+index*LETTER_FLIGHT_TIMING.step,duration:LETTER_FLIGHT_TIMING.duration};
}

export function sampleLetterFlight(plan,progress){
  const t=Math.max(0,Math.min(1,progress)),u=1-t,{source,destination,c1,c2}=plan;
  const interpolate=key=>u*u*u*source[key]+3*u*u*t*c1[key]+3*u*t*t*c2[key]+t*t*t*destination[key];
  const end=destination.size/source.size,peak=Math.max(1.48,end*1.23),split=.28;
  const phase=t<split?t/split:(t-split)/(1-split),smooth=phase*phase*(3-2*phase);
  const scale=t<split?1+(peak-1)*smooth:peak+(end-peak)*smooth;
  return {x:interpolate('x'),y:interpolate('y'),scale};
}

export function createLetterFlight(snapshot,slots){
  const {panel,letters,plate}=snapshot,geometry=panelGeometry(panel);
  if(!geometry||letters.length!==slots.length)return null;
  const plans=slots.map((slot,index)=>{
    const glyph=slot.querySelector('.target-glyph'),rect=glyph?.getBoundingClientRect(),size=parseFloat(glyph&&getComputedStyle(glyph).fontSize);
    if(!rect?.width||!rect.height||!Number.isFinite(size)||size<=0)return null;
    const source=plate?{...letters[index],x:plate.x+(letters[index].x-plate.x)*1.08,y:plate.y+(letters[index].y-plate.y)*1.08-2,size:letters[index].size*1.08}:letters[index];
    return planLetterFlight(source,{...center(rect,geometry),size},index,letters.length);
  });
  if(plans.some(plan=>!plan))return null;
  const document=panel.ownerDocument,layer=document.createElement('div'),animations=[],plateAnimations=[],flyingGlyphs=[];
  let plateElement=null;
  layer.className='letter-flight-layer';layer.setAttribute('aria-hidden','true');
  return {
    arrivals:plans.map(plan=>plan.delay+plan.duration),
    play(){
      if(plate){
        plateElement=document.createElement('div');plateElement.className='flight-word-plate';
        Object.assign(plateElement.style,{left:plate.x-plate.width/2+'px',top:plate.y-plate.height/2+'px',width:plate.width+'px',height:plate.height+'px',
          backgroundImage:plate.backgroundImage,backgroundSize:plate.backgroundSize,backgroundPosition:plate.backgroundPosition,backgroundRepeat:plate.backgroundRepeat,borderRadius:plate.borderRadius});
        const duration=plans.at(-1).delay+100;
        plateAnimations.push(plateElement.animate([{offset:0,transform:'translateY(0) scale(1)',opacity:1},
          {offset:90/duration,transform:'translateY(-2px) scale(1.08)',opacity:1},
          {offset:LETTER_FLIGHT_TIMING.lead/duration,transform:'translateY(-2px) scale(1.08)',opacity:1},
          {offset:1,transform:'translateY(-5px) scale(1.08)',opacity:0}],{duration,easing:'ease-out',fill:'forwards'}));
        letters.forEach((source,index)=>{
          const glyph=document.createElement('span');glyph.className='flight-source-letter';glyph.textContent=source.letter;
          Object.assign(glyph.style,{left:source.x-(plate.x-plate.width/2)-source.size*.65+'px',top:source.y-(plate.y-plate.height/2)-source.size*.65+'px',
            width:source.size*1.3+'px',height:source.size*1.3+'px',fontSize:source.size+'px',fontFamily:source.fontFamily,fontWeight:source.fontWeight,color:source.color,textShadow:source.textShadow});
          plateElement.append(glyph);
          plateAnimations.push(glyph.animate([{opacity:1},{opacity:1,offset:plans[index].delay/(plans[index].delay+1)},{opacity:0}],{duration:plans[index].delay+1,fill:'forwards'}));
        });
        layer.append(plateElement);
      }
      const fragment=document.createDocumentFragment();
      plans.forEach(plan=>{
        const {source}=plan,glyph=document.createElement('span');glyph.className='flying-letter';glyph.textContent=source.letter;
        Object.assign(glyph.style,{fontFamily:source.fontFamily,fontWeight:source.fontWeight,fontSize:source.size+'px',color:source.color,
          width:source.size*1.3+'px',height:source.size*1.3+'px',textShadow:source.textShadow==='none'?'0 1px 4px #ffffff55':source.textShadow});
        const frames=Array.from({length:17},(_,index)=>{
          const offset=index/16,state=sampleLetterFlight(plan,offset);
          return {offset,transform:`translate3d(${state.x-source.size*.65}px,${state.y-source.size*.65}px,0) scale(${state.scale})`,opacity:offset===0?.92:1};
        });
        fragment.append(glyph);
        flyingGlyphs.push(glyph);
        animations.push(glyph.animate(frames,{duration:plan.duration,delay:plan.delay,easing:'cubic-bezier(.26,.08,.38,1)',fill:'forwards'}));
      });
      layer.append(fragment);panel.append(layer);
    },
    arrive(index){animations[index]?.cancel();flyingGlyphs[index]?.style.setProperty('visibility','hidden');},
    dismissReadout(){for(const animation of plateAnimations)animation.cancel();plateElement?.remove();},
    cancel(){for(const animation of [...animations,...plateAnimations])animation.cancel();layer.remove();},
  };
}
