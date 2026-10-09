import sys
import os

# Add backend to path for import
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app.core.engine import GraphEngine

# Mock Graph Structure
MOCK_NODES = [
    {"id": "start", "type": "systemInput", "data": {"label": "Start"}},
    {"id": "llm", "type": "llm", "data": {"label": "Intent"}},
    {
        "id": "logic",
        "type": "logic",
        "data": {"label": "Check", "condition": "input.intent == 'medical_emergency'"},
    },
    {
        "id": "action_yes",
        "type": "car_control",
        "data": {"label": "Stop", "action": "hazard_lights"},
    },
    {"id": "action_no", "type": "tool", "data": {"label": "Wait", "tool": "wait"}},
]

MOCK_EDGES = [
    {"source": "start", "target": "llm"},
    {"source": "llm", "target": "logic"},
    {"source": "logic", "target": "action_yes", "sourceHandle": "true"},
    {"source": "logic", "target": "action_no", "sourceHandle": "false"},
]


def test_engine_emergency_flow():
    """Test that 'Help me' triggers the emergency (YES) branch."""
    engine = GraphEngine(MOCK_NODES, MOCK_EDGES)

    # We need to capture the execution trace or side effects.
    # Since the engine currently just logs, we can mock the logger or add a callback mechanism.
    # For now, let's just run it to ensure no crashes.

    # In a real test, we would inspect the engine's internal state or use a spy on _process_control.
    engine.run("Help me!")

    # Verification
    assert "start" in engine.execution_log
    assert "llm" in engine.execution_log
    assert "logic" in engine.execution_log
    assert "action_yes" in engine.execution_log
    assert "action_no" not in engine.execution_log


def test_engine_normal_flow():
    """Test that 'Open window' triggers the normal (NO) branch."""
    engine = GraphEngine(MOCK_NODES, MOCK_EDGES)
    engine.run("Open the window")

    # Verification
    assert "start" in engine.execution_log
    assert "llm" in engine.execution_log
    assert "logic" in engine.execution_log
    assert "action_no" in engine.execution_log
    assert "action_yes" not in engine.execution_log
