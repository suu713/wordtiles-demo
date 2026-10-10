import { readFile, writeFile } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { generateLevel, GENERATOR_VERSION } from '../dist/core/algorithm2.js';
import { isTargetAllowed, createBaseDictionary } from '../dist/core/target-policy.js';
import { createAlgorithmSession } from '../dist/core/algorithm-v1-adapter.js';
import { GameSession } from '../dist/core/rules.js';
import { checkV1Independently, permutations } from './independent-v1-check.mjs';

const dictionary = createBaseDictionary([3,3,3,4,5]);
const rawDictionary = Buffer.from(JSON.stringify(dictionary));
const fixture = JSON.parse(await readFile(new URL('../examples/tsv/seed_20261010.json',import.meta.url),'utf8'));
const source = await readFile(new URL('../src/wordtiles-algorithm.ts',import.meta.url));
const hash = value => createHash('sha256').update(value).digest('hex');
const config = { maxNodesPerAttempt:10000, maxAttempts:30, maxTotalNodes:300000 };
const size = Number(process.argv[2] ?? 1000);
assert.ok(Number.isInteger(size) && size > 0 && size <= 10000);
const expected = generateLevel(config,dictionary,20261010);
assert.equal(expected.ok,true); assert.deepEqual(expected.level,fixture);
const started = performance.now(), results = [], boards = new Set(), words = new Set();
let statesChecked=0, ordersReplayed=0, submissions=0;
// All eight rotations/reflections, including counts and target consumption sets.
function canonicalBoard(level) {
  const representations=[];
  for (const flip of [false,true]) for (let rotations=0; rotations<4; rotations++) {
    const map=Array.from({length:9},(_,cell)=>{
      let row=Math.floor(cell/3),col=cell%3;
      if (flip) col=2-col;
      for (let turn=0;turn<rotations;turn++) [row,col]=[col,2-row];
      return row*3+col;
    });
    const letters=Array(9),counts=Array(9);
    for(let i=0;i<9;i++) { letters[map[i]]=level.letters[i]; counts[map[i]]=level.initialCounts[i]; }
    representations.push(JSON.stringify([letters,counts,level.targets.map(t=>[t.word,t.canonicalPath.map(cell=>map[cell]).sort((a,b)=>a-b)])]));
  }
  return representations.sort()[0];
}
for(let seed=0;seed<size;seed++) {
  const tick=performance.now(), result=generateLevel(config,dictionary,seed);
  if(!result.ok) { results.push({seed,ok:false,code:result.code,message:result.message,stats:result.stats}); continue; }
  assert.deepEqual(generateLevel(config,dictionary,seed),result,`seed ${seed} reproducibility`);
  assert.ok(result.level.targets.every(target=>isTargetAllowed(target.word)),`seed ${seed} whitelist`);
  statesChecked+=checkV1Independently(result.level,dictionary).statesChecked;
  const initial=createAlgorithmSession(result.level,dictionary);
  assert.equal(initial.report.algorithmValidation.statesChecked,32);
  assert.equal(initial.report.stateChecks,32);
  for(const order of permutations(initial.initial.targets)) {
    // Cache the validated initial report, never the mutable gameplay state.
    const game=new GameSession(initial.initial,dictionary,{validator:()=>initial.report});
    for(const target of order) {
      assert.equal(game.submit(target.path).accepted,true,`seed ${seed}: ${target.word}`);
      assert.ok(game.counts.every(count=>count>=0)); submissions++;
    }
    assert.equal(game.status,'won'); assert.deepEqual(game.counts,Array(9).fill(0)); ordersReplayed++;
  }
  boards.add(canonicalBoard(result.level)); words.add(result.level.targets.map(t=>t.word).sort().join(','));
  results.push({seed,ok:true,words:result.level.targets.map(target=>target.word),dictionaryVersion:result.level.dictionaryVersion,elapsedMs:Math.round((performance.now()-tick)*100)/100,stats:result.stats});
  if((seed+1)%100===0) console.log(`${seed+1}/${size}: generated, independently checked all states, replayed all orders.`);
}
const succeeded=results.filter(item=>item.ok).length;
const report={ generatorVersion:GENERATOR_VERSION,dictionaryVersion:dictionary.version,dictionaryWords:dictionary.words.length,
  sourceSha256:hash(source),dictionarySha256:hash(rawDictionary),config,seedRange:[0,size-1],fixtureSeed:20261010,fixtureMatched:true,
  succeeded,failed:size-succeeded,outsideWhitelistTargets:0,distinctBoardsAfterSymmetry:boards.size,distinctTargetSets:words.size,
  independentStatesChecked:statesChecked,actualOrdersReplayed:ordersReplayed,actualSubmissions:submissions,
  elapsedMs:Math.round(performance.now()-started),results };
await writeFile(new URL(`../reports/tsv-batch-${size}.json`,import.meta.url),JSON.stringify(report,null,2)+'\n');
const { results:detail,...summary }=report;
console.log(JSON.stringify(summary,null,2));
if(report.failed) process.exitCode=1;
