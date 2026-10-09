"""Official Hermes SDK process. IPC accepts trusted host configuration only."""
from __future__ import annotations
import asyncio
import json
import logging
import os
from pathlib import Path
import sys
import threading
import time
from contextlib import nullcontext

wire=sys.stdout
# SDK diagnostics must not corrupt the explicit protocol or expose reasoning.
sys.stdout=sys.stderr

def emit(type, data):
    wire.write(json.dumps({'type':type,'data':data},ensure_ascii=False,default=str)+'\n');wire.flush()

def main():
    init=json.loads(sys.stdin.readline())
    profile=Path.cwd()/'profile';profile.mkdir()
    call_timeout=init['api_call_timeout_seconds']
    (profile/'config.yaml').write_text(json.dumps({
        'model':{'streaming':False,'context_length':128000},
        'tools':{'tool_search':{'enabled':False}},
        'providers':{name:{'request_timeout_seconds':call_timeout,'stale_timeout_seconds':call_timeout}
                     for name in ('anthropic','custom')}}))
    os.environ.update(HERMES_HOME=str(profile),TERMINAL_CWD=str(Path.cwd()),
                      HERMES_SINGLE_QUERY_SESSION='1',HERMES_SESSION_SOURCE='oakegde',HERMES_PM_NONINTERACTIVE='1')
    sys.path.insert(0,init['backend_root']);sys.path.insert(0,init['runtime_root'])
    from app.schemas.orchestration_schema import WorkflowGenerateRequestSchema
    from app.services import model_providers
    model_providers.SETTINGS_PATH=Path(init['settings_path'])
    from app.services import mcp_runtime
    mcp_runtime.CREDENTIAL_ENV=init.get('mcp_credentials',{})
    from app.services.authoring_session import AuthoringSession
    from app.services.hermes_tool_arguments import invoke_hermes_tool
    from app.services.authoring_diagnostics import run_diagnostics, tool_status
    from app.services.scenario_builder import inline_schema
    request=WorkflowGenerateRequestSchema.model_validate(init['request'])
    session=AuthoringSession(request)
    from tools.registry import registry
    lock=threading.RLock()
    labels={'oakegde_capabilities':'正在读取真实节点能力…','oakegde_read_graph':'正在读取当前图与版本…',
            'oakegde_brief':'正在登记需求与验收目标…','oakegde_patch_graph':'正在局部更新节点与连线…',
            'oakegde_test_plan':'正在定义输入与结果断言…','oakegde_inspect':'正在检查节点、连线和需求覆盖…',
            'oakegde_trial':'正在试跑实际图，并核验输出是否满足需求…','oakegde_submit':'正在整理已验证结果与未完成项…'}
    from run_agent import AIAgent
    from pydantic import ValidationError
    from app.services.authoring_session import argument_feedback
    from app.services.authoring_team import AuthoringTeam, CompletionBudget, TEAM_PROMPT, usage, bind_specialist_delivery, output_token_limit, finalize_near_budget
    logging.basicConfig(level=logging.WARNING)
    provider=init['provider']
    mode=init.get('agent_mode','single')
    budget=CompletionBudget(host_deadline=init.get('host_deadline'))
    session.completion_budget=budget
    from app.services.authoring_checkpoint import checkpoint
    def publish_checkpoint():
        with lock:emit('checkpoint',checkpoint(session,budget))
    budget.on_progress=publish_checkpoint
    started=time.monotonic()
    execution_review_usage=[]
    model_providers.COMPLETION_USAGE_OBSERVER.set(execution_review_usage.append)
    def factory(toolsets, iterations):
        agent=AIAgent(model=provider['model'],provider='anthropic' if provider['id']=='anthropic' else 'custom',
            api_mode='anthropic_messages' if provider['id']=='anthropic' else 'chat_completions',
            base_url=provider['base_url'],api_key=provider['api_key'],enabled_toolsets=toolsets,
            max_iterations=iterations,max_tokens=output_token_limit(toolsets),quiet_mode=True,save_trajectories=False,
            skip_context_files=True,load_soul_identity=False,skip_memory=True,skip_background_review=True,
            run_budget_seconds=max(1,budget.remaining_seconds()),cwd=str(Path.cwd()),fallback_model=None)
        if agent.model != provider['model'] or str(agent.base_url).rstrip('/') != provider['base_url'].rstrip('/'):
            agent.close();raise RuntimeError('Unexpected model binding')
        bind_specialist_delivery(agent,provider,toolsets)
        from app.services.model_reasoning import bind_hermes_reasoning
        bind_hermes_reasoning(agent, provider, request.reasoning)
        budget.bind(agent)
        return agent
    from app.services.authoring_intake import run_intake, discussion_result, turn_context, TOOL
    emit('ready',{'engine':'official-hermes-AIAgent','tools':[TOOL],'commit':init['commit'],
                  'agent_mode':mode,'phase':'intake'})
    try:
        decision,intake_run=run_intake(session,registry,factory,emit)
    except Exception as exc:
        emit('error',{'diagnostics':{**run_diagnostics(None,session,exception=exc),'stage':'intake','completion_attempts':budget.attempts,'truncation_retries':budget.truncation_retries,'truncation_skip_reason':budget.truncation_skip_reason,**({'failure_reason':'truncated'} if budget.truncation_failed else {})}})
        return
    if decision is None:
        emit('error',{'diagnostics':{**intake_run['run'],'completion_attempts':budget.attempts,'truncation_retries':budget.truncation_retries,'truncation_skip_reason':budget.truncation_skip_reason,**({'failure_reason':'truncated'} if budget.truncation_failed else {})}})
        return
    if decision.mode=='discuss':
        report={'hermes':{'engine':'official-hermes-AIAgent','commit':init['commit'],
                         'tools':[TOOL],'run':intake_run['run']},
                'collaboration':{'mode':'discussion','agents':[intake_run],
                    'completion_attempts':budget.attempts,'completion_limit':budget.limit,'call_timeouts':budget.call_timeouts,'truncation_retries':budget.truncation_retries,'truncation_skip_reason':budget.truncation_skip_reason,
                    'elapsed_ms':round((time.monotonic()-started)*1000)}}
        emit('result',discussion_result(request,provider,decision.reply,report))
        return
    emit('thinking',{'content':'本轮需要构建，正在交接场景编排团队…'})
    team=AuthoringTeam(session,registry,factory,emit,budget,capabilities=lambda:asyncio.run(session.capabilities_live())) if mode=='team' else None
    readonly={'oakegde_capabilities','oakegde_read_graph'}
    mutations={'oakegde_brief','oakegde_patch_graph','oakegde_test_plan'}
    exposed=[t for t in session.tools() if not team or t[0] not in mutations]
    for name,description,contract,_ in exposed:
        def handler(args,_name=name,**kwargs):
            # Delegation holds the writer lock while a child reads the snapshot.
            with (nullcontext() if _name in readonly else lock):
                emit('thinking',{'content':labels[_name]})
                blocked=team.submission_error() if team and _name=='oakegde_submit' else None
                result=blocked or asyncio.run(invoke_hermes_tool(session,_name,args))
                publish_checkpoint()
                emit('tool_status',tool_status(_name,result,session))
                return json.dumps(result,ensure_ascii=False,default=str)
        registry.register(name=name,toolset='oakegde_readonly' if name in readonly else 'oakegde_authoring',
            schema={'name':name,'description':description,'parameters':inline_schema(contract.model_json_schema())},handler=handler,max_result_size_chars=160000)
    if team:
        for name,description,contract,action in team.tools():
            def handler(args,_name=name,_contract=contract,_action=action,**kwargs):
                with lock:
                    try:
                        if session.result is not None:raise ValueError('已提交，请结束本轮。')
                        result=_action(_contract.model_validate(args).model_dump())
                    except ValidationError as exc:result=argument_feedback(_contract,exc)
                    except ValueError as exc:result={'error':str(exc)[:1400],'revision':session.revision}
                    publish_checkpoint()
                    emit('tool_status',tool_status(_name,result,session))
                    return json.dumps(result,ensure_ascii=False,default=str)
            registry.register(name=name,toolset='oakegde_team',schema={'name':name,'description':description,
                'parameters':inline_schema(contract.model_json_schema())},handler=handler,max_result_size_chars=160000)
    toolsets=['oakegde_readonly','oakegde_authoring']+(['oakegde_team'] if team else [])
    agent=factory(toolsets,budget.limit)
    def try_host_finalize():
        with lock:
            info=asyncio.run(finalize_near_budget(session,budget,team))
            if info:
                emit('thinking',{'content':'宿主已执行预算收尾检查，结果：'+('已提交' if session.result else info.get('reason','保留实际反馈'))})
            if session.result is not None or getattr(session,'host_finalization',{}).get('host_finalized'):
                agent.interrupt()
                return True
            return False
    original_call=agent._interruptible_api_call
    def authoring_call(kwargs):
        if try_host_finalize():
            raise RuntimeError('Authoring stopped after host finalization')
        return original_call(budget.remind_plan(session,kwargs))
    agent._interruptible_api_call=authoring_call
    expected={t[0] for t in exposed}|({t[0] for t in team.tools()} if team else set())
    if agent.valid_tool_names != expected:
        agent.close();raise RuntimeError('Unexpected tool surface')
    emit('ready',{'engine':'official-hermes-AIAgent','tools':sorted(expected),'commit':init['commit'],'agent_mode':mode,'phase':'authoring'})
    prompt=(Path(__file__).with_name('hermes_authoring.md')).read_text()
    if team:prompt+='\n\n'+TEAM_PROMPT
    else:prompt+='\n本轮编排共享40次completion尝试与720秒。'
    try:
        outcome=agent.run_conversation(turn_context(request),system_message=prompt,task_id=Path.cwd().name)
        try_host_finalize()
        diagnostics={**run_diagnostics(outcome,session),'completion_attempts':budget.attempts,'truncation_retries':budget.truncation_retries,'truncation_skip_reason':budget.truncation_skip_reason}
        if budget.truncation_failed:diagnostics['failure_reason']='truncated'
        if session.result is None and team and team.finalize_verified():
            emit('thinking',{'content':'所有分工成果与当前版本验收均已通过，宿主正在完成正式交付…'})
        if session.result is None:
            session.incomplete_result()
        if session.result is None:
            emit('error',{'message':'智能体未形成可检查候选，当前项目未被替换。','trace':session.trace,'diagnostics':diagnostics});return
        report=session.result['build_report']
        report['hermes']={'engine':'official-hermes-AIAgent','commit':init['commit'],'tools':sorted(expected),'revision':session.revision,'run':diagnostics}
        # Include the final submit call, which completes after response construction.
        report['calls']=session.trace
        report.setdefault('host_finalized',False)
        report.setdefault('host_trial_model_calls',0)
        report.setdefault('review_calls',0)
        if hasattr(session,'host_finalization'):
            report['finalization']=session.host_finalization
            report['host_finalized']=session.host_finalization['host_finalized']
            report['host_trial_model_calls']=session.host_finalization['host_trial_model_calls']
            report['review_calls']=session.host_finalization['review_calls']
        details=[detail for call in session.trace for detail in call.get('diagnostics',{}).get('normalization_details',[])]
        report['diagnostics']={'call_timeouts':budget.call_timeouts,'truncation_retries':budget.truncation_retries,'truncation_skip_reason':budget.truncation_skip_reason,'normalizations':len(details),'normalization_details':details,
                               'normalizations_by_provider':{provider['id']:len(details)}}
        report['hermes']['reference_restorations']=sum(call.get('reference_restorations',0) for call in session.trace)
        report['collaboration']=team.report(agent) if team else {
            'mode':'single','agents':[{'role':'author','usage':usage(agent)}],
            'completion_attempts':budget.attempts,'completion_limit':budget.limit,
            'cost_usd':None,'cost_note':'网关计费未知；SDK Token 仅包含编排，场景执行与原内容核验另计。'}
        report['collaboration']['agents'].insert(0,intake_run)
        report['collaboration']['elapsed_ms']=round((time.monotonic()-started)*1000)
        report['collaboration']['model']={'provider':provider['id'],'model':provider['model']}
        report['collaboration']['human_interventions']=0
        report['collaboration']['call_timeouts']=budget.call_timeouts
        report['overload_retries']=checkpoint(session,budget)['overload_retries']
        report['collaboration']['execution_and_review_usage']=execution_review_usage
        report['collaboration']['cost_note']='网关实际费率/账单未知，cost_usd=null；agents记录编排SDK用量，execution_and_review_usage记录图执行和内容核验的提供商usage，缺失值不算零。'
        session.result['project']['meta']['build_report']=report
        emit('result',session.result)
    except Exception as exc:
        emit('error',{'message':'Hermes编排进程未完成，当前项目未被替换。',
                      'diagnostics':{**run_diagnostics(None,session,exception=exc),'completion_attempts':budget.attempts,'truncation_retries':budget.truncation_retries,'truncation_skip_reason':budget.truncation_skip_reason,**({'failure_reason':'truncated'} if budget.truncation_failed else {})}})
        raise SystemExit(1)
    finally:
        agent.close()

if __name__=='__main__':
    try:main()
    except Exception as exc:
        emit('error',{'message':'Hermes编排进程未完成，请检查已配置模型和运行环境；没有切换模型或修改项目。','error_type':type(exc).__name__})
        raise SystemExit(1)
