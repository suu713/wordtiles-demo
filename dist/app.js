import { DEFAULT_CONFIG, LIMITS, checkConfiguration, configForLevel, normalizeDictionary, clone } from './core/rules.js?v=21';
import { SourceGameSession, convertSourceLevel, validateSourceLevel, LANGUAGE_NAMES, SOURCE_VERSION } from './core/source-levels.js?v=15';
import {isWTLevel,validateWTLevel,WT_RUNTIME} from './core/wt-source-session.js?v=40';
import {wtSourceCatalogue,wtSourceBank,wtSourceLevel,originalOrder} from './core/wt-source-library.js?v=40';
import {createPlaySession} from './core/play-session.js?v=40';
import { createAlgorithmSession, validateAlgorithmLevel,isV1Level,migrateLegacyLevel } from './core/algorithm-v1-adapter.js?v=21';
import { GENERATOR_VERSION } from './core/wordtiles-algorithm.js';
import { calculateLevelStatistics } from './core/level-statistics.js?v=15';
import { createWordCollection, COLLECTION_KEY } from './core/word-collection.js?v=25';
import { preloadArt } from './core/art-theme.js?v=22';
import { preloadPlayerArt } from './core/player-art.js?v=6';
import {mountBackgroundThemes} from './background-themes.js?v=1';
import { localCollectionDate, groupCollectionDays, shiftCollectionMonth, collectionMonthCells, collectionMonthGroups } from './core/collection-calendar.js?v=16';
import { mountPlaytestLab } from './workbench-ui.js?v=56&settlement=7';
import {QUALITY_TEMPLATE,matchesQualityTemplate} from './core/quality-config.js?v=39';
import {mountCollectionViews} from './collection-ui.js?v=25';
import {mountEventViews} from './event-ui.js?v=30';
import {planTargetLengths,normalizeComposition} from './core/target-composition.js?v=28';
import {letterHintsForSession} from './core/letter-hints.js?v=33';
import {planTargetRows} from './core/target-rows.js?v=30';
import {TargetEffects} from './target-effects.js?v=3';
import {TargetShatter} from './target-shatter.js?v=1';
import {EncouragementBanners} from './encouragement-banners.js?v=2';
import {LevelEntrance} from './level-entrance.js?v=1';
import {createPersonalProgress,PERSONAL_PROGRESS_KEY} from './core/personal-progress.js?v=25';
import {clearAppData,dataEpoch,DATA_RESET_KEY,DATA_NOTICE_KEY,PREVIEW_COLLECTION_KEY} from './core/app-data.js?v=25';
import {createBankDictionary,BANK_NAMES,WEB_BANK_STATISTICS,bankLengthRange,WORD_BANK_ORIGIN} from './core/dictionary-banks.js?v=1';
const $ = selector => document.querySelector(selector);
const previewAtOpen=takePreviewRequest();
function takePreviewRequest(){
  const url=new URL(location.href);if(url.searchParams.get('preview')!=='300')return false;
  url.searchParams.delete('preview');history.replaceState(history.state,'',url.href);return true;
}
const board = $('#board');
let dictionary, game, catalogue, sourceLoadRequest=0;
let playtestLab;
let baseDictionary, dictionaryLoading = false, dictionaryLoadError = null;
let selectedAlgorithm = 2, ready = false, busyKind = null;
let browserStorage;
try { browserStorage=window.localStorage; } catch {}
const backgroundThemes=mountBackgroundThemes({storage:browserStorage});
const initialDataEpoch=dataEpoch(browserStorage);let dataResetting=false;
let collection=createWordCollection(browserStorage);
const personalProgress=createPersonalProgress(browserStorage);
const collectionViews=mountCollectionViews({getCollection:()=>collection,progress:personalProgress,openDialog:showTravelDialog,onContinue:async()=>{if(await playtestLab?.continueJourney())$('#start-game').click();}});
const eventViews=mountEventViews({storage:browserStorage,
  onMainPlay:async()=>{if(ready){if(game?.status==='won')await playtestLab?.continueJourney();$('#start-game').click();}},
  onCollect:(result,language,origin)=>{if(collection.collect(result,language,origin))renderCollection();},
  onPersonalProgress:(session,snapshot,flush)=>{personalProgress.observe(session,snapshot);if(flush)personalProgress.flush();},
});
let collectionMonth, collectionSelectedDate, collectionDateFilter = null;
const banks = new Map(), savedSessions = new Map();
let selection = [], activePointer = null, worker = null, busy = false;
let epoch = 0, requestId = 0, generationStats = null, lastRejection = null;
const tileElements = [];
let rejectedWord = '', rejectionTimer = null;
let answerPreviewOpen=false,answerPreviewGame=null;
let targetElementsSession=null;
const levelEntrance=new LevelEntrance({
  isVisible:()=>$('#lobby').hidden&&$('#game-screen').dataset.mode==='play'&&!document.hidden&&!playtestLab?.machineRunning,
  prepare:()=>{applyViewport();fitBoard();},
  onDone:session=>{
    if(game!==session||!$('#lobby').hidden||document.hidden)return;
    render();
    if(document.activeElement===document.body||document.activeElement===$('#start-game'))tileElements.find(tile=>tile.getAttribute('aria-disabled')==='false')?.focus({preventScroll:true});
  },
});
const targetEffects=new TargetEffects({
  board,
  isVisible:()=>$('#lobby').hidden&&!document.hidden&&!playtestLab?.machineRunning,
  onIdle:session=>{if(game===session){scheduleFit();syncCompletionEffect();if($('#lobby').hidden&&!document.hidden)playtestLab?.gameUpdated();}},
});
const targetShatter=new TargetShatter({
  isVisible:()=>$('#lobby').hidden&&!document.hidden&&!playtestLab?.machineRunning,
  onDone:session=>{if(game===session&&$('#lobby').hidden&&!document.hidden)playtestLab?.gameUpdated();},
});
const encouragementHost=$('#encouragement-banner');
const encouragement=new EncouragementBanners({
  isVisible:()=>$('#lobby').hidden&&!document.hidden&&!playtestLab?.machineRunning,
  show:(kind,duration)=>{
    encouragementHost.classList.remove('banner-active');
    encouragementHost.dataset.kind=kind;encouragementHost.style.setProperty('--banner-duration',duration+'ms');
    encouragementHost.hidden=false;$('.play-panel').classList.add('banner-showing');
    $('#encouragement-announcement').textContent=kind==='streak'?'连续找到三个目标词，太棒了！':'所有目标已完成，太棒了！';
    void encouragementHost.offsetWidth;encouragementHost.classList.add('banner-active');
  },
  hide:()=>{encouragementHost.hidden=true;encouragementHost.classList.remove('banner-active');$('.play-panel').classList.remove('banner-showing');$('#encouragement-announcement').textContent='';},
  onIdle:session=>{if(game===session&&$('#lobby').hidden&&!document.hidden){syncCompletionEffect();playtestLab?.gameUpdated();}},
});
function syncCompletionEffect(){
  if(game?.status!=='won'||levelEntrance.isRunning(game)||targetEffects.isRunning(game))return;
  encouragement.complete(game);
  if(!encouragement.isRunning(game))targetShatter.play(game,$('#targets'),$('.play-panel'));
}
const solutionCache = new WeakMap(), SOLUTIONS_PER_PAGE = 12;
let solutionWorker = null, solutionLevel = null, solutionRequest = 0, solutionPage = 0;
let draftLengths = [...DEFAULT_CONFIG.wordLengths], editorValid = false;
let webConfigDraft=clone(DEFAULT_CONFIG);
let compositionError='',qualityFixedTemplate=false;
function playerHints(){return letterHintsForSession(game);}
function visibleHint(word,index){return (answerPreviewOpen&&answerPreviewGame===game)||playerHints().has(word,index);}
function renderAnswerPreview(animate=false){
  // Display-only letters: never write to the hint state or submit a target.
  if(answerPreviewGame!==game){answerPreviewGame=game;answerPreviewOpen=false;}
  const open=!!game&&answerPreviewOpen,button=$('#answer-toggle');
  button.disabled=!game;button.setAttribute('aria-pressed',String(open));
  button.querySelector('span').textContent=open?'隐藏答案':'显示答案';
  if(!game)return;
  for(const target of $('#targets').querySelectorAll('.target')){
    const word=target.dataset.word,done=game.completed.has(word);
    target.setAttribute('aria-label',targetLabel(word,done));
    for(const slot of target.querySelectorAll('.target-letter')){
      const glyph=slot.querySelector('.target-glyph');
      const index=Number(slot.dataset.position),wasVisible=!!glyph.textContent;
      const revealed=!done&&visibleHint(word,index);
      glyph.textContent=done||revealed?[...word][index]:'';
      slot.classList.toggle('revealed',revealed);
      slot.classList.toggle('hint-flash',animate&&open&&!done&&!wasVisible);
    }
  }
}
$('#answer-toggle').addEventListener('click',()=>{if(!game)return;answerPreviewOpen=!answerPreviewOpen;hideHelp();renderAnswerPreview(true);});
function targetLabel(word,done=false){
  if(done)return `${word} 已完成`;
  if(answerPreviewOpen&&answerPreviewGame===game)return `${word}，答案预览，未完成`;
  const letters=[...word],clue=letters.map((letter,index)=>visibleHint(word,index)?letter:'·').join('');
  return `${letters.length} 字母目标，未完成${clue!=='·'.repeat(letters.length)?'，已提示 '+clue:''}`;
}

function readComposition(){return normalizeComposition({three:$('#generation-three-percent').value,four:$('#generation-four-percent').value});}
function compositionLengths(random=()=>.5){if(qualityFixedTemplate)return [...QUALITY_TEMPLATE.wordLengths];return planTargetLengths({rows:Number($('#board-rows').value),cols:Number($('#board-cols').value),targetCount:Number($('#generation-target-count').value),composition:readComposition(),maxUses:webConfigDraft.maxUses??3},dictionary?[...new Set(dictionary.words.map(word=>word.length))]:bankLengthRange(),random);}
const SVG_NS = 'http://www.w3.org/2000/svg';
const connections = document.createElementNS(SVG_NS, 'svg');
connections.classList.add('connections');
connections.setAttribute('viewBox', '0 0 1000 1000');
connections.setAttribute('preserveAspectRatio', 'none');
connections.setAttribute('aria-hidden', 'true');
function buildBoard(rows, cols) {
  clearWordError();
  tileElements.length = 0; board.replaceChildren();
  // APK rows start at the lower left. Keep its original cell IDs and JSON,
  // and place those cells in browser rows that run from top to bottom.
  const bottomUp = game?.initial.algorithm === 1;
  board.dataset.rowOrder = bottomUp ? 'bottom-up' : 'top-down';
  const dimension = Math.max(rows, cols);
  $('.play-panel').dataset.largeBoard = String(dimension > 3);
  board.style.setProperty('--cols', String(cols));
  board.style.setProperty('--tile-gap', 'calc(var(--device-width)*.010627)');
  board.style.setProperty('--tile-font', `${dimension >= 5 ? 24 : dimension === 4 ? 32 : 40}px`);
  board.setAttribute('aria-label', `${rows} 行 ${cols} 列字母棋盘`);
  for (let cell = 0; cell < rows * cols; cell++) {
    const tile = document.createElement('button');
    tile.type = 'button'; tile.className = 'tile'; tile.dataset.cell = String(cell);
    const row = Math.floor(cell / cols);
    tile.style.gridRow = String(bottomUp ? rows - row : row + 1);
    tile.style.gridColumn = String(cell % cols + 1);
    const letter = document.createElement('span'); letter.className = 'tile-letter';
    const pips = document.createElement('span'); pips.className = 'tile-pips'; pips.setAttribute('aria-hidden', 'true');
    tile.append(letter, pips); board.append(tile); tileElements.push(tile);
  }
  board.append(connections);
}

