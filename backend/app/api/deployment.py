import json
import os
import time

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List, Dict, Any
from app.core.engine import GraphEngine

router = APIRouter()


class DeployRequest(BaseModel):
    nodes: List[Dict[str, Any]]
    edges: List[Dict[str, Any]]
    name: str = "default_flow"


@router.post("/deploy")
async def deploy_graph(request: DeployRequest):
    """
    Save the graph to disk for offline execution.
    """
    try:
        data = {
            "nodes": request.nodes,
            "edges": request.edges,
            "meta": {"name": request.name, "deployed_at": time.time()},
        }

        with open("flow.json", "w") as f:
            json.dump(data, f, indent=2)

        return {"status": "success", "message": "Graph deployed successfully"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/execute")
async def execute_graph(input_text: str):
    """
    Manually trigger the deployed graph.
    """
    if not os.path.exists("flow.json"):
        raise HTTPException(status_code=404, detail="No deployed graph found")

    try:
        with open("flow.json", "r") as f:
            data = json.load(f)

        engine = GraphEngine(data["nodes"], data["edges"])
        engine.run(input_text)

        return {"status": "success", "message": "Execution started"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
