import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';
import { createFrequencyDictionary, wordEntryFor, WORDLIST_VERSION } from '../dist/core/word-library.js';
import { generateLevel, GENERATOR_VERSION } from '../dist/core/algorithm2.js';
import { isTargetAllowed } from '../dist/core/target-policy.js';
import { createAlgorithmSession } from '../dist/core/algorithm-v1-adapter.js';
import { GameSession } from '../dist/core/rules.js';
import { checkV1Independently, permutations } from './independent-v1-check.mjs';

const selection = { wordLengths: [3, 3, 3, 4, 5], tiers: [1, 2, 3] };
const dictionary = createFrequencyDictionary(selection);
const config = { maxNodesPerAttempt: 10000, maxAttempts: 30, maxTotalNodes: 300000 };
const size = Number(process.argv[2] || 100);
assert.ok(Number.isInteger(size) && size >= 100 && size <= 1000);
const results = [], combinations = new Set(), targetTierCounts = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, unrated: 0 };
let statesChecked = 0, ordersReplayed = 0;
const started = performance.now();
for (let seed = 0; seed < size; seed++) {
  const result = generateLevel(config, dictionary, seed);
  if (!result.ok) { results.push({ seed, ok: false, code: result.code, message: result.message, stats: result.stats }); continue; }
  assert.deepEqual(generateLevel(config, dictionary, seed), result);
  assert.ok(result.level.targets.every(target=>isTargetAllowed(target.word)));
  statesChecked += checkV1Independently(result.level, dictionary).statesChecked;
  const initial = createAlgorithmSession(result.level, dictionary);
  for (const order of permutations(initial.initial.targets)) {
    const game = new GameSession(initial.initial, dictionary, { validator: () => initial.report });
    for (const target of order) assert.equal(game.submit(target.path).accepted, true);
    assert.equal(game.status, 'won'); assert.deepEqual(game.counts, Array(9).fill(0)); ordersReplayed++;
  }
  result.level.targets.forEach(target => { targetTierCounts[wordEntryFor(target.word).tier]++; });
  combinations.add(result.level.targets.map(target => target.word).sort().join(','));
  results.push({ seed, ok: true, words: result.level.targets.map(target => target.word), dictionaryVersion:result.level.dictionaryVersion, stats: result.stats });
  if ((seed + 1) % 20 === 0) console.log(`${seed + 1}/${size}: new lexicon generated, independent states checked, all orders replayed.`);
}
const succeeded = results.filter(result => result.ok).length, targetCount = succeeded * 5;
const report = {
  generatorVersion: GENERATOR_VERSION, dictionaryVersion: dictionary.version, dictionaryWords: dictionary.words.length,
  wordlistVersion: WORDLIST_VERSION,
  contentPolicyVersion: dictionary.metadata.contentPolicyVersion, outsideWhitelistTargets:0,
  selection, config, seedRange: [0, size - 1], succeeded, failed: size - succeeded,
  successRate: succeeded / size, distinctTargetSets: combinations.size,
  targetTierDistribution: Object.entries(targetTierCounts).map(([tier, count]) => ({ tier: tier === 'unrated' ? null : Number(tier), count, proportion: targetCount ? count / targetCount : 0 })),
  independentStatesChecked: statesChecked, actualOrdersReplayed: ordersReplayed, elapsedMs: Math.round(performance.now() - started), results,
};
await writeFile(new URL(`../reports/tsv-graded-batch-${size}.json`, import.meta.url), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ ...report, results: undefined }, null, 2));
// Search exhaustion is reported truthfully. Validation errors throw immediately.
if (!succeeded) process.exitCode = 1;
