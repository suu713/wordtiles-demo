import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
// Preserve old mother-library scoring tests, isolated from the production V2 adapter.
import { createLexiconAdapter } from './support/historical-lexicon-adapter.mjs';
import { generateLevel } from '../dist/core/wordtiles-algorithm.js';
import { validateAlgorithmLevel } from './support/historical-adapter.mjs';

const json = async path => JSON.parse(await readFile(new URL(path, import.meta.url), 'utf8'));
const index = await json('../dist/lexicon/dictionary.index.json');
const overlay = await json('../dist/lexicon/review-overlay.json');
const adapter = await createLexiconAdapter(index, overlay);
const policy = { wordLengths: [3, 3, 3, 4, 5], tiers: [1, 2, 3] };

test('完整母词库未裁词长，索引逐条匹配原字段，原始来源与许可哈希可核对', async () => {
  const bytes = gunzipSync(await readFile(new URL('../dist/lexicon/dictionary.master.json.gz', import.meta.url)));
  assert.equal(createHash('sha256').update(bytes).digest('hex'), index.masterSha256);
  const master = JSON.parse(bytes), summary = await json('../dist/lexicon/summary.json');
  assert.equal(master.entries.length, 143581); assert.equal(index.totalEntries, master.entries.length);
  assert.deepEqual(master.metadata, index.metadata);
  assert.equal(master.entries.reduce((maximum, entry) => Math.max(maximum, entry.length), 0), 45);
  assert.equal(master.entries.filter(entry => entry.length > 5).length, 128028);
  for (const source of master.metadata.sources.filter(source => source.copyrightFile)) {
    const raw = await readFile(new URL('../dist/lexicon/sources/source_wordlist.txt', import.meta.url));
    assert.equal(createHash('sha256').update(raw).digest('hex'), source.sha256);
  }
  const tierCounts = {}, lengthCounts = {};
  for (const entry of master.entries) {
    assert.ok(index.byLengthAndTier[entry.length][entry.frequencyTier ?? 'unrated'].includes(entry.word));
    assert.ok(entry.originalForms.length); assert.equal(entry.familiarity, null);
    assert.equal(entry.reviewStatus, 'pending'); assert.equal(entry.targetEnabled, false);
    const expected = entry.zipf === null ? null : entry.zipf >= 5 ? 1 : entry.zipf >= 4 ? 2 : entry.zipf >= 3 ? 3 : entry.zipf >= 2 ? 4 : 5;
    assert.equal(entry.frequencyTier, expected);
    tierCounts[entry.frequencyTier ?? 'unrated'] = (tierCounts[entry.frequencyTier ?? 'unrated'] || 0) + 1;
    lengthCounts[entry.length] = (lengthCounts[entry.length] || 0) + 1;
  }
  assert.deepEqual(lengthCounts, summary.lengths);
  summary.tiers.forEach(tier => assert.equal(tierCounts[tier.tier ?? 'unrated'], tier.count));
  for (const name of ['ESDB_Copyright.txt', 'wordfreq_NOTICE.md', 'wordfreq_LICENSE.txt'])
    assert.equal(await readFile(new URL('../dist/lexicon/sources/' + name, import.meta.url), 'utf8'), master.metadata.embeddedNotices[name]);
});

test('审核默认关闭且不自动批准高频词；空正式候选明确失败，不回退旧词库', () => {
  assert.equal(adapter.approvedCount, 0);
  const dictionary = adapter.createRuntimeDictionary(policy);
  assert.deepEqual(dictionary.words, []); assert.equal(dictionary.metadata.runtimeSelection.allowUnreviewed, false);
  const result = generateLevel({}, dictionary, 0);
  assert.equal(result.ok, false); assert.equal(result.code, 'DICTIONARY_INSUFFICIENT');
  assert.equal('level' in result, false);
});

test('内部测试显式开启，按所选长度和频率筛选；未评级不会偷偷并到第5档', () => {
  const dictionary = adapter.createRuntimeDictionary({ ...policy, allowUnreviewed: true });
  assert.ok(dictionary.words.length > 1602); assert.equal(dictionary.metadata.reviewWarning, '词库未完成内容审核');
  assert.ok(dictionary.words.every(word => [3, 4, 5].includes(word.length) && [1, 2, 3].includes(adapter.frequencyTierForWord(word))));
  const rare = adapter.createRuntimeDictionary({ ...policy, tiers: [5], allowUnreviewed: true });
  assert.ok(rare.words.every(word => adapter.frequencyTierForWord(word) === 5));
  const unrated = adapter.createRuntimeDictionary({ ...policy, tiers: [null], allowUnreviewed: true });
  assert.ok(unrated.words.every(word => adapter.frequencyTierForWord(word) === null));
  assert.ok(unrated.words.length > 0); assert.ok(rare.words.every(word => !unrated.words.includes(word)));
  const long = adapter.createRuntimeDictionary({ wordLengths: [45], tiers: [null], allowUnreviewed: true });
  assert.equal(long.words.length, 1); assert.equal(long.words[0].length, 45);
});

test('人工 approved/blocked 覆盖保留频率，blocked 在内部测试也不能出题；内容变更更新运行时版本', async () => {
  // These are isolated unit-test overlays, never written to the real review file.
  const testOverlay = { version: 'unit-test-only', entries: [{ word: 'CAT', status: 'approved', reason: 'unit fixture' }, { word: 'DOG', status: 'blocked', reason: 'unit fixture' }] };
  const reviewed = await createLexiconAdapter(index, testOverlay);
  assert.deepEqual(reviewed.createRuntimeDictionary(policy).words, ['CAT']);
  assert.equal(reviewed.frequencyTierForWord('CAT'), adapter.frequencyTierForWord('CAT'));
  assert.equal(reviewed.createRuntimeDictionary({ ...policy, allowUnreviewed: true }).words.includes('DOG'), false);
  const changed = await createLexiconAdapter(index, { ...testOverlay, entries: [{ ...testOverlay.entries[0], reason: 'changed unit fixture' }, testOverlay.entries[1]] });
  assert.notEqual(reviewed.createRuntimeDictionary(policy).version, changed.createRuntimeDictionary(policy).version);
  assert.notEqual(adapter.createRuntimeDictionary(policy).version, adapter.createRuntimeDictionary({ ...policy, allowUnreviewed: true }).version);
});

test('缺失或破损审核覆盖表、异常档位被拒绝，不替换输入；词库版本不匹配不能导入', async () => {
  for (const value of [null, {}, { version: 'x', entries: [{ word: 'CAT', status: 'approved' }] }, { version: 'x', entries: [{ word: 'NOT_A_WORD', status: 'approved', reason: 'x' }] }])
    await assert.rejects(createLexiconAdapter(index, value));
  assert.throws(() => adapter.createRuntimeDictionary({ ...policy, tiers: [6] }));
  assert.throws(() => adapter.createRuntimeDictionary({ ...policy, allowUnreviewed: 'true' }));
  const fixture = await json('../examples/seed_20261010.json');
  const report = validateAlgorithmLevel(fixture, adapter.createRuntimeDictionary({ ...policy, allowUnreviewed: true }));
  assert.equal(report.valid, false); assert.equal(report.errors[0].code, 'DICTIONARY_VERSION');
});
