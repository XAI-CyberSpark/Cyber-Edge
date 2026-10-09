from pathlib import Path
import base64
import io
import os
import time

import requests

# Heavy ML dependencies are optional — lazy-import so the backend can start
# on machines without torch / transformers / Pillow (e.g. pure host-lite mode).
torch = None
Image = None
AutoModelForCausalLM = None
AutoTokenizer = None

def _ensure_ml_deps():
    global torch, Image, AutoModelForCausalLM, AutoTokenizer
    if torch is None:
        import torch as _torch
        torch = _torch
    if Image is None:
        from PIL import Image as _Image
        Image = _Image
    if AutoModelForCausalLM is None:
        from transformers import AutoModelForCausalLM as _A, AutoTokenizer as _T
        AutoModelForCausalLM = _A
        AutoTokenizer = _T

from app.schemas.inference_schema import ChatRequestSchema, VLMRequestSchema

OLLAMA_BASE_URL = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434/v1")
FASTVLM_MODEL_DIR = os.getenv(
    "FASTVLM_MODEL_DIR", str(Path(__file__).resolve().parents[3] / "models" / "apple" / "FastVLM-0.5B")
)
FASTVLM_MODEL_ID = "apple/FastVLM-0.5B"
IMAGE_TOKEN_INDEX = -200


