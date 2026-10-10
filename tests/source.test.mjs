import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { clone, findWordPaths, signature } from '../dist/core/rules.js';
import { convertSourceLevel, validateSourceLevel, SourceGameSession } from '../dist/core/source-levels.js';

const root = new URL('../dist/source-levels/', import.meta.url);
const catalogue = JSON.parse(await readFile(new URL('catalogue.json',root),'utf8'));
const banks = Object.fromEntries(await Promise.all(catalogue.languages.map(async info => [info.language,JSON.parse(await readFile(new URL(info.file,root),'utf8'))])));
const english = banks.english;
const first = english.levels[english.orders.main[0]], second = english.levels[english.orders.main[1]];
const all = Object.values(banks).flatMap(bank => Object.values(bank.levels));
function converted(raw,language='english') { return convertSourceLevel(raw,{ language,order:'main',position:1 }); }
function* permutations(items) {
  if (!items.length) { yield []; return; }
  for (let i=0;i<items.length;i++) for (const rest of permutations(items.filter((_,j)=>i!==j))) yield [items[i],...rest];
}
function paths(raw,target) { return findWordPaths(raw.letters.split(',').flatMap(row=>[...row]),target.word,null,null,{ rows:raw.height,cols:raw.width }); }

test('真实原包第1关和五种语言均可对照、按反序提交清空', () => {
  assert.equal(catalogue.total,13216);
  assert.equal(first.id,191596);
  assert.deepEqual(first.target_words.map(t=>t.word),['ICE','JOB','SUN']);
  for (const info of catalogue.languages) {
    const bank=banks[info.language], raw=bank.levels[bank.orders.main[0]], level=converted(raw,info.language);
    assert.deepEqual(level.source.original,raw);
    assert.equal(validateSourceLevel(level).validationMode,'source-invariant');
    const game=new SourceGameSession(level);
    for (const target of [...level.targets].reverse()) assert.equal(game.submit(target.path).accepted,true);
    assert.equal(game.status,'won'); assert.equal(game.total,0);
  }
});

test('主线重复序号保留，所有主线ID和全部关卡均存在', () => {
  for (const info of catalogue.languages) {
    const bank=banks[info.language];
    assert.equal(bank.orders.main.length,info.mainCount);
    assert.equal(new Set(bank.orders.all).size,info.count);
    assert.ok(bank.orders.main.every(id=>bank.levels[id]));
    assert.equal(Object.keys(bank.levels).length,info.count);
  }
  assert.ok(new Set(english.orders.main).size < english.orders.main.length);
});

test('原包多消耗集合只接受参考集合，拒绝时不扣次数、不标完成', () => {
  let selected;
  for (const raw of Object.values(english.levels)) {
    for (const target of raw.target_words) {
      const found=paths(raw,target), other=found.find(path=>signature(path)!==signature(found[0]));
      if (other) { selected={ raw,target,other }; break; }
    }
    if (selected) break;
  }
  assert.ok(selected);
  const level=converted(selected.raw), game=new SourceGameSession(level), before=game.snapshot();
  assert.equal(game.submit(selected.other).reason,'different-consumption');
  assert.deepEqual(game.snapshot(),before);
  const reference=level.targets.find(t=>t.word===selected.target.word);
  assert.equal(game.submit(reference.path).accepted,true);
  for (const target of game.pending) assert.equal(game.submit(target.path).accepted,true);
  assert.equal(game.status,'won');
});

test('同参考消耗集合的不同走法仍接受，提示始终使用参考集合', () => {
  let selected;
  for (const raw of Object.values(english.levels)) {
    for (const target of raw.target_words) {
      const found=paths(raw,target), alternate=found.slice(1).find(path=>signature(path)===signature(found[0]));
      if (alternate) { selected={ raw,target,alternate }; break; }
    }
    if (selected) break;
  }
  assert.ok(selected);
  const level=converted(selected.raw), game=new SourceGameSession(level), other=new SourceGameSession(level);
  assert.equal(game.submit(selected.alternate).accepted,true);
  assert.equal(other.submit(level.targets.find(t=>t.word===selected.target.word).path).accepted,true);
  assert.deepEqual(game.snapshot(),other.snapshot());
  while (game.pending.length) {
    const hint=game.hint(); assert.ok(hint);
    assert.equal(signature(hint.path),signature(game.initial.targets.find(t=>t.word===hint.word).path));
    assert.equal(game.submit(hint.path).accepted,true);
  }
  assert.equal(game.total,0);
});