function renderWordRows() {
  const select = document.createElement('select');
  select.id = 'target-length-list'; select.setAttribute('aria-label', '逐个目标词长度');
  draftLengths.forEach((length, index) => {
    const option = document.createElement('option'); option.value = String(index);
    option.textContent = `目标 ${String(index + 1).padStart(2, '0')} · ${length} 个字母`;
    select.append(option);
  });
  $('#word-lengths').replaceChildren(select);
  if(draftLengths.length&&$('#generation-target-count'))$('#generation-target-count').value=String(draftLengths.length);
  syncUniformLength();
}
function syncUniformLength() {
  $('#uniform-length').value = draftLengths.every(n => n === draftLengths[0]) ? String(draftLengths[0]) : '';
}
function readEditorConfig() {
  return { rows: Number($('#board-rows').value), cols: Number($('#board-cols').value), wordLengths: [...draftLengths], ...(webConfigDraft.maxUses?{maxUses:webConfigDraft.maxUses}:{}) };
}
function restoreWebDraft(){const c=webConfigDraft;$('#board-rows').value=c.rows;$('#board-cols').value=c.cols;draftLengths=[...c.wordLengths];$('#generation-lengths').value=draftLengths.join(',');$('#word-count').value=String(draftLengths.length);renderWordRows();updateEditor();}
function checkEditor() {
  const config = readEditorConfig();
  if (selectedAlgorithm === 1) {
    const valid = game?.initial.algorithm === 1;
    return { config, report: { valid, errors: valid ? [] : [{ message:'请选择并载入原包关卡' }], stateCount:game?.report.stateCount || 0 } };
  }
  if(compositionError)return {config,report:{valid:false,errors:[{message:compositionError}],stateCount:0}};
  if (dictionaryLoading || !dictionary) return { config, report: { valid: false, errors: [{ message: dictionaryLoading ? '正在读取 WT词库.xlsx' : dictionaryLoadError || 'WT词库.xlsx 不可用' }], stateCount: 32 } };
  const report = checkConfiguration(config, dictionary);
  return { config, report };
}
function sourceInfo() {
  return catalogue?.languages.find(item => item.language === $('#source-language').value);
}
function sourceLimit() {
  const info = sourceInfo();
  return info?.lists?.find(list=>list.key===originalOrder($('#source-order').value))?.count||0;
}
function validSourcePosition() {
  const position = Number($('#source-number').value);
  return Number.isInteger(position) && position >= 1 && position <= sourceLimit();
}
function updateSourceRange() {
  const limit = sourceLimit();
  populateSourceOptions();
  $('#source-number').setAttribute('max', String(limit || 1));
  $('#source-range').textContent = limit ? '1–' + limit : '—';
  updateEditor();
}
function populateSourceOptions() {
  const select = $('#source-number'), limit = sourceLimit();
  const key = `${$('#source-language').value}:${$('#source-order').value}:${limit}`;
  if (select.dataset.optionsKey === key) return;
  const current = Number(select.value) || 1;
  const options = Array.from({ length: Math.max(1, limit) }, (_, index) => {
    const option = document.createElement('option'); option.value = String(index + 1);
    option.textContent = `第 ${index + 1} 关`; return option;
  });
  select.replaceChildren(...options); select.dataset.optionsKey = key;
  select.value = String(Math.min(current, Math.max(1, limit)));
}
function updateEditor() {
  const { config, report } = checkEditor(), isSource = selectedAlgorithm === 1;
  editorValid = report.valid;
  const validSize = Number.isInteger(config.rows) && Number.isInteger(config.cols) && config.rows >= 2 && config.rows <= 6 && config.cols >= 2 && config.cols <= 6;
  $('#summary-cells').textContent = validSize ? String(config.rows * config.cols) : '—';
  const count = Number($('#word-count').value);
  $('#summary-targets').textContent = Number.isInteger(count) && count >= 1 && count <= (isSource ? 18 : LIMITS.maxTargets) ? String(count) : '—';
  $('#summary-letters').textContent = count === draftLengths.length ? String(draftLengths.reduce((a,b) => a+b,0)) : '—';
  const source = game?.initial.source;
  const sourceDirty = isSource && source && (source.language !== $('#source-language').value || (source.order && source.order !== $('#source-order').value) || (source.position && source.position !== Number($('#source-number').value)));
  const dirty = !game || !report.valid || (isSource ? sourceDirty : JSON.stringify(config) !== JSON.stringify(configForLevel(game.initial)) || game.dictionary?.version !== dictionary?.version);
  $('#config-status').textContent = isSource
    ? (!validSourcePosition() ? '序号必须为 1～' + sourceLimit() + ' 的整数。' : dirty ? '已选新关卡，点击“载入”应用。' : '原包参数已锁定 · 帘子按累计目标开启，合法替代路径可用。')
    : report.valid ? `${config.cols}×${config.rows} · ${config.wordLengths.length} 个目标 · 词长 ${config.wordLengths.join('/')} · 校验 ${report.stateCount} 种完成状态。` : report.errors.map(error => error.message).join('；') + '。';
  if($('#shape-status')){
    const three=config.wordLengths.filter(n=>n===3).length,four=config.wordLengths.filter(n=>n===4).length,total=config.wordLengths.length,other=total-three-four;
    $('#shape-status').textContent=isSource?'按原包规格展示':!report.valid?report.errors.map(error=>error.message).join('；'):`${total} 个目标：三字 ${three}（${Math.round(three/total*100)}%）· 四字 ${four}（${Math.round(four/total*100)}%）· 其他 ${other}`;
    $('#shape-status').classList.toggle('error',!isSource&&!report.valid);
    $('#composition-note').hidden=isSource;
    try{const c=readComposition();$('#composition-note').textContent=qualityFixedTemplate?'V3 固定词长：3、3、3、4、5；手改配置后退出固定模板。':`其余 ${Math.max(0,100-c.three-c.four)}% 从词库现有的5～8字词中随机补齐`; }catch{$('#composition-note').textContent='占比按目标词数量计算';}
  }
  $('#config-status').classList.toggle('error', isSource ? !validSourcePosition() : !report.valid);
  $('#draft-tag').textContent = dirty ? '待应用' : '已应用';
  $('#draft-tag').classList.toggle('dirty', !!dirty);
  $('#preview-state').classList.toggle('dirty', !!dirty);
  $('#preview-state').textContent = game
    ? '当前试玩：算法' + (game.initial.algorithm === 1 ? '1' : '2') + ' · ' + game.initial.board.cols + ' × ' + game.initial.board.rows + ' · ' + game.initial.targets.length + ' 个目标词' + (dirty ? ' · 待应用' : '')
    : '正在加载试玩关卡…';
  setBusy(busy, busyKind);
}
function showMode() {
  const isSource = selectedAlgorithm === 1;
  $('#algorithm').value = String(selectedAlgorithm);
  $('.editor-panel').classList.toggle('source-mode', isSource);
  $('#source-controls').hidden = !isSource;
  $('#source-metadata').hidden = !isSource;
  $('#generation-section').hidden = isSource;
  $('#load-sample').hidden = true;
  $('#budget-fields').hidden = isSource;
  $('#debug-generation').hidden = isSource;
  $('#options-menu option[value="lexicon"]').disabled = isSource;
  $('#file-action option[value="sample"]').hidden = true;
  $('#file-action option[value="sample"]').disabled = true;
  if (!isSource && $('#options-menu').value === 'source') closeSettings();
  if (isSource && $('#settings-popover').dataset.pane === 'lexicon') closeSettings();
  updateDictionaryUI();
  $('#word-count').max = String(isSource ? 18 : LIMITS.maxTargets);
  for(const option of $('#word-count').options)option.disabled=!isSource&&Number(option.value)>LIMITS.maxTargets;
  for (const id of ['#board-cols','#board-rows','#word-count','#uniform-length','#generation-auto-lengths','#generation-target-count','#generation-three-percent','#generation-four-percent']) $(id).disabled = isSource||!!playtestLab?.bulkRunning;
  $('#generation-target-count').max=isSource?'18':'16';$('.shape-ratios').hidden=isSource;
  $('#generation-lengths').disabled=true;
  $('#shape-mode-note').textContent=isSource?'按 WT 原包实际宽高自动适配。':'宽高、目标词数和词长比例由你设置。';
  $('#uniform-length').querySelector('option[value=""]').textContent = isSource ? '按原关卡显示' : '固定词长组合';
  $('#uniform-length').querySelectorAll('option').forEach(option => { option.hidden=false; });
  $('#uses-note').textContent = isSource ? '按原包展示' : `每格最多使用 ${webConfigDraft.maxUses??3} 次`;
  $('#cols-note').textContent = isSource ? '原关卡列数' : '2～6 列';
  $('#rows-note').textContent = isSource ? '原关卡行数' : '2～6 行';
  $('#count-note').textContent = isSource ? '原关卡目标数量' : '按目标词长配置数量';
  $('#length-note').textContent = isSource ? '原始目标词长度' : '目标词来自 WT词库.xlsx，支持3～8个字母';
  $('#uniform-note').textContent = isSource ? '按原关卡显示' : '按配置显示';
  $('#preview-note').textContent = isSource?'原包试玩：提示揭开1个字母；帘子显示解锁所需累计词数。':'拖动连词，松手提交。提示揭开1个目标字母。';
  $('#hint').setAttribute('aria-label',isSource?'提示一个字母，整词揭完后自动收词':'提示一个字母');
  $('#rules-button').dataset.help=isSource?'上下左右连词；帘子格暂不可连，完成指定数量的目标后打开。识别目标按全部候选路径的格子并集扣次，并清理冗余格。额外词按本关原包名单判定，不扣次数。收齐目标或棋盘次数耗尽即过关。':'上下左右相邻连词，同次不能重复经过同一格。目标词扣除对应路径次数；次数归零留空。';
  $('.debug-explanation').textContent = isSource ? '每词全部候选路线取格子并集计次；收词后清理冗余格并保护剩余路径。' : '路径数与消耗集合数分开统计，每个词的集合必须唯一。';
}
function syncSourceControls(level) {
  const source = level.source;
  if (source?.language in LANGUAGE_NAMES) $('#source-language').value = source.language;
  if (catalogue?.languages[0].lists.some(list=>list.key===originalOrder(source?.order))) $('#source-order').value = originalOrder(source.order);
  populateSourceOptions();
  if (Number.isInteger(source?.position)) $('#source-number').value = String(source.position);
  $('#source-number').setAttribute('max', String(sourceLimit() || 1));
  $('#source-range').textContent = sourceLimit() ? '1–' + sourceLimit() : '—';
}
function syncEditor(level) {
  const config = configForLevel(level);
  if(level.algorithm!==1)qualityFixedTemplate=qualityFixedTemplate&&matchesQualityTemplate(config);
  $('#board-cols').value = String(config.cols); $('#board-rows').value = String(config.rows);
  $('#word-count').value = String(config.wordLengths.length);
  if (level.algorithm === 1) syncSourceControls(level);
  if(level.algorithm!==1){
    webConfigDraft=clone(config);
    const stored=level.source?.targetComposition,total=config.wordLengths.length,three=stored?.three??Math.round(config.wordLengths.filter(n=>n===3).length/total*100),four=stored?.four??Math.min(100-three,Math.round(config.wordLengths.filter(n=>n===4).length/total*100));
    try{const composition=normalizeComposition({three,four});$('#generation-three-percent').value=composition.three;$('#generation-four-percent').value=composition.four;}catch{}
  }
  draftLengths = [...config.wordLengths]; $('#generation-lengths').value=draftLengths.join(',');renderWordRows(); updateEditor();
}
function captureDraft() {
  return { rows:$('#board-rows').value, cols:$('#board-cols').value, count:$('#word-count').value, lengths:[...draftLengths] };
}
function rememberSession() {
  if (!game || (game.initial.algorithm === 1 ? 1 : 2) !== selectedAlgorithm) return;
  savedSessions.set(selectedAlgorithm, { game, kind:$('#level-kind').textContent, draft:captureDraft(), generationStats, lastRejection });
}
function applyLevelInfo(kind) {
  const isSource = game.initial.algorithm === 1, source = game.initial.source;
  $('#level-kind').textContent = kind;
  $('#active-seed-label').textContent = isSource ? '原关卡 ID' : '生成方式';
  const id = String(isSource ? source.original.id : '随机新关');
  $('#active-seed').textContent = id; $('#active-seed').title = id;
  $('#game-level-label').textContent = isSource ? 'WT 1.4.0' + (source.position ? ' · 第' + source.position + '关' : ' · 原包关卡') : '算法2 · 自由找词';
  if (isSource) {
    const info = catalogue?.languages.find(item => item.language === source.language);
    $('#source-library-status').textContent = (LANGUAGE_NAMES[source.language] || '原包') + ' · ID ' + source.original.id + (info ? ' · ' + info.count.toLocaleString() + ' 个不同关卡' : '');
    $('#source-meta').textContent = JSON.stringify(source.original, null, 2);
  }
  renderLevelStatistics();
  startSolutionAnalysis();
}
function renderLevelStatistics() {
  const levelDictionary = game.bonusDictionaryInput || game.dictionary || dictionary;
  const stats = calculateLevelStatistics(game.initial, levelDictionary);
  $('#extra-word-count').textContent = String(stats.extraWordCount);
  const extraRule = stats.extraWordSource === 'original-list'
    ? '按原包本关 extra_words 列表统计，去重并排除目标词。'
    : `在 ${levelDictionary.version} 词库中，统计初始棋盘能用四向相邻路径拼出的非目标词；同一格不能重复经过，同一单词的多条路径只算一次。`;
  $('#extra-word-stat').dataset.help = extraRule + (stats.extraWords.length ? ' 单词：' + stats.extraWords.join('、') + '。' : ' 本关没有非目标词。') + ' 这是初始关卡数量，试玩时保持不变。';
  $('#reverse-word-count').textContent = `${stats.reverseWordCount} / ${stats.targetCount}`;
  $('#reverse-word-stat').dataset.help = '只比较参考路径的起点和终点：终点在起点左侧或上方，才计为倒序。中途的转弯方向不影响统计；同列向下的词不计入。按画面坐标计算，原包的上下行序会先换算。左边是倒序目标词数量，右边是本关目标词总数。' + (stats.reverseWords.length ? ' 倒序词：' + stats.reverseWords.join('、') + '。' : ' 本关全部目标为正序。') + ' 试玩时保持不变。';
  for (let uses = 2; uses <= 5; uses++) {
    const cells = stats.tileUses.flatMap((count, cell) => count === uses ? [cell] : []);
    $(`#tile-used-${uses}`).textContent = String(cells.length);
    $(`#tile-use-stat-${uses}`).dataset.help = `恰好被 ${uses} 个目标词共用的格子有 ${cells.length} 格。${isWTLevel(game.initial)?'原包按每个词全部路径取并集':'按各目标词参考路径'}统计，每个目标对同一格只算一次，非目标词不计入。` + (cells.length ? ' 格子编号：' + cells.join('、') + '。' : ' 本关没有此类格子。');
  }
  $('#tile-usage-heading').dataset.help = '格子就是棋盘上的字母方块。这里统计有多少格子被多个目标词共用，例如“被 2 个目标词使用：3 格”表示有 3 个格子各被 2 个目标词使用。按初始目标路径统计（原包每词全部路径取并集），非目标词不计入，试玩消除不会改变统计。全部分布：' + Object.entries(stats.usageHistogram).map(([uses, count]) => `${uses} 次 ${count} 格`).join('；') + '。';
  for (const [id, matches] of [['straight', target => target.turns === 0], ['one-turn', target => target.turns === 1], ['multi-turn', target => target.turns >= 2]]) {
    const words = stats.targetPaths.filter(matches).map(target => target.word);
    $(`#${id}-word-count`).textContent = String(words.length);
    $(`#${id}-word-stat`).dataset.help = '只统计目标词，每个词按保存的参考路径计算一次。相邻两段的行进方向改变算 1 次转弯；直线为 0 拐，1 拐为恰好 1 次，多拐为 2 次及以上。' + (words.length ? ' 单词：' + words.join('、') + '。' : ' 本关没有此类目标词。');
  }
}
async function switchAlgorithm(next) {
  if (!ready) return false;
  if (next === selectedAlgorithm) return true;
  sourceLoadRequest++;
  playtestLab?.gameChanging();
  cancelGeneration(true); cancelSolutionAnalysis(); closeGameDialogs(); clearSelection(); rememberSession();
  selectedAlgorithm = next; showMode(); epoch++;
  let saved = savedSessions.get(next);
  if(next===2&&saved&&!validateAlgorithmLevel(saved.game.exportInitial||saved.game.initial,saved.game.dictionary).valid) {
    savedSessions.delete(2); saved=null;
  }
  if (saved) {
    game = saved.game; generationStats = saved.generationStats; lastRejection = saved.lastRejection;
    buildBoard(game.initial.board.rows, game.initial.board.cols);
    if (next === 1) syncEditor(game.initial);
    else {
      $('#board-cols').value = saved.draft.cols; $('#board-rows').value = saved.draft.rows; $('#word-count').value = saved.draft.count;
      draftLengths = [...saved.draft.lengths]; renderWordRows(); updateEditor();
    }
    applyLevelInfo(saved.kind); render(); playtestLab?.gameChanged();
    feedback(game.status === 'won' ? '全部目标已完成。' : '');
    notice('已恢复算法' + next + '的关卡与试玩进度。', 'success');
    return true;
  } else if (next === 2) {restoreWebDraft();return generate(randomSeed());}
  else return loadSource();
}
$('#algorithm').addEventListener('change', () => switchAlgorithm(Number($('#algorithm').value)));

