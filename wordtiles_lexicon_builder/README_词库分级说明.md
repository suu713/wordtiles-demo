# 不限词长英文词库｜五档词频分级构建工具

## 当前交付状态

本包是**构建脚本、分级规则与接入说明**，不是已经下载并完成分级的全量词库。
本轮已核对官方网页、数据来源和接口，并在本地通过 10 项规则/输入处理单元测试。
当前执行环境无法下载远端数据或安装 wordfreq，因此**未进行全量构建，也没有各档实际词数和新词库下的关卡生成成功率**。测试使用注入的数值，只验证代码分档边界，不冒充词频实测或玩家体验验证。

## 1. 推荐资源

1. ESDB（原 SCOWL）：用于确定候选词条范围。它不是完整释义词典，也不是英语所有词的全集。
   - 项目：https://github.com/en-wl/wordlist
   - 官方网站：https://wordlist.aspell.net/
   - 官方预生成普通词表：https://github.com/en-wl/wordlist-diff
   - 本脚本默认输入：https://raw.githubusercontent.com/en-wl/wordlist-diff/diff/en_US-large.txt
   - 它对应美式英语大型拼写检查词表；包含词形、大小写词条、名字、缩写和所有格。它的原始行数不能当成经过内容审核的可出题词数。
   - 大词表不是零错误词表。原项目说明 size 60 检查更严格；70 更广；80/85 可进一步扩充但含更多罕用、旧用法。
2. wordfreq：用于计算单词出现频率。
   - 项目：https://github.com/rspeer/wordfreq
   - 固定安装版本：https://pypi.org/project/wordfreq/3.1.1/
   - 使用 `zipf_frequency(word, 'en', wordlist='large')`。
   - `en` 是综合英语，不是美国女性用户专属语料，也不是严格 en-US 频率。
   - 数据主要覆盖约 2021 年及以前：https://github.com/rspeer/wordfreq/blob/master/SUNSET.md
3. SUBTLEX-US：可作为后续美式日常表达的交叉检查，官方提供 74,286 个词形的表格/文本。
   - https://www.ugent.be/pp/experimentele-psychologie/en/research/documents/subtlexus
   - 词频与影片覆盖率分开；不能把 `Lg10WF` 直接当 Zipf。
4. Word prevalence：后续用于衡量“有多少人认识这个词”，不同于词频。
   - 61,858 个英语词元：https://link.springer.com/article/10.3758/s13428-018-1077-9
   - 不是现成的 55+ 女性专属熟悉度数据；本轮没有确认补充文件的商业再分发许可，因此未合并。

## 2. 分类口径

等级越小越常用；这是项目建议阈值，不是任何机构发布的统一五级标准。

| frequencyTier | 中文标签 | Zipf 范围 | 对应每百万词出现次数 |
|---|---|---|---|
| 1 | 非常常用 | z ≥ 5 | ≥100 |
| 2 | 常用 | 4 ≤ z < 5 | 10～不足100 |
| 3 | 一般 | 3 ≤ z < 4 | 1～不足10 |
| 4 | 罕见 | 2 ≤ z < 3 | 0.1～不足1 |
| 5 | 非常罕见 | 0 < z < 2 | 不足0.1；large 数据实际下限通常为 z=1 |
| null | 未评级 | 没有测得词频 | 不伪造数值，不自动归入第5档 |

换算：每百万词频率 = 10^(Zipf - 3)。

长度只存入 `length`，不参与 frequencyTier。不存在 3～5 字母筛选或固定长度上限。
`familiarity` 暂为 null；不能用词频反推成“百分之多少人认识”。

## 3. 联网构建

Python 3.10 或更新版本。解压后在本目录执行：

```bash
python -m pip install -r requirements.txt
python build_lexicon.py --out ./lexicon-output
```

脚本会下载 ESDB 美式大词表与必要来源/许可文本，调用已安装的 wordfreq 获取分数，然后输出：

```text
lexicon-output/
  dictionary.master.json
  dictionary.very_common.json
  dictionary.common.json
  dictionary.general.json
  dictionary.rare.json
  dictionary.very_rare.json
  dictionary.unrated.json
  excluded.entries.json
  summary.json
  sources/
```

`dictionary.master.json` 最后写入，其存在表示本次数据导出完成。失败会报错，不会用示例数据伪装成成功。

