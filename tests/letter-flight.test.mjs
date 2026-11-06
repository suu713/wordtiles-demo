import test from 'node:test';
import assert from 'node:assert/strict';
import {captureLetterOrigins,planLetterFlight,sampleLetterFlight,LETTER_FLIGHT_TIMING} from '../dist/letter-flight.js';
import {TargetEffects,TARGET_LANDING,TARGET_RAINBOW} from '../dist/target-effects.js';

const near=(actual,expected)=>assert.ok(Math.abs(actual-expected)<1e-7,`${actual} != ${expected}`);
const source={letter:'A',x:70,y:580,size:42},destination={x:210,y:140,size:25};

test('字母先舒展放大再收进目标，曲线位置从源字框准确到达目标',()=>{
  const plan=planLetterFlight(source,destination),first=sampleLetterFlight(plan,0),last=sampleLetterFlight(plan,1);
  assert.deepEqual(first,{x:70,y:580,scale:1});near(last.x,210);near(last.y,140);near(last.scale,25/42);
  assert.ok(sampleLetterFlight(plan,.28).scale>Math.max(1,last.scale));
  let previousY=source.y;
  for(let i=1;i<=40;i++){const state=sampleLetterFlight(plan,i/40);assert.ok(Number.isFinite(state.x)&&Number.isFinite(state.y));assert.ok(state.y<previousY);assert.ok(state.scale>0);previousY=state.y;}
  assert.deepEqual(sampleLetterFlight(plan,-1),first);assert.deepEqual(sampleLetterFlight(plan,2),last);
});

test('从不同棋盘位置错峰出发，包括反向连接和同字母的不同格子',()=>{
  const starts=[{...source,x:200,y:680},{...source,x:70,y:580},{...source,x:70,y:680}];
  const plans=starts.map((origin,index)=>planLetterFlight(origin,{...destination,x:160+index*30},index,3));
  plans.forEach((plan,index)=>{assert.equal(plan.delay,LETTER_FLIGHT_TIMING.lead+index*LETTER_FLIGHT_TIMING.step);assert.deepEqual(sampleLetterFlight(plan,0),{x:starts[index].x,y:starts[index].y,scale:1});});
  assert.notDeepEqual(plans[0].c1,plans[1].c1);assert.equal(plans[2].duration,LETTER_FLIGHT_TIMING.duration);
});

function classes(){const values=new Set();return {add:value=>values.add(value),remove:value=>values.delete(value),contains:value=>values.has(value)};}
function style(){const values=new Map();return {setProperty:(name,value)=>values.set(name,value),removeProperty:name=>values.delete(name),getPropertyValue:name=>values.get(name)||''};}
function target(word){const glyphs=[...word].map(()=>({style:style()}));const slots=glyphs.map(glyph=>({classList:classes(),style:style(),querySelector:()=>glyph}));return {classList:classes(),querySelectorAll:()=>slots,slots,glyphs};}
function fixture(){
  let now=0,id=0;const jobs=new Map(),flights=[],idle=[];
  const effects=new TargetEffects({reducedMotion:()=>false,onIdle:s=>idle.push(s),captureFlight:(tiles,panel)=>({panel,letters:tiles.map(letter=>({...source,letter}))}),
    createFlight:snapshot=>{const flight={snapshot,arrivals:snapshot.letters.map((_,index)=>LETTER_FLIGHT_TIMING.lead+LETTER_FLIGHT_TIMING.duration+index*LETTER_FLIGHT_TIMING.step),landed:[],played:0,cancelled:0,
      play(){this.played++;},arrive(index){this.landed.push(index);},cancel(){this.cancelled++;}};flights.push(flight);return flight;},
    setTimer:(fn,delay)=>{const key=++id;jobs.set(key,{at:now+delay,fn});return key;},clearTimer:key=>jobs.delete(key)});
  return {effects,flights,idle,get pending(){return jobs.size;},advance(ms){const end=now+ms;while(true){const next=[...jobs].filter(([,job])=>job.at<=end).sort((a,b)=>a[1].at-b[1].at)[0];if(!next)break;now=next[1].at;jobs.delete(next[0]);next[1].fn();}now=end;}};
}

