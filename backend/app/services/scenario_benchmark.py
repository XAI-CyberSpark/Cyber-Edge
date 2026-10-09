"""Independent acceptance checks. The authoring model never sees these oracles.

No self-reported model score becomes a pass. Content criteria require a human
review bound to the exact case and candidate, including for gap/clarification.
"""
from __future__ import annotations
import hashlib
import json
from app.services.node_capability_service import validate_capabilities


def digest(value):
    return hashlib.sha256(json.dumps(value,ensure_ascii=False,sort_keys=True,separators=(',',':')).encode()).hexdigest()


def validate_suite(suite):
    if suite.get('schema_version')!=1 or not isinstance(suite.get('cases'),list):raise ValueError('Unsupported suite')
    ids=set()
    for case in suite['cases']:
        id=case['id']
        if id in ids:raise ValueError('Duplicate case '+id)
        ids.add(id)
        for key in ('prompt','title','group','must','never','manual'):
            if not case.get(key):raise ValueError(f'{id}: missing {key}')
        if case['expected'] not in ('preview','needs_input','capability_gap'):raise ValueError('Invalid expectation')
        if case['runtime_profile'] not in ('child','interaction','rain','window','none'):raise ValueError('Unknown runtime profile')
        if (case['expected']=='preview') == (case['runtime_profile']=='none'):raise ValueError('Missing runtime expectation')
        manual=case['manual']
        if len({x['id'] for x in manual})!=len(manual) or not all(x.get('criterion') for x in manual):raise ValueError('Invalid manual criteria')
    return len(ids)


def check_candidate(case, result):
    checks=[]
    def check(id,condition,detail,category='capability'):
        checks.append({'id':id,'category':category,'status':'pass' if condition else 'fail','detail':detail})
    project=result.get('project') or {};report=result.get('build_report') or {}
    status=report.get('status');expected=case['expected'];nodes=project.get('nodes') or [];edges=project.get('edges') or []
    check('disposition',status==expected,f'期望 {expected}，实际 {status or "没有可评测结果"}', 'intent')
    if expected!='preview':
        check('not_applied',report.get('can_apply') is False and (result.get('validation') or {}).get('passed') is False,'澄清/缺口不得标为可应用')
        if expected=='needs_input':
            check('question_present',bool((report.get('brief') or {}).get('questions')) and not nodes,'提出澄清问题且不先交付执行图','intent')
        else:
            check('gap_present',any(x.get('status')=='missing' and str(x.get('note','')).strip() for x in report.get('coverage',[])) or bool((project.get('meta') or {}).get('missing_capabilities')),'具体缺口必须保留；缺口是否完整仍需人工核对')
        return checks
    check('applicable',report.get('can_apply') is True and (result.get('validation') or {}).get('passed') is True and bool(nodes),'候选确实通过生成门槛')
    try:
        errors,_=validate_capabilities(nodes,edges)
        check('structure',bool(nodes) and not errors,'; '.join(errors[:6]) or '独立重查节点与连接契约','flow')
    except Exception:
        check('structure',False,'节点结构无法检查','flow')
    kinds={n.get('type') for n in nodes}
    rules=case.get('rules') or {}
    for kind in rules.get('required_types',[]):check('required_'+kind,kind in kinds,f'必须有 {kind} 能力')
    for kind in rules.get('forbidden_types',[]):check('forbid_'+kind,kind not in kinds,f'禁止 {kind} 副作用')
    if case['runtime_profile']=='child':
        check('observed_recognition',any(n.get('type')=='recognition' and n.get('data',{}).get('resultSource')=='vision' for n in nodes),'识别消费真实推理结果，不能使用预设 recognition')
    if case['runtime_profile']=='interaction':
        plans=[n.get('data',{}).get('plan',{}) for n in nodes if n.get('type')=='interaction']
        steps=[s for p in plans for s in p.get('steps',[])]
        questions=[s for s in steps if s.get('waitFor')=='answer']
        check('question_count',len(questions)>=rules.get('min_questions',0),f'问答数量至少 {rules.get("min_questions",0)}','content')
        visible='\n'.join(str(s.get('content',{}).get(k,'')) for s in steps for k in ('message','question','hint','reward'))
        for entity in rules.get('entities',[]):check('entity_'+entity,entity in visible,f'可播放内容应提及 {entity}；仅检查提及，不证明理解','intent')
        if rules.get('arrival'):check('arrival_ending',any(s.get('waitFor')=='arrival' and i<len(steps)-1 and bool(steps[i+1].get('content',{}).get('message')) for i,s in enumerate(steps)),'到达等待之后有实际收尾内容','flow')
        if rules.get('fixed_answers'):
            # An externally specified answer, not the model's own answer as an oracle.
            check('fixed_puzzle',any(all(a in s.get('acceptedAnswers',s.get('content',{}).get('answers',[])) for a in rules['fixed_answers']) and '2' in str(s.get('content',{}).get('question')) and '3' in str(s.get('content',{}).get('question')) for s in questions),'用户指定的2加3，接受5和五；题意再人工核对','content')
    return checks


def manual_review(case,artifact_sha256,review):
    pending=[{'id':x['id'],'status':'pending','criterion':x['criterion'],'evidence':''} for x in case['manual']]
    if not review:return pending
    if review.get('case_sha256')!=digest(case) or review.get('artifact_sha256')!=artifact_sha256:
        raise ValueError('人工评审不对应当前案例/候选，必须重新评审')
    if not str(review.get('reviewer','')).strip() or not str(review.get('reviewed_at','')).strip():raise ValueError('人工评审需要评审人和时间')
    items=review.get('criteria',[])
    if len(items)!=len(pending) or {x.get('id') for x in items}!={x['id'] for x in pending}:raise ValueError('人工评审项缺失或重复')
    by_id={x['id']:x for x in items}
    for item in pending:
        verdict=by_id[item['id']]
        if verdict.get('status') not in ('pass','fail','pending'):raise ValueError('无效的评审结果')
        if verdict['status']!='pending' and not str(verdict.get('evidence','')).strip():raise ValueError('评审结论需引用章节/画面等证据')
        item.update(status=verdict['status'],evidence=verdict.get('evidence',''))
    return pending


def verdict(case, checks, runtime, manual, *, mode='live', error=None):
    if error:return 'blocked' if error=='not_configured' else 'failed'
    if any(x['status']=='fail' for x in checks) or runtime.get('status')=='failed' or any(x['status']=='fail' for x in manual):return 'failed'
    if mode!='live':return 'reference_only'
    if not checks or any(x['status']=='pending' for x in manual):return 'needs_review'
    if case['runtime_profile']!='none' and runtime.get('status')!='passed':return 'needs_review'
    return 'accepted'
