import unittest
from unittest.mock import patch, Mock
from fastapi import FastAPI
from fastapi.testclient import TestClient
from app.api.mcp_catalog import router
from app.services import mcp_catalog as svc

app=FastAPI(); app.include_router(router,prefix='/v1/mcp')
client=TestClient(app)
ITEM={'id':'@amap/amap-maps','name':'高德地图','categories':['location-services'],'publisher':'@amap/amap-maps','view_count':12,'is_hosted':True}

def upstream(data):
    response=Mock(status_code=200);response.json.return_value={'success':True,'data':data};return response

class CatalogTests(unittest.TestCase):
    def setUp(self): svc._cache.clear()

    @patch.object(svc.requests,'request')
    def test_search_pagination_and_cache(self, req):
        req.return_value=upstream({'mcp_server_list':[ITEM],'total_count':240})
        r=client.get('/v1/mcp/catalog',params={'category':'location-services','q':' 高德 ','page':2})
        self.assertEqual(r.status_code,200);self.assertTrue(r.json()['has_next'])
        self.assertEqual(req.call_args.kwargs['json'],{'page_number':2,'page_size':20,'search':'高德','filter':{'category':'location-services'}})
        client.get('/v1/mcp/catalog',params={'category':'location-services','q':' 高德 ','page':2})
        self.assertEqual(req.call_count,1)
        self.assertFalse(client.get('/v1/mcp/catalog?page=5').json()['has_next'])
        self.assertEqual(req.call_args.args[0],'PUT');self.assertNotIn('headers',req.call_args.kwargs)

    @patch.object(svc.requests,'request')
    def test_validation_makes_no_upstream_call(self,req):
        for query in ['catalog?page=6','catalog?category=invalid','detail?server_id=../../secret','detail?server_id=https://example.com/foo','catalog?q='+'a'*201]:
            self.assertEqual(client.get('/v1/mcp/'+query).status_code,422)
        req.assert_not_called()

    @patch.object(svc.requests,'request')
    def test_failure_no_fake_results_and_retry(self, req):
        req.side_effect=svc.requests.Timeout()
        self.assertEqual(client.get('/v1/mcp/catalog').status_code,502)
        req.side_effect=None;req.return_value=upstream({'mcp_server_list':[ITEM],'total_count':1})
        self.assertEqual(client.get('/v1/mcp/catalog').json()['total'],1)
        self.assertEqual(req.call_count,2)

    @patch.object(svc.requests,'request')
    def test_invalid_upstream_and_rate_limit(self,req):
        req.return_value=upstream({'mcp_server_list':None,'total_count':1})
        self.assertEqual(client.get('/v1/mcp/catalog').status_code,502)
        svc._cache.clear();req.return_value=Mock(status_code=429)
        self.assertEqual(client.get('/v1/mcp/catalog').status_code,503)

    @patch.object(svc.requests,'request')
    def test_detail_public_metadata_only(self,req):
        req.return_value=upstream({**ITEM,'author':'amap','env_schema':{'required':['AMAP_MAPS_API_KEY']},'server_config':{'secret':'hidden'},'operational_urls':['secret'],'logo_url':'javascript:alert(1)'})
        r=client.get('/v1/mcp/detail',params={'server_id':ITEM['id']}).json()
        self.assertEqual(r['provider'],'amap');self.assertEqual(r['required_fields'],['AMAP_MAPS_API_KEY'])
        self.assertEqual(r['connection_status'],'not_connected');self.assertEqual(r['logo_url'],'')
        self.assertNotIn('secret',str(r));self.assertEqual(req.call_args.args[0],'GET')

    @patch.object(svc,'_list_data')
    def test_category_failure_is_unknown(self,query):
        def lookup(key='',**kwargs):
            if key=='search': raise svc.CatalogError()
            return {'total_count':240}
        query.side_effect=lookup
        r=client.get('/v1/mcp/categories').json()
        self.assertEqual(r['total'],240)
        self.assertIsNone(next(c['count'] for c in r['categories'] if c['id']=='search'))

if __name__=='__main__':unittest.main()
