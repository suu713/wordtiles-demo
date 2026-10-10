import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir, copyFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';

const root = new URL('../', import.meta.url);
const input = new URL('wordtiles_lexicon_builder/lexicon-output/', root);
const output = new URL('dist/lexicon/', root);
const sha256 = value => createHash('sha256').update(value).digest('hex');
const masterBytes = await readFile(new URL('dictionary.master.json', input));
const master = JSON.parse(masterBytes), summary = JSON.parse(await readFile(new URL('summary.json', input), 'utf8'));
assert.equal(master.metadata.sources.find(source => source.name === 'wordfreq').packageVersion, '3.1.1');
assert.equal(master.metadata.lengthRestricted, false);
assert.ok(master.entries.length > 0);
assert.equal(master.entries.length, summary.uniqueASCIIBoardSpellings);
const byLengthAndTier = {}, seen = new Set();
for (const entry of master.entries) {
  assert.match(entry.word, /^[A-Z]+$/); assert.equal(entry.length, entry.word.length);
  assert.equal(seen.has(entry.word), false); seen.add(entry.word);
  assert.equal(entry.reviewStatus, 'pending'); assert.equal(entry.targetEnabled, false);
  assert.ok(entry.frequencyTier === null || [1, 2, 3, 4, 5].includes(entry.frequencyTier));
  const key = entry.frequencyTier === null ? 'unrated' : String(entry.frequencyTier);
  (byLengthAndTier[entry.length] ||= {});
  (byLengthAndTier[entry.length][key] ||= []).push(entry.word);
}
const index = {
  schemaVersion: 1, metadata: master.metadata, masterFile: 'dictionary.master.json.gz',
  masterSha256: sha256(masterBytes), totalEntries: master.entries.length,
  reviewDefaults: { reviewStatus: 'pending', targetEnabled: false }, byLengthAndTier,
};
await mkdir(new URL('sources/', output), { recursive: true });
const files = [];
async function save(name, bytes) {
  await writeFile(new URL(name, output), bytes);
  files.push({ name, bytes: bytes.length, sha256: sha256(bytes) });
}
await save('dictionary.master.json.gz', gzipSync(masterBytes, { level: 9 }));
await save('dictionary.index.json', Buffer.from(JSON.stringify(index) + '\n'));
await save('summary.json', Buffer.from(JSON.stringify(summary, null, 2) + '\n'));
await save('excluded.entries.json.gz', gzipSync(await readFile(new URL('excluded.entries.json', input)), { level: 9 }));
for (const name of ['source_wordlist.txt', 'ESDB_Copyright.txt', 'wordfreq_NOTICE.md', 'wordfreq_LICENSE.txt']) {
  const bytes = await readFile(new URL('sources/' + name, input));
  await save('sources/' + name, bytes);
}
await copyFile(new URL('wordtiles_lexicon_builder/review-overlay.json', root), new URL('review-overlay.json', output));
const overlay = JSON.parse(await readFile(new URL('review-overlay.json', output), 'utf8'));
const report = {
  ...summary, productionApprovedCount: overlay.entries.filter(entry => entry.status === 'approved').length,
  masterBytes: masterBytes.length, masterSha256: index.masterSha256,
  samplesByTier: [1, 2, 3, 4, 5, null].map(tier => ({ tier, entries: master.entries.filter(entry => entry.frequencyTier === tier).slice(0, 8) })),
  measuredBoundarySamples: [5, 4, 3, 2, null].map(zipf => ({ zipf, entries: master.entries.filter(entry => entry.zipf === zipf).slice(0, 5) })),
  files,
};
await save('manifest.json', Buffer.from(JSON.stringify({ version: summary.version, masterSha256: index.masterSha256, files }, null, 2) + '\n'));
await writeFile(new URL('reports/lexicon-build.json', root), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ version: report.version, entries: report.uniqueASCIIBoardSpellings, longerThan5: report.longerThan5Letters, masterBytes: report.masterBytes, files: report.files }, null, 2));
