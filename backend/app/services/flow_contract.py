from app.services.flow_loops import repeated_wait_back_edges
"""Data-only contracts for resumable capability graphs; no scenario-name routing."""
import re
import math
import unicodedata

def general_flow(nodes):
    return any(n.get('type') in ('wait','state','stage') or (n.get('data') or {}).get('flowVersion') == 2 for n in nodes)

def valid_key(value):
    return isinstance(value,str) and re.fullmatch(r'[A-Za-z][A-Za-z0-9_]*',value) and value not in ('constructor','prototype','__proto__')

def validate_bindings(node, nodes):
    """Match bindFlowValue syntax; check paths, not dynamic value availability."""
    if node.get('type')=='stage':return []
    by_id={n['id']:n for n in nodes};errors=[]
    metadata={'name','label','description','status','output','trace','activationIndex','effectivePrompt','collapsed','designOnly','designIssue'}
    def check(path, location):
        parts=path.split('.')
        if not all(valid_key(part) for part in parts):
            reason='绑定路径只支持点分隔的标识符，不能使用数组下标、空段或原型字段。'
        elif parts[0] not in ('input','event','state','outputs'):
            reason='绑定根仅支持input/event/state/outputs；读取节点结果请用outputs.'+path+'。'
        elif parts[0]=='outputs' and len(parts)>1 and (parts[1] not in by_id or by_id[parts[1]].get('type')=='stage'):
            reason='outputs引用的执行节点不存在，阶段容器不产生执行输出。'
        else:return
        example=next((id for id,n in by_id.items() if n.get('type')!='stage'),'实际节点ID')
        errors.append(f'{location} 收到 {path!r}：{reason} 示例 outputs.{example}.text 或 state.savedValue（节点/状态须由图实际产生）。')
    def walk(value, location):
        if isinstance(value,list):
            for i,item in enumerate(value):walk(item,f'{location}[{i}]')
        elif isinstance(value,dict):
            if set(value)=={'$ref'} and isinstance(value['$ref'],str):check(value['$ref'],location+'.$ref')
            else:
                for key,item in value.items():walk(item,location+'.'+key)
        elif isinstance(value,str):
            for match in re.finditer(r'\{\{\s*([A-Za-z0-9_.]+)\s*\}\}',value):check(match[1],location)
    for key,value in (node.get('data') or {}).items():
        if key not in metadata:walk(value,'data.'+key)
    return list(dict.fromkeys(errors))

