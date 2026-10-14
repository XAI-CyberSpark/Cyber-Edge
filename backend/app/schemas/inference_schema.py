from pydantic import BaseModel, Field
from typing import List, Optional, Literal


class ChatMessage(BaseModel):
    role: str = Field(..., description="Role of the sender (user, assistant, system)")
    content: str | list = Field(
        ..., description="Message content (text or multimodal list)"
    )


class ChatRequestSchema(BaseModel):
    provider_id: Optional[Literal["minimax", "openai", "anthropic", "deepseek"]] = None
    json_mode: bool = False
    model: str = Field(..., description="Model identifier (e.g., llama3, llava)")
    messages: List[dict] = Field(..., description="List of chat messages")
    temperature: Optional[float] = Field(0.7, description="Sampling temperature")
    max_tokens: Optional[int] = Field(128, description="Max tokens to generate")


class ChatChoice(BaseModel):
    index: int
    message: dict
    finish_reason: str


class ChatUsage(BaseModel):
    prompt_tokens: int
    completion_tokens: int
    total_tokens: int


class ChatResponseSchema(BaseModel):
    id: str
    object: str = "chat.completion"
    created: int
    model: str
    choices: List[ChatChoice]
    usage: ChatUsage


class VLMRequestSchema(BaseModel):
    image_url: str = Field(..., description="Image URL, data URL, or local file path")
    prompt: str = Field(..., description="Prompt for image understanding")
    model: str = Field("apple/FastVLM-0.5B", description="VLM model identifier")
    max_new_tokens: Optional[int] = Field(512, description="Max tokens to generate")


class VLMResponseSchema(BaseModel):
    id: str
    created: int
    model: str
    text: str
    usage: ChatUsage
