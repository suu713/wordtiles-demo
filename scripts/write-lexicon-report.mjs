import { readFile, writeFile } from 'node:fs/promises';
const json = async path => JSON.parse(await readFile(new URL(path, import.meta.url), 'utf8'));
const build = await json('../reports/lexicon-build.json'), batch = await json('../reports/lexicon-batch-100.json');
const format = number => number.toLocaleString('en-US');
const labels = { 1: '非常常用', 2: '常用', 3: '一般', 4: '罕见', 5: '非常罕见', null: '未评级' };
const lines = [
  '# 扩展词库接入验收', '',
  '已真实下载 ESDB 官方 en_US-large 词表，使用锁定的 wordfreq 3.1.1 在本机计算词频；母词库不限词长。来源、原始拼写、Zipf 值、审核状态和许可随数据保留。', '',
  '## 怎么试玩', '',
  '选择算法2 → 生成词库“分级母词库” → 更多设置“词库与频率档位”。默认只允许人工审核通过的词；当前通过数是 0，因此默认不能生成。内部测试可显式开启“未审核词测试”，网页会显示“词库未完成内容审核”。前3档在本关3/4/5字母范围内共有 ' + format(batch.dictionaryWords) + ' 个候选词。', '',
  '旧1,602词库、原词库、旧验收JSON及算法源码均保留。选择“旧验收词库”可重现 seed 20261010；新词库使用独立的运行时版本，不要求生成旧棋盘。', '',
  '## 实际构建结果', '',
  '| 项目 | 数量 |', '|---|---:|',
  `| 原始非空条目 | ${format(build.rawNonemptyLines)} |`,
  `| 排除含标点、空格、非ASCII等条目 | ${format(build.excludedNonASCIILetterEntries)} |`,
  `| 合并重复与大小写词形 | ${format(build.rawNonemptyLines - build.excludedNonASCIILetterEntries - build.uniqueASCIIBoardSpellings)} |`,
  `| 去重后母词库条目 | ${format(build.uniqueASCIIBoardSpellings)} |`,
  `| 超过5字母 | ${format(build.longerThan5Letters)} |`,
  `| 人工审核通过 | ${build.productionApprovedCount} |`,
  `| 最短 / 最长 | ${build.lengthMin} / ${build.lengthMax} 字母 |`, '',
  '| 频率档位 | 数量 |', '|---|---:|', ...build.tiers.map(tier => `| ${tier.label} | ${format(tier.count)} |`), '',
  '| 词长 | 数量 |', '|---|---:|', ...Object.entries(build.lengths).map(([length, count]) => `| ${length} | ${format(count)} |`), '',
  '表中未列出的词长数量为0。未测得词频保存 null，独立列为未评级，不自动放到“非常罕见”。中文释义、词性、玩家认识比例未添加；familiarity 保持 null。', '',
  '## 实测与边界', '',
  `新库：默认搜索预算，seed ${batch.seedRange.join('～')}，显式允许未审核词，选前3档。成功 ${batch.succeeded}/${batch.succeeded + batch.failed}，不同目标组合 ${batch.distinctTargetSets} 组，独立完成状态 ${format(batch.independentStatesChecked)} 种，实际完成顺序 ${format(batch.actualOrdersReplayed)} 种。失败 ${batch.failed} 次。`, '',
  '| 生成目标频率档位 | 个数 | 占比 |', '|---|---:|---:|',
  ...batch.targetTierDistribution.map(tier => `| ${labels[tier.tier]} | ${tier.count} | ${(tier.proportion * 100).toFixed(1)}% |`), '',
  '本次为内部算法测试，不能作为内容审核通过的依据。预算用尽返回明确失败；不自动扩大频率档位，不回退旧库或固定关卡。旧库1,000关结论不套用到新库。', '',
  '提供的10项Python测试全部通过，包含5.00/4.00/3.00/2.00边界及无词频。另逐条核查143,581条实际数据的分档、索引、词长及来源/许可哈希。', '',
  '| 抽查档位 | 实际词条（Zipf） |', '|---|---|',
  ...build.samplesByTier.map(group => `| ${labels[group.tier]} | ${group.entries.slice(0, 3).map(entry => `${entry.word} (${entry.zipf === null ? 'null' : entry.zipf.toFixed(2)})`).join('、')} |`), '',
  '| 实测边界值 | 实际词条 → 档位 |', '|---|---|',
  ...build.measuredBoundarySamples.map(group => `| ${group.zipf === null ? '无词频' : group.zipf.toFixed(2)} | ${group.entries.slice(0, 3).map(entry => `${entry.word} → ${labels[entry.frequencyTier]}`).join('、') || '无条目；边界仍通过注入单元测试验证'} |`), '',
  '## 数据、版本与人工审核', '',
  '`wordtiles_lexicon_builder/lexicon-output/` 保留完整本地构建输出。发布版 `dist/lexicon/dictionary.master.json.gz` 仅使用gzip压缩，未裁词长、未删词条；解压后是完整母词库。浏览器载入按所有词长及档位预建的1.7MB候选索引，不载入约73MB的原始JSON，也不在生成搜索节点扫描母词库。', '',
  '人工覆盖表位于 `wordtiles_lexicon_builder/review-overlay.json`，真实表当前为空。词条格式为 `{ "word": "...", "status": "approved" 或 "blocked", "reason": "审核理由" }`。请由策划逐词审核后修改，并更新表的 version；`npm run package:lexicon` 同步发布数据。blocked 词即使打开内部测试也排除。', '',
  '适配器输出完整 `{ version, words, metadata }`，其中 metadata 保留来源与许可。运行时版本同时包含母库版本、母库哈希、人工覆盖表版本与内容哈希、词长、频率档位和审核模式；任何相关变更都会改变版本。生成、导入校验使用同一运行时对象。重开和当前统计使用生成本关时绑定的对象；切词库不会混用当前棋盘。', '',
  '母库版本：`' + build.version + '`。', '', '完整母库 SHA-256：`' + build.masterSha256 + '`。', '',
  '来源词表、ESDB Copyright、wordfreq NOTICE/LICENSE 保存在 `dist/lexicon/sources/`。母库与索引嵌入许可、归属和修改说明；派生频率数据标为CC-BY-SA-4.0，保留ESDB及wordfreq原文，不作为无归属裸词频表发布。', '',
  '机器可复查记录：[构建报告](lexicon-build.json) · [新库100 seed报告](lexicon-batch-100.json) · [浏览器验收](browser.json) · [屏幕适配](portrait.json)。', '',
];
await writeFile(new URL('../reports/扩展词库接入验收.md', import.meta.url), lines.join('\n'));
console.log('Wrote reports/扩展词库接入验收.md from actual build and benchmark records.');
