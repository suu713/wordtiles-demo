import assert from 'node:assert/strict';

// Deliberately imports neither the generator nor Demo rules/DFS.
export function independentPaths(letters, word, counts) {
  const paths = [];
  function walk(cell, path) {
    if (path.includes(cell) || counts[cell] <= 0 || letters[cell] !== word[path.length]) return;
    const next = [...path, cell];
    if (next.length === word.length) { paths.push(next); return; }
    const row = Math.floor(cell / 3), col = cell % 3;
    for (const [r, c] of [[row-1,col],[row+1,col],[row,col-1],[row,col+1]]) {
      if (r >= 0 && r < 3 && c >= 0 && c < 3) walk(r*3+c, next);
    }
  }
  for (let cell = 0; cell < 9; cell++) walk(cell, []);
  return paths;
}
const key = path => [...path].sort((a,b) => a-b).join(',');
export function checkV1Independently(level, dictionary) {
  assert.equal(level.schemaVersion, 1); assert.equal(level.rulesVersion, 'wordtiles-v1');
  assert.equal(level.rows, 3); assert.equal(level.cols, 3); assert.equal(level.maxCellUses, 3);
  assert.ok(Number.isInteger(level.seed) && level.seed >= 0 && level.seed <= 4294967295);
  assert.equal(level.letters.length, 9); assert.equal(level.initialCounts.length, 9);
  assert.ok(level.letters.every(letter => /^[A-Z]$/.test(letter)));
  assert.ok(level.initialCounts.every(count => Number.isInteger(count) && count >= 1 && count <= 3));
  assert.equal(level.targets.length, 5);
  assert.equal(new Set(level.targets.map(t => t.word)).size, 5);
  assert.equal(new Set(level.targets.map(t => t.id)).size, 5);
  assert.deepEqual(level.targets.map(t => t.word.length).sort((a,b)=>a-b), [3,3,3,4,5]);
  const whitelist = new Set(dictionary.words.map(word => word.trim().toUpperCase()));
  const demand = Array(9).fill(0);
  const sets = level.targets.map(target => {
    assert.ok(whitelist.has(target.word));
    const paths = independentPaths(level.letters, target.word, level.initialCounts);
    assert.ok(paths.some(path => JSON.stringify(path) === JSON.stringify(target.canonicalPath)));
    const keys = new Set(paths.map(key)); assert.equal(keys.size, 1, target.word);
    const consumption = key(paths[0]).split(',').map(Number);
    consumption.forEach(cell => demand[cell]++);
    return consumption;
  });
  assert.deepEqual(demand, level.initialCounts);
  for (let completed = 0; completed < 32; completed++) {
    const counts = [...level.initialCounts]; let pendingLetters = 0;
    level.targets.forEach((target, index) => {
      if (completed & 2**index) sets[index].forEach(cell => counts[cell]--);
      else pendingLetters += target.word.length;
    });
    assert.ok(counts.every(count => count >= 0));
    assert.equal(counts.reduce((a,b)=>a+b,0), pendingLetters);
    level.targets.forEach((target, index) => {
      if (completed & 2**index) return;
      const paths = independentPaths(level.letters, target.word, counts);
      assert.ok(paths.length, `${completed}: ${target.word}`);
      assert.ok(paths.every(path => key(path) === key(sets[index])));
    });
    if (completed === 31) assert.deepEqual(counts, Array(9).fill(0));
  }
  return { statesChecked: 32 };
}
export function* permutations(items) {
  if (!items.length) { yield []; return; }
  for (let i = 0; i < items.length; i++) for (const rest of permutations(items.filter((_,j)=>i!==j))) yield [items[i], ...rest];
}
