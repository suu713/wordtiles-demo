# Word Tiles V1｜可接入 Demo 的生成算法

## 1. 这次交付什么

这是一个独立的 TypeScript 算法模块，不是另做一套 Demo。沿用前一版的 `LevelData` JSON 字段，负责“生成初始关卡”和“校验关卡安全性”；不负责 UI、动画、滑动输入、广告、道具或难度分级。

已附编译后的原生 ES Module JavaScript，算法本身无第三方运行时依赖，不需要联网查词。没有访问或改动你的 Demo 源码；具体按钮和状态管理由 Codex 对接。

## 2. 文件用途

| 文件 | 用途 |
|---|---|
| `wordtiles-algorithm.ts` | 算法源代码，主要接入这个文件 |
| `dist/wordtiles-algorithm.js` | 已编译的 JavaScript，纯 JS 项目可直接引用 |
| `dist/wordtiles-algorithm.d.ts` | 类型定义 |
| `dictionary.json` | 1,602 个测试候选词，286 个三字母、612 个四字母、704 个五字母 |
| `generator.worker.ts` / `dist/generator.worker.js` | 后台线程的消息适配脚本，不是自动化或服务器任务 |
| `fixture.json` | 前一版固定验收关卡 |
| `examples/seed_20261010.json` | 本次算法真实生成的新关卡，可用于接入后验收 |
| `examples/seed_000000.json`～`seed_000019.json` | 20 份独立关卡 JSON |
| `generated-levels-first-100.json` | seed 0～99 的批量数组，不是单个关卡，不要直接交给只接受单关的导入器 |
| `tests.mjs` | 33 项自动测试 |
| `independent-check.mjs` | 不导入生成器的独立检查器 |
| `benchmark.mjs` | 批量生成、复现、独立校验与顺序回放 |
| `测试报告.md` / `benchmark-results.json` | 本次实际测试结果及逐 seed 记录 |
| `交给Codex的接入指令.md` | 可以直接交给 Codex 的接入要求 |

测试词库是手工整理的候选集合，**没有按英语词频、受众年龄、词义歧义、文化敏感性、产品适龄规范完成审核**。不能把算法生成成功理解为每个词都适合上线。为便于验证算法，先使用随包词库；之后再替换为产品白名单并重新测试。

## 3. 本版不能改动的玩法规则

固定 3×3，九格初始都有字母；格子编号为从左到右、从上到下的 0～8。只允许上下左右连接，可转弯；不斜连、不跳格、不跨空位、不行尾跨行；同一条路径不重复用格，不同目标可以共用格子。

每关固定五个不同的目标词，长度为 3、3、3、4、5；每格次数为 1～3，次数总和必须为 18。次数由答案的格子需求反算，不是独立随机。

目标顺序不限制。只在松手后提交完整目标；非目标和已完成目标不消耗次数。归零格保留空间占位，其他格子不移动。

**每个目标的所有合法路径，必须消耗同一组格子。** 不强求滑动方向唯一：EYE 正反方向经过相同三格可以同时接受。不同目标消耗相同格子集合也不违反规则，例如某些可逆词；本版没有额外禁止这种组合。

## 4. 核心算法

### 4.1 词库预处理

要求输入 `{ version, words }`。先去除首尾空格、转为大写，剔除不符合 `^[A-Z]{3,5}$` 的条目，再去重并按字母排序。异常条目的原始下标、重复数和接受数量会返回到 `dictionaryReport`。

按长度建立三个分组。最低可搜索条件是：至少三个不同的三字母词、一个四字母词、一个五字母词；这只表示够填五个词槽，**不表示这些词一定能组成合格布局**。

### 4.2 同时选择单词和路径

词槽顺序是 `[5,4,3,3,3]`，先处理长词。每个词槽先用带种子的 Fisher–Yates 洗牌打乱候选词；为当前候选词通过 DFS 枚举兼容路径。

路径合法条件：目标格本次没用过；与上一格四向相邻；当前格为空或已有同一个字母；该格当前引用次数小于 3。

空格仅在“铺词”过程中允许承接字母。用于校验真实路径的找词函数，绝不能把空格当通配符。

### 4.3 优先让覆盖逐步展开，而不是前两个词立刻填满棋盘

第一词自然覆盖五个新格。之后，对当前候选词的路径采用以下软排序：

```text
期望新增格数 = ceil(当前空格数 × 当前词长度 / 尚未放置的所有词总长度)
排序分 = abs(这条路径实际新增格数 - 期望新增格数)
```

