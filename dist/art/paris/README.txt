居中悬浮版 · 世界旅行字谜游戏资源包 v1

打开 preview.html 即可预览大厅与 3×3 棋盘关卡。PNG 资源、字体和布局数据均在本包中，预览不依赖网络或构建工具。
预览中的文字和数字是动态绘制的，图片底图没有烧入 PLAY、关卡号、金币、字母、角标或答案。
可以点击 PLAY 进入关卡，依次选字 RAT 或 TEA；打乱和提示按钮可用于查看状态变化。此预览只演示资源组装与控件状态，正式游戏规则由你的 demo 接入。

目录
assets/backgrounds/    2 张 1080×1920 不透明全屏背景
assets/ui/             10 个透明 UI 底图／状态覆盖图
assets/icons/          6 个透明 PNG 图标
assets/svg/            对应的原创矢量图标与简单 UI 底图
assets/atlas/          可选 UI 图集 PNG + TexturePacker 格式 JSON；不含大背景
fonts/                 Nunito Sans：Regular、Bold、Black 静态 TTF、原始可变字体与 OFL 许可
reference/             最终居中悬浮版概念图，用来对照，不作为实装素材
qa/                    从独立资源实时组装后拍摄的预览图
layout.json            1080×1920 设计坐标、文字样式、九个棋盘格坐标、答案格与屏幕结构
theme.json             颜色、字体路径、按下／禁用／选中状态建议
nine-slice.json        可拉伸 UI 资源的像素边距
manifest.json          资源尺寸、透明通道、SHA-256 与文件用途
preview.html           可离线打开的实装预览
generation-prompts.txt 背景与纹理的实际生图提示词
checksums.sha256       最终文件校验清单

导入建议
1. 背景直接作为最底层 Sprite/纹理，按屏幕 cover 等比铺满，允许极小边缘裁切。不要把全屏背景放进圆角图片卡片。
2. UI 使用透明 PNG；alpha 为 straight/unassociated。过滤设为 linear，wrap 为 clamp；UI 通常不需要 mipmap。不要对透明图片再抠黑底，黑色仅是部分查看器的透明显示色。
3. layout.json 以左上角为原点，x 向右、y 向下，rect 保存左上角及宽高。图层顺序：背景 → UI 底图 → 图标／文字 → 选中覆盖图 → 角标／输入响应。
4. 使用九宫格／9-slice 时按 nine-slice.json 的 left/right/top/bottom 设边距，数值对应图片原始像素。单个棋盘格优先等比缩放；所有 9 格使用同一底图。
5. 字母、红色角标、金币、关卡和答案由代码/Text 节点创建。答案格与棋盘格用途不同：tile-answer-* 是上方词表；tile-letter.png 是下方输入棋盘。
6. Cocos/Unity 等中心原点坐标转换：cx = rect.x + rect.width/2 - 540；cy = 960 - (rect.y + rect.height/2)。按实际可用画布等比缩放，再处理设备安全区。
7. 圆形 Shuffle、Hint、Back 是关卡功能控件；大厅没有底部导航栏。
8. 如直接导入小图片不使用图集，可忽略 assets/atlas。若使用图集，不要再对 frame 做二次裁切；frames 坐标已包含透明边。
9. 选中态使用 tile-selection.png 覆盖在 tile-letter.png 上；按下态建议缩放到 0.96，禁用态建议 opacity 0.42。

字体与来源
背景和三个纹理底图使用内置 image_gen 按本次选定概念图重新生成。
图标、空答案格、圆底、金币底、角标底和进度点为本次原创矢量绘制，并导出 PNG。
Nunito Sans 来自 Google Fonts，随包保留 fonts/OFL.txt。源地址：
https://github.com/google/fonts/tree/main/ofl/nunitosans
字体已导出常见引擎可直接导入的静态 400／700／900 字重。保持附带的 OFL 许可文件。

范围
本包提供可导入的独立美术资源和通用布局数据。尚未连接你的实际项目，也未修改任何现有 demo。
