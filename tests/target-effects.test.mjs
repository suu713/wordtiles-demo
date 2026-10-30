import test from 'node:test';
import assert from 'node:assert/strict';
import {TargetEffects,TARGET_LANDING,TARGET_MILESTONES} from '../dist/target-effects.js';

function fakeClock(){
  let time=0,id=0;const jobs=new Map();
  return {
    setTimer(fn,delay){const key=++id;jobs.set(key,{at:time+delay,fn});return key;},
    clearTimer(key){jobs.delete(key);},
    advance(ms){time+=ms;for(const [key,job] of [...jobs])if(job.at<=time){jobs.delete(key);job.fn();}},
    get pending(){return jobs.size;},
  };
}
function classes(){const values=new Set();return {add:name=>values.add(name),remove:name=>values.delete(name),contains:name=>values.has(name)};}
function style(){const values=new Map();return {setProperty:(name,value)=>values.set(name,value),removeProperty:name=>values.delete(name),getPropertyValue:name=>values.get(name)||''};}
function target(word){
  const glyphs=[...word].map(()=>({style:style()}));
  const slots=glyphs.map(glyph=>({classList:classes(),style:style(),querySelector:()=>glyph}));
  return {classList:classes(),querySelectorAll:()=>slots,slots,glyphs};
}

test('载入进度不回放；新收词先落底色、逐字入场，重复更新不重启动画',()=>{
  const clock=fakeClock(),board={classList:classes(),offsetWidth:280},effects=new TargetEffects({...clock,board,reducedMotion:()=>false});
  const session={completed:new Set(['OLD'])},old=target('OLD'),cat=target('CAT'),nodes=new Map([['OLD',old],['CAT',cat]]);
  effects.sync(session,nodes);assert.equal(old.classList.contains('target-collecting'),false);
  session.completed.add('CAT');effects.sync(session,nodes);
  assert.equal(board.classList.contains('word-accepted'),true);
  assert.equal(cat.glyphs[0].style.getPropertyValue('--letter-delay'),TARGET_LANDING.colorLead+'ms');assert.equal(effects.isRunning(session),true);
  assert.equal(cat.slots[0].classList.contains('target-landed'),true);
  assert.equal(cat.slots[1].classList.contains('target-landed'),false);
  cat.slots.forEach((slot,index)=>assert.equal(slot.style.getPropertyValue('--glow-delay'),(index*TARGET_LANDING.step+TARGET_LANDING.colorLead+TARGET_LANDING.duration)+'ms'));
  cat.glyphs.forEach((glyph,index)=>assert.equal(glyph.style.getPropertyValue('--letter-delay'),(index*TARGET_LANDING.step+TARGET_LANDING.colorLead)+'ms'));const timerCount=clock.pending;
  clock.advance(TARGET_LANDING.step);assert.equal(cat.slots[1].classList.contains('target-landed'),true);
  effects.sync(session,nodes);assert.equal(clock.pending,timerCount-1);
  assert.deepEqual([...session.completed],['OLD','CAT']);effects.cancel();assert.equal(board.classList.contains('word-accepted'),false);
});

test('连续收词等最后一个字母和落定光效结束后再释放过关展示',()=>{
  const clock=fakeClock(),idle=[],effects=new TargetEffects({...clock,onIdle:s=>idle.push(s),reducedMotion:()=>false});
  const session={completed:new Set()},cat=target('CAT'),dog=target('DOG'),nodes=new Map([['CAT',cat],['DOG',dog]]);
  effects.sync(session,nodes);session.completed.add('CAT');effects.sync(session,nodes);clock.advance(100);
  session.completed.add('DOG');effects.sync(session,nodes);
  const duration=2*TARGET_LANDING.step+TARGET_LANDING.colorLead+TARGET_LANDING.duration+TARGET_LANDING.glowDuration;
  clock.advance(duration-100);assert.equal(effects.isRunning(session),true);assert.equal(idle.length,0);
  clock.advance(99);assert.equal(idle.length,0);clock.advance(1);
  assert.equal(effects.isRunning(session),false);assert.deepEqual(idle,[session]);assert.equal(clock.pending,0);
  assert.equal(dog.classList.contains('target-collecting'),false);
});

