"""Server-configured official Hermes process for the existing orchestration API."""
from __future__ import annotations
import asyncio
import json
import logging
import os
from pathlib import Path
import tempfile
import time
from typing import Literal

from fastapi import HTTPException
from pydantic import BaseModel, ConfigDict, Field
from app.services import model_providers
from app.services.authoring_diagnostics import sanitize_run_diagnostics, REJECTION_CODES, TOOLS
from app.schemas.orchestration_schema import WorkflowGenerateResponseSchema
from app.schemas.project_schema import ProjectSaveSchema
from app.services.project_service import ProjectService
from app.services.orchestration_service import OrchestrationService as Legacy

ROOT=Path(__file__).resolve().parents[3]
CONFIG_PATH=ROOT/'.demo-runtime/orchestration-engine.json'
# This integration is verified against one installed official SDK revision.
SDK_COMMIT='d0288be5b3330d2442e3907185b8e9d0958297bb'
API_CALL_TIMEOUT_SECONDS=150

class EngineConfig(BaseModel):
    model_config=ConfigDict(extra='forbid')
    engine: Literal['bounded','hermes']='bounded'
    agent_mode: Literal['single','team']='single'
    api_call_timeout_seconds: float = Field(default=API_CALL_TIMEOUT_SECONDS,gt=0,le=720)
    runtime_root: str | None = None
    python: str | None = None
    pythonpath: str | None = None


def configured_engine():
    try:
        config=EngineConfig.model_validate_json(CONFIG_PATH.read_text())
    except FileNotFoundError:return EngineConfig()
    except (OSError,ValueError):raise HTTPException(503,'编排引擎配置无效，请检查服务端配置。') from None
    return config


async def verify_runtime(config):
    if not config.runtime_root or not config.python:
        raise HTTPException(503,'Hermes运行时尚未配置，未静默切换编排引擎。')
    root=Path(config.runtime_root)
    if not root.is_absolute() or not Path(config.python).is_absolute() or not Path(config.python).is_file():
        raise HTTPException(503,'Hermes运行时路径无效。')
    p=None
    try:
        async with asyncio.timeout(8):
            p=await asyncio.create_subprocess_exec('git','-C',str(root),'rev-parse','HEAD',stdout=asyncio.subprocess.PIPE,stderr=asyncio.subprocess.DEVNULL)
            out,_=await p.communicate()
            if p.returncode or out.decode().strip()!=SDK_COMMIT:raise ValueError()
            p=await asyncio.create_subprocess_exec('git','-C',str(root),'status','--porcelain',stdout=asyncio.subprocess.PIPE,stderr=asyncio.subprocess.DEVNULL)
            out,_=await p.communicate()
            if p.returncode or out.strip():raise ValueError()
    except (OSError,ValueError,TimeoutError):
        raise HTTPException(503,'Hermes SDK不是已验证的干净版本；请恢复已登记运行时后重试。') from None
    finally:
        if p and p.returncode is None:
            p.kill();await p.wait()


