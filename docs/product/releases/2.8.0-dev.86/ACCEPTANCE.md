# 验收记录

2026-10-05｜2.8.0-dev.86｜本地修改与自动检查完成；飞书回写完成，实屏限制见下文；未提交、未发布。

## 实现

Sidebar 返回按钮移入详情标题网格右列，图标16px，44px命中区，保留可访问名称、悬停说明和返回焦点。名称/说明沿用已有字号。
WorkspacePage 不再挂载 ScenarioSpecPanel，删除其专属同步回调和读取 helper；保留其他入口使用的模板构建、场景元数据及项目保存机制。
ChatPanel 直接渲染完整消息序列，去除 restoredMessageIds 展示分组与历史总折叠样式；标题前复用原规格面板的 Sparkles 16px，颜色为语义 primary，间距8px。智能日期及 ReplyActivity 用时/操作折叠保持。

## 检查

- chat-composer：7组通过，旧/新消息顺序与原文保持、无历史总折叠、标题图标、智能时间和回复操作。
- component-library：8组通过，图标按钮结构、返回交互、搜索与原目录行为保持。
- workspace-requests：20组通过，覆盖保存恢复、请求时间/状态与并行 dev.87 模板替换；旧规格面板不再显示。
- TypeScript/Vite生产构建通过；已有Browserslist与大chunk提示保持。
- 排版审计：141文件、2301条、0违规；本地化审计Missing 0、无裸中文；localization 3组通过。
- project-navigation：21组DOM/mock检查通过，没有真实项目写入。
- git diff --check通过；使用本轮修改前副本检查局部差异，保留并行改动。未提交、未发布。

## 限制与线上清单

浏览器工具本轮再次初始化失败：旧可写根 Cyberedge 为符号链接，内核拒绝启动。未将DOM或构建结果称为实屏验收。
飞书成功读取 revision 94，三项文字及四张截图已核对。首次回写前读取曾遇自动权限审核超时；用户允许重试后重新读取确认 revision 94 未变。逐项按最新 block ID 与 revision 写入并回读，最终 revision 98：三项原文均带 del 和紫色 rgb(100,37,208)，标题、四张图片的 token 与结构完整保留。第一项初次写入的 s 标签被服务端移除，已依据回读结果改用受支持的 del 标签修正；最终断言全部通过。
