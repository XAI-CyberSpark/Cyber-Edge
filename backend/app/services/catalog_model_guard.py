from fastapi import HTTPException
PENDING = '高通目录模型待部署；Cybertools运行接入尚未完成，不能打包为可运行模型。'
def is_catalog_model(data):
    ref = data.get('catalogModel')
    return (isinstance(ref, dict) and ref.get('source') == 'qualcomm') or str(data.get('model') or '').startswith('qualcomm:')
def require_deployed_catalog_models(flow):
    if any(is_catalog_model(node.get('data') or {}) for node in (flow or {}).get('nodes', [])):
        raise HTTPException(status_code=400, detail=PENDING)
