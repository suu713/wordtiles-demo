import { GameSession, NEIGHBORS, RULES_VERSION, normalizeDictionary, validateLevel, clone } from './core/rules.js';
const $ = selector => document.querySelector(selector);
const board = $('#board');
let dictionary, sample, game;
let selection = [], hint = null, activePointer = null, worker = null, busy = false;
let epoch = 0, requestId = 0, generationStats = null, lastRejection = null;
const tileElements = [];
const SVG_NS = 'http://www.w3.org/2000/svg';
for (let cell = 0; cell < 9; cell++) {
  const tile = document.createElement('button');
  tile.type = 'button'; tile.className = 'tile'; tile.dataset.cell = String(cell);
  const letter = document.createElement('span'); letter.className = 'tile-letter';
  const pips = document.createElement('span'); pips.className = 'tile-pips'; pips.setAttribute('aria-hidden', 'true');
  const hintNumber = document.createElement('span'); hintNumber.className = 'hint-number'; hintNumber.hidden = true; hintNumber.setAttribute('aria-hidden', 'true');
  tile.append(letter, pips, hintNumber); board.append(tile); tileElements.push(tile);
}
const connections = document.createElementNS(SVG_NS, 'svg');
connections.classList.add('connections'); connections.setAttribute('viewBox', '0 0 1000 1000'); connections.setAttribute('aria-hidden', 'true');
board.append(connections);

