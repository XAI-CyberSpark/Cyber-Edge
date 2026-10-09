from __future__ import annotations

from typing import Any, Dict, List, Optional, Literal

from pydantic import BaseModel, Field

from app.schemas.project_schema import ProjectSchema
from app.schemas.execution_schema import ExecutionPlan
from app.services.model_reasoning import ReasoningSettings


class WorkflowTestResultSchema(BaseModel):
    name: str = Field(..., description="Test name")
    passed: bool = Field(..., description="Whether the test passed")
    details: str = Field(..., description="Human-readable test details")


class WorkflowValidationSchema(BaseModel):
    passed: bool = Field(..., description="Whether validation passed")
    errors: List[str] = Field(default_factory=list, description="Blocking validation errors")
    warnings: List[str] = Field(default_factory=list, description="Non-blocking warnings")


class WorkflowConversationTurnSchema(BaseModel):
    role: str = Field(..., description="Conversation role: user or assistant")
    content: str = Field(..., description="Conversation content")


class WorkflowGenerateRequestSchema(BaseModel):
    reasoning: ReasoningSettings | None = None
    agent_mode: Literal["single", "team"] | None = Field(default=None, description="Hermes authoring mode; omitted uses server default. Both modes keep the same graph execution and acceptance gates.")
    acceptance_tests: ExecutionPlan | None = Field(default=None, description='Optional caller-owned input sequences and assertions; models cannot change these expectations.')
    provider_id: Literal["minimax", "openai", "anthropic"] = "minimax"
    prompt: str = Field(..., description="Natural language workflow requirement")
    project_name: Optional[str] = Field(None, description="Preferred project name")
    current_project: Optional[ProjectSchema] = Field(
        None, description="Existing project to edit or extend"
    )
    save_on_success: bool = Field(
        False, description="Persist the generated project JSON if all tests pass"
    )
    overwrite: bool = Field(
        False, description="Whether to overwrite an existing JSON file when saving"
    )
    model: Optional[str] = Field(None, description="Override model used for orchestration")
    provider_base_url: Optional[str] = Field(
        None, description="Override OpenAI-compatible base URL"
    )
    conversation_history: List[WorkflowConversationTurnSchema] = Field(
        default_factory=list,
        description="Conversation turns for persistent iterative orchestration chat",
    )


class MapStoryboardLandmarkSchema(BaseModel):
    id: str
    label: str
    kind: str = Field(..., description="home|school|road|ramp|poi")
    x: float = Field(..., ge=0, le=100)
    y: float = Field(..., ge=0, le=100)
    note: Optional[str] = None


class MapStoryboardSegmentSchema(BaseModel):
    id: str
    label: str
    from_id: str
    to_id: str
    road_type: str = Field("ground", description="ground|elevated")
    duration_ms: int = Field(3000, ge=500, le=20000)
    narrative: Optional[str] = None


class MapStoryboardEventSchema(BaseModel):
    id: str
    label: str
    event_type: str = Field("narration", description="depart|merge|pickup|return|narration")
    message: str = ""
    segment_id: Optional[str] = None
    x: Optional[float] = Field(None, ge=0, le=100)
    y: Optional[float] = Field(None, ge=0, le=100)


class MapStoryboardSubtitleCueSchema(BaseModel):
    id: str
    label: str = ""
    start_ms: int = Field(0, ge=0, le=120000)
    end_ms: int = Field(4000, ge=0, le=120000)
    segment_id: Optional[str] = None
    event_id: Optional[str] = None
    location_label: str = ""
    trigger: str = ""
    active_nodes: List[str] = Field(default_factory=list)
    decision: str = ""
    narration: str = ""


class MapStoryboardSchema(BaseModel):
    title: str
    summary: str = ""
    duration_ms: int = Field(16000, ge=2000, le=120000)
    viewport: str = Field("topdown", description="topdown")
    source: str = Field("llm", description="llm|fallback")
    landmarks: List[MapStoryboardLandmarkSchema] = Field(default_factory=list)
    segments: List[MapStoryboardSegmentSchema] = Field(default_factory=list)
    events: List[MapStoryboardEventSchema] = Field(default_factory=list)
    subtitle_cues: List[MapStoryboardSubtitleCueSchema] = Field(default_factory=list)


class WorkflowGenerateResponseSchema(BaseModel):
    build_report: Optional[Dict[str, Any]] = None
    project_name: str
    project: ProjectSchema
    documentation_markdown: str = Field(
        ..., description="Generated workflow documentation"
    )
    validation: WorkflowValidationSchema
    tests: List[WorkflowTestResultSchema] = Field(default_factory=list)
    provider: Dict[str, Any] = Field(default_factory=dict)
    used_live_model: bool = Field(
        False, description="Whether a remote model call was used successfully"
    )
    map_storyboard: Optional[MapStoryboardSchema] = None
    saved_project: Optional[ProjectSchema] = None
    documentation_file: Optional[str] = None
    chat_reply: Optional[str] = Field(
        None,
        description="Conversational reply when the user input is not a workflow/scene request",
    )
