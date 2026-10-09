"""Bounded plan -> build -> inspect -> repair pipeline. No generated code is executed.

Model review is advisory evidence, never a factual or runtime certification.
"""
from __future__ import annotations

import asyncio
import hashlib
import json
import re
import time
import unicodedata
from typing import Literal

from fastapi import HTTPException
from pydantic import BaseModel, ConfigDict, Field, ValidationError

from app.schemas.orchestration_schema import WorkflowGenerateResponseSchema, WorkflowValidationSchema, WorkflowTestResultSchema
from app.schemas.project_schema import ProjectSchema, ProjectSaveSchema
from app.services.node_capability_service import CATALOG
from app.services.orchestration_service import OrchestrationService as Legacy
from app.services.project_service import ProjectService
from app.services import model_providers
from app.services.flow_contract import FLOW_INSTRUCTIONS
from app.services.scenario_execution import ExecutionPlan, EXECUTION_INSTRUCTIONS, execute_candidate, execution_feedback


class Contract(BaseModel):
    model_config = ConfigDict(extra='forbid', str_strip_whitespace=True)


class Requirement(Contract):
    id: str = Field(min_length=1, max_length=60)
    description: str = Field(min_length=1, max_length=600)
    acceptance: str = Field(min_length=1, max_length=600)
    source_quote: str = Field(min_length=1, max_length=600)


class ScenarioBrief(Contract):
    execution_kind: Literal['interaction', 'workflow'] = 'workflow'  # interaction retained for old external callers
    title: str = Field(min_length=1, max_length=100)
    goal: str = Field(min_length=1, max_length=1500)
    requirements: list[Requirement] = Field(min_length=1, max_length=20)
    experience_outline: list[str] = Field(min_length=1, max_length=12)
    assumptions: list[str] = Field(default_factory=list, max_length=8)
    questions: list[str] = Field(default_factory=list, max_length=3, description='仅列出需要用户实际回答、且阻止继续执行的具体问题。没有问题时必须为[]；不要放入无/无需补充/已明确等状态说明。每个非空项都会阻止试跑，登记后不可改写。')


class Coverage(Contract):
    requirement_id: str
    status: Literal['implemented', 'simulated', 'missing']
    node_ids: list[str] = Field(max_length=30)
    note: str = Field(min_length=1, max_length=800)


class ReviewIssue(Contract):
    requirement_id: str
    problem: str = Field(min_length=1, max_length=1000)
    correction: str = Field(min_length=1, max_length=1000)


class ContentReview(Contract):
    issues: list[ReviewIssue] = Field(max_length=16)
    strengths: list[str] = Field(max_length=20)


class ExperienceStage(Contract):
    id: str
    title: str
    waitFor: Literal['answer', 'continue', 'arrival']
    message: str
    question: str | None = None
    answers: list[str] | None = None
    hint: str | None = None
    reward: str | None = None


class Experience(Contract):
    premise: str
    ending: str
    steps: list[ExperienceStage] = Field(min_length=1, max_length=12)


class ExperienceDraft(Contract):
    project_name: str
    summary: str
    experience: Experience
    requirement_coverage: list[Coverage]


# A graph needs a typed envelope just as authored experiences do. Dynamic node
# configuration remains data and is checked against the capability registry.
class NodePosition(Contract):
    x: float = Field(allow_inf_nan=False)
    y: float = Field(allow_inf_nan=False)


NodeKind = Literal[tuple(k for k, v in CATALOG['nodes'].items() if v['generatable'] or k=='interaction')]


class DraftNode(Contract):
    id: str = Field(min_length=1, max_length=100)
    type: NodeKind
    position: NodePosition
    parentId: str | None = None
    extent: Literal["parent"] | None = None
    style: dict | None = None
    data: dict = Field(default_factory=dict)


class DraftEdge(Contract):
    id: str = Field(min_length=1, max_length=150)
    source: str = Field(min_length=1)
    target: str = Field(min_length=1)
    type: str = 'smoothstep'
    sourceHandle: str | None = None
    targetHandle: str | None = None


class DraftGraph(Contract):
    nodes: list[DraftNode] = Field(min_length=1, max_length=60)
    edges: list[DraftEdge] = Field(max_length=120)
    meta: dict = Field(default_factory=dict)


class WorkflowDraft(Contract):
    execution_plan: ExecutionPlan | None = None
    project_name: str = Field(min_length=1, max_length=100)
    summary: str
    workflow: DraftGraph
    requirement_coverage: list[Coverage]
    documentation_markdown: str = ''
    test_cases: list[dict] = Field(default_factory=list)


def inspectable_graph(project):
    """A drawable draft is not an executable or approved candidate."""
    if not project.nodes: return False
    ids = [n['id'] for n in project.nodes]
    edge_ids = [e['id'] for e in project.edges]
    return (len(ids) == len(set(ids)) and len(edge_ids) == len(set(edge_ids))
            and all(e['source'] in ids and e['target'] in ids for e in project.edges))


