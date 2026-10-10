import {readFile,writeFile} from 'node:fs/promises';
import {generateLevel} from '../dist/core/generator.js';
import {validateLevel,GameSession} from '../dist/core/rules.js';
const dictionary=JSON.parse(await readFile(new URL('../dist/dictionary.json',import.meta.url),'utf8'));
const configs=[
  {rows:3,cols:4,wordLengths:[3,3,3,4,5]},
  {rows:4,cols:4,wordLengths:[3,3,4,4,5,5]},
  {rows:4,cols:4,wordLengths:[3,3,3,3,3,3,3,3,4,4]},
  {rows:5,cols:5,wordLengths:[4,4,4,4,5,5,5]},
  {rows:6,cols:6,wordLengths:[5,5,5,5,5,5,5,5]},
  {rows:2,cols:4,wordLengths:[8]}
];
const records=[];
for(const config of configs) {
  const seed=`matrix-${config.rows}x${config.cols}-${config.wordLengths.length}`;
  const result=generateLevel(dictionary,seed,{config});
  if(result.success) {
    const validation=validateLevel(result.level,dictionary);
    if(!validation.valid) throw new Error('Independent validation failed');
    const game=new GameSession(result.level,dictionary);
    for(const target of [...result.level.targets].reverse()) if(!game.submit(target.path).accepted) throw new Error('Gameplay failed');
    if(game.total!==0) throw new Error('Board did not clear');
  }
  const record={config,seed,success:result.success,reason:result.reason||null,nodes:result.stats.nodes,attempts:result.stats.attempts,stateChecks:result.validation?.stateChecks,level:result.level};
  records.push(record);console.log(JSON.stringify({...record,level:undefined}));
}
await writeFile(new URL('../reports/config-matrix.json',import.meta.url),JSON.stringify(records,null,2)+'\n');
