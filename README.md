# Word Tile · Alps

Browser-based word puzzle editor with level generation, manual and simulated play, level analysis, collection views, and Excel export.

## Run locally

```powershell
npm start
```

Open `http://127.0.0.1:4173/` while the local server is running.

The app ships one vocabulary asset: `dist/wt-word-bank.json`, packaged from the provided `wt词库.xlsx`. Its “必答词” sheet supplies every generated level, including daily puzzles and batch generation. Player recognition uses the complete union of “必答词” and “额外词”, independent of generation length or tier filters: final targets consume tiles; any other word connected by a valid current path is collected once as a bonus without consuming tiles or completing targets. Words from the “额外词” sheet remain ineligible as generated targets. Sessions, extra-word statistics and V3 diagnostics share this recognition set. Other generation dictionaries and fixed sample levels are excluded from the served `dist/` directory. WT 1.4.0 English original levels are available as a separate, immutable source; they retain their per-level target and extra-word lists and do not enter the generated-level vocabulary or saved sequence. The player model uses the workbook's rarity annotation as a familiarity proxy, not as an independent frequency table.

The updated 20-column workbook preserves emotion, detailed categories, part of speech, rarity labels and status, abbreviation details, confidence and review notes. Collection themes use its detailed categories, and compatible saved levels are revalidated against each new workbook version while preserving their boards, paths and editor numbers.

To rebuild the runtime data from the workbook:

```powershell
npm run package:wt-workbook -- "C:\path\to\wt词库.xlsx"
```

In the simulation workspace, enter 1–1,000 repeats for the current level. Each repeat starts from the original board with independent system randomness. Results and level error counts show batch averages directly without a completion dialog. Batch statistics include normal abandoned runs and exclude errors; time is estimated player time. Cancellation keeps completed samples, and switching levels stops the batch. Simulation and analysis display/export only completion time: the median estimated player time among completed runs. Runs that stop before completion have no completion time. Average time, all-run time median and time P90 are omitted from the interface and Excel/JSON exports.

Simulation and batch analysis share an editable **认识目标词比例（%）**, from 0 to 100 (default 80), saved locally. Each run samples the configured proportion of targets with stochastic rounding for small levels. Changing it keeps the original spatial recognition estimate and recalculates progression correction under that same proportion. Excel and JSON analysis exports retain both recognition scores while omitting per-length extra-word counts, valid/won/error run counts, mean completed targets and error reasons. Progression correction for WT originals uses independent sessions of the actual curtain, all-path-union consumption and alternative-cell cleanup rules. Zero-knowledge conditional correction remains blank/null. Non-target submissions that are also rejected by the extra-word list count as both errors and trial swipes; obstacle counts are omitted from analysis exports. The target-length distribution always shows raw 3/4/5/6-letter target counts, including zeros, without reduction. Other lengths remain in their individual count/share columns. “附加逐局明细” defaults off and controls whether Excel includes the per-run sheet and JSON includes the runs array. It can also be toggled after a batch finishes; batch means always use all actual runs.

The **模拟试玩** panel has its own **关卡来源** selector. Choose generated levels or **WT 1.4.0 英文原包**, then choose one of the six original lists directly in this panel. **起始关号** and **结束关号** stay visible; editing either automatically selects **手动填写关卡范围**. Both ends are included. Original numbers refer to positions in the selected list; generated ranges use saved editor numbers. The panel previews the number of levels and total runs, rejects invalid or missing numbers, and identifies original IDs in the per-level results. Source/list selection stays synchronized with the current board. Cancellation preserves partial results. A range supports up to 10,000 levels and 200,000 total runs. Verify this flow with `node scripts/check-simulation-source-range-browser.mjs` while the local server is running.

## WT 1.4.0 English original levels

Open `http://127.0.0.1:4173/?source=wordtiles&list=level_list_0&level=1`, or select **WT 1.4.0 英文原包** in **当前试玩**. In **编辑关卡**, choose a list and level number. The package contains 3,459 unique English configurations: four separate main-order tables (1,500 / 1,500 / 1,000 / 1,000 positions), 366 daily positions, and an all-unique list. Tables overlap and are not concatenated. Table 0 is a preview default, not a claim about every online account. Its first level is ID 191596: ICE / JOB / SUN.

The importer preserves each original board, target list, extra-word list and curtain threshold. The web rule reconstruction accepts alternative visible paths, counts each target once on the union of all its paths, removes redundant cells while preserving pending paths, opens curtains at their completed-target thresholds, and distinguishes all-target completion from the empty-board fallback. The lamp reveals one letter and fireworks reveal up to five; a fully revealed word is collected. The reconstruction follows the local static analysis, does not execute the APK, and does not fetch live account or server settings. The page's art, collection and surrounding activities remain the demo presentation.

**模拟试玩** supports the current level or an inclusive range from the selected original table. **反跑关卡** also offers these six lists and Excel / JSON export with original ID, list, position, source SHA and runtime version. Both use the ordinary English player model with configurable target knowledge (default 80%), no automatic props, and independent random samples. Completion times are estimates. Original words missing workbook familiarity annotations remain eligible for the same knowledge draw; missing familiarity stays missing in reports. Static path metrics use reference paths. Original progression correction uses the curtain and all-path-union runtime; V3 generation quality scoring applies only to generated levels.

