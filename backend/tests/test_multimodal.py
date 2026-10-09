from fastapi.testclient import TestClient
from app.api.inference import router
from fastapi import FastAPI

app = FastAPI()
app.include_router(router)

client = TestClient(app)


def test_multimodal_inference_mock():
    # Test payload with image
    payload = {
        "model": "llava",
        "messages": [
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": "What is in this image?"},
                    {
                        "type": "image_url",
                        "image_url": {"url": "data:image/jpeg;base64,..."},
                    },
                ],
            }
        ],
    }

    response = client.post("/chat/completions", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert "Mock VLM" in data["choices"][0]["message"]["content"]
    assert "What is in this image?" in data["choices"][0]["message"]["content"]


def test_text_inference_mock():
    # Test standard payload
    payload = {"model": "gpt-4o", "messages": [{"role": "user", "content": "Hello"}]}

    response = client.post("/chat/completions", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert "Mock" in data["choices"][0]["message"]["content"]
    assert "Hello" in data["choices"][0]["message"]["content"]
