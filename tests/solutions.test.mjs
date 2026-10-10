import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { calculateLevelSolutions } from '../dist/core/level-solutions.js';
import { convertSourceLevel, SourceGameSession } from '../dist/core/source-levels.js';
import { createAlgorithmSession } from './support/historical-adapter.mjs';
import { createLexiconAdapter } from './support/historical-lexicon-adapter.mjs';
import { generateLevel } from '../dist/core/wordtiles-algorithm.js';

const json = async path => JSON.parse(await readFile(new URL(path, import.meta.url), 'utf8'));
const bank = await json('../dist/source-levels/english.json');
const dictionary = await json('../dist/dictionary-v1.json');
const fixture = await json('../examples/seed_20261010.json');
const wordKey = words => [...words].sort().join('|');

// Independent exhaustive oracle: no production trie, path finder, pruning or memoization.
function oracle(level, words) {
  const { board, targets } = level, lengths = targets.map(target => target.word.length).sort((a,b)=>a-b);
  function paths(word) {
    const result = [];
    function walk(path) {
      if (path.length === word.length) { result.push(path); return; }
      const last = path.at(-1);
      for (let cell = 0; cell < board.letters.length; cell++) {
        const adjacent = Math.abs(Math.floor(cell / board.cols) - Math.floor(last / board.cols)) + Math.abs(cell % board.cols - last % board.cols) === 1;
        if (!path.includes(cell) && adjacent && board.letters[cell] === word[path.length]) walk([...path,cell]);
      }
    }
    board.letters.forEach((letter,cell)=>{ if (letter === word[0]) walk([cell]); });
    return result;
  }
  const candidates = [...new Set(words)].filter(word=>lengths.includes(word.length)).sort().map(word=>({word,paths:paths(word)}));
  const found = new Set();
  function choose(first, picked, demand) {
    if (picked.length === targets.length) {
      if (picked.map(word=>word.length).sort((a,b)=>a-b).join() === lengths.join() && demand.every((count,cell)=>count === board.counts[cell])) found.add(wordKey(picked));
      return;
    }
    for (let index=first;index<candidates.length;index++) for (const path of candidates[index].paths) {
      const next = demand.map((count,cell)=>count+Number(path.includes(cell)));
      if (next.every((count,cell)=>count<=board.counts[cell])) choose(index+1,[...picked,candidates[index].word],next);
    }
  }
  choose(0,[],Array(board.letters.length).fill(0));
  return [...found].sort();
}
function verifyWitnesses(level, result) {
  assert.equal(result.ok,true,JSON.stringify(result));
  assert.equal(result.count,result.solutions.length);
  const combinations = new Set();
  for (const solution of result.solutions) {
    assert.equal(new Set(solution.words).size,level.targets.length);
    assert.deepEqual(solution.words.map(word=>word.length).sort((a,b)=>a-b),level.targets.map(target=>target.word.length).sort((a,b)=>a-b));
    assert.equal(combinations.has(wordKey(solution.words)),false); combinations.add(wordKey(solution.words));
    const demand=Array(level.board.letters.length).fill(0);
    for (const {word,path} of solution.paths) {
      assert.equal(path.map(cell=>level.board.letters[cell]).join(''),word);
      assert.equal(new Set(path).size,path.length);
      path.forEach((cell,index)=>{
        demand[cell]++;
        if (index) assert.equal(Math.abs(Math.floor(cell / level.board.cols)-Math.floor(path[index-1] / level.board.cols))+Math.abs(cell % level.board.cols-path[index-1] % level.board.cols),1);
      });
    }
    assert.deepEqual(demand,level.board.counts);
    assert.equal(solution.isTargetSet,wordKey(solution.words)===wordKey(level.targets.map(target=>target.word)));
  }
}