class InferenceService:
    _fastvlm_tokenizer = None
    _fastvlm_model = None

    @staticmethod
    def chat_completions(request: ChatRequestSchema) -> dict:
        """
        Proxy to real LLM (Ollama/vLLM); unavailable services fail explicitly.
        """
        if request.provider_id:
            from app.services.model_providers import runtime_chat
            return runtime_chat(request)
        from app.services.opensparx_service import MODEL_ID, OpenSparXService
        if request.model == MODEL_ID:
            return OpenSparXService.chat(request)

        # Use the same configured API model for authoring and runtime. No arbitrary URL or key from node data.
        from app.services.orchestration_service import OrchestrationService
        if request.model == OrchestrationService._resolve_model():
            return InferenceService._configured_api_chat(request)

        if InferenceService._should_route_to_fastvlm(request):
            return InferenceService._fastvlm_chat_completions(request)

        try:
            url = f"{OLLAMA_BASE_URL}/chat/completions"
            payload = {
                "model": request.model,
                "messages": request.messages,
                "temperature": request.temperature,
                "max_tokens": request.max_tokens,
                "stream": False,
            }

            if request.json_mode:
                payload["response_format"] = {"type": "json_object"}
            response = requests.post(url, json=payload, timeout=55.0)
            response.raise_for_status()
            result = response.json()
            content = result.get("choices", [{}])[0].get("message", {}).get("content")
            if not isinstance(content, str) or not content.strip() or str(result.get("id", "")).startswith("chatcmpl-mock"):
                raise ValueError("empty or simulated model response")
            return result
        except Exception:
            from fastapi import HTTPException
            raise HTTPException(status_code=503, detail="模型服务不可用或返回无效结果，未使用模拟结果代替真实推理。")

    @staticmethod
    def _configured_api_chat(request: ChatRequestSchema) -> dict:
        from fastapi import HTTPException
        from app.services.orchestration_service import OrchestrationService
        key = OrchestrationService._resolve_api_key()
        if not key:
            raise HTTPException(status_code=503, detail="编排模型 API 尚未配置，不能执行实时创作。")
        base_url = OrchestrationService._resolve_base_url()
        payload = {"model": request.model, "messages": request.messages, "temperature": request.temperature,
                   "max_tokens": request.max_tokens, "stream": False}
        # MiniMax already receives the explicit JSON prompt and the runtime validates it;
        # do not assume OpenAI response_format support across configured providers.
        if request.model.startswith("MiniMax-"):
            payload["reasoning_split"] = True
            if request.model == "MiniMax-M3":
                payload["thinking"] = {"type": "disabled"}
        elif request.json_mode:
            payload["response_format"] = {"type": "json_object"}
        try:
            with requests.Session() as session:
                session.trust_env = False
                response = session.post(f"{base_url}/chat/completions", json=payload,
                    headers={"Authorization": f"Bearer {key}"}, timeout=(10, 55))
                response.raise_for_status()
                result = response.json()
            content = result.get("choices", [{}])[0].get("message", {}).get("content")
            if not isinstance(content, str) or not content.strip() or str(result.get("id", "")).startswith("chatcmpl-mock"):
                raise ValueError("empty or simulated response")
            return result
        except requests.Timeout:
            raise HTTPException(status_code=504, detail="API 模型响应超时，进度保留，请重试。")
        except requests.HTTPError as exc:
            status = exc.response.status_code if exc.response is not None else 502
            raise HTTPException(status_code=503, detail=f"API 模型服务返回 HTTP {status}，进度保留，请检查服务配置或稍后重试。")
        except Exception:
            # Provider response bodies may contain account details. Keep errors bounded and private.
            raise HTTPException(status_code=503, detail="已配置的 API 模型暂时不可用或返回无效内容，请重试；未使用本地模型或模拟结果替代。")

    @staticmethod
    def vlm_describe(request: VLMRequestSchema) -> dict:
        started_at = int(time.time())
        text = InferenceService._run_fastvlm(
            image_url=request.image_url,
            prompt=request.prompt,
            max_new_tokens=request.max_new_tokens or 128,
        )
        completion_tokens = max(len(text.split()), 1)
        prompt_tokens = max(len(request.prompt.split()), 1)
        return {
            "id": f"vlm-{started_at}",
            "created": started_at,
            "model": request.model,
            "text": text,
            "usage": {
                "prompt_tokens": prompt_tokens,
                "completion_tokens": completion_tokens,
                "total_tokens": prompt_tokens + completion_tokens,
            },
        }

    @staticmethod
    def _should_route_to_fastvlm(request: ChatRequestSchema) -> bool:
        if request.model != FASTVLM_MODEL_ID:
            return False

        for message in request.messages:
            if isinstance(message.get("content"), list):
                return True
        return False

    @staticmethod
    def _fastvlm_chat_completions(request: ChatRequestSchema) -> dict:
        started_at = int(time.time())
        system_prompt = next(
            (
                message.get("content", "")
                for message in request.messages
                if message.get("role") == "system" and isinstance(message.get("content"), str)
            ),
            "",
        )
        user_message = next(
            (
                message
                for message in reversed(request.messages)
                if message.get("role") == "user" and isinstance(message.get("content"), list)
            ),
            None,
        )

        if not user_message:
            raise ValueError("FastVLM requires a user message with text and image content")

        text_prompt = ""
        image_url = ""
        for item in user_message["content"]:
            if item.get("type") == "text":
                text_prompt = item.get("text", "")
            elif item.get("type") == "image_url":
                image_url = item.get("image_url", {}).get("url", "")

        final_prompt = (
            f"{system_prompt}\n\nUser request: {text_prompt}".strip()
            if system_prompt
            else (text_prompt or "Describe this image.")
        )
        content = InferenceService._run_fastvlm(
            image_url=image_url,
            prompt=final_prompt,
            max_new_tokens=request.max_tokens or 128,
        )
        completion_tokens = max(len(content.split()), 1)
        prompt_tokens = max(len(final_prompt.split()), 1)
        return {
            "id": f"chatcmpl-fastvlm-{started_at}",
            "object": "chat.completion",
            "created": started_at,
            "model": request.model,
            "choices": [
                {
                    "index": 0,
                    "message": {"role": "assistant", "content": content},
                    "finish_reason": "stop",
                }
            ],
            "usage": {
                "prompt_tokens": prompt_tokens,
                "completion_tokens": completion_tokens,
                "total_tokens": prompt_tokens + completion_tokens,
            },
        }

    @staticmethod
    def _load_fastvlm():
        _ensure_ml_deps()
        if (
            InferenceService._fastvlm_tokenizer is not None
            and InferenceService._fastvlm_model is not None
        ):
            return InferenceService._fastvlm_tokenizer, InferenceService._fastvlm_model

        tokenizer = AutoTokenizer.from_pretrained(
            FASTVLM_MODEL_DIR, trust_remote_code=True, local_files_only=True
        )
        dtype = torch.float16 if torch.cuda.is_available() else torch.float32
        model = AutoModelForCausalLM.from_pretrained(
            FASTVLM_MODEL_DIR,
            trust_remote_code=True,
            local_files_only=True,
            torch_dtype=dtype,
        )
        if torch.cuda.is_available():
            model = model.to("cuda")
        model.eval()

        InferenceService._fastvlm_tokenizer = tokenizer
        InferenceService._fastvlm_model = model
        return tokenizer, model

    @staticmethod
    def _load_image(image_url: str) -> "Image.Image":
        _ensure_ml_deps()
        if image_url.startswith("data:image"):
            _, encoded = image_url.split(",", 1)
            return Image.open(io.BytesIO(base64.b64decode(encoded))).convert("RGB")

        if image_url.startswith("http://") or image_url.startswith("https://"):
            response = requests.get(image_url, timeout=15)
            response.raise_for_status()
            return Image.open(io.BytesIO(response.content)).convert("RGB")

        return Image.open(image_url).convert("RGB")

    @staticmethod
    def _run_fastvlm(image_url: str, prompt: str, max_new_tokens: int) -> str:
        tokenizer, model = InferenceService._load_fastvlm()
        image = InferenceService._load_image(image_url)

        messages = [{"role": "user", "content": f"<image>\n{prompt}"}]
        rendered = tokenizer.apply_chat_template(
            messages, add_generation_prompt=True, tokenize=False
        )
        pre, post = rendered.split("<image>", 1)
        pre_ids = tokenizer(
            pre, return_tensors="pt", add_special_tokens=False
        ).input_ids
        post_ids = tokenizer(
            post, return_tensors="pt", add_special_tokens=False
        ).input_ids
        image_token = torch.tensor([[IMAGE_TOKEN_INDEX]], dtype=pre_ids.dtype)
        input_ids = torch.cat([pre_ids, image_token, post_ids], dim=1).to(
            model.device
        )
        attention_mask = torch.ones_like(input_ids, device=model.device)
        pixel_values = model.get_vision_tower().image_processor(
            images=image, return_tensors="pt"
        )["pixel_values"].to(model.device, dtype=model.dtype)

        with torch.no_grad():
            output = model.generate(
                inputs=input_ids,
                attention_mask=attention_mask,
                images=pixel_values,
                max_new_tokens=max_new_tokens,
            )

        generated = output[0][input_ids.shape[1] :]
        return tokenizer.decode(generated, skip_special_tokens=True).strip()

    @staticmethod
    def _mock_response(request: ChatRequestSchema) -> dict:
        last_msg = request.messages[-1]["content"]
        if isinstance(last_msg, list):
            text_part = next(
                (item["text"] for item in last_msg if item["type"] == "text"),
                "image analysis",
            )
            mock_content = f"[Mock VLM] Simulated vision analysis from {request.model}: I see an image. Based on your request '{text_part}', this appears to be a normal scene."
        else:
            mock_content = f"[Mock] Simulated response from {request.model}: I understand your request regarding '{last_msg}'."

        time.sleep(0.5)

        return {
            "id": "chatcmpl-mock",
            "object": "chat.completion",
            "created": int(time.time()),
            "model": request.model,
            "choices": [
                {
                    "index": 0,
                    "message": {"role": "assistant", "content": mock_content},
                    "finish_reason": "stop",
                }
            ],
            "usage": {"prompt_tokens": 10, "completion_tokens": 10, "total_tokens": 20},
        }
