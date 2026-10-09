from fastapi import APIRouter, WebSocket, WebSocketDisconnect
import asyncio
import json
import random

router = APIRouter()

class ConnectionManager:
    def __init__(self):
        self.active_connections: list[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)

    def disconnect(self, websocket: WebSocket):
        self.active_connections.remove(websocket)

    async def broadcast(self, message: str):
        for connection in self.active_connections:
            try:
                await connection.send_text(message)
            except:
                pass

manager = ConnectionManager()

@router.websocket("/dag")
async def websocket_dag_telemetry(websocket: WebSocket):
    await manager.connect(websocket)
    try:
        while True:
            # Mock pushing DAG node execution states
            node_ids = ["llm_1", "camera_1", "control_1", "logic_1"]
            payload = {
                "node_id": random.choice(node_ids),
                "status": "running",
                "latency": f"{random.randint(10, 150)}ms"
            }
            await manager.broadcast(json.dumps(payload))
            await asyncio.sleep(2)
    except WebSocketDisconnect:
        manager.disconnect(websocket)

@router.websocket("/physics")
async def websocket_physics_telemetry(websocket: WebSocket):
    await manager.connect(websocket)
    try:
        while True:
            # Mock pushing physical telemetry (CAN bus, steering, etc.)
            payload = {
                "steering_angle": random.uniform(-30.0, 30.0),
                "speed": random.uniform(0.0, 120.0),
                "event": "normal_driving"
            }
            await manager.broadcast(json.dumps(payload))
            await asyncio.sleep(0.5)
    except WebSocketDisconnect:
        manager.disconnect(websocket)
