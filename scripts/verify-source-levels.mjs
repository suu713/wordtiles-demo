import assert from 'node:assert/strict';
import { readFile,writeFile } from 'node:fs/promises';
import { convertSourceLevel,validateSourceLevel,SourceGameSession } from '../dist/core/source-levels.js';

const root=new URL('../dist/source-levels/',import.meta.url);
const catalogue=JSON.parse(await readFile(new URL('catalogue.json',root),'utf8'));
const start=Date.now(), languages=[];
for (const info of catalogue.languages) {
  const bank=JSON.parse(await readFile(new URL(info.file,root),'utf8'));
  assert.equal(bank.orders.main.length,info.mainCount);
  assert.equal(bank.orders.all.length,info.count);
  assert.ok(bank.orders.main.every(id=>bank.levels[id]));
  const summary={ language:info.language,validated:0,cleared:0,mainPositions:info.mainCount,maxUses:0,maxTargets:0,maxLength:0,ambiguous:0,obstacleMetadata:0,examples:{} };
  for (const id of bank.orders.all) {
    const raw=bank.levels[id], level=convertSourceLevel(raw,{ language:info.language,order:'all',position:summary.validated+1 });
    const report=validateSourceLevel(level);
    assert.equal(report.valid,true,info.language+' '+id+' '+JSON.stringify(report.errors));
    assert.deepEqual(level.source.original,raw);
    summary.validated++;
    summary.maxUses=Math.max(summary.maxUses,...level.board.counts);
    summary.maxTargets=Math.max(summary.maxTargets,level.targets.length);
    summary.maxLength=Math.max(summary.maxLength,...level.config.wordLengths);
    if (report.targets.some(t=>t.setCount>1)) { summary.ambiguous++; summary.examples.ambiguous ||= { id,position:summary.validated }; }
    if (raw.obstacles?.length) summary.obstacleMetadata++;
    if (level.targets.length===18) summary.examples.large ||= { id,position:summary.validated };
    if (level.config.wordLengths.some(n=>n>8)) summary.examples.long ||= { id,position:summary.validated };
    if (Math.max(...level.board.counts)>3) summary.examples.highCounts ||= { id,position:summary.validated };
    for (const targets of [level.targets,[...level.targets].reverse()]) {
      const game=new SourceGameSession(level);
      for (const target of targets) {
        assert.equal(game.submit(target.path).accepted,true,info.language+' '+id+' '+target.word);
        assert.notEqual(game.status,'anomaly');
      }
      assert.equal(game.status,'won'); assert.equal(game.total,0);
    }
    summary.cleared++;
  }
  languages.push(summary); console.log('PASS '+info.language+': '+summary.validated+' converted, validated and cleared in forward/reverse order.');
}
const report={ total:languages.reduce((n,l)=>n+l.validated,0),cleared:languages.reduce((n,l)=>n+l.cleared,0),failed:0,elapsedMs:Date.now()-start,languages };
assert.equal(report.total,catalogue.total);
await writeFile(new URL('../reports/source-verified.json',import.meta.url),JSON.stringify(report,null,2)+'\n');
console.log('Source acceptance: '+report.total+' levels passed; '+report.elapsedMs+' ms.');