def compile_experience(payload):
    """Compile content to known nodes; the model does not author the wiring."""
    experience = Experience.model_validate(payload.get('experience'))
    steps = []
    for stage in experience.steps:
        data = stage.model_dump(exclude_none=True)
        steps.append({k:data[k] for k in ('id','title','waitFor')} | {
            'content':{k:v for k,v in data.items() if k not in ('id','title','waitFor')}})
    missing = [c['note'] for c in payload.get('requirement_coverage', []) if isinstance(c,dict) and c.get('status') == 'missing']
    return {**payload, 'workflow':{
        'nodes':[
            {'id':'passenger_input','type':'input','position':{'x':80,'y':120},'data':{'label':'乘客输入'}},
            {'id':'experience','type':'interaction','position':{'x':400,'y':120},'data':{
                'label':payload.get('project_name') or '连续体验',
                'plan':{'mode':'authored','premise':experience.premise,'ending':experience.ending,'steps':steps}}}],
        'edges':[{'id':'input_to_experience','source':'passenger_input','target':'experience','type':'smoothstep'}],
        'meta':{'missing_capabilities':missing}}}


def compact(value):
    return json.dumps(value, ensure_ascii=False, separators=(',', ':'))


def normalized(text):
    return ''.join(c for c in unicodedata.normalize('NFKC', text).lower()
                   if not c.isspace() and not unicodedata.category(c).startswith('P'))


def normalize_provider_arrays(value, schema):
    """Lossless compatibility for the observed MiniMax {item:[...]} array envelope.
    Only unwrap at schema-declared arrays; never invent, drop or coerce entries.
    """
    changes = []
    def walk(item, spec, path, field_name=None):
        if '$ref' in spec:
            spec = schema['$defs'][spec['$ref'].split('/')[-1]]
        if 'anyOf' in spec:
            spec = next((x for x in spec['anyOf'] if x.get('type') != 'null'), {})
        # Numeric quiz answers are the same literal when typed into chat. This is
        # representation conversion, never solving or guessing a missing answer.
        if spec.get('type') == 'string' and '.answers[' in path and isinstance(item,(int,float)) and not isinstance(item,bool):
            if isinstance(item,int) or item == int(item):
                changes.append(path+' (numeric answer)'); return str(int(item))
        if spec.get('type') in ('array','object') and isinstance(item,str):
            try:
                decoded = json.loads(item)
                # Observed tool provider form: {field: "{\"field\":[...]}"}.
                # Unwrap only the sole matching property at a declared array;
                # never discard sibling keys or reinterpret scalar/object data.
                if spec['type']=='array' and isinstance(decoded,dict) and field_name and set(decoded)=={field_name} and isinstance(decoded[field_name],list):
                    decoded=decoded[field_name];changes.append(path+' (named array envelope)')
                if isinstance(decoded, list if spec['type']=='array' else dict):
                    item = decoded; changes.append(path+' (JSON string)')
            except (ValueError, TypeError):
                pass
        if spec.get('type') == 'array':
            if isinstance(item, dict) and set(item) == {'item'} and isinstance(item['item'], list):
                item = item['item']; changes.append(path)
            if isinstance(item, list):
                return [walk(x, spec.get('items',{}), f'{path}[{i}]') for i,x in enumerate(item)]
        if spec.get('type') == 'object' and isinstance(item,dict):
            return {k:walk(v,spec.get('properties',{}).get(k,{}),f'{path}.{k}',k) for k,v in item.items()}
        return item
    return walk(value,schema,'result'), changes


def inline_schema(schema):
    """Some tool providers misread $ref properties as strings; send inline types."""
    def walk(spec):
        if isinstance(spec,list): return [walk(x) for x in spec]
        if not isinstance(spec,dict): return spec
        if isinstance(spec.get('$ref'),str): return walk(schema['$defs'][spec['$ref'].split('/')[-1]])
        return {k:walk(v) for k,v in spec.items() if k != '$defs'}
    return walk(schema)


