import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createAlgorithmSession } from './support/historical-adapter.mjs';
import { SourceGameSession, convertSourceLevel } from '../dist/core/source-levels.js';
import { findWordPaths } from '../dist/core/rules.js';

const json=async path=>JSON.parse(await readFile(new URL(path,import.meta.url),'utf8'));
const dictionary=await json('../dist/dictionary-v1.json'), fixture=await json('../examples/seed_20261010.json');
const bank=await json('../dist/source-levels/english.json');

test('算法2字典内非目标词收进单词包，重复不新增、不扣次数也不完成目标', () => {
  const game=createAlgorithmSession(fixture,dictionary), before=game.snapshot();
  const path=findWordPaths(game.initial.board.letters,'NOT',game.counts,null,game.initial.board)[0];
  assert.ok(path); assert.equal(dictionary.words.includes('NOT'),true);
  assert.deepEqual(game.submit(path),{accepted:false,reason:'extra-word',word:'NOT',isNew:true});
  assert.deepEqual(game.snapshot(),before); assert.deepEqual([...game.bonusCompleted],['NOT']);
  assert.deepEqual(game.submit(path),{accepted:false,reason:'extra-word',word:'NOT',isNew:false});
  assert.equal(game.bonusCompleted.size,1); assert.deepEqual(game.snapshot(),before);
  for (const target of fixture.targets) assert.equal(game.submit(target.canonicalPath).accepted,true);
  assert.equal(game.status,'won'); assert.deepEqual(game.counts,Array(9).fill(0));
});

test('未知词、重复格或斜线路径不会收进单词包，重开从空包开始', () => {
  const game=createAlgorithmSession(fixture,dictionary), before=game.snapshot();
  assert.equal(dictionary.words.includes('CLT'),false);
  assert.equal(game.submit([0,1,2]).reason,'not-target');
  assert.equal(game.submit([0,4,8]).reason,'invalid-path');
  assert.equal(game.submit([1,4,1]).reason,'invalid-path');
  assert.equal(game.bonusCompleted.size,0); assert.deepEqual(game.snapshot(),before);
  game.submit(findWordPaths(game.initial.board.letters,'ONE',null,null,game.initial.board)[0]);
  assert.equal(game.bonusCompleted.has('ONE'),true);
  const restarted=createAlgorithmSession(game.exportInitial,game.dictionary);
  assert.equal(restarted.bonusCompleted.size,0); assert.deepEqual(restarted.snapshot(),before);
});

test('算法1额外词沿用本关原列表；两种算法的单词包互不共用', () => {
  const source=new SourceGameSession(convertSourceLevel(bank.levels[bank.orders.main[1]]));
  const before=source.snapshot(), path=findWordPaths(source.initial.board.letters,'FRO',null,null,source.initial.board)[0];
  assert.equal(source.submit(path).reason,'extra-word');
  assert.equal(source.bonusCompleted.has('FRO'),true); assert.deepEqual(source.snapshot(),before);
  const generated=createAlgorithmSession(fixture,dictionary);
  assert.equal(generated.bonusCompleted.size,0);
  assert.equal(new SourceGameSession(source.initial).bonusCompleted.size,0);
});
