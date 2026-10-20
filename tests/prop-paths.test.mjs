import test from 'node:test';
import assert from 'node:assert/strict';
import {GameSession,signature} from '../dist/core/rules.js';
import {SourceGameSession,convertSourceLevel} from '../dist/core/source-levels.js';
import {shortestTargetPath} from '../dist/core/prop-paths.js';

test('棋盘烟花按同长度的显示顺序取词，不改次数或完成状态，路径可真实提交',()=>{
  const raw={id:1,width:3,height:2,letters:'CAT,DOG',target_words:[{word:'DOG',type:0},{word:'CAT',type:0}],extra_words:[]};
  const session=new SourceGameSession(convertSourceLevel(raw,{language:'english'})),before=session.snapshot();
  const first=shortestTargetPath(session);assert.equal(first.word,'DOG');assert.deepEqual(first.path,[3,4,5]);
  assert.deepEqual(session.snapshot(),before);first.path.reverse();assert.deepEqual(shortestTargetPath(session).path,[3,4,5]);
  assert.equal(session.submit(shortestTargetPath(session).path).accepted,true);
  assert.equal(shortestTargetPath(session).word,'CAT');assert.equal(session.submit(shortestTargetPath(session).path).accepted,true);
  assert.equal(session.status,'won');assert.equal(shortestTargetPath(session),null);
});

test('从实际未完成词选择最短路径，支持六字拐弯词，不改原目标顺序',()=>{
  const level={schemaVersion:2,config:{rows:3,cols:3,wordLengths:[6,3]},board:{rows:3,cols:3,letters:[...'LONREGCAT'],counts:Array(9).fill(1)},targets:[{word:'LONGER',path:[0,1,2,5,4,3]},{word:'CAT',path:[6,7,8]}]};
  const session=new GameSession(level,{words:['LONGER','CAT']}),initial=JSON.stringify(session.initial);
  assert.equal(shortestTargetPath(session).word,'CAT');assert.equal(JSON.stringify(session.initial),initial);
  session.submit(shortestTargetPath(session).path);
  const next=shortestTargetPath(session);assert.equal(next.word,'LONGER');assert.equal(next.path.length,6);
  assert.equal(session.submit(next.path).accepted,true);assert.equal(session.total,0);
});

test('只提示当前可用格子，WT严格匹配参考消耗集合，不能给出无法提交的替代路径',()=>{
  const session={status:'playing',completed:new Set(),counts:[0,0,1,1],initial:{board:{rows:2,cols:2,letters:[...'ABBA']},targets:[{word:'AB',path:[0,1]}]},report:{enforceConsumption:true,targets:[{word:'AB',consumption:[2,3]}]}};
  const before=structuredClone(session.counts),result=shortestTargetPath(session);
  assert.deepEqual(result,{word:'AB',path:[3,2]});assert.equal(signature(result.path),'2,3');assert.deepEqual(session.counts,before);
  session.report.targets[0].consumption=[0,1];assert.equal(shortestTargetPath(session),null);
  session.report.enforceConsumption=false;assert.deepEqual(shortestTargetPath(session).path,[3,2]);
  session.counts.fill(0);assert.equal(shortestTargetPath(session),null);
});
