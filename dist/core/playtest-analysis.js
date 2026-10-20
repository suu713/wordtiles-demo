import { calculateLevelStatistics } from './level-statistics.js?v=15';
import { summarizeRuns } from './playtest.js?v=29';
import {levelMetrics,operationMetrics} from './playtest-metrics.js?v=29';
import {spatialLevelMetrics} from './spatial-perception.js?v=29';

export function analyzePlayedLevel(level,runs,frequency,dictionary=null) {
  const zen=level.kind==='zen',words=zen?level.targets:level.targets.map(t=>t.word);
  const english=(level.source?.language||'english')==='english';
  const values=words.map(w=>english?frequency?.zipf?.[w]:null).filter(v=>typeof v==='number'&&v>0);
  const measured=levelMetrics(level,dictionary);
  const valid=runs.filter(r=>!['error','anomaly','cancelled','unsupported','search-limit'].includes(r.outcome));
  const operations=valid.map(r=>operationMetrics(level,r.events));
  const average=key=>operations.length&&operations[0][key]!==null?operations.reduce((s,r)=>s+r[key],0)/operations.length:null;
  return {game:zen?'Zen Word':level.kind==='web'?'网页生成关卡':'Word Tiles',language:level.source?.language||'english',bank:level.source?.bank||level.source?.order||'all',
    position:level.source?.position??null,id:zen?level.id:level.source?.original?.id??level.id??level.seed,
    dictionaryOrigin:zen?'zen':level.algorithm===1?'wt-package':level.source?.dictionaryOrigin??dictionary?.metadata?.origin??'legacy-web',
    editorNumber:level.source?.editorNumber??null,plannedDifficulty:level.source?.difficultyRequested??null,
    difficulty:level.source?.difficulty??null,score:zen?(level.original?.B||level.original)?.DifficultyScore??null:null,
    targetCount:words.length,targets:words.join(' / '),minZipf:values.length?Math.min(...values):null,
    meanZipf:values.length?values.reduce((s,v)=>s+v,0)/values.length:null,unknownFrequency:words.length-values.length,
    ...measured,meanTurnOperations:average('turnOperations'),meanReverseConnections:average('reverseConnections'),
    obstacles:level.source?.original?.obstacles?.length??0,
    dictionaryVersion:level.dictionaryVersion??level.source?.dictionaryVersion??level.source?.version??null,sourceSha256:level.source?.sha256??level.source?.sourceSha256??dictionary?.metadata?.sourceSha256??null,runMode:runs[0]?.mode||null,...summarizeRuns(runs)};
}
export function wordAnalysis(level,runs,frequency,dictionary=null) {
  const roles=level.kind==='zen'?level.wordRoles:{answer:level.targets.map(t=>t.word),extra:level.algorithm===1?(level.source.original.extra_words||[]).map(t=>t.word):calculateLevelStatistics(level,dictionary||{words:[]}).extraWords};
  const spatial=new Map(spatialLevelMetrics(level).words.map(word=>[word.word,word]));
  const valid=runs.filter(r=>!['error','anomaly','cancelled','unsupported','search-limit'].includes(r.outcome));
  const modeled=valid.filter(r=>r.mode==='ordinary');
  return Object.entries(roles).flatMap(([role,words])=>[...new Set(words)].map(word=>({game:level.kind==='zen'?'Zen Word':level.kind==='web'?'网页生成关卡':'Word Tiles',
    language:level.source?.language||'english',bank:level.source?.bank||level.source?.order,position:level.source?.position,
    levelId:level.id,role,word,zipf:(level.source?.language||'english')==='english'?frequency?.zipf?.[word]??null:null,
    ...(role==='answer'?spatial.get(word):{}),
    knownSamples:role==='answer'&&modeled.length?modeled.filter(r=>r.wordStats?.some(s=>s.word===word&&s.known)).length:null,
    missedKnownSamples:role==='answer'&&modeled.length?modeled.filter(r=>r.wordStats?.some(s=>s.word===word&&s.known&&s.misses>0)).length:null,
    missedRecognitions:role==='answer'&&modeled.length?modeled.reduce((sum,r)=>sum+(r.wordStats?.find(s=>s.word===word)?.misses||0),0):null,
    trialSwipes:role==='answer'&&modeled.length?modeled.reduce((sum,r)=>sum+(r.wordStats?.find(s=>s.word===word)?.trialSwipes||0),0):null,
    hintLetters:role==='answer'&&modeled.length?modeled.reduce((sum,r)=>sum+(r.wordStats?.find(s=>s.word===word)?.hintLetters||0),0):null,
    successes:valid.filter(r=>r.events?.some(e=>e.word===word&&e.result?.accepted)).length,
    hinted:valid.filter(r=>r.wordStats?.some(s=>s.word===word&&s.hintLetters>0)||r.events?.some(e=>e.word===word&&e.hinted)).length,samples:valid.length})));
}