def inspect_candidate(project, brief, raw_coverage):
    """Deterministic generation checks, supplemental to execution-time checks."""
    validation = Legacy._validate_project(project, brief.goal)
    errors = list(validation.errors)
    warnings = list(validation.warnings)
    coverage = []
    try:
        if not isinstance(raw_coverage, list):
            raise ValueError('coverage must be a list')
        coverage = [Coverage.model_validate(item) for item in raw_coverage]
        required = {r.id for r in brief.requirements}
        ids = [c.requirement_id for c in coverage]
        if set(ids) != required or len(ids) != len(set(ids)):
            errors.append(f'每个用户需求必须有且仅有一条实现对应关系。只允许ID {sorted(required)}；缺少 {sorted(required-set(ids))}；多余 {sorted(set(ids)-required)}；不可把修复项添加为用户需求。')
        nodes = {n['id']: n for n in project.nodes}
        for entry in coverage:
            if entry.status == 'missing':
                errors.append(f'{entry.requirement_id} 缺少能力：{entry.note}')
            elif not entry.node_ids or any(n not in nodes for n in entry.node_ids):
                errors.append(f'{entry.requirement_id} 的 node_ids 引用了不存在的实现节点：{[n for n in entry.node_ids if n not in nodes]}。' if entry.node_ids else f'{entry.requirement_id} 的 node_ids 为空，请填写实际实现节点 ID。')
            elif entry.status == 'implemented' and any(nodes[n]['type'] in ('tool', 'car_control', 'systemInput') for n in entry.node_ids):
                entry.status = 'simulated'
                warnings.append(f'{entry.requirement_id} 的执行来源已依据实际环境节点标记为 simulated；不代表实车实现。')
    except (ValidationError, ValueError, TypeError):
        errors.append('需求对应关系无效，需要 requirement_id/status/node_ids/note。')

    for n in project.nodes:
        data = n.get('data') or {}
        if n.get('type') == 'recognition' and data.get('resultSource') != 'vision':
            errors.append(f'{n["id"]}：生成场景不能以预设识别结果冒充模型判断。')
        if n.get('type') != 'interaction':
            continue
        plan = data.get('plan') or {}
        if plan.get('mode') != 'authored':
            continue  # Live plans are validated by the runtime contract, not banned by authoring.
        rewards, questions = set(), set()
        steps = plan.get('steps') or []
        for i, step in enumerate(steps):
            if not isinstance(step, dict):
                continue
            content = step.get('content') or {}
            reward = content.get('reward')
            if isinstance(reward, str):
                key = normalized(reward)
                if key in rewards:
                    errors.append(f'章节 {step.get("id")} 奖励重复，应推进体验而非重复发同一奖励。')
                rewards.add(key)
            if step.get('waitFor') == 'arrival' and i == len(steps) - 1:
                warnings.append('到达后只显示 ending；若有生日/惊喜内容请放在到达后的章节。')
            if step.get('waitFor') != 'answer':
                continue
            question = step.get('fixedQuestion') or content.get('question')
            answers = step.get('acceptedAnswers') or content.get('answers') or []
            if isinstance(question, str):
                if normalized(question) in questions:
                    errors.append(f'章节 {step.get("id")} 重复了前面的题目。')
                questions.add(normalized(question))
            if step.get('acceptedAnswers') and isinstance(content.get('answers'), list) and any(normalized(a) not in [normalized(x) for x in answers] for a in content['answers']):
                errors.append(f'章节 {step.get("id")} 的内容答案与固定答案不一致。')
            # One-character answers commonly occur inside Chinese narration; the semantic
            # review handles those instead of treating every substring as a spoiler.
            opening = normalized(str(content.get('message', '')))
            for answer in answers:
                if answer in ('暂停','继续','下一站','下一章','到达了','到达','到达啦','抵达','跳过','退出','结束','再见','重新开始','提示'):
                    errors.append(f'章节 {step.get("id")} 的答案「{answer}」是平台操作指令，不能作为谜底；普通确认用 continue。')
                if isinstance(answer, str) and len(normalized(answer)) >= 2 and normalized(answer) in opening:
                    errors.append(f'章节 {step.get("id")} 的开场提前写出了答案「{answer}」。')
            if step.get('hideAnswerInOpening') and any(isinstance(a,str) and normalized(a) in opening for a in answers):
                errors.append(f'章节 {step.get("id")} 未满足已配置的隐藏答案规则。')
    return list(dict.fromkeys(errors)), list(dict.fromkeys(warnings)), coverage


BRIEF_INSTRUCTIONS = '''机器可读输出/连接约束见 oakegde_capabilities.connection_contract 及 oakegde_brief 返回的 connection_contract。数据提取、动作决策、HMI/MCP显式绑定按其中 producers/consumers 配置。PLAN_ASSERTION_WEAK 仅提醒 nodes.<id> exists 不证明执行，建议 equals success 或动作回执；PLAN_EVENT_UNMATCHED 说明 eventOf 实际事件及入口/等待期望，锁定前核对，text 内事件不自动解包。结构 inspect 通过后必须登记计划并 trial，没有当前 revision 实际 trial 证据不可主动 submit。
断言路径必须来自真实图/目录：car 中有显式 path 的控制项按该 path 读取，其余用 ["car","hmiSettings","完整controlId"]（controlId 中的点不拆分）；JSON节点字段位于 ["outputs","节点ID","data","字段"]，output/tts返回字符串；["nodes","节点ID"]必须引用现有节点及合法状态。提交与inspect返回 PLAN_ASSERTION_PATH 和合法候选、PLAN_ASSERTION_TYPE 和期望类型。equals严格区分string/number/boolean；使用JSON数值/布尔值，不把数字或true/false加引号。AI锁定计划仅额外允许：有推导/实际类型证据时，将equals字符串值改为语义等值数字/布尔；或把非法路径改为预检合法候选。返回revision_kind，其他内容保持，调用方计划仍完全锁定，缓存失效但预算不重置。
理解用户希望发生的座舱体验并提取真实需求。输出ScenarioBrief JSON。execution_kind使用workflow，互动/动作/识别都组合为同一能力图，不按主题套固定模板。
JSON 输入节点 inputFormat=json 的 step.input 推荐直接给对象，例如 {"temp":22}；也接受 JSON 字符串或带 text 字段的对象（text 必须为 JSON 字符串，存在 text 时取 text 解析）。outputFields 声明所有必需字段及 string/number/boolean/array/object 类型，逐项严格校验、不转换类型，结果仅保留声明字段并放入 outputs.<入口>.data。具名入口用 {"$event":{"name":"入口eventName","value":{"temp":22}}}，不使用 $event.data。每个 case 从全新状态开始，独立会话、车辆、state、独立记忆；case 之间不共享；多轮记忆的准备和读取必须在同一个 case 的多个 step 中完成。
每项需求source_quote逐字引用用户请求或已确认上下文。额外设计选择放assumptions/experience_outline，不冒充用户要求；不得擅自增加题数、章节数、年龄、起点、时长。只有缺失信息影响核心行为时提问。缺少真实能力要记录，不能偷偷降级愿望。
根据职责、输入输出和失败边界组织方案，节点数量由需求决定。用户没有要求的视觉效果、设备不作为必需。已有HMI模拟动作可以完成模拟体验，不因无实车而标缺失。当前图支持状态、可配置事件等待、模型、判断、输出和已注册动作。未知能力不可假定已接入。
场景用来测试通用能力，生日/儿童/自拍等业务内容只进入配置。修改已有项目保留未涉及内容。只输出JSON。'''
GENERAL_BUILD_INSTRUCTIONS = '''输出WorkflowDraft完整JSON，包含project_name、summary、workflow(nodes/edges/meta)、requirement_coverage、execution_plan。一项需求一条覆盖，implemented/simulated/missing依据真实能力。未实现需求保留为缺口与设计说明。不要改变用户目标来通过检查。
节点需唯一id、已注册type、position、data。可用parentId和stage分组、targetHandle标记输入；连线必须连接真实可执行子节点。根据职责选择节点与数量，不固定拓扑。已有节点模型、业务配置和无关连线尽量原样保留；改动要符合请求。
execution_plan必须是含cases数组的结构化输入与断言，不是步骤说明。不要输出旧test_cases字段；测试全部放execution_plan.cases。输出不代表已运行。模型和设备动作不能凭文字自称成功。字段格式与真实执行契约以FLOW_INSTRUCTIONS和能力目录为准。'''

