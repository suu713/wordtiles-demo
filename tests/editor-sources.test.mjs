import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createBankDictionary,bankBonusDictionary,bankDictionaryError,recommendedLengths} from '../dist/core/dictionary-banks.js';
import {createZenDictionary} from '../dist/core/zen-dictionary.js';
import {generateLevel} from '../dist/core/algorithm2.js';
import {createAlgorithmSession,validateAlgorithmLevel,migrateLegacyLevel} from '../dist/core/algorithm-v1-adapter.js';
import {SessionMetrics,levelMetrics} from '../dist/core/playtest-metrics.js';
import {createWordCollection} from '../dist/core/word-collection.js';
import {analysisSheets} from '../dist/core/playtest-export.js';
const lengths=[2,3,4,5,6,7,8,9,10],budget={maxNodesPerAttempt:10000,maxAttempts:30,maxTotalNodes:300000};

test('未点击开始时始终零计时；开始、隐藏暂停和结束准确',()=>{
  let time=0;const t=new SessionMetrics({initial:{board:{rows:2,cols:2}},status:'playing'},{now:()=>time});
  t.resume();time=40000;t.resume();assert.equal(t.snapshot().elapsedSeconds,0);assert.equal(t.snapshot().started,false);
  t.submit([0,1],{accepted:false,reason:'not-target'});assert.equal(t.snapshot().attempts,0);
  t.start();time=42500;assert.equal(t.snapshot().elapsedSeconds,2.5);t.pause();time=90000;assert.equal(t.snapshot().elapsedSeconds,2.5);
  t.resume();time=92000;t.end();time=120000;t.resume();assert.equal(t.snapshot().elapsedSeconds,4.5);
});
test('代码版复用仓库已有审核词库，不携带新增并集或 Zen 词库',()=>{
  const web=createBankDictionary(lengths),wt=createBankDictionary(lengths,'wt-package');
  assert.ok(web.words.length>1000);assert.ok(web.words.some(w=>w.length===3));assert.ok(web.words.some(w=>w.length===10));assert.ok(!web.words.some(w=>w.length===2));
  assert.ok(wt.words.every(w=>web.words.includes(w)));assert.ok(bankDictionaryError({...web,words:[...web.words,'ZZZFAKE']}));
  assert.ok(bankDictionaryError({...web,metadata:{...web.metadata,origin:'wt-package'}}));assert.equal(bankDictionaryError(wt),null);
  assert.ok(wt.words.some(w=>w.length===10));assert.ok(bankBonusDictionary(web).words.length>=web.words.length);
  assert.throws(()=>createZenDictionary(lengths),/未包含在此发布版本/);
});
test('两种已发布词库都能生成并完整校验矩形关卡',()=>{
  for(const [origin,rows,cols,wordLengths] of [['web-supplied',2,4,[8]],['wt-package',2,5,[10]]]){
    const dictionary=createBankDictionary(lengths,origin),config={rows,cols,wordLengths};
    const r=generateLevel(budget,dictionary,0,{levelConfig:config});assert.equal(r.ok,true,r.message);assert.deepEqual(r.level.config,config);
    assert.equal(r.level.source.dictionaryOrigin,origin);assert.equal(validateAlgorithmLevel(r.level,dictionary).valid,true);
    const wrong={...r.level,source:{...r.level.source,dictionaryOrigin:'fake-source'}};assert.equal(validateAlgorithmLevel(wrong,dictionary).valid,false);
    const session=createAlgorithmSession(r.level,dictionary);for(const target of [...r.level.targets].reverse())assert.equal(session.submit(target.path).accepted,true);assert.equal(session.status,'won');
  }
});
test('尺寸推荐与Excel固定覆盖2至10字，无词长度也保留零列',()=>{
  for(const rows of [2,3,4,5,6])for(const cols of [2,3,4,5,6]){const l=recommendedLengths(rows,cols,[3,4,5,6,7,8]);assert.ok(l.every(n=>n<=rows*cols));assert.ok(l.reduce((a,b)=>a+b,0)>=rows*cols);}
  const s=analysisSheets({levels:[{targetCount:1,wordLengths:{8:1},extraWordLengths:{},wordLengthShares:{8:1}}],runs:[],job:{game:'web'}})[1],h=s.rows[0],r=s.rows[1];
  for(let n=2;n<=10;n++){assert.ok(h.includes(n+'字目标词数'));assert.equal(r[h.indexOf(n+'字目标词数')],n===8?1:0);assert.equal(h.filter(c=>c===n+'字目标占比').length,1);}
});
test('目标占比严格用该词长实际目标数除以本关总目标数',()=>{
  const m=levelMetrics({kind:'zen',targets:['IF','NO','DOG','APPLE'],wordRoles:{extra:['CATS','CARTS','CART','CAR','CARES','BAR','BARS'],onlyExtra:[],bonus:[]}});
  assert.equal(m.targetCount,4);assert.equal(m.extras,7);assert.equal(m.wordLengthShares[2],2/4);assert.equal(m.wordLengthShares[3],1/4);assert.equal(m.wordLengthShares[5],1/4);
});
test('同一拼写按来源分别收词，新的网页词可收录且刷新后保留来源',()=>{
  const saved=new Map(),storage={getItem:key=>saved.get(key)||null,setItem:(key,value)=>saved.set(key,value)},c=createWordCollection(storage),shared=createBankDictionary(lengths,'wt-package').words;
  assert.equal(c.collect({accepted:true,word:shared[0]},'english','web-supplied'),true);assert.equal(c.collect({accepted:true,word:shared[0]},'english','wt-package'),true);
  assert.equal(c.collect({accepted:true,word:shared[0]},'english','web-supplied'),false);assert.equal(c.collect({accepted:true,word:shared[1]},'english','wt-package'),true);
  assert.equal(c.collect({accepted:true,word:shared[1]},'english','web-supplied'),true);assert.equal(c.entries().length,4);
  const restored=createWordCollection(storage);assert.equal(restored.entries().length,4);assert.deepEqual(restored.entries().filter(e=>e.word===shared[0]).map(e=>e.origin).sort(),['web-supplied','wt-package']);
});
test('旧网页V1可按所选单一词库复核导入，原始文件保留，跨来源仍拒绝',async()=>{
  const original=JSON.parse(await readFile(new URL('../dist/seed_20261010.json',import.meta.url),'utf8')),d=createBankDictionary(lengths);
  const migrated=migrateLegacyLevel(original,d);assert.deepEqual(migrated.source.importedOriginal,original);assert.equal(migrated.source.dictionaryOrigin,'web-supplied');assert.ok(createAlgorithmSession(migrated,d));
  const declared={...original,source:{dictionaryOrigin:'wt-package'}};assert.throws(()=>migrateLegacyLevel(declared,d));
});