function updateDictionaryUI() {
  const origin=WORD_BANK_ORIGIN;$('#dictionary-source').value=WORD_BANK_ORIGIN;
  $('#zen-dictionary-field').hidden=true;$('#dictionary-tier').disabled=true;
  const status=$('#lexicon-status');status.textContent=(BANK_NAMES[origin]||origin)+' · '+WEB_BANK_STATISTICS.targetWords.toLocaleString()+' 必答词 / '+WEB_BANK_STATISTICS.extraWords.toLocaleString()+' 额外词';
  status.dataset.help='目标词只从工作簿“必答词”生成。能连出的非目标词，只要属于“必答词”或“额外词”就可计入额外词，不扣次数；“额外词”表中的词不会成为目标。关卡词长为3～8个字母。版本：'+(dictionary?.version||'读取失败');
}
async function refreshDictionary(announce=true){
  cancelGeneration(true);epoch++;dictionaryLoadError=null;dictionaryLoading=false;
  try{const lengths=bankLengthRange(WORD_BANK_ORIGIN);
    dictionary=createBankDictionary(lengths,WORD_BANK_ORIGIN);
  }catch(error){dictionaryLoadError=error.message;dictionary=null;}
  updateDictionaryUI();if(selectedAlgorithm===2)editorChanged();else updateEditor();renderDebug();playtestLab?.dictionaryChanged();
  if(announce)notice(dictionary?'词库来源已切换为 '+BANK_NAMES[dictionary.metadata.origin]+'，生成后应用。':'词库读取失败：'+dictionaryLoadError,dictionary?'success':'error');
}
for (const id of ['#dictionary-source', '#dictionary-tier']) $(id).addEventListener('change', () => refreshDictionary());

function editorChanged(event) {
  if(event)qualityFixedTemplate=false;
  const wasBusy=busy;cancelGeneration(true);
  if(wasBusy){generationStats={...generationStats,result:'cancelled',reason:'config-edited'};notice('参数已修改，旧参数的生成已取消。');renderDebug();}
  if(selectedAlgorithm===2){
    try{draftLengths=compositionLengths();compositionError='';}catch(error){draftLengths=[];compositionError=error.message;}
    $('#generation-lengths').value=draftLengths.join(',');$('#word-count').value=String(draftLengths.length);renderWordRows();if(!compositionError)webConfigDraft=readEditorConfig();
  }
  updateEditor();
}
for (const id of ['#board-cols', '#board-rows']) $(id).addEventListener('input', editorChanged);
$('#word-count').addEventListener('input', () => {
  $('#generation-target-count').value=$('#word-count').value;
  editorChanged();
});

function applyViewport() {
  const column = $('.preview-column');
  if ($('#game-screen').dataset.mode === 'play') {
    // Identical sizing to .lobby-panel; editor zoom only affects its preview.
    const width = Math.min(520, window.innerWidth, window.innerHeight * 9 / 16);
    column.style.setProperty('--device-width', 'min(100vw, calc(100dvh * 9 / 16), 520px)');
    column.style.setProperty('--device-height', 'calc(var(--device-width) * 16 / 9)');
    column.style.setProperty('--preview-scale', '1');
    $('.play-panel').classList.toggle('compact-device', width * 16 / 9 < 700);
    $('.play-panel').classList.toggle('small-viewport', width * 16 / 9 < 650);
    scheduleFit();
    return;
  }
  const style=getComputedStyle(column),availableWidth=column.clientWidth-parseFloat(style.paddingLeft)-parseFloat(style.paddingRight),availableHeight=Math.max(1,column.clientHeight-(document.querySelector('.playtest-start-bar')?.offsetHeight||0)-parseFloat(style.paddingTop)-parseFloat(style.paddingBottom)-12);
  let width, height;
  if ($('#preview-device').value === 'auto') {
    width = Math.max(1, Math.floor(Math.min(520, availableWidth, availableHeight * 9 / 16)));
    height = width * 16 / 9;
  } else [width,height] = $('#preview-device').value.split('x').map(Number);
  const scale = Math.min(Number($('#preview-zoom').value) / 100, availableWidth / width, availableHeight / height);
  column.style.setProperty('--device-width', width + 'px');
  column.style.setProperty('--device-height', height + 'px');
  column.style.setProperty('--preview-scale', String(scale));
  $('.play-panel').classList.toggle('compact-device', height < 700);
  $('.play-panel').classList.toggle('small-viewport', height < 650);
  scheduleFit();
}
let fitScheduled = false;
function scheduleFit() {
  if (fitScheduled) return;
  fitScheduled = true;
  requestAnimationFrame(() => { fitScheduled = false; fitBoard(); renderSelection(); });
}
function fitBoard() {
  if (!game) return;
  fitTargetRows();
  const targets = $('#targets');
  $('#targets-note').hidden = targets.scrollHeight <= targets.clientHeight + 1;
  const area = $('.game-board-area'), areaStyle = getComputedStyle(area), top = $('.board-top'), boardStyle = getComputedStyle(board);
  const rows = game.initial.board.rows, cols = game.initial.board.cols;
  const availableHeight = area.clientHeight - parseFloat(areaStyle.paddingTop) - parseFloat(areaStyle.paddingBottom) - top.offsetHeight - parseFloat(getComputedStyle(top).marginBottom);
  const padding = parseFloat(boardStyle.paddingLeft) + parseFloat(boardStyle.paddingRight) + parseFloat(boardStyle.borderLeftWidth) + parseFloat(boardStyle.borderRightWidth);
  const gap = parseFloat(boardStyle.columnGap);
  const fromHeight = (availableHeight - padding - (rows-1)*gap) / rows * cols + (cols-1)*gap + padding;
  const width = Math.max(padding + (cols-1)*gap + cols, Math.min(area.clientWidth, fromHeight));
  board.style.width = width + 'px';
  const cellSize = (width - padding - (cols-1)*gap) / cols;
  board.style.setProperty('--tile-font', Math.min(40, Math.max(16, cellSize*.48)) + 'px');
  board.dataset.compactCells = String(cellSize < 90);
  board.style.setProperty('--count-font', Math.min(17, Math.max(11, cellSize * .17)) + 'px');
  board.style.setProperty('--count-height', Math.min(23, Math.max(13, cellSize * .23)) + 'px');
}
function fitTargetRows() {
  const container=$('#targets'),items=[...container.querySelectorAll('.target')];
  if(!items.length||!container.clientWidth||!container.clientHeight)return;
  const panelWidth=$('.play-panel').clientWidth,style=getComputedStyle(container);
  const width=container.clientWidth-parseFloat(style.paddingLeft)-parseFloat(style.paddingRight);
  const rowGap=panelWidth*.012,letterGap=panelWidth*.005,wordGap=panelWidth*.03,minSlot=panelWidth*.07;
  const lengths=new Map(items.map(item=>[item,item.querySelectorAll('.target-letter').length]));
  const footprint=row=>({letters:row.reduce((sum,item)=>sum+lengths.get(item),0),gaps:row.reduce((sum,item)=>sum+lengths.get(item)-1,0)*letterGap+(row.length-1)*wordGap});
  const rows=planTargetRows(items.map(item=>lengths.get(item)),{width,minSlot,letterGap,wordGap}).map(indices=>indices.map(i=>items[i]));
  const visibleRows=Math.min(rows.length,7),heightLimit=(container.clientHeight-parseFloat(style.paddingTop)-parseFloat(style.paddingBottom)-(visibleRows-1)*rowGap)/visibleRows;
  const widthLimit=Math.min(...rows.map(row=>{const size=footprint(row);return (width-size.gaps)/size.letters;}));
  const slot=Math.max(1,Math.min(panelWidth*.085,heightLimit,widthLimit)),scrollTop=container.scrollTop;
  container.style.setProperty('--answer-size',slot+'px');container.style.setProperty('--target-row-gap',rowGap+'px');
  container.style.setProperty('--target-letter-gap',letterGap+'px');container.style.setProperty('--target-word-gap',wordGap+'px');
  container.dataset.layout=items.length<=7?'single':'packed';container.dataset.rows=String(rows.length);
  const currentRows=[...container.children];
  const sameRows=currentRows.length===rows.length&&currentRows.every((row,index)=>row.classList.contains('target-row')&&row.children.length===rows[index].length&&[...row.children].every((item,column)=>item===rows[index][column]));
  if(!sameRows&&!targetEffects.isRunning(game))container.replaceChildren(...rows.map(items=>{const row=document.createElement('div');row.className='target-row';row.append(...items);return row;}));
  container.scrollTop=scrollTop;
}
for (const id of ['#preview-device','#preview-zoom']) $(id).addEventListener('change', applyViewport);
new ResizeObserver(applyViewport).observe($('.preview-column'));
new ResizeObserver(scheduleFit).observe($('.game-board-area'));
window.addEventListener('resize', applyViewport);

