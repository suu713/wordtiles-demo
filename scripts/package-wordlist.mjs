import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {reviewWordlist} from './lib/review-wordlist.mjs';
import {writeWordPolicyReport} from './write-word-policy-report.mjs';
const root=new URL('../',import.meta.url),source=new URL('data/words.tsv',root);
const bytes=await readFile(process.argv[2]?resolve(process.argv[2]):source);
const [whitelist,policy,originalPackage,catalogue,apkReport]=await Promise.all(['data/common-v2/dictionary.json','data/game-review/policy.json','data/game-review/original-package.json','dist/source-levels/catalogue.json','reports/apk-word-policy.json'].map(async path=>JSON.parse(await readFile(new URL(path,root),'utf8'))));
const {library,records}=reviewWordlist(bytes,whitelist,policy,originalPackage),entries=library.entries;
// Original banks and their order lists are never filtered or rewritten.
await writeFile(source,bytes);
await writeFile(new URL('dist/wordlist.json',root),JSON.stringify(library)+'\n');
const {englishDefinitions,...wordManifest}=originalPackage;
await writeFile(new URL('dist/original-word-policy.json',root),JSON.stringify(wordManifest)+'\n');
await mkdir(new URL('reports/',root),{recursive:true});
const columns=['word','tier','originalPackageWord','decision','reason','definition','displayDefinition','definitionMethod'];
const tsv=columns.join('\t')+'\n'+records.map(r=>columns.map(key=>r[key]).join('\t')).join('\n')+'\n';
await writeFile(new URL('reports/game-word-review.tsv',root),tsv);
const reasonCounts={};for(const r of records)if(r.decision==='reject')reasonCounts[r.reason]=(reasonCounts[r.reason]||0)+1;
const audit={source:library.source,version:library.version,review:library.review,rejectedSourceCount:records.filter(r=>r.decision==='reject').length,reasonCounts,
 definitionCorrections:records.filter(r=>r.definitionMethod==='project-correction').map(r=>({word:r.word,before:r.definition,after:r.displayDefinition})),
 pendingDefinitionReview:records.filter(r=>r.definitionMethod==='definition-hidden-pending-review'),
 originalWordsWithoutTSV:entries.filter(e=>e.tier===null).map(e=>e.word),
 sourceLevels:{originalCount:catalogue.total,enabledCount:catalogue.total,languages:catalogue.languages.map(info=>info.language)},
 bra:{sourceLine:bytes.toString('utf8').split(/\r?\n/).findIndex(line=>line.startsWith('BRA\t'))+1,raw:records.find(r=>r.word==='BRA'),...apkReport.words.BRA}};
await writeFile(new URL('reports/game-word-review.json',root),JSON.stringify(audit,null,2)+'\n');
await mkdir(new URL('dist/review/',root),{recursive:true});
await Promise.all([writeFile(new URL('dist/review/words.tsv',root),bytes),writeFile(new URL('dist/review/policy.json',root),JSON.stringify(policy,null,2)+'\n'),writeFile(new URL('dist/review/game-word-review.json',root),JSON.stringify(audit,null,2)+'\n'),writeFile(new URL('dist/review/game-word-review.tsv',root),tsv),writeFile(new URL('dist/review/apk-word-policy.json',root),JSON.stringify(apkReport,null,2)+'\n')]);
await writeWordPolicyReport({root,audit,apkReport,policy});
const {createBaseDictionary}=await import('../dist/core/target-policy.js');
const {generateLevel}=await import('../dist/core/algorithm2.js');
const dictionary=createBaseDictionary([3,3,3,4,5]),result=generateLevel({},dictionary,20261010);
assert.equal(result.ok,true,result.message);
await mkdir(new URL('examples/tsv/',root),{recursive:true});
for(const path of ['examples/tsv/seed_20261010.json','dist/seed_20261010.json'])await writeFile(new URL(path,root),JSON.stringify(result.level,null,2)+'\n');
const report={source:library.source,review:library.review,version:library.version,entries:entries.length,countsByTier:Object.fromEntries([1,2,3,4,5].map(t=>[t,entries.filter(e=>e.tier===t).length])),targetDictionaryVersion:dictionary.version,targetCandidates:dictionary.words.length,fixtureSeed:20261010,targets:result.level.targets.map(t=>t.word)};
await writeFile(new URL('reports/tsv-application.json',root),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));
