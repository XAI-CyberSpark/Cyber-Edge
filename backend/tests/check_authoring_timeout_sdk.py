"""Manual integration check: real pinned Hermes SDK, local HTTP, no cloud calls.
Run from backend: .venv_macos/bin/python tests/check_authoring_timeout_sdk.py
"""
import asyncio, json, sys, tempfile, threading, time
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
        if len(calls)==1:time.sleep(5)
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
        raw=json.dumps(response).encode();self.send_response(200);self.send_header('Content-Type','application/json');self.send_header('Content-Length',str(len(raw)));self.end_headers();
        try:self.wfile.write(raw)
        except (BrokenPipeError,ConnectionResetError):pass

async def main():
    server=ThreadingHTTPServer(('127.0.0.1',8000),Handler);threading.Thread(target=server.serve_forever,daemon=True).start()
    cases=[('minimax','MiniMax-M3',{'enabled':False},{}),('openai','gpt-5.2',{'enabled':False},{}),('anthropic','claude-sonnet-5',{'enabled':False},{})]
    try:
        with tempfile.TemporaryDirectory() as tmp:
            settings=Path(tmp)/'settings.json';settings.write_text('{}')
            for id,model,reasoning,expected in cases:
                calls.clear(); checkpoints=[]; started=time.monotonic(); provider=Provider(id,'local fixture',f'http://127.0.0.1:{server.server_port}/v1',model,'synthetic-key')
                with patch('app.services.hermes_authoring.model_providers.resolve',return_value=provider),patch('app.services.hermes_authoring.model_providers.SETTINGS_PATH',settings):
                    request=WorkflowGenerateRequestSchema(prompt='Discuss only. Local fixture.',provider_id=id,model=model,reasoning=reasoning)
                    events=[e async for e in hermes_events(request,configured_engine().model_copy(update={"api_call_timeout_seconds":1}),timeout=45,observer=lambda m:checkpoints.append(m) if m["type"]=="checkpoint" else None)]
                assert any(kind=='result' and data.get('chat_reply')=='Local protocol check complete.' for kind,data in events),events
                print({"provider":id,"requests":len(calls),"elapsed":round(time.monotonic()-started,2),"checkpoints":[{k:v for k,v in c["data"].items() if k!="project"} for c in checkpoints]},flush=True)
                assert len(calls)>=2, "slow request was not interrupted and retried"
                assert max(c["data"]["call_timeouts"] for c in checkpoints)>=1
                assert time.monotonic()-started<40
                assert calls
                for body in calls:
                    for key,value in expected.items():assert body.get(key)==value,(model,key,body.get(key),value)
                print(f'PASS actual pinned SDK timeout/retry -> loopback: {model} {reasoning}, {len(calls)} request(s)',flush=True)
    finally:
        server.shutdown();server.server_close()

if __name__=='__main__':asyncio.run(main())
