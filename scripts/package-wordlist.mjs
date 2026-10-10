import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';

const root=new URL('../',import.meta.url), source=new URL('data/words.tsv',root);
const bytes=await readFile(process.argv[2]?resolve(process.argv[2]):source);
const input=new TextDecoder('utf-8',{fatal:true}).decode(bytes).replace(/^\uFEFF/,'');
const entries=[], words=new Set();
for(const [i,line] of input.split(/\r?\n/).entries()) {
  if(!line||line.startsWith('#')) continue;
  const fields=line.split('\t');
  assert.equal(fields.length,3,`line ${i+1}: expected word, tier, definition`);
  const [word,tier,definition]=fields;
  assert.match(word,/^[A-Z]+$/);assert.ok(!words.has(word),`duplicate ${word}`);
  assert.match(tier,/^[1-5]$/);assert.ok(definition.trim(),`${word}: missing definition`);
  words.add(word);entries.push({word,tier:Number(tier),definition});
}
assert.ok(entries.length>0);entries.sort((a,b)=>a.word.localeCompare(b.word));
const sha256=createHash('sha256').update(bytes).digest('hex');
const library={version:`wordtiles-tsv-20261010-${sha256.slice(0,12)}`,source:{file:'words.tsv',sha256,description:input.split(/\r?\n/)[0].replace(/^#\s*/,''),license:'MIT (as declared in the supplied TSV header)'},entries};
await mkdir(new URL('data/',root),{recursive:true});await writeFile(source,bytes);
await writeFile(new URL('dist/wordlist.json',root),JSON.stringify(library)+'\n');
const {createBaseDictionary}=await import('../dist/core/target-policy.js');
const {generateLevel}=await import('../dist/core/algorithm2.js');
const dictionary=createBaseDictionary([3,3,3,4,5]), result=generateLevel({},dictionary,20261010);
assert.equal(result.ok,true,result.message);
await mkdir(new URL('examples/tsv/',root),{recursive:true});
for(const path of ['examples/tsv/seed_20261010.json','dist/seed_20261010.json']) await writeFile(new URL(path,root),JSON.stringify(result.level,null,2)+'\n');
const report={source:library.source,version:library.version,entries:entries.length,countsByTier:Object.fromEntries([1,2,3,4,5].map(tier=>[tier,entries.filter(e=>e.tier===tier).length])),targetDictionaryVersion:dictionary.version,targetCandidates:dictionary.words.length,fixtureSeed:20261010,targets:result.level.targets.map(t=>t.word)};
await writeFile(new URL('reports/tsv-application.json',root),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));
