import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {SourceGameSession,convertSourceLevel} from '../dist/core/source-levels.js';
import {SimulationRun,DEFAULT_PROFILE} from '../dist/core/playtest.js';
import {analyzePlayedLevel} from '../dist/core/playtest-analysis.js';
import {operationMetrics} from '../dist/core/playtest-metrics.js';
import {ENGLISH_FREQUENCY} from '../dist/core/playtest-frequency.js';
const load=async file=>JSON.parse(await readFile(new URL('../dist/'+file,import.meta.url),'utf8'));
const frequency=ENGLISH_FREQUENCY,catalogue=await load('source-levels/catalogue.json');
const output=fileURLToPath(new URL('../.openai/tmp/playtest/full-report.json',import.meta.url));await mkdir(fileURLToPath(new URL('../.openai/tmp/playtest/',import.meta.url)),{recursive:true});
const repeatCount=Number(process.argv[2]||20),maxLevels=Number(process.argv[3]||Infinity);if(!Number.isInteger(repeatCount)||repeatCount<1||repeatCount>1000)throw new Error('repeats must be 1..1000');
const info=catalogue.languages.find(language=>language.language==='english');
const report={status:'running',createdAt:new Date().toISOString(),frequencyVersion:frequency.version,
  job:{game:'wordtiles',language:'english',mode:'ordinary',repeats:repeatCount,randomization:'system',profile:DEFAULT_PROFILE,sourceSha256:catalogue.sha256},
  requested:Math.min(maxLevels,info.count),levels:[],runs:[]};
const start=Date.now(),bank=await load('source-levels/'+info.file);
for(let position=1;position<=Math.min(info.count,maxLevels);position++) {
  const level=convertSourceLevel(bank.levels[String(bank.orders.all[position-1])],{language:'english',order:'all',position,sha256:catalogue.sha256});
  const runs=[];
  for(let repeat=0;repeat<repeatCount;repeat++) {
    const session=new SourceGameSession(level),result=new SimulationRun(session,{frequency,profile:DEFAULT_PROFILE}).run();runs.push(result);
    const {events,profile,seed,...summary}=result;
    report.runs.push({...summary,...operationMetrics(level,events),game:'Word Tiles',bank:'all',position,id:level.id,repeat:repeat+1});
  }
  report.levels.push({...analyzePlayedLevel(level,runs,frequency),runMode:'ordinary'});
  if(report.levels.length%100===0)console.log(JSON.stringify({processed:report.levels.length,total:report.requested,runs:report.runs.length,elapsedSeconds:Math.round((Date.now()-start)/1000)}));
}
report.status='complete';report.elapsedSeconds=(Date.now()-start)/1000;
await writeFile(output,JSON.stringify(report));console.log(JSON.stringify({complete:true,levels:report.levels.length,runs:report.runs.length,elapsedSeconds:report.elapsedSeconds,output}));
