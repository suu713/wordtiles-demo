import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { generateLevel, DEFAULT_BUDGET } from '../dist/core/generator.js';
import { validateLevel, GameSession } from '../dist/core/rules.js';
const dictionary = JSON.parse(await readFile(new URL('../tests/fixtures/retired-runtime-data/dictionary.json', import.meta.url), 'utf8'));

test('真实生成、固定种子复现、独立完整校验和实际提交', () => {
  const first = generateLevel(dictionary, 'acceptance-0');
  assert.equal(first.success, true, JSON.stringify(first.stats));
  const second = generateLevel(dictionary, 'acceptance-0');
  assert.deepEqual(first, second);
  assert.equal(validateLevel(first.level, dictionary).valid, true);
  const game = new GameSession(first.level, dictionary);
  for (const target of [...first.level.targets].reverse()) assert.equal(game.submit(target.path).accepted, true);
  assert.equal(game.status, 'won');
  assert.ok(first.stats.nodes <= DEFAULT_BUDGET.maxTotalNodes);
});

test('路径递归展开计入预算，小预算明确失败且没有样例替换', () => {
  const result = generateLevel(dictionary, 'forced-failure', { budget: { maxNodesPerAttempt: 10, maxAttempts: 2, maxTotalNodes: 15 } });
  assert.equal(result.success, false);
  assert.equal(result.reason, 'budget-exhausted');
  assert.equal(result.level, undefined);
  assert.equal(result.stats.nodes, 15);
  assert.ok(result.stats.attemptReports.every(a => a.nodes <= 10));
});

test('取消和词库不足能结束，不降级规则', () => {
  const cancelled = generateLevel(dictionary, 'cancelled', { isCancelled: () => true });
  assert.equal(cancelled.reason, 'cancelled');
  assert.equal(cancelled.level, undefined);
  const insufficient = generateLevel(['CAT', 'DOG', 'EYE'], 'small');
  assert.equal(insufficient.reason, 'dictionary-insufficient');
  assert.equal(insufficient.stats.nodes, 0);
  assert.throws(() => generateLevel(dictionary, 'invalid', { budget: { maxAttempts: -1 } }), /无效搜索预算/);
});
