#!/usr/bin/env python3
"""Versioned scenario acceptance suite: validate, live run, report/review, compare.

Use backend/.venv_macos/bin/python. Live calls only on explicit `run` command.
Every run has a new directory; no user project is saved or overwritten.
"""
from __future__ import annotations
import argparse
import asyncio
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import subprocess
import sys
import time
import uuid

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'backend'))
from app.services.scenario_benchmark import digest,validate_suite,check_candidate,manual_review,verdict
SUITE=ROOT/'benchmarks/scenarios/cases.json'
SOURCES=['backend/app/services/scenario_builder.py','backend/app/services/model_providers.py','backend/app/services/orchestration_service.py','backend/app/services/node_capability_service.py','backend/app/services/interaction_contract.py','backend/app/services/node_capabilities.json','backend/app/services/scenario_benchmark.py','studio/src/utils/GraphEngine.ts','studio/src/domain/scenarioSession.ts','studio/src/domain/scenarioRehearsal.ts','studio/src/domain/nodeCapabilities.ts','studio/scripts/scenario-benchmark-runtime.ts','scripts/scenario_benchmark.py']


def load(path):return json.loads(Path(path).read_text())
def write(path,data):Path(path).write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n')
def stamp():return datetime.now(timezone.utc).isoformat()
def fingerprint():return digest({p:hashlib.sha256((ROOT/p).read_bytes()).hexdigest() for p in SOURCES})

def runtime(project,profile,directory):
    if profile=='none':return {'status':'not_required','checks':[]}
    request=directory/'runtime-input.json';write(request,{'project':project,'profile':profile})
    try:
        p=subprocess.run(['node',str(ROOT/'studio/scripts/scenario-benchmark-runtime.mjs'),str(request)],capture_output=True,text=True,timeout=30)
        if p.returncode:return {'status':'not_supported','issue':'离线执行器未完成，不能记为通过','checks':[]}
        return json.loads(p.stdout)
    except (OSError,subprocess.TimeoutExpired,ValueError):return {'status':'not_supported','issue':'离线执行器不可用或输出无效','checks':[]}


def summarize(document):
    rows=document['results'];attempted=[r for r in rows if r.get('error')!='not_configured']
    return {'selected':len(rows),'attempted':len(attempted),'blocked':sum(r['status']=='blocked' for r in rows),
            'automatic_pass':sum(bool(r['checks']) and all(c['status']=='pass' for c in r['checks']) and r['runtime']['status'] in ('passed','not_required') and not r.get('error') for r in rows),
            'failed':sum(r['status']=='failed' for r in rows),'needs_review':sum(r['status']=='needs_review' for r in rows),
            'accepted':sum(r['status']=='accepted' for r in rows)}


