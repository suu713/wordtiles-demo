import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {COMMON_DICTIONARY, POLICY_VERSION, wordGate, createBaseDictionary, isTargetAllowed, runtimeDictionaryError} from '../dist/core/target-policy.js';
import {WORD_ENTRIES, WORDLIST_VERSION, BONUS_DICTIONARY, approvedWordCount, wordEntryFor, createFrequencyDictionary} from '../dist/core/word-library.js';
import {generateLevel} from '../dist/core/algorithm2.js';
import {validateAlgorithmLevel,createAlgorithmSession} from '../dist/core/algorithm-v1-adapter.js';
import {calculateLevelStatistics} from '../dist/core/level-statistics.js';
import {findWordPaths} from '../dist/core/rules.js';
import {checkV1Independently,permutations} from '../scripts/independent-v1-check.mjs';

const json=async path=>JSON.parse(await readFile(new URL(path,import.meta.url),'utf8'));
const dictionary=createBaseDictionary([3,3,3,4,5]), fixture=await json('../examples/tsv/seed_20261010.json');

test('新TSV21094词逐字段打包，原档位与中文释义未修改，版本包含输入哈希',async()=>{
  const bytes=await readFile(new URL('../data/words.tsv',import.meta.url)), packaged=await json('../dist/wordlist.json');
  assert.equal(WORD_ENTRIES.length,21094);assert.equal(BONUS_DICTIONARY.words.length,21094);
  assert.equal(createHash('sha256').update(bytes).digest('hex'),packaged.source.sha256);
  for(const line of bytes.toString('utf8').split(/\r?\n/)) {
    if(!line||line.startsWith('#'))continue;
    const [word,tier,definition]=line.split('\t');assert.deepEqual(wordEntryFor(word),{word,tier:Number(tier),definition});
  }
  assert.equal(wordEntryFor('CAT').definition,'猫');assert.equal(wordEntryFor('HELLO').definition,'你好');
  assert.equal(WORDLIST_VERSION,'wordtiles-tsv-20261010-9c5b22c2b994');
});

test('原3333白名单完整保留，实际出题为新TSV交集2857词，当前候选1470',async()=>{
  assert.equal(COMMON_DICTIONARY.words.length,3333);assert.equal(approvedWordCount,2857);assert.equal(dictionary.words.length,1470);
  assert.deepEqual(await readFile(new URL('../dist/common-v2/dictionary.json',import.meta.url)),await readFile(new URL('../data/common-v2/dictionary.json',import.meta.url)));
  assert.ok(wordGate.forLengths([9,10]).words.includes('STRAWBERRY'));
  assert.ok(createBaseDictionary([7]).words.includes('TEACHER'));
  assert.equal(WORD_ENTRIES.every(entry=>entry.word.length>=3&&entry.word.length<=8),true);
  assert.equal(Object.isFrozen(WORD_ENTRIES),true);
});

test('新词表里的NAT/DELL仍不能作目标；变形不自动还原，独立派生词不误删',()=>{
  assert.equal(wordEntryFor('NAT').word,'NAT');assert.equal(wordEntryFor('DELL').word,'DELL');
  for(const word of ['NAT','TEL','DELL','RATED','APPLES','CATS','WENT','RUNNING','WOMEN','FEET','HAPPIER','SAW','ROSE','LEFT','LAD','OAT']) assert.equal(isTargetAllowed(word),false,word);
  for(const word of ['AND','RATE','APPLE','CAT','RUN','WOMAN','FOOT','HAPPY','BUS','GLASS','KING','TEACHER','FLOWER','PUDDING','CEILING','CUT','PUT','HIT','READ']) assert.equal(isTargetAllowed(word),true,word);
});

test('生成与导入共用当前完整对象，旧TSV/V2/1602词库、数组、伪造非法候选均拒绝',async()=>{
  const invalid=[dictionary.words,await json('../dist/dictionary-v1.json'),await json('../data/common-v2/dictionary_3to5.json'),BONUS_DICTIONARY,
    {...dictionary,words:[...dictionary.words,'NAT']},{...dictionary,words:[...dictionary.words,'RATED']},
    {...dictionary,words:['CAT','CAT']},{...dictionary,metadata:{...dictionary.metadata,runtimeSelection:{allowUnreviewed:true}}}];
  for(const input of invalid) {
    assert.equal(runtimeDictionaryError(input).code,'DICTIONARY_POLICY');const result=generateLevel({},input,0);
    assert.equal(result.ok,false);assert.equal(result.code,'DICTIONARY_POLICY');assert.ok(!result.level);
    assert.equal(validateAlgorithmLevel(fixture,input).valid,false);
  }
  assert.equal(runtimeDictionaryError(dictionary),null);
});

