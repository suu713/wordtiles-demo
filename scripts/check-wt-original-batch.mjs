import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {convertWTLevel,WTSourceSession,WT_RUNTIME} from '../dist/core/wt-source-session.js';
import {SimulationRun} from '../dist/core/playtest.js';
import {ENGLISH_FREQUENCY} from '../dist/core/playtest-frequency.js';
const bank=JSON.parse(await readFile(new URL('../dist/source-levels/english.json',import.meta.url)));
const catalogue=JSON.parse(await readFile(new URL('../dist/source-levels/catalogue.json',import.meta.url)));
const results=[],outcomes={},start=performance.now();let peakRss=0;
for(const id of bank.orders.all){
  try{
    const level=convertWTLevel(bank.levels[id]),s=new WTSourceSession(level);
    const {outcome,elapsedSeconds,mistakes,completed,targetCount,victoryReason}=new SimulationRun(s,{frequency:ENGLISH_FREQUENCY,mode:'ordinary'}).run();
    results.push({id,outcome,elapsedSeconds,mistakes,completed,targetCount,victoryReason});outcomes[outcome]=(outcomes[outcome]||0)+1;
  }catch(error){results.push({id,outcome:'error',message:error.message});outcomes.error=(outcomes.error||0)+1;}
  peakRss=Math.max(peakRss,process.memoryUsage().rss);
  if(results.length%500===0)console.log(`已检查 ${results.length}/${bank.orders.all.length}，内存 ${(peakRss/1024/1024).toFixed(0)} MiB`);
}
const summary={purpose:'全库接入冒烟检查；每关仅1局，不用于估计真实通关率',runtime:WT_RUNTIME,sha256:catalogue.sha256,total:results.length,outcomes,elapsedMs:Math.round(performance.now()-start),peakRssMiB:Math.round(peakRss/1024/1024)};
const out=new URL('../../outputs/wt-source-reconnect-20261026/',import.meta.url);await mkdir(out,{recursive:true});await writeFile(new URL('full-library-smoke.json',out),JSON.stringify({summary,results},null,2));console.log(JSON.stringify(summary,null,2));
if(outcomes.error||outcomes.anomaly)process.exitCode=1;