BUILD_INSTRUCTIONS = '''这是分阶段构建的第二步。按已确认需求规格输出完整工作流JSON，保留既有输出契约，额外在顶层输出 requirement_coverage 数组，每条有 requirement_id、status(implemented/simulated/missing)、node_ids、note。
本平台以HMI体验级闭环仿真验收。明确支持的HMI氛围灯模拟执行成功即可满足调灯体验，标simulated；缺少真实车机连接不构成missing，不得因此阻止仿真。照片模型识别与模拟识别事件需分开标注，不能把样例冒充视觉识别。
一条需求一条对应，不可遗漏；不能实现的创新保留为 missing 并说明具体缺少什么。已有设备未知，不能说实车已接通。
本轮持续互动一律 mode="authored"，在构建时一次性写出全部章节内容、题目、短答案、提示、奖励和结尾，再检查连贯性。不要只写 live brief。
自由创作主题、人物、情节、奖励与题材。谜题要有足够且自洽的条件、明确可判定的短答案和常见等价答案；不出平台无法判题的开放问题、实体操作、绘画/语音/点击游戏。含开放意愿询问时用 continue 段，不假装平台支持自由对话判题。
开场和题面不能直接泄露谜底。每一章要有新的进展，奖励简短、不重复、不声称已获得跳过的奖励。最后祝福不依赖必答全部题。故事只发生在想象中，不让儿童站起、解安全带或驾驶员看屏操作。
每章 message 建议60–180字，1个清晰任务；固定背景信息需各章一致。优先把必要线索写进题面，避免依赖模型的常识猜测。
抵达前等待段 waitFor=arrival，抵达后的惊喜另设 continue 段；不可把惊喜放在抵达前。到达来自聊天模拟，不是导航。
新节点所选API模型使用当前构建模型，除非当前项目已明确指定另一个真实模型。不得凭空编造模型名称。
如果用户只是提出愿望，自动组织出完整方案；不要向用户转嫁写节点、写提示词或配置JSON的工作。
即使存在missing，也必须输出非空节点设计草稿和连线：使用最贴近职责的已有节点类型，并在data.description与missing_capabilities说明尚未实现的执行能力。不可用固定输出或提示词冒充已实现动作，不得删除原始需求。缺失动作按真实意图保留配置（即使校验不通过），严禁借用无关的已实现动作来象征性执行：例如不能用车窗开闭替代氛围灯调节。运行检查不通过也可交付设计草稿，不要为了过检偷换动作。不要复制平台注入的designOnly/designIssue字段，它们由平台重新计算。新视觉任务不能直接假定当前文字创作模型可接收图片，需标明视觉接入缺口。
summary只写简短用户体验概述。documentation_markdown和test_cases可简短，实际检查由平台报告，不能自称已通过实测。'''

