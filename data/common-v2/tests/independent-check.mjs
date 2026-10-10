/** Independent small-board oracle; does not import generator or validator. */
import assert from 'node:assert/strict';
const near = (a, b) => Math.abs(Math.floor(a / 3) - Math.floor(b / 3)) + Math.abs(a % 3 - b % 3) === 1;
const key = p => [...p].sort((a,b)=>a-b).join(',');
const geometries = new Map();
for (const length of [3,4,5]) {
  const paths=[];
  function walk(p) {
    if(p.length===length) { paths.push([...p]); return; }
    for(let i=0;i<9;i++) if(!p.includes(i) && (!p.length || near(p.at(-1),i))) walk([...p,i]);
  }
  walk([]);geometries.set(length,paths);
}
export function brutePaths(letters,word,counts=Array(9).fill(1)) {
  return geometries.get(word.length).filter(p => p.every((cell,k)=> counts[cell]>0 && letters[cell]===word[k]));
}
export function permutations(a) {
  if(!a.length) return [[]];
  return a.flatMap((v,i)=>permutations(a.filter((_,j)=>i!==j)).map(rest=>[v,...rest]));
}
const ORDERS=permutations([0,1,2,3,4]);
export function independentCheck(level, {replay=true}={}) {
  assert.equal(level.letters.length,9);
  const all=level.targets.map(t=>brutePaths(level.letters,t.word));
  all.forEach(paths=>{
    assert.ok(paths.length>0);
    assert.equal(new Set(paths.map(key)).size,1,'ambiguous consumption set');
  });
  const counts=Array(9).fill(0);
  all.forEach(paths=>paths[0].forEach(c=>counts[c]++));
  assert.deepEqual(level.initialCounts,counts);
  assert.ok(counts.every(n=>n>=1&&n<=3));
  for(let completed=0;completed<32;completed++) {
    const remaining=[...counts];
    all.forEach((paths,t)=>{if(completed&(1<<t)) paths[0].forEach(c=>remaining[c]--);});
    assert.ok(remaining.every(n=>n>=0));
    let sum=0;
    level.targets.forEach((t,i)=> {
      if(completed&(1<<i))return;
      sum+=t.word.length;
      const paths=brutePaths(level.letters,t.word,remaining);
      assert.ok(paths.length);
      assert.ok(paths.every(p=>key(p)===key(all[i][0])));
    });
    assert.equal(remaining.reduce((a,n)=>a+n,0),sum);
    if(completed===31) assert.ok(remaining.every(n=>n===0));
  }
  if(replay) {
    ORDERS.forEach((order,oi)=>{
      const remaining=[...counts];
      const done=new Set();
      for(const [step,ti] of order.entries()) {
        // Vary ordered paths when more than one exists (e.g. reverse EYE).
        const path=all[ti][(oi+step)%all[ti].length];
        assert.ok(!done.has(ti));
        assert.equal(new Set(path).size,path.length);
        assert.equal(path.map(i=>level.letters[i]).join(''),level.targets[ti].word);
        assert.ok(path.every((cell,k)=>remaining[cell]>0 && (!k||near(path[k-1],cell))));
        path.forEach(c=>remaining[c]--);
        done.add(ti);
        const expected=Array(9).fill(0);
        all.forEach((ps,t)=>{if(!done.has(t))ps[0].forEach(c=>expected[c]++);});
        assert.deepEqual(remaining,expected);
      }
      assert.ok(remaining.every(n=>n===0));
    });
  }
  return {statesChecked:32,ordersReplayed:replay?120:0};
}