test('原包第3关有4种词组；独立穷举核对，不把额外词列表里的所有词都当解法', () => {
  const level=convertSourceLevel(bank.levels[bank.orders.main[2]]), before=JSON.stringify(level);
  const words=[...level.targets.map(target=>target.word),...level.source.original.extra_words.map(entry=>entry.word)];
  const result=calculateLevelSolutions(level,null);
  assert.equal(result.count,4); verifyWitnesses(level,result);
  assert.deepEqual(result.solutions.map(solution=>wordKey(solution.words)).sort(),oracle(level,words));
  assert.equal(result.solutions[0].isTargetSet,true);
  assert.equal(JSON.stringify(level),before);
});

test('同一词组的多种路径和完成顺序只算1种，不能重复使用同一个单词', () => {
  const level={board:{rows:2,cols:2,letters:['A','B','B','A'],counts:[1,2,1,2]},targets:[{word:'ABA',path:[0,1,3]},{word:'BAB',path:[1,3,2]}]};
  const words=['ABA','BAB','ABA','ABAB','BABA'];
  const result=calculateLevelSolutions(level,{version:'oracle',words});
  assert.equal(result.count,1); verifyWitnesses(level,result);
  assert.deepEqual(result.solutions.map(solution=>wordKey(solution.words)).sort(),oracle(level,words));
  const withoutBAB=calculateLevelSolutions(level,{version:'missing',words:['ABA']});
  assert.equal(withoutBAB.ok,true); assert.equal(withoutBAB.count,0);
});

test('原seed验收保留词库和词长数量，完整棋盘只有1种可清空词组', () => {
  const game=createAlgorithmSession(fixture,dictionary), result=calculateLevelSolutions(game.initial,game.dictionary);
  assert.equal(result.count,1); verifyWitnesses(game.initial,result);
  assert.equal(result.dictionaryVersion,'demo-test-20261010-v1');
});

test('新分级词库seed0有8种词组，与独立枚举一致；使用会话绑定的完整词库', async () => {
  const adapter=await createLexiconAdapter(await json('../dist/lexicon/dictionary.index.json'),await json('../dist/lexicon/review-overlay.json'));
  const graded=adapter.createRuntimeDictionary({wordLengths:[3,3,3,4,5],tiers:[1,2,3],allowUnreviewed:true});
  const generated=generateLevel({},graded,0); assert.equal(generated.ok,true);
  const game=createAlgorithmSession(generated.level,graded), result=calculateLevelSolutions(game.initial,game.dictionary);
  assert.equal(result.count,8); verifyWitnesses(game.initial,result);
  // Restrict the oracle's expensive combination loop using its own path matcher.
  const letters=new Set(game.initial.board.letters);
  const possible=graded.words.filter(word=>[...word].every(letter=>letters.has(letter)));
  assert.deepEqual(result.solutions.map(solution=>wordKey(solution.words)).sort(),oracle(game.initial,possible));
  assert.equal(result.dictionaryVersion,graded.version);
});

test('搜索和路径预算耗尽明确未完成，不返回部分计数作为精确答案', () => {
  const level=createAlgorithmSession(fixture,dictionary).initial;
  for (const options of [{maxNodes:1},{maxMilliseconds:0},{maxPathsPerWord:0},{maxSolutions:0}]) {
    const result=calculateLevelSolutions(level,dictionary,options);
    assert.equal(result.ok,false); assert.equal('count' in result,false); assert.equal('solutions' in result,false);
    assert.match(result.code,/BUDGET|LIMIT/);
  }
  const damaged=structuredClone(level); damaged.board.counts[0]++;
  assert.equal(calculateLevelSolutions(damaged,dictionary).code,'INVALID_LEVEL');
});

test('消除和收集额外词不影响初始解法统计', () => {
  const game=new SourceGameSession(convertSourceLevel(bank.levels[bank.orders.main[2]]));
  const before=calculateLevelSolutions(game.initial,null);
  game.submit([1,4,7]); // NUB is a bonus word, never a target consumption.
  game.submit(game.initial.targets[0].path);
  const after=calculateLevelSolutions(game.initial,null);
  assert.equal(after.count,before.count); assert.deepEqual(after.solutions,before.solutions);
});