test('目标格等对应字母到达才上色和显示，不再附加一段原地落字',()=>{
  const f=fixture(),session={completed:new Set()},word=target('CAT'),nodes=new Map([['CAT',word]]);f.effects.sync(session,nodes);
  const snapshot=f.effects.capturePath(['C','A','T'],{});session.completed.add('CAT');assert.equal(f.effects.queueFlight(session,'CAT',snapshot),true);f.effects.sync(session,nodes);
  const flight=f.flights[0];assert.equal(flight.played,1);assert.equal(word.classList.contains('target-inflight'),true);
  assert.ok(word.slots.every(slot=>!slot.classList.contains('target-landed')));assert.ok(word.glyphs.every(glyph=>glyph.style.getPropertyValue('--letter-delay')===''));
  f.advance(flight.arrivals[0]-1);assert.deepEqual(flight.landed,[]);f.advance(1);assert.deepEqual(flight.landed,[0]);
  assert.equal(word.slots[0].classList.contains('target-landed'),true);assert.equal(word.slots[1].classList.contains('target-landed'),false);
  f.advance(flight.arrivals.at(-1)-flight.arrivals[0]+TARGET_LANDING.glowDuration);assert.equal(f.effects.isRunning(session),false);assert.deepEqual(f.idle,[session]);assert.equal(flight.cancelled,1);
});

test('首词彩虹在字母落位后开始，最后一个字母到达前不提前完成展示',()=>{
  const f=fixture(),session={completed:new Set(),initial:{targets:['CAT','DOG','OWL'].map(word=>({word}))}},word=target('CAT'),nodes=new Map([['CAT',word]]);f.effects.sync(session,nodes);
  session.completed.add('CAT');f.effects.queueFlight(session,'CAT',f.effects.capturePath(['C','A','T'],{}));f.effects.sync(session,nodes);
  const flight=f.flights[0];word.slots.forEach((slot,index)=>assert.ok(parseFloat(slot.style.getPropertyValue('--motion-delay'))>=flight.arrivals[index]));
  f.advance(flight.arrivals.at(-1)-1);assert.equal(f.effects.isRunning(session),true);assert.equal(word.slots.at(-1).classList.contains('target-landed'),false);
  f.advance(1);assert.deepEqual(flight.landed,[0,1,2]);f.advance(TARGET_RAINBOW.duration+TARGET_LANDING.glowDuration+500);assert.equal(f.effects.isRunning(session),false);
});

test('快速连续连词保留各自飞行；同一词重复渲染不重复起飞，切关清空全部克隆和延迟',()=>{
  const f=fixture(),session={completed:new Set()},nodes=new Map(['CAT','DOG'].map(word=>[word,target(word)]));f.effects.sync(session,nodes);
  for(const word of ['CAT','DOG']){session.completed.add(word);f.effects.queueFlight(session,word,f.effects.capturePath([...word],{}));f.effects.sync(session,nodes);}
  f.effects.sync(session,nodes);assert.equal(f.flights.length,2);assert.equal(f.effects.isRunning(session),true);
  f.effects.sync({completed:new Set()},new Map());f.advance(5000);assert.ok(f.flights.every(flight=>flight.cancelled===1));assert.equal(f.pending,0);assert.deepEqual(f.idle,[]);
  assert.ok([...nodes.values()].every(node=>!node.classList.contains('target-inflight')));
});

test('错误路线、重复词、来源字母不匹配不创建飞行，减弱动态不读取几何信息',()=>{
  const f=fixture(),session={completed:new Set(['CAT'])};f.effects.sync(session,new Map());
  assert.equal(f.effects.queueFlight(session,'CAT',f.effects.capturePath(['C','A','T'],{})),false);
  assert.equal(f.effects.queueFlight(session,'DOG',f.effects.capturePath(['D','G','O'],{})),false);assert.equal(f.flights.length,0);
  const reduced=new TargetEffects({reducedMotion:()=>true,captureFlight:()=>{throw Error('must not read layout');}});assert.equal(reduced.capturePath(['C'],{}),null);
});

