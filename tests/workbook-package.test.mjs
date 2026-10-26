import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,stat} from 'node:fs/promises';
import {createBankDictionary,bankBonusDictionary,WORD_BANK_ORIGIN} from '../dist/core/dictionary-banks.js';
import {WORD_ENTRIES,WORDLIST_HASH,WORDLIST_VERSION} from '../dist/core/word-source.js';

const bank=JSON.parse(await readFile(new URL('../dist/wt-word-bank.json',import.meta.url),'utf8'));

test('工作簿保留两表角色，主线只取必答词，额外识别包含两表并集',()=>{
  assert.equal(bank.version,WORDLIST_VERSION);
  assert.equal(bank.source.sha256,WORDLIST_HASH);
  assert.equal(bank.source.requiredCount,10748);
  assert.equal(bank.source.extraCount,11692);
  assert.equal(WORD_ENTRIES.length,22440);
  assert.equal(new Set(bank.required.map(entry=>entry.word)).size,10748);
  assert.equal(new Set(bank.extra.map(entry=>entry.word)).size,11692);
  assert.equal(bank.required.some(required=>bank.extra.some(extra=>extra.word===required.word)),false);
  assert.ok(WORD_ENTRIES.every(entry=>/^[A-Z]{3,8}$/.test(entry.word)&&entry.rangeTier>=1&&entry.rangeTier<=4&&entry.rarity>=1&&entry.rarity<=5));
  assert.ok(WORD_ENTRIES.every(entry=>entry.phonetic&&entry.category&&entry.definitionEn&&entry.definitionZh));
  assert.equal(bank.schemaVersion,2);
  assert.ok(WORD_ENTRIES.every(entry=>entry.emotion&&entry.partOfSpeech&&entry.rarityLabel===entry.rarity+'档'&&entry.rarityStatus));
  assert.ok(WORD_ENTRIES.every(entry=>['category','partOfSpeech','abbreviation','rarity'].every(key=>['高','中','低'].includes(entry.confidence[key]))));
  const apple=WORD_ENTRIES.find(entry=>entry.word==='APPLE'),aches=WORD_ENTRIES.find(entry=>entry.word==='ACHES');
  assert.equal(apple.category,'水果、树木');assert.equal(apple.partOfSpeech,'名词');assert.equal(apple.emotion,'中性情绪');
  assert.equal(apple.confidence.category,'高');assert.match(aches.proofreadingNote,/疾病/);
  const requiredWords=new Set(bank.required.map(entry=>entry.word)),extraWords=new Set(bank.extra.map(entry=>entry.word));
  const dictionary=createBankDictionary([3,4,5,6,7,8],WORD_BANK_ORIGIN),extra=bankBonusDictionary(dictionary);
  assert.equal(dictionary.words.length,10748);
  assert.equal(extra.words.length,22440);
  assert.equal(new Set(extra.words).size,22440);
  assert.ok(dictionary.words.every(word=>requiredWords.has(word)));
  assert.ok(extra.words.every(word=>requiredWords.has(word)||extraWords.has(word)));
});

test('发布目录保留工作簿与英文原包，不恢复其他词库或固定样例',async()=>{
  for(const name of ['dictionary.json','dictionary-v1.json','wordlist.json','original-word-policy.json','common-v2','lexicon','review','sample.json','seed_20261010.json','source-levels/portuguese.json','source-levels/russian.json','source-levels/spanish.json','source-levels/turkish.json'])
    await assert.rejects(stat(new URL('../dist/'+name,import.meta.url)),{code:'ENOENT'},name);
});
