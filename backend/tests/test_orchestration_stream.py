import os
import sys


sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app.api.orchestration import _strip_reasoning_from_model_content
from app.services.orchestration_service import OrchestrationService


def test_stream_content_discards_embedded_thinking_before_json():
    raw_text = '<think>先分析用户意图，再规划节点。</think>\n{"workflow": {"nodes": []}}'

    cleaned = _strip_reasoning_from_model_content(raw_text)

    assert cleaned == '{"workflow": {"nodes": []}}'
    assert OrchestrationService._parse_model_payload(cleaned) == {"workflow": {"nodes": []}}


def test_stream_content_discards_unfinished_thinking_block():
    raw_text = '<think>模型未完成的内部推理'

    assert _strip_reasoning_from_model_content(raw_text) == ""
