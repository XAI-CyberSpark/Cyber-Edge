# dev.99 车模通用对照与候选调研验收

维护日期：2026-10-06｜状态：A通用适配及本机验证完成；B旧三款基础筛选完成后被用户因风格否决；写实补充形成三款付费短名单，未通过全部接入门槛。未提交工作区、未发布、未更新5175。主依据：[需求](PRD.md)、[任务](TASKS.md)、实际模型、源码及5173截图。证据目录因本轮最初使用dev.98命名仍保留 `outputs/rig-dev98/`；dev.98已被并行字段一致性任务占用，本轮正式登记dev.99，不混用其结论。并行任务的ACCEPTANCE完整保留，其PRD/TASKS按现存验收恢复范围，恢复说明已写入对应文件。

## 实现

- 新增 `studio/public/models/su7/rig.json`：模型/环境路径、文件SHA、来源/未知授权、四门四窗、车身材料、原外观覆盖、运动参数。灯组/后备箱尚未验证独立绑定，明确null并保留静态行为，没有虚构动画支持。
- `studio/src/domain/carRig.ts`：精确节点、后代树或连通块选择；量化顶点解码、世界变换、材质分组；缺失/部分命中降级静态，不生成幽灵门热点。支持多网格一窗，不改变VehicleWorld。
- `HmiCarStage.tsx`消费描述，SU7名称/筛选/位置阈值不留在通用组件；默认选择集中在activeCarRig。SU7资源文件、品牌文字、水面、相机、交互入口保持。
- CarConcept真实两门GLB只作测试夹具；未替换、未去标志、未纳入交付public。SU7旧目录不删除，所以本轮无需执行旧替换计划的删除、哈希迁移或Windows资产替换。

## 自动验证

| 检查 | 结果 / 证据 |
| --- | --- |
| `node studio/scripts/test-car-rig.mjs` | 3组通过：[输出](../../../../outputs/rig-dev98/rig-tests.txt)。SU7真实哈希一致、全部已声明选择器及车身材质命中；50个输出部件的每项几何attribute/index字节、材质、门窗归属与冻结dev.97实现一致；门轴、枢轴、角度、热点及窗0/50/100/复位参数相同 |
| CarConcept与缺失回归（同脚本） | 固定真实GLB哈希、两门两窗、缺省后门后窗、灯/后备箱选择器；故意缺节点或不完整门绑定静态降级；VehicleWorld后窗状态正常更新，解析模型不改其快照 |
| `node studio/scripts/test-hmi-chrome.mjs` | 8组通过，[输出](../../../../outputs/rig-dev98/hmi-chrome.txt) |
| `node studio/scripts/test-hmi-controls.mjs` | 6项通过，[输出](../../../../outputs/rig-dev98/hmi-controls.txt) |
| `cd studio && node scripts/audit-typography.mjs --write` | 0违规，已更新清单，[输出](../../../../outputs/rig-dev98/typography.txt) |
| `cd studio && npm run build` | 类型与生产构建通过；既有大chunk提示保留，[最终输出](../../../../outputs/rig-dev98/build.txt) |

全库文档检查仍有41项既有错误、24项警告（旧链接/源码相对路径等），未扩大修改历史文档；本轮新增的临时路径表述已修正，新增链接另外逐项检查。`git diff --check`通过。

几何测试的加载器跳过贴图请求；纹理、实际GL和热点以浏览器实屏补充。CarConcept真实fixture保存在研究目录，干净环境获取方法见[测试说明](../../../developer/TESTING.md#车模实物与降级回归dev99)。不以参数比较宣称物理车型标定。

## 5173 实屏

使用无后端、无项目保存的隔离页加载真实HmiCarStage。最终复用入口 `/tests/rig-review.html`；截图时临时入口为 `/rig-review.html`，已移入tests，不进入生产入口。

| 状态 | 改造前 | 改造后 |
| --- | --- | --- |
| 闭门、四窗关闭 | [截图](../../../../outputs/rig-dev98/before-closed.jpg) | [截图](../../../../outputs/rig-dev98/after-closed.jpg) |
| 左前门打开、左前/左后窗50% | [截图](../../../../outputs/rig-dev98/before-open-half.jpg) | [截图](../../../../outputs/rig-dev98/after-open-half.jpg) |

目视车身构图、门的位置、车漆和窗开度一致；水面为实时动画，相位不同，未声称逐像素一致。另验证左前/左后窗100%、锁车使门关闭、夜间模式：[截图](../../../../outputs/rig-dev98/after-locked-night.jpg)。

CarConcept仅显示可见左前门热点，无左后门热点；rl/rr保持50%测试输入，前窗50%和开门仍工作，onError未触发，最终浏览器error日志为空：[缺失降级截图](../../../../outputs/rig-dev98/car-concept-degradation.jpg)。当前浏览器校验仅为桌面隔离页；没有用真实日常项目测试，也没有新增全站移动端/实车验收结论。

## 候选报告与边界

[主报告](../../../product/CAR_ASSET_REVIEW.md)列出三个CC0候选：Divinux Sedan / Estate、3D Assets Four Door SUV。实际四门四窗子树断言通过，GLB分别402612/427440/302836字节；前两者未经额外压缩即小于5MB，第三个为上游量化GLB。报告含许可原文截取、作者/下载链接、文件SHA、节点清单、闭门/开门风格截图、材质准备工作和排除项。SUV发布者标明AI制作。尚未标定三款车型的HMI门窗行程或实现正式rig，不将基础筛选写成接入完成。

测试临时public/CarConcept与候选副本已清理，最终dist不得含CarConcept或候选GLB；研究原件与截图保留在outputs。未改5175、稳定运行副本、稳定数据、后端项目或配置。现用SU7及HDR授权未知状态保持；消除品牌引用和模型替换留待用户选择后的下一步。

## 写实调研补充验收（2026-10-06）

用户明确旧三款全部不采用。主报告已新增Modern Sedan / Futuristic Sedan / Futuristic SUV：各商品链接、美元价格、授权原文短引、未细分面数、四门描述与开门图、四窗/压缩体积未知项；按写实及现用风格接近程度、部件、价格排序。授权页确认RF类型，同时核对TurboSquid第7节与CGTrader定义8/21A–B的软件分发限制：当前public GLB不可认定获得许可。**三款是研究短名单，零款被认定全部接入条件通过**。无符合全部要求的免费款新增实物验收。

截图实际使用当前CockpitHmi与SU7，隔离VehicleWorld、无项目/后端持久化；同1100×650内视口，右侧仅商品原始预览，未去背景/标志，不是候选实时渲染。三组截图和开门图位于[证据目录](../../../../outputs/realistic-car-review-2026-10-06/)，具体链接及来源在[主报告](../../CAR_ASSET_REVIEW.md)。临时研究页源码存档于该目录，已移出studio/tests；未进入生产资源。

本补充未改生产代码/模型，未重新运行前端测试、build或字体清单，不复用前轮通过结果冒充本次候选验收。文档链接与差异检查单独执行。5175、稳定数据、模型/HDR与品牌文案均保持。产品仍dev.99，未购买、未联系卖家、未提交、未发布。