def validate_flow(nodes,edges):
    errors=[];by_id={n['id']:n for n in nodes};back_edges=repeated_wait_back_edges(nodes,edges)
    for n in nodes:
        d=n.get('data') or {};kind=n.get('type');prefix=n['id']+'：'
        def error(message):errors.append(prefix+message)
        for message in validate_bindings(n,nodes):error(message)
        if kind=='wait':
            if 'repeat' in d and not isinstance(d['repeat'],bool):error('repeat需要布尔值。')
            if 'maxIterations' in d and (isinstance(d['maxIterations'],bool) or not isinstance(d['maxIterations'],int) or not 1<=d['maxIterations']<=100000):error('maxIterations需要1–100000的整数。')
            if d.get('inputType','any') not in ('any','text','image'):error('等待输入类型仅支持any/text/image。')
            if not isinstance(d.get('eventName'),str) or not d['eventName'].strip():error('请指定等待的事件名称。')
            if d.get('match','any') not in ('any','exact'):error('等待匹配方式仅支持any/exact，语义判断请使用模型与分支。')
            if d.get('match')=='exact' and (not isinstance(d.get('answers'),list) or not d['answers'] or any(not isinstance(a,str) or not a.strip() for a in d['answers'])):error('精确匹配需要有效答案列表。')
            def normalized_answer(value):
                return ''.join(c for c in unicodedata.normalize('NFKC',str(value)).lower() if not c.isspace() and not unicodedata.category(c).startswith('P'))
            if d.get('match')=='exact' and isinstance(d.get('answers'),list) and isinstance(d.get('hintInputs'),list):
                if set(map(normalized_answer,d['answers'])) & set(map(normalized_answer,d['hintInputs'])):
                    error('正确答案不能同时是hintInputs提示口令，否则无法推进。')
            for field in ('aliases','hintInputs'):
                if field in d and (not isinstance(d[field],list) or any(not isinstance(a,str) for a in d[field])):error(field+'需要文字列表。')
            if d.get('storeAs') and not valid_key(d['storeAs']):error('状态字段名无效。')
        if kind=='state':
            for field in ('values','increments'):
                if field in d and (not isinstance(d[field],dict) or any(not valid_key(k) for k in d[field])):error(field+'需要有效状态字段对象。')
        if isinstance(d.get('increments'),dict) and any(isinstance(v,bool) or not isinstance(v,(int,float)) or not math.isfinite(v) for v in d['increments'].values()):error('状态增量必须为有限数值。')
        if kind in ('input','systemInput') and 'aliases' in d and (not isinstance(d['aliases'],list) or any(not isinstance(v,str) for v in d['aliases'])):error('事件别名需要文字列表。')
        if 'displayDelayMs' in d and (isinstance(d['displayDelayMs'],bool) or not isinstance(d['displayDelayMs'],(int,float)) or not math.isfinite(d['displayDelayMs']) or not 0<=d['displayDelayMs']<=60000):error('展示延迟需要0–60000毫秒。')
        incoming=[e for i,e in enumerate(edges) if e['target']==n['id'] and i not in back_edges]
        if d.get('joinMode') and d['joinMode'] not in ('all','any'):
            error(f"data.joinMode 收到 {d['joinMode']!r}，可选 all/any；入边 ID：{[e.get('id') for e in incoming]}。")
        for field in ('eventBudget','executionBudget'):
            if field in d and (isinstance(d[field],bool) or not isinstance(d[field],int) or not 1<=d[field]<=100000):error(field+'需要1–100000的整数。')
        if n.get('parentId'):
            if by_id.get(n['parentId'],{}).get('type')!='stage':error('所属阶段不存在。')
            seen={n['id']};p=n
            while p.get('parentId'):
                if p['parentId'] in seen:error('阶段不能循环嵌套。');break
                seen.add(p['parentId']);p=by_id.get(p['parentId'],{})
        if kind=='stage':
            if any(e['source']==n['id'] or e['target']==n['id'] for e in edges):error('请连接阶段内的能力节点，容器不执行动作。')
            continue
        if len(incoming)>1 and not d.get('joinMode'):
            error(f"data.joinMode 收到 {d.get('joinMode')!r}，多个输入需要明确汇合方式 all/any；入边 ID：{[e.get('id') for e in incoming]}。")
        ports=[e.get('targetHandle') or e['source'] for e in incoming]
        if len(set(ports))!=len(ports):error('输入端口重名，请指定不同targetHandle。')
    return errors

