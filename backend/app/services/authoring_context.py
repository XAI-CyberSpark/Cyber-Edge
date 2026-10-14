"""Deterministic stage views. Host facts remain intact and never call a model."""
from __future__ import annotations

import copy
import hashlib
import json

from app.services.execution_review import evidence_index
from app.services.hmi_control_contract import CONTROLS
from app.services.scenario_execution import execution_feedback


def _value(value):
    return value.model_dump() if hasattr(value, 'model_dump') else value


def _json(value):
    return json.dumps(value,ensure_ascii=False,separators=(',', ':'),sort_keys=True)


def _original(request, *, project=False, overview=False):
    result={'request':request.prompt,'user_history':[{'turn_index':i,'content':t.content}
            for i,t in enumerate(request.conversation_history) if t.role=='user']}
    if project:
        current=_value(request.current_project)
        if current and overview:
            result['current_project']={'id':current['id'],'name':current['name'],
                'goal':current.get('meta',{}).get('goal'),
                'nodes':[{'id':n['id'],'type':n['type']} for n in current['nodes']],
                'edges':[{k:e[k] for k in ('source','target','sourceHandle','targetHandle') if k in e}
                         for e in current['edges']],
                'prior_brief':current.get('meta',{}).get('scenario_brief'),
                'artifact_sha256':hashlib.sha256(_json({'nodes':current['nodes'],'edges':current['edges']}).encode()).hexdigest()}
        else:result['current_project']=copy.deepcopy(current)
    return result


_REDACTED=object()


def _safe_outputs(value):
    if isinstance(value,dict):
        result={k:clean for k,v in value.items()
                if k not in ('raw_model_output','trace','api_key','apiKey','reasoning_content')
                and (clean:=_safe_outputs(v)) is not _REDACTED}
        return _REDACTED if value and not result else result
    if isinstance(value,list):
        return [{'private_fields_removed':True} if (clean:=_safe_outputs(v)) is _REDACTED else clean for v in value]
    return copy.deepcopy(value)


def review_execution_summary(execution):
    """Use actual observations with stable IDs; never infer unobserved vehicle state."""
    cases=[]
    for ci,case in enumerate(execution.get('cases',[])):
        steps=[]
        for si,step in enumerate(case.get('steps',[])):
            raw=step.get('evidence') or {}; evidence={}
            if isinstance(raw.get('initial_vehicle'),dict):
                evidence['initial_vehicle']={k:copy.deepcopy(raw['initial_vehicle'][k])
                    for k in ('windows','blocked_window') if k in raw['initial_vehicle']}
            if isinstance(raw.get('car'),dict):
                evidence['car']={k:copy.deepcopy(raw['car'][k]) for k in ('windows','hmiSettings') if k in raw['car']}
                for spec in CONTROLS.values():
                    path=spec.get('path') or []
                    if not path:continue
                    value=raw['car']
                    for part in path:
                        if not isinstance(value,dict) or part not in value:break
                        value=value[part]
                    else:
                        target=evidence['car']
                        for part in path[:-1]:target=target.setdefault(part,{})
                        target[path[-1]]=copy.deepcopy(value)
            if isinstance(raw.get('actions'),list):
                evidence['actions']=[{k:copy.deepcopy(receipt[k]) for k in
                    ('success','requested','actual','source','failedWindows','reason','commandId','controlId','value')
                    if k in receipt} for receipt in raw['actions'] if isinstance(receipt,dict)]
            for domain in ('outputs','nodes','state','messages'):
                if domain in raw:
                    cleaned=_safe_outputs(raw[domain])
                    if cleaned is not _REDACTED:evidence[domain]=cleaned
            if 'input' in (raw.get('run') or {}):evidence['input']=copy.deepcopy(raw['run']['input'])
            displayed=str((raw.get('hmi') or {}).get('message',''))
            evidence['hmi']={'message':displayed}
            steps.append({'index':step.get('index',si),'status':step.get('status'),
                'passed':step.get('passed'),'displayed':displayed,**evidence,
                'evidence_index':evidence_index(evidence,ci,si)})
        cases.append({'name':case.get('name'),'passed':case.get('passed'),'steps':steps})
    return {'status':execution.get('status'),'failures':execution_feedback(execution),'cases':cases}


def recall_context(view):
    """Expose discovery evidence, keeping internal embedding documents local."""
    result = {key: copy.deepcopy(view[key]) for key in
              ('node_overview', 'capability_overview', 'coverage_policy', 'coverage_rule',
               'candidates', 'index_hash', 'fallback', 'strategy',
               'retrieval_status', 'semantic_status', 'diagnostics', 'selection_policy',
               'query_sources', 'query_results', 'query_policy') if key in view}
    result.setdefault('node_overview', [])
    result.setdefault('candidates', [])
    result.setdefault('fallback', False)
    for item in result['node_overview'] + result.get('capability_overview', []) + result['candidates']:
        item.pop('semantic_text', None)
        item.pop('document_hash', None)
    return result


def build_stage_context(stage,request,brief,capability_view,session_state,diagnostics):
    if stage not in ('understand','select','build','repair','review'):raise ValueError('unknown authoring stage')
    view=_value(capability_view) or {}; state=session_state or {}
    if stage=='understand':
        return {'user_context':_original(request,project=True,overview=True),
                'source_rule':'用户原文按turn_index保留；更正由同次理解显式说明，不自动丢弃早期否定。'}
    if stage=='select':
        return {'user_context':_original(request,project=True,overview=True),'brief':_value(brief),
                'queries':copy.deepcopy(state.get('queries',[])), 'available_capabilities':recall_context(view),
                'source_rule':'用户原文、逐字来源、否定与最新更正优先；brief与queries已锁定，检索改写不代替用户要求。'}
    if stage=='review':
        return {'original':_original(request),'brief':_value(brief),'coverage':state.get('coverage',[]),
            'actual_execution':review_execution_summary(state.get('execution') or {}),
            'candidate':state.get('candidate'), 'evidence_identity':state.get('evidence_identity'),
            'adapter_semantics':'VehicleWorld success仅表示requested目标到位；未请求的窗按initial_vehicle与actual判断。仿真回执不证明实车。'}
    return {'context':_original(request,project=True),'brief':_value(brief),
        'capabilities':view.get('catalog',{}),'capability_selection':{k:view[k] for k in
            ('selected_ids','dependencies','facts','diagnostics','index_hash','selection_incomplete') if k in view},
        'mcp_connections':view.get('mcp_connections',[]),
        'session':copy.deepcopy(state),'diagnostics':copy.deepcopy(diagnostics),
        'scope_rule':'本次加载范围不是平台全集；需要其他契约时返回capability_need。宿主继续全图校验。'}


def context_sizes(context):
    components={}
    groups={'catalog':('available_capabilities','capabilities','capability_selection','mcp_connections'),
            'history':('user_context','original','context','brief','queries'),'project':('candidate','session'),
            'evidence':('actual_execution','evidence_identity'),'feedback':('diagnostics',)}
    for name,keys in groups.items():
        text=_json({key:context[key] for key in keys if key in context})
        components[name]={'bytes':len(text.encode()),'characters':len(text)}
    text=_json(context)
    return {**components,'total':{'bytes':len(text.encode()),'characters':len(text)},
            'token_measurement':'not_measured'}
