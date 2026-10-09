# 验证与限制

2026-09-24；2.8.0-dev.23；未提交工作区、开发版未发布。

- `node scripts/test-image-upload.mjs`：5组通过，覆盖大小/格式/空文件分类、缺失MIME的有效签名、小图字节保持、大图比例与不放大、输出大小约束、解码/压缩错误及资源释放。Canvas/解码使用受控实现，不能代替真实浏览器压缩。
- `node scripts/test-feishu-refinements.mjs`：4组通过，既有仿真面板与模型相关界面回归。
- `npm run build`：TypeScript与Vite通过；已有大包/Browserslist提示保留。
- 实际5175浏览器：独立测试页正常密钥登录，打开儿童关怀仿真；选择19,207,923字节、3200×2000的随机像素PNG（无个人信息），页面成功显示待发送预览和发送按钮，DOM实测2560×1600。第一次文件工具卡住后报错，重新登录选择成功。未把测试图发送给模型、未保存项目；已移除附件并关闭测试页。
- 两个入口共用prepareImage；单独测试模型入口的实际文件选择未另行浏览器验证。未评测压缩对视觉模型细小目标识别的影响、真实手机EXIF方向或Windows实机。

压缩仅在浏览器内进行；缩放/有损JPEG可能损失细节，透明区域在压缩路径填白，小图原样保留。原图25 MiB、像素8000万、输出4 MiB是当前产品保护值，不是模型官方上限。HEIC/HEIF仍需先转换。旧Windows交付ZIP不自动更新。

修改前逐文件备份：`.demo-runtime/versions/dev23-before-image-upload/`。只覆盖本轮原有文件，不是完整Git快照；恢复应对比后续变化，并对应处理新增prepareImage、测试及dev.23文档。不重置Git、不更改已有项目/模型。

## 图文推理上下文修复验收（2026-09-24）

沿用dev.23，未提交、未发布。原独立模型日志显示：4296 tokens请求超过4096上下文，上游400被后端统一包装为503。读取本地模型元数据确认支持128000上下文；启动脚本默认改为8192并保留环境变量覆盖。按官方配置方式修改并重启服务：https://docs.ollama.com/context-length 。没有改写模型权重或已有项目。

- 后端 `python -m unittest test_opensparx test_child_vision_failure`：9项通过，包含上下文计数提取、其他错误不暴露上游内容、图文/JSON协议及无模拟回退。
- 工作流 `opensparx.test.ts`：19项通过，包含具体错误传递、非JSON错误兼容和失败不执行车控；TypeScript/Vite生产构建通过。已有大包与Browserslist提示保留。
- 重启项目独立OpenSparX 11435与后端8000。`/api/ps`确认已加载上下文8192，模型仍为opensparx-cabin-intent:3b，全部模型占用在GPU。
- 通过真实5175代理及密钥认证，运行保存的儿童关怀图（不保存测试结果到项目）：2560×1600纯色测试图实际消耗4240输入token、28输出token，45.565秒完成；真实模型返回unknown及“未见儿童与座舱环境”，工作流仅一次无法判断反馈与一次会话记录，无失败节点。
- 9038-token请求实际返回HTTP422，包含本次9038和上限8192，未使用预设判断。
- 早期纯文字填充测试越过4096上限，但一次输出预算32导致截断，另一次未满足JSON对象约束，后端按原保护逻辑拒绝；这些不计为完整推理成功。最终以真实图片工作流完成验证容量修复。

证据与逐文件修改前备份：`/Users/sherry/Documents/ChatGPT/OAKEgde Studio/outputs/context-fix/`，主要为graph-verification.json、verification.json、opensparx-8192.log、backend-context.log和before目录。恢复应按文件比对后续改动，不重置已有工作区。前端仅修改已有错误文案的数据传递，未另做浏览器截图验收。用户原图未在本次重发，不代表儿童识别精度已验证；更大输入仍可能超限，仍受原60秒前端超时限制。Windows包未更新。

后端重启会使旧会话失效，网页可能需要重新输入使用密钥；原项目及模型数据保留。