test('缩放预览中先滚动长列表的目标到可见区，再确定字母落点',()=>{
  const f=fixture(),session={completed:new Set()},word=target('CAT'),nodes=new Map([['CAT',word]]);
  const root={scrollHeight:500,clientHeight:200,scrollTop:0,getBoundingClientRect:()=>({top:50,bottom:150,height:100})};
  word.closest=()=>root;word.getBoundingClientRect=()=>({top:155,bottom:175});
  const createFlight=f.effects.createFlight;
  f.effects.createFlight=(...args)=>{assert.equal(root.scrollTop,50);return createFlight(...args);};
  f.effects.sync(session,nodes);session.completed.add('CAT');
  f.effects.queueFlight(session,'CAT',f.effects.capturePath(['C','A','T'],{}));f.effects.sync(session,nodes);
  assert.equal(f.flights.length,1);assert.equal(f.flights[0].played,1);f.effects.cancel();
});

test('优先从当前单词框取逐字坐标，缩放预览仍匹配；缺失或不匹配时保留棋盘来源',()=>{
  const original=globalThis.getComputedStyle;
  globalThis.getComputedStyle=()=>({fontSize:'20px',fontFamily:'Tile',fontWeight:'900',color:'#fff',textShadow:'none',backgroundImage:'url(frame.png)'});
  try{
    const glyph=(letter,left,top)=>({textContent:letter,getBoundingClientRect:()=>({left,top,width:12,height:20})});
    const tiles=[... 'KEN'].map((letter,index)=>({querySelector:()=>glyph(letter,130+index*50,430)}));
    const preview=[... 'KEN'].map((letter,index)=>glyph(letter,190+index*15,310));
    const panel={clientWidth:520,clientHeight:960,getBoundingClientRect:()=>({left:100,top:30,width:260,height:480})};
    const readout={querySelectorAll:()=>preview,getBoundingClientRect:()=>({left:175,top:300,width:90,height:40})};
    const snapshot=captureLetterOrigins(tiles,panel,readout);
    assert.equal(snapshot.origin,'readout');assert.equal(snapshot.plate.width,180);assert.equal(snapshot.letters[0].x,192);assert.equal(snapshot.letters[0].y,580);
    preview[0].textContent='X';const fallback=captureLetterOrigins(tiles,panel,readout);
    assert.equal(fallback.origin,'board');assert.equal(fallback.plate,null);assert.equal(fallback.letters[0].x,72);assert.equal(fallback.letters[0].y,820);
  }finally{globalThis.getComputedStyle=original;}
});

test('重复目标只提醒已完成词，不开飞字、不阻塞结算；重复操作重置提醒时间，切场景清理',()=>{
  const f=fixture(),session={completed:new Set(['CAT'])},cat=target('CAT');f.effects.sync(session,new Map([['CAT',cat]]));
  assert.equal(f.effects.remind(session,'DOG',cat),false);
  assert.equal(f.effects.remind(session,'CAT',cat),true);assert.equal(cat.classList.contains('target-repeat'),true);
  assert.equal(f.effects.isRunning(session),false);assert.equal(f.flights.length,0);assert.deepEqual([...session.completed],['CAT']);
  f.advance(200);f.effects.remind(session,'CAT',cat);f.advance(360);assert.equal(cat.classList.contains('target-repeat'),true);
  f.advance(200);assert.equal(cat.classList.contains('target-repeat'),false);
  f.effects.remind(session,'CAT',cat);f.effects.cancel();f.advance(1000);
  assert.equal(cat.classList.contains('target-repeat'),false);assert.equal(f.pending,0);assert.deepEqual(f.idle,[]);
});
