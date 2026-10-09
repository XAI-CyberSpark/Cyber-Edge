# 界面协议验证与当前决定

2026-09-15。

候选：A2UI v0.9.1（官方当前协议），https://a2ui.org/specification/v0.9.1-a2ui/ 。其 createSurface/updateComponents/updateDataModel/deleteSurface 模型适合未来独立的界面消息层；组件目录与动作校验仍由客户端负责。AG-UI 可用于后续事件传输：https://docs.ag-ui.com/introduction 。

当前原型未引入 A2UI/AG-UI SDK，也没有实现其完整协议，不能标称协议兼容。采用内部四类受控计划：reply、clarify、climate、windows，以及工作流主动反馈区域。A2UI 的可组合任意组件、跨应用传输不属于已完成能力。

实测发现 OpenSparX 原始提示词有时忽略 JSON，输出原生 SPEECH_END/TAG 文本。加入格式示例后问候、空调和上下文降温可返回结构化结果；车窗开度与模糊对象存在误判。故先采用小目录＋严格参数校验＋对象核对＋用户确认，不将模型输出直接变成车控。下一步如需全面引入 A2UI，先确定 React renderer/catalog，增加 JSON Schema 一致性测试与完整模型测评，再扩大组件种类。

当前回归仅为有限样本，不代表模型准确率。保留原始失败样本用于后续 badcase 集。
