"""Registered MCP tools. Models select identities, never URLs, credentials or commands."""
from __future__ import annotations
import asyncio
import json
import os
import re
import sys
import tempfile
from pathlib import Path
from urllib.parse import urlsplit
from . import mcp_packages

ROOT = Path(__file__).resolve().parents[3]
SETTINGS_PATH = ROOT / '.demo-runtime' / 'mcp-servers.json'
RUNTIME_PATH = ROOT / '.demo-runtime' / 'mcp-runtime.json'
MAX_BYTES = 2_000_000
# Explicitly delegated credential values in the isolated authoring process.
CREDENTIAL_ENV = {}

class MCPRuntimeError(ValueError):
    pass

def settings():
    if not SETTINGS_PATH.exists(): return {}
    try:
        data = json.loads(SETTINGS_PATH.read_text())
        servers = data['servers']
        if not isinstance(servers, dict) or len(servers) > 32: raise ValueError()
        for key, server in servers.items():
            if not re.fullmatch(r'[a-zA-Z0-9_-]{1,64}', key) or not isinstance(server, dict): raise ValueError()
            url = urlsplit(server['url'])
            if url.scheme not in ('http','https') or not url.hostname or url.username or url.password or url.fragment: raise ValueError()
            if not isinstance(server.get('tools'), dict) or len(server['tools']) > 100: raise ValueError()
            for name, permissions in server['tools'].items():
                if not isinstance(name,str) or not name or len(name)>128 or not isinstance(permissions,dict): raise ValueError()
                if type(permissions.get('allow_trials',False)) is not bool: raise ValueError()
            if not isinstance(server.get('headers_env',{}),dict): raise ValueError()
        return servers
    except (OSError,ValueError,KeyError,TypeError):
        raise MCPRuntimeError('MCP服务登记文件无效，请检查服务端配置。') from None

def credential_environment():
    names={name for server in settings().values() for name in server.get('headers_env',{}).values() if isinstance(name,str)}
    return {name:CREDENTIAL_ENV.get(name,os.environ.get(name)) for name in names if CREDENTIAL_ENV.get(name,os.environ.get(name))}

def binding(server_id, tool_name=None, *, trial=False):
    servers=settings()
    if server_id in mcp_packages.RECIPES and server_id not in servers:
        servers[server_id] = {'managed_id': server_id, 'tools': mcp_packages.RECIPES[server_id]['tools']}
    if server_id not in servers: raise MCPRuntimeError('MCP服务未登记，不能通过节点自定义连接地址。')
    server=servers[server_id]
    if tool_name is not None:
        if tool_name not in server['tools']: raise MCPRuntimeError('该MCP工具未获得执行授权。')
        if trial and not server['tools'][tool_name].get('allow_trials',False):
            raise MCPRuntimeError('该MCP工具未授权自动试跑，需先在服务端配置独立测试权限。')
    return server

def validate_mcp_node(data):
    if (data.get('tool_id') or data.get('tool'))!='mcp': return False
    for name in ('serverId','toolName'):
        if not isinstance(data.get(name),str) or not data[name].strip(): raise MCPRuntimeError('MCP节点需要serverId和toolName。')
    if not isinstance(data.get('arguments',{}),dict): raise MCPRuntimeError('MCP工具arguments必须为对象，可使用通用$ref字段绑定。')
    if any(k in data for k in ('url','headers','command','apiKey','endpoint','env')): raise MCPRuntimeError('连接地址、凭据与进程命令只能由服务端登记。')
    binding(data['serverId'],data['toolName'])
    return True

