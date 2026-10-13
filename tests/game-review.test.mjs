import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {WORD_ENTRIES,BONUS_DICTIONARY,wordEntryFor,sourceHasWord,packageHasWord,GAME_POLICY_VERSION} from '../dist/core/word-source.js';
import {createBaseDictionary,isTargetAllowed} from '../dist/core/target-policy.js';
import {createWordCollection,COLLECTION_KEY} from '../dist/core/word-collection.js';
import {convertSourceLevel,validateSourceLevel,SourceGameSession} from '../dist/core/source-levels.js';
import {calculateLevelStatistics,reachableDictionaryWords} from '../dist/core/level-statistics.js';
import {createAlgorithmSession} from '../dist/core/algorithm-v1-adapter.js';
import {findWordPaths,GameSession} from '../dist/core/rules.js';
const json=async p=>JSON.parse(await readFile(new URL(p,import.meta.url),'utf8'));
const memory=()=>{const m=new Map();return {getItem:k=>m.get(k)||null,setItem:(k,v)=>m.set(k,v)};};

test('BRA原始来源与21094条逐词审计可复核，原表字节不改',async()=>{
 const bytes=await readFile(new URL('../data/words.tsv',import.meta.url));
 assert.equal(bytes.toString('utf8').split(/\r?\n/)[2230],'BRA\t3\tn. 奶罩');
 assert.equal(createHash('sha256').update(bytes).digest('hex'),'9c5b22c2b9949cb493f111d1ab5b1cc1da10f6b9ecb1fbf6e2546a019a1258c6');
 const audit=await json('../reports/game-word-review.json'),rows=(await readFile(new URL('../reports/game-word-review.tsv',import.meta.url),'utf8')).trimEnd().split('\n').slice(1).map(l=>l.split('\t'));
 assert.equal(rows.length,21094);assert.equal(new Set(rows.map(r=>r[0])).size,21094);assert.equal(rows.filter(r=>r[3]==='allow').length,6135);assert.equal(audit.rejectedSourceCount,14959);
 assert.equal(audit.bra.distinctTargetLevels,21);assert.equal(audit.bra.distinctExtraLists,34);assert.equal(audit.bra.mainTargetPositions.length,34);assert.equal(audit.bra.mainExtraPositions.length,45);
 assert.equal(audit.bra.raw.decision,'allow');assert.equal(audit.bra.raw.reason,'original-package-exemption');
});

test('原包全部6791英文词不禁用，保留目标与额外用途，只有释义的词不冒充原包答案',async()=>{
 const original=await json('../data/game-review/original-package.json');
 for(const word of original.languages.english){assert.equal(sourceHasWord(word),true,word);assert.equal(packageHasWord(word),true,word);assert.ok(BONUS_DICTIONARY.words.includes(word),word);}
 for(const word of original.targetWordsByLanguage.english)assert.equal(isTargetAllowed(word),true,word);
 for(const word of ['BRA','WINE','BET','NAKED','LAD','OAT'])assert.equal(isTargetAllowed(word),true,word);
 for(const word of ['RATED','ASS','SEX','COCK','PENIS'])assert.equal(packageHasWord(word),true,word);
 for(const word of ['RATED','COCK','PENIS','DELL'])assert.equal(isTargetAllowed(word),false,word);
 for(const word of ['NAT','FUCK','PUSSY','TIT','BOA','XYZ'])assert.equal(packageHasWord(word),false,word);
});

test('正常词不因不合适的中文义项禁用，BRA和常用词显示经过校订的义',()=>{
 assert.equal(wordEntryFor('BRA').definition,'n. 文胸；胸罩');assert.equal(wordEntryFor('GOOSE').definition,'n. 鹅');
 assert.equal(wordEntryFor('NATURAL').definition,'adj. 自然的；天然的');assert.equal(wordEntryFor('PRIVATE').definition,'adj. 私人的；私立的');assert.equal(wordEntryFor('KOALA').definition,'n. 考拉；树袋熊');
 assert.ok(WORD_ENTRIES.every(e=>!/(性交|阴部|白痴|奶罩|傻瓜|黑鬼)/u.test(e.definition)));
 assert.equal(sourceHasWord('AMOUR'),true);assert.equal(wordEntryFor('AMOUR').definition,'');
 assert.ok(WORD_ENTRIES.filter(e=>e.tier===null).every(e=>e.originalPackageWord));
});

