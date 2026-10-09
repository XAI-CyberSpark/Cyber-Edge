"""Data contract for model-authored or caller-supplied graph acceptance tests."""
from typing import Any, Literal
from pydantic import BaseModel, ConfigDict, Field, model_validator

class Contract(BaseModel):
    model_config = ConfigDict(extra='forbid', allow_inf_nan=False)

class ExecutionAssertion(Contract):
    path: list[str] = Field(min_length=1, max_length=16, description='真实证据路径；车控按目录path，否则["car","hmiSettings","完整controlId"]；JSON输出为["outputs","节点ID","data","字段"]；节点状态为["nodes","节点ID"]。提交/inspect检查路径与类型。')
    op: Literal['equals', 'contains', 'exists', 'not_exists', 'gte', 'lte', 'satisfies']
    value: Any = None

    @model_validator(mode='after')
    def check_evidence_path(self):
        roots={'run','state','car','hmi','nodes','outputs','messages','actions'}
        if self.path[0] not in roots:
            raise ValueError('断言必须引用实际证据根字段：'+', '.join(sorted(roots)))
        if self.path[0]=='run' and len(self.path)==1 and self.op=='equals' and not isinstance(self.value,dict):
            raise ValueError('run是结果对象；状态断言请用path=["run","status"]或步骤status字段')
        if self.op in ('exists','not_exists') and self.value is not None:
            raise ValueError('exists/not_exists只检查存在与否，不接收value')
        if self.op == 'satisfies' and (not isinstance(self.value, str) or not self.value.strip() or len(self.value) > 8000):
            raise ValueError('satisfies需要1–8000字符的纯数据布尔表达式，input代表path选中的实际值')
        return self

class ExecutionStep(Contract):
    input: Any = Field(description='JSON入口推荐直接对象，如 {"temp":22}；也接受JSON字符串或text字符串包装。outputFields为必需字段与严格类型；具名事件载荷放$event.value。')
    event_id: str | None = Field(default=None, max_length=100)
    status: Literal['completed', 'waiting', 'paused', 'failed'] | None = Field(default=None, description='一般不要写status；省略或null表示not_failed，waiting也可通过，但仍检查实际值断言。只有用例本意就是断言该步必须结束/必须等待等状态时才显式填写。')
    assertions: list[ExecutionAssertion] = Field(default_factory=list, max_length=20)

class InitialControl(Contract):
    control: str = Field(min_length=1, max_length=100)
    value: Any

class ExecutionCase(Contract):
    name: str = Field(min_length=1, max_length=120)
    weather: str = Field(default='sunny', max_length=50)
    controls: list[InitialControl] = Field(default_factory=list, max_length=53)
    steps: list[ExecutionStep] = Field(min_length=1, max_length=30)

class ExecutionPlan(Contract):
    cases: list[ExecutionCase] = Field(min_length=1, max_length=6)
