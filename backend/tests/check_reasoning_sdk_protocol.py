"""Manual integration check: real pinned Hermes SDK, local HTTP, no cloud calls.
Run from backend: .venv_macos/bin/python tests/check_reasoning_sdk_protocol.py
"""
import asyncio, json, sys, tempfile, threading
from pathlib import Path
from http.server import ThreadingHTTPServer, BaseHTTPRequestHandler
from unittest.mock import patch
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from app.schemas.orchestration_schema import WorkflowGenerateRequestSchema
from app.services.hermes_authoring import hermes_events, configured_engine
from app.services.model_providers import Provider

calls=[]
class Handler(BaseHTTPRequestHandler):
    def log_message(self,*args): pass
    def do_POST(self):
        body=json.loads(self.rfile.read(int(self.headers['Content-Length'])))
        calls.append(body)
        decision={'mode':'discuss','reply':'Local protocol check complete.'}
        if self.path.endswith('/messages'):
            response={'id':'local-fixture','type':'message','role':'assistant','model':body['model'],
                'content':[{'type':'tool_use','id':'route-one','name':'oakegde_route_turn','input':decision}],
                'stop_reason':'tool_use','stop_sequence':None,'usage':{'input_tokens':10,'output_tokens':10}}
        else:
            response={'id':'local-fixture','object':'chat.completion','created':0,'model':body['model'],
                'choices':[{'index':0,'finish_reason':'tool_calls','message':{'role':'assistant','content':None,
                    'tool_calls':[{'id':'route-one','type':'function','function':{'name':'oakegde_route_turn','arguments':json.dumps(decision)}}]}}],
                'usage':{'prompt_tokens':10,'completion_tokens':10,'total_tokens':20}}
        raw=json.dumps(response).encode();self.send_response(200);self.send_header('Content-Type','application/json');self.send_header('Content-Length',str(len(raw)));self.end_headers();self.wfile.write(raw)

async def main():
    server=ThreadingHTTPServer(('127.0.0.1',0),Handler);threading.Thread(target=server.serve_forever,daemon=True).start()
    cases=[('minimax','MiniMax-M3',{'enabled':False},{'thinking':{'type':'disabled'}}),
           ('minimax','MiniMax-M3',{'enabled':True},{'thinking':{'type':'adaptive'}}),
           ('anthropic','claude-sonnet-5',{'enabled':True,'effort':'xhigh'},{'thinking':{'type':'adaptive'},'output_config':{'effort':'xhigh'}}),
           ('anthropic','claude-sonnet-5',{'enabled':False},{'thinking':{'type':'disabled'}}),
           ('openai','gpt-5.2',{'enabled':True,'effort':'high'},{'reasoning_effort':'high'}),
           ('openai','gpt-5.2',{'enabled':False},{'reasoning_effort':'none'})]
    try:
        with tempfile.TemporaryDirectory() as tmp:
            settings=Path(tmp)/'settings.json';settings.write_text('{}')
            for id,model,reasoning,expected in cases:
                calls.clear(); provider=Provider(id,'local fixture',f'http://127.0.0.1:{server.server_port}/v1',model,'synthetic-key')
                with patch('app.services.hermes_authoring.model_providers.resolve',return_value=provider),patch('app.services.hermes_authoring.model_providers.SETTINGS_PATH',settings):
                    request=WorkflowGenerateRequestSchema(prompt='Discuss only. Local fixture.',provider_id=id,model=model,reasoning=reasoning)
                    events=[e async for e in hermes_events(request,configured_engine(),timeout=45)]
                assert any(kind=='result' and data.get('chat_reply')=='Local protocol check complete.' for kind,data in events),events
                assert calls
                for body in calls:
                    for key,value in expected.items():assert body.get(key)==value,(model,key,body.get(key),value)
                print(f'PASS actual pinned SDK -> loopback: {model} {reasoning}, {len(calls)} request(s)',flush=True)
    finally:
        server.shutdown();server.server_close()

if __name__=='__main__':asyncio.run(main())
