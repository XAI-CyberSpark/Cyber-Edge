from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.api.inference import router
from app.services.inference_service import InferenceService


app = FastAPI()
app.include_router(router)
client = TestClient(app)


def test_vlm_describe_endpoint(monkeypatch):
    def fake_vlm_describe(_request):
        return {
            "id": "vlm-test",
            "created": 1,
            "model": "apple/FastVLM-0.5B",
            "text": "mock image description",
            "usage": {
                "prompt_tokens": 3,
                "completion_tokens": 4,
                "total_tokens": 7,
            },
        }

    monkeypatch.setattr(InferenceService, "vlm_describe", staticmethod(fake_vlm_describe))

    response = client.post(
        "/vlm/describe",
        json={
            "image_url": "data:image/png;base64,AAA",
            "prompt": "Describe this image.",
        },
    )

    assert response.status_code == 200
    assert response.json()["text"] == "mock image description"


def test_chat_completions_routes_fastvlm(monkeypatch):
    def fake_chat(_request):
        return {
            "id": "chatcmpl-fastvlm-test",
            "object": "chat.completion",
            "created": 1,
            "model": "apple/FastVLM-0.5B",
            "choices": [
                {
                    "index": 0,
                    "message": {"role": "assistant", "content": "mock vlm response"},
                    "finish_reason": "stop",
                }
            ],
            "usage": {
                "prompt_tokens": 3,
                "completion_tokens": 4,
                "total_tokens": 7,
            },
        }

    monkeypatch.setattr(
        InferenceService, "_fastvlm_chat_completions", staticmethod(fake_chat)
    )

    response = client.post(
        "/chat/completions",
        json={
            "model": "apple/FastVLM-0.5B",
            "messages": [
                {
                    "role": "user",
                    "content": [
                        {"type": "text", "text": "Describe this image."},
                        {"type": "image_url", "image_url": {"url": "data:image/png;base64,AAA"}},
                    ],
                }
            ],
        },
    )

    assert response.status_code == 200
    assert response.json()["choices"][0]["message"]["content"] == "mock vlm response"
