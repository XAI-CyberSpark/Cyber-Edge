import os, sys, tempfile, hashlib
from pathlib import Path
sys.dont_write_bytecode = True
sys.path.insert(0, '/Users/Shared/sherry/CyberEdge/backend')
with tempfile.TemporaryDirectory(prefix='cyberedge-delete-check-') as folder:
 os.chdir(folder)
 from app.services.project_service import ProjectService
 from app.schemas.project_schema import ProjectSaveSchema
 from fastapi import HTTPException
 a=ProjectService.save_project(ProjectSaveSchema(name='删除测试',file_name='删除测试.json',nodes=[]))
 b=ProjectService.save_project(ProjectSaveSchema(name='保留测试',file_name='保留测试.json',nodes=[]))
 keep=Path('projects/保留测试.json').read_bytes()
 assert ProjectService.delete_project(a.id)=={'status':'success'}
 assert not Path('projects/删除测试.json').exists()
 assert Path('projects/保留测试.json').read_bytes()==keep
 assert [p['id'] for p in ProjectService.list_projects()]==[b.id]
 print('PASS deletes only requested temporary file; list updates and other file bytes remain unchanged')
 try: ProjectService.delete_project(a.id)
 except HTTPException as e: assert e.status_code==404
 else: raise AssertionError('Missing file should return 404')
 print('PASS repeated deletion reports missing project')
 assert ProjectService.get_project(b.id)['name']=='保留测试'
 print('PASS retained project still loads')
print('3 delete service checks passed; no existing project data was changed.')
