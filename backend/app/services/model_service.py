from pathlib import Path
import os
from typing import Any, Dict, List

import requests


OLLAMA_BASE_URL = os.getenv("OLLAMA_BASE_URL", "http://127.0.0.1:11434/v1")
FASTVLM_MODEL_DIR = os.getenv(
    "FASTVLM_MODEL_DIR", str(Path(__file__).resolve().parents[3] / "models" / "apple" / "FastVLM-0.5B")
)
FASTVLM_MODEL_ID = "apple/FastVLM-0.5B"


class ModelService:
    @staticmethod
    def _ollama_root_url() -> str:
        if "/v1" in OLLAMA_BASE_URL:
            return OLLAMA_BASE_URL.rsplit("/v1", 1)[0]
        return OLLAMA_BASE_URL.rstrip("/")

    @staticmethod
    def _session() -> requests.Session:
        session = requests.Session()
        session.trust_env = False
        return session

    @staticmethod
    def _category_for_model(model_id: str) -> str:
        lower_id = model_id.lower()
        if any(token in lower_id for token in ["llava", "moondream", "bunny", "gemini", "yolo", "nanollava", "qwen-vl"]):
            return "vlm"
        if any(token in lower_id for token in ["whisper", "audio"]):
            return "audio"
        if any(token in lower_id for token in ["tts", "cosyvoice"]):
            return "tts"
        if "gemma-2" in lower_id:
            return "omni"
        return "llm"

    @staticmethod
    def _format_disk_size(num_bytes: int) -> str:
        if num_bytes >= 1024**3:
            return f"{num_bytes / (1024**3):.1f} GB"
        if num_bytes >= 1024**2:
            return f"{num_bytes / (1024**2):.0f} MB"
        if num_bytes >= 1024:
            return f"{num_bytes / 1024:.0f} KB"
        return f"{num_bytes} B"

    @staticmethod
    def _normalize_tag_model(item: Dict[str, Any]) -> Dict[str, Any]:
        details = item.get("details") or {}
        model_id = item.get("model") or item.get("name") or item.get("id") or ""
        parameter_size = details.get("parameter_size")
        return {
            "id": model_id,
            "name": item.get("name") or model_id,
            "size": parameter_size or ModelService._format_disk_size(item.get("size", 0)),
            "path": "ollama",
            "is_downloaded": True,
            "category": ModelService._category_for_model(model_id),
            "provider": details.get("family") or "ollama",
            "format": details.get("format", "gguf").upper(),
        }

    @staticmethod
    def _normalize_openai_model(item: Dict[str, Any]) -> Dict[str, Any]:
        model_id = item.get("id") or item.get("name") or ""
        return {
            "id": model_id,
            "name": model_id,
            "size": "Unknown",
            "path": "ollama",
            "is_downloaded": True,
            "category": ModelService._category_for_model(model_id),
            "provider": item.get("owned_by", "ollama"),
            "format": "GGUF",
        }

    @staticmethod
    def _local_fastvlm_model() -> Dict[str, Any] | None:
        weights_path = os.path.join(FASTVLM_MODEL_DIR, "model.safetensors")
        if not os.path.exists(weights_path):
            return None

        size_bytes = os.path.getsize(weights_path)
        return {
            "id": FASTVLM_MODEL_ID,
            "name": "FastVLM 0.5B",
            "size": ModelService._format_disk_size(size_bytes),
            "path": FASTVLM_MODEL_DIR,
            "is_downloaded": True,
            "category": "vlm",
            "provider": "apple",
            "format": "SAFETENSORS",
        }

    @staticmethod
    def _append_local_models(models: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        local_models = models[:]
        fastvlm = ModelService._local_fastvlm_model()
        if fastvlm and all(model.get("id") != FASTVLM_MODEL_ID for model in local_models):
            local_models.append(fastvlm)
        return local_models

    @staticmethod
    def list_models() -> Dict[str, List[Dict[str, Any]]]:
        session = ModelService._session()
        ollama_root = ModelService._ollama_root_url()

        try:
            response = session.get(f"{ollama_root}/api/tags", timeout=3)
            response.raise_for_status()
            payload = response.json()
            models = [
                ModelService._normalize_tag_model(item)
                for item in payload.get("models", [])
                if item.get("name") or item.get("model") or item.get("id")
            ]
            return {"models": ModelService._append_local_models(models)}
        except Exception:
            pass

        try:
            response = session.get(f"{ollama_root}/v1/models", timeout=3)
            response.raise_for_status()
            payload = response.json()
            models = [
                ModelService._normalize_openai_model(item)
                for item in payload.get("data", [])
                if item.get("id") or item.get("name")
            ]
            return {"models": ModelService._append_local_models(models)}
        except Exception:
            return {"models": ModelService._append_local_models([])}
