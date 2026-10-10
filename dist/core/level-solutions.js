import { findWordPaths, signature } from './rules.js?v=13';
import { reachableDictionaryWords } from './level-statistics.js?v=13';

// Count word sets, not play orders or alternative paths for the same words.
// The input is the validated initial board; this does not change play rules.
export function calculateLevelSolutions(level, dictionary, {
  maxNodes = 1_000_000, maxMilliseconds = 4000, maxPathsPerWord = 20_000, maxSolutions = 20_000,
} = {}) {
  const started = performance.now(), solutions = new Map(), dead = new Set();
  let nodes = 0;
  const fail = (code, message) => { throw Object.assign(new Error(message), { code }); };
  const budget = () => {
    if (++nodes > maxNodes || performance.now() - started > maxMilliseconds)
      fail('SEARCH_BUDGET_EXCEEDED', '解法搜索超出预算，尚未完成完整统计。');
  };
  try {
    const { board, targets } = level;
    if (!board || !Array.isArray(board.counts) || !Array.isArray(targets) || !targets.length ||
        board.counts.reduce((sum, count) => sum + count, 0) !== targets.reduce((sum, target) => sum + target.word.length, 0))
      fail('INVALID_LEVEL', '解法统计需要完整且通过校验的初始关卡。');
    const lengths = new Map();
    targets.forEach(target => lengths.set(target.word.length, (lengths.get(target.word.length) || 0) + 1));
    const allowed = level.algorithm === 1
      ? [...targets.map(target => target.word), ...(level.source.original.extra_words || []).map(entry => entry.word)]
      : reachableDictionaryWords(board, dictionary, budget);
    const words = [...new Set(allowed)].filter(word => lengths.has(word.length)).sort();
    const groups = [...lengths].sort((a, b) => b[0] - a[0]).map(([length, count]) => ({ length, count, candidates: [] }));
    for (const word of words) {
      budget();
      const paths = findWordPaths(board.letters, word, board.counts, budget, board);
      if (paths.length > maxPathsPerWord) fail('PATH_BUDGET_EXCEEDED', '单词可用路径过多，尚未完成完整统计。');
      const choices = new Map();
      paths.forEach(path => choices.set(signature(path), { path, cells: [...path].sort((a, b) => a - b) }));
      if (choices.size) groups.find(group => group.length === word.length).candidates.push({ word, choices: [...choices.values()] });
    }
    // A suffix bound limits how many distinct remaining words can use each cell.
    for (const group of groups) {
      const size = group.candidates.length;
      group.suffix = Array(size + 1); group.suffix[size] = Array(board.counts.length).fill(0);
      for (let index = size - 1; index >= 0; index--) {
        const coverage = new Set(group.candidates[index].choices.flatMap(choice => choice.cells));
        group.suffix[index] = group.suffix[index + 1].map((count, cell) => count + Number(coverage.has(cell)));
      }
    }
    const remaining = [...board.counts], chosen = [], reference = targets.map(target => target.word).sort().join('|');
    function search(groupIndex, first = 0, needed = groups[groupIndex]?.count || 0) {
      budget();
      if (groupIndex === groups.length) {
        if (remaining.some(count => count !== 0)) return false;
        const key = chosen.map(candidate => candidate.word).sort().join('|');
        if (!solutions.has(key)) {
          solutions.set(key, {
            words: chosen.map(candidate => candidate.word),
            paths: chosen.map(candidate => ({ word:candidate.word, path:[...candidate.path] })),
            isTargetSet: key === reference,
          });
          if (solutions.size > maxSolutions) fail('SOLUTION_LIMIT', '可行词组过多，尚未完成完整统计。');
        }
        return true;
      }
      if (!needed) return search(groupIndex + 1);
      const group = groups[groupIndex];
      if (group.candidates.length - first < needed) return false;
      for (let cell = 0; cell < remaining.length; cell++) {
        let capacity = Math.min(needed, group.suffix[first][cell]);
        for (const next of groups.slice(groupIndex + 1)) capacity += Math.min(next.count, next.suffix[0][cell]);
        if (remaining[cell] > capacity) return false;
      }
      const key = `${groupIndex}:${first}:${needed}:${remaining.join(',')}`;
      if (dead.has(key)) return false;
      let found = false;
      for (let index = first; index <= group.candidates.length - needed; index++) {
        const candidate = group.candidates[index];
        for (const choice of candidate.choices) {
          if (choice.cells.some(cell => remaining[cell] < 1)) continue;
          choice.cells.forEach(cell => remaining[cell]--);
          chosen.push({ word:candidate.word, path:choice.path });
          if (search(groupIndex, index + 1, needed - 1)) found = true;
          chosen.pop(); choice.cells.forEach(cell => remaining[cell]++);
        }
      }
      if (!found) dead.add(key);
      return found;
    }
    search(0);
    const result = [...solutions.values()].sort((a, b) => Number(b.isTargetSet) - Number(a.isTargetSet) || a.words.join('|').localeCompare(b.words.join('|')));
    return { ok:true, count:result.length, solutions:result, candidateCount:words.length, nodes, elapsedMs:Math.round(performance.now() - started), dictionaryVersion:level.algorithm === 1 ? 'source-extra-list' : dictionary.version };
  } catch (error) {
    return { ok:false, code:error.code || 'ANALYSIS_ERROR', message:error.message, nodes, elapsedMs:Math.round(performance.now() - started) };
  }
}