test('旧收藏和旧归档里的原包词恢复，五语言及首次日期保留，其他浏览器数据不改',()=>{
 const storage=memory(),date='2026-10-10T12:00:00.000Z';storage.setItem('unrelated','keep');
 storage.setItem(COLLECTION_KEY,JSON.stringify({version:2,policyVersion:'old',entries:['CAT','GOOSE','NATURAL'].map(word=>({word,language:'english',firstFoundAt:date})),archivedEntries:[...['BRA','RATED','NAT'].map(word=>({word,language:'english',firstFoundAt:date})),{word:'AÑO',language:'spanish',firstFoundAt:date}]}));
 const c=createWordCollection(storage);assert.equal(c.size,6);assert.ok(c.entries().every(e=>e.firstFoundAt===date));assert.ok(c.entries().some(e=>e.word==='BRA'));assert.ok(c.entries().some(e=>e.word==='RATED'));
 const saved=JSON.parse(storage.getItem(COLLECTION_KEY));assert.equal(saved.policyVersion,GAME_POLICY_VERSION);assert.deepEqual(saved.archivedEntries.map(e=>e.word),['NAT']);assert.equal(storage.getItem('unrelated'),'keep');assert.equal(createWordCollection(storage).size,6);
});

test('BRA可连时按本关额外词接收，不扣次数、重复不新增，并显示统计',()=>{
 const raw={id:1,width:3,height:3,letters:'BRA,AAR,RGT',target_words:['BAR','RAG','ART'].map(word=>({word,type:0})),extra_words:[{word:'BRA',type:0}]};
 const level=convertSourceLevel(raw,{language:'english'}),g=new SourceGameSession(level),before=g.snapshot(),path=findWordPaths(level.board.letters,'BRA',null,null,level.board)[0];
 assert.deepEqual(g.submit(path),{accepted:false,reason:'extra-word',word:'BRA',isNew:true});assert.deepEqual(g.snapshot(),before);assert.equal(g.submit(path).isNew,false);
 assert.deepEqual(calculateLevelStatistics(level,BONUS_DICTIONARY).extraWords,['BRA']);
});

test('全部BRA目标关可玩并清空，五语言词表准确来自未改写的原包列表',async()=>{
 const catalogue=await json('../dist/source-levels/catalogue.json'),manifest=await json('../dist/original-word-policy.json');let total=0,bra=0;
 for(const info of catalogue.languages){const bank=await json('../dist/source-levels/'+info.file);total+=Object.keys(bank.levels).length;
  const words=[...new Set(Object.values(bank.levels).flatMap(l=>[...l.target_words,...l.extra_words].map(e=>e.word)))].sort();assert.deepEqual(manifest.languages[info.language],words);
  for(const word of words)assert.equal(packageHasWord(word,info.language),true,word);
  const first=convertSourceLevel(bank.levels[bank.orders.main[0]],{language:info.language});assert.equal(validateSourceLevel(first).valid,true);
  if(info.language==='english')for(const raw of Object.values(bank.levels).filter(l=>l.target_words.some(t=>t.word==='BRA'))){const g=new SourceGameSession(convertSourceLevel(raw,{language:'english'}));for(const t of [...g.initial.targets].reverse())assert.equal(g.submit(t.path).accepted,true);assert.equal(g.status,'won');assert.ok(g.counts.every(n=>n===0));bra++;}
 }
 assert.equal(total,13216);assert.equal(bra,21);
});

test('多语言及长词额外词不受算法2的ASCII和8字母限制',async()=>{
 for(const lang of ['russian','portuguese','spanish','turkish','english']){const bank=await json('../dist/source-levels/'+lang+'.json');
  const raw=Object.values(bank.levels).find(l=>l.extra_words.some(e=>lang==='english'?e.word.length>8:/[^A-Z]/u.test(e.word)));assert.ok(raw,lang);
  const level=convertSourceLevel(raw,{language:lang}),g=new SourceGameSession(level),word=raw.extra_words.find(e=>lang==='english'?e.word.length>8:/[^A-Z]/u.test(e.word)).word;
  const path=findWordPaths(level.board.letters,word,null,null,level.board)[0];assert.ok(path,word);const before=g.snapshot();assert.equal(g.submit(path).reason,'extra-word');assert.deepEqual(g.snapshot(),before);
  const bonus={version:'packaged-extra',words:[word]},generic=new GameSession(level,null,{validator:validateSourceLevel,bonusDictionary:bonus});
  assert.equal(generic.submit(path).reason,'extra-word');assert.ok(reachableDictionaryWords(level.board,bonus).includes(word));
 }
});

test('未审核非原包词不能注入额外库；旧词库缓存失败保留完整校验',async()=>{
 const d=createBaseDictionary([3,3,3,4,5]),fixture=await json('../examples/tsv/seed_20261010.json');assert.throws(()=>createAlgorithmSession(fixture,d,{bonusDictionary:{version:'raw',words:['CAT','NAT']}}),/未通过审核/);
 assert.doesNotThrow(()=>createAlgorithmSession(fixture,d,{bonusDictionary:{version:'subset',words:['BRA','RATED']}}));
 const old=await json('../examples/history/tsv-v1-seed_20261010.json');assert.throws(()=>createAlgorithmSession(old,d));
});
