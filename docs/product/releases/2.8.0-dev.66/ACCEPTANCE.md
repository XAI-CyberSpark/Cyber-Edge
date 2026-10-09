# 验收

2026-09-27，macOS本地未提交工作区。修改仅为前端视图生命周期，未修改用户项目、模型参数、后端或设备接口。

## 已通过

- `node scripts/test-scenario-session-dom.mjs`：6组通过。使用生产SimulationInputSurface与真实聊天组件，执行服务为可控延迟Promise；切隐藏时signal未取消，返回仍处理中；隐藏完成仅有一次回复；返回后异常显示真实错误；重复提交不产生第二次调用；项目切换仍取消，迟到结果不进入其他项目。
- `node scripts/test-scenario-session.mjs`：21项会话及GraphEngine测试通过。
- `npm run build`：TypeScript与Vite构建通过。已有大包与Browserslist数据库提示保持。
- 实际代码接线：WorkspacePage按场景ID保留FlowCanvas，模式通过simulatorOpen传入；FlowCanvas不再按该模式条件卸载测试面板；VehicleSimulator原有隐藏保活行为保持。

## 未完成与限制

本机浏览器工具获取到登录页，但登录操作超时；重新绑定同一标签再次超时。没有通过脚本绕过浏览器，也未运行真实API测试。本轮不能声称已完成实际浏览器端到端验收或儿童图片识别质量验收。

仅同一场景编排/仿真切换持续运行；切换项目、关闭场景和离开工作台仍取消；刷新或关闭浏览器不保证请求继续。前端改动由Vite加载，不需要重启后端。未提交、未发布、飞书未同步。