function feedback(message, tone = '') {
  $('#feedback').textContent = message; $('#feedback').className = `feedback ${tone}`;
  $('#feedback').dataset.help = message;
}
function notice(message, tone = '') {
  $('#notice').textContent = message; $('#notice').className = `notice ${tone}`;
  const status = $('#editor-status');
  status.className = `editor-status ${tone}`;
  status.textContent = '●'; status.setAttribute('aria-label', message);
}
function clearSelection() {
  clearWordError();
  const oldPointer = activePointer;
  activePointer = null; selection = [];
  if (oldPointer !== null && board.hasPointerCapture(oldPointer)) board.releasePointerCapture(oldPointer);
  renderSelection();
}
function renderSelection() {
  tileElements.forEach((tile, cell) => tile.classList.toggle('selected', selection.includes(cell)));
  const readout=selection.length&&game?selection.map(i=>game.initial.board.letters[i]).join(''):rejectedWord;
  $('#readout-label').textContent = rejectedWord&&!selection.length?'连接未匹配':'正在连接';
  if($('#current-word').textContent!==readout)$('#current-word').textContent=readout;
  connections.replaceChildren();
  if(selection.length<2)return;
  const area=board.getBoundingClientRect(),width=board.offsetWidth,height=board.offsetHeight;
  if(!area.width||!area.height)return;
  connections.setAttribute('viewBox',`0 0 ${width} ${height}`);
  const points=selection.map(cell=>{
    const rect=tileElements[cell].getBoundingClientRect();
    return `${(rect.left+rect.width/2-area.left)/area.width*width},${(rect.top+rect.height/2-area.top)/area.height*height}`;
  });
  const polyline=document.createElementNS(SVG_NS,'polyline');
  polyline.setAttribute('points',points.join(' '));connections.append(polyline);
}
function clearWordError() {
  clearTimeout(rejectionTimer);rejectionTimer=null;rejectedWord='';
  $('#current-word').classList.remove('rejected-word');
  if(!selection.length)$('#current-word').textContent='';
  if($('#feedback').classList.contains('error'))feedback('');
}
function showWordError(path) {
  clearWordError();
  rejectedWord=path.map(cell=>game.initial.board.letters[cell]).join('');
  $('#current-word').classList.add('rejected-word');
  renderSelection();
  rejectionTimer=setTimeout(()=>{clearWordError();renderSelection();},900);
}
function renderBonusWords() {
  const words = [...(game?.bonusCompleted || [])].sort((a, b) => a.localeCompare(b));
  $('#bonus-count').textContent = String(words.length);
  $('#bonus-button').disabled = !game;
  $('#bonus-button').setAttribute('aria-label', `词袋，已收集 ${words.length} 个额外单词`);
  $('#bonus-summary').textContent = `本关额外发现 ${words.length} 个词`;
  $('#bonus-words').replaceChildren(...words.map(word => { const item = document.createElement('li'); item.textContent = word; return item; }));
  $('#bonus-empty').hidden = words.length > 0;
  $('#bonus-saved').hidden = words.length === 0;
  $('#bonus-save-label').textContent = collection.persistent ? '已自动收录至词典' : '已收录，本次记录仅保存在当前页面';
}
function closeGameDialogs() {
  for (const id of ['#bonus-dialog', '#solutions-dialog', '#dictionary-dialog', '#activity-dialog', '#weekly-dialog']) if ($(id).open) $(id).close();
  hideHelp();
}
function cancelSolutionAnalysis() {
  solutionRequest++;
  if (solutionWorker) {
    solutionWorker.terminate(); solutionWorker = null;
    if (solutionCache.get(solutionLevel)?.pending) solutionCache.delete(solutionLevel);
  }
  solutionLevel = null;
}
function startSolutionAnalysis(deepSearch = false) {
  cancelSolutionAnalysis(); solutionPage = 0;
  if (!game) return;
  const level = game.initial;
  if (solutionCache.has(level) && !deepSearch) { renderSolutionSummary(); return; }
  solutionCache.set(level, { pending:true }); renderSolutionSummary();
  const id = solutionRequest;
  let instance;
  const finish = result => {
    if (solutionWorker !== instance || id !== solutionRequest || game.initial !== level) return;
    instance.terminate(); solutionWorker = null; solutionLevel = null;
    solutionCache.set(level, result); renderSolutionSummary();
  };
  try {
    instance = new Worker(new URL('./solutions.worker.js?v=15', import.meta.url), { type:'module' });
    solutionWorker = instance; solutionLevel = level;
    instance.onmessage = ({ data }) => { if (data.requestId === id) finish(data.result); };
    instance.onerror = () => finish({ ok:false, message:'解法统计线程未能完成，请重新统计。' });
    instance.postMessage({ requestId:id, level, dictionary:game.dictionary || null,
      options:deepSearch ? { maxNodes:10_000_000, maxMilliseconds:15000, maxPathsPerWord:100_000 } : undefined });
  } catch (error) {
    cancelSolutionAnalysis(); solutionCache.set(level, { ok:false, message:'解法统计未能启动：' + error.message }); renderSolutionSummary();
  }
}
function renderSolutionSummary() {
  const result = game && solutionCache.get(game.initial);
  const label = !result ? '—' : result.pending ? '统计中…' : result.ok ? `${result.count} 种` : '未完成';
  $('#solutions-count').textContent = label;
  $('#solutions-stat').disabled = !game;
  $('#solutions-stat').setAttribute('aria-label', `本关解法，${label}，点击查看词组`);
  if ($('#solutions-dialog').open) renderSolutionDialog();
}
function renderSolutionDialog() {
  const result = game && solutionCache.get(game.initial), status = $('#solutions-status'), list = $('#solutions-list');
  list.replaceChildren(); $('#solutions-pagination').hidden = true; $('#solutions-retry').hidden = true;
  status.className = 'solutions-status'; status.hidden = false;
  $('#solutions-title').textContent = result?.ok ? `本关解法 · ${result.count} 种` : '本关解法';
  if (!result || result.pending) { status.textContent = '正在统计…'; return; }
  if (!result.ok) { status.textContent = result.message; status.classList.add('error'); $('#solutions-retry').hidden = false; return; }
  if (!result.count) { status.textContent = '未找到符合本关配置的词组。'; return; }
  status.hidden = true;
  const pages = Math.ceil(result.count / SOLUTIONS_PER_PAGE);
  solutionPage = Math.max(0, Math.min(solutionPage, pages - 1));
  const first = solutionPage * SOLUTIONS_PER_PAGE;
  for (const [index, solution] of result.solutions.slice(first, first + SOLUTIONS_PER_PAGE).entries()) {
    const item = document.createElement('li'); item.className = 'solution-item';
    const heading = document.createElement('div'); heading.className = 'solution-item-heading'; heading.textContent = `解法 ${first + index + 1}`;
    if (solution.isTargetSet) { const tag = document.createElement('span'); tag.className = 'solution-current'; tag.textContent = '当前目标'; heading.append(tag); }
    const words = document.createElement('div'); words.className = 'solution-words';
    solution.words.forEach(word => { const chip = document.createElement('span'); chip.textContent = word; words.append(chip); });
    item.append(heading, words); list.append(item);
  }
  $('#solutions-pagination').hidden = pages <= 1;
  $('#solutions-page').textContent = `${solutionPage + 1} / ${pages}`;
  $('#solutions-prev').disabled = solutionPage === 0; $('#solutions-next').disabled = solutionPage === pages - 1;
}
function renderDebug() {
  if (!game) return;
  $('#debug-targets').replaceChildren();
  game.report.targets.forEach((target, index) => {
    const tr = document.createElement('tr');
    [target.word, target.pathCount, target.setCount, `{${target.consumption.join(',')}}`, game.initial.targets[index].path.join(' → ')].forEach(value => {
      const td = document.createElement('td'); td.textContent = String(value); tr.append(td);
    });
    $('#debug-targets').append(tr);
  });
  const counts = $('#debug-counts'); counts.replaceChildren();
  for (const [label, values] of [['格子编号', game.counts.map((_, i) => i)], ['初始次数', game.initial.board.counts], ['独立反算', game.report.demand], ['剩余次数', game.counts]]) {
    const row = document.createElement('div'); row.textContent = `${label}：${values.join(' · ')}`; counts.append(row);
  }
  $('#debug-checks').replaceChildren();
  game.report.checks.forEach(check => { const item = document.createElement('span'); item.textContent = `${check.pass ? '✓' : '×'} ${check.name}：${check.detail}`; if (!check.pass) item.className = 'failed'; $('#debug-checks').append(item); });
  $('#debug-generation').textContent = generationStats ? JSON.stringify(generationStats, null, 2) : '尚未进行自动生成。';
  $('#debug-rejection').hidden = !lastRejection && !game.debug;
  $('#debug-rejection').textContent = JSON.stringify(lastRejection || game.debug, null, 2);
  $('#version-note').textContent = game.initial.algorithm === 1
    ? 'WT 1.4.0 · ' + WT_RUNTIME + ' · 从左下角起按行编号；多路径并集计数、帘子、剩余路径保护与清盘判胜。网页重建，不运行APK。'
    : '算法2 · ' + GENERATOR_VERSION + ' · 词库 ' + game.dictionary.version + ' · ' + normalizeDictionary(game.dictionary).length + ' 个候选词。';
}
function render(consumed = []) {
  if (!game) return;
  tileElements.forEach((tile, cell) => {
    const count = game.counts[cell],blocked=game.blockedCells?.includes(cell)===true;
    tile.classList.toggle('curtain-locked',blocked);tile.dataset.unlock=blocked?String(game.model.gates[cell]):'';
    tile.querySelector('.tile-letter').textContent = blocked?'':count ? game.initial.board.letters[cell] : '·';
    const pips = tile.querySelector('.tile-pips');
    pips.classList.add('count-badge'); pips.textContent = String(count); pips.hidden = count === 0||blocked;
    tile.dataset.remaining = String(count);
    tile.classList.toggle('many-uses', count > 3);
    tile.classList.toggle('empty', count === 0);
    tile.classList.toggle('consumed', consumed.includes(cell));
    tile.setAttribute('aria-disabled', String(blocked||count === 0 || game.status !== 'playing' || (playtestLab&&!playtestLab.canPlay)));
    tile.setAttribute('aria-label',blocked?`格子 ${cell}，帘子锁定，累计找到 ${game.model.gates[cell]} 个目标词后开启`:count ? `格子 ${cell}，字母 ${game.initial.board.letters[cell]}，剩余 ${count} 次` : `格子 ${cell}，空位`);
  });
  if(targetElementsSession!==game){
    levelEntrance.cancel();targetEffects.cancel();targetShatter.cancel();$('#targets').replaceChildren();targetElementsSession=game;
  }
  encouragement.sync(game);
  const targetNodes=new Map([...$('#targets').querySelectorAll('.target')].map(item=>[item.dataset.word,item]));
  const pending=game.initial.targets.filter(target=>!game.completed.has(target.word));
  [...game.initial.targets].sort((a,b)=>[...a.word].length-[...b.word].length).forEach(target => {
    const done = game.completed.has(target.word);
    let item=targetNodes.get(target.word);
    if(!item){
      item=document.createElement('div');item.className='target';item.dataset.word=target.word;
      const slots=document.createElement('div');slots.className='target-slots';slots.setAttribute('aria-hidden','true');
      [...target.word].forEach((letter,index)=>{
        const slot=document.createElement('span');slot.className='target-letter';slot.dataset.position=String(index);slot.style.setProperty('--target-index',String(index));
        const glyph=document.createElement('span');glyph.className='target-glyph';slot.append(glyph);slots.append(slot);
      });
      item.append(slots);$('#targets').append(item);targetNodes.set(target.word,item);
    }
    item.classList.toggle('completed',done);
    item.classList.toggle('target-last',game.status==='playing'&&pending.length===1&&!done);
    item.setAttribute('aria-label',targetLabel(target.word,done));
    [...target.word].forEach((letter,index)=>{
      const slot=item.querySelectorAll('.target-letter')[index],revealed=!done&&visibleHint(target.word,index);
      slot.classList.toggle('revealed',revealed);slot.classList.remove('hint-flash');
      slot.querySelector('.target-glyph').textContent=done||revealed?letter:'';
    });
  });
  targetEffects.sync(game,targetNodes);
  syncCompletionEffect();
  $('#completion').replaceChildren(document.createTextNode(`${game.completed.size} `));
  const tail = document.createElement('span'); tail.textContent = `/ ${game.initial.targets.length}`; $('#completion').append(tail);
  $('#targets').setAttribute('aria-label', `共 ${game.initial.targets.length} 个目标词`);
  $('#board-size').textContent = `${game.initial.board.cols} × ${game.initial.board.rows} 棋盘`;
  $('#win-summary').textContent = game.victoryReason==='empty-grid'?`清盘通关，已收集 ${game.completed.size}/${game.initial.targets.length} 个目标。`:`${game.initial.targets.length} 个目标全部完成。`;
  $('.play-panel').classList.toggle('dense-targets', game.initial.targets.length > 6);
  $('.play-panel').classList.toggle('long-words', game.initial.targets.some(t => t.word.length > 8));
  $('#remaining').textContent = `剩余次数 ${game.total}`;
  const hiddenLetters=playerHints().remaining(game.completed);$('#hint-remaining').textContent=String(hiddenLetters);
  updateLobbyProgress();
  $('#win-banner').hidden = true;
  $('.play-panel').classList.toggle('has-won', game.status === 'won');
  const propsLocked=game.status!=='playing'||(playtestLab&&!playtestLab.canPlay);
  $('#hint').disabled=propsLocked||hiddenLetters===0;
  $('#validation-badge').textContent = game.status === 'anomaly' ? '关卡状态异常' : game.initial.algorithm === 1 ? 'WT原包规则 · '+game.blockedCells.length+'格待开帘' : `${game.report.stateChecks} / ${game.report.stateCount} 通过`;
  if (game.status === 'anomaly') { feedback('关卡状态异常，请查看调试信息。', 'error'); console.error('WordTiles invariant violation', game.debug); }
  renderSelection(); renderBonusWords(); renderAnswerPreview(); renderDebug(); scheduleFit(); setBusy(busy, busyKind);
  levelEntrance.play(game,{targets:$('#targets'),tiles:tileElements,panel:$('.play-panel'),locks:[board,$('#hint')]});
  playtestLab?.gameUpdated();
}
function setBusy(value, kind = null) {
  busy = value; busyKind = value ? kind : null;
  playtestLab?.setQualityBusy(value||!!playtestLab?.bulkRunning);
  const isSource = selectedAlgorithm === 1, validPosition = validSourcePosition();
  for (const id of ['#generate','#generate-seed']) $(id).disabled = value || !ready || isSource || !editorValid || playtestLab?.bulkRunning;
  for (const id of ['#source-load','#source-random']) $(id).disabled = value || !ready || !sourceLimit() || (id === '#source-load' && !validPosition);
  $('#source-prev').disabled = value || !ready || !validPosition || Number($('#source-number').value) <= 1;
  $('#source-next').disabled = value || !ready || !validPosition || Number($('#source-number').value) >= sourceLimit();
  const source = game?.initial.source;
  const gameInfo = catalogue?.languages.find(item => item.language === source?.language);
  const gameLimit = gameInfo?.lists.find(list=>list.key===originalOrder(source.order))?.count||sourceLimit();
  const lastSource = isSource && source?.position >= gameLimit;
  $('#win-next').disabled = value || !ready || (isSource ? lastSource : !editorValid);
  $('#win-next').textContent = lastSource ? '最后一关' : '下一关 ↗';
  $('#cancel-generation').hidden = !value || kind !== 'generate';
  $('#generate-label').textContent = value && kind === 'generate' ? '正在生成…' : '生成并试玩';
  for (const id of ['#options-menu','#file-action','#source-number']) $(id).disabled = !ready;
}
function cancelGeneration(silent = false) {
  requestId++;
  if (worker) { worker.finishRequest?.(false); worker.terminate(); worker = null; }
  const wasBusy = busy, previousKind = busyKind; setBusy(false);
  if (wasBusy && previousKind === 'generate') generationStats = { ...generationStats, result:'cancelled', code:'CANCELLED' };
  if (wasBusy && !silent) {
    notice(previousKind === 'source' ? '载入已取消，当前关卡保留。' : '生成已取消，当前关卡保留。'); renderDebug();
  }
}
function loadLevel(level, kind, { syncDraft = true, dismissEditor = true, dictionaryOverride = dictionary } = {}) {
  let next;
  try { next=createPlaySession(level,dictionaryOverride); }
  catch (error) {
    lastRejection = error.report || { message:error.message };
    notice('关卡未通过校验，当前关卡保留。详见调试面板。','error'); renderDebug(); return false;
  }
  cancelGeneration(true); cancelSolutionAnalysis(); closeGameDialogs(); clearSelection();
  const nextMode = next.initial.algorithm === 1 ? 1 : 2;
  if (nextMode !== selectedAlgorithm) { rememberSession(); selectedAlgorithm = nextMode; showMode(); }
  playtestLab?.gameChanging();
  epoch++; game = next; lastRejection = null;compositionError='';
  buildBoard(next.initial.board.rows,next.initial.board.cols);
  if (syncDraft) syncEditor(next.initial); else updateEditor();
  updateDictionaryUI();
  applyLevelInfo(kind);
  feedback('');
  notice(nextMode === 1 ? 'WT 1.4.0 原包关卡已载入：按累计收词开帘，支持合法替代路径。' : '完整校验通过：' + game.report.stateCount + ' 种完成状态均可继续找词。','success');
  render(); playtestLab?.gameChanged(); closeSettings(false); if (dismissEditor) closeEditor(); return true;
}
async function loadSource({ language = $('#source-language').value, order = $('#source-order').value, position = Number($('#source-number').value), dismissEditor = true } = {}) {
  const request=++sourceLoadRequest;cancelGeneration(true);setBusy(true,'source');
  try{
    if(language!=='english')throw Error('本次接入的是英文原包关卡');
    catalogue=await wtSourceCatalogue();
    const wanted=originalOrder(order||catalogue.defaultOrder),select=$('#source-order');
    if(!select.dataset.originalLists){select.replaceChildren(...catalogue.languages[0].lists.map(list=>{const option=document.createElement('option');option.value=list.key;option.textContent=`${list.label}（${list.count}关）`;return option;}));select.dataset.originalLists='true';}
    const level=await wtSourceLevel(position,wanted);
    if(request!==sourceLoadRequest||dataResetting)return false;
    return loadLevel(level,'WT 1.4.0 英文原包',{dismissEditor});
  }catch(error){if(request===sourceLoadRequest){
    notice('原包载入失败：'+error.message,'error');
    if(game?.initial.algorithm===1)syncSourceControls(game.initial);
    $('#source-library-status').textContent='载入失败：'+error.message+'。当前棋盘保留。';
  }return false;}
  finally{if(request===sourceLoadRequest)setBusy(false);}
}
async function advanceSource() {
  if (game?.initial.algorithm !== 1) return;
  syncSourceControls(game.initial);
  const position = Number($('#source-number').value);
  if (position < sourceLimit()) {
    $('#source-number').value = String(position+1); updateSourceRange(); return loadSource({dismissEditor:false});
  }
}
for (const id of ['#source-language','#source-order']) $(id).addEventListener('change', () => {
  $('#source-number').value = '1'; updateSourceRange(); loadSource({ dismissEditor: false });
});
$('#source-number').addEventListener('input', () => { cancelGeneration(true); updateEditor(); });
$('#source-number').addEventListener('keydown', event => { if (event.key === 'Enter') loadSource(); });
$('#source-load').addEventListener('click', () => loadSource());
for (const [id,step] of [['#source-prev',-1],['#source-next',1]]) $(id).addEventListener('click', () => {
  $('#source-number').value = String(Number($('#source-number').value)+step); updateSourceRange(); loadSource();
});
$('#source-random').addEventListener('click', () => {
  $('#source-number').value = String(1 + crypto.getRandomValues(new Uint32Array(1))[0] % sourceLimit()); updateSourceRange(); loadSource();
});

