import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {ACORN_MODES,AcornRound,createAcornCollection,ACORN_KEY} from '../dist/core/acorn-activity.js';
import {convertWTLevel,WTSourceSession} from '../dist/core/wt-source-session.js';
import {DATA_RESET_KEY} from '../dist/core/app-data.js';
const bank=JSON.parse(await readFile(new URL('../dist/source-levels/english.json',import.meta.url),'utf8'));
const levelAt=number=>convertWTLevel(bank.levels[bank.orders.level_list_0[number-1]],{order:'level_list_0',position:number});
const store=()=>{const data=new Map();return {getItem:key=>data.get(key)||null,setItem:(key,value)=>data.set(key,value)};};

test('三种活动分别只覆盖全棋盘、少量木格和上方词框；每关2或3枚，位置合法且不改变原关卡',()=>{
  const level=levelAt(6),original=JSON.stringify(level);
  for(const mode of ACORN_MODES)for(const number of [1,2]){
    const game=new WTSourceSession(level),round=new AcornRound(game,mode.id,number);
    assert.equal(round.goal,number===1?2:3);
    if(mode.id==='all'){assert.equal(round.boardWood.size,9);assert.equal(round.boardAcorns.size,round.goal);assert.equal(round.targetAcorns.size,0);}
    if(mode.id==='sparse'){assert.deepEqual(round.boardWood,round.boardAcorns);assert.ok(round.boardWood.size<9);}
    if(mode.id==='targets'){assert.equal(round.boardWood.size,0);assert.equal(round.boardAcorns.size,0);assert.equal(round.targetAcorns.size,round.goal);}
    for(const [word,position]of round.targetAcorns)assert.ok(position>=0&&position<word.length);
    assert.deepEqual(game.counts,level.board.counts);assert.equal(JSON.stringify(level),original);
  }
});

test('木格仍有次数时不奖励；错误、重复渲染不奖励，真正耗尽才收取且只取一次',()=>{
  const game=new WTSourceSession(levelAt(6)),round=new AcornRound(game,'all',1);
  // FEE is a legitimate word but leaves several shared E/F cells in use.
  const before=[...game.counts];game.collectTarget('FEE');const found=round.observe();
  for(const {cell}of found.board){assert.ok(before[cell]>0);assert.equal(game.counts[cell],0);}
  for(const cell of round.boardAcorns)if(game.counts[cell]>0)assert.ok(!round.collected.has('board:'+cell));
  assert.deepEqual(round.observe().keys,[]);game.submit([0,1]);assert.deepEqual(round.observe().keys,[]);
  for(const target of game.initial.targets)if(!game.completed.has(target.word))game.collectTarget(target.word);
  round.observe();assert.equal(round.collected.size,round.goal);assert.deepEqual(round.observe().keys,[]);
});

test('目标格内的橡果只随对应新目标完成收集；没有橡果的目标词不增加奖励',()=>{
  const game=new WTSourceSession(levelAt(6)),round=new AcornRound(game,'targets',1);
  const empty=game.initial.targets.find(target=>!round.targetAcorns.has(target.word));
  game.collectTarget(empty.word);const first=round.observe();assert.equal(first.targets[0].word,empty.word);assert.equal(first.keys.length,0);assert.equal(first.targets[0].position,undefined);
  const word=round.targetAcorns.keys().next().value;game.collectTarget(word);const second=round.observe();
  assert.equal(second.targets[0].word,word);assert.equal(second.keys.length,1);assert.equal(second.board.length,0);assert.deepEqual(round.observe().keys,[]);
});

test('每种形式按不同顺序完成多关，所有隐藏橡果均可收齐，原包规则与次数不变',()=>{
  for(const position of [6,7,8,12,25,50,65])for(const mode of ACORN_MODES)for(const reverse of [false,true]){
    const game=new WTSourceSession(levelAt(position)),round=new AcornRound(game,mode.id,position);
    let guard=0;
    while(game.status==='playing'&&guard++<30){const targets=game.availableTargets;const target=reverse?targets.at(-1):targets[0];assert.ok(target);game.collectTarget(target.word);round.observe();}
    assert.equal(game.status,'won');assert.equal(round.collected.size,round.goal,`${position}:${mode.id}`);assert.ok(game.counts.every(count=>count===0));
  }
});

test('活动橡果独立持久化、重复收取去重；存储写满保留内存，清数据后旧活动不能回写',()=>{
  const storage=store(),collection=createAcornCollection(storage);assert.equal(collection.read(),0);
  collection.collect('round1',['board:2','board:5']);collection.collect('round1',['board:2']);assert.equal(collection.read(),2);
  const restored=createAcornCollection(storage);restored.collect('round2',['target:FEED']);assert.equal(collection.read(),3);
  assert.equal(JSON.parse(storage.getItem(ACORN_KEY)).total,3);
  const write=storage.setItem;storage.setItem=()=>{throw Error('full');};collection.collect('round3',['x']);collection.collect('round3',['y']);assert.equal(collection.read(),5);
  storage.setItem=write;storage.setItem(DATA_RESET_KEY,'new-epoch');collection.collect('stale',['z']);assert.equal(collection.read(),5);
});
