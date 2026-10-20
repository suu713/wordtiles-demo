import { createNeighbors, normalizeBonusDictionary } from './rules.js?v=21';

const dictionaryTries = new WeakMap();
function dictionaryTrie(dictionary) {
  const cached = dictionaryTries.get(dictionary);
  if (cached) return cached;
  const root = { children: new Map() };
  for (const word of normalizeBonusDictionary(dictionary)) {
    let node = root;
    for (const letter of word) {
      if (!node.children.has(letter)) node.children.set(letter, { children: new Map() });
      node = node.children.get(letter);
    }
    node.word = word;
  }
  dictionaryTries.set(dictionary, root);
  return root;
}

export function reachableDictionaryWords(board, dictionary, onVisit = null) {
  const root = dictionaryTrie(dictionary), neighbors = createNeighbors(board.rows, board.cols);
  const used = Array(board.letters.length).fill(false), found = new Set();
  function walk(cell, parent) {
    onVisit?.();
    if (used[cell]) return;
    const node = parent.children.get(board.letters[cell]);
    if (!node) return;
    if (node.word) found.add(node.word);
    used[cell] = true;
    if (node.children.size) for (const next of neighbors[cell]) walk(next, node);
    used[cell] = false;
  }
  for (let cell = 0; cell < board.letters.length; cell++) walk(cell, root);
  return [...found];
}

// Use a validated, complete initial level rather than the remaining game state.
export function calculateLevelStatistics(level, dictionary) {
  const { board, targets } = level, targetWords = new Set(targets.map(target => target.word));
  const isSource = level.algorithm === 1;
  const candidates = isSource
    ? (level.source.original.extra_words || []).map(entry => entry.word)
    : reachableDictionaryWords(board, dictionary);
  const extraWords = [...new Set(candidates.filter(word => typeof word === 'string' && word.length && !targetWords.has(word)))].sort();
  const tileUses = Array(board.letters.length).fill(0);
  const targetPaths = targets.map(target => {
    for (const cell of new Set(target.path)) tileUses[cell]++;
    const startCell = target.path[0], endCell = target.path.at(-1);
    const startColumn = startCell % board.cols, endColumn = endCell % board.cols;
    const screenRow = cell => isSource ? board.rows - 1 - Math.floor(cell / board.cols) : Math.floor(cell / board.cols);
    const reverse = endColumn < startColumn || screenRow(endCell) < screenRow(startCell);
    let turns = 0;
    for (let i = 2; i < target.path.length; i++) {
      if (target.path[i] - target.path[i - 1] !== target.path[i - 1] - target.path[i - 2]) turns++;
    }
    return { word: target.word, startCell, endCell, startColumn, endColumn, reverse, turns };
  });
  const usageHistogram = {};
  for (const uses of tileUses) usageHistogram[uses] = (usageHistogram[uses] || 0) + 1;
  const reverseWords = targetPaths.filter(target => target.reverse).map(target => target.word);
  return {
    extraWords, extraWordCount: extraWords.length, extraWordSource: isSource ? 'original-list' : 'dictionary',
    targetCount: targets.length, targetPaths, reverseWords, reverseWordCount: reverseWords.length,
    reversePercentage: targets.length ? reverseWords.length / targets.length * 100 : 0,
    straightWordCount: targetPaths.filter(target => target.turns === 0).length,
    oneTurnWordCount: targetPaths.filter(target => target.turns === 1).length,
    multiTurnWordCount: targetPaths.filter(target => target.turns >= 2).length,
    tileUses, usageHistogram,
  };
}