test('真实18目标、9至10字母及高次数关卡支持不同完成顺序', () => {
  const large=all.find(raw=>raw.target_words.length===18);
  const long=all.find(raw=>raw.target_words.some(t=>t.word.length>8));
  const high=all.find(raw=>Math.max(...converted(raw).board.counts)>3);
  assert.ok(large && long && high);
  for (const raw of [large,long,high]) {
    const level=converted(raw), report=validateSourceLevel(level);
    assert.equal(report.valid,true,JSON.stringify(report.errors));
    assert.equal(report.stateCount,2**level.targets.length); assert.equal(report.stateChecks,0);
    for (let shift=0;shift<level.targets.length;shift++) {
      const order=[...level.targets.slice(shift),...level.targets.slice(0,shift)];
      if (shift%2) order.reverse();
      const game=new SourceGameSession(level);
      for (const target of order) {
        assert.equal(game.submit(target.path).accepted,true);
        assert.equal(game.audit(),true);
      }
      assert.equal(game.status,'won'); assert.ok(game.counts.every(n=>n===0));
    }
  }
});

test('小关卡的全部完成顺序均经实际提交清空', () => {
  const level=converted(second);
  let count=0;
  for (const order of permutations(level.targets)) {
    const game=new SourceGameSession(level);
    for (const target of order) assert.equal(game.submit(target.path).accepted,true);
    assert.equal(game.status,'won'); count++;
  }
  assert.equal(count,6);
});

test('原包额外词只记录一次，次数和目标完成集合不变', () => {
  const game=new SourceGameSession(converted(second));
  const target=second.extra_words.find(t=>t.word==='FRO'); assert.ok(target);
  const path=paths(second,target)[0], before=game.snapshot();
  assert.equal(game.submit(path).reason,'extra-word'); assert.ok(game.bonusCompleted.has('FRO'));
  assert.deepEqual(game.snapshot(),before);
  assert.equal(game.submit(path).isNew,false); assert.deepEqual(game.snapshot(),before);
  assert.equal(new SourceGameSession(game.initial).bonusCompleted.size,0);
});

test('原始数据导出完整保留，键顺序变化可导入，破损次数、目标和路径拒绝', () => {
  const raw=all.find(raw=>raw.obstacles?.length); assert.ok(raw);
  const level=converted(raw), roundtrip=JSON.parse(JSON.stringify(level));
  assert.deepEqual(roundtrip.source.original,raw);
  roundtrip.board={ counts:roundtrip.board.counts,letters:roundtrip.board.letters,cols:roundtrip.board.cols,rows:roundtrip.board.rows };
  roundtrip.config={ wordLengths:roundtrip.config.wordLengths,cols:roundtrip.config.cols,rows:roundtrip.config.rows };
  assert.equal(validateSourceLevel(roundtrip).valid,true);
  for (const mutate of [
    level=>level.board.counts[0]++,
    level=>level.board.letters[0]='!',
    level=>level.config.wordLengths[0]++,
    level=>level.targets[0].path=[-1],
    level=>level.targets[0].sourceType=999,
    level=>level.source.consumptionPolicy='any-path',
    level=>level.source.original.letters='broken'
  ]) {
    const broken=clone(level); mutate(broken);
    assert.equal(validateSourceLevel(broken).valid,false);
    assert.throws(()=>new SourceGameSession(broken),/完整校验/);
  }
  const session=new SourceGameSession(level); assert.ok(Object.isFrozen(session.initial.source.original));
});