def render(document,directory):
    stats=summarize(document);document['summary']=stats;write(directory/'report.json',document)
    text=['# 场景编排验收报告','',f'模式：{document["mode"]}；套件：{document["suite_version"]}；模型：{document.get("provider","—")} / {document.get("model","—")}；开始时间：{document["started_at"]}。',
          '',f'选中 {stats["selected"]} 次，实际尝试 {stats["attempted"]} 次；自动检查通过 {stats["automatic_pass"]} 次，发现失败 {stats["failed"]} 次，待评审 {stats["needs_review"]} 次，缺少配置 {stats["blocked"]} 次，完整验收通过 {stats["accepted"]} 次。',
          '', '**自动检查通过不等于体验准确。** 人工内容评审、真实视觉和真实设备没有验证时，不计完整验收通过。一次抽样不代表稳定成功率。',
          '', '| 案例 | 名称 | 次数 | 结论 | 自动检查 | 运行 | 耗时 |','| --- | --- | --- | --- | --- | --- | --- |']
    labels={'failed':'发现问题','blocked':'缺少配置','needs_review':'待人工评审','accepted':'完整通过','reference_only':'仅参考实现'}
    for r in document['results']:
        text.append(f'| {r["case_id"]} | {r["title"]} | {r["repeat"]} | {labels[r["status"]]} | {sum(c["status"]=="pass" for c in r["checks"])}/{len(r["checks"])} | {r["runtime"]["status"]} | {r["duration_seconds"]:.1f}s |')
    for r in document['results']:
        text.extend(['',f'## {r["case_id"]} / 第 {r["repeat"]} 次','',f'预期：{r["expected"]}；模型产物：{r.get("observed","未返回")}；完整结论：{labels[r["status"]]}。'])
        if r.get('error'):text.append(f'调用记录：{r["error"]}。原始错误正文不记录，避免暴露凭据。')
        text.extend('- '+c['detail'] for c in r['checks'] if c['status']=='fail')
        if r['runtime'].get('issue'):text.append('- 运行：'+r['runtime']['issue'])
        if r['runtime'].get('scope'):text.append('- 测试范围：'+r['runtime']['scope'])
        text.append('- 待人工检查：'+'；'.join(x['criterion'] for x in r['manual'] if x['status']=='pending'))
        if r.get('artifact'):text.append(f'- [原始生成结果]({r["artifact"]})')
    text.extend(['','## 证据边界','', '需求/规则来自版本化验收草案，未由生成模型提供。生成请求只包含案例用户原话，不包含参考答案、验收规则或参考图。未保存到项目库，也未对失败候选人工修稿。',
                 '',f'案例集合校验：`{document["suite_sha256"]}`；生成与评测代码校验：`{document["source_sha256"]}`。工作区为未提交状态，校验用于本次比较，不能替代Git快照。'])
    (directory/'REPORT.md').write_text('\n'.join(text)+'\n')


async def run(args,suite):
    from app.services.scenario_builder import build_events
    from app.services.model_providers import resolve
    from app.schemas.orchestration_schema import WorkflowGenerateRequestSchema
    ids=set(args.cases.split(','));cases=suite['cases'] if args.cases=='all' else [x for x in suite['cases'] if x['id'] in ids]
    if args.cases!='all' and ids!={x['id'] for x in cases}:raise ValueError('Unknown case ID')
    if not 1<=args.repeat<=5:raise ValueError('repeat must be between 1 and 5')
    provider=resolve(args.provider,args.model,require_key=False)
    directory=ROOT/'.demo-runtime/scenario-benchmarks'/f'{datetime.now().strftime("%Y%m%d-%H%M%S")}-{uuid.uuid4().hex[:8]}'
    directory.mkdir(parents=True)
    document={'schema_version':1,'mode':'live','suite_id':suite['suite_id'],'suite_version':suite['version'],'suite_sha256':digest(suite),
              'source_sha256':fingerprint(),'started_at':stamp(),'provider':provider.id,'model':provider.model,'results':[]}
    write(directory/'cases.json',suite);review_templates=[]
    for case in cases:
        for repeat in range(1,args.repeat+1):
            start=time.monotonic();target=directory/f'{case["id"]}-{repeat}';target.mkdir()
            result=None;error=None
            print(f'{case["id"]} #{repeat}: {case["title"]}',flush=True)
            if not provider.api_key:error='not_configured'
            else:
                try:
                    async for event,data in build_events(WorkflowGenerateRequestSchema(prompt=case['prompt'],provider_id=provider.id,model=provider.model,save_on_success=False)):
                        if event=='result':result=data
                    if result is None:error='no_result'
                except Exception as exc:
                    # Store classification, never provider error bodies or request headers.
                    error='timeout' if isinstance(exc,TimeoutError) else type(exc).__name__
            artifact_hash=digest(result) if result else None
            checks=check_candidate(case,result) if result else []
            executed=runtime(result['project'],case['runtime_profile'],target) if result and all(c['status']=='pass' for c in checks) else {'status':'not_run','checks':[],'issue':'生成或静态检查未通过，未执行候选'}
            manual=manual_review(case,artifact_hash,None)
            row={'case_id':case['id'],'case_sha256':digest(case),'title':case['title'],'repeat':repeat,'expected':case['expected'],
                 'observed':(result or {}).get('build_report',{}).get('status'),'duration_seconds':round(time.monotonic()-start,2),
                 'checks':checks,'runtime':executed,'manual':manual,'artifact_sha256':artifact_hash,'error':error,
                 'artifact':f'{case["id"]}-{repeat}/candidate.json' if result else None}
            row['status']=verdict(case,checks,executed,manual,error=error)
            if result:write(target/'candidate.json',result)
            write(target/'evaluation.json',row);document['results'].append(row)
            review_templates.append({'case_id':case['id'],'repeat':repeat,'case_sha256':digest(case),'artifact_sha256':artifact_hash,'reviewer':'','reviewed_at':'','criteria':manual})
            write(directory/'reviews-template.json',review_templates);render(document,directory)
            print(f'  {row["status"]}: {row["duration_seconds"]}s',flush=True)
    print(str(directory/'REPORT.md'))


