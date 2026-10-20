import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {convertSourceLevel,SourceGameSession} from '../dist/core/source-levels.js';
import {createBankDictionary} from '../dist/core/dictionary-banks.js';
import {generateLevel} from '../dist/core/algorithm2.js';
import {createAlgorithmSession} from '../dist/core/algorithm-v1-adapter.js';
import {SimulationRun,summarizeRuns,hashSeed} from '../dist/core/playtest.js';
import {analyzePlayedLevel} from '../dist/core/playtest-analysis.js';
import {SPATIAL_CALIBRATION} from '../dist/core/spatial-perception.js';
import {ENGLISH_FREQUENCY} from '../dist/core/playtest-frequency.js';
const load=async name=>JSON.parse(await readFile(new URL('../dist/'+name,import.meta.url),'utf8'));
const frequency=ENGLISH_FREQUENCY,bank=await load('source-levels/english.json'),rows=[],all=[];
let submitted=0;
function check(label,factory,dictionary){
  const initial=factory().initial,runs=[];
  for(let i=0;i<30;i++){
    // Explicit seeds belong to this isolated regression audit, never to the production UI.
    const session=factory(),run=new SimulationRun(session,{frequency,seed:hashSeed(label+':'+i)}).run(),replay=factory();
    for(const event of run.events)if(event.type==='submit'){assert.deepEqual(replay.submit(event.value),event.result);submitted++;}
    assert.ok(!['error','anomaly','search-limit'].includes(run.outcome),label+':'+run.outcome);runs.push(run);
  }
  all.push(...runs);const row=analyzePlayedLevel(initial,runs,frequency,dictionary);rows.push({label,...row});
}
for(const position of [1,10,25,100,200,500,1000]){
  const level=convertSourceLevel(bank.levels[bank.orders.main[position-1]],{language:'english',order:'main',position});check('WT-'+position,()=>new SourceGameSession(level));
}
const dictionary=createBankDictionary([3,4,5]);
for(let i=0;i<6;i++){
  const generated=generateLevel({maxNodesPerAttempt:30000,maxAttempts:100,maxTotalNodes:1000000},dictionary,hashSeed('regression-web-'+i));assert.equal(generated.ok,true);
  check('网页-'+(i+1),()=>createAlgorithmSession(generated.level,dictionary),dictionary);
}
const aggregate=summarizeRuns(all),weightedKnowledge=all.reduce((sum,r)=>sum+r.knownCount,0)/all.reduce((sum,r)=>sum+r.targetCount,0);
assert.ok(Math.abs(weightedKnowledge-.8)<.02);
const report={model:all[0].modelVersion,calibrationStatus:SPATIAL_CALIBRATION.status,frequencyVersion:frequency.version,humanValidated:false,
  purpose:'Engineering regression audit on the repository-present WT levels and generated levels; not observed player performance.',levels:rows.length,runs:all.length,realRuleSubmissionsVerified:submitted,weightedKnowledge,aggregate,rows};
await mkdir(new URL('../.openai/tmp/editor-v29/',import.meta.url),{recursive:true});await writeFile(new URL('../.openai/tmp/editor-v29/model-validation.json',import.meta.url),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({levels:rows.length,runs:all.length,realRuleSubmissionsVerified:submitted,weightedKnowledge,errors:aggregate.errors,meanTrialSwipes:aggregate.meanTrialSwipes},null,2));
