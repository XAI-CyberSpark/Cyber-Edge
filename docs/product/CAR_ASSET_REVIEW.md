# HMI 车模候选与部件核验

维护日期：2026-10-06｜状态：dev.99 通用适配完成；旧三款已否决，新写实短名单有接入待决项，默认仍为 SU7｜用途：记录授权、实物部件、大小与风格，作为下一步换模依据。主依据：用户最新 A/B 两步要求、发布页、实际 GLB/DAE。此前“CarConcept 不满足四门直接替换”的结论保留为历史，不阻止本轮使用两门测试夹具验证降级。

## 最新补充：写实候选（2026-10-06）

**上一轮 Divinux Sedan、Estate、3D Assets SUV 已由用户明确否决，全部不采用。** 新筛选要求为接近现有 SU7 的写实四门轿车/SUV、虚构车型、无真实车标、CC0/CC BY 或商用 Royalty Free（排除 Editorial）、四门独立、最好四窗独立、可导出 GLB 且压缩后不超过10 MB。以下是按写实度/现用风格接近度、部件证据、价格排序的 **3 款付费研究短名单，不是3款已通过全部接入条件的模型**。未购买、未下载付费模型、未联系卖家、未替换默认车模。

### 排序、价格、授权与规格

价格为2026-10-06商品页显示的美元单品价，不含可能的税费；不是订阅折算价格。面数为作者列出的未细分多边形数，**不是三角形数**。当前 SU7 本地 GLB 实测2,104,716 B、169,140个三角形、28个源网格，不能仅比较数字判断写实程度。