function feedback(message, tone = '') {
  $('#feedback').textContent = message; $('#feedback').className = `feedback ${tone}`;
}
function notice(message, tone = '') {
  $('#notice').textContent = message; $('#notice').className = `notice ${tone}`;
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
  for (const [label, values] of [['格子编号', [0,1,2,3,4,5,6,7,8]], ['初始次数', game.initial.board.counts], ['独立反算', game.report.demand], ['剩余次数', game.counts]]) {
    const row = document.createElement('div'); row.textContent = `${label}：${values.join(' · ')}`; counts.append(row);
  }
  $('#debug-checks').replaceChildren();
  game.report.checks.forEach(check => { const item = document.createElement('span'); item.textContent = `${check.pass ? '✓' : '×'} ${check.name}：${check.detail}`; if (!check.pass) item.className = 'failed'; $('#debug-checks').append(item); });
  $('#debug-generation').textContent = generationStats ? JSON.stringify(generationStats, null, 2) : '尚未进行自动生成。';
  $('#debug-rejection').hidden = !lastRejection && !game.debug;
  $('#debug-rejection').textContent = JSON.stringify(lastRejection || game.debug, null, 2);
  $('#version-note').textContent = `算法 ${RULES_VERSION} · 词库 ${dictionary.version} · ${normalizeDictionary(dictionary).length} 个候选词。词频与目标用户适配仍需人工审核。`;
}
function render(consumed = []) {
  if (!game) return;
  tileElements.forEach((tile, cell) => {
    const count = game.counts[cell];
    tile.querySelector('.tile-letter').textContent = count ? game.initial.board.letters[cell] : '·';
    tile.querySelector('.tile-pips').replaceChildren(...Array.from({ length: count }, () => document.createElement('i')));
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
  const tail = document.createElement('span'); tail.textContent = '/ 5'; $('#completion').append(tail);
  $('#remaining').textContent = `剩余次数 ${game.total}`;
  $('#win-banner').hidden = game.status !== 'won';
  $('#hint').disabled = game.status !== 'playing';
  $('#validation-badge').textContent = game.status === 'anomaly' ? '关卡状态异常' : '32 / 32 通过';
  if (game.status === 'anomaly') { feedback('关卡状态异常，请查看调试信息。', 'error'); console.error('WordTiles invariant violation', game.debug); }
  renderSelection(); renderDebug();
}
function setBusy(value) {
  busy = value;
  $('#generate').disabled = value; $('#generate-seed').disabled = value;
  $('#cancel-generation').hidden = !value;
  $('#generate').firstChild.textContent = value ? '正在生成… ' : '生成新关 ';
}
function cancelGeneration(silent = false) {
  requestId++;
  if (worker) { worker.terminate(); worker = null; }
  const wasBusy = busy; setBusy(false);
  if (wasBusy && !silent) {
    generationStats = { ...generationStats, result: 'cancelled' };
    notice('生成已取消，当前关卡保留。'); renderDebug();
  }
}
function loadLevel(level, kind) {
  let next;
  try { next = new GameSession(level, dictionary); }
  catch (error) {
    lastRejection = error.report || { message: error.message };
    notice('关卡未通过校验，当前关卡保留。详见调试面板。', 'error'); renderDebug(); return false;
  }
  cancelGeneration(true); clearSelection(); epoch++; game = next; lastRejection = null;
  $('#level-kind').textContent = kind;
  $('#active-seed').textContent = String(level.seed ?? '未提供');
  $('#active-seed').title = String(level.seed ?? '未提供');
  feedback('拖动连接相邻的字母，松手提交。');
  notice('完整校验通过：32 种完成状态均可继续找词。', 'success');
  render(); return true;
}
function addCell(cell) {
  if (!game || game.status !== 'playing' || !game.counts[cell]) return;
  if (selection.length > 1 && selection.at(-2) === cell) selection.pop();
  else if (!selection.includes(cell) && (!selection.length || NEIGHBORS[selection.at(-1)].includes(cell))) selection.push(cell);
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
  const delta = { ArrowUp: -3, ArrowDown: 3, ArrowLeft: -1, ArrowRight: 1 }[event.key];
  if (delta) {
    event.preventDefault(); const next = cell + delta;
    if (NEIGHBORS[cell].includes(next)) tileElements[next].focus();
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
  if (!dictionary) return;
  let budget;
  try { budget = readBudget(); } catch (error) { notice(error.message, 'error'); return; }
  if (!String(seed).length) { notice('请先输入 seed。', 'error'); $('#seed').focus(); return; }
  cancelGeneration(true); clearSelection();
  const id = ++requestId, initialEpoch = epoch;
  const instance = new Worker(new URL('./generator.worker.js', import.meta.url), { type: 'module' });
  worker = instance; setBusy(true); $('#seed').value = String(seed);
  generationStats = { seed: String(seed), budget, result: 'searching' }; renderDebug();
  notice('正在搜索合格关卡，当前关卡仍可试玩。');
  instance.onmessage = ({ data }) => {
    if (worker !== instance || data.requestId !== id || epoch !== initialEpoch) return;
    if (data.type === 'progress') {
      generationStats = data.stats;
      notice(`搜索中：尝试 ${data.stats.attempts}/${budget.maxAttempts}，已展开 ${data.stats.nodes} 个节点。`); renderDebug(); return;
    }
    instance.terminate(); worker = null; setBusy(false);
    if (data.type === 'error') {
      generationStats = { ...generationStats, result: 'worker-error', message: data.message };
      notice(`生成器错误：${data.message}。当前关卡保留。`, 'error'); renderDebug(); return;
    }
    const result = data.result; generationStats = { ...result.stats, result: result.success ? 'success' : result.reason };
    if (result.success) {
      result.level.generation = { dictionaryVersion: dictionary.version, budget, nodes: result.stats.nodes, attempts: result.stats.attempts };
      if (loadLevel(result.level, '自动生成')) notice(`生成成功：${result.stats.nodes} 个搜索节点；完整校验 32/32 通过。`, 'success');
    } else {
      notice(`${result.message} 当前关卡保留，可重试或载入样例。`, 'error'); renderDebug();
    }
  };
  instance.onerror = event => {
    if (worker !== instance || epoch !== initialEpoch) return;
    event.preventDefault(); cancelGeneration(true);
    generationStats = { ...generationStats, result: 'worker-error', message: event.message };
    notice('生成线程未能启动，当前关卡保留。请通过 HTTP 服务打开本 Demo。', 'error'); renderDebug();
  };
  instance.postMessage({ requestId: id, dictionary, seed: String(seed), budget });
}
function randomSeed() { return `WT-${crypto.getRandomValues(new Uint32Array(1))[0].toString(36).toUpperCase()}`; }
$('#generate').addEventListener('click', () => generate(randomSeed()));
$('#win-next').addEventListener('click', () => generate(randomSeed()));
$('#generate-seed').addEventListener('click', () => generate($('#seed').value));
$('#seed').addEventListener('keydown', event => { if (event.key === 'Enter' && !busy) generate($('#seed').value); });
$('#cancel-generation').addEventListener('click', () => cancelGeneration());
$('#load-sample').addEventListener('click', () => { if (sample) loadLevel(sample, '固定样例'); });
$('#restart').addEventListener('click', () => { if (game) { const kind = $('#level-kind').textContent; loadLevel(game.initial, kind); feedback('已经重开，所有字母恢复初始次数。'); } });
$('#hint').addEventListener('click', () => {
  if (!game) return;
  clearSelection(); hint = game.hint();
  if (hint) { renderSelection(); feedback(`提示：按标记的 1～${hint.path.length} 顺序连接，松手提交。`); }
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
    const report = validateLevel(level, dictionary);
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
  const json = JSON.stringify(clone(game.initial), null, 2) + '\n';
  const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
  const link = document.createElement('a'); link.href = url;
  link.download = `wordtiles-${String(game.initial.seed || 'level').replace(/[^a-zA-Z0-9_-]/g, '_')}.json`;
  link.click(); URL.revokeObjectURL(url); notice('已导出本关初始数据；重载后从完整棋盘开始。', 'success');
});
const dialog = $('#rules-dialog');
$('#rules-button').addEventListener('click', () => { clearSelection(); dialog.showModal(); });
for (const id of ['#close-rules', '#start-playing']) $(id).addEventListener('click', () => dialog.close());
dialog.addEventListener('click', event => {
  const rect = dialog.getBoundingClientRect();
  if (event.target === dialog && (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom)) dialog.close();
});
window.addEventListener('pagehide', () => cancelGeneration(true));
for (const id of ['#generate', '#generate-seed', '#hint', '#restart', '#load-sample', '#import', '#export']) $(id).disabled = true;
try {
  const responses = await Promise.all([fetch('./dictionary.json'), fetch('./sample.json')]);
  if (responses.some(response => !response.ok)) throw new Error('词库或样例文件无法读取');
  [dictionary, sample] = await Promise.all(responses.map(response => response.json()));
  dictionary = { ...dictionary, words: normalizeDictionary(dictionary) };
  for (const id of ['#generate', '#generate-seed', '#hint', '#restart', '#load-sample', '#import', '#export']) $(id).disabled = false;
  if (!loadLevel(sample, '固定样例')) throw new Error('内置样例未通过完整校验');
} catch (error) {
  notice(`启动失败：${error.message}。请通过 HTTP 服务运行。`, 'error');
  feedback('本地关卡文件未能加载。', 'error');
}