分数小的先尝试；同分保留带种子洗牌后的顺序。常见的尝试倾向是依次新增 `5、2、1、1、0` 个格子，但不是必须按这个数放置，也不保证最终每关如此。

目的是为后面的短词留一点调整空间，避免优先把字母全部固定后只剩很少可选词。这只是搜索优先级，**不增加额外通关规则，也不作为难度评分**。

### 4.4 放置后剪枝

每条路径在新的小状态副本上放置，失败直接丢弃副本，不原地误删共享字母。

安全剪枝包括：剩余单词总长度不足以覆盖空格；或者某个已放目标在已固定的字母上已经出现两种不同的消耗集合。后续只会填更多格子，不会移除已经存在的两种连法，所以后者可以提前淘汰。

同词不同消耗集合用 9 位位掩码判断：每格对应一个二进制位。这样判断的是集合，不是有序路径。铺词阶段不能按此提前合并不同方向；只有棋盘字母固定后才能用于消耗集合判定。

### 4.5 重算次数、独立终检

五个词放完，九格都被使用，才构造候选关卡。初始次数从目标参考路径重新累加，然后独立搜索最终棋盘中每个目标的全部路径，确认每个目标只有一种消耗集合，并逐格对比真实需求。

然后逐一检查全部 32 种“哪些目标已完成”的状态。每种状态必须：剩余次数非负；每个未完成目标仍有合法路径；路径的消耗集合不变；剩余总次数等于剩余目标的总字母数；全部目标完成后清零。

**校验完全结束才返回成功。** 查到一个解不等于通过；途中预算耗尽不等于通过。

### 4.6 预算与重试

默认参数沿用前一版：每次尝试 10,000 节点、最多 30 次尝试、总共不超过 300,000 节点。DFS 递归访问、候选分支和最终校验搜索均计入预算；词库预处理与洗牌开销不以毫秒方式限额，所以预算不是耗时承诺。

单次预算耗尽后，从空棋盘重新开始，用同一随机数发生器继续产生新的确定性尝试顺序。总预算或尝试数耗尽，返回明确失败；不自动换成样例、不修改规则。

如果某一次在没有中断的情况下确实完整遍历了搜索树，返回 `SEARCH_EXHAUSTED`；其他预算失败仅表示“当前预算内没有找到”。

## 5. 对接接口

### 5.1 最小调用（放在已有 Worker 或其他不会阻塞 UI 的逻辑里）

```ts
import { generateLevel, validateLevel } from "./wordtiles-algorithm";

// dictionary 是读取 dictionary.json 后得到的对象，不是只有 words 数组。
const result = generateLevel(
  { maxNodesPerAttempt: 10_000, maxAttempts: 30, maxTotalNodes: 300_000 },
  dictionary,
  20261010,
);

if (!result.ok) {
  // 保留当前关卡；显示 result.message；记录 result.code 和 result.stats。
  console.warn(result.code, result.message, result.stats);
} else {
  // 只把 result.level 交给现有加载器；不要把整个 result 当关卡。
  // 成功结果已校验，导入入口仍可使用同一个校验器复查。
  const check = validateLevel(result.level, dictionary);
  if (!check.ok) throw new Error(check.errors.join("\n"));
  loadExistingDemoLevel(result.level); // 替换为你 Demo 原有的加载函数。
}
```

`loadExistingDemoLevel` 是接入位置的示意名，不是包内函数。JavaScript 项目从 `dist/wordtiles-algorithm.js` 导入即可。

### 5.2 成功和失败返回

```ts
// 成功
{
  ok: true,
  level,             // 与上一版兼容的 LevelData
  validation,        // 每词路径数、集合数、32状态校验结果
  stats,             // 尝试数、搜索节点、剪枝次数等
  dictionaryReport   // 词库清洗结果
}

// 可预期的失败
{
  ok: false,
  code,
  message,
  stats,
  dictionaryReport   // 输入错误时可能没有此字段
}
```

错误码包括 `INVALID_INPUT`、`DICTIONARY_INSUFFICIENT`、`SEARCH_BUDGET_EXCEEDED`、`SEARCH_ATTEMPTS_EXCEEDED`、`SEARCH_EXHAUSTED`、`CANCELLED`。

`GeneratorConfig` 只接受三个预算参数。尺寸、次数和词长暂不开放修改；传入未知配置字段会报错，避免误以为已生效。

### 5.3 独立校验与提示找路

```ts
validateLevel(importedJson, dictionary);
findWordPaths(level.letters, word, state.remainingCounts);
```

