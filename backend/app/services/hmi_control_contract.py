"""Allowlisted settings of the browser HMI; no physical vehicle dispatch."""
import json
import math
import re
from difflib import get_close_matches
from pathlib import Path

CONTROLS = json.loads(Path(__file__).with_name('hmi_controls.json').read_text())

def validate_request(control, operation='set', value=None):
    if not isinstance(control,str): raise ValueError('HMI 控制项 ID 必须为字符串：节点配置直接使用set_data.controlId，如"ac.temp"，不要放进action对象；可选ID见能力目录hmi_controls。')
    spec = CONTROLS.get(control)
    if not spec:
        nearby=get_close_matches(control,CONTROLS,n=3,cutoff=0)
        raise ValueError(f'HMI 未接入控制项：{control!r}；controlId必须取自能力目录hmi_controls的注册ID。文字相近的注册ID（不表示能力适用）：'+', '.join(nearby)+'。没有合适控件时将需求标为missing；仅确有仿真能力且明确仿真范围时标为simulated，不要编造ID。')
    if operation not in ('get','set'): raise ValueError('HMI 只支持读取和设置。')
    if operation == 'get': return
    kind = spec['type']
    if kind == 'boolean' and type(value) is not bool or kind == 'number' and type(value) not in (int,float) or kind == 'string' and not isinstance(value,str):
        raise ValueError(f"{spec['label']}目标值类型无效；controlValue必须为JSON {kind}，不能用字符串代替数字/布尔。")
    if kind == 'number' and (not math.isfinite(value) or not spec['min'] <= value <= spec['max'] or spec.get('step') == 1 and value != int(value)):
        raise ValueError(f"{spec['label']}超出范围；controlValue范围为{spec['min']}–{spec['max']}"+('，必须为整数。' if spec.get('step')==1 else '。'))
    if 'options' in spec and value not in spec['options']: raise ValueError('目标选项无效；controlValue可选：'+', '.join(spec['options'])+'（使用选项键，不是中文标签）。')
    if spec.get('format') == 'color' and not re.fullmatch(r'#[0-9a-fA-F]{6}',value): raise ValueError('颜色必须为 #RRGGBB。')

def is_hmi_value_binding(value):
    if not isinstance(value,dict) or set(value) != {'$ref'} or not isinstance(value['$ref'],str): return False
    parts=value['$ref'].split('.')
    return parts[0] in ('input','event','state','outputs') and all(re.fullmatch(r'[A-Za-z][A-Za-z0-9_]*',p) and p not in ('constructor','prototype','__proto__') for p in parts)

def validate_hmi_node(data, *, allow_bindings=False):
    """Return handled status, raising on invalid values; unsupported legacy signals pass onward."""
    if data.get('executionMode') == 'hmi':
        if any(data.get(k) for k in ('module','signalKey','function')): raise ValueError('HMI 控制不能同时配置车辆接口；用remove_data_keys删除module/signalKey/function，保留executionMode=hmi及顶层controlId/controlOperation/controlValue。仅在set_data中省略旧字段不会删除它。')
        field = data.get('valueField')
        operation = data.get('controlOperation') or 'set'
        if operation not in ('set','get'): raise ValueError('HMI 只支持读取和设置。')
        if field:
            if not re.fullmatch(r'[a-zA-Z][a-zA-Z0-9_]{0,63}',str(field)) or field in ('constructor','prototype','__proto__'): raise ValueError('上游字段名无效。')
            validate_request(data.get('controlId'),'get')
        elif allow_bindings and is_hmi_value_binding(data.get('controlValue')):
            validate_request(data.get('controlId'),'get')
        else: validate_request(data.get('controlId'),operation,data.get('controlValue'))
        return True
    if data.get('function') not in ('get','set'): return False
    if not isinstance(data.get('signalKey'),str): return False
    seat = re.fullmatch(r'SEAT_(HEAT|VENTILATION)_STATUS(?:_([0-3]))?',data.get('signalKey') or '')
    if data.get('module') == 'seat' and seat:
        if data.get('function') == 'set' and (isinstance(data.get('level'),bool) or data.get('level') is None or str(data.get('level')).strip()==''): raise ValueError('座椅档位无效。')
        try: value = float(data.get('level')) if data.get('function') == 'set' else None
        except (ValueError,TypeError): raise ValueError('座椅档位无效。')
        validate_request(f"seat.{'heat' if seat[1]=='HEAT' else 'vent'}.{seat[2] or '0'}",data['function'],value)
        return True
    if data.get('module') == 'vehicleControl' and data.get('signalKey') == 'SUNSHADE_SLIDING_OPEN':
        try:
            area=float(data.get('area'))
            if area not in (1,2,3,4): return False
            if data['function']=='set' and (isinstance(data.get('targetStatus'),bool) or float(data.get('targetStatus')) not in (0,1)): raise ValueError('遮阳帘目标值必须为 0 或 1。')
        except (ValueError,TypeError): raise ValueError('遮阳帘区域或目标值无效。')
        return True
    return False