| 排名 / 候选 / 作者 | 价格与商品链接 | 授权类型原文截取 | 写实与品牌核对 | 面数 / 转换与大小 |
| --- | --- | --- | --- | --- |
| **1 Generic Modern Sedan — Behr Bros** | **US$159**；[CGTrader](https://www.cgtrader.com/3d-models/car/car/generic-modern-sedan-d59d0be9-8f8b-4464-b48c-487dddb1bcc6)，[TurboSquid同款](https://www.turbosquid.com/3d-models/generic-modern-sedan-3d-model-2367790) | CGTrader：`Royalty Free License (no AI)`；TS：`Standard License` | 最接近SU7的现代轿车比例；细灯组、轮胎和完整浅色内饰。作者明确：`Generic means this car does not exist in reality.` 预览车牌为作者名BEHR BROS，未见可辨真实汽车品牌 | **432,529 polygons** / 469,231 vertices。提供Blender4.0、低/高分辨率FBX/OBJ等；可经Blender导出GLB。页面BLEND28.6MB、FBX260MB，**均非最终GLB大小**；≤10MB未实测，需低细分、减面和贴图优化 |
| **2 Generic Futuristic Sedan — HKV Studios** | **US$149**；[TurboSquid](https://www.turbosquid.com/3d-models/futuristic-sedan-3d-1446687) | `Standard License`；平台说明其为Royalty Free，见下方原文 | 写实材质和内饰，但大进气口、锐利线条比SU7更夸张。作者声明自行设计、通用虚构车型；有作者自有图形徽记。不能把“generic”当作车型外观权利的独立认证 | **189,214 polygons** / 218,215 vertices。FBX/OBJ有low/medium/high，Max/Maya/C4D可关细分；13张256–3072贴图。可经FBX→Blender→GLB；材质需转PBR。**源GLB未提供、压缩后大小未知** |
| **3 Generic Futuristic SUV — HKV Studios** | **US$149**；[CGTrader](https://www.cgtrader.com/3d-models/car/concept-car/futuristic-suv-02832b9d-cdcb-4627-bf13-5f8bb166e554)，[TurboSquid同款](https://www.turbosquid.com/3d-models/generic-futuristic-suv-1349038) | CGTrader：`Royalty Free License (no AI)`；TS：`Standard License` | 写实车漆、轮组和白色内饰，但更接近概念SUV，风格距离最大；预览含HKV作者标志。作者明确自行设计，未见可辨真实汽车品牌 | **175,055 polygons** / 194,602 vertices。FBX/OBJ有low/medium/high；12张最高2048贴图。CGTrader列FBX408MB（含多版本文件，非单一GLB）。可转换，**≤10MB未实测** |

第1款优先核对采购条件。第2/3款写实渲染不等于日常量产车造型，若不接受明显概念车风格，应继续排除，不因价格相近强行采用。HKV两款声明原文：`The model is designed and produced completely by HKV Studios.` 每款对应商品页均有此句。以上品牌判断限于已检查的商品多角度、内饰图和作者声明；没有保证不存在任何现实车型相似特征，未来取得文件还应检查纹理、隐藏标记与贴牌。

### 四门、四窗及其他部件证据

| 候选 | 四门证据：描述 + 预览 | 四窗 | 其他部件 / 未知项 |
| --- | --- | --- | --- |
| Modern Sedan | 描述明确门和尾门可打开，Max版门带动画；前侧开门图0002、后侧开门图0004可见前后门分开开启及门内饰。**商品层面支持四门可动**，具体节点/铰链未实测 | **未知**。有玻璃不等于四个独立可升降节点；未承诺四窗可直接控制 | 尾门可开，灯组有建模，内外饰可分开使用；玻璃随门、门把手、灯具左右/功能分组、车漆材料名均待文件核对 |
| Futuristic Sedan | 描述22个对象，车身、轮、门分开，门可打开；0007图可见前后门打开及舱内。**支持独立门结构的商品证据**，具体4套绑定待验 | **未知，需重点检查**。描述提到挡风玻璃、后挡及后侧窗使用透明遮罩，不能据此判定可直接降窗 | 预览尾门开启、内饰完整；未验证灯组独立性、四窗几何及转轴；未下载、无节点命中结果 |
| Futuristic SUV | 描述23个对象，车身、轮、门分开，门可打开；0007图展示前后门和尾门打开，远侧门也可见。**商品层面支持四门可动** | **未知**。前/后挡使用透明遮罩；商品页未声明四块侧窗独立 | 可见门内饰及尾门开启；材质适配、灯具/车漆绑定、玻璃层级/下降行程待验 |

商品开门图不是浏览器逐门控制测试，也不能给出运行时节点名。[Modern Sedan部件图](../../outputs/realistic-car-review-2026-10-06/doors-modern-sedan.jpg)、[Futuristic Sedan部件图](../../outputs/realistic-car-review-2026-10-06/doors-futuristic-sedan.jpg)、[Futuristic SUV部件图](../../outputs/realistic-car-review-2026-10-06/doors-futuristic-suv.jpg)。原图URL保存在[预览来源清单](../../outputs/realistic-car-review-2026-10-06/preview-sources.json)，没有抹去水印或作者标志。

### Royalty Free 与当前网页交付方式

授权类型已从商品页确认，均不是Editorial。**但当前将开放GLB放入 `public/models` 的方式，不能据此视为已获许可；目前三款均未通过“可直接接入”门槛。**

- [TurboSquid官方许可](https://www.turbosquid.com/licensing)原文：`TurboSquid 3D Models are royalty free unless otherwise noted.` 第7节(b)要求防止用户提取，限定专有格式，对Unity/Unreal/Lumberyard之外的开放WebGL格式另有限制；通用Three.js加载公开GLB不属于页面明确允许的方式。压缩、改文件名不能解决这一项。还需获得适用于本项目的书面授权，不能仅因购买标准许可就部署。
- [CGTrader官方条款](https://www.cgtrader.com/pages/terms-and-conditions)原文类型：`Royalty Free License, No AI`。定义第8项及21A.2–3要求模型以不可直接提取的嵌入作品形式使用，并采取合理保护措施；21B保留这些限制并禁止模型用于机器学习/训练。CGTrader同款也不能作为绕过分发限制的替代途径；本项目的GLB网页资源及可能的本地软件打包方式需单独核准。
- 如果不接受额外授权或交付方式调整，这3款应从**实际接入清单**排除；保留它们是为了让用户判断造型与预算，不把许可使用场景尚未解决的资产写成全部达标。未提出或实施加密/自定义格式架构修改。

### 同一 HMI 场景并排对比

左边是真实加载现用SU7，右边是对应商品原始预览图放入同一车模区域。两侧使用当前 `CockpitHmi` 组件、1100×650内部视口、同样的锁车/关窗/22°C状态；只在隔离5173页面渲染，不读写项目或后端数据。右侧未加载候选3D文件，原背景、光照、作者标志均保留，**不是换模效果承诺、同光照测试或严格同物理比例比较**。图中保留SU7 Dock文字，是复用现有场景，未把候选称作SU7。

![1 Modern Sedan 与现用 SU7](../../outputs/realistic-car-review-2026-10-06/01-modern-sedan.jpg)

![2 Futuristic Sedan 与现用 SU7](../../outputs/realistic-car-review-2026-10-06/02-futuristic-sedan.jpg)

![3 Futuristic SUV 与现用 SU7](../../outputs/realistic-car-review-2026-10-06/03-futuristic-suv.jpg)

### 未入选与执行边界

- 免费[Generic Sedan Car / MMCWorks](https://sketchfab.com/3d-models/generic-sedan-car-58c33766470d46e7b2aed542650494e5)：页面CC Attribution，113.2k三角形，虽称分件/Rigacar，但未确认四门开合及四窗，内饰描述为粗略；不算满足“接近现有精度且四门可控”，本轮未下载或实物测验。未将NoAI标记误写为禁止商业使用。
- [Generic Small 4 Door Sedan](https://sketchfab.com/3d-models/generic-small-4-door-sedan-979c2cc6889649b19debf223f311fc7c)：授权页面无法确认，排除；不以搜索摘要补作授权。
- [Generic Luxury Sedan / LAGZ3D](https://www.cgtrader.com/3d-models/car/luxury-car/generic-luxury-sedan-8854c7f1-2c61-4885-a117-095f7d4c046c)：US$14、Royalty Free，但规格显示465 polygons/45,223 vertices，面数与顶点数显著不协调、内饰简单。未能形成可信面数/精度判断，未选作前三。
- [Generic SUV 3 / Behr Bros](https://www.turbosquid.com/3d-models/generic-suv-3-1716440)：US$159，未细分就约190.7万多边形，达到网页预算需较大优化；不优先于本次较轻候选。
- 没有找到能在本轮确认全部硬条件的免费写实款，因此没有新增“免费模型实物通过”结论。此前3款CC0虽有实物证据，已因风格被否决，不再占名额。

**尚待用户决定风格，不建议现在直接购买。** 选定后，采购前应取得四门/四窗层级证据、低分辨率网格/纹理清单、当前Three.js/GLB交付方式的明确许可。取得合法文件后才能实测压缩到10MB及门窗行程；保留部件的减面/PBR转换和GLB压缩不等于只改路径。本轮未安装压缩工具、未改默认模型或品牌文字、未触碰5175和稳定数据。产品版本仍dev.99，研究补充不新增编号，未提交、未发布。

## 历史：上一轮三个CC0候选（已否决，不采用）

以下保留当时基础结构核验与原始证据；用户新增写实精度要求后，旧筛选结果不再构成推荐。


三个候选通过**来源许可、四门四窗独立、无可见真实品牌标志、GLB 小于 5 MB**的基础筛选。它们都不是现有 SU7 级别的写实精度；通过基础筛选不等于完成 HMI 接入。门窗行程、裁剪、车身材质及镜头仍须在用户选定后逐项标定。仅研究转换和截图，未替换默认模型，也未修改品牌文案或日常5175。

| 候选 / 来源与作者 | 授权原文截取 | 实物结构 | 实际 GLB 大小 | 风格与准备工作 |
| --- | --- | --- | ---: | --- |
| 1. [Cartoon Vehicles Pack 1.1 — Sedan](https://opengameart.org/content/cartoon-vehicles-pack-1)，Divinux | 发布页：`License(s): CC0`；包内 COPYING：`CC0 1.0 Universal` | 四门 DoorFL/FR/RL/RR；每门有一块独立 Glass 节点，含内饰、独立 Trunk/Hood | **402,612 B（0.403 MB）** | 夸张高车舱、低多边形卡通。DAE 默认单一灰材质，需按节点配置玻璃、轮胎和车漆；源预览的 cel shader 不在包中 |
| 2. [Cartoon Vehicles Pack 1.1 — Estate](https://opengameart.org/content/cartoon-vehicles-pack-1)，Divinux | 同一发布页与同包 CC0 原文，适用于 estate.dae | 四门 DoorFL/FR/RL/RR；每门独立 Window；Trunk 另有后窗 | **427,440 B（0.427 MB）** | 长车舱旅行车，同一系列卡通比例；同样需要材质整理 |
| 3. [Four Door SUV — Battle Royale Town and Airfield](https://3dassets.dev/assets/battle-royale-town-and-airfield-suv-four-door-79414f02)，3D Assets | 发布页：`CC0 1.0 Universal`、`Free to use anywhere. No attribution required.` | door-lf/rf/lr/rr 四个门枢轴；每门含独立 glass、olive、gunmetal 网格；四轮独立 | **302,836 B（0.303 MB）** | 橄榄色方正越野车，材质已齐，准备工作较少；发布者明确标注 **AI 制作** |

按文件字节计算，1 MB = 1,000,000 B。前两款用项目锁定的 Three.js **0.183.2** ColladaLoader → GLTFExporter 转换，保留节点，不加示例贴图或装饰；**尚未额外压缩，原始转换产物已经远小于 5 MB**。第三款为上游原始 GLB（含量化扩展），无额外贴图依赖，未修改。没有把 ZIP 大小、gzip 大小或网页估算当作 GLB 体积。下一轮如需要压缩，应固定工具版本并重验节点，不能合并可控部件。

原始证据：[Divinux ZIP](../../outputs/rig-dev98/candidates/CartoonVehiclesPack1.1.zip)、[包内 COPYING 原文](../../outputs/rig-dev98/candidates/cartoon/CartoonVehiclesPack1.1/COPYING.txt)、[ReadMe](../../outputs/rig-dev98/candidates/cartoon/CartoonVehiclesPack1.1/ReadMe.txt)、[SUV 官方 GLB](https://cdn.3dassets.dev/assets/28243/v1/model.glb)、[CC0 许可文本](https://creativecommons.org/publicdomain/zero/1.0/)。下载 SUV 初次请求403，标准浏览器 User-Agent/来源页重试成功；实际文件已检查，不以页面描述代替文件检查。

### 部件逐项证据

下表名称采用 **Three.js 实际加载后的名字**；加载器会去掉原名中的点和斜线。原始与加载后清单均已保存，写对照表时须使用运行时名字。

| 候选 | 左前门 / 窗 | 右前门 / 窗 | 左后门 / 窗 | 右后门 / 窗 |
| --- | --- | --- | --- | --- |
| Sedan | DoorFL / Glass2 | DoorFR / Glass4 | DoorRL / Glass | DoorRR / Glass3 |
| Estate | DoorFL / Window3 | DoorFR / Window4 | DoorRL / Window2 | DoorRR / Window |
| SUV | door-lf / door-lfglass | door-rf / door-rfglass | door-lr / door-lrglass | door-rr / door-rrglass |

每个门子树内恰有一个独立玻璃 Mesh，脚本已断言；不是从材质名称猜测四窗。玻璃可通过独立节点平移，无需切分车身。Sedan/Estate 的灯具、后备箱是独立对象，但单一材质要克隆后再分配颜色；SUV 未在本轮确认独立后备箱和左右功能灯绑定。三款均需验证门开合轴向、窗下降路径与裁剪，不声称升降行程已标定。浏览器演示只做四门旋转，用于确认层级可动，不接入 VehicleWorld。

全部节点、父子关系、顶点数、SHA-256及四门/窗断言见[实物检查输出](../../outputs/rig-dev98/candidates/verified-structure.json)，复查用[检查脚本](../../outputs/rig-dev98/audit-candidates.mjs)；转换脚本为[convert-candidates.mjs](../../outputs/rig-dev98/convert-candidates.mjs)。第三款发布页声明未引用真实车标/车型特征；本轮实际闭门/开门画面与网格/材质检查未见真实品牌标志。此项为素材核查结果，不把 CC0 解读为对任意第三方权利的保证。

### 风格实屏

以下为 5173 独立研究页中实际加载三款 GLB 的截图；没有替换产品车模。左、中保留 DAE 默认灰材质，右侧为上游 GLB 材质。灰模准确显示所取得文件的现状，不将作者未附的着色器当作交付物。

![三款候选闭门实屏](../../outputs/rig-dev98/candidates/three-candidates.jpg)

![三款候选四门旋转检查](../../outputs/rig-dev98/candidates/three-candidates-open.jpg)

历史排序不再适用：用户已明确这三款风格不符，全部不采用。

### 排除 / 不计入三个通过候选

- Kenney Car Kit 3.1：作者[发布页](https://kenney.nl/assets/car-kit)和包内 License.txt 确認 CC0；实际 sedan、suv、suv-luxury 的 GLB 仅车身及轮等节点，没有四套独立门窗。未证明低成本拆分，排除；下载和原预览仅研究存档。
- [Four-door saloon / Road Vehicle Fleet](https://3dassets.dev/assets/car-park-and-road-vehicle-fleet-saloon-ad831b1f)：CC0，实际955,288 B；四门独立，但玻璃集中在 saloon_2，门子树只有车漆 Mesh。缺少四窗分离证据，不计为通过。[原始结构](../../outputs/rig-dev98/candidates/fleet-saloon-structure.json)。
- [Generic Small 4 Door Sedan](https://sketchfab.com/3d-models/generic-small-4-door-sedan-979c2cc6889649b19debf223f311fc7c)：授权页无法确认，直接排除；不使用搜索摘要补作授权。
- CarConcept 仅两门且含另行授权的标志，仅作降级夹具；Generic passenger pack 已检查轿车副本未独立门窗；Blendkit 候选为 Royalty Free 而非本轮 CC0/CC BY 条件。历史证据如下。

## 历史调查：CarConcept 直接替换门槛

以下为本轮通用适配前的调查记录。此前停止替换是正确执行当时要求；现在仍未替换，但已允许两门夹具省略缺失动画。用户提供的 `/Users/sherry/Downloads/blenderkit` 当时仅查到插件与预览工程，没有目标车模；未安装或执行该插件。

## CarConcept 指定候选：第1步实物核验

来源：[Khronos glTF-Sample-Assets / CarConcept](https://github.com/KhronosGroup/glTF-Sample-Assets/tree/edc7c9e67c639d230715049ee31f9a96a6babbbe/Models/CarConcept)，固定提交 `edc7c9e67c639d230715049ee31f9a96a6babbbe`。实际下载 `glTF-Binary/CarConcept.glb`，并非其他压缩变体。原文件 11,778,688 字节（11.78 MB / 11.23 MiB），SHA-256 为 `c272098089d78c5cd9fd9f24ff50ee8acf8d932c55f2d55fc10adb6c8998966b`。

### 许可证原文与作者

已原样保存 [LICENSE.md](../../outputs/carconcept-audit-2026-10-06/LICENSE.md)、[metadata.json](../../outputs/carconcept-audit-2026-10-06/metadata.json) 和 [Khronos 标志条款](../../outputs/carconcept-audit-2026-10-06/LicenseRef-LegalMark-Khronos.txt)。LICENSE.md 将模型相关文件及元文档列为 CC-BY-4.0，并明确写道：

> This license excludes logos and associated trademarks.

metadata.json 记载模型与纹理作者 Eric Chadwick，2024 年，权利人为 Darmstadt Graphics Group GmbH；Khronos logo 与 3D Commerce logo 分别列在 Khronos 标志条款下，不能把模型的 CC BY 授权当作标志授权。原始许可证的相对链接保持原文未改，在线主依据为[上游许可证](https://github.com/KhronosGroup/glTF-Sample-Assets/blob/edc7c9e67c639d230715049ee31f9a96a6babbbe/Models/CarConcept/LICENSE.md)。本轮仅研究存档，未改动或部署模型。

### 节点、网格、材质

实际包含 101 个节点、97 个网格、29 个材质、14 张图像，0 个动画片段、0 个 skin。**全部名称与索引**见[完整清单](../../outputs/carconcept-audit-2026-10-06/inventory.md)，含节点父子层级、网格到材质映射和无名对象标记；[原始 GLB JSON](../../outputs/carconcept-audit-2026-10-06/CarConcept.gltf.json)保留变换矩阵、材质扩展和 accessor。

| 部件 | 节点 / 网格名 | 材质 | 核验判断 |
| --- | --- | --- | --- |
| 左门 | BodyDoorLColor1，节点65；包含14个子节点 | Paint 1 Carmine 等 | 存在独立变换原点，门饰、把手、镜子和玻璃随门层级运动；结构可适配，未实测动画 |
| 右门 | BodyDoorRColor1，节点50；包含14个子节点 | Paint 1 Carmine 等 | 同上 |
| 左右门窗 | BodyDoorLWindow（78）、BodyDoorRWindow（57） | Glass | 两个独立节点，分别是左右门的子节点；可单独设置变换，升降行程/裁剪需重新验证 |
| 后侧玻璃 | BodyWindowsRearSides（37） | Glass | 左右合在一个网格，父节点是 BodyRearPanelsColor1（34）；不是两套后门/可升降后窗组件 |
| 前挡 / 后挡 | BodyWindshield、BodyRearwindow | Glass | 与门窗分开；应固定或随后舱层级运动，不能替代后排门窗 |
| 前灯 | BodyHeadlights（49） | Headlight | 可独立于其他灯类控制发光；左右灯同一个网格，左右独立需另行拆分 |
| 尾灯 | BodyTaillights（40） | Brakelight | 可按灯类控制；左右同网格 |
| 后转向灯 | BodyTurnsignalsRear（38） | Signallight | 可按灯类控制；左右同网格，尚未验证左右分离；没有单独前转向灯节点 |
| 前舱盖 / 后舱盖 | BodyHood（44）、BodyRearPanelsColor1（34） | Paint 1 Carmine 等 | 独立层级和原点存在，不等于四门 |

Glass 材质由门窗、前后挡及后侧玻璃共享；要独立改透明度/裁剪需克隆材质。三个灯材质均设置 emissiveFactor 和 KHR_materials_emissive_strength，可分别改发光状态，但不存在预制灯光动画。以上为文件结构判断，不声称已完成浏览器控制或真实车控。

### 与改造前 HmiCarStage.tsx 的对照（dev.97 历史）

[改造前源码存档](../../outputs/rig-dev98/HmiCarStage.before.tsx)第20行注释明确只移动四块门窗，固定前后挡、小窗与灯罩。实际逻辑是：

1. 第35行附近固定 `fl/fr/rl/rr` 四个门键；现有 VehicleWorld 也保存四个车窗值。CarConcept 只有两套门组件，缺少可对应 `rl/rr` 的后门。
2. 第75行附近要求**网格对象名**为 `Glass`，或材质名为 `Car_body` / `M_body_smoothblack`，或对象名为 `interior` / `interior011`，再进入连通块拆分。CarConcept 的 `Glass` 是材质名而非对象名。逐 primitive 核对上述条件，候选节点数为 **0**；仅改 GLB 路径不会产生任何可控门窗。
3. 后续按 SU7 的位置阈值分左右/前后，使用固定铰链、世界Y升降0.48和裁剪高度0.98。CarConcept 使用自带父子层级和原点，根矩阵还将源局部Z轴转换成世界Y轴；不能照搬SU7的旋转、坐标阈值、铰链与行程。
4. 当前代码将网格世界变换烘焙到几何。若采用该两门车型，应重新按节点层级绑定控制，保留门对子部件的继承；这仍不能补出不存在的后门。把后侧玻璃移动伪装成后窗升降、让前门响应后门控制或静默删除后排控制，都不满足当前替换要求。

**结论：两门展示或两门交互可另外设计；保留当前四门、四窗功能的替换不通过。** 本轮不改变产品控制范围，不继续第2–5步。

### 执行状态与证据

| 用户步骤 | 状态 |
| --- | --- |
| 1 下载、确认许可证、列名并判断适配 | 完成；文件结构门槛未通过 |
| 2 去标志、固定 gltf-transform 版本并压缩约3MB | 未执行；未安装工具或修改模型 |
| 3 新 public 目录、SOURCE 和产品署名 | 未执行；模型仅保存在研究输出目录 |
| 4 路径、品牌文字、CSS、i18n、检查与打包脚本 | 未执行；品牌引用尚保留 |
| 5 删除旧资源、前端测试/build及5173截图对比 | 未执行；没有运行资源改动，不能报告替换验收通过 |

已保存[原始GLB](../../outputs/carconcept-audit-2026-10-06/CarConcept.glb)、[结构核验结果](../../outputs/carconcept-audit-2026-10-06/summary.json)、[可复查脚本](../../outputs/carconcept-audit-2026-10-06/inspect.py)及[源码/脚本/开发文档中的初步SU7引用清单](../../outputs/carconcept-audit-2026-10-06/su7-references.txt)。引用清单限定所列目录，未宣称已完成删除前的全仓清理。核验脚本验证GLB头/长度、SHA-256、门窗父子关系和现有候选过滤条件；运行 `python3 outputs/carconcept-audit-2026-10-06/inspect.py` 可复查。未运行任何模型内脚本。

额外发现：`scripts/check_local.py` 当前是对本地资源和HTTP响应动态计算SHA-256，并无写死的模型哈希常量；若未来通过替换，应同步资源路径与校验说明。HmiCarStage还从SU7目录读取环境HDR，未来删除目录前必须单独解决其来源许可与路径。两项本轮均未修改。5175及稳定数据未触碰，研究不新增产品编号，保持dev.97。

## 候选与证据

| 候选 | 已确认 | 未完成 / 结论 |
| --- | --- | --- |
| [Generic passenger car pack](https://sketchfab.com/3d-models/generic-passenger-car-pack-20f9af9b8a404d5cb022ac6fe87f21f5)，Comrade1280 | 原发布页 CC BY 4.0；公开 Unity 改编副本同样保留署名与许可；实际轿车 FBX 有 5 个 Mesh、7,122 个三角形、0 个动画片段 | 仅此副本中的 sedan.fbx 已检验，不能将结果推广到包内全部车型或未取得的原始格式；轿车不通过直接接入 |
| [Generic Sport Sedan 2022 PL](https://www.blendkit.com/asset-gallery-detail/d3d94329-838b-46c3-9cc1-1e07c4c7b705/)，Pierre-Louis Baril | 发布页标注虚构车型、Royalty Free，120.9 MiB、737,525 多边形；[获取页](https://www.blendkit.com/get-blendkit/d3d94329-838b-46c3-9cc1-1e07c4c7b705/)引导通过账号及 Blender 插件使用 | 未取得 .blend / .glb / .fbx；门窗、转轴、隐藏基底和浏览器性能全部待验；不能宣布适配通过 |

授权信息是筛选依据，不代表对全部第三方权利作出保证。CC BY 使用需保留作者、来源、许可链接并说明修改；Blendkit 的 [Royalty Free 说明](https://www.blendkit.com/docs/licenses/)允许商业衍生作品，但限制把模型本身作为资产转售。后者若采用，还需核对拟交付的网页/源码资源分发方式。

## 已取得轿车的部件检查

| 部件 | 实际结构 | 独立控制判断 |
| --- | --- | --- |
| 左前、右前、左后、右后车门 | 没有门节点、门骨骼或门动画；主体为 Sedan_Body | 不具备直接控制结构；需人工拆分、补门内侧并建立铰链 |
| 四块可升降侧窗 | Glass.006 是材质，不是四个独立节点；玻璃与车身在同一主要位置连通块内 | 不能把玻璃材质等同于四窗独立；需按窗分离、区分固定小窗并设置下降路径 |
| 后备箱 / 前舱盖 | 无独立节点或动画 | 需另行拆分和设置转轴 |
| 四个车轮 | Wheel_A、Wheel_A001、Wheel_A002、Wheel_A003 为四个独立 Mesh，原点接近轮心 | 结构上可分别变换；尚未做浏览器旋转/转向及正反方向验证 |
| 灯组 | Optics.006 材质位于 Sedan_Body，未提供左右及功能灯组独立节点 | 可整材质处理，但不能据此认定支持左右转向灯等独立控制 |
| 后视镜 | 主体分析存在左右突出的小块，但没有独立镜子节点 | 自动定位结果不足以确认折叠轴及完整附件；待人工拆分核验 |

解析得到一个根 Group 和上述五个 Mesh。Sedan_Body 含 4,754 个三角形，每轮 592 个。按导入世界坐标乘 0.01、位置保留五位小数合并重合顶点，车身有 28 个位置连通块；最大块含 3,908 个三角形，同时包含 Body.006 / Glass.006 / Optics.006。该分析用于判断“不能靠现成节点或连通块直接得到门窗”，不等价于原始建模软件的拓扑连通性认证，也不表示无法人工重新建模。

没有预制动画本身并非淘汰原因：独立几何与正确转轴具备时可以由代码驱动。本候选的问题是关键门窗几何未按控制对象提供。

## 实物文件与复查

- 副本来源：[TUM-VT/Sumonity-PassengerCars](https://github.com/TUM-VT/Sumonity-PassengerCars)，固定提交 `92be5975162ff9348c96d76dd6077321dce013dc`，路径 `models/import/sedan.fbx`。仓库说明这是原作者资产的 Unity 改编副本。
- 文件 311,516 字节，SHA-256：`7f68fc4cf82d8e222e295365c52484ae637da8171c79bd50e04889c712e8d3d5`；与 Git LFS 指针一致。网络中断后的分段文件经完整 hash 验证后才解析。
- 本地样本：[sedan.fbx](../../outputs/car-asset-audit-2026-10-06/sedan.fbx)；[署名与许可记录](../../outputs/car-asset-audit-2026-10-06/LICENSE.txt)；[节点清单](../../outputs/car-asset-audit-2026-10-06/sedan-structure.json)；[位置连通块](../../outputs/car-asset-audit-2026-10-06/sedan-components.json)；[检查脚本](../../outputs/car-asset-audit-2026-10-06/inspect.mjs)。样本仅留在研究输出目录，未放入网页 public 资源。
- 使用项目已安装的 Three.js FBXLoader，纹理加载替换为本地空纹理，仅检查结构，不发起纹理请求，不执行模型包内脚本。复查：`COMPONENTS=1 node outputs/car-asset-audit-2026-10-06/inspect.mjs outputs/car-asset-audit-2026-10-06/sedan.fbx`。

## 后续任务与接入验收

1. 待取得写实候选的实际模型文件及对应授权记录；不能以商品介绍代替检查。
2. 对四门、四窗、前舱盖/后备箱、四轮、灯组、后视镜逐项记录节点名、几何归属、转轴、动画及缺失项。按最新补充四门为必过项、四侧窗独立为优先项，其他部件按实际能力声明，不新增未请求功能。
3. 在隔离开发预览中逐门打开/关闭，确认门把手、内饰及玻璃随门运动；逐窗验证 0 / 50 / 100 和反向恢复，确认其他窗、车身及固定玻璃不被带动。确认 `windows` 数值方向与现用状态一致。
4. 再检查世界轴向、单位、缩放、透明排序、黑色舞台光照、热点命中和浏览器加载成本。保留现有水面/背光布局；环境 HDR 的来源许可也要单独核对。
5. 通过后才实施模型替换、状态映射与品牌文字同步，登记独立开发迭代并验证。当前没有进行浏览器动画或产品接入验收，没有更新日常 5175，也未提交或发布。