def update_report(args):
    directory=Path(args.directory).resolve();document=load(directory/'report.json');suite=load(directory/'cases.json')
    if digest(suite)!=document['suite_sha256']:raise ValueError('案例副本已改变，不能套用旧评审')
    by_id={c['id']:c for c in suite['cases']}
    reviews=load(args.reviews) if args.reviews else []
    keys=[(r['case_id'],r['repeat']) for r in reviews]
    valid={(r['case_id'],r['repeat']) for r in document['results']}
    if len(set(keys))!=len(keys) or set(keys)-valid:raise ValueError('评审重复或不对应本次运行')
    for row in document['results']:
        case=by_id[row['case_id']]
        if row['case_sha256']!=digest(case):raise ValueError('验收案例哈希不匹配')
        if row.get('artifact') and digest(load(directory/row['artifact']))!=row['artifact_sha256']:raise ValueError('产物已改变，需要重新生成评测')
        review=next((r for r in reviews if r['case_id']==row['case_id'] and r['repeat']==row['repeat']),None)
        if review:
            if not row.get('artifact_sha256'):raise ValueError('没有生成产物不能评为通过')
            row['manual']=manual_review(case,row['artifact_sha256'],review)
            row['reviewer']=review['reviewer'];row['reviewed_at']=review['reviewed_at']
        row['status']=verdict(case,row['checks'],row['runtime'],row['manual'],mode=document['mode'],error=row.get('error'))
    render(document,directory);print(directory/'REPORT.md')


def compare(directories):
    reports=[load(Path(p)/'report.json') for p in directories]
    first=reports[0]
    for report in reports:
        if any(report[k]!=first[k] for k in ('suite_sha256','source_sha256','mode')) or sorted((r['case_id'],r['repeat']) for r in report['results'])!=sorted((r['case_id'],r['repeat']) for r in first['results']):raise ValueError('案例、次数、模式或代码版本不同，不能直接比较')
    print(json.dumps([{'provider':r['provider'],'model':r['model'],**summarize(r)} for r in reports],ensure_ascii=False,indent=2))


def main():
    p=argparse.ArgumentParser(description=__doc__);sub=p.add_subparsers(dest='command',required=True)
    sub.add_parser('validate')
    run_parser=sub.add_parser('run');run_parser.add_argument('--provider',choices=['minimax','openai','anthropic'],required=True);run_parser.add_argument('--model');run_parser.add_argument('--cases',required=True,help='Comma-separated IDs, or all');run_parser.add_argument('--repeat',type=int,default=1)
    report_parser=sub.add_parser('report');report_parser.add_argument('directory');report_parser.add_argument('--reviews')
    compare_parser=sub.add_parser('compare');compare_parser.add_argument('directories',nargs='+')
    args=p.parse_args();suite=load(SUITE);validate_suite(suite)
    if args.command=='validate':print(f'{len(suite["cases"])} cases valid; suite={suite["version"]}; sha256={digest(suite)}')
    elif args.command=='run':asyncio.run(run(args,suite))
    elif args.command=='report':update_report(args)
    else:compare(args.directories)

if __name__=='__main__':main()