function addCell(cell) {
  if (levelEntrance.isRunning(game)||(playtestLab&&!playtestLab.canPlay)) return;
  if (!game || game.status !== 'playing' || !(game.playableCounts||game.counts)[cell]) return;
  if(!selection.length)encouragement.dismissStreak();
  clearWordError();
  if (selection.length > 1 && selection.at(-2) === cell) selection.pop();
  else if (!selection.includes(cell) && (!selection.length || game.neighbors[selection.at(-1)].includes(cell))) selection.push(cell);
  renderSelection();
}
function commitSelection() {
  if (!selection.length || !game || (playtestLab&&!playtestLab.canPlay)) return;
  const path = [...selection]; clearSelection();
  const result = game.submit(path);
  encouragement.record(game,result);
  playtestLab?.recordSubmit(path,result);
  if(collection.collect(result,game.initial.source?.language||'english',game.initial.algorithm===1?'wt-package':game.dictionary?.metadata?.origin)) renderCollection();
  render(result.accepted ? path : []);
  if (result.accepted && result.status === 'won') feedback(result.victoryReason==='empty-grid'?'棋盘次数已耗尽，触发清盘兜底。':'全部目标完成。', 'success');
  else if (result.accepted && result.status !== 'anomaly') feedback(`找到了 ${result.word}！继续找下一个。`, 'success');
  else if (result.reason === 'already-completed') feedback(`${result.word} 已经找过了，次数保持不变。`);
  else if (result.reason === 'extra-word') feedback(result.isNew ? `额外词 ${result.word} 已记录，次数保持不变。` : `额外词 ${result.word} 已经记过，次数保持不变。`, 'success');
  else if (result.reason === 'not-target') { showWordError(path); feedback(`${result.word} 不在本关词库中，次数保持不变。`, 'error'); }
  else if (result.reason !== 'anomaly') { showWordError(path); feedback(result.message || '这次连接无效，次数保持不变。', 'error'); }
  if (result.reason === 'extra-word' && result.isNew) {
    const button = $('#bonus-button'); button.classList.remove('collected'); void button.offsetWidth; button.classList.add('collected');
  }
}
function tileAt(event) {
  const tile = document.elementFromPoint(event.clientX, event.clientY)?.closest('[data-cell]');
  return tile && board.contains(tile) ? Number(tile.dataset.cell) : null;
}
board.addEventListener('pointerdown', event => {
  if (!event.isPrimary || event.button !== 0 || !game || game.status !== 'playing') return;
  const cell = tileAt(event);
  if (cell === null || !(game.playableCounts||game.counts)[cell] || activePointer !== null) return;
  event.preventDefault(); clearSelection(); activePointer = event.pointerId;
  board.setPointerCapture(event.pointerId); addCell(cell); tileElements[cell].focus({ preventScroll: true });
});
board.addEventListener('pointermove', event => {
  if (event.pointerId !== activePointer) return;
  event.preventDefault(); const cell = tileAt(event); if (cell !== null) addCell(cell);
});
board.addEventListener('pointerup', event => {
  if (event.pointerId !== activePointer) return;
  event.preventDefault(); activePointer = null;
  if (board.hasPointerCapture(event.pointerId)) board.releasePointerCapture(event.pointerId);
  commitSelection();
});
for (const eventName of ['pointercancel', 'lostpointercapture']) board.addEventListener(eventName, event => {
  if (event.pointerId === activePointer) { clearSelection(); feedback('连接已取消，次数保持不变。'); }
});
window.addEventListener('blur', () => { if (selection.length) clearSelection(); });
board.addEventListener('keydown', event => {
  if (!game) return;
  const tile = event.target.closest('[data-cell]'); if (!tile) return;
  const cell = Number(tile.dataset.cell);
  const columns = game.initial.board.cols;
  const up = game.initial.algorithm === 1 ? columns : -columns;
  const delta = { ArrowUp: up, ArrowDown: -up, ArrowLeft: -1, ArrowRight: 1 }[event.key];
  if (delta) {
    event.preventDefault(); const next = cell + delta;
    if (game.neighbors[cell].includes(next)) tileElements[next].focus({ preventScroll: true });
  } else if (event.key === ' ') { event.preventDefault(); addCell(cell); }
  else if (event.key === 'Enter') { event.preventDefault(); if (activePointer === null) commitSelection(); }
  else if (event.key === 'Backspace') { event.preventDefault(); selection.pop(); renderSelection(); }
  else if (event.key === 'Escape') { event.preventDefault(); clearSelection();render(); }
});
new ResizeObserver(() => renderSelection()).observe(board);

