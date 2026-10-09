# 任务与状态

- [x] REQ-01/02：VoiceCapture 增加 PCM 回调与 WAV 快照；useVoiceInput 串行增量识别。
- [x] REQ-03：SpeechEndpoint 断句，最终结果自动进入现有助手，车控确认保持。
- [x] REQ-02：原圆角入口内显示识别文字/等待状态，回复就绪才展开。
- [x] REQ-04：取消、迟到响应、页面隐藏、无声超时、30秒、服务故障回归。
- [x] 真实本地 ASR/OpenSparX 样本闭环；构建与现有HMI业务回归。
- [x] 实际浏览器查看窄HMI与文字入口/回复，保留原布局。
- [ ] 用户真人麦克风验收：说话速度、自然停顿、噪声环境与方言；尚未验证Windows、实际车内或实车。

实现文件：studio/src/lib/{voiceCapture,speechEndpoint}.ts、hooks/useVoiceInput.ts、components/core/{CockpitAssistant.tsx,hmi-refinements.css}；测试为 voice-input.dom.tsx、hmi-assistant-avatar.dom.tsx。
