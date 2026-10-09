# 高通 AI Hub 模型目录

目的：在AI模型分类中浏览高通模型并筛选选型。状态：dev.41本机验证通过，未提交未发布；维护日期：2026-09-25。
[返回主文档](../README.md)

## 来源与范围

使用官方 `qai-hub-models-cli==0.63.0` 的protobuf结构读取其公开发布manifest；当前235项。来源：https://qaihub-public-assets.s3.us-west-2.amazonaws.com/qai-hub-models/releases/v0.63.0/manifest.pb 。官方说明：https://github.com/qualcomm/ai-hub-models/blob/main/cli/README.md 。

当前固定经过核验的0.63.0发布版本，同步按钮刷新该版本内容；不自动升级SDK或切换发布版本。官网其他渠道新增模型可能不在此清单中，不将235项宣称为官网全部模型。升级时需核验新版本字段、更新依赖与服务VERSION并重新生成快照。

## 接口与筛选

`GET /v1/catalog/qualcomm/catalog?refresh=true` 返回完整目录及version、synced_at、cache_status、warning。host-lite、主后端和FastVLM入口均挂载；不更改 `/v1/models`，不写入state/models.json。运行环境安装requirements中的轻量目录依赖，未安装时在线解析失败回退到随包快照。

前端本地搜索（中英文用途、名称、芯片、标签）、来源切换与组合筛选，20项分页。领域、用途、运行时与芯片不转换成LLM节点类型。has_quantized仅表示官方有量化产物，不表示支持所有精度。supported_chipsets表示官方测评芯片，supported_runtimes表示有发布产物的运行时，两者独立，不构成兼容组合保证。详情通过固定官方链接查看授权和完整性能。

## 缓存与失败

公开固定地址、连接4秒/读取10秒超时、8MB上限、禁止重定向。进程内6小时缓存；同步失败保留最近成功结果，冷启动失败用随包公开目录快照。同步时间保持原值，显示缓存及重试；60秒内抑制重复同步。无快照且上游失败返回503。未运行后台轮询任务；打开目录/点击同步时按规则读取。

## 模型职责

高通目录条目只供选型，统一待接入，不下载权重、不要求高通账号、不注册成可执行模型。已有模型继续添加/拖放和原有运行路径。Cybertools量化、编译、打包、部署均属后续独立集成，不能由目录存在推断已经支持。

验证结果见[dev.41验收](releases/2.8.0-dev.41/ACCEPTANCE.md)。

## 卡片呈现

235项简介/详细描述取自同版本官方info.pb，随包记录在qualcomm_card_metadata.json，按id合并在线清单及离线快照。数据来自官方英文描述，未自动翻译改写。升级目录时同步更新此元数据文件；缺失元数据仍可浏览/筛选。

封面使用官方公开model_demo.png，以官网自身_next/image缩略图加载（卡片384px、详情640px），失败回退原图，再失败显示「暂无场景预览」，不影响名称/筛选。lazy loading、no-referrer；图片依赖外网，不承诺离线图片缓存。

模型与MCP共用catalog-cards.css，双列、260px高、12px间距/圆角；名称最多两行、简介两行，完整信息见详情。已有本地模型无高通封面，使用明确的OAKEgde Studio组件标记。桌面组件库仍为页面三分之一，窄屏沿用既有360px下限。

## 目录交互补修（dev.94，2026-10-05）

模型卡片仍可直接拖入；详情移除独立添加按钮，卡片Alt+Enter为键盘等效操作，未接入资料及运行禁用边界保持。模型与MCP工具区通过CatalogChrome对齐；卡片内部设计不统一覆盖。验证见[dev.94验收](releases/2.8.0-dev.94/ACCEPTANCE.md)。
