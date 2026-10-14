import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {collectionMonthCells, groupCollectionDays, collectionMonthGroups, shiftCollectionMonth} from '../dist/core/collection-calendar.js';

test('月历从星期一开始：2026年10月1日为星期四，日期不缺失、不重复', () => {
  const cells = collectionMonthCells({year:2026,month:9}, new Map([['2026-10-14',[{word:'CAT'},{word:'DOG'}]]]));
  assert.equal(cells.length,35);
  assert.deepEqual(cells.slice(0,7).map(cell=>cell?.day||null),[null,null,null,1,2,3,4]);
  assert.deepEqual(cells.filter(Boolean).map(cell=>cell.day),Array.from({length:31},(_,i)=>i+1));
  assert.equal(cells.find(cell=>cell?.date==='2026-10-14').count,2);
  assert.equal(cells.at(-1),null);
});

test('跨年、闰年及六行月份正确，越界月份不会生成错位日期', () => {
  assert.deepEqual(shiftCollectionMonth({year:2026,month:11},1),{year:2027,month:0});
  assert.deepEqual(shiftCollectionMonth({year:2026,month:0},-1),{year:2025,month:11});
  assert.equal(collectionMonthCells({year:2024,month:1}).filter(Boolean).length,29);
  assert.equal(collectionMonthCells({year:1900,month:1}).filter(Boolean).length,28);
  assert.equal(collectionMonthCells({year:2000,month:1}).filter(Boolean).length,29);
  assert.equal(collectionMonthCells({year:2026,month:2}).length,42);
  assert.deepEqual(collectionMonthCells({year:2026,month:12}),[]);
  assert.equal(shiftCollectionMonth({year:1,month:0},-1),null);
});

test('收词日期按当地日期分组，跨UTC午夜不串到前一天；无效旧时间不伪造记录', () => {
  const moduleURL = new URL('../dist/core/collection-calendar.js',import.meta.url).href;
  const script = `import {groupCollectionDays} from ${JSON.stringify(moduleURL)};
    const records=[{word:'CAT',language:'english',firstFoundAt:'2026-10-13T17:00:00.000Z'},
      {word:'DOG',language:'english',firstFoundAt:'invalid'},
      {word:'BAG',language:'english',firstFoundAt:''}];
    process.stdout.write(JSON.stringify([...groupCollectionDays(records).keys()]));`;
  for (const [zone,expected] of [['Asia/Shanghai','2026-10-14'],['America/Los_Angeles','2026-10-13']]) {
    const result = spawnSync(process.execPath,['--input-type=module','-e',script],{env:{...process.env,TZ:zone},encoding:'utf8'});
    assert.equal(result.status,0,result.stderr);
    assert.deepEqual(JSON.parse(result.stdout),[expected]);
  }
});

test('月／日筛选只读取首次收词记录，不混入相邻月份，不改原收藏数据', () => {
  const entries=[
    {word:'DOG',language:'english',firstFoundAt:new Date(2026,9,14,12).toISOString()},
    {word:'CAT',language:'english',firstFoundAt:new Date(2026,9,14,12).toISOString()},
    {word:'BAG',language:'english',firstFoundAt:new Date(2026,9,12,12).toISOString()},
    {word:'MAP',language:'english',firstFoundAt:new Date(2026,8,30,12).toISOString()},
  ];
  const original=structuredClone(entries),days=groupCollectionDays(entries);
  assert.deepEqual(collectionMonthGroups(days,{year:2026,month:9}).map(([date])=>date),['2026-10-14','2026-10-12']);
  assert.deepEqual(collectionMonthGroups(days,{year:2026,month:9},'2026-10-14')[0][1].map(entry=>entry.word),['CAT','DOG']);
  assert.deepEqual(collectionMonthGroups(days,{year:2026,month:9},'2026-10-13'),[]);
  assert.deepEqual(entries,original);
});