async def _worker(server, operation, tool_name=None, arguments=None, *, timeout=60):
    try:
        runtime=json.loads(RUNTIME_PATH.read_text()) if RUNTIME_PATH.exists() and not server.get('managed_id') else {}
        if not isinstance(runtime,dict):raise ValueError()
        for key in ('python','sdk_path'):
            if key in runtime and (not isinstance(runtime[key],str) or not Path(runtime[key]).is_absolute() or not Path(runtime[key]).exists()):raise ValueError()
    except (ValueError,OSError):raise MCPRuntimeError('MCP独立运行环境配置无效。') from None
    python=runtime.get('python',sys.executable)
    headers={}
    for name, variable in server.get('headers_env',{}).items():
        if not isinstance(name,str) or not re.fullmatch(r'[A-Za-z0-9-]{1,80}',name) or not isinstance(variable,str):
            raise MCPRuntimeError('MCP凭据引用配置无效。')
        value=CREDENTIAL_ENV.get(variable,os.environ.get(variable))
        if not value: raise MCPRuntimeError('MCP服务所需凭据环境变量尚未配置。')
        headers[name]=value
    managed = server.get('managed_id')
    transport = {}
    if managed:
        if operation != 'call' and not mcp_packages.installed(mcp_packages.RECIPES[managed]):
            raise MCPRuntimeError('首次Run时自动安装，当前尚未连接。')
        try:
            transport = await mcp_packages.prepare(managed)
            python = await mcp_packages.ensure_environment({'package': 'mcp', 'version': '2.2.0'})
        except mcp_packages.PackageError as error:
            raise MCPRuntimeError(str(error)) from None
    payload={'url':server.get('url'),'headers':headers,'operation':operation,'tool_name':tool_name,
             'arguments':arguments,'allowed_tools':list(server['tools']),'sdk_path':None if managed else runtime.get('sdk_path'), **transport}
    try:encoded=json.dumps(payload,allow_nan=False).encode()
    except (ValueError,TypeError):raise MCPRuntimeError('MCP参数必须是有效JSON，数值必须有限。') from None
    if len(encoded)>MAX_BYTES: raise MCPRuntimeError('MCP请求超过2MB预算。')
    process=None
    try:
        with tempfile.TemporaryDirectory(prefix='oakegde-mcp-') as directory:
            async with asyncio.timeout(timeout):
                process=await asyncio.create_subprocess_exec(python,'-I',str(Path(__file__).with_name('mcp_worker.py')),
                    cwd=directory,env={'PATH':os.environ.get('PATH',''),'LANG':'en_US.UTF-8'},
                    stdin=asyncio.subprocess.PIPE,stdout=asyncio.subprocess.PIPE,stderr=asyncio.subprocess.DEVNULL,limit=MAX_BYTES+1000,start_new_session=sys.platform != 'win32')
                process.stdin.write(encoded+b'\n');await process.stdin.drain();process.stdin.close()
                line=await process.stdout.readline()
                if len(line)>MAX_BYTES: raise MCPRuntimeError('MCP响应超过2MB预算。')
                await process.wait()
                if process.returncode: raise MCPRuntimeError('MCP适配进程失败，请检查独立SDK环境。')
                result=json.loads(line)
                if 'error' in result: raise MCPRuntimeError(result['error'])
                return result['result']
    except asyncio.CancelledError: raise
    except TimeoutError: raise MCPRuntimeError('MCP调用超时，结果未知；不会自动重试该工具。') from None
    except (OSError,ValueError,KeyError) as error:
        if isinstance(error,MCPRuntimeError): raise
        raise MCPRuntimeError('MCP协议或运行环境异常，未获取可验证结果。') from None
    finally:
        if process and process.returncode is None:
            if sys.platform != 'win32':
                try:
                    process.terminate()
                    await asyncio.wait_for(process.wait(), timeout=10)
                except (ProcessLookupError, TimeoutError):
                    await mcp_packages.stop_process(process)
            else:
                await mcp_packages.stop_process(process)

async def discover(server_id):
    server=binding(server_id)
    tools=await _worker(server,'list',timeout=15)
    return [{**tool,'server_id':server_id,'allow_trials':server['tools'][tool['name']].get('allow_trials',False)} for tool in tools]

async def catalog():
    semaphore=asyncio.Semaphore(4)
    async def read(server_id):
        async with semaphore:
            try: return {'server_id':server_id,'tools':await discover(server_id),'available':True}
            except MCPRuntimeError as error: return {'server_id':server_id,'tools':[],'available':False,'issue':str(error)}
    records=await asyncio.gather(*(read(server_id) for server_id in settings()))
    result=[];size=0
    for record in records:
        size+=len(json.dumps(record,ensure_ascii=False).encode())
        if size>1_000_000:record={'server_id':record['server_id'],'tools':[],'available':False,'issue':'工具目录超过1MB编排预算，请减少本次启用工具。'}
        result.append(record)
    return result

async def invoke(server_id, tool_name, arguments, *, trial=False):
    server=binding(server_id,tool_name,trial=trial)
    if not isinstance(arguments,dict): raise MCPRuntimeError('MCP参数需要对象。')
    result=await _worker(server,'call',tool_name,arguments)
    return {'source':'mcp','server_id':server_id,'tool_name':tool_name,**result}
