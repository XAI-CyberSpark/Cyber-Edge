"""Read-only plan checks shared with the production TS input contract."""
import json
from pathlib import Path
import subprocess

ROOT=Path(__file__).resolve().parents[3]

class PlanContractError(ValueError):
    def __init__(self, diagnostics):
        self.diagnostics=diagnostics
        super().__init__('；'.join(d['message'] for d in diagnostics)+'；无效计划未锁定。')

def inspect_test_plan(project, plan):
    if not plan:return {'errors':[], 'warnings':[]}
    project=project.model_dump() if hasattr(project,'model_dump') else project
    plan=plan.model_dump() if hasattr(plan,'model_dump') else plan
    try:
        result=subprocess.run(['node',str(ROOT/'studio/scripts/inspect-test-plan.mjs')],
            input=json.dumps({'project':project,'plan':plan},ensure_ascii=False,allow_nan=False),
            text=True,capture_output=True,timeout=10,check=True)
        return json.loads(result.stdout)
    except (OSError,subprocess.SubprocessError,ValueError):
        return {'errors':[{'category':'graph_logic','code':'PLAN_PREFLIGHT_UNAVAILABLE','path':'plan',
            'message':'测试输入静态检查不可用，请检查Studio的Node/esbuild依赖；未执行图或模型。'}],'warnings':[]}