async def hermes_events(request,config,*,timeout=780,worker=None,verify=True,observer=None):
    provider=model_providers.resolve(request.provider_id,request.model)
    from app.services.model_reasoning import validate_settings
    validate_settings(provider.id, provider.model, request.reasoning)
    if verify:await verify_runtime(config)
    if request.provider_base_url and request.provider_base_url.rstrip('/')!=provider.base_url.rstrip('/'):
        raise HTTPException(400,'编排接口地址需在服务端配置，不能由单次场景覆盖。')
    env={k:os.environ[k] for k in ('PATH','LANG','TMPDIR','SYSTEMROOT','WINDIR') if k in os.environ}
    env['PYTHONDONTWRITEBYTECODE']='1'
    if config.pythonpath:env['PYTHONPATH']=config.pythonpath
    process=None;phase=None
    watch={'tool_calls':0,'brief_registered':False}
    from app.services.authoring_checkpoint import AuthoringCheckpoint,initial_checkpoint
    latest_checkpoint=initial_checkpoint(request)
    with tempfile.TemporaryDirectory(prefix='oakegde-hermes-') as directory:
        # The worker sets HERMES_HOME to its disposable profile; no user agent settings are inherited.
        payload={'api_call_timeout_seconds':config.api_call_timeout_seconds,'host_deadline':time.monotonic()+timeout,'agent_mode':request.agent_mode or config.agent_mode,'request':request.model_dump(),'backend_root':str(ROOT/'backend'),
                 'runtime_root':config.runtime_root,'settings_path':str(model_providers.SETTINGS_PATH),
                 'commit':SDK_COMMIT,'provider':{'id':provider.id,'model':provider.model,'base_url':provider.base_url,'api_key':provider.api_key}}
        from app.services.mcp_runtime import credential_environment
        payload['mcp_credentials']=credential_environment()
        encoded=json.dumps(payload,ensure_ascii=False).encode()
        if len(encoded)>2_000_000:raise HTTPException(400,'当前编排输入超过2MB预算。')
        try:
            async with asyncio.timeout(timeout):
                process=await asyncio.create_subprocess_exec(config.python,'-u',str(worker or ROOT/'backend/app/agents/hermes_worker.py'),
                    cwd=directory,env=env,stdin=asyncio.subprocess.PIPE,stdout=asyncio.subprocess.PIPE,stderr=asyncio.subprocess.DEVNULL,
                    limit=16_000_000,start_new_session=os.name!='nt')
                process.stdin.write(encoded+b'\n');await process.stdin.drain();process.stdin.close()
                yield 'thinking',{'content':'Hermes正在处理本轮场景共创请求…'}
                result=None;ready=False;messages=0;phase=None
                watch.update(tool_calls=0,brief_registered=False)
                watch.pop('last_tool',None);watch.pop('last_tool_ok',None);watch.pop('revision',None)
                while True:
                    line=await process.stdout.readline()
                    if not line:break
                    message=json.loads(line)
                    if not isinstance(message,dict) or not isinstance(message.get('data'),dict):
                        raise ValueError('invalid worker envelope')
                    # Checkpoints are bounded by tool/API progress, not model-authored messages.
                    if message.get('type')!='checkpoint':messages+=1
                    if messages>350:raise ValueError('worker message budget')
                    if observer:observer(message)
                    kind=message.get('type');data=message.get('data')
                    if kind=='ready':
                        next_phase=data.get('phase','authoring')
                        if next_phase not in ('intake','authoring') or phase=='authoring' or (phase=='intake' and next_phase=='intake'):
                            raise ValueError('invalid worker phase transition')
                        expected={'oakegde_capabilities','oakegde_read_graph','oakegde_brief','oakegde_patch_graph','oakegde_test_plan','oakegde_inspect','oakegde_trial','oakegde_submit'}
                        if next_phase=='intake':
                            expected={'oakegde_route_turn'}
                        elif payload['agent_mode']=='team':
                            expected-= {'oakegde_brief','oakegde_patch_graph','oakegde_test_plan'}
                            expected|= {'oakegde_delegate','oakegde_apply_artifact'}
                        if data.get('agent_mode','single')!=payload['agent_mode']:raise ValueError('worker mode mismatch')
                        names=data.get('tools')
                        if not isinstance(names,list) or any(not isinstance(name,str) for name in names):
                            raise ValueError('invalid worker tools')
                        if set(names)!=expected or data.get('commit')!=SDK_COMMIT:raise ValueError('worker capability mismatch')
                        ready=True;phase=next_phase
                    elif kind=='thinking':yield 'thinking',{'content':str(data.get('content','正在编排…'))[:300]}
                    elif kind=='checkpoint':
                        checked=AuthoringCheckpoint.model_validate(data).model_dump()
                        if checked['revision']>=latest_checkpoint['revision']:latest_checkpoint=checked
                    elif kind=='tool_status':
                        if (data.get('ok') is False and isinstance(data.get('tool'),str) and data['tool'] in TOOLS
                                and isinstance(data.get('rejection_code'),str) and data['rejection_code'] in REJECTION_CODES):
                            logging.getLogger(__name__).warning('Hermes tool rejected run=%s tool=%s reason=%s',
                                Path(directory).name,data['tool'],data['rejection_code'])
                        watch['tool_calls']+=1
                        watch['last_tool']=data.get('tool');watch['last_tool_ok']=data.get('ok')
                        if type(data.get('revision')) is int:watch['revision']=data['revision']
                        if data.get('tool')=='oakegde_brief' and data.get('ok'):watch['brief_registered']=True
                        if data.get('brief_registered') is True:watch['brief_registered']=True
                    elif kind=='result':
                        if not ready or result is not None:raise ValueError('unexpected result')
                        result=WorkflowGenerateResponseSchema.model_validate(data)
                        if phase=='intake':
                            report=result.build_report or {}
                            if not result.chat_reply or report.get('status')!='discussion' or report.get('can_apply') is not False:
                                raise ValueError('invalid intake result')
                            if not request.current_project and (result.project.nodes or result.project.edges):
                                raise ValueError('intake created graph')
                            if result.saved_project or result.documentation_file:
                                raise ValueError('intake claimed persistence')
                            if request.current_project and result.project != request.current_project:
                                raise ValueError('intake changed project')
                        if result.provider.get('id')!=provider.id or result.provider.get('model')!=provider.model:raise ValueError('provider mismatch')
                    elif kind=='error':
                        raise HTTPException(503,{'code':'hermes_incomplete',
                            'message':'Hermes未完成本轮编排，当前项目未被替换；请查看终止状态后重试或调整需求。',
                            'diagnostics':sanitize_run_diagnostics(data.get('diagnostics'))})
                    else:raise ValueError('unknown worker message')
                await process.wait()
                if process.returncode or result is None:raise HTTPException(503,'Hermes未返回完整场景，当前项目未被替换。')
                if request.save_on_success and not result.chat_reply and (result.build_report or {}).get('can_apply'):
                    result.saved_project=ProjectService.save_project(ProjectSaveSchema(id=request.current_project.id if request.current_project else None,
                        name=result.project.name,file_name=result.project.file_name,overwrite=request.overwrite,
                        nodes=result.project.nodes,edges=result.project.edges,meta=result.project.meta))
                    result.documentation_file=Legacy._save_documentation(result.saved_project,result.documentation_markdown)
                yield 'result',result.model_dump()
        except TimeoutError:
            last=watch.get('last_tool');stage='intake' if phase=='intake' else ('building_graph' if watch['brief_registered'] else 'before_brief')
            if last=='oakegde_inspect':stage='checking_graph'
            if last=='oakegde_trial':stage='executing_graph'
            if last=='oakegde_submit':stage='submitting'
            raise HTTPException(503,{'code':'hermes_incomplete',
                'message':'Hermes编排超过本轮时间预算，执行已取消，当前项目未被替换。',
                'checkpoint':latest_checkpoint,
                'diagnostics':sanitize_run_diagnostics({'interrupted':True,'termination':'host_timeout',
                    **{k:v for k,v in latest_checkpoint.items() if k!='project'},
                    'stage':stage,'tool_calls':watch['tool_calls'],'last_tool':last,
                    'last_tool_ok':watch.get('last_tool_ok'),'revision':watch.get('revision',latest_checkpoint['revision']),
                    'brief_registered':watch['brief_registered']})}) from None
        except (OSError,ValueError,KeyError):raise HTTPException(503,'Hermes编排进程或返回契约无效，当前项目未被替换。') from None
        finally:
            if process and process.returncode is None:
                try:
                    if os.name!='nt':
                        import signal
                        try:os.killpg(process.pid,signal.SIGKILL)
                        except PermissionError:
                            # Group signalling can be denied even for an owned
                            # child. Reap that child without masking its error.
                            process.kill()
                    else:process.kill()
                except ProcessLookupError:pass
                await process.wait()
