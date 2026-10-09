import unittest
from fastapi import HTTPException
from app.services.catalog_model_guard import require_deployed_catalog_models
from app.services.node_capability_service import validate_capabilities
from app.services.host_lite_edge_service import HostLiteEdgeService
from app.schemas.edge_schema import BundleBuildConfig
from pathlib import Path
from tempfile import TemporaryDirectory

class CatalogModelGuardTests(unittest.TestCase):
    def test_pending_ref_rejects_execution_and_bundle_even_if_state_claims_ready(self):
        for data in ({'model':'qualcomm:yolov8'}, {'model':'other','catalogModel':{'source':'qualcomm'},'deploymentStatus':'ready'}):
            flow={'nodes':[{'id':'m','type':'llm','data':data}],'edges':[]}
            with self.assertRaises(HTTPException): require_deployed_catalog_models(flow)
            result=validate_capabilities(flow['nodes'],[])
            self.assertIn('待部署',str(result))
            with TemporaryDirectory() as temp:
                with self.assertRaises(HTTPException): HostLiteEdgeService._prepare_flow_json(BundleBuildConfig(flow_config=flow),'test',Path(temp))
                self.assertEqual(list(Path(temp).iterdir()),[])
    def test_existing_models_are_unchanged(self):
        require_deployed_catalog_models({'nodes':[{'data':{'model':'local-model'}}]})
