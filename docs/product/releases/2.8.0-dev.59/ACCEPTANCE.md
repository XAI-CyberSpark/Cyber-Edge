# dev.59 验收：图片到真实API模型与HMI反馈

2026-09-27｜24个文件已应用主工程并逐项哈希校验，原内容已备份；后端重启health HTTP 200（PID43321），正式HTTP复验通过。开发工作区，未提交、未发布。

## 实现与回归

- 图片适配复用同步runtime_chat和异步complete，Anthropic使用原生image块，MiniMax保留兼容格式。普通文字路径保留；OpenAI未配置，只验证兼容payload，不声称实际调用通过。
- wait模态过滤、当前图片与结构化事件传递、旧图清理；空图片不能悄悄调用纯文字模型。
- JSON outputFields错误提供映射示例；氛围灯顶层配置和上游数据字段区分。新增$ref跨展示节点到动作的实际引擎回归，说明之前失败是配置写错字段而非引用机制不支持。
- 单独动作的真实reply进入HMI；结束后展示恢复回执，重复事件不重放。
- 后端94项通过（backend-tests-final.log）；核心前端121项通过（frontend-targeted-receipts.log）；TypeScript/Vite构建通过（frontend-build-receipts.log）。暂存构建不含全部公共素材，不作为发布包。既有大分块提示保留。
- 扩展通用打包运行器跑到167项，164通过3失败：视频用例应使用其packages:external专用运行器，改用后19项全部通过（video-replay-final.log）；儿童旧基准两项失败在未改主工程dev.58同样复现（benchmark-main-baseline.log），不计为本轮通过，也不将其归咎于图片改动。旧基准仍需后续迁移。

## 真实API证据

1. 手写协议夹具：Anthropic网关和MiniMax各3次模型调用，红圆/蓝三角/绿方形均识别通过。证据live/graph-images-*，此项不是自主生成图。
2. 自主生成失败记录：generated-visual未完成提交；generated-visual-repair三次试跑，先字段误配，后只剩英文大小写断言失败。原需求只要求英文，测试小写要求过严；两项失败不删除、不倒改成通过。
3. 新请求明确小写显示及实际动作成功后再告知；固定用例保持不变，API模型继续修复原图。generated-visual-clarified耗时168.67秒、8节点、两轮真实试跑共4次模型调用，红/蓝输入及结束恢复通过；模型还自行移除了空值展示。图与需求全由原请求/工具会话产生，未手工改图。
4. 独立复验相同nodes/edges（independent-visual）：3图，第三张绿色方形未参与作者验收计划。初始灯光#654321/17、空调25，验证实际色值与模型输出一致、颜色分类正确、其他车辆状态保持、结束完整恢复、成功展示晚于动作、图片/结束事件去重。3次真实模型调用，全部通过。这里只验证合成图，不声称真实照片精度或精确像素取色普适保证。
5. 独立分析脚本首轮无法解析带Markdown围栏的合法JSON而报错；原执行已passed。修正分析器兼容围栏后复用同一证据核对通过，未为修分析重复调用API（analysis_only=true）。

## 协议、限制与使用

依据：[Claude Vision](<https://platform.claude.com/docs/en/build-with-claude/vision)、[MiniMax Chat Completions](https://platform.minimax.cn/docs/api-reference/text-openai-api>)。网关模型身份不独立保证；真实调用使用服务器已有模型绑定，不回退到伪造成功文本。

单张4MiB、消息24MiB是本地预算；自动编排和试跑仍各限制2MB，未实现大图资产引用传输。签名校验不是完整图片解码，远程HTTPS由提供商读取。只接文字与图片，不包括视频/音频生成、持续感知、图像生成。

完整浏览器画布交互、模型广泛视觉质量、外部MCP执行、通用循环、持久会话与实车/端侧交付未完成。当前已验证的是API+真实图引擎+隔离HMI动作，不是“任何场景均可靠”。本轮保留所有用户已有项目与未提交修改。

证据目录：`/Users/sherry/Documents/ChatGPT/OAKEgde Studio/outputs/multimodal-dev59/`。apply-manifest/deployment/restart记录应用、备份与健康状态；正式HTTP结果如下。

## 主工程正式接口与示例

- 正式认证图片推理HTTP回放同一8节点图：3张合成图片、18步、3次实际模型调用，15.18秒。含未参与构图的绿色方形、#654321/17初始灯光、空调25、重复图片/结束事件。其他车辆字段保持，结束完整恢复且HMI显示恢复回执，成功文案晚于动作回执。证据live/formal-http-independent。
- 正式JSON生成接口由MiniMax进行局部编辑：36.35秒，只修改n_invite.data.responseText；其他节点字段、连线、视觉Anthropic模型绑定以及固定图片计划逐项比对保持。红/蓝两例实际图执行通过。证据live/formal-authoring。
- 正式MiniMax图片推理识别蓝色三角形通过；无效图片HTTP400且不回显原始载荷。第一次测试脚本漏传必需model字段返回422，补齐服务端公开配置模型ID后复验；422不计模型调用或成功。证据live/formal-runtime-bound及formal-runtime.log。
- 新增可打开项目“**Hermes看图调灯 · dev.59验证**”，文件hermes-visual-dev59.json；nodes/edges/meta保存回读一致，未覆盖已有项目。保存的是MiniMax仅修改邀请文案后的API图；独立绿色图证据对应文案修改前同构图，这项区别保存在项目说明。
- 使用：打开此示例，启动体验，上传图片，查看识别结果和HMI灯光，再输入“结束”恢复原值。本轮没有完整浏览器操作验收；接口与执行器通过不等于所有页面交互均已验证。
- 文档最终状态单独写入documentation-finalization.json，保留首次应用清单。未创建Git提交或发布包。
