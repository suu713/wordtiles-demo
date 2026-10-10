import fs from 'node:fs';
import assert from 'node:assert/strict';
import {performance} from 'node:perf_hooks';
import {generateLevel, validateLevel} from './reference-engine.mjs';
import {independentCheck} from './independent-check.mjs';
import {createWordGate} from '../whitelist.mjs';
const root=new URL('../',import.meta.url);
const read=p=>JSON.parse(fs.readFileSync(new URL(p,root),'utf8'));
const dictionary=read('dictionary_3to5.json'), full=read('dictionary.json'), gate=createWordGate(full);
const config={maxNodesPerAttempt:10000,maxAttempts:30,maxTotalNodes:300000};
const n=Number(process.argv[2]??1000);assert.ok(Number.isInteger(n)&&n>0&&n<=10000);
let states=0,orders=0;const records=[],samples=[],sets=new Set();
for(let seed=0;seed<n;seed++){
 const t=performance.now(),r=generateLevel(config,dictionary,seed),elapsedMs=performance.now()-t;
 const row={seed,ok:r.ok,nodes:r.stats.nodes,elapsedMs};
 if(r.ok){
  assert.equal(validateLevel(r.level,dictionary).ok,true);
  assert.equal(gate.checkLevelTargets(r.level).ok,true);
  const v=independentCheck(r.level);states+=v.statesChecked;orders+=v.ordersReplayed;
  assert.deepEqual(generateLevel(config,dictionary,seed),r);
  row.words=r.level.targets.map(t=>t.word);sets.add([...row.words].sort().join('|'));
  if(seed<20){samples.push(r.level);fs.writeFileSync(new URL(`examples/seed_${String(seed).padStart(6,'0')}.json`,root),JSON.stringify(r.level,null,2)+'\n');}
 }else{row.failureCode=r.code;row.message=r.message;}
 records.push(row);
}
const selected=generateLevel(config,dictionary,20261010);
if(selected.ok){independentCheck(selected.level);fs.writeFileSync(new URL('examples/seed_20261010.json',root),JSON.stringify(selected.level,null,2)+'\n');}
const report={dictionaryVersion:dictionary.version,algorithm:'Unmodified previously supplied backtrack-v1.0.0',scope:'Node core generator, independent path/state replay and exact whitelist. Not the user modified Algorithm 2, browser, UI, cache or native-speaker playtest.',config,seeds:[0,n-1],attempted:n,success:records.filter(r=>r.ok).length,failed:records.filter(r=>!r.ok).length,independentStatesChecked:states,independentOrdersReplayed:orders,distinctTargetSets:sets.size,deterministicReplays:n,forbiddenTargetOccurrences:0,records};
fs.writeFileSync(new URL('tests/benchmark-results.json',root),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({...report,records:undefined},null,2));
console.log('NEW SAMPLE',selected.ok?selected.level:selected.code);