function readBudget() {
  const budget = { maxNodesPerAttempt: Number($('#budget-attempt').value), maxAttempts: Number($('#budget-tries').value), maxTotalNodes: Number($('#budget-total').value) };
  const limits = { maxNodesPerAttempt: 1000000, maxAttempts: 1000, maxTotalNodes: 10000000 };
  for (const [key, value] of Object.entries(budget)) if (!Number.isInteger(value) || value < 1 || value > limits[key]) throw new Error('搜索预算必须为输入框范围内的正整数。');
  return budget;
}
function generate(seed) {
  if (!dictionary || selectedAlgorithm !== 2) return false;
  try{draftLengths=compositionLengths(()=>randomSeed()/4294967296);compositionError='';$('#generation-lengths').value=draftLengths.join(',');$('#word-count').value=String(draftLengths.length);renderWordRows();webConfigDraft=readEditorConfig();}catch(error){compositionError=error.message;}
  const { report } = checkEditor();
  if (!report.valid) { updateEditor(); notice(report.errors[0].message + '。', 'error'); return false; }
  let budget,quality;
  try { budget = readBudget();quality=playtestLab?.getQualitySettings(); } catch (error) { notice(error.message, 'error'); return false; }
  const seedText = String(seed).trim();
  seed = Number(seedText);
  if (!/^\d+$/.test(seedText) || !Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) {
    notice('随机值无效，请重新生成。当前关卡保留。', 'error'); return false;
  }
  cancelGeneration(true); clearSelection();
  const id = ++requestId, initialEpoch = epoch, generationDictionary = dictionary;
  const instance = new Worker(new URL('./generator.worker.js?v=39', import.meta.url), { type: 'module' });
  const finished=new Promise(resolve=>{instance.finishRequest=resolve;});
  worker = instance; setBusy(true, 'generate'); $('#seed').value = String(seed);
  generationStats = { seed, config: budget, dictionaryVersion: dictionary.version, result: 'searching' }; renderDebug();
  notice('正在搜索合格关卡，当前关卡仍可试玩。');
  instance.onmessage = ({ data }) => {
    if (worker !== instance || data.requestId !== id || epoch !== initialEpoch) return;
    if(data.type==='quality-progress'){generationStats={...generationStats,qualityCandidates:data.stats.requests};notice(`质量候选 ${data.stats.requests}，已通过硬性校验 ${data.stats.hardCandidates} 个。`);return;}
    if (data.type === 'progress') {
      generationStats = { ...generationStats, ...data.stats };
      notice(`搜索中：尝试 ${data.stats.attempts}/${budget.maxAttempts}，已展开 ${data.stats.nodes} 个节点。`); renderDebug(); return;
    }
    instance.terminate(); worker = null; setBusy(false);
    if (data.type === 'error') {
      generationStats = { ...generationStats, result: 'worker-error', message: data.message };
      notice(`生成器错误：${data.message}。当前关卡保留。`, 'error'); renderDebug(); instance.finishRequest(false); return;
    }
    const result = data.result;
    playtestLab?.qualityGenerated(result,generationDictionary);
    generationStats = { seed, config: budget, ...result.stats, result: result.ok ? 'success' : result.code,
      code: result.ok ? undefined : result.code, message: result.ok ? undefined : result.message,
      dictionaryReport: result.dictionaryReport, validation: result.validation };
    if (result.ok) {
      const loaded=loadLevel(result.level, '自动生成', { dictionaryOverride: generationDictionary });
      if (loaded) notice(`生成成功：${result.stats.nodes} 个搜索节点；完整校验 ${game.report.stateChecks}/${game.report.stateCount} 通过。`, 'success');
      instance.finishRequest(loaded);
    } else {
      notice(`${result.message} 当前关卡和试玩进度保留。`, 'error'); renderDebug(); instance.finishRequest(false);
    }
  };
  instance.onerror = event => {
    if (worker !== instance || epoch !== initialEpoch) return;
    event.preventDefault(); cancelGeneration(true);
    generationStats = { ...generationStats, result: 'worker-error', message: event.message };
    notice('生成线程未能启动，当前关卡保留。请通过 HTTP 服务打开本 Demo。', 'error'); renderDebug();
  };
  instance.postMessage({ requestId: id, dictionary: generationDictionary, seed, config: budget,levelConfig:readEditorConfig(),engine:'flexible',composition:readComposition(),quality });
  return finished;
}
function randomSeed() { return crypto.getRandomValues(new Uint32Array(1))[0]; }
$('#generate').addEventListener('click', () => generate(randomSeed()));
$('#win-next').addEventListener('click', () => selectedAlgorithm === 1 ? advanceSource() : generate(randomSeed()));
$('#generate-seed').addEventListener('click', () => generate(randomSeed()));
$('#cancel-generation').addEventListener('click', () => cancelGeneration());
$('#load-sample').addEventListener('click', () => generate(randomSeed()));
function collectFullyRevealedTargets(revealed){
  if(!isWTLevel(game.initial))return [];
  const completed=[];
  for(const word of new Set(revealed.map(item=>item.word))){
    if([...word].every((_,index)=>playerHints().has(word,index))){
      const result=game.collectRevealedTarget(word);
      if(result.accepted){completed.push(word);if(collection.collect(result,'english','wt-package'))renderCollection();}
    }
  }
  return completed;
}
function useLetterProp(){
  if(!game||game.status!=='playing'||levelEntrance.isRunning(game)||playtestLab?.machineRunning||(playtestLab&&!playtestLab.canPlay))return;

  clearSelection();const revealed=playerHints().reveal(1,game.completed);if(!revealed.length)return;
  const completed=collectFullyRevealedTargets(revealed);
  playtestLab?.recordHint({word:revealed[0].word,kind:'letter',letters:revealed.length});render();
  for(const item of $('#targets').querySelectorAll('.target'))for(const slot of item.querySelectorAll('.target-letter'))if(revealed.some(letter=>letter.word===item.dataset.word&&letter.index===Number(slot.dataset.position)))slot.classList.add('hint-flash');
  feedback(completed.length?`已揭完并收取 ${completed.join('、')}`:`已提示 ${revealed.length} 个字母，格子次数不变`);
}
$('#hint').addEventListener('click',useLetterProp);
$('#bonus-button').addEventListener('click', () => {
  if (!game) return;
  clearSelection(); hideHelp(); renderBonusWords();
  showTravelDialog('#bonus-dialog'); $('#bonus-button').setAttribute('aria-expanded', 'true');
});
$('#bonus-close').addEventListener('click', () => $('#bonus-dialog').close());
$('#bonus-dialog').addEventListener('close', () => $('#bonus-button').setAttribute('aria-expanded', 'false'));

function positionTravelDialog(dialog) {
  const stage = $($('#lobby').hidden ? '#game-viewport' : '.lobby-panel').getBoundingClientRect();
  const viewport = window.visualViewport;
  const visibleWidth = viewport?.width || innerWidth;
  const visibleHeight = viewport?.height || innerHeight;
  const visibleLeft = viewport?.offsetLeft || 0, visibleTop = viewport?.offsetTop || 0;
  const expanded=dialog.matches('.collection-dialog,.weekly-dialog');
  const width = Math.min(stage.width * (expanded ? .94 : .86), visibleWidth - 24);
  const height = Math.min(stage.height * (expanded ? .92 : dialog.id === 'bonus-dialog' ? .65 : .82), visibleHeight - 24);
  const centerX = Math.max(visibleLeft + width / 2 + 12,
    Math.min(visibleLeft + visibleWidth - width / 2 - 12, stage.left + stage.width / 2));
  const centerY = Math.max(visibleTop + height / 2 + 12,
    Math.min(visibleTop + visibleHeight - height / 2 - 12, stage.top + stage.height / 2));
  dialog.style.setProperty('--travel-width', `${width}px`);
  dialog.style.setProperty('--travel-height', `${height}px`);
  dialog.style.setProperty('--travel-center-x', `${centerX}px`);
  dialog.style.setProperty('--travel-center-y', `${centerY}px`);
  dialog.style.setProperty('--travel-scale', String(Math.max(.8, Math.min(1.2, stage.width / 405))));
}
function positionTravelDialogs() {
  document.querySelectorAll('.travel-dialog[open]').forEach(positionTravelDialog);
}
function showTravelDialog(selector) {
  closeSettings(false); hideHelp();
  const dialog = $(selector); positionTravelDialog(dialog); dialog.showModal();
}
window.addEventListener('resize', () => requestAnimationFrame(positionTravelDialogs));
window.visualViewport?.addEventListener('resize', positionTravelDialogs);
window.visualViewport?.addEventListener('scroll', positionTravelDialogs);

