"""Per-request graph transactions exposed to the authoring agent.

Only graph data can change. Tools cannot edit files, save projects, execute shell
commands or control devices. Graph execution uses the isolated production host.
"""
from __future__ import annotations

import asyncio
import copy
import hashlib
import json
import time
from typing import Any

from pydantic import Field, ValidationError, field_validator
from app.schemas.project_schema import ProjectSchema
from app.schemas.orchestration_schema import WorkflowValidationSchema, WorkflowTestResultSchema
from app.services import model_providers
from app.services.scenario_builder import (
    Contract, ScenarioBrief, Coverage, DraftNode, DraftEdge, NodePosition,
    ScenarioBuilder, inspect_candidate, inspectable_graph, inline_schema,
    compact, BRIEF_INSTRUCTIONS,
)
from app.services.node_data_schema import add_patch_data_schema
from app.services.flow_contract import FLOW_INSTRUCTIONS
from app.services.connection_contract import connection_diagnostics, RULES as CONNECTION_CONTRACT
from app.services.test_plan_preflight import inspect_test_plan, PlanContractError
from app.services.scenario_execution import ExecutionPlan, EXECUTION_INSTRUCTIONS, execute_candidate, execution_feedback, api_model_binding_errors, test_plan_control_errors, REPAIR_HINTS, execution_diagnostics
from app.services.execution_review import review_execution, review_feedback


def same_plan_value(a,b):
    # Python equality equates True and 1; plan locking must preserve JSON types.
    def encode(value):return json.dumps(value,sort_keys=True,default=lambda obj:obj.model_dump(),ensure_ascii=False)
    return encode(a)==encode(b)


class Empty(Contract):
    pass


def unambiguous_flow_version(value):
    """Return 2 for unambiguous spellings of flowVersion 2, otherwise the input.

    Only the string "2" and float 2.0 are accepted; bools, other versions and
    free text stay invalid so a malformed graph cannot reach the legacy path.
    """
    if isinstance(value,str) and value.strip()=='2':return 2
    if type(value) is float and value==2.0:return 2
    return value


def normalized_scalars(tool, raw):
    """List tool-argument paths the host normalized (for agent-visible notes)."""
    if tool!='oakegde_patch_graph' or not isinstance(raw,dict):return []
    notes=[]
    for index,node in enumerate(raw.get('upsert_nodes') or []):
        data=node.get('set_data') if isinstance(node,dict) else None
        if isinstance(data,dict) and 'flowVersion' in data and type(data['flowVersion']) is not int \
                and unambiguous_flow_version(data['flowVersion'])==2:
            notes.append({'field':f'upsert_nodes.{index}.set_data.flowVersion','normalized_to':2,
                          'note':'flowVersion应直接写JSON整数2；本次由宿主按无歧义写法转换。'})
    return notes


class NodeEdit(Contract):
    id: str = Field(min_length=1, max_length=100)
    type: str | None = None
    position: NodePosition | None = None
    parentId: str | None = None
    detach_parent: bool = False
    style: dict | None = None
    set_data: dict = Field(default_factory=dict, json_schema_extra=add_patch_data_schema, description='直接合并到节点data的顶层配置，如set_data={"systemPrompt":"...","outputFormat":"json"}；禁止再次包裹成set_data={"data":{...}}。能力表fields是字段定义目录，不能复制为set_data.fields；目录中的配置字段直接作为set_data的键。不是整个节点；修改参数名是set_data，不是读图存储格式中的data；省略的字段保持原值。')
    remove_data_keys: list[str] = Field(default_factory=list, max_length=50, description='要从节点data删除的顶层字段名；不会清空未列出的字段。')

    @field_validator('set_data')
    @classmethod
    def reject_storage_wrapper(cls, value):
        if 'flowVersion' in value:
            value={**value,'flowVersion':unambiguous_flow_version(value['flowVersion'])}
        if 'flowVersion' in value and (type(value['flowVersion']) is not int or value['flowVersion'] != 2):
            raise ValueError('flowVersion必须是JSON整数2，不能是字符串、布尔或其他版本。新增input可以省略，由宿主默认填写2；错误类型会让图进入旧执行路径。')
        if 'data' in value:
            raise ValueError('set_data已经代表节点的data，不能再嵌套data。请将model/systemPrompt/outputFormat/responseText等配置直接放在set_data中。若旧节点已有无效data包装，用remove_data_keys=["data"]删除该层残留；业务对象应放在对应配置字段内，如state的values。')
        return value


class GraphPatch(Contract):
    base_revision: int = Field(ge=0, description='必填，使用最新工具结果revision或错误反馈session_state.revision；每次成功修改后版本增加，不能省略或猜测。')
    project_name: str | None = Field(default=None, min_length=1, max_length=100)
    upsert_nodes: list[NodeEdit] = Field(default_factory=list, max_length=60)
    remove_node_ids: list[str] = Field(default_factory=list, max_length=60)
    upsert_edges: list[DraftEdge] = Field(default_factory=list, max_length=120)
    remove_edge_ids: list[str] = Field(default_factory=list, max_length=120)
    coverage: list[Coverage] = Field(default_factory=list, max_length=20)


class Revision(Contract):
    revision: int = Field(ge=0)


class TestPlanInput(Revision):
    plan: ExecutionPlan


def _unpack(part):
    choices=part.get('anyOf',[]) if isinstance(part,dict) else []
    return next((p for p in choices if p.get('type')!='null'),part)


