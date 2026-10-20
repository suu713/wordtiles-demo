WordTile · 阿尔卑斯轻磨砂资源包 v1

先双击 preview.html 查看大厅与关卡；所有文件均在本包中，可离线打开。
设计坐标为 1080×1920，左上角原点。仅针对选定的 A / Alps 两张界面。

内容
assets/backgrounds/  两张去 UI 的全屏背景 PNG，另附 JPEG 与预模糊 PNG
assets/ui/           8 张可复用透明底图：主按钮、棋盘格、功能按钮、答案格两态、金币底、角标底、选中态
assets/icons/        10 张透明 PNG：日历、设置、返回、箭头、金币、打乱、提示、词袋、词典深色与浅色
assets/svg/          简单图标和矢量控件的 SVG 源文件
assets/fixed-layout-glass/  46 张原位磨砂贴片，按两张背景的实际位置制作
assets/masks/        通用与逐控件圆角遮罩，透明处 alpha=0
assets/atlas/        18 个可复用 UI 与图标的 TexturePacker 格式图集
fonts/              Nunito Sans 静态 400、500、600 字重，可变字体，以及 OFL 许可
reference/          原选定概念图，仅供对照
qa/                 素材组装后的截图与验证结果
layout.json         两屏全部控件、文字、答案格和九宫格的坐标
theme.json          颜色、字体、状态与磨砂用法
nine-slice.json     通用底图的九宫格拉伸边距，单位为对应源 PNG 像素
manifest.json       资源尺寸、用途、来源及 SHA-256
resource-overview.png  素材与组装界面总览
source/generation-specs.json / generation-prompts.txt  实际生图提示词
checksums.sha256     包内文件校验清单

磨砂有两种用法
1. 先在 demo 还原：使用 layout.json 中每个 glass 的 fixedPatch，放到其 rect 指定位置即可。
   这些贴片含对应位置的模糊风景，不含字母、数字、图标或文字。只适用于本包对应背景与位置。
   背景移动、换图、控件移位或屏幕裁切关系改变时，要重新生成贴片或使用方式 2。
2. 正式动态布局：在控件后面模糊场景，再叠加 assets/ui 对应的 RGBA 底图。
   单张半透明 PNG 无法模糊其背后的实时画面；在 Unity/Cocos 等引擎中用背景采样／模糊材质实现。
   也可采样随包的整屏预模糊背景，以同样的屏幕 UV 映射到圆角遮罩中，再叠加透明底图。
   预览页下拉框可切换两种方式。blur 数值在 1080×1920 设计画布上取值，随 UI 等比缩放。

导入
- 全屏背景 cover 铺满；不要把背景放入圆角卡片。无底部导航栏，Bonus 在局内左下角。
- x/y 为左上角坐标，width/height 为尺寸；文字的 center 是排版锚点，align=left 表示左侧锚点。
- 图层：背景 → 磨砂 → 图标／文字 → 选中覆盖／角标。各字母与角标数字用独立 Text 节点。
- 九宫格只用于可复用皮肤。原位贴片不能九宫格拉伸；布局整体等比缩放时跟随整体缩放即可。
- 通用 PNG 使用 straight alpha；linear 过滤、clamp、UI 不开 mipmap。不要把透明预览里的黑色当背景再抠一遍。
- Cocos/Unity 中心坐标换算：cx=x+width/2-540；cy=960-(y+height/2)。再做安全区适配。
- 默认的 RAT / TEA 和次数仅用于预览状态；正式词库、点击规则、存档、奖励由 demo 接入。

来源与边界
背景和三类磨砂纹理使用内置 image_gen 生成。背景按选定概念图重建并调色；被 UI 遮住的部分无法直接提取，山石、云和草地等细节会有重建差异。
磨砂纹理已清理透明毛边并校准透明度。简单图标为匹配原图的 SVG 重绘，不是从概念图恢复的原始矢量文件。
Nunito Sans 用来还原生成图中的排版感觉，不宣称是原图的准确字体。保留 fonts/OFL.txt。
字体来源：https://github.com/google/fonts/tree/main/ofl/nunitosans
本包是独立美术资源及可运行的组装预览，未修改或连接你的实际 demo。