test('切关或退出取消所有延迟，旧动画不触发新关的完成窗口',()=>{
  const clock=fakeClock(),idle=[],effects=new TargetEffects({...clock,onIdle:s=>idle.push(s),reducedMotion:()=>false});
  const first={completed:new Set()},old=target('OLD');effects.sync(first,new Map([['OLD',old]]));first.completed.add('OLD');effects.sync(first,new Map([['OLD',old]]));
  const second={completed:new Set()};effects.sync(second,new Map());clock.advance(5000);
  assert.equal(clock.pending,0);assert.equal(effects.isRunning(first),false);assert.equal(effects.isRunning(second),false);assert.deepEqual(idle,[]);
  assert.ok(old.slots.every(slot=>!slot.classList.contains('target-landed')));assert.equal(old.classList.contains('target-collecting'),false);
  assert.ok(old.slots.every(slot=>slot.style.getPropertyValue('--glow-delay')===''));
});

test('减弱动态或界面不可见时保留静态完成展示，不阻塞过关',()=>{
  for(const [isVisible,reducedMotion] of [[()=>false,()=>false],[()=>true,()=>true]]){
    const effects=new TargetEffects({isVisible,reducedMotion}),session={completed:new Set()},word=target('CAT'),nodes=new Map([['CAT',word]]);
    effects.sync(session,nodes);session.completed.add('CAT');effects.sync(session,nodes);
    assert.equal(word.classList.contains('target-collecting'),false);assert.equal(effects.isRunning(session),false);assert.deepEqual([...session.completed],['CAT']);
  }
});

test('按收词顺序只给倒数第二词波动、最后一词首块翻转，并等回位光效后结算',()=>{
  const clock=fakeClock(),idle=[],effects=new TargetEffects({...clock,reducedMotion:()=>false,onIdle:s=>idle.push(s)});
  const words=['CAT','DOG','OWL'],session={completed:new Set(),initial:{targets:words.map(word=>({word}))}};
  const nodes=new Map(words.map(word=>[word,target(word)]));effects.sync(session,nodes);
  session.completed.add('OWL');effects.sync(session,nodes);assert.equal(nodes.get('OWL').classList.contains('target-wave'),false);clock.advance(1000);
  session.completed.add('CAT');effects.sync(session,nodes);assert.equal(nodes.get('CAT').classList.contains('target-wave'),true);
  clock.advance(50);session.completed.add('DOG');effects.sync(session,nodes);
  const finale=nodes.get('DOG');assert.equal(finale.classList.contains('target-finale'),true);
  assert.equal(finale.slots[0].style.getPropertyValue('--motion-delay'),TARGET_MILESTONES.flipDelay+'ms');
  assert.equal(finale.slots[1].style.getPropertyValue('--motion-delay'),'');
  const duration=TARGET_MILESTONES.flipDelay+TARGET_MILESTONES.flipDuration+TARGET_LANDING.glowDuration;
  clock.advance(duration-1);assert.equal(effects.isRunning(session),true);assert.equal(idle.length,1);
  clock.advance(1);assert.equal(effects.isRunning(session),false);assert.equal(idle.length,2);
  assert.equal(finale.classList.contains('target-finale'),false);assert.equal(nodes.get('CAT').classList.contains('target-wave'),false);
  assert.ok(finale.slots.every(slot=>slot.style.getPropertyValue('--motion-delay')===''));
});

test('同一次更新收齐多个词也按次序区分末两词；退出清理全部附加动作',()=>{
  const clock=fakeClock(),effects=new TargetEffects({...clock,reducedMotion:()=>false});
  const session={completed:new Set(),initial:{targets:[{word:'CAT'},{word:'DOG'}]}},nodes=new Map([['CAT',target('CAT')],['DOG',target('DOG')]]);
  effects.sync(session,nodes);session.completed.add('DOG');session.completed.add('CAT');effects.sync(session,nodes);
  assert.equal(nodes.get('DOG').classList.contains('target-wave'),true);assert.equal(nodes.get('CAT').classList.contains('target-finale'),true);
  effects.cancel();clock.advance(5000);assert.equal(clock.pending,0);
  for(const item of nodes.values()){
    assert.equal(item.classList.contains('target-wave'),false);assert.equal(item.classList.contains('target-finale'),false);
    assert.ok(item.slots.every(slot=>slot.style.getPropertyValue('--motion-duration')===''));
  }
});
