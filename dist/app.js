import { DEFAULT_CONFIG, LIMITS, checkConfiguration, configForLevel, normalizeDictionary, clone } from './core/rules.js';
import { SourceGameSession, convertSourceLevel, validateSourceLevel, LANGUAGE_NAMES, SOURCE_VERSION } from './core/source-levels.js';
import { createAlgorithmSession, validateAlgorithmLevel } from './core/algorithm-v1-adapter.js';
import { GENERATOR_VERSION } from './core/wordtiles-algorithm.js';
const $ = selector => document.querySelector(selector);
const board = $('#board');
let dictionary, sample, game, catalogue;
let selectedAlgorithm = 1, ready = false, busyKind = null;
const banks = new Map(), savedSessions = new Map();
let selection = [], hint = null, activePointer = null, worker = null, busy = false;
let epoch = 0, requestId = 0, generationStats = null, lastRejection = null;
const tileElements = [];
let draftLengths = [...DEFAULT_CONFIG.wordLengths], editorValid = false;
const SVG_NS = 'http://www.w3.org/2000/svg';
const connections = document.createElementNS(SVG_NS, 'svg');
connections.classList.add('connections');
connections.setAttribute('viewBox', '0 0 1000 1000');
connections.setAttribute('preserveAspectRatio', 'none');
connections.setAttribute('aria-hidden', 'true');
function buildBoard(rows, cols) {
  tileElements.length = 0; board.replaceChildren();
  const dimension = Math.max(rows, cols);
  board.style.setProperty('--cols', String(cols));
  board.style.setProperty('--tile-gap', dimension >= 5 ? '6px' : '9px');
  board.style.setProperty('--tile-font', `${dimension >= 5 ? 24 : dimension === 4 ? 32 : 40}px`);
  board.setAttribute('aria-label', `${rows} 行 ${cols} 列字母棋盘`);
  for (let cell = 0; cell < rows * cols; cell++) {
    const tile = document.createElement('button');
    tile.type = 'button'; tile.className = 'tile'; tile.dataset.cell = String(cell);
    const letter = document.createElement('span'); letter.className = 'tile-letter';
    const pips = document.createElement('span'); pips.className = 'tile-pips'; pips.setAttribute('aria-hidden', 'true');
    const hintNumber = document.createElement('span'); hintNumber.className = 'hint-number'; hintNumber.hidden = true; hintNumber.setAttribute('aria-hidden', 'true');
    tile.append(letter, pips, hintNumber); board.append(tile); tileElements.push(tile);
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
  syncUniformLength();
}
function syncUniformLength() {
  $('#uniform-length').value = draftLengths.every(n => n === draftLengths[0]) ? String(draftLengths[0]) : '';
}
function readEditorConfig() {
  return selectedAlgorithm === 2 ? clone(DEFAULT_CONFIG) :
    { rows: Number($('#board-rows').value), cols: Number($('#board-cols').value), wordLengths: [...draftLengths] };
}
function checkEditor() {
  const config = readEditorConfig();
  if (selectedAlgorithm === 1) {
    const valid = game?.initial.algorithm === 1;
    return { config, report: { valid, errors: valid ? [] : [{ message:'请选择并载入原包关卡' }], stateCount:game?.report.stateCount || 0 } };
  }
  const report = checkConfiguration(config, dictionary);
  return { config, report };
}
function sourceInfo() {
  return catalogue?.languages.find(item => item.language === $('#source-language').value);
}
function sourceLimit() {
  const info = sourceInfo();
  return info ? ($('#source-order').value === 'main' ? info.mainCount : info.count) : 0;
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
  $('#summary-targets').textContent = Number.isInteger(count) && count >= 1 && count <= (isSource ? 18 : 10) ? String(count) : '—';
  $('#summary-letters').textContent = count === draftLengths.length ? String(draftLengths.reduce((a,b) => a+b,0)) : '—';
  const source = game?.initial.source;
  const sourceDirty = isSource && source && (source.language !== $('#source-language').value || (source.order && source.order !== $('#source-order').value) || (source.position && source.position !== Number($('#source-number').value)));
  const dirty = !game || !report.valid || (isSource ? sourceDirty : JSON.stringify(config) !== JSON.stringify(configForLevel(game.initial)));
  $('#config-status').textContent = isSource
    ? (!validSourcePosition() ? '序号必须为 1～' + sourceLimit() + ' 的整数。' : dirty ? '已选新关卡，点击“载入”应用。' : '原包参数已锁定 · 固定消耗集合保证任意完成顺序。')
    : report.valid ? 'V1 固定规则：3×3 · 5 词 · 3/3/3/4/5 · 校验全部 32 种完成状态。' : report.errors.map(error => error.message).join('；') + '。';
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
  $('#load-sample').hidden = isSource;
  $('#budget-fields').hidden = isSource;
  $('#debug-generation').hidden = isSource;
  $('#options-menu option[value="source"]').disabled = !isSource;
  $('#file-action option[value="sample"]').hidden = isSource;
  $('#file-action option[value="sample"]').disabled = isSource;
  if (!isSource && $('#options-menu').value === 'source') closeSettings();
  $('#word-count').max = String(isSource ? 18 : 10);
  for (const id of ['#board-cols','#board-rows','#word-count','#uniform-length']) $(id).disabled = true;
  $('#uniform-length').querySelector('option[value=""]').textContent = isSource ? '按原关卡显示' : '固定词长组合';
  $('#uniform-length').querySelectorAll('option').forEach(option => { option.hidden = !isSource && Number(option.value) > 8; });
  $('#uses-note').textContent = isSource ? '按原包展示' : '每格最多使用 3 次';
  $('#cols-note').textContent = isSource ? '原关卡列数' : 'V1 固定 3 列';
  $('#rows-note').textContent = isSource ? '原关卡行数' : 'V1 固定 3 行';
  $('#count-note').textContent = isSource ? '原关卡目标数量' : 'V1 固定 5 个，不重复';
  $('#length-note').textContent = isSource ? '原始目标词长度' : 'V1 固定 3/3/3/4/5';
  $('#uniform-note').textContent = isSource ? '按原关卡显示' : 'V1 词长已锁定';
  $('#preview-note').textContent = '拖动连词，松手提交。点击提示查看可用路径。';
  $('.debug-explanation').textContent = isSource ? '路径数与消耗集合数分开统计。仅接受参考消耗集合。' : '路径数与消耗集合数分开统计，每个词的集合必须唯一。';
}
function syncSourceControls(level) {
  const source = level.source;
  if (source?.language in LANGUAGE_NAMES) $('#source-language').value = source.language;
  if (source?.order === 'main' || source?.order === 'all') $('#source-order').value = source.order;
  populateSourceOptions();
  if (Number.isInteger(source?.position)) $('#source-number').value = String(source.position);
  $('#source-number').setAttribute('max', String(sourceLimit() || 1));
  $('#source-range').textContent = sourceLimit() ? '1–' + sourceLimit() : '—';
}
function syncEditor(level) {
  const config = level.algorithm === 1 ? configForLevel(level) : DEFAULT_CONFIG;
  $('#board-cols').value = String(config.cols); $('#board-rows').value = String(config.rows);
  $('#word-count').value = String(config.wordLengths.length);
  if (level.algorithm === 1) syncSourceControls(level);
  draftLengths = [...config.wordLengths]; renderWordRows(); updateEditor();
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
  $('#active-seed-label').textContent = isSource ? '原关卡 ID' : '当前种子';
  const id = String(isSource ? source.original.id : game.initial.seed ?? '未提供');
  $('#active-seed').textContent = id; $('#active-seed').title = id;
  $('#game-level-label').textContent = isSource ? '算法1' + (source.position ? ' · 第' + source.position + '关' : ' · 原包关卡') : '算法2 · 自由找词';
  if (isSource) {
    const info = catalogue?.languages.find(item => item.language === source.language);
    $('#source-library-status').textContent = (LANGUAGE_NAMES[source.language] || '原包') + ' · ID ' + source.original.id + (info ? ' · ' + info.count.toLocaleString() + ' 个不同关卡' : '');
    $('#source-meta').textContent = JSON.stringify(source.original, null, 2);
  }
}
function switchAlgorithm(next) {
  if (next === selectedAlgorithm || !ready) return;
  cancelGeneration(true); clearSelection(); rememberSession();
  selectedAlgorithm = next; showMode(); epoch++;
  const saved = savedSessions.get(next);
  if (saved) {
    game = saved.game; generationStats = saved.generationStats; lastRejection = saved.lastRejection;
    buildBoard(game.initial.board.rows, game.initial.board.cols);
    if (next === 1) syncEditor(game.initial);
    else {
      $('#board-cols').value = saved.draft.cols; $('#board-rows').value = saved.draft.rows; $('#word-count').value = saved.draft.count;
      draftLengths = [...saved.draft.lengths]; renderWordRows(); updateEditor();
    }
    applyLevelInfo(saved.kind); render();
    feedback(game.status === 'won' ? '全部目标已完成。' : '');
    notice('已恢复算法' + next + '的关卡与试玩进度。', 'success');
  } else if (next === 2) loadLevel(sample, '固定样例', { dismissEditor: false });
  else loadSource();
}
$('#algorithm').addEventListener('change', () => switchAlgorithm(Number($('#algorithm').value)));

function editorChanged() {
  const wasBusy = busy;
  cancelGeneration(true);
  if (wasBusy) {
    generationStats = { ...generationStats, result: 'cancelled', reason: 'config-edited' };
    notice('参数已修改，旧参数的生成已取消。点击生成应用新参数。'); renderDebug();
  }
  updateEditor();
}
for (const id of ['#board-cols', '#board-rows']) $(id).addEventListener('input', editorChanged);
$('#word-count').addEventListener('input', () => {
  const count = Number($('#word-count').value);
  if (Number.isInteger(count) && count >= LIMITS.minTargets && count <= LIMITS.maxTargets) {
    const fillLength = Number($('#uniform-length').value) || LIMITS.minLength;
    draftLengths = Array.from({ length: count }, (_, i) => draftLengths[i] ?? fillLength);
    renderWordRows();
  }
  editorChanged();
});
$('#uniform-length').addEventListener('change', () => {
  const length = Number($('#uniform-length').value);
  if (length) { draftLengths.fill(length); renderWordRows(); }
  editorChanged();
});

function applyViewport() {
  const column = $('.preview-column');
  let width, height;
  if ($('#preview-device').value === 'auto') {
    const availableHeight = column.clientHeight;
    width = Math.max(1, Math.floor(Math.min(520, column.clientWidth, availableHeight * 9 / 16)));
    height = width * 16 / 9;
  } else [width,height] = $('#preview-device').value.split('x').map(Number);
  const scale = Math.min(Number($('#preview-zoom').value) / 100, column.clientWidth / width, column.clientHeight / height);
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
  status.textContent = tone === 'error' ? message.split(/[：。]/)[0] :
    busy ? (busyKind === 'generate' ? '正在生成…' : '正在载入…') :
    message.startsWith('已导出') ? 'JSON 已导出' : message.includes('取消') ? '已取消' :
    message.includes('恢复') ? '进度已恢复' : '✓ 关卡已就绪';
}
function clearSelection() {
  const oldPointer = activePointer;
  activePointer = null; selection = []; hint = null;
  if (oldPointer !== null && board.hasPointerCapture(oldPointer)) board.releasePointerCapture(oldPointer);
  renderSelection();
}
function renderSelection() {
  tileElements.forEach((tile, cell) => {
    tile.classList.toggle('selected', selection.includes(cell));
    tile.classList.toggle('hinted', !!hint?.path.includes(cell));
    const badge = tile.querySelector('.hint-number');
    const at = hint?.path.indexOf(cell) ?? -1;
    badge.hidden = at < 0; badge.textContent = at >= 0 ? String(at + 1) : '';
  });
  $('#readout-label').textContent = hint && !selection.length ? '提示单词' : '正在连接';
  $('#current-word').textContent = selection.length && game ? selection.map(i => game.initial.board.letters[i]).join('') : (hint?.word || '—');
  connections.replaceChildren();
  const path = selection.length ? selection : hint?.path;
  if (path?.length > 1) {
    const area = board.getBoundingClientRect();
    const points = path.map(cell => {
      const rect = tileElements[cell].getBoundingClientRect();
      return `${((rect.left + rect.width / 2 - area.left) / area.width) * 1000},${((rect.top + rect.height / 2 - area.top) / area.height) * 1000}`;
    }).join(' ');
    const polyline = document.createElementNS(SVG_NS, 'polyline');
    polyline.setAttribute('points', points);
    if (!selection.length) polyline.classList.add('hint-line');
    connections.append(polyline);
  }
  $('#targets').querySelectorAll('.target').forEach(target => target.classList.toggle('hinted', target.dataset.word === hint?.word));
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
    ? '算法1 · ' + SOURCE_VERSION + ' · Word Tiles 1.4.0 · 需求不变量校验，未逐项枚举完成状态。'
    : '算法2 · ' + GENERATOR_VERSION + ' · 词库 ' + dictionary.version + ' · ' + normalizeDictionary(dictionary).length + ' 个候选词。';
}
function render(consumed = []) {
  if (!game) return;
  tileElements.forEach((tile, cell) => {
    const count = game.counts[cell];
    tile.querySelector('.tile-letter').textContent = count ? game.initial.board.letters[cell] : '·';
    const pips = tile.querySelector('.tile-pips');
    pips.classList.toggle('count-badge', count > 3);
    pips.replaceChildren();
    if (count > 3) pips.textContent = String(count);
    else pips.append(...Array.from({ length:count }, () => document.createElement('i')));
    tile.dataset.remaining = String(count);
    tile.classList.toggle('many-uses', count > 3);
    tile.classList.toggle('empty', count === 0);
    tile.classList.toggle('consumed', consumed.includes(cell));
    tile.setAttribute('aria-disabled', String(count === 0 || game.status !== 'playing'));
    tile.setAttribute('aria-label', count ? `格子 ${cell}，字母 ${game.initial.board.letters[cell]}，剩余 ${count} 次` : `格子 ${cell}，空位`);
  });
  $('#targets').replaceChildren();
  game.initial.targets.forEach(target => {
    const done = game.completed.has(target.word);
    const item = document.createElement('div'); item.className = `target${done ? ' completed' : ''}`; item.dataset.word = target.word;
    item.setAttribute('aria-label', done ? `${target.word} 已完成` : `${target.word.length} 字母目标，未完成`);
    const slots = document.createElement('div'); slots.className = 'target-slots'; slots.setAttribute('aria-hidden', 'true');
    [...target.word].forEach(letter => { const slot = document.createElement('span'); slot.className = 'target-letter'; slot.textContent = done ? letter : ''; slots.append(slot); });
    const length = document.createElement('span'); length.className = 'target-length'; length.textContent = done ? '✓ 找到了' : `${target.word.length} LETTERS`;
    item.append(slots, length); $('#targets').append(item);
  });
  $('#completion').replaceChildren(document.createTextNode(`${game.completed.size} `));
  const tail = document.createElement('span'); tail.textContent = `/ ${game.initial.targets.length}`; $('#completion').append(tail);
  $('#targets').setAttribute('aria-label', `共 ${game.initial.targets.length} 个目标词`);
  $('#board-size').textContent = `${game.initial.board.cols} × ${game.initial.board.rows} 棋盘`;
  $('#win-summary').textContent = `${game.initial.targets.length} 个目标全部完成，剩余次数归零。`;
  $('.play-panel').classList.toggle('dense-targets', game.initial.targets.length > 6);
  $('.play-panel').classList.toggle('long-words', game.initial.targets.some(t => t.word.length > 8));
  $('#remaining').textContent = `剩余次数 ${game.total}`;
  $('#win-banner').hidden = game.status !== 'won';
  $('.play-panel').classList.toggle('has-won', game.status === 'won');
  $('#hint').disabled = game.status !== 'playing';
  $('#validation-badge').textContent = game.status === 'anomaly' ? '关卡状态异常' : game.initial.algorithm === 1 ? '原包对照 · 需求不变量通过' : `${game.report.stateChecks} / ${game.report.stateCount} 通过`;
  if (game.status === 'anomaly') { feedback('关卡状态异常，请查看调试信息。', 'error'); console.error('WordTiles invariant violation', game.debug); }
  renderSelection(); renderDebug(); scheduleFit(); setBusy(busy, busyKind);
}
function setBusy(value, kind = null) {
  busy = value; busyKind = value ? kind : null;
  const isSource = selectedAlgorithm === 1, validPosition = validSourcePosition();
  for (const id of ['#generate','#generate-seed']) $(id).disabled = value || !ready || isSource || !editorValid;
  for (const id of ['#source-load','#source-random']) $(id).disabled = value || !ready || !sourceLimit() || (id === '#source-load' && !validPosition);
  $('#source-prev').disabled = value || !ready || !validPosition || Number($('#source-number').value) <= 1;
  $('#source-next').disabled = value || !ready || !validPosition || Number($('#source-number').value) >= sourceLimit();
  const source = game?.initial.source;
  const gameInfo = catalogue?.languages.find(item => item.language === source?.language);
  const gameLimit = gameInfo ? (source.order === 'all' ? gameInfo.count : gameInfo.mainCount) : sourceLimit();
  const lastSource = isSource && source?.position >= gameLimit;
  $('#win-next').disabled = value || !ready || (isSource ? lastSource : !editorValid);
  $('#win-next').textContent = lastSource ? '最后一关' : '下一关 ↗';
  $('#cancel-generation').hidden = !value || kind !== 'generate';
  $('#generate-label').textContent = value && kind === 'generate' ? '正在生成…' : '生成并试玩';
  for (const id of ['#options-menu','#file-action','#source-number']) $(id).disabled = !ready;
}
function cancelGeneration(silent = false) {
  requestId++;
  if (worker) { worker.terminate(); worker = null; }
  const wasBusy = busy, previousKind = busyKind; setBusy(false);
  if (wasBusy && previousKind === 'generate') generationStats = { ...generationStats, result:'cancelled', code:'CANCELLED' };
  if (wasBusy && !silent) {
    notice(previousKind === 'source' ? '载入已取消，当前关卡保留。' : '生成已取消，当前关卡保留。'); renderDebug();
  }
}
function loadLevel(level, kind, { syncDraft = true, dismissEditor = true } = {}) {
  let next;
  try { next = level?.schemaVersion === 3 ? new SourceGameSession(level) : createAlgorithmSession(level,dictionary); }
  catch (error) {
    lastRejection = error.report || { message:error.message };
    notice('关卡未通过校验，当前关卡保留。详见调试面板。','error'); renderDebug(); return false;
  }
  cancelGeneration(true); clearSelection();
  const nextMode = next.initial.algorithm === 1 ? 1 : 2;
  if (nextMode !== selectedAlgorithm) { rememberSession(); selectedAlgorithm = nextMode; showMode(); }
  epoch++; game = next; lastRejection = null;
  buildBoard(next.initial.board.rows,next.initial.board.cols);
  if (syncDraft) syncEditor(next.initial); else updateEditor();
  applyLevelInfo(kind);
  feedback('');
  notice(nextMode === 1 ? '原包对照与需求不变量校验通过，任意找词顺序都能完成。' : '完整校验通过：' + game.report.stateCount + ' 种完成状态均可继续找词。','success');
  render(); closeSettings(false); if (dismissEditor) closeEditor(); return true;
}
async function loadSource({ language = $('#source-language').value, order = $('#source-order').value, position = Number($('#source-number').value), dismissEditor = true } = {}) {
  if (selectedAlgorithm !== 1 || !ready) return;
  const info = catalogue.languages.find(item => item.language === language), limit = info && (order === 'main' ? info.mainCount : info.count);
  if (!info || !['main','all'].includes(order) || !Number.isInteger(position) || position < 1 || position > limit) {
    updateEditor(); notice('请选择有效语言、列表与关卡序号。','error'); return;
  }
  cancelGeneration(true); clearSelection();
  const id = ++requestId;
  setBusy(true,'source'); notice('正在载入' + LANGUAGE_NAMES[language] + '第 ' + position + ' 关…');
  try {
    if (!banks.has(language)) {
      const pending = fetch('./source-levels/' + info.file).then(async response => {
        if (!response.ok) throw new Error('关卡库读取失败');
        return response.json();
      }).catch(error => { banks.delete(language); throw error; });
      banks.set(language,pending);
    }
    const bank = await banks.get(language);
    if (id !== requestId || selectedAlgorithm !== 1) return;
    const rawId = bank.orders[order][position-1], raw = bank.levels[String(rawId)];
    if (!raw) throw new Error('原序号对应的关卡不存在');
    const level = convertSourceLevel(raw,{ language,order,position });
    if (!loadLevel(level,'原包 · ' + LANGUAGE_NAMES[language] + '第 ' + position + ' 关', { dismissEditor })) setBusy(false);
  } catch (error) {
    if (id !== requestId || selectedAlgorithm !== 1) return;
    setBusy(false); notice('载入失败：' + error.message + '。当前关卡保留。','error');
  }
}
function advanceSource() {
  if (game?.initial.algorithm !== 1) return;
  syncSourceControls(game.initial);
  const position = Number($('#source-number').value);
  if (position < sourceLimit()) {
    $('#source-number').value = String(position+1); updateSourceRange(); loadSource();
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
  if (!game || game.status !== 'playing' || !game.counts[cell]) return;
  if (selection.length > 1 && selection.at(-2) === cell) selection.pop();
  else if (!selection.includes(cell) && (!selection.length || game.neighbors[selection.at(-1)].includes(cell))) selection.push(cell);
  renderSelection();
}
function commitSelection() {
  if (!selection.length || !game) return;
  const path = [...selection]; clearSelection();
  const result = game.submit(path);
  render(result.accepted ? path : []);
  if (result.accepted && result.status === 'won') feedback('全部目标完成，所有次数恰好归零。', 'success');
  else if (result.accepted && result.status !== 'anomaly') feedback(`找到了 ${result.word}！继续找下一个。`, 'success');
  else if (result.reason === 'already-completed') feedback(`${result.word} 已经找过了，次数保持不变。`);
  else if (result.reason === 'extra-word') feedback(result.isNew ? `额外词 ${result.word} 已记录，次数保持不变。` : `额外词 ${result.word} 已经记过，次数保持不变。`, 'success');
  else if (result.reason === 'not-target') feedback(`${result.word} 不是本关目标，次数保持不变。`);
  else if (result.reason !== 'anomaly') feedback(result.message || '这次连接无效，次数保持不变。');
}
function tileAt(event) {
  const tile = document.elementFromPoint(event.clientX, event.clientY)?.closest('[data-cell]');
  return tile && board.contains(tile) ? Number(tile.dataset.cell) : null;
}
board.addEventListener('pointerdown', event => {
  if (!event.isPrimary || event.button !== 0 || !game || game.status !== 'playing') return;
  const cell = tileAt(event);
  if (cell === null || !game.counts[cell] || activePointer !== null) return;
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
  const delta = { ArrowUp: -columns, ArrowDown: columns, ArrowLeft: -1, ArrowRight: 1 }[event.key];
  if (delta) {
    event.preventDefault(); const next = cell + delta;
    if (game.neighbors[cell].includes(next)) tileElements[next].focus({ preventScroll: true });
  } else if (event.key === ' ') { event.preventDefault(); hint = null; addCell(cell); }
  else if (event.key === 'Enter') { event.preventDefault(); if (activePointer === null) commitSelection(); }
  else if (event.key === 'Backspace') { event.preventDefault(); selection.pop(); renderSelection(); }
  else if (event.key === 'Escape') { event.preventDefault(); clearSelection(); }
});
new ResizeObserver(() => renderSelection()).observe(board);

function readBudget() {
  const budget = { maxNodesPerAttempt: Number($('#budget-attempt').value), maxAttempts: Number($('#budget-tries').value), maxTotalNodes: Number($('#budget-total').value) };
  const limits = { maxNodesPerAttempt: 1000000, maxAttempts: 1000, maxTotalNodes: 10000000 };
  for (const [key, value] of Object.entries(budget)) if (!Number.isInteger(value) || value < 1 || value > limits[key]) throw new Error('搜索预算必须为输入框范围内的正整数。');
  return budget;
}
function generate(seed) {
  if (!dictionary || selectedAlgorithm !== 2) return;
  const { report } = checkEditor();
  if (!report.valid) { updateEditor(); notice(report.errors[0].message + '。', 'error'); return; }
  let budget;
  try { budget = readBudget(); } catch (error) { notice(error.message, 'error'); return; }
  const seedText = String(seed).trim();
  seed = Number(seedText);
  if (!/^\d+$/.test(seedText) || !Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) {
    notice('seed 必须为 0～4294967295 的整数。当前关卡保留。', 'error'); $('#seed').focus(); return;
  }
  cancelGeneration(true); clearSelection();
  const id = ++requestId, initialEpoch = epoch;
  const instance = new Worker(new URL('./generator.worker.js', import.meta.url), { type: 'module' });
  worker = instance; setBusy(true, 'generate'); $('#seed').value = String(seed);
  generationStats = { seed, config: budget, dictionaryVersion: dictionary.version, result: 'searching' }; renderDebug();
  notice('正在搜索合格关卡，当前关卡仍可试玩。');
  instance.onmessage = ({ data }) => {
    if (worker !== instance || data.requestId !== id || epoch !== initialEpoch) return;
    if (data.type === 'progress') {
      generationStats = { ...generationStats, ...data.stats };
      notice(`搜索中：尝试 ${data.stats.attempts}/${budget.maxAttempts}，已展开 ${data.stats.nodes} 个节点。`); renderDebug(); return;
    }
    instance.terminate(); worker = null; setBusy(false);
    if (data.type === 'error') {
      generationStats = { ...generationStats, result: 'worker-error', message: data.message };
      notice(`生成器错误：${data.message}。当前关卡保留。`, 'error'); renderDebug(); return;
    }
    const result = data.result;
    generationStats = { seed, config: budget, ...result.stats, result: result.ok ? 'success' : result.code,
      code: result.ok ? undefined : result.code, message: result.ok ? undefined : result.message,
      dictionaryReport: result.dictionaryReport, validation: result.validation };
    if (result.ok) {
      if (loadLevel(result.level, '自动生成')) notice(`生成成功：${result.stats.nodes} 个搜索节点；完整校验 ${game.report.stateChecks}/${game.report.stateCount} 通过。`, 'success');
    } else {
      notice(`${result.message} 当前关卡和试玩进度保留。`, 'error'); renderDebug();
    }
  };
  instance.onerror = event => {
    if (worker !== instance || epoch !== initialEpoch) return;
    event.preventDefault(); cancelGeneration(true);
    generationStats = { ...generationStats, result: 'worker-error', message: event.message };
    notice('生成线程未能启动，当前关卡保留。请通过 HTTP 服务打开本 Demo。', 'error'); renderDebug();
  };
  instance.postMessage({ requestId: id, dictionary, seed, config: budget });
}
function randomSeed() { return crypto.getRandomValues(new Uint32Array(1))[0]; }
$('#generate').addEventListener('click', () => generate(randomSeed()));
$('#win-next').addEventListener('click', () => selectedAlgorithm === 1 ? advanceSource() : generate(randomSeed()));
$('#generate-seed').addEventListener('click', () => generate($('#seed').value));
$('#seed').addEventListener('keydown', event => { if (event.key === 'Enter' && !busy) generate($('#seed').value); });
$('#cancel-generation').addEventListener('click', () => cancelGeneration());
$('#load-sample').addEventListener('click', () => { if (sample) loadLevel(sample, '固定样例'); });
$('#restart').addEventListener('click', () => { if (game) { const kind = $('#level-kind').textContent; loadLevel(game.exportInitial || game.initial, kind, { syncDraft: false }); feedback('已重开。'); } });
$('#hint').addEventListener('click', () => {
  if (!game) return;
  clearSelection(); hint = game.hint();
  if (hint) { renderSelection(); feedback(`提示：${hint.word}`); }
  else render();
});
$('#import').addEventListener('click', () => $('#import-file').click());
$('#import-file').addEventListener('change', async event => {
  const file = event.target.files[0]; event.target.value = ''; if (!file) return;
  cancelGeneration(true); clearSelection();
  const importEpoch = epoch, importId = ++requestId;
  try {
    if (file.size > 1024 * 1024) throw new Error('JSON 文件不能超过 1 MB');
    const text = await file.text();
    if (epoch !== importEpoch || requestId !== importId) return;
    const level = JSON.parse(text);
    const report = level?.schemaVersion === 3 ? validateSourceLevel(level) : validateAlgorithmLevel(level, dictionary);
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
  if (wasOpen && restoreFocus) $('#options-menu').focus({ preventScroll: true });
}
function positionSettings() {
  const panel = $('#settings-popover'); if (panel.hidden) return;
  const anchor = $('#options-menu').getBoundingClientRect(), rect = panel.getBoundingClientRect();
  const left = Math.max(8, Math.min(window.innerWidth - rect.width - 8, anchor.right + 12));
  const top = Math.max(8, Math.min(window.innerHeight - rect.height - 8, anchor.top));
  panel.style.left = `${left}px`; panel.style.top = `${top}px`;
}
$('#options-menu').addEventListener('change', () => {
  const value = $('#options-menu').value; if (!value) { closeSettings(); return; }
  clearSelection(); hideHelp();
  document.querySelectorAll('[data-settings-pane]').forEach(pane => { pane.hidden = pane.dataset.settingsPane !== value; });
  const panel = $('#settings-popover'); panel.dataset.pane = value;
  $('#settings-title').textContent = $('#options-menu').selectedOptions[0].textContent;
  panel.hidden = false; positionSettings(); panel.focus({ preventScroll: true });
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
  if (!$('#settings-popover').hidden && !event.target.closest('#settings-popover,#options-menu')) closeSettings(false);
  if (document.body.classList.contains('editor-open') && !event.target.closest('#editor-panel,#editor-toggle,#settings-popover')) closeEditor();
  if (!event.target.closest('[data-help],[data-help-from]')) hideHelp();
});
document.addEventListener('keydown', event => {
  if (event.key !== 'Escape') return;
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
for (const id of ['#rules-button','#editor-status']) $(id).addEventListener('click', () => showHelp($(id)));
window.addEventListener('resize', () => { positionSettings(); hideHelp(); });
for (let value = 1; value <= 18; value++) {
  const option = document.createElement('option'); option.value = String(value); option.textContent = `${value} 个`; $('#word-count').append(option);
}
$('#word-count').value = '3';
window.addEventListener('pagehide', () => cancelGeneration(true));
showMode(); renderWordRows(); updateEditor(); applyViewport();
for (const id of ['#algorithm','#source-language','#source-order','#generate','#generate-seed','#hint','#restart','#load-sample','#import','#export']) $(id).disabled = true;
try {
  const responses = await Promise.all([fetch('./dictionary-v1.json'),fetch('./sample.json'),fetch('./source-levels/catalogue.json')]);
  if (responses.some(response => !response.ok)) throw new Error('词库、样例或原包关卡目录无法读取');
  [dictionary,sample,catalogue] = await Promise.all(responses.map(response => response.json()));
  if (dictionary.version !== 'demo-test-20261010-v1' || !Array.isArray(dictionary.words) || dictionary.words.length !== 1602)
    throw new Error('算法2测试词库版本或数量不符合接入要求');
  ready = true;
  for (const id of ['#algorithm','#source-language','#source-order','#hint','#restart','#load-sample','#import','#export']) $(id).disabled = false;
  updateSourceRange();
  await loadSource();
} catch (error) {
  notice('启动失败：' + error.message + '。请通过 HTTP 服务运行。','error');
  feedback('本地关卡文件未能加载。','error');
}