Source files: `dist/source-levels/catalogue.json` and `english.json`. Rebuild with `python scripts/package-wt-original.py "C:\path\to\Word+Tiles+-+Relaxing+Puzzle_1.4.0_APKPure.xapk"`. Only the English assets are extracted. The original package SHA-256 is recorded in the catalogue.

Validation commands: `node --test tests/wt-original-runtime.test.mjs`, `node scripts/check-wt-original-browser.mjs` (server running), and `node scripts/check-wt-original-batch.mjs`. The runtime test plays all 3,459 levels with three independent choice orders; the batch smoke check samples every unique level once and is not a real-player pass-rate estimate.

## V3 level quality

The editor has a collapsible **关卡质量 · V3** panel. Its default `REPORT` mode computes quality after the existing generator and full rule validator accept a candidate. It returns the same generated level for the same input configuration and seed. The selection and path backtracking engine, target whitelist, tile consumption and original level JSON format are unchanged. Quality is exported as a separate report with the level, generator/dictionary/configuration versions, request seed, selected seed, scores and search statistics.

Use **应用 V3 固定模板** for the initial 3×3, five-target, `[3,3,3,4,5]`, maximum-three-uses template. Manual changes to size, target count or composition exit the fixed template. Other configurations remain supported in REPORT, with the template-specific ranges marked not applicable. RANK and FILTER reject other templates instead of applying 3×3 cutoffs to them.

- `REPORT`: keep every rule-valid generated result, with metrics and data-completeness warnings.
- `RANK`: search multiple independently validated candidates within the candidate/node budgets and retain a bounded, distinct candidate pool sorted by target compliance and quality. The panel can sort and select these candidates.
- `FILTER`: only candidates meeting all enabled evaluable conditions enter the pool. An enabled unavailable condition fails screening, except for the requested frequency-coverage exemption below. Budget exhaustion retains the previous playable level and never changes thresholds or loads a sample.

Quality calculations cover the four combination groups (reliable frequency, multiset Dice / longest common substring / edit similarity, exclusive containment type, start/end/length diversity), six path groups (minimum turns, straight ratio, normalized span, prefix branching, shared-cell use and easy starters), and ignored-word interference. All legal target paths are enumerated by the existing validator. The least-turn path wins; branching, span and path indices break ties deterministically. Alternative path ranges and consumption-set counts are retained. Fixed length templates exclude length diversity from scoring and renormalize the start/end weights.

The current workbook supplies a rarity-based frequency **proxy**, not reliable Zipf observations. `avgZipf`, genuine frequency-derived opening scores and genuine distractor scores therefore remain unavailable, while the proxy and a separate pure-path starter score are shown explicitly. Frequency thresholds are exempt below 80% reliable coverage. No suffix-stripping guess is used for missing lemmas. The review corpus is the workbook's complete required-plus-extra union; it is broader than the current target list but does not claim to be a complete external English review dictionary. Ignored words, rewarded extras and blocked words are kept separate, non-target words never consume tiles, and incomplete interference scores are never reported as a healthy zero.

The five score-module weights and three initial presets live in `dist/core/quality-config.js`. Missing modules are excluded and the remaining weights are normalized; the UI labels the retained weight as **评分覆盖**, not player-validated confidence. Soft ranges and enabled conditions can be changed in the panel. Prefix branching initially has no fixed gate. After at least 100 valid batch samples for a difficulty, the user can explicitly fill a branching range from that batch's quantiles. This changes no other thresholds and is still an unvalidated engineering preference. Completable branching remains explicitly unavailable in this first implementation.

The quality batch entry runs independent fixed-template requests in a worker, with cancellation and partial results. It exports per-difficulty hard-rule pass rates, soft-condition satisfaction rates, timing and score distributions, per-metric mean/P10/P50/P90 (linear interpolation), distinct word combinations, geometry structures and common failure reasons. Geometry diversity canonicalizes count layouts and target consumption sets under board symmetries, independent of the actual words. Seeds and versions are retained for reproduction. Normal batch level generation also carries separate quality reports, without adding fields to LevelData.

Run `npm run benchmark:quality` for 500 REPORT requests per preset. The executed 2026-10-26 results are in `reports/quality-v3-benchmark-20261026.html` and `.json`; historical calculation examples are in `reports/quality-v3-examples-20261026.json`. The EYE/FEE/LAD/FEED/PEDAL example yields minimum turns **3**, straight ratio **0.4** and shared-cell rate **6/9**. FEED/FEE spelling similarity is `0.5×6/7 + 0.3×1 + 0.2×0.75`. Historical fixtures remain regression-only; formal generation always uses the current workbook whitelist.

The presets and weights are initial engineering targets. Competitor-level and player-based calibration is not claimed and requires those data in a later calibration pass.

## Checks

```powershell
npm test
```
