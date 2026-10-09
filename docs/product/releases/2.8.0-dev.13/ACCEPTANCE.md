# 飞书 7 项修改验收

日期：2026-09-15。版本：2.8.0-dev.13。开发工作区未提交、未发布。

## 自动检查

- `cd studio && npm run build`：TypeScript 与 Vite 生产构建通过。
- `npm run test:hmi`：34/34 通过。
- `node scripts/test-project-navigation.mjs`：20/20 组隔离 DOM 检查通过。
- `node scripts/test-feishu-refinements.mjs`：4/4 组通过，涵盖模型目录失败/重试/空/异常、全部模型与分类、真实拖拽配置、标题更新及说明删除。
- 后端 `./.venv_macos/bin/python -m unittest discover -s . -p 'test_opensparx.py'`：5 项通过。
- 后端 `./.venv_macos/bin/python test_child_vision_failure.py`：2 项通过。该旧文件直接执行 unittest.main，不能按常规模块名组合运行。
- 原 DOM 测试依赖缺失，补充 jsdom 26.1.0 开发依赖后通过。构建仍提示包体偏大和 Browserslist 数据较旧；npm install 报告 12 项依赖安全告警，本轮未做批量依赖升级。

## 实际页面与模型

在 127.0.0.1:5175 的 1280×720 页面检查：

- CE-01/02：右侧标题为“OpenSparX 座舱交互示例”，四行说明已移除，输入与反馈可用。
- CE-03/05：编排无重复输入/运行栏，仿真无显示工作流按钮及分割条；返回编排后节点与执行结果保留。节点属性仍提供“单独测试模型”。
- CE-04：系统监控从左侧全高展开，遥测与内核标签可读；切换组件库关闭监控并同步导航。
- CE-06/07：组件库仅节点/Store；实际模型列表展示 OpenSparX 与 Gemma4，LLM、VLM 中均能找到 OpenSparX。
- 经前端代理调用真实 OpenSparX：文字问候 HTTP 200，约 0.73 秒；人工生成的蓝色测试图片 HTTP 200，约 11.02 秒，回答“蓝色”。详见 evidence/model-verification.json。
- 仿真输入“请打开全部车窗”，HMI 显示“4 扇车窗开启”；执行详情完成，记录 opensparx-cabin-intent:3b、915 tokens 及 windows=open_all。此处是实际模型驱动仿真车控，不是真车测试。

## 数据与飞书

- backend/projects 与 backend/state 的文件集合和 SHA-256 前后一致，共 4 个文件；未保存测试流程到用户项目。
- 飞书原清单 7 项均以紫色删除线标记，追加各项完成说明；最终 revision 142，7 张原图 src 与读取时一致。回读证据见 evidence/feishu-completion.json。
- 原始需求与可执行修改规格见 PRD.md，回滚见 ROLLBACK.md。

## 验证范围

未覆盖全部响应式尺寸、真实车辆硬件及儿童视觉准确率评估。监控面板原有模拟指标保持原样，左侧布局通过不表示硬件性能数据已接入。本记录仅验收飞书 7 项；同一开发版本中其他任务新增的首页视觉调整按其独立记录验收。

## CE-08 补充验收
构建与 20 组项目导航 DOM 回归通过；四个左侧面板浏览器检查通过。飞书 revision 197，第 8 项紫色删除线与完成说明已回读，保留 8 张原图。详见 [CE08.md](CE08.md)。

## CE-09/10
构建与1280×720浏览器检查通过，模型三个标签完整可切换、场景分类小标题已移除。范围和回滚见 [CE09-10.md](CE09-10.md)。

## CE-11
构建与浏览器检查通过：组件库覆盖项目名称区域，关闭恢复原项目。详见 [CE11.md](CE11.md)。

## CE-12/13
构建及20组隔离导航检查通过，飞书已回写；第14项未实施。详见 [CE12-14.md](CE12-14.md)。

CE-14补充：用户已确认删除首页刷新按钮；已完成并通过构建及20组导航DOM回归。此前待明确状态已解除。
