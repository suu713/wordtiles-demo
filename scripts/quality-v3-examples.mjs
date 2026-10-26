import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {calculateLevelQuality,pairSpellingSimilarity} from '../dist/core/quality-metrics.js';
const fixture=JSON.parse(await readFile(new URL('../tests/fixtures/retired-runtime-data/sample.json',import.meta.url),'utf8')),
  dictionary=JSON.parse(await readFile(new URL('../tests/fixtures/retired-runtime-data/dictionary.json',import.meta.url),'utf8'));
const report=calculateLevelQuality(fixture,{mainDictionary:dictionary});
const example={kind:'historical-quality-calculation-example',historicalRegressionOnly:true,
  notes:['此棋盘仅用于历史回归示例，不会载入正式词库或自动作为正式关卡。','本示例未提供可靠Zipf、词根和完整审核词典，对应指标保持不可用。'],
  formulas:{totalTurnCount:report.words.map(word=>`${word.word}:${word.wordTurnCount}`).join(' + ')+' = '+report.values.totalTurnCount,
    straightRatio:'2 / 5 = 0.4',sharedCellRate:'6 / 9 = 0.6666666667',
    spellingSimilarity:{pair:['FEED','FEE'],formula:'0.5 × (6/7) + 0.3 × (3/3) + 0.2 × (1-1/4)',...pairSpellingSimilarity('FEED','FEE')}},report};
await mkdir(new URL('../reports/',import.meta.url),{recursive:true});await writeFile(new URL('../reports/quality-v3-examples-20261026.json',import.meta.url),JSON.stringify(example,null,2));
console.log(JSON.stringify({totalTurnCount:report.values.totalTurnCount,straightRatio:report.values.straightRatio,sharedCellRate:report.values.sharedCellRate,output:'reports/quality-v3-examples-20261026.json'}));