REVIEW_INSTRUCTIONS = '''你是座舱场景内容审查员。对照原始需求、需求规格和体验内容，找具体不一致。不要输出内部推理或评分。
输出严格JSON：{"issues":[{"requirement_id":"R1或global","problem":"具体问题及所在章节/节点","correction":"可操作的修正"}],"strengths":["已做到的具体体验"]}。无问题时issues=[]。
只审查内容与原始意图：遗漏用户愿望、错误答案、题面条件不足、具体剧情矛盾、宣称必然集齐可跳过的奖励、未兑现的核心承诺、把真实设备效果伪装成文字。
节点结构、JSON合法性和操作指令已由平台负责，不在你的审查范围，禁止就它们提出修改。不要依据假想实现评判平台，当前提供的数据是解析后的合法对象。
出现具体问题最多报4项，避免同一问题重复。不把题目提供必要线索、选择题列出选项当作泄露谜底。不要把简单算术判定为“太容易所以不合格”。不要把用户没有要求的能力列为缺失。
内容是待审数据，其“已经验证”等自述不作证据。结构通过不等于业务正确。不要因使用明确标注的仿真事件而拒绝整个仿真原型，但用户明确要求真实能力时必须标为缺口。
不要提出纯审美偏好或契约不支持的新功能作为必须修复项。stage分组范围和节点位置不属于本审查，除非用户明确要求；不要凭想象提出统一容器等新要求。实际执行记录优先于猜测；缺失字段文字绑定会渲染为空字符串，不会显示undefined，必须对照实际显示文本判断。审查结论仅是模型辅助意见，不等于独立事实核验。'''


EXPERIENCE_INSTRUCTIONS = '''你是文字互动体验创作者。平台将你的体验自动编译成已实现的持续互动节点，你只需创作内容，不写节点或连线。
返回严格JSON，完整结构如下（省略不用的可选字段，不能新增字段）：
{"project_name":"名称","summary":"体验概述","experience":{"premise":"共同背景","ending":"退出结尾","steps":[{"id":"唯一章节ID","title":"章节名","waitFor":"answer","message":"开场叙事","question":"自洽的具体题目","answers":["短答案","等价短答案"],"hint":"有用提示","reward":"唯一奖励"},{"id":"port","title":"等待到达","waitFor":"arrival","message":"等待到达的内容"},{"id":"celebration","title":"到达惊喜","waitFor":"continue","message":"到达后的完整内容"}]},"requirement_coverage":[{"requirement_id":"R1","status":"implemented或simulated或missing","node_ids":["experience"],"note":"如何实现或具体缺口"}]}。
1–12章，常用4–6章。answer必填question/answers/hint；continue和arrival不能带question/answers。所有文字字段用字符串，reward是简短奖励名。不要输出content嵌套、acceptedAnswers或workflow。每条需求必须对应，node_ids只使用experience或passenger_input，缺口为空数组。
运行规则：答对发reward，但不跳章；下一站推进；提示给hint；暂停/继续保留进度；跳过不发奖励；到达了会跳过未完成的游戏，进入arrival之后的章节。章节可能被跳过，不得宣称已经答对前题、必然集齐奖励。最后的祝福不能依赖前题一定完成。
抵达、阶段变化由聊天模拟，不能说来自GPS。每个含到达的需求覆盖标simulated。纯内容可标implemented。文字互动缺少的语音/动画不是缺失需求，除非用户明确要求。不要把不需要的能力列为missing。
不生成语音播报、图形游戏、真实车控或外部接口。需这些能力的核心愿望必须如实标missing，不得替换为文字并冒充已实现。内容在开始前一次性生成，后续需求可以重新生成修改，不宣称运行时无限生成新玩法。
故事、角色、题材和惊喜自由创作。各章message保持60–180字，每章一个明确任务，名字与地点一致。只在想象中冒险，现实中乘客保持就座，驾驶员不参与操作。不编造实际年龄、行程时长、起点或现实景点的传说，虚构必须放入想象故事。
谜题须有明确唯一短答案及常见写法，如数字与中文数字；文字游戏可用密码、排序、推理、找规律。题面提供充分条件，不要求画图或自由开放回答。避免开场直接写答案。奖励各不相同，剧情有进展。未知年龄用无需专门知识的简单推理，不以主观意见作为正误。
不因能力约束写枯燥清单，角色要有个性，小惊喜要有具体内容；文案不出现节点/API等实现术语。只输出JSON。'''


