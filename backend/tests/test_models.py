from app.services.model_service import ModelService


class MockResponse:
    def __init__(self, payload):
        self.payload = payload

    def raise_for_status(self):
        return None

    def json(self):
        return self.payload


class MockSession:
    def __init__(self, responses):
        self.responses = responses
        self.trust_env = True

    def get(self, url, timeout):
        response = self.responses.get(url)
        if isinstance(response, Exception):
            raise response
        if response is None:
            raise RuntimeError(f"Unexpected URL: {url}")
        return MockResponse(response)


def test_list_models_from_ollama_tags(monkeypatch):
    monkeypatch.setattr(
        ModelService,
        "_session",
        staticmethod(
            lambda: MockSession(
                {
                    "http://127.0.0.1:11434/api/tags": {
                        "models": [
                            {
                                "name": "qwen2.5:0.5b",
                                "model": "qwen2.5:0.5b",
                                "size": 397821319,
                                "details": {
                                    "family": "qwen2",
                                    "format": "gguf",
                                    "parameter_size": "494.03M",
                                },
                            }
                        ]
                    }
                }
            )
        ),
    )

    result = ModelService.list_models()

    assert result["models"][0]["id"] == "qwen2.5:0.5b"
    assert result["models"][0]["category"] == "llm"
    assert result["models"][0]["is_downloaded"] is True
    assert result["models"][0]["size"] == "494.03M"


def test_list_models_falls_back_to_openai_compatible_endpoint(monkeypatch):
    monkeypatch.setattr(
        ModelService,
        "_session",
        staticmethod(
            lambda: MockSession(
                {
                    "http://127.0.0.1:11434/api/tags": RuntimeError("tags unavailable"),
                    "http://127.0.0.1:11434/v1/models": {
                        "data": [
                            {
                                "id": "qwen2.5:0.5b",
                                "owned_by": "library",
                            }
                        ]
                    },
                }
            )
        ),
    )

    result = ModelService.list_models()

    assert result["models"][0]["id"] == "qwen2.5:0.5b"
    assert result["models"][0]["provider"] == "library"
    assert result["models"][0]["format"] == "GGUF"
