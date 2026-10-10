# WordTiles · 本地关卡编辑器 V5

桌面左侧关卡编辑器、右侧 9:16 竖屏试玩，完整适配一个浏览器屏幕，无手机外框。手机首屏显示游戏，点击“关卡”打开编辑器。说明通过悬停或键盘焦点显示，设置与文件操作集中在下拉入口。全部关卡、词库和计算都在浏览器内完成，无需 GPT 登录。

## 在线试玩与源码

- 在线试玩：[https://suu713.github.io/wordtiles-demo/](https://suu713.github.io/wordtiles-demo/)
- GitHub 源码：[suu713/wordtiles-demo](https://github.com/suu713/wordtiles-demo)

GitHub Pages 直接托管 `dist/`，无需登录。推送 `main` 后，GitHub Actions 使用 Node 24 重新编译算法、运行规则测试及 1,000 个 seed 的完整验收，再发布静态网页。

下载源码后也可本地运行：

```powershell
git clone https://github.com/suu713/wordtiles-demo.git
cd wordtiles-demo
npm start
```

## 打开与启动

当前地址：[http://127.0.0.1:4173/?v=6](http://127.0.0.1:4173/?v=6)。选择“算法2 · 回溯生成 V1”，点击种子旁的“生成”即可检查 seed 20261010 的新算法示例。

服务未启动时，双击本目录的 `Start-WordTiles.cmd`，或使用 Node.js 20+：

```powershell
cd .\wordtiles-demo
npm start
```

启动脚本优先使用已安装的 Node，找不到时尝试本机 Codex 附带的 Node。服务只绑定本机地址，默认端口 4173，可通过 `PORT` 修改端口。请保持服务运行；模块、词库和生成线程需要通过 HTTP 加载。

## 算法1 · 原包关卡

使用用户提供的 `Word+Tiles+-+Relaxing+Puzzle_1.4.0_APKPure.xapk` 中的关卡数据，来源包名 `com.agavegames.wordtiles`、版本 1.4.0。提取过程只读取压缩包数据。

共 13,216 个不同关卡，五种语言均可选：

| 语言 | 不同关卡 | 原始主线序号 |
|---|---:|---:|
| 英语 | 3,459 | 5,000 |
| 葡萄牙语 | 1,863 | 1,500 |
| 俄语 | 2,744 | 4,000 |
| 西班牙语 | 1,865 | 1,500 |
| 土耳其语 | 3,285 | 5,000 |

原始主线会重复使用部分关卡，保留这些序号及顺序。“全部关卡”按原 ID 排列，每个不同关卡显示一次。

- 默认载入英语主线第 1 关，原 ID 191596，目标 ICE、JOB、SUN。
- 原 APK 的行数据从下往上存储；网页按原游戏方向显示。第1关从上到下为 SUN / JIC / OBE。原始 JSON、次数与路径编号保留原包顺序，键盘上下方向按画面转换。核查依据见 [原包棋盘行方向核查](reports/原包棋盘行方向核查.md)。
- 可切语言、列表、关卡序号，以及上一关、下一关、随机载入。
- 关卡尺寸、目标数量与逐词长度按原数据显示。算法2使用 V1 固定生成规则。
- 原棋盘包含 3×2、4×2、3×3、4×3、5×3，最多 18 个目标、10 字母词。适配后的每格初始次数最多 16。
- “更多设置 → 原包数据”展示原始目标类型、额外词和障碍信息；导出保留完整原始对象。

### 消除玩法适配

原包关卡没有格子使用次数，部分目标有多个消耗集合。按用户确认的规则：保留当前网页消除玩法，对每个目标选择一个固定参考消耗集合，反算每格次数。

同一消耗集合中的其他合法走法仍可接受。拼出目标但消耗集合不匹配时，提示换路径且不扣次数；“提示”显示可用参考路径。额外词只记录，不消耗次数、不标记目标完成。

特殊障碍字段按原样保留在导出数据中；网页试玩使用四向连词与固定消耗规则，特殊障碍的原版行为尚未实现。

### 原包校验

载入与导入前重新搜索原始字母棋盘上的全部四向路径，核对尺寸、字母、目标、参考消耗集合和逐格反算次数。

每格次数等于尚未完成的参考集合对该格的需求。只要某个目标还未完成，它的参考路径全部格子就仍有次数，因此任意目标顺序都可完成，全部完成后次数恰好归零。算法1采用这条需求不变量证明，界面明确标为“需求不变量通过”。报告记录覆盖的 `2^N` 完成状态数量，不声称逐项枚举了这些状态。

## 算法2 · 回溯生成 V1

接入用户提供的 `wordtiles-algorithm.ts`，源码原样保存为 `src/wordtiles-algorithm.ts`。算法版本为 `backtrack-v1.0.0`：长词优先铺设 → 回溯换词和路径 → 反算格子次数 → 唯一消耗集合校验 → 全部完成状态校验。

- 固定 3×3、5 个不同目标，长度为 3/3/3/4/5。沿用现有界面，相关参数只读显示。
- 每格初始次数 1～3，总和 18，按目标的真实消耗反算。
- 使用用户提供的 `dist/dictionary-v1.json`：`demo-test-20261010-v1`，1,602 个词（三字母 286、四字母 612、五字母 704）。原词库 `dist/dictionary.json` 保留原样。
- 生成器和算法2导入校验器共用这份完整的 `{ version, words }` 对象，不跳过白名单。
- seed 是 0～4294967295 的整数，0 有效。“生成并试玩”及“下一关”使用新的随机 uint32；核心搜索只使用带种子的随机数。
- 同一算法版本、词库、预算和 seed 可重现关卡及搜索统计。
- Worker 负责同步搜索。取消、重开、切算法、导入及切关终止旧线程，并用请求编号和状态版本隔离迟到结果。
- 预算耗尽或生成失败显示原因与错误码，保留当前关卡和进度；生成期间仍可试玩。两种算法各自保留会话。

默认搜索预算为每次 10,000 节点、最多 30 次、总共 300,000 节点；在“更多设置 → 校验与预算”中可以修改。预算控制搜索量，不代表难度。该版本不接受自定义尺寸、数量或词长，原生成器保留在 `dist/core/generator.js` 供旧模块回归使用。

生成或导入 V1 JSON 时，先由原算法校验器检查，再适配到现有游戏会话，并使用独立的原 Demo DFS 校验器复查：

1. 检查尺寸、目标数量、长度、白名单、去重、参考路径与次数。
2. 重搜全部合法四向路径；每个目标只能有一个消耗集合，同集合多条走法可接受。
3. 独立逐格反算需求，与初始次数一致。
4. 检查全部 32 种完成状态：非负次数、未完成目标可达、剩余次数总和正确，完成后恰好归零。

seed 20261010 使用默认预算的结果与 `examples/seed_20261010.json` 逐字段一致：棋盘 C/L/T、T/O/A、H/N/E，次数 1/2/3、2/3/3、1/1/2；目标 EAT、LOT、OAT、NEAT、CLOTH。搜索使用 3 次尝试、25,952 节点。

“关卡文件 → 固定样例”继续提供 EYE、FEE、LAD、FEED、PEDAL；同集合的 EYE 正反路径均可接受。测试词库尚未完成产品词频、受众及词义审核。

## 试玩与画面

拖动连接上下左右相邻的字母，可转弯，同一次不重复经过同一格；拖回前一格可撤回。松手时提交，经过较短目标不会提前扣减。

正确目标一次性扣减全部相关格子的次数。归零后留空，棋盘不移动。非目标、重复目标、非法路径、消耗集合不匹配和取消操作均不扣次数。目标全部完成且次数归零时通关。

键盘：方向键移动焦点，空格选格，Backspace 撤回，Enter 提交，Esc 取消。提示只展示词与路径，需要手动连接提交。

画面默认自动适配 9:16，按浏览器实际宽高完整显示。通过“更多设置 → 画面尺寸”可选 360×640、405×720、450×800 和 75%、85%、100% 缩放。固定尺寸在空间不足时等比缩小。棋盘按可用空间适配；目标较多时仅目标区滚动。手机编辑器默认收起，载入或生成成功后自动收起。设置浮层和悬停提示限制在屏幕内，页面本身不滚动。

## JSON 与文件

算法1导出使用 `schemaVersion: 3`、`algorithm: 1`，包含原始 `source.original`、语言、列表、序号、适配策略、参考路径和反算次数。

算法2的新关卡保留算法包的平铺 V1 JSON：`schemaVersion`、`rulesVersion`、`generatorVersion`、`dictionaryVersion`、`seed`、`rows`、`cols`、`maxCellUses`、`letters`、`initialCounts`、`targets`；目标字段为 `id`、`word`、`canonicalPath`。内部仅为原渲染器适配 `board` 和 `targets.path`；导出和重开使用冻结的原始 JSON，不混入 Worker 返回包装、统计或游玩状态。

旧的嵌套 `schemaVersion: 1/2` JSON 仍可导入，必须通过当前新白名单及完整规则校验；其中较长单词可能不在本次测试词库中而被拒绝。原固定样例继续兼容。

格子编号按行排列，从 0 到 `rows * cols - 1`。算法1沿用 APK 从左下角起、从下往上的编号；算法2从左上角起、从上往下。每行内均从左往右。导出保存完整初始数据；有效导入从初始棋盘开始，编辑器会自动切到对应算法。错误导入保留现有关卡。

```text
dist/
  index.html, styles.css, app.js  编辑器、竖屏画面与输入
  dictionary.json               原词库保留
  dictionary-v1.json, sample.json 新算法测试词库与固定样例
  source-levels/                 五语言原包关卡、原始主线列表和目录
  core/source-levels.js          原包转换、校验、消耗集合与额外词
  core/rules.js                  动态四向DFS、完整校验、原子提交
  core/generator.js              原生成器保留，供旧模块回归
  core/wordtiles-algorithm.js     原TS编译的V1生成器与校验器
  core/algorithm-v1-adapter.js    JSON适配、双校验、原始数据保留
  generator.worker.js            算法2独立生成线程
src/wordtiles-algorithm.ts        用户提供的源码原样保留
examples/seed_20261010.json        用户提供的逐字段验收样例
docs/algorithm-v1/                原包接入说明及原包测试报告
tests/                           新旧规则、生成器、参数与原包适配测试
scripts/                         本地服务、提取、批量与浏览器验收
reports/                         实际验收报告和截图
```

源 XAPK 的 SHA-256 保存在 `dist/source-levels/catalogue.json`。可用 Python 从用户文件重新提取：

```powershell
python scripts/extract-source-levels.py "C:/Users/huyi/Downloads/Word+Tiles+-+Relaxing+Puzzle_1.4.0_APKPure.xapk"
```

## 验证与复跑

```powershell
npm run build:algorithm
npm test
npm run test:source
npm run test:browser
npm run test:portrait
npm run test:batch
```

源码编译使用 Node.js 24 的 `node:module.stripTypeScriptTypes` transform 模式（处理参数属性），输出浏览器可用的纯 ES module，无第三方运行时依赖；不执行额外 TypeScript 类型检查。未修改提供的 TS。修改 TS 后先重新编译，测试会检查源码哈希，拒绝误用旧编译产物。Node.js 20+ 仍可启动已编译的静态 Demo。

规则和全库测试无需外部依赖。浏览器验收需要 Playwright 及 Chrome 或 Edge；本机自动使用 Codex 附带的 Playwright。其他机器可运行 `npm install --no-save playwright`。浏览器测试前保持本地服务运行。

实际验证结果：

- 37 项新旧规则与接入测试通过，包括指定 seed 逐字段对比、源码编译哈希、白名单拒绝、失败边界、原始 JSON 隔离、120 种完成顺序，以及原包适配回归。
- `reports/algorithm-v1-batch-1000.json`：seed 0～999，1,000/1,000 成功，去除旋转与镜像后 1,000 个不同布局，1,000 组不同目标；独立检查 32,000 种状态，实际游戏会话回放 120,000 种顺序（600,000 次提交），确定性复现通过。
- `reports/browser.json`：27 项真实 Chrome 验收通过，覆盖原包实际行方向和键盘上下移动、两算法、五语言、原包18目标和10字母词、最新真实 Worker、完整 V1 JSON 往返、失败及迟到请求隔离、重开、键盘、鼠标和手机触屏。网页错误 0。
- `reports/portrait.json`：1680×900、1366×768、1280×720、1024×600、768×650、390×844、360×640、320×568 八种窗口通过。页面无横向或纵向溢出；18 目标关卡、设置浮层、悬停提示、棋盘及操作区均在屏幕内，次数徽标不遮挡字母。
- 之前的 `reports/source-verified.json` 保留：13,216 原包关卡全库验收；本次使用现有原包单元与浏览器回归。原生成器历史报告 `batch-100.json` 和 `config-matrix.json` 保留，不用它们代替新算法验收。

原包的 `tests.mjs`、`benchmark.mjs` 和独立检查脚本没有随这次文件提供，本项目新增对应的接入测试及 `scripts/benchmark-v1.mjs`，没有引用原包现成报告作为 Demo 已通过的证据。详见 `reports/algorithm-v1-integration.md`。

以上是本次词库、预算和已测试种子的结果，不保证换词库、换预算或其他种子仍全部成功；没有测试实体手机性能。
