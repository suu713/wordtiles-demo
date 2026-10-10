# 接入 Word Tiles V1 生成算法

当前 Demo 已经实现。本次仅接入此目录的生成算法，不重新搭建项目、不重写界面、不改玩法规则。

## 执行要求

1. 先阅读现有工程中的关卡数据类型、生成按钮、词库加载、校验入口、Worker、初始数据和游玩状态的关系。复用原有结构与渲染，不替换整个 Demo。
2. 参考 `README_接入说明.md`。把 `wordtiles-algorithm.ts` 接入现有逻辑目录；纯 JavaScript 项目可使用 `dist/wordtiles-algorithm.js`。`LevelData` 保持上一版字段：schemaVersion、rulesVersion、generatorVersion、dictionaryVersion、seed、rows、cols、maxCellUses、letters、initialCounts、targets；目标字段为 id、word、canonicalPath。
3. 先使用随包 `dictionary.json` 完成对接测试，保留原词库文件，不擅自删除。传给生成器的是 `{version, words}`，不是单独的数组。新关卡的生成和导入校验共用同一份词库；项目若检查词库版本，也应统一版本配置。不得靠跳过白名单校验来让样例通过。
4. 生成按钮调用 `generateLevel(config, dictionary, seed)`。预算使用默认 10,000 / 30 / 300,000。界面不需要新增棋盘大小、目标词数量或难度档位。
5. 搜索放在已有 Worker 中；没有 Worker 时参考随包 `generator.worker.ts`。该函数同步执行，简单包进 Promise 不会消除主线程阻塞。真正取消要终止 Worker；保留请求 ID，防止迟到结果覆盖新关。参考脚本必须在实际浏览器中联调。
6. `result.ok === true` 时，将 `result.level` 交给原关卡加载器；不是加载整个 result，也不是把 targets 当玩家必须执行的固定顺序。初始数据不能被游玩过程改写。保持新关和重开时的状态隔离。
7. 生成失败时保留当前关卡，显示 message，调试区记录 code 和 stats。不得自动加载固定样例并标记为生成成功；不得降低规则或导入未完全校验的候选。
8. JSON 导入使用 `validateLevel(json, dictionary)` 或与其等价且通过相同测试的既有校验器。生成成功的 validation 中包含每词有序路径数、消耗集合数及32状态检查结果，可接到现有调试面板。
9. 每词的合法滑动顺序可以多于一条，但消耗集合必须唯一。不要把玩家操作限制成 canonicalPath 的固定顺序。松手才提交；经过 FEE 时不能提前消费，必须允许继续连成 FEED。
10. 不需要把独立测试中的120种完成顺序回放放进界面生成按钮；生成器已经执行完整32状态校验，顺序回放属于回归测试。

## 接入验收

- 跑通原固定样例；EYE 正反路径均可接受。
- 同一词库、默认预算、seed=20261010 时得到 `examples/seed_20261010.json` 的初始棋盘和目标。
- EAT、LOT、OAT、NEAT、CLOTH 可任意顺序完成，次数不为负，最后清空。
- 生成中的取消、连续点击生成、重开、切关不让旧结果覆盖新状态。
- 非目标词和已完成词不扣次数；空位不能跨越；格子消失后不重新排列。
- 按相同种子再次生成可以复现；“生成新关”继续使用现有新的uint32种子机制，不在核心搜索中混入 Math.random。
- 单次生成失败能正确显示，旧关卡保持不变。
- 先编译当前 TS，再运行 `node tests.mjs` 与 `node benchmark.mjs 1000`，避免测试旧编译文件。
- 浏览器中实际操作几关，特别检查松手提交、前缀词、重开和次数扣减；算法测试不能替代这些界面测试。

交付时说明修改了哪些模块、实际浏览器验收结果、未完成部分和问题。不要仅凭本包现成测试报告声称现有 Demo 已经通过验收。
