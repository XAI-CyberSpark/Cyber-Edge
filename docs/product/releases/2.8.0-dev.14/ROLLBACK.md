# 局部回退

修改前 CockpitHmi.tsx 位于 .demo-runtime/versions/before-figma-chrome-dev14/，manifest.json 记录其 SHA-256。metadata/ 备份登记本版前的版本与文档。这是局部备份，不是 Git 快照。

恢复前逐文件比较，保护后续编辑及并行任务；不要全量覆盖 metadata/ 或重置 Git。新增文件包括 HmiChrome.tsx、hmi-chrome.css、public/hmi/figma-chrome/、tests/hmi-chrome.dom.tsx、scripts/test-hmi-chrome.mjs 与本版本文档。只有核对无后续引用后才能清理新增项。本轮不改用户项目、模型、车辆状态结构或 SU7 资产。
