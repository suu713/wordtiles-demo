import test from 'node:test';
import assert from 'node:assert/strict';
import {createBankDictionary,bankBonusDictionary,bankDictionaryError,bankWordEntry,bankLengthRange,recommendedLengths} from '../dist/core/dictionary-banks.js';
import {WORD_ENTRIES,ORIGINAL_ENGLISH_TARGETS} from '../dist/core/word-source.js';
import {createZenDictionary} from '../dist/core/zen-dictionary.js';
import {generateLevel} from '../dist/core/algorithm2.js';
import {createAlgorithmSession,validateAlgorithmLevel} from '../dist/core/algorithm-v1-adapter.js';
import {analysisSheets} from '../dist/core/playtest-export.js';
import {collectionTheme} from '../dist/core/collection-themes.js';
import {createWordCollection} from '../dist/core/word-collection.js';

const lengths=[3,4,5,6,7,8],budget={maxNodesPerAttempt:10000,maxAttempts:30,maxTotalNodes:300000};
const requiredSet=new Set(ORIGINAL_ENGLISH_TARGETS);

test('WT 工作簿是唯一词库，保留必答词、额外词和原始标注',()=>{
  const dictionary=createBankDictionary(lengths),bonus=bankBonusDictionary(dictionary),required=new Set(ORIGINAL_ENGLISH_TARGETS);
  assert.equal(dictionary.metadata.origin,'wt-workbook');assert.equal(required.size,10748);assert.equal(WORD_ENTRIES.filter(entry=>entry.role==='extra').length,11692);
  assert.equal(dictionary.words.length,10748);assert.equal(bonus.words.length,22440);assert.equal(new Set(bonus.words).size,22440);
  assert.deepEqual(bankLengthRange(),lengths);assert.ok(dictionary.words.every(word=>/^[A-Z]{3,8}$/.test(word)&&required.has(word)));
  assert.ok(WORD_ENTRIES.every(entry=>entry.rangeTier>=1&&entry.rangeTier<=4&&entry.rarity>=1&&entry.rarity<=5&&entry.category&&entry.phonetic&&entry.definitionEn&&entry.definitionZh));
  assert.equal(bankWordEntry('apple').category,'水果、树木');assert.equal(bankDictionaryError(dictionary),null);
  assert.ok(bankDictionaryError({...dictionary,words:[...dictionary.words,'ZZZFAKE']}));
  assert.throws(()=>createBankDictionary(lengths,'web-supplied'),/只使用 WT词库/);
  assert.throws(()=>createBankDictionary([2]),/仅有3～8/);
  assert.throws(()=>createBankDictionary(lengths,'wt-package'),/只使用 WT词库/);assert.throws(()=>createZenDictionary(lengths),/未包含/);
});

test('生成器只用必答词，额外词独立接受，完整校验后可通关',()=>{
  const dictionary=createBankDictionary(lengths),config={rows:2,cols:4,wordLengths:[8]};
  const result=generateLevel(budget,dictionary,0,{levelConfig:config});assert.equal(result.ok,true,result.message);
  assert.equal(result.level.source.dictionaryOrigin,'wt-workbook');assert.equal(validateAlgorithmLevel(result.level,dictionary).valid,true);
  assert.ok(result.level.targets.every(target=>requiredSet.has(target.word)));
  const session=createAlgorithmSession(result.level,dictionary);
  for(const target of [...session.initial.targets].reverse())assert.equal(session.submit(target.path).accepted,true);
  assert.equal(session.status,'won');
});

test('棋盘尺寸只推荐工作簿实际支持的词长，Excel 只列本批出现的词长',()=>{
  for(const rows of [2,3,4,5,6])for(const cols of [2,3,4,5,6]){const planned=recommendedLengths(rows,cols);assert.ok(planned.every(n=>lengths.includes(n)&&n<=rows*cols));assert.ok(planned.reduce((a,b)=>a+b,0)>=rows*cols);}
  const sheet=analysisSheets({levels:[{targetCount:1,wordLengths:{8:1},extraWordLengths:{},wordLengthShares:{8:1}}],runs:[],job:{game:'web'}})[1],header=sheet.rows[0],row=sheet.rows[1];
  assert.ok(header.includes('8字目标词数'));assert.ok(header.includes('8字目标占比'));assert.equal(row[header.indexOf('8字目标占比')],1);
  for(const n of [2,9,10])assert.ok(!header.includes(n+'字目标词数'));
});

test('Excel 语义分类进入收藏主题，旧来源记录只保留新词库中仍有的词',()=>{
  assert.equal(collectionTheme('APPLE',bankWordEntry('APPLE')),'food');
  const word=createBankDictionary(lengths).words[0],saved=new Map();
  saved.set('wordtiles.collection.v1',JSON.stringify({version:2,entries:[
    {word,language:'english',origin:'web-supplied',firstFoundAt:'2025-02-02T00:00:00.000Z'},
    {word,language:'english',origin:'wt-package',firstFoundAt:'2025-02-01T00:00:00.000Z'},
    {word:'ZZZNOTINBANK',language:'english',origin:'web-supplied',firstFoundAt:'2025-02-03T00:00:00.000Z'}
  ]}));
  const local={getItem:key=>saved.get(key)||null,setItem:(key,value)=>saved.set(key,value)},collection=createWordCollection(local);
  assert.equal(collection.entries().length,1);assert.equal(collection.entries()[0].origin,'wt-workbook');assert.equal(collection.entries()[0].firstFoundAt,'2025-02-01T00:00:00.000Z');
  assert.equal(collection.collect({accepted:true,word},'english','wt-workbook'),false);
});

test('仅额外词不能成为目标词，未入选的必答词仍可获得额外词奖励',()=>{
  const dictionary=createBankDictionary(lengths),bonus=bankBonusDictionary(dictionary);
  const required=new Set(dictionary.words),recognized=new Set(bonus.words),extraOnly=WORD_ENTRIES.filter(entry=>entry.role==='extra');
  assert.ok(dictionary.words.every(word=>recognized.has(word)));
  assert.ok(extraOnly.every(entry=>!required.has(entry.word)&&recognized.has(entry.word)));
  const report=validateAlgorithmLevel({targets:[{word:extraOnly[0].word}]},dictionary);
  assert.equal(report.valid,false);assert.equal(report.errors[0].code,'BANK_TARGET_POLICY');
});
