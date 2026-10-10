import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { GameSession, validateLevel, findWordPaths, inspectPath, normalizeDictionary, clone } from '../dist/core/rules.js';

const sample = JSON.parse(await readFile(new URL('../dist/sample.json', import.meta.url), 'utf8'));
const dictionary = JSON.parse(await readFile(new URL('../dist/dictionary.json', import.meta.url), 'utf8'));
function* permutations(items) {
  if (!items.length) { yield []; return; }
  for (let i = 0; i < items.length; i++) for (const rest of permutations(items.filter((_, j) => i !== j))) yield [items[i], ...rest];
}

test('固定样例独立重搜所有路径，完整检查 32 状态', () => {
  const report = validateLevel(sample, dictionary);
  assert.equal(report.valid, true, JSON.stringify(report.errors));
  assert.equal(report.stateChecks, 32);
  assert.deepEqual(report.demand, sample.board.counts);
  assert.equal(report.targets[0].pathCount, 2);
  assert.equal(report.targets[0].setCount, 1);
});

test('120 种顺序均通过实际游戏提交，逐次保持需求不变量，最终清空', () => {
  let checked = 0;
  for (const order of permutations(sample.targets)) {
    const game = new GameSession(sample, dictionary);
    for (const target of order) {
      const result = game.submit(target.path);
      assert.equal(result.accepted, true, `${order.map(t => t.word)}: ${target.word}`);
      assert.equal(game.audit(), true);
      for (const remaining of game.pending) assert.ok(findWordPaths(sample.board.letters, remaining.word, game.counts).length);
    }
    assert.equal(game.status, 'won');
    assert.deepEqual(game.counts, Array(9).fill(0));
    checked++;
  }
  assert.equal(checked, 120);
});

test('EYE 正反两条合法走法都接受', () => {
  const forward = new GameSession(sample, dictionary), backward = new GameSession(sample, dictionary);
  assert.equal(forward.submit([0, 3, 4]).accepted, true);
  assert.equal(backward.submit([4, 3, 0]).accepted, true);
  assert.deepEqual(forward.counts, backward.counts);
});

test('不同消耗集合被独立校验器拒绝，不能载入正式会话', () => {
  const invalid = clone(sample); invalid.board.letters[6] = 'F';
  const report = validateLevel(invalid, dictionary);
  assert.equal(report.valid, false);
  assert.ok(report.errors.some(e => e.code === 'AMBIGUOUS'));
  assert.ok(report.targets.find(t => t.word === 'FEE').setCount > 1);
  assert.throws(() => new GameSession(invalid, dictionary), /完整校验/);
});

test('FEED 可一次提交；路径中经过 FEE 不会提前扣减', () => {
  const game = new GameSession(sample, dictionary);
  assert.equal(game.submit([1, 4, 7, 8]).accepted, true);
  assert.deepEqual([...game.completed], ['FEED']);
  assert.equal(game.total, 14);
  assert.equal(game.submit([1, 4, 7]).accepted, true);
});

test('非目标、重复目标、非法路径均不扣减；验证后原子提交', () => {
  const game = new GameSession(sample, dictionary);
  for (const path of [[0, 1, 2], [0, 4, 8], [2, 3, 4], [0, 6, 7], [1, 4, 1], [1, 4, 7, 2], [-1, 0], []]) {
    const before = game.snapshot();
    assert.equal(game.submit(path).accepted, false);
    assert.deepEqual(game.snapshot(), before);
  }
  game.submit([1, 4, 7]);
  const before = game.snapshot();
  assert.equal(game.submit([1, 4, 7]).reason, 'already-completed');
  assert.deepEqual(game.snapshot(), before);
  game.submit([0, 3, 4]);
  const after = game.snapshot();
  assert.equal(game.submit([0, 3, 4]).accepted, false);
  assert.deepEqual(game.snapshot(), after);
});

test('总和 18 但逐格次数错误仍拒绝', () => {
  const invalid = clone(sample);
  [invalid.board.counts[0], invalid.board.counts[1]] = [invalid.board.counts[1], invalid.board.counts[0]];
  assert.equal(invalid.board.counts.reduce((a, b) => a + b), 18);
  const report = validateLevel(invalid, dictionary);
  assert.equal(report.valid, false);
  assert.ok(report.errors.some(e => e.code === 'COUNTS'));
});

test('重开不污染初始数据；剩余异常被明确识别', () => {
  const original = JSON.stringify(sample);
  const game = new GameSession(sample, dictionary); game.submit([0, 3, 4]);
  assert.equal(JSON.stringify(sample), original);
  assert.deepEqual(new GameSession(game.initial, dictionary).counts, sample.board.counts);
  assert.ok(Object.isFrozen(game.initial.board.counts));
  game.counts[1] = 0;
  assert.equal(game.audit(), false);
  assert.equal(game.status, 'anomaly');
  assert.ok(game.debug.unavailable.includes('FEE'));
});

test('空格不作为通配符，禁止斜线、行尾绕行和重复格', () => {
  const letters = ['E', null, null, 'Y', 'E', null, null, null, null];
  assert.equal(findWordPaths(letters, 'EYE').length, 2);
  assert.equal(findWordPaths(letters, 'FEED').length, 0);
  for (const path of [[0, 4], [2, 3], [0, 3, 0]]) assert.equal(inspectPath(sample.board.letters, path).valid, false);
});

test('词库标准化、白名单与损坏 JSON 结构防护', () => {
  assert.deepEqual(normalizeDictionary(['eye', 'EYE', 'FEE', ' ice ', 'A1B', 'A-B', 'TO', 2, 'TOOLONG']), ['EYE', 'FEE']);
  assert.ok(normalizeDictionary(dictionary).length >= 100);
  for (const invalid of [null, {}, [], { schemaVersion: 1, board: [] }, { ...sample, targets: null }]) assert.equal(validateLevel(invalid, dictionary).valid, false);
  const missing = clone(sample); missing.targets[0].word = 'XYZ';
  assert.ok(validateLevel(missing, dictionary).errors.some(e => e.code === 'DICTIONARY'));
});
