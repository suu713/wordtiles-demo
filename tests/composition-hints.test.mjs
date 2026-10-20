import test from 'node:test';
import assert from 'node:assert/strict';
import {compositionCounts,normalizeComposition,planTargetLengths} from '../dist/core/target-composition.js';
import {createLetterHints} from '../dist/core/letter-hints.js';
import {createBankDictionary} from '../dist/core/dictionary-banks.js';
import {checkConfiguration} from '../dist/core/rules.js';
import {normalizeBatchPlan,planLevelOptions} from '../dist/core/batch-plan.js';
import {SourceGameSession,convertSourceLevel} from '../dist/core/source-levels.js';

test('词长比例以用户指定的目标词数量为分母，整数分配保持总数且不增加零比例类别',()=>{
  assert.deepEqual(compositionCounts(10,{three:30,four:20}),{three:3,four:2,other:5});
  assert.deepEqual(compositionCounts(7,{three:30,four:30}),{three:2,four:2,other:3});
  assert.deepEqual(compositionCounts(5,{three:0,four:100}),{three:0,four:5,other:0});
  assert.deepEqual(compositionCounts(5,{three:0,four:0}),{three:0,four:0,other:5});
  assert.throws(()=>normalizeComposition({three:70,four:40}),/100/);assert.throws(()=>normalizeComposition({three:'',four:20}));
  for(const count of [0,17,1.5])assert.throws(()=>compositionCounts(count,{three:30,four:30}));
});

test('不同棋盘不改目标词数量；剩余词长随机且整块棋盘可覆盖',()=>{
  for(const shape of [{rows:3,cols:3,targetCount:5},{rows:3,cols:6,targetCount:8},{rows:6,cols:6,targetCount:12}]){
    const composition={three:30,four:20},counts=compositionCounts(shape.targetCount,composition),seen=new Set();
    for(let i=0;i<24;i++){
      const lengths=planTargetLengths({...shape,composition}),config={rows:shape.rows,cols:shape.cols,wordLengths:lengths};
      assert.equal(lengths.length,shape.targetCount);assert.equal(lengths.filter(n=>n===3).length,counts.three);assert.equal(lengths.filter(n=>n===4).length,counts.four);
      assert.equal(checkConfiguration(config).valid,true);assert.ok(lengths.every(n=>n===3||n===4||n===2||n>=5&&n<=10));seen.add([...lengths].sort().join(','));
    }
    assert.ok(seen.size>1,'其余词长不能固定');
  }
  assert.throws(()=>planTargetLengths({rows:6,cols:6,targetCount:5,composition:{three:100,four:0}}),/无法覆盖/);
  assert.throws(()=>planTargetLengths({rows:2,cols:2,targetCount:16,composition:{three:0,four:100}}),/使用上限/);
});

test('只使用当前词库可用长度，比例要求缺失的长度时拒绝而不偷换比例',()=>{
  assert.throws(()=>planTargetLengths({rows:3,cols:3,targetCount:5,composition:{three:40,four:20}},[2,4,5]),/所选词库/);
  const lengths=planTargetLengths({rows:3,cols:3,targetCount:5,composition:{three:40,four:20}},[3,4,5],()=>.5);
  assert.deepEqual([...lengths].sort((a,b)=>a-b),[3,3,4,5,5]);
});

test('批量难度曲线不覆盖手填的固定词数，生成配置遵守同一比例',()=>{
  const dictionary=createBankDictionary([3,4,5,6,7,8,9,10]),plan=normalizeBatchPlan({startNumber:1,targetMode:'fixed',fixedTargets:8,startTargets:4,endTargets:12,sizes:[{rows:3,cols:3},{rows:3,cols:6}],composition:{three:25,four:25},minLength:3,maxLength:10,maxUses:5},30);
  for(const index of [0,15,29]){const options=planLevelOptions(plan,index,dictionary);assert.ok(options.length);for(const {config} of options){assert.equal(config.wordLengths.length,8);assert.equal(config.wordLengths.filter(n=>n===3).length,2);assert.equal(config.wordLengths.filter(n=>n===4).length,2);assert.equal(checkConfiguration(config,dictionary).valid,true);}}
});

test('单字母道具随机选词且优先靠前字位，跳过已经完成和揭开的字母',()=>{
  const hints=createLetterHints(['CAT','DOG','BIRD'],{random:()=>.99}),done=new Set(['DOG']);
  const first=hints.reveal(1,done)[0],second=hints.reveal(1,done)[0];assert.equal(first.index,0);assert.equal(second.index,0);assert.notEqual(first.word,second.word);assert.equal(hints.reveal(1,done)[0].index,1);
  const rest=hints.reveal(100,done);assert.ok(rest.every(item=>item.word!=='DOG'));assert.equal(hints.remaining(done),0);assert.deepEqual(hints.reveal(1,done),[]);
});

test('烟花按显示顺序揭开同长度的整个词，不改变棋盘或完成目标',()=>{
  const raw={id:1,width:3,height:2,letters:'CAT,DOG',target_words:[{word:'CAT',type:0},{word:'DOG',type:0}],extra_words:[]},session=new SourceGameSession(convertSourceLevel(raw,{language:'english'})),before=session.snapshot(),hints=createLetterHints(session.initial.targets,{random:()=>0});
  const first=hints.revealShortestWord(session.completed);assert.deepEqual(first.map(item=>item.letter),['C','A','T']);assert.ok(first.every(item=>item.word==='CAT'));assert.deepEqual(session.snapshot(),before);assert.equal(session.status,'playing');
  assert.equal(hints.revealShortestWord(session.completed).map(item=>item.letter).join(''),'DOG');assert.deepEqual(hints.revealShortestWord(session.completed),[]);
  for(const target of session.initial.targets)assert.equal(session.submit(target.path).accepted,true);assert.equal(session.status,'won');
});

test('整词烟花从最短词开始，同长度不按字母重排，已完成和全部揭示的词跳过',()=>{
  const hints=createLetterHints(['LONGER','DOG','CAT','AT','RAIN'],{random:()=>{throw new Error('整词选择不应随机');}}),done=new Set(['CAT']);
  assert.equal(hints.revealShortestWord(done).map(item=>item.letter).join(''),'AT');
  assert.equal(hints.revealShortestWord(done).map(item=>item.letter).join(''),'DOG');
  assert.equal(hints.revealShortestWord(done).map(item=>item.letter).join(''),'RAIN');
  assert.equal(hints.revealShortestWord(done).map(item=>item.letter).join(''),'LONGER');
  assert.deepEqual(hints.revealShortestWord(done),[]);assert.equal(hints.remaining(done),0);assert.equal(hints.has('CAT',0),false);
});

test('部分提示的最短词补齐整词，2至10字词均不受原五字母上限影响',()=>{
  const hints=createLetterHints(['BIRD','DOG','CAT'],{random:()=>.5});
  assert.equal(hints.reveal(1)[0].word,'DOG');
  assert.deepEqual(hints.revealShortestWord().map(({word,index,letter})=>[word,index,letter]),[['DOG',1,'O'],['DOG',2,'G']]);
  assert.ok([...Array(3)].every((_,index)=>hints.has('DOG',index)));
  assert.equal(hints.revealShortestWord().map(item=>item.letter).join(''),'CAT');
  for(let length=2;length<=10;length++){
    const word='ABCDEFGHIJ'.slice(0,length),state=createLetterHints([word]);
    assert.equal(state.revealShortestWord().map(item=>item.letter).join(''),word);assert.equal(state.remaining(),0);
  }
});
