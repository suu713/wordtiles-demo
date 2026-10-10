import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { calculateLevelStatistics } from '../dist/core/level-statistics.js';
import { createAlgorithmSession } from './support/historical-adapter.mjs';
import { convertSourceLevel, SourceGameSession, validateSourceLevel } from '../dist/core/source-levels.js';
import { findWordPaths } from '../dist/core/rules.js';

const json = async path => JSON.parse(await readFile(new URL(path, import.meta.url), 'utf8'));
const dictionary = await json('../dist/dictionary-v1.json');
const fixture = await json('../examples/seed_20261010.json');
const bank = await json('../dist/source-levels/english.json');

test('倒序只比较画面中起点和终点，拐数和目标格子使用数保持原口径', () => {
  const game = createAlgorithmSession(fixture, dictionary);
  const stats = calculateLevelStatistics(game.initial, dictionary);
  assert.deepEqual(stats.reverseWords, ['EAT', 'LOT', 'OAT', 'NEAT']);
  assert.equal(stats.reverseWordCount, 4); assert.equal(stats.reversePercentage, 80);
  assert.deepEqual([stats.straightWordCount, stats.oneTurnWordCount, stats.multiTurnWordCount], [1, 3, 1]);
  assert.deepEqual(stats.targetPaths.map(target => target.turns), [0, 1, 1, 1, 3]);
  assert.deepEqual(stats.usageHistogram, { 1: 3, 2: 3, 3: 3 });
  assert.deepEqual(stats.tileUses, fixture.initialCounts);
  // An independent word-by-word DFS checks the trie search, using the unchanged full dictionary.
  const targets = new Set(fixture.targets.map(target => target.word));
  const extras = dictionary.words.filter(word => !targets.has(word) && findWordPaths(fixture.letters, word).length).sort();
  assert.deepEqual(stats.extraWords, extras);
});

test('用户截图的原包第3关BAG/BET/BUN/AUNT全程向右或向下，不计倒序', () => {
  const level = convertSourceLevel(bank.levels[bank.orders.main[2]]);
  const stats = calculateLevelStatistics(level, null);
  assert.deepEqual(new Set(level.targets.map(target => target.word)), new Set(['BAG', 'BET', 'BUN', 'AUNT']));
  assert.deepEqual(stats.reverseWords, []);
  assert.equal(stats.reverseWordCount, 0);
  const reflected = structuredClone(level);
  reflected.algorithm = 2;
  reflected.targets = level.targets.map(target => ({ ...target, path:target.path.map(cell => (level.board.rows - 1 - Math.floor(cell / level.board.cols)) * level.board.cols + cell % level.board.cols) }));
  reflected.board.letters = Array(level.board.letters.length);
  level.board.letters.forEach((letter,cell) => { reflected.board.letters[(level.board.rows - 1 - Math.floor(cell / level.board.cols)) * level.board.cols + cell % level.board.cols] = letter; });
  assert.deepEqual(calculateLevelStatistics(reflected, { version:'direction-test', words:level.targets.map(target=>target.word) }).reverseWords, []);
});

test('同词多路径只计一次，目标不计额外词，禁止对角连接和重复格子', () => {
  const level = { board: { rows: 2, cols: 2, letters: ['A', 'B', 'B', 'A'], counts: [1, 1, 1, 1] }, targets: [{ word: 'ABAB', path: [0, 1, 3, 2] }] };
  const stats = calculateLevelStatistics(level, { version: 'paths-test', words: ['ABA', 'ABA', 'BAB', 'ABAB', 'ABABA', 'AAA', 'AAB'] });
  assert.deepEqual(stats.extraWords, ['ABA', 'BAB']);
  assert.equal(stats.extraWordCount, 2); assert.equal(stats.reversePercentage, 0);
  assert.equal(stats.multiTurnWordCount, 1);
});

test('原包额外词按随关列表计数，不依赖英语测试词库；反射行不改变拐数', () => {
  const first = convertSourceLevel(bank.levels[bank.orders.main[0]]);
  const stats = calculateLevelStatistics(first, null);
  assert.equal(stats.extraWordCount, 0); assert.equal(stats.reverseWordCount, 0);
  assert.deepEqual([stats.straightWordCount, stats.oneTurnWordCount, stats.multiTurnWordCount], [1, 2, 0]);
  assert.deepEqual(stats.usageHistogram, { 1: 9 });
  const second = convertSourceLevel(bank.levels[bank.orders.main[1]]);
  assert.deepEqual(calculateLevelStatistics(second, null).extraWords, ['FRO', 'ROAN']);
  const mirrored = structuredClone(first);
  mirrored.targets.forEach(target => { target.path = target.path.map(cell => (first.board.rows - 1 - Math.floor(cell / first.board.cols)) * first.board.cols + cell % first.board.cols); });
  assert.deepEqual(calculateLevelStatistics(mirrored, null).targetPaths.map(target => target.turns), stats.targetPaths.map(target => target.turns));
});

test('目标消除或额外词提交不改变初始统计，不把剩余次数作为重复使用数', () => {
  const game = createAlgorithmSession(fixture, dictionary), before = calculateLevelStatistics(game.initial, dictionary);
  game.submit(fixture.targets[0].canonicalPath);
  assert.deepEqual(calculateLevelStatistics(game.initial, dictionary), before);
  for (const target of fixture.targets.slice(1)) game.submit(target.canonicalPath);
  assert.equal(game.status, 'won');
  assert.deepEqual(calculateLevelStatistics(game.initial, dictionary), before);
  const source = new SourceGameSession(convertSourceLevel(bank.levels[bank.orders.main[1]]));
  const original = calculateLevelStatistics(source.initial, null);
  source.submit(findWordPaths(source.initial.board.letters, 'FRO', null, null, source.initial.board)[0]);
  assert.deepEqual(calculateLevelStatistics(source.initial, null), original);
});

test('损坏的额外词列表导入前拒绝，不能载入后破坏统计刷新', () => {
  const level = convertSourceLevel(bank.levels[bank.orders.main[1]]);
  for (const extras of [{ word: 'FRO' }, [null], [{ word: 12 }]]) {
    const wrong = structuredClone(level); wrong.source.original.extra_words = extras;
    assert.equal(validateSourceLevel(wrong).valid, false);
    assert.throws(() => new SourceGameSession(wrong));
  }
});