test('当前TSV默认seed20261010逐字段等于新样例，原算法源码哈希不变',async()=>{
  const result=generateLevel({},dictionary,20261010);assert.equal(result.ok,true);assert.deepEqual(result.level,fixture);
  assert.deepEqual(result.level.targets.map(t=>t.word),['FOR','LAP','PAL','CLAP','FORTY']);
  assert.deepEqual(checkV1Independently(result.level,dictionary),{statesChecked:32});
  const source=await readFile(new URL('../src/wordtiles-algorithm.ts',import.meta.url));
  assert.equal(createHash('sha256').update(source).digest('hex'),'03d7725073a78b68c02dbf7176082f0b7e2b17ffcb788a7197322b80975d0650');
});

test('新关卡120种真实顺序都归零，重开和导出保持初始数据',()=>{
  let orders=0;
  for(const order of permutations(fixture.targets)) {
    const game=createAlgorithmSession(fixture,dictionary,{bonusDictionary:BONUS_DICTIONARY});
    for(const target of order) {assert.equal(game.submit(target.canonicalPath).accepted,true);assert.equal(game.audit(),true);}
    assert.equal(game.status,'won');assert.deepEqual(game.counts,Array(9).fill(0));assert.deepEqual(game.exportInitial,fixture);orders++;
  }
  assert.equal(orders,120);
});

test('旧LAD/OAT/V2样例、违规目标、破损路径次数整关拒绝且不改输入',async()=>{
  const levels=[await json('../dist/sample.json'),await json('../examples/seed_20261010.json'),await json('../examples/common-v2/seed_20261010.json')];
  for(const change of [l=>l.targets[0].word='RATED',l=>l.initialCounts[0]++,l=>l.targets[0].canonicalPath=[0,4,8]]) {const level=structuredClone(fixture);change(level);levels.push(level);}
  for(const level of levels) {const before=structuredClone(level);assert.equal(validateAlgorithmLevel(level,dictionary).valid,false);assert.throws(()=>createAlgorithmSession(level,dictionary));assert.deepEqual(level,before);}
});

test('词不足、预算耗尽和取消直接失败，无旧库或固定关回退',()=>{
  const attempts=[
    [generateLevel({},{...dictionary,words:['CAT']},0),'DICTIONARY_INSUFFICIENT'],
    [generateLevel({maxNodesPerAttempt:1,maxAttempts:1,maxTotalNodes:1},dictionary,0),'SEARCH_BUDGET_EXCEEDED'],
    [generateLevel({},dictionary,0,{isCancelled:()=>true}),'CANCELLED']
  ];
  for(const [result,code] of attempts) {assert.equal(result.ok,false);assert.equal(result.code,code);assert.ok(!result.level);}
});

test('档位只用新TSV原分类缩小白名单，未审核开关拒绝，不借用旧Zipf分数',()=>{
  for(const tier of [1,2,3,4,5]) {
    const view=createFrequencyDictionary({wordLengths:[3,3,3,4,5],tiers:[tier]});
    assert.equal(runtimeDictionaryError(view),null);
    assert.deepEqual(view.words,dictionary.words.filter(word=>wordEntryFor(word).tier===tier));
    assert.ok(view.words.every(isTargetAllowed));
  }
  assert.throws(()=>createFrequencyDictionary({wordLengths:[3],tiers:[null]}));
  assert.throws(()=>createFrequencyDictionary({wordLengths:[3],allowUnreviewed:true}));
  assert.equal(wordEntryFor('CAT').tier,1);assert.ok(!('zipf' in wordEntryFor('CAT')));
});

test('完整新词表只扩展有效额外词，不放行目标；额外词不扣次数或完成目标',()=>{
  const game=createAlgorithmSession(fixture,dictionary,{bonusDictionary:BONUS_DICTIONARY});
  const stats=calculateLevelStatistics(game.initial,BONUS_DICTIONARY);
  const word=stats.extraWords.find(word=>!isTargetAllowed(word));assert.ok(word,'fixture needs a non-target whitelist bonus word');
  const path=findWordPaths(game.initial.board.letters,word,null,null,game.initial.board)[0],before=game.snapshot();
  const result=game.submit(path);assert.equal(result.reason,'extra-word');assert.equal(result.word,word);assert.deepEqual(game.snapshot(),before);
  assert.equal(game.submit(path).isNew,false);assert.deepEqual(game.snapshot(),before);
  assert.equal(validateAlgorithmLevel({...fixture,targets:[...fixture.targets.slice(1),{id:'bad',word,canonicalPath:path}]},dictionary).valid,false);
});