def field_locations(schema):
    """Map each contract field name to the dotted paths where it is accepted."""
    found={}
    def walk(spec,path):
        spec=_unpack(spec)
        if not isinstance(spec,dict):return
        if isinstance(spec.get('items'),dict):walk(spec['items'],path+['*'])
        for name,value in (spec.get('properties') or {}).items():
            found.setdefault(name,set()).add('.'.join(path) or '$')
            walk(value,path+[name])
    walk(schema,[])
    return found


def extra_field_hint(location, value, valid_at):
    """Name-only repair hint for an unexpected field; never echoes values.

    Uses only contract field names and, for a wrapper object, the names of its
    keys, so user text inside the rejected argument cannot leak back.
    """
    key=str(location[-1]);here='.'.join('*' if isinstance(k,int) else str(k) for k in location[:-1]) or '$'
    accepted={name for name,paths in valid_at.items() if here in paths}
    # A wrapper such as {"item":{...real args...}} around otherwise valid fields.
    if isinstance(value,dict) and value and accepted and sum(k in accepted for k in value)>=max(1,len(value)//2):
        return f'{key}是多余的包装层；把其中的字段直接放在{"参数顶层" if here=="$" else here}，不要再包{key}。'
    elsewhere=sorted(valid_at.get(key,set())-{here})
    if elsewhere:
        return f'{key}不属于{"参数顶层" if here=="$" else here}，只能写在：'+'、'.join(key if p=="$" else f"{p}.{key}" for p in elsewhere)+'。'
    if 'set_data' in valid_at and here in ('upsert_nodes.*','$'):
        target='set_data' if here=='upsert_nodes.*' else 'upsert_nodes[i].set_data'
        return f'{key}不是编辑结构字段；若是节点配置，写在{target}.{key}。'
    return None


def argument_feedback(contract, error: ValidationError):
    """Describe the rejected argument's schema, never echo its input values.

    Contexts are shallow and deduplicated: a bad node field needs NodeEdit's
    fields, not the whole graph/test schema or another copy of the user's graph.
    Only used for tool argument validation, not internal node validation.
    """
    schema=inline_schema(contract.model_json_schema())
    details=[];contexts={}
    def unpack(part):
        choices=part.get('anyOf',[])
        return next((p for p in choices if p.get('type')!='null'),part)
    valid_at=field_locations(schema)
    for item in error.errors(include_context=False,include_url=False)[:12]:
        location=item['loc'];detail={'field':'.'.join(map(str,location)), 'issue':item['msg']}
        if item['type']=='extra_forbidden':
            hint=extra_field_hint(location,item.get('input'),valid_at)
            if hint:detail['fix']=hint
        if contract is GraphPatch and location==('base_revision',) and item['type']=='missing':
            detail['fix']='在参数顶层填写base_revision，取本次错误反馈session_state.revision；重试前核对最新图，不能省略。'
        details.append(detail)
        parent=schema;path=[];ancestors=[]
        for key in location:
            parent=unpack(parent)
            candidate=parent.get('items') if isinstance(key,int) else parent.get('properties',{}).get(key)
            if not isinstance(candidate,dict):break
            ancestors.append((parent,list(path)))
            parent=candidate;path.append('*' if isinstance(key,int) else str(key))
        parent=unpack(parent)
        # If an entire object/list item was given as text, the target schema
        # (not just its array parent) contains the fields needed for repair.
        if not parent.get('properties'):
            parent,path=next(((part,where) for part,where in reversed(ancestors) if part.get('properties')),(parent,path))
        if not parent.get('properties'):continue
        fields={name:{k:v for k,v in unpack(value).items() if k in ('type','enum','description')}
                for name,value in parent['properties'].items()}
        context_path='.'.join(path) or '$'
        contexts[context_path]={'path':context_path,'required':parent.get('required',[]),'fields':fields}
    result={'error':'字段契约未通过','details':details,'argument_contracts':list(contexts.values())}
    if contract is TestPlanInput:
        result['correct_structure_example']={'revision':'当前revision','plan':{'cases':[{'name':'用例名','steps':[{'input':'实际输入','assertions':[{'path':['hmi','message'],'op':'exists'}]}]}]}}
        result['structure_hint']='input/status/assertions属于plan.cases[i].steps[j]；name/weather/controls属于plan.cases[i]。参数顶层仅revision和plan，不接受item包装；示例只说明层级，不会自动修改测试。'
    return result


class AuthoringSession:
    def __init__(self, request, executor=None, reviewer=None):
        self.request = request
        self.builder = ScenarioBuilder(request)
        self.provider = self.builder.provider
        self.project = (request.current_project.model_copy(deep=True) if request.current_project
                        else ProjectSchema(id='agent-draft', name=request.project_name or '新场景'))
        self.project.meta = dict(self.project.meta or {})
        self.project.meta.pop('build_report', None)
        self.brief = None
        self.coverage = {}
        self.plan = request.acceptance_tests.model_copy(deep=True) if request.acceptance_tests else None
        self.plan_source = 'caller' if self.plan else 'agent'
        self.revision = 0
        self.inspection = None
        self.execution = None
        self.content_review = None
        self.review_history = []
        self.result = None
        self.trace = []
        self.trials = 0
        self.status_revisions = 0
        self.status_revision_details = []
        self.executor = executor or execute_candidate
        self.reviewer = reviewer or review_execution

    def _at(self, revision):
        if revision != self.revision:
            raise ValueError(f'图已更新：当前revision={self.revision}，请读取最新图后修改；不能覆盖旧版本。')

    def _changed(self):
        self.revision += 1
        self.inspection = self.execution = self.result = None
        self.content_review = None
        self.review_history = []

    def _fingerprint(self):
        nodes=copy.deepcopy(self.project.nodes)
        for node in nodes:
            node.get('data',{}).pop('designOnly',None);node.get('data',{}).pop('designIssue',None)
        return hashlib.sha256(compact({'nodes':nodes,'edges':self.project.edges}).encode()).hexdigest()

    def read(self):
        return {'revision':self.revision, 'project':self.project.model_dump(),
                'brief':self.brief.model_dump() if self.brief else None,
                'coverage':[c.model_dump() for c in self.coverage.values()],
                'locked_test_plan':self.plan.model_dump() if self.plan else None,'test_plan_source':self.plan_source,
                'trials_remaining':3-self.trials,
                'inspection':self.inspection[1] if self.inspection else None,
                'execution':self._execution_summary()}

    def capabilities(self):
        from app.services.node_capability_service import authoring_catalog
        return {'connection_contract':copy.deepcopy(CONNECTION_CONTRACT),'nodes':authoring_catalog(),'node_contract':FLOW_INSTRUCTIONS,
                'brief_contract':BRIEF_INSTRUCTIONS,'test_contract':EXECUTION_INSTRUCTIONS,
                'authoring_model':{'provider_id':self.provider.id,'model':self.provider.model},
                'connections':model_providers.statuses(),
                'scope':'GraphEngine实际执行；HMI与记忆隔离仿真；模型按各节点明确绑定调用真实API；不是实车。',
                'rules':'先读已有图。局部修改只提交改变字段，未提交字段保持原值。需求登记后不可改写；测试步骤一般不写status；AI计划可单独修改或删除任一步status，无需失败证据。也允许有类型证据的equals等义类型纠错，或非法断言路径改为预检合法候选，记录revision_kind；其他字段仅在当前waiting/期望completed证据下，允许改waiting并紧接补回答；原步骤、输入、断言全部保留，调用方计划完全锁定。每次图修改使旧检查和执行证据失效。'}

    async def capabilities_live(self):
        from app.services.mcp_runtime import catalog
        return {**self.capabilities(),'mcp_connections':await catalog()}

    def validate_brief(self, args):
        brief = ScenarioBrief.model_validate(args)
        if len({r.id for r in brief.requirements}) != len(brief.requirements):
            raise ValueError('需求ID不能重复。')
        sources=[self.request.prompt]+[t.content for t in self.request.conversation_history if t.role=='user']
        if self.request.current_project:
            sources.append(str((self.request.current_project.meta or {}).get('goal','')))
        bad=[r.id for r in brief.requirements if not any(r.source_quote in s for s in sources)]
        if bad:
            quotes=[{'id':r.id,'rejected_quote':r.source_quote} for r in brief.requirements if r.id in bad]
            raise ValueError('source_quote必须逐字引用用户原话，不要改写或拼接。错误引用：'+compact(quotes)+'；最新用户原文：'+self.request.prompt[:700])
        if self.brief and brief != self.brief:
            raise ValueError('需求已经登记，不能修改验收目标来绕过检查。')
        return brief

    def record_brief(self, args):
        brief = self.validate_brief(args)
        self.brief=brief
        return {'recorded':True,'connection_contract':copy.deepcopy(CONNECTION_CONTRACT),'requirement_ids':[r.id for r in brief.requirements], 'questions':brief.questions}

    def patch(self, args):
        patch=GraphPatch.model_validate(args)
        self._at(patch.base_revision)
        if not self.brief: raise ValueError('先调用oakegde_brief登记需求规格；读图中的历史规格不会自动登记为本次用户需求。')
        # Entire operation is prepared on a copy; invalid edits never partly commit.
        project=self.project.model_copy(deep=True)
        by_id={n['id']:copy.deepcopy(n) for n in project.nodes}
        edges={e['id']:copy.deepcopy(e) for e in project.edges}
        if len(by_id)!=len(project.nodes) or len(edges)!=len(project.edges):
            raise ValueError('当前图包含重复ID，请先在原项目修正，不能覆盖为单个节点。')
        coverage=dict(self.coverage)
        allowed={r.id for r in self.brief.requirements}
        if any(c.requirement_id not in allowed for c in patch.coverage):
            raise ValueError('覆盖只能引用已登记需求：'+', '.join(sorted(allowed)))
        if len({n.id for n in patch.upsert_nodes})!=len(patch.upsert_nodes):
            ids=[n.id for n in patch.upsert_nodes]
            raise ValueError('单次修改不能重复写入同一节点：'+', '.join(sorted({id for id in ids if ids.count(id)>1}))+'。将同ID的set_data和remove_data_keys合并为一个upsert_nodes项后重试。')
        if set(patch.remove_node_ids)&{n.id for n in patch.upsert_nodes}:
            raise ValueError('不能同时删除和写入同一节点：'+', '.join(sorted(set(patch.remove_node_ids)&{n.id for n in patch.upsert_nodes}))+'。修改已有节点时从remove_node_ids移除该ID，使用一个upsert_nodes项原位修改type/set_data，用remove_data_keys删除旧配置。')
        # Validate explicit deletions against the original revision. A node
        # deletion below also removes incident edges, so checking afterwards
        # would reject an otherwise valid combined node/edge transaction.
        if len(set(patch.remove_edge_ids))!=len(patch.remove_edge_ids):
            raise ValueError('删除的连线ID不能重复。')
        for id in patch.remove_edge_ids:
            if id not in edges:raise ValueError('删除的连线不存在：'+id+'；调用oakegde_read_graph核对当前edge.id，仅删除存在的ID。删除节点已自动删除其关联边，不要在后续patch再次删除。')
        for id in patch.remove_node_ids:
            if id not in by_id:raise ValueError('删除的节点不存在：'+id)
            del by_id[id]
            edges={k:e for k,e in edges.items() if e['source']!=id and e['target']!=id}
        for edit in patch.upsert_nodes:
            old=by_id.get(edit.id)
            if old is None and (edit.type is None or edit.position is None):
                raise ValueError('新增节点必须声明type和position：'+edit.id+'；upsert_nodes项使用{id,type,position:{x:数字,y:数字},set_data:{配置字段}}。若想修改已有节点，请使用当前图中的原ID。')
            node=copy.deepcopy(old or {'id':edit.id,'type':edit.type,'position':edit.position.model_dump(),'data':{}})
            if edit.type is not None:node['type']=edit.type
            if edit.position is not None:node['position']=edit.position.model_dump()
            if edit.style is not None:node['style']=copy.deepcopy(edit.style)
            if edit.detach_parent:node.pop('parentId',None);node.pop('extent',None)
            elif edit.parentId is not None:node.update(parentId=edit.parentId,extent='parent')
            data=copy.deepcopy(node.get('data') or {})
            for k in edit.remove_data_keys:data.pop(k,None)
            data.update(copy.deepcopy(edit.set_data))
            if any(k in data for k in ('__proto__','constructor','prototype')):
                raise ValueError('节点数据不能包含原型字段。')
            if node['type'] in ('input','systemInput') and old is None:data.setdefault('flowVersion',2)
            if node['type']=='llm':
                if not data.get('model'):data.update(model=self.provider.model,providerId=self.provider.id)
                elif data['model']==self.provider.model and not data.get('providerId'):data['providerId']=self.provider.id
            node['data']=data
            # ReactFlow may persist measured/selected UI metadata; preserve it while
            # validating just the authorable envelope against the real node contract.
            fields={k:v for k,v in node.items() if k in DraftNode.model_fields}
            DraftNode.model_validate(fields)
            by_id[edit.id]=node
        if len({e.id for e in patch.upsert_edges})!=len(patch.upsert_edges):raise ValueError('连线ID重复。')
        if set(patch.remove_edge_ids)&{e.id for e in patch.upsert_edges}:raise ValueError('不能同时删除和写入同一连线。')
        for id in patch.remove_edge_ids:
            edges.pop(id,None)  # May already be removed with its endpoint.
        for e in patch.upsert_edges:edges[e.id]=e.model_dump(exclude_none=True)
        if len(by_id)>60 or len(edges)>120:raise ValueError('当前执行预算为60节点、120连线。')
        project.nodes=list(by_id.values());project.edges=list(edges.values())
        if patch.project_name:project.name=patch.project_name
        for c in patch.coverage:coverage[c.requirement_id]=c
        removed=set(patch.remove_node_ids)
        warnings=[{'code':'coverage_node_removed','requirement_id':c.requirement_id,
                   'missing_node_ids':[id for id in c.node_ids if id in removed and id not in by_id],
                   'message':'删除或改名后的节点仍被需求覆盖表引用；请显式修正coverage，宿主未自动更改覆盖表。'}
                  for c in coverage.values() if any(id in removed and id not in by_id for id in c.node_ids)]
        if patch.remove_edge_ids or patch.remove_node_ids:
            from app.services.node_capability_service import reachable_node_ids
            lost=reachable_node_ids(self.project.nodes,self.project.edges)-reachable_node_ids(project.nodes,project.edges)
            lost=sorted(id for id in lost if id in by_id and by_id[id]['type']!='stage')
            if lost:warnings.append({'code':'newly_unreachable_nodes','node_ids':lost,'removed_edge_ids':patch.remove_edge_ids,
                                     'message':'本次删除连线/节点后，这些原可达节点已不可达；补一条从可达节点出发的连线，或用remove_node_ids删除。宿主未自动删除节点。'})
        self.project,self.coverage=project,coverage
        self._changed()
        return {'revision':self.revision,'nodes':len(by_id),'edges':len(edges),
                'test_plan_locked':self.plan is not None,'evidence_invalidated':True,'warnings':warnings,
                'contract_diagnostics':connection_diagnostics(project.nodes,project.edges)}

    def set_plan(self, args):
        value=TestPlanInput.model_validate(args);self._at(value.revision)
        preflight=inspect_test_plan(self.project,value.plan)
        if preflight['errors']:raise PlanContractError(preflight['errors'])
        control_errors=test_plan_control_errors(value.plan)
        if control_errors:raise ValueError('；'.join(control_errors)+'；无效计划未锁定。')
        if any(not any(s.assertions for s in c.steps) for c in value.plan.cases):
            raise ValueError('每个用例至少一个实际值断言。')
        by_id={n['id']:n for n in self.project.nodes}
        for case in value.plan.cases:
            for step in case.steps:
                for assertion in step.assertions:
                    path=assertion.path
                    if len(path)>2 and path[0]=='outputs' and by_id.get(path[1],{}).get('type') in ('output','tts') and path[2]!='length' and not path[2].isdigit():
                        raise ValueError(f'{path[1]}展示输出返回字符串，不是含{path[2]}字段的对象。请读取outputs节点根或hmi.message；无效计划未锁定。')
        revised=bool(self.plan and not same_plan_value(self.plan,value.plan))
        status_only=revised and self._status_only_plan_revision_allowed(value.plan)
        assertion_revision=self._assertion_plan_revision_kind(value.plan) if revised else None
        if revised:
            if not status_only and not assertion_revision and not self._waiting_plan_revision_allowed(value.plan):
                raise ValueError('测试计划已锁定；AI计划允许单独修改/删除任一步status，无需waiting证据。也允许有类型证据的equals等义类型修正或非法路径改为预检合法候选；其他改动仅沿用当前waiting/completed证据下改waiting并紧接补回答的受限规则，原输入/断言/条件保留；调用方计划完全锁定。')
            if status_only:
                self.status_revisions+=1
                self.status_revision_details.append({'revision':self.revision,'changes':[{'path':f'plan.cases.{i}.steps.{j}.status','before':a.status,'after':b.status} for i,(old,new) in enumerate(zip(self.plan.cases,value.plan.cases)) for j,(a,b) in enumerate(zip(old.steps,new.steps)) if a.status!=b.status]})
            self.inspection=self.execution=self.content_review=None
            self.review_history=[]
        self.plan=value.plan
        return {'warnings':preflight['warnings'],'locked':True,'cases':len(self.plan.cases),'revision':self.revision,'revision_kind':assertion_revision or ('status_only' if status_only else 'waiting_response' if revised else 'initial'),'revised_waiting_expectation':revised and not status_only and not assertion_revision,'revised_status':bool(status_only),'status_revisions':self.status_revisions}

    def _assertion_plan_revision_kind(self, proposed):
        if self.plan_source!='agent' or not self.plan:return None
        old=self.plan.model_dump();new=proposed.model_dump();normalized=copy.deepcopy(new);kinds=set()
        diagnostics=inspect_test_plan(self.project,self.plan)['errors']
        by_path={d['path']:d for d in diagnostics if d['code'] in ('PLAN_ASSERTION_PATH','PLAN_ASSERTION_TYPE')}
        try:
            for i,case in enumerate(old['cases']):
                for j,step in enumerate(case['steps']):
                    for k,a in enumerate(step['assertions']):
                        b=new['cases'][i]['steps'][j]['assertions'][k]
                        if compact(a)==compact(b):continue
                        base=f'plan.cases[{i}].steps[{j}].assertions[{k}]'
                        diagnostic=by_path.get(base,{})
                        repaired=copy.deepcopy(b)
                        if a['path']!=b['path']:
                            if diagnostic.get('code')!='PLAN_ASSERTION_PATH' or b['path'] not in diagnostic.get('suggestions',[]):return None
                            repaired['path']=a['path'];kinds.add('assertion_path')
                        if compact(a.get('value'))!=compact(b.get('value')):
                            # No changing truth, numeric magnitude, operators, inputs, or coverage.
                            if a['op']!='equals' or not isinstance(a.get('value'),str):return None
                            try:parsed=json.loads(a['value'])
                            except ValueError:return None
                            if not isinstance(parsed,(bool,int,float)) or compact(parsed)!=compact(b.get('value')):return None
                            inferred=diagnostic.get('expected_type')
                            if a['path']!=b['path']:
                                # Recheck the suggested destination using the old expected value;
                                # its type error proves the representation change is necessary.
                                probe=copy.deepcopy(old)
                                probe['cases'][i]['steps'][j]['assertions'][k]['path']=b['path']
                                inferred=next((d.get('expected_type') for d in inspect_test_plan(self.project,probe)['errors'] if d['path']==base and d['code']=='PLAN_ASSERTION_TYPE'),None)
                            evidence=None
                            if a['path']==b['path'] and self.execution and self.execution[0]==self.revision:
                                reports=self.execution[1].get('cases',[])
                                if i<len(reports):
                                    steps=reports[i].get('steps',[])
                                    record=next((v for v in steps if v.get('index')==j),{})
                                    assertions=record.get('assertions',[])
                                    if k<len(assertions) and assertions[k].get('path')==a['path'] and not assertions[k].get('actual_missing'):
                                        evidence=assertions[k].get('actual')
                            kind='boolean' if isinstance(parsed,bool) else 'number'
                            actual_kind='boolean' if isinstance(evidence,bool) else 'number' if isinstance(evidence,(int,float)) else None
                            if inferred!=kind and actual_kind!=kind:return None
                            repaired['value']=a.get('value');kinds.add('assertion_type')
                        if compact(repaired)!=compact(a):return None
                        normalized['cases'][i]['steps'][j]['assertions'][k]=copy.deepcopy(a)
        except (IndexError,KeyError,TypeError):return None
        if compact(normalized)!=compact(old) or not kinds:return None
        return '+'.join(sorted(kinds))

    def _status_only_plan_revision_allowed(self, proposed):
        if self.plan_source!='agent' or not self.plan:return False
        def without_status(plan):
            value=plan.model_dump()
            for case in value['cases']:
                for step in case['steps']:step.pop('status',None)
            return value
        return same_plan_value(without_status(self.plan),without_status(proposed))

    def _waiting_plan_revision_allowed(self, proposed):
        if self.plan_source!='agent' or not self.execution or self.execution[0]!=self.revision:
            return False
        if len(self.plan.cases)!=len(proposed.cases):return False
        reports=self.execution[1].get('cases',[])
        for case_index,(old,new) in enumerate(zip(self.plan.cases,proposed.cases)):
            if same_plan_value(old,new):continue
            if not same_plan_value(old.model_dump(exclude={'steps'}),new.model_dump(exclude={'steps'})):return False
            if case_index>=len(reports):return False
            evidence=reports[case_index]
            if evidence.get('name')!=old.name:return False
            mismatches=[s for s in evidence.get('steps',[]) if s.get('status')=='waiting' and s.get('expected_status')=='completed' and s.get('waiting_nodes')]
            if len(mismatches)!=1:return False
            index=mismatches[0]['index'];added=len(new.steps)-len(old.steps)
            if not 0<=index<len(old.steps) or added<1 or old.steps[index].status!='completed':return False
            if not same_plan_value(new.steps[:index],old.steps[:index]) or not same_plan_value(new.steps[index+1+added:],old.steps[index+1:]):return False
            if not same_plan_value(new.steps[index],old.steps[index].model_copy(update={'status':'waiting'})):return False
        return True

    def inspect(self, args):
        self._at(Revision.model_validate(args).revision)
        if not self.brief:raise ValueError('先调用oakegde_brief登记需求规格；读图中的历史规格不会自动登记为本次用户需求。')
        checked=self.project.model_copy(deep=True)
        for node in checked.nodes:
            node['data'].pop('designOnly',None);node['data'].pop('designIssue',None)
        errors,warnings,coverage=inspect_candidate(checked,self.brief,[c.model_dump() for c in self.coverage.values()])
        from app.services.expression_preflight import expression_issues
        errors+=expression_issues(checked.nodes,self.plan)
        errors+=api_model_binding_errors(checked.nodes)
        preflight=inspect_test_plan(checked,self.plan)
        errors += [d['message'] for d in preflight['errors']]
        warnings += [d['message'] for d in preflight['warnings']]
        if self.plan:errors+=test_plan_control_errors(self.plan)
        errors+=['待确认：'+q for q in self.brief.questions]
        if not checked.nodes:errors.append('图不能为空。')
        next_step='先调用 oakegde_test_plan 登记覆盖需求的输入/断言，再 oakegde_trial 取得当前 revision 的运行与核验证据。' if not errors and self.plan is None else None
        result={'next_required_step':next_step,'contract_diagnostics':connection_diagnostics(checked.nodes,checked.edges)+preflight['errors']+preflight['warnings'],'revision':self.revision,'passed':not errors,'issues':errors,'warnings':warnings,
                'coverage':[c.model_dump() for c in coverage],'artifact_sha256':self._fingerprint()}
        self.inspection=(self.revision,result,checked)
        return result

    async def trial(self, args):
        self._at(Revision.model_validate(args).revision)
        inspection=self.inspect(args)
        if not inspection['passed']:return {'status':'not_run','issues':inspection['issues'],'contract_diagnostics':inspection['contract_diagnostics'],'repair_hints':REPAIR_HINTS,'runtime_verified':False}
        if self.plan is None:raise ValueError('先提交带实际输入与断言的测试计划。')
        if (self.execution and self.execution[0]==self.revision
                and self.execution[1].get('status')=='passed'
                and self.execution[1].get('artifact_sha256')==self._fingerprint()):
            # A review outage is not a reason to replay already completed tools
            # or sample new model output. Semantic verdicts remain authoritative
            # until the graph changes; only unavailable/invalid reviews retry.
            status=self._content_review().get('status')
            if status in ('passed','needs_changes'):
                action='cached'
            elif len(self.review_history)<2:
                await self._review_current_execution()
                action='review_retried'
            else:
                action='review_budget_exhausted'
            return {**self._execution_summary(),'execution_reused':True,'trial_action':action}
        if self.trials>=3:raise ValueError('已达到三次实际试跑预算，请交付最新草稿及未完成项。')
        self.trials+=1
        self.content_review = None
        self.review_history = []
        report=await self.executor(self.inspection[2].model_dump(),self.plan.model_dump())
        report['artifact_sha256']=self._fingerprint()
        self.execution=(self.revision,report)
        if report.get('status')=='passed':
            await self._review_current_execution()
        return {**self._execution_summary(),'execution_reused':False,'trial_action':'executed'}

    async def _review_current_execution(self):
        # Count before awaiting, including interrupted or failed requests.
        previous_error=copy.deepcopy(self.review_history[-1]) if self.review_history else None
        pending={'status':'error','source':'not_completed','issues':[],
                 'independent_verification':False,'message':'内容核验中断或未返回，候选尚不可应用。'}
        self.review_history.append(pending)
        self.content_review=(self.revision,copy.deepcopy(pending))
        try:
            report=await self.reviewer(self.request,self.brief,copy.deepcopy(self.execution[1]),provider=self.provider,previous_error=previous_error)
            if not isinstance(report,dict) or report.get('status') not in ('passed','needs_changes','error'):
                raise ValueError('invalid review status')
        except asyncio.CancelledError:
            raise
        except Exception as exc:
            # Never echo provider bodies, credentials or arbitrary exceptions.
            report={**pending,'error_type':type(exc).__name__}
        self.review_history[-1]=copy.deepcopy(report)
        self.content_review=(self.revision,copy.deepcopy(report))

    def _execution_summary(self):
        if not self.execution:return None
        report=self.execution[1]
        review=self._content_review()
        return {'revision':self.execution[0],'status':report['status'],'runtime_verified':report.get('status')=='passed',
                'model_calls':report.get('model_calls',0),'overload_retries':report.get('overload_retries',0),'tool_calls':report.get('tool_calls',0),'tool_source':report.get('tool_source'),'failures':execution_feedback(report),'contract_diagnostics':execution_diagnostics(report),'repair_hints':REPAIR_HINTS,
                'cases':[{'name':c['name'],'passed':c['passed'],'steps':[{'index':s['index'],'status':s['status'],
                    'displayed':str(s.get('evidence',{}).get('hmi',{}).get('message',''))[:1600]} for s in c['steps']]} for c in report.get('cases',[])],
                'scope':report.get('scope'),'trials_remaining':3-self.trials,
                'review_attempts':len(self.review_history),'review_retries_remaining':max(0,2-len(self.review_history)) if report.get('status')=='passed' and review.get('status') in ('error','not_run') else 0,
                'content_review_history':copy.deepcopy(self.review_history),
                'content_review':review,
                'can_submit':report.get('status')=='passed' and review.get('status')=='passed'}

    def _content_review(self):
        if self.content_review and self.content_review[0]==self.revision:return copy.deepcopy(self.content_review[1])
        return {'status':'not_run','source':'not_run','issues':[],'independent_verification':False}

    def submit(self, args):
        self._at(Revision.model_validate(args).revision)
        if not self.execution or self.execution[0]!=self.revision or self.execution[1].get('artifact_sha256')!=self._fingerprint() or self.execution[1].get('status')=='not_run':
            raise ValueError('[SUBMIT_TRIAL_REQUIRED] 当前 revision 没有实际 trial 证据；结构 inspect 通过不等于执行过。先登记 oakegde_test_plan，再调用 oakegde_trial；图修改后必须重新试跑。宿主仍会在预算结束时保留不可应用草稿。')
        return self._build_result(args)

    def _build_result(self, args):
        self._at(Revision.model_validate(args).revision)
        if self.inspection is None or self.inspection[0]!=self.revision:
            raise ValueError('先检查最新图，不能提交未检查版本。')
        check=self.inspection[1];project=self.inspection[2].model_copy(deep=True)
        errors=list(check['issues']);warnings=list(check['warnings'])
        execution=self.execution[1] if self.execution and self.execution[0]==self.revision else {'status':'not_run','runtime_verified':False}
        if not errors and execution.get('status')!='passed':
            errors+=['实际试跑未通过；'+issue for issue in execution_feedback(execution)] or ['候选尚未实际试跑通过。']
        content_review=self._content_review()
        if not errors and content_review.get('status')!='passed':
            errors+=['实际内容核验：'+issue for issue in review_feedback(content_review)]
        coverage=check['coverage']
        status='preview' if not errors else 'needs_changes'
        if any(c['status']=='missing' for c in coverage):status='capability_gap'
        if self.brief.questions:status='needs_input'
        can_inspect=bool(errors) and inspectable_graph(project)
        if can_inspect:
            for n in project.nodes:n['data'].update(designOnly=True,designIssue='候选尚未验证通过，请按实际反馈修复。')
        report={'version':1,'engine':'hermes','status':status,'can_apply':not errors,'can_inspect':can_inspect,
                'brief':self.brief.model_dump(),'coverage':coverage,'issues':errors,
                'content_review':content_review,
                'content_review_history':copy.deepcopy(self.review_history),
                'execution':execution,'execution_plan':self.plan.model_dump() if self.plan else None,'test_plan_source':self.plan_source,'status_revisions':self.status_revisions,'status_revision_details':copy.deepcopy(self.status_revision_details),'attempts':[{'attempt':self.trials,'passed':not errors,'issues':errors}],
                'calls':copy.deepcopy(self.trace),'runtime_verified':execution.get('status')=='passed',
                'artifact_sha256':self._fingerprint(),'revision':self.revision}
        project.meta.update(scenario_brief=self.brief.model_dump(),build_report=report,
                            authoring_engine='hermes',authoring_provider=self.provider.id,authoring_model=self.provider.model)
        tests=[WorkflowTestResultSchema(name='agent_graph_checks',passed=not errors,
               details='节点契约、需求覆盖、实际引擎断言与独立上下文模型辅助内容核验；不构成独立事实或全面质量认证。')]
        self.result=self.builder.response(project,self.brief,report,errors,warnings,tests).model_dump()
        return {'submitted':True,'status':status,'runtime_verified':report['runtime_verified'],'revision':self.revision}

    def incomplete_result(self):
        """Retain a reviewable draft if the agent exhausts its turn budget."""
        if not self.brief or not self.project.nodes:return None
        self.inspect({'revision':self.revision})
        self._build_result({'revision':self.revision})
        reason='智能体未完成最终提交；保留最新图与执行证据供继续修复。'
        report=self.result['build_report']
        report.update(can_apply=False,can_inspect=inspectable_graph(self.project),incomplete_agent_run=True)
        if report['status']=='preview':report['status']='needs_changes'
        report['issues'].append(reason)
        self.result['validation']['passed']=False
        self.result['validation']['errors']=list(report['issues'])
        for node in self.result['project']['nodes']:node['data'].update(designOnly=True,designIssue=reason)
        self.result['project']['meta']['build_report']=report
        self.result['documentation_markdown']+='\n\n'+reason
        return self.result

    def tools(self):
        return [
            ('oakegde_capabilities','查询真实能力、字段和执行契约。',Empty,self.capabilities_live),
            ('oakegde_read_graph','读取当前图及版本、需求、锁定测试计划与最新证据。',Empty,self.read),
            ('oakegde_brief','登记用户需求。source_quote逐字引用原话；登记后不可改写。',ScenarioBrief,self.record_brief),
            ('oakegde_patch_graph','按base_revision事务性修改图。set_data合并顶层字段；未提供字段保留。新增节点需要type/position。删除节点同时删除其连线。coverage按requirement_id更新，不新增用户需求。',GraphPatch,self.patch),
            ('oakegde_test_plan','PLAN_ASSERTION_WEAK 提醒 nodes.<id> exists 不证明执行；建议 equals success 或回执。PLAN_EVENT_UNMATCHED 提醒 eventOf 与入口/等待不匹配；锁定前核对，不自动解包。断言路径必须来自真实图/目录：car 中有显式 path 的控制项按该 path 读取，其余用 ["car","hmiSettings","完整controlId"]（controlId 中的点不拆分）；JSON节点字段位于 ["outputs","节点ID","data","字段"]，output/tts返回字符串；["nodes","节点ID"]必须引用现有节点及合法状态。提交与inspect返回 PLAN_ASSERTION_PATH 和合法候选、PLAN_ASSERTION_TYPE 和期望类型。equals严格区分string/number/boolean；使用JSON数值/布尔值，不把数字或true/false加引号。AI锁定计划仅额外允许：有推导/实际类型证据时，将equals字符串值改为语义等值数字/布尔；或把非法路径改为预检合法候选。返回revision_kind，其他内容保持，调用方计划仍完全锁定，缓存失效但预算不重置。 JSON 输入节点 inputFormat=json 的 step.input 推荐直接给对象，例如 {"temp":22}；也接受 JSON 字符串或带 text 字段的对象（text 必须为 JSON 字符串，存在 text 时取 text 解析）。outputFields 声明所有必需字段及 string/number/boolean/array/object 类型，逐项严格校验、不转换类型，结果仅保留声明字段并放入 outputs.<入口>.data。具名入口用 {"$event":{"name":"入口eventName","value":{"temp":22}}}，不使用 $event.data。每个 case 从全新状态开始，独立会话、车辆、state、独立记忆；case 之间不共享；多轮记忆的准备和读取必须在同一个 case 的多个 step 中完成。 每个case是独立会话、独立车辆、独立记忆；case之间不共享state或记忆。已有记忆须在本case前面步骤自行写入，正确示例见能力test_contract。一般不要写步骤status；只有明确断言必须结束/等待时才写。AI计划可单独修改或删除任一步status，无需失败证据；也允许仅纠正等义断言类型（如字符串3改数字3，须有推导/实际类型证据），或将非法断言路径改为前置检查给出的合法候选；不改比较运算、值含义、输入或覆盖，返回revision_kind。其他字段仅按原waiting/completed证据受限修订规则。调用方计划完全锁定。修订使执行/核验缓存失效，不重置试跑次数。',TestPlanInput,self.set_plan),
            ('oakegde_inspect','检查最新revision的结构、能力与需求覆盖，返回具体错误。',Revision,self.inspect),
            ('oakegde_trial','隔离试跑最新图，最多三次实际执行。运行通过后核验实际内容；同版本重复调用复用执行证据，不再调用模型节点或工具。仅核验error/缺失可重试一次（每份证据最多两次核验）；passed/needs_changes不重抽。检查content_review、can_submit、trial_action和review_retries_remaining，内容问题先修图，预算耗尽交付草稿。',Revision,self.trial),
            ('oakegde_submit','交付最新已检查图。实际试跑与该版本内容核验均通过才可应用；没有当前revision实际trial证据时拒绝提交（SUBMIT_TRIAL_REQUIRED）；先登记计划并trial。不会直接保存或覆盖项目。',Revision,self.submit),
        ]

    async def invoke(self,name,args,*,reference_restorations=None,normalizations=None):
        started=time.monotonic();entry={'tool':name,'revision':self.revision}
        budget=getattr(self,'completion_budget',None)
        if budget:entry.update(completion_attempts=budget.attempts,elapsed_ms=round((started-budget.started)*1000))
        validating_arguments=False
        try:
            if self.result is not None:raise ValueError('已提交，请结束本轮。')
            tool=next((t for t in self.tools() if t[0]==name),None)
            if tool is None:raise ValueError('未知编排工具。')
            validating_arguments=True
            validated=tool[2].model_validate(args).model_dump(exclude_none=True)
            validating_arguments=False
            result=tool[3]() if tool[2] is Empty else tool[3](validated)
            import inspect
            if inspect.isawaitable(result):result=await result
            notes=normalized_scalars(name,args)
            if notes and isinstance(result,dict):result={**result,'normalized_arguments':notes}
            entry['ok']=True
        except (ValueError,KeyError,TypeError) as exc:
            entry['ok']=False
            if isinstance(exc,ValidationError):
                result=argument_feedback(tool[2],exc) if validating_arguments else {'error':'节点或执行契约未通过','details':[{'field':'.'.join(map(str,e['loc'])),'issue':e['msg']} for e in exc.errors(include_input=False,include_context=False,include_url=False)[:12]]}
            elif isinstance(exc,PlanContractError):result={'error':str(exc)[:1400],'category':exc.diagnostics[0]['category'],'contract_diagnostics':exc.diagnostics,'repair_hints':REPAIR_HINTS}
            else:result={'error':str(exc)[:1400],**({'code':'SUBMIT_TRIAL_REQUIRED','category':'graph_logic'} if str(exc).startswith('[SUBMIT_TRIAL_REQUIRED]') else {})}
            result['session_state']={'revision':self.revision,'brief_registered':self.brief is not None,
                                     'test_plan_locked':self.plan is not None,
                                     'inspection_current':self.inspection is not None and self.inspection[0]==self.revision,
                                     'execution_current':self.execution is not None and self.execution[0]==self.revision}
        if reference_restorations is not None:
            entry['reference_restorations']=reference_restorations
            result={**result,'reference_restorations':reference_restorations}
        if normalizations is not None:
            entry['diagnostics']={'normalizations':len(normalizations),'normalization_details':copy.deepcopy(normalizations)}
            result={**result,'diagnostics':copy.deepcopy(entry['diagnostics'])}
        entry.update(duration_ms=round((time.monotonic()-started)*1000),result=copy.deepcopy(result))
        self.trace.append(entry)
        return result