function renderCollection() {
  collectionViews.render();
}
window.addEventListener('storage',event=>{
  if(event.key===DATA_RESET_KEY&&event.newValue!==initialDataEpoch){
    let phase;try{phase=JSON.parse(event.newValue)?.phase;}catch{}
    if(phase==='clearing'||phase==='complete'){prepareDataReset();if(phase==='complete')location.reload();}return;
  }
  if(dataResetting)return;
  if(event.key===COLLECTION_KEY){collection=createWordCollection(browserStorage);renderCollection();if($('#activity-dialog').open)renderActivity();}
  if(event.key===PERSONAL_PROGRESS_KEY&&$('#weekly-dialog').open)collectionViews.renderWeek();
});

function updateLobbyProgress() {
  if(!game)return;
  $('#lobby-start-label').textContent=game.completed.size?'继续游戏':'开始游戏';
  const position=game.initial.source?.editorNumber??game.initial.source?.position;
  $('#lobby-continue-detail').textContent=position?`第 ${position} 关 · ${game.initial.targets.length} 个目标`:`${game.initial.targets.length} 个目标 · 自由连词`;
  $('#lobby-progress-label').textContent=`${game.completed.size} / ${game.initial.targets.length}`;
  $('#lobby-progress-label').setAttribute('aria-label',`当前关卡已完成 ${game.completed.size} 个目标，共 ${game.initial.targets.length} 个`);
  const dots=game.initial.targets.map(target=>{
    const dot=document.createElement('span');dot.className='progress-dot'+(game.completed.has(target.word)?' active':'');return dot;
  });
  $('#lobby-progress-dots').replaceChildren(...dots);
}
function renderActivity() {
  const days=groupCollectionDays(collection.entries()),today=localCollectionDate();
  if(!collectionMonth) resetCollectionMonth();
  const total=[...days.values()].reduce((sum,words)=>sum+words.length,0);
  $('#activity-summary').textContent=`${days.size} 个收词日 · ${total} 个词`;
  $('#activity-month-title').textContent=`${collectionMonth.year} 年 ${collectionMonth.month+1} 月`;
  $('#activity-month-prev').disabled=!shiftCollectionMonth(collectionMonth,-1);
  $('#activity-month-next').disabled=!shiftCollectionMonth(collectionMonth,1);
  const cells=collectionMonthCells(collectionMonth,days).map(cell=>{
    if(!cell){const blank=document.createElement('span');blank.className='calendar-blank';blank.setAttribute('aria-hidden','true');return blank;}
    const button=document.createElement('button');button.type='button';button.className='calendar-day'+(cell.count?' has-words':'');
    button.dataset.date=cell.date;button.dataset.wordCount=String(cell.count);
    button.setAttribute('aria-pressed',String(cell.date===collectionSelectedDate));
    button.setAttribute('aria-label',`${collectionMonth.year}年${collectionMonth.month+1}月${cell.day}日，收录 ${cell.count} 个词`);
    if(cell.date===today)button.setAttribute('aria-current','date');
    const number=document.createElement('span');number.textContent=String(cell.day);button.append(number);return button;
  });
  $('#activity-calendar-grid').replaceChildren(...cells);
  $('#activity-calendar-grid').setAttribute('aria-label',`${collectionMonth.year}年${collectionMonth.month+1}月收词日期`);
  const monthGroups=collectionMonthGroups(days,collectionMonth,collectionDateFilter);
  $('#activity-history-label').textContent=collectionDateFilter?'当天收词':'本月收词';
  $('#activity-show-month').hidden=!collectionDateFilter;
  $('#activity-empty').hidden=monthGroups.length>0;
  $('#activity-empty').textContent=collectionDateFilter?'当天无记录':'本月无记录';
  const groups=monthGroups.map(([date,words])=>{
    const row=document.createElement('li'),heading=document.createElement('div'),title=document.createElement('h3'),count=document.createElement('small'),list=document.createElement('div');
    row.className='activity-day';row.dataset.date=date;heading.className='activity-day-heading';
    title.textContent=`${Number(date.slice(5,7))} 月 ${Number(date.slice(8))} 日`;count.textContent=`${words.length} 个词`;
    heading.append(title,count);list.className='activity-words';
    for(const entry of words){const word=document.createElement('span');word.textContent=entry.word;list.append(word);}
    row.append(heading,list);return row;
  });
  $('#activity-list').replaceChildren(...groups);
}
function resetCollectionMonth() {
  const now=new Date();collectionMonth={year:now.getFullYear(),month:now.getMonth()};
  collectionSelectedDate=localCollectionDate(now);collectionDateFilter=null;
}
function changeCollectionMonth(amount) {
  const next=shiftCollectionMonth(collectionMonth,amount);if(!next)return;
  collectionMonth=next;collectionSelectedDate=null;collectionDateFilter=null;renderActivity();$('.activity-history').scrollTop=0;
}
$('#activity-month-prev').addEventListener('click',()=>changeCollectionMonth(-1));
$('#activity-month-next').addEventListener('click',()=>changeCollectionMonth(1));
$('#activity-calendar-grid').addEventListener('click',event=>{
  const day=event.target.closest('.calendar-day');if(!day)return;
  collectionSelectedDate=day.dataset.date;collectionDateFilter=collectionDateFilter===day.dataset.date?null:day.dataset.date;
  renderActivity();$('.activity-history').scrollTop=0;
  $('#activity-calendar-grid').querySelector(`[data-date="${collectionSelectedDate}"]`)?.focus({preventScroll:true});
});
$('#activity-show-month').addEventListener('click',()=>{collectionDateFilter=null;renderActivity();$('.activity-history').scrollTop=0;});
$('#activity-button').addEventListener('click',()=>{resetCollectionMonth();renderActivity();showTravelDialog('#activity-dialog');$('.activity-history').scrollTop=0;});
$('#activity-close').addEventListener('click',()=>$('#activity-dialog').close());

