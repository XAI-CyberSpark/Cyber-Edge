import io
import json
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
import zipfile
from app.services import capability_library as lib
from app.api.capabilities import router
from app.core.site_access import SiteAccessMiddleware
from fastapi import FastAPI
from fastapi.testclient import TestClient

SPEC = {'openapi': '3.0.3', 'info': {'version': '1.2'}, 'x-platform': '测试平台', 'paths': {
    '/cabin/temperature': {'get': {'summary': '读取车内温度', 'responses': {'200': {'description': '摄氏度'}}}},
    '/hvac/target': {'parameters': [{'$ref': '#/components/parameters/area'}], 'put': {'summary': '设置空调温度', 'requestBody': {'content': {'application/json': {'schema': {'type': 'number', 'minimum': 16, 'maximum': 30}}}}, 'responses': {'200': {'description': '已接受'}}, 'security': [{'vehicle': []}]}}
}, 'components': {'parameters': {'area': {'name': 'area', 'in': 'query', 'schema': {'type': 'integer'}}}}}

class CapabilityLibraryTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.env = patch.dict(os.environ, {'OAKEGDE_CAPABILITY_DB': str(Path(self.tmp.name)/'catalog.sqlite3')})
        self.env.start()
    def tearDown(self):
        self.env.stop(); self.tmp.cleanup()
    def spec(self):
        return lib.preview('sdk.json', json.dumps(SPEC, ensure_ascii=False).encode())
    def test_openapi_resolves_parameters_and_separates_read_write(self):
        result = self.spec(); a,b = result['items']
        self.assertEqual(a['category'], '车辆状态')
        self.assertEqual(b['category'], '车控动作')
        self.assertIn('area', b['inputs']); self.assertIn('minimum', b['inputs'])
        self.assertEqual(b['platform'], '测试平台'); self.assertEqual(b['version'], '1.2')
        self.assertEqual(b['invocation'], '未接入'); self.assertIn('调用条件', b['missing'])
        self.assertEqual(lib.library(), [])
    def test_review_partial_confirm_persistence_and_idempotence(self):
        draft = self.spec()
        self.assertEqual(draft['id'], self.spec()['id'])
        result = lib.confirm(draft['id'], [draft['items'][0]['id']])
        self.assertEqual(len(result['items']), 1)
        self.assertEqual(len(lib.library()[0]['items']), 1)
        self.assertEqual(result, lib.confirm(draft['id'], [draft['items'][0]['id']]))
        with self.assertRaisesRegex(lib.ImportProblem, '已导入'): self.spec()
    def test_reject_unknown_selection(self):
        draft=self.spec()
        with self.assertRaises(lib.ImportProblem): lib.confirm(draft['id'], ['forged-id'])
        self.assertEqual(lib.library(), [])
    def test_manifest_cannot_claim_connected(self):
        source={'capabilities':[{'name':'读取座椅位置','invocation':'已接入','verification':'已验证','id':'forged'}]}
        item=lib.preview('catalog.json', json.dumps(source).encode())['items'][0]
        self.assertEqual(item['invocation'],'未接入');self.assertEqual(item['verification'],'未验证')
        self.assertNotEqual(item['id'],'forged'); self.assertIn('调用方法',item['missing'])
    def test_zip_reads_documents_without_extracting_or_running(self):
        data=io.BytesIO()
        with zipfile.ZipFile(data,'w') as z:
            z.writestr('../sdk.json', json.dumps(SPEC));z.writestr('install.sh', 'exit 99');z.writestr('lib.so', b'fake')
        result=lib.preview('sdk.zip',data.getvalue())
        self.assertEqual(len(result['items']),2);self.assertEqual(len(result['warnings']),2)
        self.assertFalse(Path(self.tmp.name,'sdk.json').exists())
    def test_docx_text_is_read(self):
        data=io.BytesIO()
        with zipfile.ZipFile(data,'w') as z: z.writestr('word/document.xml','<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:p><w:r><w:t>读取温度</w:t></w:r></w:p></w:document>')
        self.assertEqual(lib.documents('接口.docx',data.getvalue())[0][0][1],'读取温度')
    def test_oversized_and_invalid_and_no_capability_do_not_save(self):
        for filename,data in [('a.txt',b'x'*(lib.MAX_FILE+1)),('a.json',b'{invalid'),('a.json',b'{"capabilities":[]}'),('a.so',b'test')]:
            with self.assertRaises(lib.ImportProblem):lib.preview(filename,data)
        self.assertEqual(lib.library(),[])
    def test_ai_requires_consent_and_no_silent_fallback(self):
        with patch.object(lib,'ai_extract',return_value=[{'name':'读取温度','interface':'getTemperature()','evidence':'getTemperature()'}]) as model:
            with self.assertRaisesRegex(lib.ImportProblem,'勾选'):lib.preview('a.md',b'getTemperature()')
            model.assert_not_called()
            result=lib.preview('a.md',b'getTemperature()',allow_ai=True)
            self.assertTrue(result['used_ai']);self.assertIn('输入参数',result['items'][0]['missing'])
        with patch.object(lib,'ai_extract',side_effect=lib.ImportProblem('服务失败')):
            with self.assertRaises(lib.ImportProblem):lib.preview('b.md',b'new document',allow_ai=True)
        self.assertEqual(lib.library(),[])
    def test_external_refs_are_not_fetched(self):
        spec=json.loads(json.dumps(SPEC));spec['paths']['/hvac/target']['parameters']=[{'$ref':'https://example.invalid/private'}]
        result=lib.preview('refs.json',json.dumps(spec).encode())
        self.assertIn('引用定义待补充',result['items'][1]['missing'])
    def test_pdf_text_extraction_and_scan_rejection(self):
        from pypdf import PdfWriter
        from pypdf.generic import DictionaryObject, NameObject, DecodedStreamObject
        writer=PdfWriter(); page=writer.add_blank_page(width=300,height=300)
        font=DictionaryObject({NameObject('/Type'):NameObject('/Font'),NameObject('/Subtype'):NameObject('/Type1'),NameObject('/BaseFont'):NameObject('/Helvetica')})
        page[NameObject('/Resources')]=DictionaryObject({NameObject('/Font'):DictionaryObject({NameObject('/F1'):font})})
        content=DecodedStreamObject();content.set_data(b'BT /F1 12 Tf 20 250 Td (getTemperature) Tj ET')
        page[NameObject('/Contents')]=writer._add_object(content)
        buf=io.BytesIO();writer.write(buf)
        self.assertIn('getTemperature',lib.documents('sdk.pdf',buf.getvalue())[0][0][1])
        blank=PdfWriter();blank.add_blank_page(width=100,height=100);buf=io.BytesIO();blank.write(buf)
        with self.assertRaisesRegex(lib.ImportProblem,'OCR'):lib.documents('scan.pdf',buf.getvalue())
    def test_yaml_openapi(self):
        import yaml
        self.assertEqual(len(lib.preview('sdk.yaml',yaml.safe_dump(SPEC).encode())['items']),2)
    def test_authenticated_api_upload_confirm_reload(self):
        app=FastAPI();app.add_middleware(SiteAccessMiddleware,key='test');app.include_router(router,prefix='/v1/capabilities')
        with TestClient(app) as client:
            self.assertEqual(client.get('/v1/capabilities').status_code,401)
            self.assertEqual(client.post('/v1/access/login',json={'key':'test'}).status_code,200)
            r=client.post('/v1/capabilities/preview',files={'file':('sdk.json',json.dumps(SPEC),'application/json')})
            self.assertEqual(r.status_code,200,r.text);draft=r.json()
            self.assertEqual(client.get('/v1/capabilities').json(),{'imports':[]})
            r=client.post('/v1/capabilities/'+draft['id']+'/confirm',json={'selected_ids':[draft['items'][0]['id']]})
            self.assertEqual(r.status_code,200,r.text)
            self.assertEqual(len(client.get('/v1/capabilities').json()['imports'][0]['items']),1)
    def test_ai_evidence_must_exist_in_document(self):
        from types import SimpleNamespace
        fake=SimpleNamespace(choices=[SimpleNamespace(finish_reason='stop',message=SimpleNamespace(content=json.dumps({'capabilities':[{'name':'猜测能力','evidence':'并不存在的原文'}]})))])
        with patch('app.services.orchestration_service.OrchestrationService._resolve_api_key',return_value='test'),patch('openai.OpenAI') as client:
            client.return_value.chat.completions.create.return_value=fake
            with self.assertRaisesRegex(lib.ImportProblem,'原文依据'):lib.ai_extract('原始接口说明')

if __name__=='__main__':unittest.main()
