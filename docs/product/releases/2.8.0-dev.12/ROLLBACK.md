# 回滚边界

修改前文件和 SHA-256 清单位于 `.demo-runtime/versions/before-project-navigation-dev12/`。这是本轮文件级快照，不是完整 Git 版本。

需要撤回时，先备份当前文件并与本轮完成清单比较，再按改动范围合并恢复。不得整库重置或覆盖后续修改；新增测试、API 辅助模块和文档按引用检查后处理。版本元数据应追加回滚事实，不抹去后续历史。

本輪不备份也不修改 backend/projects、models、studio/public/models 或浏览器数据；HMI/助手/车模代码不在此次覆盖清单内。
