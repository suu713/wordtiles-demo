import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';
import { generateLevel, DEFAULT_BUDGET } from '../dist/core/generator.js';
import { validateLevel, GameSession, RULES_VERSION } from '../dist/core/rules.js';

const dictionary = JSON.parse(await readFile(new URL('../dist/dictionary.json', import.meta.url), 'utf8'));
const count = Number(process.argv[2] || 100);
if (!Number.isInteger(count) || count < 100 || count > 10000) throw new Error('批量验收数量必须为 100～10000');
const records = [];
const start = performance.now();
for (let i = 0; i < count; i++) {
  const seed = `batch-${String(i).padStart(3, '0')}`;
  const at = performance.now();
  const result = generateLevel(dictionary, seed);
  const record = { seed, success: result.success, milliseconds: +(performance.now() - at).toFixed(2), reason: result.reason || null, stats: result.stats };
  if (result.success) {
    const report = validateLevel(result.level, dictionary);
    if (!report.valid || report.stateChecks !== 32) throw new Error(`${seed} 独立校验失败`);
    const game = new GameSession(result.level, dictionary);
    for (const target of result.level.targets) if (!game.submit(target.path).accepted) throw new Error(`${seed} 实际提交失败`);
    if (game.status !== 'won' || game.total !== 0) throw new Error(`${seed} 未清空`);
    record.level = result.level; record.validatedStates = report.stateChecks;
  }
  records.push(record);
  if ((i + 1) % 10 === 0) console.log(`${i + 1}/${count}: ${records.filter(r => r.success).length} successful`);
}
const successful = records.filter(r => r.success);
const failures = {};
for (const record of records.filter(r => !r.success)) failures[record.reason] = (failures[record.reason] || 0) + 1;
const sortedTimes = records.map(r => r.milliseconds).sort((a, b) => a - b);
const report = { algorithmVersion: RULES_VERSION, dictionaryVersion: dictionary.version, budget: DEFAULT_BUDGET,
  total: count, successful: successful.length, failed: count - successful.length,
  successRate: `${(successful.length / count * 100).toFixed(1)}%`, failureReasons: failures,
  elapsedMs: +(performance.now() - start).toFixed(2), medianMs: sortedTimes[Math.floor(count / 2)], maxMs: sortedTimes.at(-1),
  allSuccessfulFullyValidated: true, records };
await mkdir(new URL('../reports/', import.meta.url), { recursive: true });
await writeFile(new URL('../reports/batch-100.json', import.meta.url), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ ...report, records: undefined }, null, 2));