function showLobby() {
  levelEntrance.cancel();targetEffects.cancel();targetShatter.cancel();encouragement.cancel();
  answerPreviewOpen=false;renderAnswerPreview();
  cancelGeneration(true);cancelSolutionAnalysis();closeGameDialogs();clearSelection();closeSettings(false);closeEditor();hideHelp();
  $('#game-screen').classList.remove('information-open');
  const fromEditor=$('#game-screen').dataset.mode==='editor';
  $('#game-screen').hidden=true;$('#lobby').hidden=false;renderCollection();$(fromEditor?'#lobby-editor':'#start-game').focus({preventScroll:true});
}
$('#back-lobby').addEventListener('click',showLobby);
function openGameScreen(mode) {
  if(!ready)return;
  clearSelection();closeSettings(false);closeEditor();hideHelp();
  $('#game-screen').classList.remove('information-open');
  $('#game-screen').dataset.mode=mode;
  $('#lobby').hidden=true;$('#game-screen').hidden=false;
  if(mode==='play')playtestLab?.startPlayer();
  else {playtestLab?.changeTab('edit');if(matchMedia('(max-width: 980px)').matches)document.body.classList.add('editor-open');}
  applyViewport();fitBoard();renderSelection();
  if(mode==='editor') {startSolutionAnalysis();$('.lab-tabs button')?.focus({preventScroll:true});}
  else tileElements.find(tile=>tile.dataset.remaining!=='0')?.focus({preventScroll:true});
}
$('#start-game').addEventListener('click',async()=>{
  if(!ready||$('#start-game').disabled)return;
  try{if(game?.status==='won')await playtestLab?.continueJourney();openGameScreen('play');}
  catch(error){$('#lobby-status').textContent='关卡载入失败：'+error.message;}
});
$('#lobby-editor').addEventListener('click',()=>openGameScreen('editor'));
$('#solutions-stat').addEventListener('click', () => {
  if (!game) return;
  clearSelection(); closeSettings(false); hideHelp(); solutionPage = 0;
  $('#solutions-help').dataset.help = $('#solutions-stat').dataset.help;
  renderSolutionDialog(); $('#solutions-dialog').showModal();
});
$('#solutions-close').addEventListener('click', () => $('#solutions-dialog').close());
$('#solutions-retry').addEventListener('click', () => startSolutionAnalysis(true));
$('#solutions-prev').addEventListener('click', () => { solutionPage--; renderSolutionDialog(); });
$('#solutions-next').addEventListener('click', () => { solutionPage++; renderSolutionDialog(); });
$('#solutions-help').addEventListener('click', () => showHelp($('#solutions-help')));
for (const id of ['#bonus-dialog','#solutions-dialog','#dictionary-dialog','#activity-dialog','#weekly-dialog']) {
  $(id).addEventListener('close', hideHelp);
  $(id).addEventListener('click', event => {
    const rect = event.currentTarget.getBoundingClientRect();
    if (event.target === event.currentTarget && (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom)) event.currentTarget.close();
  });
}
$('#import').addEventListener('click', () => $('#import-file').click());
$('#import-file').addEventListener('change', async event => {
  const file = event.target.files[0]; event.target.value = ''; if (!file) return;
  cancelGeneration(true); clearSelection();
  const importEpoch = epoch, importId = ++requestId;
  try {
    if (file.size > 1024 * 1024) throw new Error('JSON 文件不能超过 1 MB');
    const text = await file.text();
    if (epoch !== importEpoch || requestId !== importId) return;
    let level = JSON.parse(text);
    if(level?.schemaVersion===3||level?.algorithm===1){
      const check=validateWTLevel(level);if(!check.valid)throw new Error(check.errors[0].message);
      const bank=await wtSourceBank(),raw=level.source.original;
      if(JSON.stringify(bank.levels[String(raw.id)])!==JSON.stringify(raw))throw new Error('该关卡与随包原始配置不一致');
      if(epoch!==importEpoch||requestId!==importId)return;
      const order=originalOrder(level.source.order||'all'),ids=bank.orders[order];
      if(!ids)throw new Error('找不到原包关卡列表');
      return await loadSource({order,position:ids.indexOf(raw.id)+1});
    }
    if(dictionaryLoading||!dictionary)throw new Error('当前 WT词库.xlsx 不可用');
    if(isV1Level(level)&&!level.source?.dictionaryOrigin&&dictionary?.metadata?.origin)level=migrateLegacyLevel(level,dictionary);
    const report=validateAlgorithmLevel(level,dictionary);
    if (!report.valid) {
      lastRejection = report;
      notice(`导入被拒绝：${report.errors[0].message}。当前关卡保留。`, 'error'); renderDebug(); return;
    }
    loadLevel(level, 'JSON 导入');
  } catch (error) {
    if (epoch !== importEpoch || requestId !== importId) return;
    lastRejection = { message: error.message }; notice(`导入失败：${error.message}。当前关卡保留。`, 'error'); renderDebug();
  }
});
$('#export').addEventListener('click', () => {
  if (!game) return;
  const json = JSON.stringify(clone(game.exportInitial || game.initial), null, 2) + '\n';
  const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
  const link = document.createElement('a'); link.href = url;
  link.download = `wordtiles-${String(game.initial.seed ?? 'level').replace(/[^a-zA-Z0-9_-]/g, '_')}.json`;
  link.click(); URL.revokeObjectURL(url); notice('已导出本关初始数据；重载后从完整棋盘开始。', 'success');
});
function closeEditor() {
  document.body.classList.remove('editor-open'); $('#editor-toggle').setAttribute('aria-expanded', 'false'); hideHelp();
}
function closeSettings(restoreFocus = true) {
  const wasOpen = !$('#settings-popover').hidden;
  $('#settings-popover').hidden = true; $('#options-menu').value = ''; hideHelp();
  if (wasOpen && restoreFocus) settingsAnchor.focus({ preventScroll: true });
}
let settingsAnchor=$('#options-menu');
function positionSettings() {
  const panel = $('#settings-popover'); if (panel.hidden) return;
  const anchor = settingsAnchor.getBoundingClientRect(), rect = panel.getBoundingClientRect();
  const left = Math.max(8, Math.min(window.innerWidth - rect.width - 8, anchor.right + 12));
  const top = Math.max(8, Math.min(window.innerHeight - rect.height - 8, anchor.top));
  panel.style.left = `${left}px`; panel.style.top = `${top}px`;
}
$('#options-menu').addEventListener('change', () => {
  const value = $('#options-menu').value; if (!value) { closeSettings(); return; }
  clearSelection(); hideHelp();
  document.querySelectorAll('[data-settings-pane]').forEach(pane => { pane.hidden = pane.dataset.settingsPane !== value; });
  const panel = $('#settings-popover'); panel.dataset.pane = value;
  settingsAnchor=$('#options-menu');
  $('#settings-title').textContent = $('#options-menu').selectedOptions[0].textContent;
  panel.hidden = false; positionSettings(); panel.focus({ preventScroll: true });
});
$('#lobby-settings').addEventListener('click',()=>{
  clearSelection();hideHelp();settingsAnchor=$('#lobby-settings');
  document.querySelectorAll('[data-settings-pane]').forEach(pane=>{pane.hidden=pane.dataset.settingsPane!=='view';});
  $('#settings-title').textContent='设置';const panel=$('#settings-popover');panel.dataset.pane='view';panel.hidden=false;positionSettings();panel.focus({preventScroll:true});
});
async function fillPreviewCollection(){
  const {topUpPreviewCollection}=await import('./core/collection-preview.js?v=26');if(dataResetting)return null;
  const result=topUpPreviewCollection(collection,300);
  if(result.added)try{browserStorage.setItem(PREVIEW_COLLECTION_KEY,JSON.stringify({addedAt:new Date().toISOString(),count:result.added,total:result.total,words:result.words}));}catch{}
  renderCollection();return result;
}
$('#preview-collection').addEventListener('click',async()=>{
  if(dataResetting)return;
  $('#preview-collection').disabled=true;$('#data-status').textContent='正在收录…';
  try{
    const result=await fillPreviewCollection();if(!result)return;
    $('#data-status').textContent=`已收录 ${result.total} 词`;closeSettings(false);$('#dictionary-button').click();
  }catch(error){$('#data-status').textContent=error.message;}
  finally{if(!dataResetting)$('#preview-collection').disabled=false;}
});
function prepareDataReset(){
  levelEntrance.cancel();targetEffects.cancel();targetShatter.cancel();encouragement.cancel();
  if(dataResetting)return;dataResetting=true;ready=false;
  cancelGeneration(true);cancelSolutionAnalysis();playtestLab?.prepareDataReset();eventViews.prepareDataReset();
  $('#preview-collection').disabled=true;$('#clear-all-data').disabled=true;$('#data-status').textContent='正在清除…';
}
$('#clear-all-data').addEventListener('click',async()=>{
  prepareDataReset();let session;try{session=window.sessionStorage;}catch{}
  try{await clearAppData({local:browserStorage,session});try{session?.setItem(DATA_NOTICE_KEY,'已清除所有数据');}catch{}location.reload();}
  catch(error){$('#data-status').textContent='清除未完成，请重试。'+error.message;$('#clear-all-data').disabled=false;}
});
$('#settings-close').addEventListener('click', () => closeSettings());
$('#editor-toggle').addEventListener('click', () => {
  const open = !document.body.classList.contains('editor-open'); clearSelection(); closeSettings(false); hideHelp();
  document.body.classList.toggle('editor-open', open); $('#editor-toggle').setAttribute('aria-expanded', String(open));
  if (open) $('#algorithm').focus({ preventScroll: true });
});
$('#editor-close').addEventListener('click', () => { closeSettings(false); closeEditor(); $('#editor-toggle').focus({ preventScroll: true }); });
$('#file-action').addEventListener('change', () => {
  const value = $('#file-action').value; $('#file-action').value = ''; closeSettings(false); hideHelp();
  if (value) $(value === 'sample' ? '#load-sample' : '#' + value).click();
});
document.addEventListener('pointerdown', event => {
  if (event.target.closest('dialog[open]')) return;
  if (!$('#settings-popover').hidden && !event.target.closest('#settings-popover,#options-menu,#lobby-settings')) closeSettings(false);
  if (document.body.classList.contains('editor-open') && !event.target.closest('#editor-panel,#editor-toggle,#settings-popover')) closeEditor();
  if (!event.target.closest('[data-help],[data-help-from]')) hideHelp();
});
document.addEventListener('keydown', event => {
  if (event.key !== 'Escape') return;
  if ($('#bonus-dialog').open || $('#solutions-dialog').open || $('#dictionary-dialog').open || $('#activity-dialog').open || $('#weekly-dialog').open) { hideHelp(); return; }
  if (!$('#settings-popover').hidden) { closeSettings(); event.preventDefault(); }
  else if (document.body.classList.contains('editor-open')) { closeEditor(); $('#editor-toggle').focus({ preventScroll: true }); }
  hideHelp();
});
let helpAnchor = null;
function hideHelp() {
  if (helpAnchor) helpAnchor.removeAttribute('aria-describedby');
  helpAnchor = null; $('#hover-help').hidden = true;
}
function showHelp(anchor) {
  const message = anchor.dataset.helpFrom ? document.getElementById(anchor.dataset.helpFrom)?.textContent : anchor.dataset.help;
  if (!message) return;
  hideHelp(); const tooltip = $('#hover-help'); tooltip.textContent = message; tooltip.hidden = false;
  const scope = anchor.closest('dialog[open]') || document.body;
  if (tooltip.parentElement !== scope) scope.append(tooltip);
  helpAnchor = anchor; anchor.setAttribute('aria-describedby', 'hover-help');
  const rect = anchor.getBoundingClientRect(), box = tooltip.getBoundingClientRect();
  tooltip.style.left = `${Math.max(8, Math.min(window.innerWidth - box.width - 8, rect.left + rect.width / 2 - box.width / 2))}px`;
  tooltip.style.top = `${Math.max(8, Math.min(window.innerHeight - box.height - 8, rect.bottom + box.height + 8 <= window.innerHeight ? rect.bottom + 8 : rect.top - box.height - 8))}px`;
}
document.addEventListener('pointerover', event => {
  if (event.pointerType === 'touch') return;
  const anchor = event.target.closest('[data-help],[data-help-from]'); if (anchor && anchor !== helpAnchor) showHelp(anchor);
});
document.addEventListener('pointerout', event => { if (helpAnchor && !helpAnchor.contains(event.relatedTarget)) hideHelp(); });
document.addEventListener('focusin', event => { const anchor = event.target.closest('[data-help],[data-help-from]'); if (anchor) showHelp(anchor); else hideHelp(); });
document.addEventListener('focusout', hideHelp);
for (const id of ['#rules-button','#editor-status','#extra-word-stat','#reverse-word-stat','#tile-usage-heading','#tile-use-stat-2','#tile-use-stat-3','#tile-use-stat-4','#tile-use-stat-5','#straight-word-stat','#one-turn-word-stat','#multi-turn-word-stat']) $(id).addEventListener('click', () => showHelp($(id)));
window.addEventListener('resize', () => { positionSettings(); hideHelp(); });
for (let value = 1; value <= 18; value++) {
  const option = document.createElement('option'); option.value = String(value); option.textContent = `${value} 个`; $('#word-count').append(option);
}
$('#word-count').value = '3';
window.addEventListener('pagehide', () => { levelEntrance.cancel();targetEffects.cancel();targetShatter.cancel();encouragement.cancel();cancelGeneration(true); cancelSolutionAnalysis(); });
document.addEventListener('visibilitychange',()=>{if(document.hidden){levelEntrance.cancel();targetEffects.cancel();targetShatter.cancel();encouragement.cancel();}else if($('#lobby').hidden){scheduleFit();syncCompletionEffect();playtestLab?.gameUpdated();}});
playtestLab = mountPlaytestLab({getGame:()=>game,clearSelection,render,showLobby,isTargetAnimationRunning:()=>levelEntrance.isRunning(game)||targetEffects.isRunning(game)||encouragement.isRunning(game)||targetShatter.isRunning(game),
  recordPersonalProgress:(session,snapshot,flush=false)=>{personalProgress.observe(session,snapshot);eventViews.observe(session,snapshot);if(flush)personalProgress.flush();},
  resetCurrent:()=>{if(game)loadLevel(game.exportInitial||game.initial,$('#level-kind').textContent,{syncDraft:false,dismissEditor:false,dictionaryOverride:game.dictionary});},
  getDictionary:()=>dictionary,
  generationSettings:()=>({dictionary,budget:readBudget(),config:selectedAlgorithm===2?readEditorConfig():clone(webConfigDraft),engine:'flexible',composition:readComposition(),quality:playtestLab?.getQualitySettings(),qualityTemplate:qualityFixedTemplate}),
  applyQualityTemplate:()=>{qualityFixedTemplate=true;webConfigDraft=clone(QUALITY_TEMPLATE);$('#board-cols').value='3';$('#board-rows').value='3';$('#generation-target-count').value='5';$('#generation-three-percent').value='60';$('#generation-four-percent').value='20';editorChanged();$('#composition-note').textContent='V3 固定词长：3、3、3、4、5；手改宽高、词数或比例后退出固定模板。';},
  refreshGenerationControls:showMode,
  changeGenerationDictionary:refreshDictionary,
  checkGenerationConfig:(config,input)=>{const check=checkConfiguration(config,input);if(!check.valid)throw new Error(check.errors.map(e=>e.message).join('；'));},
  collectWord:(result,language,origin)=>{if(collection.collect(result,language,origin))renderCollection();},
  loadWeb:entry=>{dictionary=entry.dictionary;$('#generation-engine').value='flexible';$('#dictionary-source').value=WORD_BANK_ORIGIN;$('#dictionary-tier').value='all';return loadLevel(entry.level,'WT词库生成关卡',{dictionaryOverride:entry.dictionary,dismissEditor:false});},
  useGenerated:async()=>selectedAlgorithm===1?switchAlgorithm(2):generate(randomSeed()),
  useWordTiles:async(position,order,language)=>loadSource({position,order,language,dismissEditor:false}),
  nextWordTiles:advanceSource});
for(const id of ['#generation-target-count','#generation-three-percent','#generation-four-percent'])$(id).addEventListener('input',editorChanged);
showMode(); renderWordRows(); updateEditor(); applyViewport();
for (const id of ['#algorithm','#source-language','#source-order','#generate','#generate-seed','#hint','#load-sample','#import','#export']) $(id).disabled = true;
try {
  await Promise.all([preloadArt(),preloadPlayerArt(),backgroundThemes.ready]);
  dictionary=createBankDictionary(bankLengthRange(WORD_BANK_ORIGIN),WORD_BANK_ORIGIN);baseDictionary=dictionary;editorChanged();
  ready = true;
  for (const id of ['#algorithm','#source-language','#source-order','#load-sample','#import','#export']) $(id).disabled = false;
  const startup=new URL(location.href).searchParams;
  if(startup.get('source')==='wordtiles'){
    if(!await loadSource({order:startup.get('list')||'level_list_0',position:Number(startup.get('level')||1),dismissEditor:false}))throw new Error('原包关卡加载失败');
  }else if(!await generate(randomSeed()))throw new Error('随机关卡生成失败，请刷新重试');
  renderCollection();let previewResult=null,previewError='';
  if(previewAtOpen)try{previewResult=await fillPreviewCollection();}catch(error){previewError=error.message;}
  $('#start-game').disabled=false;
  $('#lobby-editor').disabled=false;
  let dataNotice='';try{dataNotice=sessionStorage.getItem(DATA_NOTICE_KEY)||'';sessionStorage.removeItem(DATA_NOTICE_KEY);}catch{}
  $('#lobby-status').textContent=dataNotice||previewError||(previewResult?`已收录 ${previewResult.total} 词`:'');
  if(previewResult)$('#dictionary-button').click();
} catch (error) {
  $('#lobby-status').textContent='加载失败，请刷新后重试。';
  notice('启动失败：' + error.message + '。请通过 HTTP 服务运行。','error');
  feedback('本地关卡文件未能加载。','error');
}
