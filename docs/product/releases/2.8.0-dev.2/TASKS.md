# 开发任务

| 任务 | 对应需求 | 状态 | 实现 |
|---|---|---|---|
| TASK-001 共享车辆状态和异步车窗执行器 | REQ-002/004/005 | 完成 | studio/src/domain/vehicleWorld.ts |
| TASK-002 HMI 控件、助手、测试抽屉 | REQ-001/007 | 完成 | CockpitHmi.tsx、cockpit-hmi.css |
| TASK-003 车模侧窗与实际开度联动 | REQ-002 | 完成 | HmiCarStage.tsx |
| TASK-004 工作流反馈、失败分支、窗口区域配置 | REQ-003/004/006 | 完成 | GraphEngine.ts、CarControlNode.tsx |
| TASK-005 新建示例并集成现有工作区 | REQ-001/006 | 完成 | rainComfortScenario.ts、WorkspacePage.tsx、FlowCanvas.tsx |
| TASK-006 仿真状态在模式切换时保留 | REQ-002 | 完成 | ResizableSplitter.tsx、VehicleSimulator.tsx |
| TASK-007 自动化、构建和浏览器验证 | 全部 | 验证记录见 ACCEPTANCE | scripts/test-hmi.mjs、tests/hmi-simulation.test.ts |

现有聊天组件有未使用的 useMemo 导入，顺手移除以通过 TypeScript 构建；其余既有业务修改保留。

- TASK-008（REQ-002）完成：接入用户提供的 SU7 模型、环境光与四窗面片适配；来源见 studio/public/models/su7/SOURCE.md。

- TASK-009（REQ-001/002/007）完成：参考图风格的车机桌面、快捷卡片、底栏、原生对话框、昼夜配色；保留 SU7 与共享执行器，新增目的地/媒体状态编辑入口。

- TASK-010（REQ-008）完成：独立 SimulationInputPanel，文字/摄像头图像输入当前工作流，显示真实事件反馈，保留 HMI。
- TASK-011（REQ-008）完成：图像 LLM 服务失败禁止文字规则回退，新增帧传递与失败阻断测试。

- TASK-012 完成：仅精简右侧 UI，取消视角状态/标签、重复工作流栏和辅助说明，正常对话显示“你 / 车机”。

- TASK-013 完成：深色展厅、聚光与地面反射，卡片/底栏/控制弹窗统一炭灰冷蓝配色。

- TASK-014（REQ-010）完成：灯光目标固定车身中心，灯光组随观察方位转动；OrbitControls 禁止平移。
- TASK-015（REQ-009）完成：分离 SU7 四门面片并设置旋转铰链，添加跟随车门的开关图标、当前侧显示及锁车联动；四门浏览器检查通过。