校验入口接受 `unknown`，错误 JSON 返回错误报告，不会为了通过校验自动修正初始次数或替换目标。`findWordPaths` 返回全部实际有序路径；找提示可取第一条，但不能用“找到第一条就停”代替生成阶段的唯一性检查。

`dictionaryVersion` 记录生成时的词库版本。校验器检查目标是否在当前传入白名单中；没有强制要求待验关卡版本字符串与传入词库版本一致，以便旧样例能用扩充后的白名单校验。项目有严格版本隔离需求时，应在加载器中另行判断，不能跳过白名单。

## 6. Worker 接入示例

`generateLevel` 是同步函数，不会因为使用 Promise 而自动移到其他线程。优先复用你 Demo 已有的生成 Worker。

没有现成 Worker 时，可以将 `dist/` 与 `dictionary.json` 一并放到同源静态目录，例如 `/wordtiles/`，用下面的逻辑接入；回调改成现有 Demo 的界面和加载函数。

```js
let activeWorker = null;
let activeRequestId = 0;

export function cancelGeneration() {
  activeRequestId++;
  activeWorker?.terminate();
  activeWorker = null;
}

export function startGeneration(dictionary, seed, onSuccess, onFailure, onProgress) {
  cancelGeneration();
  const requestId = activeRequestId;
  const worker = new Worker("/wordtiles/dist/generator.worker.js", { type: "module" });
  activeWorker = worker;

  const finish = () => {
    worker.terminate();
    if (activeWorker === worker) activeWorker = null;
  };
  worker.onmessage = ({ data }) => {
    if (requestId !== activeRequestId || data.requestId !== requestId) return;
    if (data.type === "PROGRESS") { onProgress?.(data.stats); return; }
    finish();
    if (data.type === "RESULT") {
      if (data.result.ok) onSuccess(data.result.level, data.result);
      else onFailure(data.result.message, data.result);
    } else onFailure(data.message, data);
  };
  worker.onerror = (event) => {
    finish();
    if (requestId === activeRequestId) onFailure(event.message || "生成线程错误");
  };
  worker.postMessage({ requestId, dictionary, seed, config: {} });
}
```

静态目录路径是示例，需要按项目实际部署路径调整。使用现有 TypeScript 构建体系时也可以引用 `generator.worker.ts`。

取消必须 `terminate()` 当前 Worker 或使用项目已经实现的真正可中断机制。**同步搜索期间再给同一个 Worker 发一条 cancel 消息，不能立即打断正在执行的函数。** 请求编号用于拒绝迟到消息；重开、切关或销毁界面时也要取消旧请求。

本包不实现后台长期任务。Worker 只在页面当前生成操作期间工作，结束或取消后应终止。

## 7. 示例关卡

使用随包词库、默认预算、seed `20261010`，本次生成结果为：

```text
C(1)  L(2)  T(3)
T(2)  O(3)  A(3)
H(1)  N(1)  E(2)
```

目标是 EAT、LOT、OAT、NEAT、CLOTH。完整 JSON 在 `examples/seed_20261010.json`。先让 Demo 的生成和校验都接入同一份词库；否则旧白名单缺少这些词时，导入器应正常拒绝，而不是绕过检查。

## 8. 测试与编译

已附 `dist`，可以在此目录直接运行：

```sh
node tests.mjs
node benchmark.mjs 1000
```

测试脚本会更新本目录的测试结果文件，不会改动你的 Demo。

修改 TypeScript 后，要先用项目已有的 TypeScript 工具链重新编译，再测试。包内提供 `tsconfig.json`，本次使用 TypeScript 5.8.3 编译、Node.js 22.16.0 运行。不要修改 TS 后继续测试旧的 dist 文件而误以为改动已验证。

```sh
tsc -p tsconfig.json
node tests.mjs
```

算法内部采用可复现的有界搜索：相同算法版本、相同规范化词库内容及版本、相同配置和 seed，生成相同关卡；词库改动后不承诺原 seed 仍对应原关卡，需要重现时保存完整 JSON。

## 9. 本次验证范围与试玩重点

本次测试了算法源代码对应的编译产物、独立检查器、规则边界、数据防错、确定性和批量关卡。**没有测试你的 Demo 的输入、动画、浏览器 Worker 消息链路或手机性能。** Worker 适配代码已随项目编译，但仍需在实际项目中联调。

先试玩判断：单词是否容易想到、前缀词是否带来重复感、格子消失的节奏是否清晰、5 个目标是否过短。当前算法保证输出规则正确，不保证关卡难度均衡、词义风格统一或体验已经好玩。不要把生成成功率当作玩家通关率。