脚本默认读取官方当前版本，下载内容 SHA-256 与 wordfreq 版本会保存进元数据。要复现后续构建，请保存整个 sources 目录和依赖版本，而不是只记下载日期。
输出目录已有母词库时拒绝覆盖，需换新目录；不要覆盖原 Demo 的 1,602 词文件。

## 4. 网络受限时

脚本不要求在线查询每个词。wordfreq 依赖安装好之后，词频查询是本地计算。
若本机无法访问 GitHub，可将官方词表和许可文件先保存到本机，然后运行：

```bash
python build_lexicon.py --offline --source-file "D:/wordlists/en_US-large.txt" --legal-dir "D:/wordlists/licenses" --out "D:/wordlists/graded-output"
```

`--legal-dir` 必须包含：

```text
ESDB_Copyright.txt
wordfreq_NOTICE.md
wordfreq_LICENSE.txt
```

对应原始来源：

```text
https://raw.githubusercontent.com/en-wl/wordlist-diff/diff/Copyright
https://raw.githubusercontent.com/rspeer/wordfreq/master/NOTICE.md
https://raw.githubusercontent.com/rspeer/wordfreq/master/LICENSE.txt
```

自定义输入词表可使用 `--source-file`，同时通过 `--source-url`、`--source-name` 记录真实来源。
本脚本按 ESDB 许可处理词条；不要借此给任意第三方词典重新贴上 ESDB 的授权。
输入必须为“一行一个词”的普通词表，而非含词缀代码的 Hunspell `.dic` 文件。

## 5. 内容审核不是词频分级

本脚本仅做机械处理：去重、保留大小写证据、单个 ASCII 字母词过滤、计算词频分档。

- 不将 DON'T 改成 DONT，不将带横线的词拼在一起；这些条目进入 excluded，原来源文件保留。
- 不把名字全部改小写后声称已经剔除专名。只有大写/首字母大写条目的词会标记 `caseReviewRequired`；这不是“已确定为专名”。
- 某词同时有普通词义与人名等用法时，综合词频仍可能被名字抬高。
- ESDB 的专名和敏感用语标注不完全；当前默认普通词表也不保留其完整词性/敏感标签。
- 不保证去除了全部缩写、脏话、歧视词、成人内容、品牌、专业术语。
- 所有条目均设置 `reviewStatus: pending`、`targetEnabled: false`。前3档普通大小写词优先审核，但“优先审核”不是“自动可上线”。
- `familiarity: null` 是缺失，不是0，也不是用户不认识。

需要更精细自动审核时，改用完整 ESDB 数据库保留词性、usage-note、词元和地区信息，再叠加项目黑白名单。不能只靠本脚本的大小写检查。

## 6. 接入 Demo 的边界

母词库不限长度，不等于现有3×3生成器自动支持任意词长。
已有 Demo 的目标长度、铺词规则、次数上限及校验器保持独立；本关只从母词库提取它需要的长度和分档。
未来放开目标词长时，若同一词不得重复格子，则任何目标词长度不能超过有效棋盘格数，还必须验证真实连线路径。

母词库结构是 `{metadata, entries}`，不能直接传给旧版期望 `{version, words}` 的生成器。
Codex 应写适配层，从审核通过条目抽取字符串数组，并保留词库版本与来源信息。生成器与关卡校验器共用同一份最终运行时词库。

扩词后同一个 seed 通常不再生成旧棋盘；旧的 20261010 验收结果只在旧算法、旧词库、旧参数组合下比较。
不能为“看起来一样”把新词库静默换回旧词库。

本次不会把“合法英语单词都可以扣次数”加入游戏。只有当前目标词能扣次数，原来的消耗集合唯一性仍须检查。

## 7. 授权

ESDB 为 MIT-like 许可，需保留原 Copyright。wordfreq 代码采用 Apache-2.0，频率数据采用 CC-BY-SA-4.0 等来源归属要求；两者不能混为一谈。

官方说明：https://github.com/rspeer/wordfreq#license
CC-BY-SA：https://creativecommons.org/licenses/by-sa/4.0/

脚本把必要原文保存在 sources，并嵌入每个分级 JSON 的 metadata。各份派生数据标注 CC-BY-SA-4.0 与修改说明；不要剥离许可/来源再发布一份裸词频表。
wordfreq 作者明确反对缺乏可靠归属信息的裸 CSV 导出，本包不提供 CSV 导出。
SUBTLEX 是可免费获取的数据；相关作者归属保存在 wordfreq NOTICE 中。商用发版前应由团队法务确认具体词库分发方式和义务；本包不提供法律保证。
