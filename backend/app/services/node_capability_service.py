from app.services.mcp_runtime import validate_mcp_node
from app.services.flow_loops import repeated_wait_back_edges
from app.services.flow_contract import general_flow, validate_flow
from app.services.hmi_control_contract import validate_hmi_node
from app.services.catalog_model_guard import is_catalog_model, PENDING
from urllib.parse import urlparse
"""Studio capability contract shared with the frontend; no model calls in validation."""
import copy
import json
import math
from pathlib import Path

from app.services.interaction_contract import validate_interaction_plan

CATALOG = json.loads(Path(__file__).with_name('node_capabilities.json').read_text(encoding='utf-8'))

def authoring_catalog():
    """Canonical fields, returned as a copy so callers cannot mutate the contract."""
    return copy.deepcopy(CATALOG)

def is_hmi_ambient(node):
    data = node.get('data') or {}
    return node.get('type') == 'car_control' and data.get('executionMode') == 'hmi_mock' and data.get('action') in ('ambient_light.set', 'ambient_light.restore') and not any(data.get(k) for k in ('module','signalKey','function'))

def validate_capabilities(nodes, edges):
    errors, warnings = [], []
    general = general_flow(nodes)
    if general: errors.extend(validate_flow(nodes,edges))
    by_id = {str(n.get('id')): n for n in nodes}
    for node in nodes:
        node_id, kind, data = str(node.get('id')), node.get('type'), node.get('data') or {}
        spec = CATALOG['nodes'].get(kind)
        def error(message): errors.append(f"{data.get('label') or node_id}（{node_id}）：{message}")
        if 'flowVersion' in data and (type(data['flowVersion']) is not int or data['flowVersion'] != 2):
            error('flowVersion必须是JSON整数2；错误类型或版本不能进入旧执行路径试跑。')
        if is_catalog_model(data):
            error(PENDING); continue
        if data.get('designOnly'):
            error('设计草稿尚未通过验证，不能运行。'); continue
        if not spec:
            error('节点尚未实现。'); continue
        for key, field in spec['fields'].items():
            if field.get('validation') == 'node': continue
            value = data.get(key)
            if value is None or str(value).strip() == '':
                if field.get('required'): error(f"请配置{field['label']}。")
                continue
            if field.get('enum') is not None and value not in field['enum']: error(f"{field['label']}仅支持：{'、'.join(field['enum'])}。")
            if 'min' in field or 'max' in field:
                try:
                    number = float(value)
                    valid = not isinstance(value, bool) and math.isfinite(number) and field.get('min', -math.inf) <= number <= field.get('max', math.inf)
                except (TypeError, ValueError): valid = False
                if not valid: error(f"{field['label']}超出有效范围。")
        if kind == 'llm' and any(k in data for k in ('prompt','promptTemplate')):
            error('模型指令使用systemPrompt字段，prompt/promptTemplate不是可执行配置。')
        if kind == 'llm' and 'jsonRepairAttempts' in data:
            repairs=data['jsonRepairAttempts']
            if type(repairs) is not int or not 0 <= repairs <= 2:
                error('jsonRepairAttempts必须是0–2的整数，默认0。')
            if repairs != 0 and data.get('outputFormat') != 'json':
                error('JSON格式修复仅适用于outputFormat=json。')
        if kind == 'interaction':
            for problem in validate_interaction_plan(data.get('plan')): error(problem)
        if kind == 'llm' and data.get('outputFormat') == 'json' or kind == 'input' and data.get('inputFormat') == 'json':
            fields = data.get('outputFields')
            import re
            if not isinstance(fields, dict) or not fields or any(not re.fullmatch(r'[a-zA-Z][a-zA-Z0-9_]{0,63}', str(k)) or k in ('constructor','prototype','__proto__') or v not in ('string','number','boolean','array','object') for k,v in fields.items()): error('JSON 模式需要有效 outputFields。'+'outputFields必须是字段名到类型字符串的对象，例如{"summary":"string","score":"number"}；类型只允许string/number/boolean/array/object。不是字段名数组，也不是JSON Schema的properties或{type:...}对象。字段名称必须与systemPrompt和下游input.data引用完全一致。')
        if kind == 'video_display' and data.get('source') == 'browser_stream':
            try:
                url = urlparse(str(data.get('streamUrl') or ''))
                valid = url.scheme in ('http', 'https') and bool(url.hostname) and not url.username and not url.password
            except ValueError: valid = False
            if not valid: error('请填写浏览器可播放的 HTTP(S) 视频流地址。')
        if kind == 'logic':
            # Saved legacy graphs use data.type; all new guidance names logic_type.
            mode = data.get('logic_type') if 'logic_type' in data else data.get('type', 'if')
            if mode not in ('if', 'filter'): error(f"{node_id} 的 logic_type 收到 {mode!r}，可选 if/filter；字段路径 data.logic_type。")
            if not str(data.get('condition') or data.get('script') or '').strip(): error('请填写判断条件，不能以空条件默认通过。')
            outgoing = [e for e in edges if e.get('source') == node_id and e.get('sourceHandle') != 'error']
            if mode == 'if':
                if any(e.get('sourceHandle') and e['sourceHandle'] not in ('true','false') for e in outgoing) or len(outgoing) > 1 and any(not e.get('sourceHandle') for e in outgoing): error('多分支必须明确 true/false 出口，不能猜测连线含义。')
                if not any(e.get('sourceHandle') == 'false' for e in outgoing): warnings.append(f'{node_id}：未连接 false 出口，条件不成立时本分支结束。')
        if kind == 'tool':
            try:
                is_mcp=validate_mcp_node(data)
                if not is_mcp and (data.get('tool_id') or data.get('tool')) not in ('music','nav','call_phone'): error('工具未接入；节点set_data.tool_id使用music/nav/call_phone（仅界面仿真）或mcp（已登记真实工具）。字段不是toolId/providerId；MCP同时配置serverId、toolName、arguments。真实能力缺失标为missing，不用仿真冒充。')
            except ValueError as exc: error(str(exc))
        if kind == 'car_control':
            if data.get('device_type', 'car') != 'car': error('当前仅支持座舱车辆仿真。')
            handled_hmi = False
            try: handled_hmi = validate_hmi_node(data,allow_bindings=general)
            except ValueError as cause: error(str(cause)); handled_hmi = True
            if is_hmi_ambient(node) and any(k in data for k in ('light_color','light_brightness','light_reason','pose_tips')):
                error('氛围灯节点配置使用color/brightness/reason/poseTips；light_color/light_brightness/light_reason/pose_tips仅用于上游input.data。')
            if handled_hmi or is_hmi_ambient(node): pass
            elif data.get('module') or data.get('signalKey') or data.get('function'):
                if (data.get('module'),data.get('signalKey'),data.get('function')) != ('vehicleControl','WINDOW_POSITION','set'): error('此车辆接口尚未接入图执行器。')
                else:
                    try:
                        area, target = float(data.get('area')), float(data.get('targetStatus'))
                        valid = area in range(7) and math.isfinite(target) and 0 <= target <= 100
                    except (TypeError,ValueError): valid = False
                    if not valid: error('请配置有效车窗区域（0–6）和目标开度 targetStatus（0–100）。')
            elif data.get('action') == 'windows':
                if data.get('parameter') not in ('open_all','close_all'): error('请选择打开全部或关闭全部车窗。')
            elif data.get('action') not in ('windows.open_all','windows.close_all','auto','emergency.protocol','hazard_lights','hazard_lights.on'): error('车控动作未配置或未实现。action必须是字符串，配置直接写在set_data：共享控制用executionMode=hmi和controlId/controlValue；模拟氛围灯用executionMode=hmi_mock、action=ambient_light.set/restore，color/brightness同层。不能执行未接入的占位动作。')
        outgoing = [e for e in edges if e.get('source') == node_id and e.get('sourceHandle') != 'error']
        error_edges = [e for e in edges if e.get('source') == node_id and e.get('sourceHandle') == 'error']
        if not general and (len(error_edges) > 1 or error_edges and kind not in ('llm','interaction')): error('错误出口仅支持模型/持续互动且只能连接一个处理节点。')
        if kind in ('llm','interaction') and any(by_id.get(e.get('target'),{}).get('type') == 'fallback' for e in outgoing): error('模型失败反馈必须连接 error 出口。')
        if not general and kind == 'interaction':
            incoming=[e for e in edges if e.get('target') == node_id]
            if len(incoming) != 1 or by_id.get(incoming[0].get('source'),{}).get('type') not in ('input','systemInput'): error('持续互动必须直接连接唯一输入起点。')
        if kind == 'recognition':
            if data.get('resultSource') != 'vision': warnings.append(f'{node_id}：预设识别仅模拟，不证明识别准确率。')
            elif not any(e.get('target') == node_id and by_id.get(e.get('source'),{}).get('type') == 'llm' for e in edges): error('视觉结果解析需要直接连接上游模型。')
    starts = [str(n.get('id')) for n in nodes if n.get('type') in ('input','systemInput')]
    interactions=[n for n in nodes if n.get('type')=='interaction']
    if not general and len(interactions)>1: errors.append('当前每个工作流支持一个持续互动节点。')
    if not general and interactions and (len(starts)!=1 or any(e.get('source') in starts and e.get('target')!=interactions[0].get('id') for e in edges)): errors.append('持续互动需要唯一输入且不能同时启动其他分支。')
    back_edges = repeated_wait_back_edges(nodes,edges)
    for node in nodes:
        if node.get('type')!='wait' or (node.get('data') or {}).get('repeat') is not True:continue
        descendants=set();pending=[node['id']]
        while pending:
            source=pending.pop()
            for i,e in enumerate(edges):
                if i not in back_edges and e['source']==source and e['target'] not in descendants:
                    descendants.add(e['target']);pending.append(e['target'])
        if any(by_id.get(id,{}).get('type')=='interaction' for id in descendants):errors.append(node['id']+'：重复等待下游不能使用旧interaction会话；请用wait/state与模型组成多轮图。')
    reachable = set()
    def visit(node_id, path):
        if node_id in path:
            errors.append(f'{node_id}：环路必须经过repeat=true的wait，并从其下游返回该等待点；自动环路尚未接入。'); return
        if node_id in reachable: return
        reachable.add(node_id)
        for index,edge in enumerate(edges):
            if index not in back_edges and edge.get('source') == node_id: visit(edge.get('target'),path | {node_id})
    for start in starts: visit(start,set())
    for node_id in by_id:
        if by_id[node_id].get('type') != 'stage' and node_id not in reachable: errors.append(f'{node_id}：无法从输入起点到达；补一条从可达节点出发的连线，或用remove_node_ids删除该节点。')
    edge_ids = [e.get('id') for e in edges if e.get('id')]
    if len(edge_ids) != len(set(edge_ids)): errors.append('连线 ID 重复。')
    from app.services.connection_contract import connection_diagnostics
    errors.extend(diagnostic['message'] for diagnostic in connection_diagnostics(nodes,edges))
    return errors, warnings


def reachable_node_ids(nodes, edges):
    """Connectivity only, shared by patch feedback; no graph changes or verdicts."""
    by_id={n['id']:n for n in nodes}
    pending=[n['id'] for n in nodes if n.get('type') in ('input','systemInput')]
    seen=set()
    while pending:
        node=pending.pop()
        if node in seen or node not in by_id:continue
        seen.add(node)
        pending.extend(e.get('target') for e in edges if e.get('source')==node)
    return seen
