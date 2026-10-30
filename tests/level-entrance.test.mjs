import test from 'node:test';
import assert from 'node:assert/strict';
import {LevelEntrance} from '../dist/level-entrance.js';

function node(row=1,column=1,remaining=1){
  const classes=new Set(),styles=new Map(),attributes=new Map();
  return {inert:false,dataset:{remaining:String(remaining)},classList:{add:name=>classes.add(name),remove:name=>classes.delete(name),contains:name=>classes.has(name)},
    style:{gridRow:String(row),gridColumn:String(column),setProperty:(key,value)=>styles.set(key,value),removeProperty:key=>styles.delete(key),getPropertyValue:key=>styles.get(key)},
    setAttribute:(key,value)=>attributes.set(key,value),removeAttribute:key=>attributes.delete(key)};
}
function fixture(options={}){
  let id=0;const jobs=new Map(),done=[];
  const intro=new LevelEntrance({reducedMotion:()=>false,setTimer:(fn,delay)=>{jobs.set(++id,{fn,delay});return id;},clearTimer:key=>jobs.delete(key),onDone:session=>done.push(session),...options});
  const slots=Array.from({length:9},()=>node()),tiles=[node(3,1),node(1,1),node(2,1,0),node(1,2)];
  const panel=node(),board=node(),hint=node(),view={targets:{querySelectorAll:()=>slots},tiles,panel,locks:[board,hint]};
  return {intro,view,slots,tiles,board,hint,jobs,done,finish(){for(const job of [...jobs.values()])job.fn();}};
}
const session=()=>({status:'playing',completed:new Set()});

test('目标和有效格子入场时锁定操作；按视觉行序落下，落定还原操作与状态',()=>{
  const f=fixture(),game=session();f.hint.inert=true;
  assert.equal(f.intro.play(game,f.view),true);
  assert.ok(f.slots.every(slot=>slot.classList.contains('level-entry-tile')));
  assert.equal(f.tiles[2].classList.contains('level-entry-tile'),false);
  assert.ok(parseInt(f.tiles[1].style.getPropertyValue('--entry-delay'))<parseInt(f.tiles[0].style.getPropertyValue('--entry-delay')));
  assert.equal(f.board.inert,true);assert.equal(f.intro.isRunning(game),true);
  f.finish();assert.equal(f.board.inert,false);assert.equal(f.hint.inert,true);
  assert.equal(f.intro.isRunning(game),false);assert.deepEqual(f.done,[game]);
  assert.equal(game.completed.size,0);assert.equal(game.status,'playing');
  assert.ok([...f.slots,...f.tiles].every(item=>!item.classList.contains('level-entry-tile')));
});

test('反复渲染或返回同一会话不重播，新关卡会重新入场',()=>{
  const f=fixture(),first=session();
  f.intro.play(first,f.view);assert.equal(f.intro.play(first,f.view),false);assert.equal(f.jobs.size,1);
  f.finish();assert.equal(f.intro.play(first,f.view),false);
  const second=session();assert.equal(f.intro.play(second,f.view),true);f.finish();
  assert.deepEqual(f.done,[first,second]);
});

test('中途退出或切换关卡取消旧动画和回调，并解锁入口',()=>{
  const f=fixture(),first=session(),second=session();f.intro.play(first,f.view);
  const stale=[...f.jobs.values()][0].fn;
  f.intro.play(second,f.view);stale();assert.equal(f.intro.isRunning(second),true);
  assert.deepEqual(f.done,[]);assert.equal(f.jobs.size,1);
  f.intro.cancel();stale();assert.equal(f.jobs.size,0);assert.equal(f.board.inert,false);
  assert.equal(f.intro.isRunning(second),false);assert.equal(f.intro.isRunning(undefined),false);assert.deepEqual(f.done,[]);
});

test('隐藏时载入不消耗首次入场；继续已有进度或减弱动态时直接可玩',()=>{
  let visible=false;const f=fixture({isVisible:()=>visible}),game=session();
  assert.equal(f.intro.play(game,f.view),false);visible=true;assert.equal(f.intro.play(game,f.view),true);f.intro.cancel();
  const resumed=session();resumed.completed.add('ICE');assert.equal(f.intro.play(resumed,f.view),false);
  const reduced=fixture({reducedMotion:()=>true});assert.equal(reduced.intro.play(session(),reduced.view),false);
  assert.equal(reduced.jobs.size,0);assert.equal(reduced.board.inert,false);
});
