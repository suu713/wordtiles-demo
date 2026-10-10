import { NEIGHBORS, RULES_VERSION, normalizeDictionary, signature, validateLevel } from './rules.js';

export const DEFAULT_BUDGET = Object.freeze({ maxNodesPerAttempt: 10000, maxAttempts: 30, maxTotalNodes: 300000 });
const ORDER = [5, 4, 3, 3, 3];
class SearchLimit extends Error {}

function randomFor(seed) {
  let hash = 2166136261;
  for (const char of String(seed)) { hash ^= char.charCodeAt(0); hash = Math.imul(hash, 16777619); }
  return () => {
    hash += 0x6D2B79F5;
    let t = Math.imul(hash ^ hash >>> 15, 1 | hash);
    t ^= t + Math.imul(t ^ t >>> 7, 61 | t);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
function shuffle(input, random) {
  const array = [...input];
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}
function trieFor(words) {
  const root = { children: new Map(), word: null, maxWord: '' };
  for (const word of words) {
    let node = root;
    for (const letter of word) {
      if (word > node.maxWord) node.maxWord = word;
      if (!node.children.has(letter)) node.children.set(letter, { children: new Map(), word: null, maxWord: '' });
      node = node.children.get(letter);
    }
    node.word = word; node.maxWord = word;
  }
  return root;
}

// A lazy joint word/path DFS. Paths are never merged while letters remain unfixed.
function* placements(state, trie, minimumWord, random, visit) {
  function* walk(cell, node, visited, path) {
    visit();
    if ((visited & (1 << cell)) || state.counts[cell] >= 3 || node.maxWord <= minimumWord) return;
    const letters = state.letters[cell] ? [state.letters[cell]] : shuffle([...node.children.keys()], random);
    for (const letter of letters) {
      const child = node.children.get(letter);
      if (!child || child.maxWord <= minimumWord) continue;
      const nextPath = [...path, cell];
      if (child.word) {
        if (child.word > minimumWord && !state.targets.some(t => t.word === child.word)) yield { word: child.word, path: nextPath };
      } else for (const neighbor of shuffle(NEIGHBORS[cell], random)) {
        yield* walk(neighbor, child, visited | (1 << cell), nextPath);
      }
    }
  }
  for (const cell of shuffle(Array.from({ length: 9 }, (_, i) => i), random)) yield* walk(cell, trie, 0, []);
}

function hasOtherConsumption(letters, target, visit) {
  const expected = signature(target.path);
  function walk(cell, offset, visited, path) {
    visit();
    if ((visited & (1 << cell)) || letters[cell] !== target.word[offset]) return false;
    const nextPath = [...path, cell];
    if (offset === target.word.length - 1) return signature(nextPath) !== expected;
    return NEIGHBORS[cell].some(neighbor => walk(neighbor, offset + 1, visited | (1 << cell), nextPath));
  }
  return Array.from({ length: 9 }, (_, i) => i).some(cell => walk(cell, 0, 0, []));
}

export function generateLevel(dictionary, seed, options = {}) {
  const words = normalizeDictionary(dictionary);
  const budget = { ...DEFAULT_BUDGET, ...options.budget };
  for (const [key, value] of Object.entries(budget)) if (!Number.isInteger(value) || value < 1) throw new Error(`无效搜索预算：${key}`);
  const random = randomFor(seed);
  const tries = new Map([3, 4, 5].map(length => [length, trieFor(words.filter(w => w.length === length))]));
  const stats = { algorithmVersion: RULES_VERSION, seed: String(seed), dictionarySize: words.length,
    budget, attempts: 0, nodes: 0, attemptNodes: 0, failures: {}, attemptReports: [] };
  const reject = reason => { stats.failures[reason] = (stats.failures[reason] || 0) + 1; };
  if ([3, 4, 5].some(length => !words.some(word => word.length === length)) || words.filter(w => w.length === 3).length < 3) {
    return { success: false, reason: 'dictionary-insufficient', message: '词库无法满足 5、4、3、3、3 的目标结构', stats };
  }
  const visit = () => {
    if (options.isCancelled?.()) throw new SearchLimit('cancelled');
    if (stats.nodes >= budget.maxTotalNodes) throw new SearchLimit('global-node-limit');
    if (stats.attemptNodes >= budget.maxNodesPerAttempt) throw new SearchLimit('attempt-node-limit');
    stats.nodes++; stats.attemptNodes++;
    if (stats.nodes % 500 === 0) options.onProgress?.({ ...stats, failures: { ...stats.failures } });
  };
  function search(state, depth) {
    visit();
    if (depth === ORDER.length) {
      if (state.counts.some(n => n === 0)) { reject('uncovered-cells'); return null; }
      const level = { schemaVersion: 1, id: `generated-${String(seed)}`, seed: String(seed), algorithmVersion: RULES_VERSION,
        board: { rows: 3, cols: 3, letters: state.letters, counts: state.counts },
        targets: [...state.targets].sort((a, b) => a.word.length - b.word.length || (a.word < b.word ? -1 : a.word > b.word ? 1 : 0)) };
      const validation = validateLevel(level, words, { onVisit: visit });
      if (validation.valid) return { level, validation };
      reject('full-validation'); return null;
    }
    const remainingLetters = ORDER.slice(depth + 1).reduce((a, b) => a + b, 0);
    // Three-letter targets are an unordered set. Lexical ordering removes equivalent placement permutations.
    const minimum = depth > 2 ? state.targets[depth - 1].word : '';
    let hadCandidate = false;
    for (const target of placements(state, tries.get(ORDER[depth]), minimum, random, visit)) {
      hadCandidate = true; visit();
      const next = { letters: [...state.letters], counts: [...state.counts], targets: [...state.targets, target] };
      target.path.forEach((cell, index) => { next.letters[cell] = target.word[index]; next.counts[cell]++; });
      const uncovered = next.counts.filter(n => n === 0).length;
      if (uncovered > remainingLetters) { reject('coverage-bound'); continue; }
      if (next.counts.reduce((sum, n) => sum + 3 - n, 0) < remainingLetters) { reject('capacity-bound'); continue; }
      if (next.targets.some(t => hasOtherConsumption(next.letters, t, visit))) { reject('ambiguous-consumption'); continue; }
      const found = search(next, depth + 1);
      if (found) return found;
    }
    if (!hadCandidate) reject('no-compatible-word-path');
    return null;
  }
  for (let attempt = 1; attempt <= budget.maxAttempts; attempt++) {
    stats.attempts = attempt; stats.attemptNodes = 0;
    options.onProgress?.({ ...stats, failures: { ...stats.failures } });
    try {
      const result = search({ letters: Array(9).fill(null), counts: Array(9).fill(0), targets: [] }, 0);
      if (result) return { success: true, ...result, stats: { ...stats, failures: { ...stats.failures } } };
      reject('attempt-exhausted');
      stats.attemptReports.push({ attempt, nodes: stats.attemptNodes, reason: 'attempt-exhausted' });
    } catch (error) {
      if (!(error instanceof SearchLimit)) throw error;
      reject(error.message);
      stats.attemptReports.push({ attempt, nodes: stats.attemptNodes, reason: error.message });
      if (error.message === 'cancelled') return { success: false, reason: 'cancelled', message: '生成已取消', stats };
      if (error.message === 'global-node-limit') break;
    }
    if (stats.nodes >= budget.maxTotalNodes) break;
  }
  return { success: false, reason: 'budget-exhausted', message: '本次搜索预算内未找到合格关卡。', stats };
}
