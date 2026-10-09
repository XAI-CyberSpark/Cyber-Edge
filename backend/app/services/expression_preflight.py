"""Inspect expressions using Studio's existing pure-data parser, without evaluation."""
import json
from pathlib import Path
import re
import subprocess

ROOT=Path(__file__).resolve().parents[3]

def expression_issues(nodes,plan=None):
    expressions=[];issues=[]
    ids=[n['id'] for n in nodes if n.get('type')!='stage']
    for node in nodes:
        if node.get('type')!='logic':continue
        data=node.get('data') or {}
        # Runtime prefers legacy script when present; preserve that precedence.
        field='script' if data.get('script') else 'condition';code=data.get(field)
        if not isinstance(code,str) or not code.strip():continue
        # Values will be bound at execution; validate only the surrounding syntax now.
        parsed=re.sub(r'\{\{\s*([A-Za-z0-9_.]+)\s*\}\}','undefined',code)
        expressions.append({'path':f"{node['id']}.data.{field}",'actual':code,'code':parsed})
    if plan:
        for i,case in enumerate(plan.cases):
            for j,step in enumerate(case.steps):
                for k,a in enumerate(step.assertions):
                    path=f'plan.cases[{i}].steps[{j}].assertions[{k}]'
                    if a.path[0]=='outputs' and len(a.path)>1 and a.path[1] not in ids:
                        issues.append(f'{path}.path 收到 {a.path!r}：outputs引用的执行节点不存在：{a.path[1]}；示例 ["outputs","{ids[0] if ids else "实际节点ID"}"]。')
                    if a.op=='satisfies':expressions.append({'path':path+'.value','actual':a.value,'code':a.value,'outputRoot':a.path==['outputs']})
    if not expressions:return issues
    try:
        result=subprocess.run(['node',str(ROOT/'studio/scripts/inspect-expressions.mjs')],
            input=json.dumps({'expressions':expressions,'nodeIds':ids}),text=True,capture_output=True,timeout=10,check=True)
        errors=json.loads(result.stdout)
    except (OSError,subprocess.SubprocessError,ValueError):
        return issues+['表达式静态检查不可用，请检查Studio的Node/esbuild依赖；未执行图或模型。']
    for error in errors:
        issues.append(f"{error['path']} 收到 {error['actual']!r}：{error['error']}；表达式根仅input/value（undefined为常量），不支持裸state/event/outputs。示例 input.state.count > 0；satisfies的input是path选中的值，例如path=[\"outputs\"]时使用input.{ids[0] if ids else '实际节点ID'}.text === \"完成\"。跨节点绑定示例 {{\"$ref\":\"outputs.{ids[0] if ids else '实际节点ID'}.text\"}}，引用节点必须存在。")
    return issues