FLOW_INSTRUCTIONS = '''按用户目标组合已注册能力，输出WorkflowDraft完整图。场景是通用能力的测试配置，不能按生日/儿童/自拍等名字新增执行特判或固定拓扑。
新图在普通input节点data.flowVersion设JSON整数2，不能写字符串"2"或其他类型。通过patch新增input时可以省略，宿主会默认填写整数2。节点数量、分组、步骤由职责和依赖决定。保留旧项目的未涉及配置；旧interaction仅用于兼容，新增互动使用下列通用节点。
- 起始input就是本轮已提交的用户数据。若目标是收到问题/编码后立即查询或处理，直接连接下游；wait只在需要未来另一条事件时使用，不能再等待同一份已有输入。先按锁定测试的输入轮次核对进入路径，不改写测试来迁就多余等待。
- 图片：启动输入或等待后的本次输入采用{type:"image",content:"data:image/png;base64,...",text:"可选问题"}。wait.inputType=image只接受本次图片，未上传时保持等待；inputType=text只接受文字，默认any兼容两者。图片沿边到llm，实际provider按模态调用；不能用预设识别文字冒充。自动试跑必须使用实际图片数据，不能捏造base64；未提供样例如实记录未验证。
- wait: 普通聊天回答使用eventName=message。恢复后的回答在input.text和input.event.text，原始值在input.event.value；不是input.data.text（input.data仅JSON模型/JSON输入）。hintInputs是请求提示的文字，绝不能填写正确答案，否则回答会只显示提示。data.eventName指定事件（如message或用户方案自定名称），prompt为等待时显示的内容；match=any接收任意输入，match=exact需answers字符串列表。aliases只允许普通message文字模拟事件名，不会注册额外的结构化$event.name；hintInputs/hint提供可选提示，retryMessage为不匹配反馈，successMessage可选；storeAs把输入值保存为会话状态。回答匹配后自动沿边推进，需要确认再推进时另设wait。没有默认“下一站/到达/暂停”文字特判。
- state: data.values={字段:值}写入状态；increments={计数字段:数值}增加计数。业务奖励可用状态记录和output显示。values可以使用{"$ref":"input.event.text"}等引用。字段名只含英文字母数字下划线，字母开头。
- stage: 可选视觉分组；子节点parentId引用stage，position相对父级，style.width/height设置容器尺寸。容器不参与执行也不直接连线，连到内部能力节点。分组应有业务名称，内部真实可编辑。
- 所有普通节点配置支持{{state.field}}、{{input.data.field}}、{{outputs.nodeId.field}}文字绑定，或单字段对象{"$ref":"state.field"}保留值类型。根只有input/event/state/outputs；不能直接写{{nodeId.field}}，必须写{{outputs.nodeId.field}}。路径逐段使用字母开头的标识符，不支持数组下标；outputs后的节点ID须存在且可执行。状态/分支结果暂时缺失仍沿用空值行为，不据此证明数据已准备好。未获取的状态不要当成事实。展示用output.data.responseText。
- input始终是当前节点的上游输出，不能把经过工具/模型后的input.text当成起始用户原文；要保留起始输入请引用outputs中的对应输入节点。下游模型默认已经收到上游text（否则收到序列化对象），systemPrompt写任务和约束即可，避免把同份原文重复包装成互相矛盾的字段。MCP仅有text而data为null时，以本次text为资料，不能把data为空解释为资料中的字段不存在。
- 多条输入边汇合时必须配置目标data.joinMode=all（所有已决定路径到齐后执行一次，已跳过分支不等待）或any（任一路径到达执行一次）。多输入以input.inputs按targetHandle或源节点ID索引。不要通过普通汇合重复触发动作。
- logic条件是纯数据表达式，只能从input（或别名value）读取上游值；不允许裸state/outputs/event变量。state节点输出带input.state，会话值也可用节点字段绑定。事件ID去重由运行器统一完成，执行计划的event_id不是input.event.id，无需自行造重复事件分支。
- 条件分支使用logic及true/false出口；所有能力可接error出口。错误会记录失败状态；不要把兜底等同于原动作成功。多轮互动可使用wait.data.repeat=true，下游返回该wait形成循环，每轮必须等待新的输入；循环不能绕过等待点。maxIterations为本次会话该wait可接受的输入次数预算（默认1000，范围1–100000），达到后明确失败而不重复执行动作。
- 重复等待：wait.repeat=true的首次进入仅等待外部入边，返回边不参加首次汇合；所有返回路径均决定且至少一条返回后才再次等待。循环state保留，下一轮接受输入时清理该等待点之后的旧输出/分支状态，上游初始化不重跑。输出/动作返回wait，退出条件由wait后的logic配置，退出分支不要返回wait。多个普通入边仍需joinMode；不要用旧interaction实现循环。未经过重复等待的环路不可执行。
- 可配置事件入口：额外input的data.eventName/aliases响应指定事件，data.interrupt=true时放弃未完成的其他路径并进入其后续路径。把中途取消/提前到达等作为场景事件配置，不写进全局运行规则。普通输入负责启动；暂停/恢复/结束/重开由仿真控制按钮发送结构化控制事件。
- 无入边的事件input/systemInput处理本次载荷：普通文字输出text为字符串，独立event={name,text,value}保留路由名与原始值；图片保留type/content。本次JSON载荷可为JSON文字或对象，仅inputFormat=json按outputFields验证后进入data，event元数据不进入业务字段。普通起点不用eventName；不能用input.text.text读取事件包装。已有旧快照不重写历史输出，更新前已失败的会话需重新开始验证。
- 同一轮实际展示的多条HMI消息按顺序保留在最终回复中，output结果不会被随后wait提示覆盖；最终hmi.message可能包含两者，用contains检查片段而非假定只剩最后一句。
- 等待后从该节点恢复，不重放已成功前序。阶段中调灯/显示/模型判断用实际节点，不能写在故事里假装执行。
- JSON输出契约：outputFields必须是字段名到类型字符串的对象，例如{"summary":"string","score":"number"}；类型只允许string/number/boolean/array/object。不是字段名数组，也不是JSON Schema的properties或{type:...}对象。字段名称必须与systemPrompt和下游input.data引用完全一致。
- JSON格式修复：llm可显式设置jsonRepairAttempts=0–2整数，默认0；仅outputFormat=json可启用。无效JSON/非对象/声明字段缺失或类型错误时，向同一模型提供原始输入、最新错误回答和字段反馈，最多增加指定次数请求。不会重放上游或提前执行下游，不重试服务/取消/空响应/截断/模拟响应；共享原60秒节点期限和试跑模型调用预算。无效回答超过32000字符不裁剪也不修复。最终仍按原outputFields校验；raw_model_output为最终响应，json_repair_attempts记录实际额外请求数。格式通过不证明语义正确。
- llm的模型指令只写data.systemPrompt（支持状态绑定），不要用prompt或promptTemplate，它们不会执行。outputFormat=text返回text/reply；json返回data对象；car_control共享HMI回执在action_result内，例如outputs.nodeId.action_result.actual和success，不在outputs.nodeId.actual。
- 创作模型与执行模型独立。新llm节点明确model/providerId，使用已配置真实模型；没有指定时可以使用当前创作模型作默认，平台不覆盖已指定绑定。按任务模态核对实际接入。
- 可以先生成固定内容，也可以使用llm节点在阶段前动态创作。自由回答需要wait(any)接模型/判断；不要把所有问题强制变成唯一短答案。能力缺失保留为missing，不能用相似动作冒充。
- 普通car_control（含固定车窗的顶层action=windows、module=vehicleControl、signalKey=WINDOW_POSITION、function=set配置）在LLM来源路径上必须使用outputFormat=actions；经过logic仍保留同一动作协议，固定参数不改变该要求，JSON分类结果不能经logic获得车控授权。固定WINDOW_POSITION/set也需保留action=windows以通过Builder检查，不能只填写module/signalKey/function/area/targetStatus。让负责意图/动作决策的现有LLM直接输出actions，条件读取input.actions/input.action；不要求另加模型。WINDOW_POSITION的area/targetStatus锁定实际目标，targetStatus=0由既有windows.close_all授权，非零目标由windows.open_all授权，不能用模型参数覆盖固定区域。JSON例外仅限已登记HMI配置/字段绑定（含hmi_mock氛围灯）及已登记MCP arguments绑定。修复GRAPH_CONNECTION_CONTRACT时保留合规actions路径，不因审查建议删除动作决策而恢复JSON违约路线。
- car_control的共享HMI控制使用executionMode=hmi（不是hmi_mock）、controlId（注册表ID，如ac.temp）、controlOperation=set/get、controlValue。该模式不要求action字段。hmi_mock只用于ambient_light.set/restore专用动作。
- 通用流程的HMI controlValue可用单字段对象{"$ref":"state.savedValue"}或outputs.<节点ID>.action_result.actual等绑定，保留值类型；不能用文字插值传递数字。节点ID/路径先检查，实际值在运行时仍校验类型、范围、整数与选项。JSON模型可通过显式HMI配置和绑定组合动作，不把模型原文直接当动作执行。
- car_control的ambient_light.set在executionMode=hmi_mock时可配置color/brightness/reason/poseTips（也支持绑定）；未配置时读取上游data.light_color/light_brightness/light_reason/pose_tips。
- MCP使用tool节点tool_id=mcp、固定serverId/toolName与arguments对象；通过真实mcp_connections核对工具及参数。动态参数以$ref绑定input/state/outputs。输出data是工具structuredContent，text/content为原始返回，不是模型推断。只能调用已登记工具，未知工具保留missing；服务地址、凭据不得写入图。自动试跑仅可用allow_trials=true工具，不可通过声明readOnly绕过。
- HMI已接入的mock控制可满足模拟体验。未知设备、真实GPS、音频和外部服务不能假定已连接。所有检查结果标明结构/模拟/真实服务范围。
'''

ACTION_PROTOCOL_INSTRUCTIONS = '''car_control.data.action=windows是节点分类，不是模型动作名；LLM action与actions[].name用实际下游支持的canonical名，不能返回action=windows或actions[].action。完整动作响应例子：{"action":"windows.close_all","actions":[{"name":"windows.close_all","parameters":{}}],"intent":"vehicle_control","parameters":{},"reply":"请求关闭车窗。","confidence":0.96}。合法无动作例子：{"action":"none","actions":[],"intent":"none","parameters":{},"reply":"未执行车控动作。","confidence":0.96}。action与首个actions[].name一致，空actions使用none；parameters为对象。回复只表达请求，动作后的成功结论需实际action_result.success、requested和actual。固定WINDOW_POSITION/set区域0=all、1=fl、2=fr、3=rl、4=rr、5=fl/fr、6=rl/rr，area=3是左后窗、area=4是右后窗；节点area/targetStatus锁定实际目标。'''

FLOW_INSTRUCTIONS += '\n' + ACTION_PROTOCOL_INSTRUCTIONS
