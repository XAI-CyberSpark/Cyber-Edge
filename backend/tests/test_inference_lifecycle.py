import asyncio,base64,io,sys,unittest
from pathlib import Path
from unittest.mock import patch
from app.services.inference_lifecycle import bounded_inference,prepare_local_messages,local_chat
from app.schemas.inference_schema import ChatRequestSchema
from fastapi import HTTPException
from PIL import Image
class Req:
 def __init__(self):self.disconnected=False
 async def is_disconnected(self):return self.disconnected
class Tests(unittest.IsolatedAsyncioTestCase):
 async def test_deadline_cancels_upstream(self):
  stopped=asyncio.Event()
  async def op():
   try:await asyncio.sleep(30)
   finally:stopped.set()
  with self.assertRaises(HTTPException) as e:await bounded_inference(op,Req(),.02)
  self.assertEqual(e.exception.status_code,504);self.assertTrue(stopped.is_set())
 async def test_disconnect_cancels_upstream(self):
  req=Req();req.disconnected=True;stopped=asyncio.Event()
  async def op():
   try:await asyncio.sleep(30)
   finally:stopped.set()
  with self.assertRaises(HTTPException) as e:await bounded_inference(op,req,3)
  self.assertEqual(e.exception.status_code,499);self.assertTrue(stopped.is_set())
 async def test_success_and_error_preserved(self):
  async def ok():return {'actual':'result'}
  self.assertEqual(await bounded_inference(ok,Req(),1),{'actual':'result'})
  async def bad():raise HTTPException(422,'bad data')
  with self.assertRaises(HTTPException) as e:await bounded_inference(bad,Req(),1)
  self.assertEqual(e.exception.status_code,422)
 async def test_disconnect_probe_cannot_swallow_cleanup(self):
  entered=asyncio.Event()
  class SwallowingRequest:
   async def is_disconnected(self):
    entered.set()
    try:await asyncio.sleep(30)
    except asyncio.CancelledError:return False
    return False
  async def op():await entered.wait();return 'finished'
  result=await asyncio.wait_for(bounded_inference(op,SwallowingRequest(),1),.5)
  self.assertEqual(result,'finished')
 async def test_local_client_closed_on_disconnect(self):
  req=Req();posted=asyncio.Event();closed=asyncio.Event()
  class Client:
   def __init__(self,**kwargs):pass
   async def __aenter__(self):return self
   async def __aexit__(self,*args):closed.set()
   async def post(self,*args,**kwargs):posted.set();await asyncio.sleep(30)
  body=ChatRequestSchema(model='opensparx-cabin-intent:3b',messages=[{'role':'user','content':'test'}])
  with patch('app.services.inference_lifecycle.httpx.AsyncClient',Client):
   task=asyncio.create_task(local_chat(body,req));await posted.wait();req.disconnected=True
   with self.assertRaises(HTTPException) as e:await task
  self.assertEqual(e.exception.status_code,499);self.assertTrue(closed.is_set())
 def test_resize_and_original_preservation(self):
  blob=io.BytesIO();Image.new('RGB',(2560,1440),'white').save(blob,format='PNG')
  url='data:image/png;base64,'+base64.b64encode(blob.getvalue()).decode()
  original=[{'role':'user','content':[{'type':'text','text':'observe'},{'type':'image_url','image_url':{'url':url}}]}]
  result=prepare_local_messages(original,1280);self.assertEqual(original[0]['content'][1]['image_url']['url'],url)
  image=Image.open(io.BytesIO(base64.b64decode(result[0]['content'][1]['image_url']['url'].split(',')[1])))
  self.assertEqual(image.size,(1280,720));self.assertEqual(result[0]['content'][0]['text'],'observe')
 def test_invalid_image_fails(self):
  with self.assertRaises(HTTPException):prepare_local_messages([{'content':[{'type':'image_url','image_url':{'url':'data:image/png;base64,nope'}}]}],1280)
if __name__=='__main__':unittest.main()
