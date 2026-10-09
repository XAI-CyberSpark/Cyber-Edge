import os,sys,tempfile
from pathlib import Path
sys.dont_write_bytecode=True
sys.path.insert(0,'/Users/Shared/sherry/CyberEdge/backend')
with tempfile.TemporaryDirectory(prefix='cyberedge-project-service-') as folder:
 os.chdir(folder)
 from app.services.project_service import ProjectService
 from app.schemas.project_schema import ProjectSaveSchema
 from fastapi import HTTPException
 payload=dict(name='菜单闭环测试',file_name='菜单闭环测试.json',nodes=[{'id':'original','type':'llm','position':{'x':0,'y':0},'data':{'model':'opensparx-cabin-intent:3b'}}],edges=[],meta={'chat_messages':[{'role':'user','content':'保留对话'}],'custom':{'keep':True}})
 saved=ProjectService.save_project(ProjectSaveSchema(**payload))
 loaded=ProjectService.get_project(saved.id)
 assert loaded['nodes']==payload['nodes'] and loaded['meta']==payload['meta']
 print('PASS file service save/load round trip preserves graph and metadata')
 assert len(ProjectService.list_projects())==1
 print('PASS saved project is listed')
 original=Path('projects/菜单闭环测试.json').read_bytes()
 try: ProjectService.save_project(ProjectSaveSchema(**payload))
 except HTTPException as error: assert error.status_code==409
 else: raise AssertionError('Expected collision')
 assert Path('projects/菜单闭环测试.json').read_bytes()==original
 print('PASS collision rejects overwrite and retains original bytes')
 payload['nodes'][0]['data']['label']='updated'
 ProjectService.save_project(ProjectSaveSchema(**payload,id=saved.id))
 assert ProjectService.get_project(saved.id)['nodes'][0]['data']['label']=='updated'
 print('PASS saving an existing project updates the same file')
 payload['nodes']=[]
 ProjectService.save_project(ProjectSaveSchema(**payload,overwrite=True))
 assert ProjectService.get_project(saved.id)['nodes']==[]
 print('PASS explicit overwrite accepted')
 print('5 file-service checks passed in temporary directory; existing project files untouched.')
