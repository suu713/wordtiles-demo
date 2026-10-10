import { readFile, writeFile } from 'node:fs/promises';
import { findWordPaths, signature } from '../dist/core/rules.js';
const root = new URL('../dist/source-levels/', import.meta.url);
const catalogue = JSON.parse(await readFile(new URL('catalogue.json', root), 'utf8'));
const reports = [];
for (const language of catalogue.languages) {
  const bank = JSON.parse(await readFile(new URL(language.file, root), 'utf8'));
  const summary = { language: language.language, count: 0, noPath: [], ambiguous: [], uncovered: [], maxUses: 0, maxTargets: 0, duplicateTargets: [] };
  for (const raw of Object.values(bank.levels)) {
    summary.count++;
    const letters = raw.letters.split(',').flatMap(row => [...row]);
    const shape = { rows: raw.height, cols: raw.width };
    const demand = Array(letters.length).fill(0);
    let missing = false, ambiguous = false;
    if (new Set(raw.target_words.map(t => t.word)).size !== raw.target_words.length) summary.duplicateTargets.push(raw.id);
    for (const target of raw.target_words) {
      const paths = findWordPaths(letters, target.word, null, null, shape);
      if (!paths.length) { missing = true; continue; }
      const sets = new Set(paths.map(signature));
      if (sets.size > 1) ambiguous = true;
      paths[0].forEach(i => demand[i]++);
    }
    if (missing) summary.noPath.push(raw.id);
    if (ambiguous) summary.ambiguous.push(raw.id);
    if (demand.some(n => n === 0)) summary.uncovered.push(raw.id);
    summary.maxUses = Math.max(summary.maxUses, ...demand);
    summary.maxTargets = Math.max(summary.maxTargets, raw.target_words.length);
  }
  reports.push(summary);
  console.log(JSON.stringify({ ...summary, noPath: summary.noPath.length, ambiguous: summary.ambiguous.length, uncovered: summary.uncovered.length }));
}
await writeFile(new URL('../reports/source-audit.json', import.meta.url), JSON.stringify({ total: catalogue.total, languages: reports }, null, 2) + '\n');
