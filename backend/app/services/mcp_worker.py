"""SDK isolation boundary: registered HTTP and reviewed managed stdio recipes."""
from contextlib import AsyncExitStack
import asyncio
import json
import signal
import sys

LIMIT=2_000_000
async def run(payload):
    if payload.get('sdk_path'): sys.path.insert(0,payload['sdk_path'])
    try:
        from importlib.metadata import version
        if version("mcp")!="2.2.0":return {"error":"MCP SDK版本不是已验证的2.2.0。"}
        import httpx2
        from mcp import Client
        from mcp.client.streamable_http import streamable_http_client
        from mcp.client.stdio import StdioServerParameters, stdio_client
        from jsonschema import Draft202012Validator
    except ImportError:
        return {'error':'MCP SDK未安装到独立运行环境。'}
    # Bound streaming bytes too, before decoding an unbounded remote result.
    class LimitedStream(httpx2.AsyncByteStream):
        def __init__(self,stream): self.stream=stream
        async def __aiter__(self):
            total=0
            async for chunk in self.stream:
                total+=len(chunk)
                if total>4_000_000: raise ValueError('MCP响应超过传输预算。')
                yield chunk
        async def aclose(self): await self.stream.aclose()
    async def bound(response): response.stream=LimitedStream(response.stream)
    try:
        async with AsyncExitStack() as stack:
            if payload.get('command'):
                transport = stdio_client(StdioServerParameters(command=payload['command'], args=payload['args'], env={'PYTHONIOENCODING': 'utf-8'}))
            else:
                http = await stack.enter_async_context(httpx2.AsyncClient(headers=payload['headers'],timeout=30,trust_env=False,event_hooks={'response':[bound]}))
                transport = streamable_http_client(payload['url'],http_client=http)
            async with Client(transport,input_required_max_rounds=0) as client:
                tools=[];cursor=None;seen=set()
                for _ in range(5):
                    page=await client.list_tools(cursor=cursor)
                    tools.extend(t for t in page.tools if t.name in payload['allowed_tools'])
                    cursor=page.next_cursor
                    if cursor is None: break
                    if cursor in seen: raise ValueError('MCP工具分页游标重复。')
                    seen.add(cursor)
                else: raise ValueError('MCP工具分页超过预算。')
                if payload['operation']=='list':
                    return {'result':[{'name':t.name,'description':t.description or '', 'input_schema':t.input_schema,'output_schema':t.output_schema} for t in tools]}
                tool=next((t for t in tools if t.name==payload['tool_name']),None)
                if tool is None: return {'error':'MCP服务当前未提供已登记工具。'}
                schema=tool.input_schema
                # Local references only: schema validation cannot fetch third-party URLs.
                def check(value):
                    if isinstance(value,dict):
                        if any(k in value and not str(value[k]).startswith('#') for k in ('$ref','$dynamicRef','$recursiveRef')): raise ValueError('MCP Schema不支持外部引用。')
                        for item in value.values(): check(item)
                    elif isinstance(value,list):
                        for item in value: check(item)
                check(schema);check(tool.output_schema);Draft202012Validator.check_schema(schema)
                errors=list(Draft202012Validator(schema).iter_errors(payload['arguments']))
                if errors:return {'error':'MCP参数不符合工具Schema：'+','.join('.'.join(map(str,e.absolute_path)) or '<root>' for e in errors[:5])}
                result=await client.call_tool(tool.name,payload['arguments'])
                content=[block.model_dump(mode='json',by_alias=True,exclude_none=True) for block in result.content]
                text='\n'.join(block['text'] for block in content if block.get('type')=='text')
                if result.is_error:return {'error':'MCP工具返回失败：'+text[:500]}
                return {'result':{'data':result.structured_content,'content':content,'text':text,'is_error':False}}
    except Exception:
        # Avoid URL query strings, authorization headers and server tracebacks in logs/model input.
        return {'error':'MCP连接、协议或返回值校验失败；未确认工具结果，不自动重试。'}

async def main(payload):
    # Let the SDK close its stdio child (which owns a separate process group)
    # before the parent uses its bounded hard-kill fallback.
    loop = asyncio.get_running_loop()
    task = asyncio.current_task()
    if sys.platform != 'win32':
        loop.add_signal_handler(signal.SIGTERM, task.cancel)
    return await run(payload)

try:
    raw=sys.stdin.buffer.readline(LIMIT+1)
    if len(raw)>LIMIT: raise ValueError()
    payload=json.loads(raw)
    result=asyncio.run(main(payload))
    encoded=json.dumps(result,ensure_ascii=False,allow_nan=False)
    if len(encoded.encode())>LIMIT:encoded=json.dumps({'error':'MCP响应超过2MB预算。'},ensure_ascii=False)
    for secret in payload.get('headers',{}).values():
        if secret:
            for token in {secret,secret.removeprefix('Bearer ')}:
                if token:encoded=encoded.replace(json.dumps(token,ensure_ascii=False)[1:-1],'[redacted]')
    print(encoded)
except Exception:
    print(json.dumps({'error':'MCP适配器未返回有效结果。'}))
