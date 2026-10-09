# dev.100：从能力目录生成 patch 字段 Schema

用途：约束模型生成的 set_data 参数。状态：局部实现与真实验证完成，编排仍不可应用；维护日期：2026-10-06。主依据：本轮用户要求及 node_capabilities.json。

## 范围与验收

- 从唯一能力目录自动生成类型、数组元素与枚举；可绑定字段以原类型或严格的单字段 $ref 对象声明。
- 跨节点同名冲突不选定某一种类型，只在描述中说明；通用字段只声明一次，局部 patch 不要求填写整节点必填字段。
- 回归先失败再修复；检查固定 Hermes 的实际 Schema 转换与一次真实 MiniMax 请求。
- 同一请求为 MiniMax-M3、10条对话、重新编排、single、save_on_success=false。对比 item、patch 拒绝和最终状态。仍出现 item 时停止后续修补。
- 不改解析器、不加 item 拆包，不改架构、默认模式、预算、项目文件、5175或模型自动绑定规则，不创建提交。

## 冲突与处理

| 字段 | 节点差异 | 处理 |
| --- | --- | --- |
| prompt | llm禁用（null/空枚举）；wait字符串且可绑定 | 仅描述，各节点查目录；llm仍应写systemPrompt |
| inputType | systemInput枚举weather/camera/rear_camera/image；wait枚举any/text/image | 仅描述，不把两组枚举合并为普遍可用值 |
| type | logic旧别名if/filter；memory为buffer | 仅描述，logic仍推荐logic_type |

后两项是枚举域冲突，不是JSON基本类型冲突。全禁用的5个字段不作为可写properties推荐。required不同不算类型冲突，也不变成局部patch必填。
