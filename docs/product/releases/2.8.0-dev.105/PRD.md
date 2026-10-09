# dev.105 输入契约、错误归因与测试前置检查

维护日期：2026-10-09。状态：实现与所列验证完成，真实实验2/7可应用，可靠性未达。主依据：本轮用户要求；返回[项目主文档](../../../README.md)。

目标：JSON入口支持对象、JSON字符串、text包装，outputFields校验一致；提交计划和inspect前置定位输入错误；输入/模型输出分码，trial反馈四类错误及修复方向；静态警告等待与跨case记忆依赖。

验收：新增前后端回归、后端全量及前端测试/类型检查；冻结实现后C MiniMax×2、Claude×2，dev.103 A MiniMax×3，逐次记录可应用、次数、耗时、最终分类与最后三条错误，并对比dev.104。

约束：仅开发5173/8000，save_on_success=false，候选/tmp/oakegde-dev105-candidates/；不改stable/5175、backend/projects、SDK，不prepare、不提交、不泄漏密钥、不写Desktop；通用实现，不加场景特判。静态推断不替代运行验证，动态分支/记忆语义无法证明时明确限制。
