"""Pinned SDK integration, local development port 5173 only, no cloud or SDK edits."""
import asyncio,json,sys,tempfile,threading
from pathlib import Path
from http.server import ThreadingHTTPServer,BaseHTTPRequestHandler
from unittest.mock import patch
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from app.schemas.orchestration_schema import WorkflowGenerateRequestSchema
from app.services.hermes_authoring import hermes_events,configured_engine
from app.services.model_providers import Provider
calls=[]
truncate_always=False
class Handler(BaseHTTPRequestHandler):
    def log_message(self,*args):pass
    def do_POST(self):
        body=json.loads(self.rfile.read(int(self.headers['Content-Length'])));calls.append(body)
        first=truncate_always or len(calls)==1;decision={'mode':'discuss','reply':'Local truncation recovery verified.'}
        if self.path.endswith('/messages'):
            content=[{'type':'text','text':'partial'}] if first else [{'type':'tool_use','id':'route-one','name':'oakegde_route_turn','input':decision}]
            response={'id':'fixture','type':'message','role':'assistant','model':body['model'],'content':content,'stop_reason':'max_tokens' if first else 'tool_use','stop_sequence':None,'usage':{'input_tokens':10,'output_tokens':10}}
        else:
            msg={'role':'assistant','content':'partial'} if first else {'role':'assistant','content':None,'tool_calls':[{'id':'route-one','type':'function','function':{'name':'oakegde_route_turn','arguments':json.dumps(decision)}}]}
            response={'id':'fixture','object':'chat.completion','created':0,'model':body['model'],'choices':[{'index':0,'finish_reason':'length' if first else 'tool_calls','message':msg}],'usage':{'prompt_tokens':10,'completion_tokens':10,'total_tokens':20}}
        raw=json.dumps(response).encode();self.send_response(200);self.send_header('Content-Type','application/json');self.send_header('Content-Length',str(len(raw)));self.end_headers();self.wfile.write(raw)
async def main():
    global truncate_always
    server=ThreadingHTTPServer(('127.0.0.1',5173),Handler);threading.Thread(target=server.serve_forever,daemon=True).start()
    try:
        with tempfile.TemporaryDirectory() as tmp:
            settings=Path(tmp)/'settings.json';settings.write_text('{}')
            for id,model,truncate_always in [('minimax','MiniMax-M3',False),('openai','gpt-5.2',False),('anthropic','claude-sonnet-5',False),('minimax','MiniMax-M3',True)]:
                calls.clear();provider=Provider(id,'local fixture','http://127.0.0.1:5173/v1',model,'synthetic-key')
                with patch('app.services.hermes_authoring.model_providers.resolve',return_value=provider),patch('app.services.hermes_authoring.model_providers.SETTINGS_PATH',settings):
                    req=WorkflowGenerateRequestSchema(prompt='Discuss only, local fixture.',provider_id=id,model=model,reasoning={'enabled':False})
                    try:events=[e async for e in hermes_events(req,configured_engine(),timeout=45)]
                    except Exception as exc:
                        if not truncate_always:raise
                        d=exc.detail['diagnostics'];assert d['failure_reason']=='truncated',d
                        assert d['truncation_retries']==1 and d['completion_attempts']==2 and len(calls)==2,d
                        assert d['truncation_skip_reason']=='retry_limit',d
                        print(id,'passed: repeated truncation stops with two charged calls and retry_limit');continue
                    assert not truncate_always,'Expected truncated failure'
                result=next((d for t,d in events if t=='result'),None)
                assert result,(id,[t for t,d in events]);report=result['build_report']['collaboration']
                assert len(calls)==2,(id,len(calls));assert report['truncation_retries']==1,report
                assert report['completion_attempts']==2,report
                key=next(k for k in ('max_tokens','max_completion_tokens','max_output_tokens') if k in calls[0]);assert calls[1][key]==calls[0][key]*2,(id,key)
                print(id,'passed: two charged calls, one retry, doubled token limit')
    finally:server.shutdown();server.server_close()
if __name__=='__main__':asyncio.run(main())