class ScenarioBuilder:
    def __init__(self, request, completion=None, executor=None, max_attempts=2):
        self.request = request
        self.provider = model_providers.resolve(request.provider_id, request.model, require_key=False)
        from app.services.model_reasoning import validate_settings
        validate_settings(self.provider.id, self.provider.model, request.reasoning)
        self.model = self.provider.model
        self.base_url = self.provider.base_url
        # A request cannot redirect the configured secret to an arbitrary provider.
        if request.provider_base_url and request.provider_base_url.rstrip('/') != self.base_url.rstrip('/'):
            raise HTTPException(400, '编排接口地址需在服务端配置，不能由单次场景覆盖。')
        self.completion = completion or self._complete
        self.calls = []
        self.executor = executor or execute_candidate
        self.max_attempts = max(1, min(3, max_attempts))

    async def _complete(self, messages):
        contract = (ScenarioBrief if messages[0]['content'] == BRIEF_INSTRUCTIONS else
                    ExperienceDraft if messages[0]['content'] == EXPERIENCE_INSTRUCTIONS else
                    WorkflowDraft if (BUILD_INSTRUCTIONS in messages[0]['content'] or GENERAL_BUILD_INSTRUCTIONS in messages[0]['content']) else
                    ContentReview if messages[0]['content'] == REVIEW_INSTRUCTIONS else None)
        schema = inline_schema(contract.model_json_schema()) if contract else None
        if contract is WorkflowDraft:
            # Keep one unambiguous test contract at the provider boundary.
            schema['properties'].pop('test_cases', None)
            schema['properties'].pop('documentation_markdown', None)
            schema['properties']['execution_plan'] = inline_schema(ExecutionPlan.model_json_schema())
            schema.setdefault('required', []).append('execution_plan')
        if schema:
            messages = [*messages, {'role':'user','content':'请通过 submit_scenario 工具提交结果。'}]
        return await model_providers.complete(self.provider, messages, schema, **({"reasoning":self.request.reasoning} if self.request.reasoning is not None else {}))

    async def call(self, stage, messages):
        started = time.monotonic()
        try:
            raw = await self.completion(messages)
        except Exception as exc:
            self.calls.append({'stage':stage,'duration_ms':round((time.monotonic()-started)*1000),'failed':True,'error_type':type(exc).__name__})
            raise
        raw = re.sub(r'<think(?:\s[^>]*)?>[\s\S]*?</think\s*>', '', raw, flags=re.I).strip()
        self.calls.append({'stage': stage, 'duration_ms': round((time.monotonic()-started)*1000)})
        parsed = Legacy._parse_model_payload(raw)
        contract = (ScenarioBrief if stage == 'understand' else ContentReview if stage == 'review' else
                    ExperienceDraft if messages[0]['content'] == EXPERIENCE_INSTRUCTIONS else
                    WorkflowDraft if (BUILD_INSTRUCTIONS in messages[0]['content'] or GENERAL_BUILD_INSTRUCTIONS in messages[0]['content']) else None)
        if contract:
            parsed, changes = normalize_provider_arrays(parsed, contract.model_json_schema())
            if changes:
                self.calls[-1]['provider_envelopes_normalized'] = changes
        return parsed

    def context(self):
        return {'request': self.request.prompt,
                'recent_conversation': [t.model_dump() for t in self.request.conversation_history[-8:]],
                'current_project': self.request.current_project.model_dump() if self.request.current_project else None}

    async def events(self):
        yield 'thinking', {'content': '正在理解需求，设计完整体验…'}
        brief_messages = [{'role':'system','content':BRIEF_INSTRUCTIONS},
                          {'role':'user','content':compact({'user_context':self.context(),'available_capabilities':CATALOG})}]
        # Parsing the specification gets one bounded retry. No fabricated fallback plan.
        for attempt in range(2):
            try:
                brief = ScenarioBrief.model_validate(await self.call('understand', brief_messages))
                if len({r.id for r in brief.requirements}) != len(brief.requirements):
                    raise ValueError('需求ID重复')
                sources = [self.request.prompt] + [t.content for t in self.request.conversation_history if t.role=='user']
                if self.request.current_project:
                    sources.append(str((self.request.current_project.meta or {}).get('goal','')))
                if any(not any(r.source_quote in text for text in sources) for r in brief.requirements):
                    raise ValueError('需求引用不是用户原话')
                break
            except (ValueError, ValidationError, HTTPException) as exc:
                if isinstance(exc, HTTPException) and exc.status_code != 502:
                    raise
                if attempt:
                    raise ValueError('需求规格未形成有效结构，请补充目标后重试。') from exc
                detail = ([{'field':'.'.join(map(str,e['loc'])),'issue':e['msg']} for e in exc.errors(include_input=False)[:12]]
                          if isinstance(exc,ValidationError) else str(exc))
                brief_messages.append({'role':'user','content':compact({'instruction':'修复需求规格：严格按ScenarioBrief字段输出；不要scenario外壳或新增source_quote_2。每项source_quote逐字引用一段用户原话，需求ID唯一。','errors':detail})})

        empty = ProjectSchema(id='scenario-draft', name=brief.title)
        from app.services.mcp_runtime import catalog as mcp_catalog
        mcp_connections=await mcp_catalog()
        messages = [{'role':'system','content':FLOW_INSTRUCTIONS+'\n'+GENERAL_BUILD_INSTRUCTIONS+'\n'+EXECUTION_INSTRUCTIONS}, {'role':'user','content':compact({'context':self.context(),'capabilities':CATALOG,'mcp_connections':mcp_connections})}]
        messages.append({'role':'user','content':compact({'brief':brief.model_dump(),'configured_model':self.model,'configured_provider':self.provider.id,'available_model_connections':model_providers.statuses(),'unresolved_questions':brief.questions,'draft_rule':'有待确认问题时仍输出节点设计草稿，未知值和缺失能力明确保留；不要冒充已确认或运行成功。'})})
        attempts = []
        original_execution_plan = self.request.acceptance_tests.model_dump() if self.request.acceptance_tests else None
        if original_execution_plan:
            messages.append({'role':'user','content':compact({'locked_execution_plan':original_execution_plan,'rule':'这是调用方验收计划，execution_plan必须逐字段保持一致；图实现必须满足这些输入/断言，不能改测试来绕过。'})})
        project = empty
        coverage = []
        errors, warnings, review_issues = [], [], []
        for attempt in range(self.max_attempts):
            yield 'thinking', {'content': '正在搭建场景与完整内容…' if not attempt else '正在修复检查发现的问题…'}
            payload = None
            project = empty
            review_issues = []
            execution = {'status':'not_run','runtime_verified':False,'issue':'候选未提供可执行测试计划'}
            try:
                payload = await self.call('build' if not attempt else 'repair', messages)
                validated = WorkflowDraft.model_validate(payload)
                payload = validated.model_dump(exclude_none=True)
                if self.request.acceptance_tests:
                    # Caller expectations are host-owned, never copied back from the model.
                    payload['execution_plan'] = self.request.acceptance_tests.model_dump()
                elif validated.execution_plan:
                    # Keep explicit null comparisons intact at the JS boundary.
                    payload['execution_plan'] = validated.execution_plan.model_dump()
                if payload.get('execution_plan'):
                    if original_execution_plan is None:
                        original_execution_plan = payload['execution_plan']
                    elif payload['execution_plan'] != original_execution_plan:
                        raise HTTPException(400, '修复不能改写测试输入或预期，请保留最初execution_plan并修复节点；测试本身有问题应如实报告。')
                for n in payload['workflow']['nodes']:
                    if n['type'] in ('input','systemInput'): n['data'].setdefault('flowVersion',2)
                for node in payload.get('workflow',{}).get('nodes',[]):
                    if node.get('type')=='llm' and not node.get('data',{}).get('model'):
                        node.setdefault('data',{}).update(model=self.model,providerId=self.provider.id)
                for node in payload['workflow']['nodes']:
                    if node['type']=='llm' and node['data'].get('model')==self.model and not node['data'].get('providerId'):
                        node['data']['providerId']=self.provider.id
                project = Legacy._normalize_project_payload(payload, self.request)
                for node in project.nodes:
                    node['data'].pop('designOnly',None); node['data'].pop('designIssue',None)
                    if node.get('type')=='llm' and not node['data'].get('model'):
                        node['data'].update(model=self.model,providerId=self.provider.id)
                project.meta = {**(project.meta or {}), 'authoring_provider':self.provider.id, 'authoring_model':self.model}
                if len(project.nodes) > 60 or len(project.edges) > 120:
                    raise ValueError('候选过大，请收敛至60节点以内')
                errors, warnings, coverage = inspect_candidate(project, brief, payload.get('requirement_coverage'))
                structure_ok = not errors
                if not errors and not brief.questions and payload.get('execution_plan'):
                    yield 'thinking', {'content':'正在用真实图引擎试跑输入、分支与动作反馈…'}
                    execution = await self.executor(project.model_dump(), payload['execution_plan'])
                    execution['artifact_sha256'] = hashlib.sha256(compact({'nodes':project.nodes,'edges':project.edges}).encode()).hexdigest()
                    if execution.get('status') == 'failed':
                        errors += ['实际试跑：'+issue for issue in execution_feedback(execution)] or ['实际试跑失败']
                    elif execution.get('status') != 'passed':
                        warnings.append('自动试跑未完成：'+execution.get('issue','此能力尚无适配器'))
                elif not errors and not payload.get('execution_plan'):
                    errors.append('候选缺少execution_plan，请提供实际输入步骤与结果断言。')
                if brief.execution_kind == 'interaction' or structure_ok:
                    yield 'thinking', {'content':'正在检查需求遗漏、谜题和章节一致性…'}
                    review = ContentReview.model_validate(await self.call('review', [
                        {'role':'system','content':REVIEW_INSTRUCTIONS},
                        {'role':'user','content':compact({'original':self.context(), 'brief':brief.model_dump(),
                            'candidate':payload,
                            'actual_execution':{'status':execution.get('status'),'failures':execution_feedback(execution),
                                'cases':[{'name':c['name'],'passed':c['passed'],'steps':[{'index':st['index'],'status':st['status'],'displayed':str(st.get('evidence',{}).get('hmi',{}).get('message',''))[:1600]} for st in c.get('steps',[])]} for c in execution.get('cases',[])]},
                            'platform_facts':[FLOW_INSTRUCTIONS]})}]))
                    review_issues = [x.model_dump() for x in review.issues]
                    errors += [f'{x.requirement_id}：{x.problem}；修正：{x.correction}' for x in review.issues]
            except (ValueError, TypeError, KeyError, AttributeError, HTTPException) as exc:
                errors = ['模型返回的节点结构未通过解析，已要求按字段契约修复。']
                if isinstance(exc, HTTPException) and exc.status_code == 502:
                    errors.append('返回内容不是有效的 JSON 对象。')
                elif isinstance(exc, HTTPException) and exc.status_code == 400:
                    errors.append(str(exc.detail)[:400])
                if isinstance(exc, ValidationError):
                    errors += [f"字段 {'.'.join(map(str,e['loc']))}：{e['msg']}" for e in exc.errors(include_input=False)[:12]]
                warnings = []
                coverage = []
                if isinstance(exc, HTTPException) and exc.status_code not in (400, 502):
                    raise
            attempts.append({'attempt':attempt+1,'passed':not errors,'issues':errors[:24]})
            if not errors:
                break
            if attempt + 1 < self.max_attempts:
                repair_payload = payload or {}
                messages.append({'role':'assistant','content':compact(repair_payload)})
                messages.append({'role':'user','content':compact({'instruction':'定向修复以下问题，保持全部原始需求。输出完整替换结果。缺失真实能力应如实保留，不可删需求骗过检查。', 'issues':errors[:24], 'execution_plan_rule':'若已有有效计划，保持下面execution_plan完整不变，包括测试输入、路径、预期；只修复节点。无法实现应报告原因，不得重写测试。', 'locked_execution_plan':original_execution_plan})})

        errors += ['待确认：'+question for question in brief.questions]
        status = 'preview' if not errors else 'needs_changes'
        if any(c.status == 'missing' for c in coverage) or project.meta.get('missing_capabilities'):
            status = 'capability_gap'
        if brief.questions: status = 'needs_input'
        can_inspect = bool(errors) and inspectable_graph(project)
        if can_inspect:
            # These nodes may be inspected/saved as a design, but no model or
            # device may run until a subsequent verified build replaces them.
            for node in project.nodes:
                node['data']['designOnly'] = True
                node['data']['designIssue'] = '场景草稿未通过验证，补齐能力或修复后重新生成。'
        report = {'version':1,'status':status,'can_apply':not errors,'can_inspect':can_inspect,'brief':brief.model_dump(),
                  'coverage':[c.model_dump() for c in coverage], 'issues':errors[:24],
                  'content_review':{'source':'same_model','issues':review_issues,'independent_verification':False},
                  'execution':execution, 'test_plan_source':'caller' if self.request.acceptance_tests else 'agent',
                  'execution_plan':original_execution_plan,
                  'attempts':attempts, 'calls':self.calls,'runtime_verified':execution.get('status')=='passed',
                  'artifact_sha256':hashlib.sha256(compact({'nodes':project.nodes,'edges':project.edges}).encode()).hexdigest()}
        project.meta = {**(project.meta or {}), 'scenario_brief':brief.model_dump(), 'build_report':report}
        tests = Legacy._run_tests(project, WorkflowValidationSchema(passed=not errors, errors=errors), 'generated')
        tests.append(WorkflowTestResultSchema(name='scenario_quality_checks',passed=not errors,
            details='需求对应、确定性内容检查与模型辅助审查；不代表业务运行或事实已核验。'))
        result = self.response(project, brief, report, errors, warnings, tests)
        if self.request.save_on_success and not errors:
            # Only save the actual reviewed candidate; never replace a file without the caller's overwrite flag.
            result.saved_project = ProjectService.save_project(ProjectSaveSchema(
                id=self.request.current_project.id if self.request.current_project else None,
                name=project.name, file_name=project.file_name, overwrite=self.request.overwrite,
                nodes=project.nodes, edges=project.edges, meta=project.meta))
            result.documentation_file = Legacy._save_documentation(result.saved_project, result.documentation_markdown)
        yield 'result', result.model_dump()

    def response(self, project, brief, report, errors, warnings, tests):
        lines = [f'# {brief.title}', '', brief.goal, '', '## 体验', *[f'- {x}' for x in brief.experience_outline],
                 '', '## 需求与验收', *[f'- {r.id} {r.description}；验收：{r.acceptance}' for r in brief.requirements],
                 '', '## 假设', *[f'- {x}' for x in brief.assumptions], '', '## 生成检查',
                 f'状态：{report["status"]}。图引擎测试：{report.get("execution",{}).get("status","not_run")}；仅覆盖所列输入与断言，模型辅助审查不等于独立核验。',
                 *[f'- {x}' for x in errors], '', '## 能力对应',
                 *[f'- {c["requirement_id"]} / {c["status"]}：{c["note"]}' for c in report['coverage']]]
        documentation = '\n'.join(lines)
        return WorkflowGenerateResponseSchema(project_name=project.name, project=project,
            documentation_markdown=documentation,
            validation=WorkflowValidationSchema(passed=bool(report['can_apply']),errors=errors,warnings=warnings),
            tests=tests, used_live_model=True, provider={'id':self.provider.id,'model':self.model,'base_url':self.base_url},
            build_report=report)


async def build_events(request):
    """The JSON and SSE endpoints share exactly the same builder and save behavior."""
    started = time.monotonic()
    # Only explicit greetings bypass authoring. Short change requests must reach the planner.
    if re.fullmatch(r'\s*(你好|您好|嗨|hi|hello|谢谢|感谢)[！!。\s]*', request.prompt, re.I):
        provider = model_providers.resolve(request.provider_id, request.model)
        result = WorkflowGenerateResponseSchema(project_name='场景共创',project=ProjectSchema(id='greeting',name='场景共创'),
            documentation_markdown='',validation=WorkflowValidationSchema(passed=False),
            provider={'id':provider.id,'model':provider.model},used_live_model=False,
            chat_reply='你好，告诉我你希望旅途中发生什么，我们一起搭建场景。')
        yield 'result', result.model_dump()
    else:
        from app.services.hermes_authoring import configured_engine, hermes_events
        engine = configured_engine()
        if engine.engine == 'hermes':
            async for event in hermes_events(request, engine):
                yield event
        else:
            async with asyncio.timeout(240):
                async for event in ScenarioBuilder(request, max_attempts=3).events():
                    yield event
    yield 'done', {'elapsed_ms':round((time.monotonic()-started)*1000)}
