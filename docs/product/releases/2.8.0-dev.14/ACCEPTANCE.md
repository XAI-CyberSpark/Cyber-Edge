# 验证记录

版本：2.8.0-dev.14。日期：2026-09-15。开发工作区未提交、未发布。

- node scripts/test-hmi-chrome.mjs：5 组通过，检查 Figma 栏位入口、当前真实模拟温度、双控件全舱联动、16–30 度边界、空调开关、原有面板与测试台可达、媒体/速度状态更新、除雾不执行虚假动作。3D 与助手组件被隔离桩替代；无真实模型/硬件请求，无用户项目写入。
- npm run build：首次发现替换栏位后遗留 LayoutGrid 导入，清理后 TypeScript 和 Vite 构建通过。仍有原有大包及旧 Browserslist 数据提示。
- 与 before-figma-chrome-dev14/CockpitHmi.tsx 比对：从 CockpitAssistant 到 Dock 前的中间 JSX、整个 dialog/testbench 到文件结尾逐字一致。
- 原资源逐项验证格式与 SHA-256，见 evidence/assets-sha256.json；Figma 提供的截图已查看并存档。
- 浏览器：尝试访问 127.0.0.1:5175，工具报告 admin-enforced policy could not be verified，访问被拒。没有使用其他自动化方式绕过。未完成页面截图、同尺寸对照、焦点和滚动的实际浏览器检查。
- 字体：设计为 HarmonyOS Sans SC/MiSans；工程未自带字体文件，以 CSS 字体栈与系统回退处理，无法承诺缺少字体时逐像素相同。

结论：代码与隔离交互验证完成；视觉验收待完成，不宣称完整产品验收或正式发布。
