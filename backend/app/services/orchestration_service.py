from __future__ import annotations

import json
import re
import time
import urllib.request
from pathlib import Path
from typing import Any, Dict, List

import httpx
from fastapi import HTTPException
from openai import OpenAI

from app.schemas.orchestration_schema import (
    MapStoryboardSchema,
    WorkflowGenerateRequestSchema,
    WorkflowGenerateResponseSchema,
    WorkflowTestResultSchema,
    WorkflowValidationSchema,
)
from app.schemas.project_schema import ProjectSaveSchema, ProjectSchema
from app.services.project_service import ProjectService
from app.services.node_capability_service import CATALOG, validate_capabilities


SUPPORTED_NODE_TYPES = {
    "input": {
        "description": "用户文本/图像输入",
        "default_data": {"label": "用户输入", "status": "idle"},
    },
    "systemInput": {
        "description": "系统输入，如 camera/microphone/can/sensor",
        "default_data": {
            "label": "系统输入",
            "status": "idle",
            "inputType": "camera",
        },
    },
    "memory": {
        "description": "记忆节点，支持 buffer 或 vector",
        "default_data": {"label": "短期记忆", "status": "idle", "type": "buffer", "window": 10},
    },
    "llm": {
        "description": "大模型或视觉模型节点",
        "default_data": {
            "label": "LLM",
            "status": "idle",
            "category": "llm",
            "inferenceSource": "api",
            "model": "MiniMax-M3",
            "apiModel": "MiniMax-M3",
            "systemPrompt": "",
        },
    },
    "recognition": {
        "description": "结构化识别结果节点，输出目标、状态与置信度",
        "default_data": {
            "label": "识别结果",
            "status": "idle",
            "targets": [],
            "threshold": 0.8,
            "confidence": 0.92,
            "defaultResult": {},
            "fallbackResult": {"status": "unknown"},
            "fallbackConfidence": 0.45,
        },
    },
    "logic": {
        "description": "条件判断节点，支持 if/filter",
        "default_data": {"label": "条件判断", "status": "idle", "type": "if", "condition": ""},
    },
    "tool": {
        "description": "通用工具/外部接口节点",
        "default_data": {"label": "工具节点", "status": "idle", "tool": "api_call"},
    },
    "car_control": {
        "description": "车控节点，操作灯光/车窗/座椅等",
        "default_data": {
            "label": "Car Control",
            "status": 0,
            "device_type": "car",
            "action": "vehicleControl.set.WINDOW_POSITION",
            "parameter": "endpoint=control,module=vehicleControl,function=set,signal=WINDOW_POSITION,area=0,status=0",
            "endpoint": "control",
            "module": "vehicleControl",
            "function": "set",
            "signalKey": "WINDOW_POSITION",
            "level": 1,
            "area": 0,
            "targetStatus": 0,
            "baseUrlTemplate": "http://<device-ip>:8080",
        },
    },
    "output": {
        "description": "最终文本或动作输出",
        "default_data": {"label": "最终回复", "status": "idle"},
    },
    "fallback": {
        "description": "识别失败或低置信度时的兜底回复",
        "default_data": {
            "label": "兜底回复",
            "status": "idle",
            "trigger": "未识别或低置信度",
            "responseText": "暂时无法可靠识别，请用户确认后再继续。",
        },
    },
    "cockpit_alert": {
        "description": "座舱 HMI 安全提醒，支持一次语音与实时后排影像，不执行车控",
        "default_data": {
            "label": "一次性座舱警示",
            "status": "idle",
            "voicePrompt": "儿童危险，请注意后排。",
            "liveRearCamera": True,
            "displayDurationMs": 5000,
            "noRepeat": True,
        },
    },
    "risk_monitor": {
        "description": "风险解除复核与告警抑制节点，到时后继续后台静默监测",
        "default_data": {
            "label": "5 秒风险复核",
            "status": "idle",
            "durationMs": 5000,
            "silentAfterTimeout": True,
        },
    },
    "event_log": {
        "description": "记录座舱安全事件，供用户主动复盘，不打扰驾驶员",
        "default_data": {"label": "安全事件记录", "status": "idle"},
    },
}

for _kind in ('wait','state','stage'):
    SUPPORTED_NODE_TYPES[_kind] = {'description': CATALOG['nodes'][_kind]['description'], 'default_data': {'label':CATALOG['nodes'][_kind]['name']}}

# One audited catalog controls both generation descriptions and Studio inspection.
SUPPORTED_NODE_TYPES['video_display'] = {'description': '中控展示本地后排视频回放', 'default_data': {'label': '中控展示后排视频', 'source': 'local_replay'}}

SUPPORTED_NODE_TYPES['interaction'] = {'description': '持续互动', 'default_data': {'label': '分阶段互动', 'plan': {'mode': 'live', 'model': 'MiniMax-M3', 'premise': '乘客文字互动，驾驶员专注驾驶', 'steps': [{'id':'chapter1','title':'第一章','brief':'创作一个简短谜题，答案不提前公开','waitFor':'answer'}], 'ending':'本次互动结束。'}}}

for _kind, _spec in SUPPORTED_NODE_TYPES.items():
    _contract = CATALOG['nodes'][_kind]
    _spec['description'] = _contract['description']
    _spec['contract'] = _contract
SUPPORTED_NODE_TYPES['recognition']['default_data']['resultSource'] = 'vision'


START_NODE_TYPES = {"input", "systemInput"}
TERMINAL_NODE_TYPES = {"interaction", "output", "tool", "car_control", "fallback", "event_log"}


class OrchestrationService:
    @staticmethod
    def _debug_report(hypothesis_id: str, location: str, msg: str, data: Dict[str, Any] | None = None) -> None:
        # #region debug-point A:report
        try:
            _p = ".dbg/orchestration-timeout.env"
            _u = "http://127.0.0.1:7777/event"
            _s = "orchestration-timeout"
            with open(_p, "r", encoding="utf-8") as _f:
                _c = _f.read()
                for _line in _c.splitlines():
                    if _line.startswith("DEBUG_SERVER_URL="):
                        _u = _line.split("=", 1)[1].strip() or _u
                    elif _line.startswith("DEBUG_SESSION_ID="):
                        _s = _line.split("=", 1)[1].strip() or _s
            urllib.request.urlopen(
                urllib.request.Request(
                    _u,
                    data=json.dumps(
                        {
                            "sessionId": _s,
                            "runId": "pre-fix",
                            "hypothesisId": hypothesis_id,
                            "location": location,
                            "msg": msg,
                            "data": data or {},
                            "ts": int(time.time() * 1000),
                        }
                    ).encode(),
                    headers={"Content-Type": "application/json"},
                ),
                timeout=2,
            ).read()
        except Exception:
            pass
        # #endregion

    @staticmethod
    def _candidate_api_key_paths() -> List[Path]:
        import os

        candidate_paths: List[Path] = []
        explicit_file = (os.getenv("WORKFLOW_LLM_API_KEY_FILE") or "").strip()
        if explicit_file:
            candidate_paths.append(Path(explicit_file))

        current = Path(__file__).resolve()
        for parent in list(current.parents)[:6]:
            candidate_paths.append(parent / "API_KEY.txt")

        try:
            cwd = Path.cwd().resolve()
            candidate_paths.append(cwd / "API_KEY.txt")
            for parent in list(cwd.parents)[:4]:
                candidate_paths.append(parent / "API_KEY.txt")
        except Exception:
            pass

        # Also scan sibling OAKEgde Studio workspaces so 3.1 can reuse an existing API_KEY.txt
        # from nearby 2.x/3.0 project roots without changing the frontend layout or startup flow.
        try:
            search_roots = []
            current_file = Path(__file__).resolve()
            search_roots.extend(list(current_file.parents)[:4])
            if "cwd" in locals():
                search_roots.extend([cwd, *list(cwd.parents)[:4]])

            seen_roots = set()
            for root in search_roots:
                root_key = str(root)
                if root_key in seen_roots or not root.exists():
                    continue
                seen_roots.add(root_key)
                parent_dir = root.parent
                if not parent_dir.exists():
                    continue

                for sibling in parent_dir.iterdir():
                    if not sibling.is_dir():
                        continue
                    name = sibling.name.lower()
                    if "cyber-edge-agent" in name:
                        candidate_paths.append(sibling / "API_KEY.txt")
        except Exception:
            pass

        return candidate_paths

    @staticmethod
    def _resolve_api_key_from_files() -> str:
        candidate_paths = OrchestrationService._candidate_api_key_paths()
        seen = set()
        for path in candidate_paths:
            normalized = str(path.resolve()) if path.exists() else str(path)
            if normalized in seen:
                continue
            seen.add(normalized)
            if path.exists():
                value = path.read_text(encoding="utf-8").strip()
                if value:
                    return value
        return ""

    @staticmethod
    def generate_workflow(
        request: WorkflowGenerateRequestSchema,
    ) -> WorkflowGenerateResponseSchema:
        started_at = time.time()
        api_key = OrchestrationService._resolve_api_key()
        base_url = (
            request.provider_base_url
            or OrchestrationService._resolve_base_url()
        )
        model = request.model or OrchestrationService._resolve_model()
        provider = {
            "base_url": base_url,
            "model": model,
            "api_key_configured": bool(api_key),
        }
        # #region debug-point A:generate-entry
        OrchestrationService._debug_report(
            "A",
            "orchestration_service.generate_workflow:entry",
            "[DEBUG] orchestration request started",
            {
                "prompt_chars": len(request.prompt or ""),
                "history_count": len(request.conversation_history or []),
                "has_current_project": bool(request.current_project),
                "current_project_nodes": len((request.current_project.nodes if request.current_project else []) or []),
                "current_project_edges": len((request.current_project.edges if request.current_project else []) or []),
                "model": model,
                "base_url": base_url,
            },
        )
        # #endregion

        if not api_key:
            return OrchestrationService._generate_local_template(request)

        # --- 对话意图路由：检测是否为日常对话（非工作流/场景描述） ---
        if OrchestrationService._is_casual_chat(request.prompt):
            return OrchestrationService._generate_chat_reply(
                request=request,
                base_url=base_url,
                api_key=api_key,
                model=model,
                provider=provider,
            )

        prompt_messages = OrchestrationService._build_messages(request)
        raw_text = OrchestrationService._chat_completion(
            base_url=base_url,
            api_key=api_key,
            model=model,
            messages=prompt_messages,
        )
        # #region debug-point A:workflow-generated
        OrchestrationService._debug_report(
            "A",
            "orchestration_service.generate_workflow:workflow_generated",
            "[DEBUG] workflow model response received",
            {
                "elapsed_ms": int((time.time() - started_at) * 1000),
                "raw_text_chars": len(raw_text or ""),
            },
        )
        # #endregion
        # 去除 MiniMax 返回的 <think>...</think> 标签
        raw_text = re.sub(r"<think>[\s\S]*?</think>\s*", "", raw_text or "").strip()
        payload = OrchestrationService._parse_model_payload(raw_text)
        project = OrchestrationService._normalize_project_payload(payload, request)
        validation = OrchestrationService._validate_project(project, request.prompt)
        tests = OrchestrationService._run_tests(project, validation, raw_text)
        documentation = OrchestrationService._build_documentation(payload, project, tests, request.prompt)

        saved_project = None
        documentation_file = None
        if request.save_on_success and validation.passed and all(test.passed for test in tests):
            saved_project = ProjectService.save_project(
                ProjectSaveSchema(
                    id=request.current_project.id if request.current_project else None,
                    name=project.name,
                    file_name=project.file_name,
                    overwrite=request.overwrite,
                    nodes=project.nodes,
                    edges=project.edges,
                    meta=project.meta,
                )
            )
            documentation_file = OrchestrationService._save_documentation(saved_project, documentation)

        try:
            map_started_at = time.time()
            map_storyboard = OrchestrationService._generate_map_storyboard(
                request=request,
                project=project,
                provider_base_url=base_url,
                model=model,
                api_key=api_key,
            )
            # #region debug-point B:map-generated
            OrchestrationService._debug_report(
                "B",
                "orchestration_service.generate_workflow:map_generated",
                "[DEBUG] map storyboard generated",
                {
                    "elapsed_ms": int((time.time() - map_started_at) * 1000),
                    "segment_count": len(map_storyboard.segments or []),
                    "landmark_count": len(map_storyboard.landmarks or []),
                    "source": map_storyboard.source,
                },
            )
            # #endregion
        except Exception as exc:
            # #region debug-point B:map-fallback
            OrchestrationService._debug_report(
                "B",
                "orchestration_service.generate_workflow:map_fallback",
                "[DEBUG] map storyboard generation failed, fallback used",
                {
                    "error_type": type(exc).__name__,
                    "error": str(exc)[:300],
                },
            )
            # #endregion
            map_storyboard = OrchestrationService._build_fallback_map_storyboard(request.prompt, project.name)

        # #region debug-point A:generate-exit
        OrchestrationService._debug_report(
            "A",
            "orchestration_service.generate_workflow:exit",
            "[DEBUG] orchestration request finished",
            {
                "elapsed_ms": int((time.time() - started_at) * 1000),
                "project_name": project.name,
                "node_count": len(project.nodes or []),
                "edge_count": len(project.edges or []),
            },
        )
        # #endregion
        return WorkflowGenerateResponseSchema(
            project_name=project.name,
            project=project,
            documentation_markdown=documentation,
            validation=validation,
            tests=tests,
            provider=provider,
            used_live_model=True,
            map_storyboard=map_storyboard,
            saved_project=saved_project,
            documentation_file=documentation_file,
        )

    @staticmethod
    def _is_casual_chat(prompt: str) -> bool:
        """判断用户输入是否为日常对话而非工作流/场景描述请求。"""
        text = (prompt or "").strip()
        if not text:
            return True
        # 太短且不含关键词 → 大概率是闲聊
        workflow_keywords = (
            "流程", "场景", "工作流", "监控", "节点", "设计", "搭建", "创建",
            "识别", "检测", "控制", "助手", "系统", "输入", "输出", "触发",
            "告警", "车", "座舱", "儿童", "安全", "语音", "对话", "生成",
            "摄像", "传感", "接送", "放学", "驾驶", "提醒", "workflow",
            "node", "edge", "agent", "pipeline", "monitor",
        )
        has_keyword = any(kw in text.lower() for kw in workflow_keywords)
        # 如果有工作流关键词，认为是场景描述
        if has_keyword:
            return False
        # 短文本（<15字）且无关键词 → 闲聊
        if len(text) < 15:
            return True
        # 中等长度但无关键词，仍可能是场景描述，宽容处理
        # 超过30字的输入即使没关键词也可能是长描述，让它走工作流
        if len(text) > 30:
            return False
        return True

    @staticmethod
    def _generate_chat_reply(
        *,
        request: "WorkflowGenerateRequestSchema",
        base_url: str,
        api_key: str,
        model: str,
        provider: dict,
    ) -> "WorkflowGenerateResponseSchema":
        """对日常对话生成友好回复，不走工作流编排。"""
        chat_system = (
            "你是 OAKEgde Studio 的智能助手。"
            "用户正在使用一个智能座舱 AI Agent 编排平台。"
            "如果用户只是打招呼或闲聊，请友好回复并引导他们描述想要搭建的场景。"
            "回复要简洁(2-3句话)，告诉用户可以描述具体场景来生成节点。"
            "用中文回复。"
        )
        chat_messages = [
            {"role": "system", "content": chat_system},
        ]
        # 追加历史对话
        for turn in request.conversation_history or []:
            role = turn.role if turn.role in ("user", "assistant") else "user"
            content = (turn.content or "").strip()
            if content:
                chat_messages.append({"role": role, "content": content})
        chat_messages.append({"role": "user", "content": request.prompt})

        try:
            reply_text = OrchestrationService._chat_completion(
                base_url=base_url,
                api_key=api_key,
                model=model,
                messages=chat_messages,
            )
            # 去除 MiniMax 返回的 <think>...</think> 标签
            reply_text = re.sub(r"<think>[\s\S]*?</think>\s*", "", reply_text).strip()
        except Exception:
            reply_text = (
                "你好! 我是 OAKEgde Studio 的编排助手。"
                "你可以描述一个具体场景，比如[设计一个儿童探窗安全监控流程]，"
                "我会帮你生成对应的节点和连线。"
            )

        # 构造一个"无变更"的响应，将对话回复放在 chat_reply 字段
        current = request.current_project
        if current:
            empty_project = current
        else:
            import uuid
            empty_project = ProjectSchema(
                id=str(uuid.uuid4()),
                name=request.project_name or "chat",
                file_name=None,
                nodes=[],
                edges=[],
                meta={},
            )

        return WorkflowGenerateResponseSchema(
            project_name=empty_project.name or "对话",
            project=empty_project,
            documentation_markdown="",
            validation=WorkflowValidationSchema(passed=True, errors=[], warnings=[]),
            tests=[],
            provider=provider,
            used_live_model=True,
            map_storyboard=None,
            saved_project=None,
            documentation_file=None,
            chat_reply=reply_text,
        )

    @staticmethod
    def _generate_local_template(
        request: WorkflowGenerateRequestSchema,
    ) -> WorkflowGenerateResponseSchema:
        """Build a usable offline workflow when no remote orchestration model is configured."""
        prompt = (request.prompt or "").strip() or "创建一个基础车载助手工作流"
        prompt_lower = prompt.lower()
        project_name = (
            request.project_name
            or (request.current_project.name if request.current_project else None)
            or "本地编排工作流"
        )

        nodes: List[Dict[str, Any]] = [
            {
                "id": "local_input",
                "type": "input",
                "position": {"x": 80, "y": 180},
                "data": {"label": "用户输入", "status": "idle"},
            },
            {
                "id": "local_llm",
                "type": "llm",
                "position": {"x": 360, "y": 180},
                "data": {
                    "label": "本地编排助手",
                    "status": "idle",
                    "category": "llm",
                    "inferenceSource": "local_template",
                    "model": "local-template",
                    "apiModel": "local-template",
                    "systemPrompt": "根据用户需求规划工作流；真实模型配置后会自动替换为远程编排。",
                },
            },
        ]
        edges: List[Dict[str, Any]] = [
            {"id": "local_edge_input_llm", "source": "local_input", "target": "local_llm", "type": "smoothstep"},
        ]
        previous_id = "local_llm"

        if any(token in prompt_lower for token in ("记忆", "记住", "memory", "上下文", "历史")):
            nodes.append(
                {
                    "id": "local_memory",
                    "type": "memory",
                    "position": {"x": 640, "y": 70},
                    "data": {"label": "短期记忆", "status": "idle", "type": "buffer", "window": 10},
                }
            )
            edges.append({"id": "local_edge_llm_memory", "source": previous_id, "target": "local_memory", "type": "smoothstep"})
            previous_id = "local_memory"

        control = OrchestrationService._local_control_for_prompt(prompt_lower)
        if control:
            nodes.append(
                {
                    "id": "local_safety_gate",
                    "type": "logic",
                    "position": {"x": 640, "y": 220},
                    "data": {
                        "label": "安全条件判断",
                        "status": "idle",
                        "type": "if",
                        "condition": "vehicle_safe == true",
                    },
                }
            )
            edges.append({"id": "local_edge_to_safety", "source": previous_id, "target": "local_safety_gate", "type": "smoothstep"})
            previous_id = "local_safety_gate"
            nodes.append(
                {
                    "id": "local_car_control",
                    "type": "car_control",
                    "position": {"x": 930, "y": 110},
                    "data": control,
                }
            )
            edges.append(
                {
                    "id": "local_edge_safety_control",
                    "source": previous_id,
                    "target": "local_car_control",
                    "type": "smoothstep",
                    "sourceHandle": "true",
                }
            )

        nodes.append(
            {
                "id": "local_output",
                "type": "output",
                "position": {"x": 930, "y": 300},
                "data": {"label": "向用户确认", "status": "idle"},
            }
        )
        edges.append({"id": "local_edge_to_output", "source": previous_id, "target": "local_output", "type": "smoothstep"})

        template_meta: Dict[str, Any] = {"mode": "local_template"}
        summary = "本地模板根据当前需求生成的可编辑工作流。配置远程模型后，将自动使用真实 AI 编排。"
        local_documentation_note = "当前未配置远程模型密钥，因此系统生成了一个可继续编辑、校验和部署的本地工作流模板。"

        # Child-care prompts use the same product-facing chain as the scene-library
        # template: input -> model -> recognition -> decision -> reply/fallback.
        # This keeps conversational creation and canvas templates semantically aligned.
        if any(token in prompt_lower for token in ("带娃", "儿童", "后排", "安全带", "child")):
            template = json.loads(Path(__file__).with_name("child_care_template.json").read_text(encoding="utf-8"))
            nodes, edges = template["nodes"], template["edges"]
            template_meta = template["meta"]
            summary = "已生成单张座舱图片判断流程：风险、未见明确风险、无法判断分别反馈并记录。"
            local_documentation_note = "编排使用固定模板，识别需要真实 OpenSparX 服务；尚未验证模型准确率。没有实时视频、语音播报或连续监测。"

        payload = {
            "project_name": project_name,
            "summary": summary,
            "documentation_markdown": (
                f"# {project_name}\n\n"
                "## 本地编排结果\n\n"
                f"需求：{prompt}\n\n"
                f"{local_documentation_note}"
            ),
            "test_cases": ["节点类型有效", "输入节点可到达输出节点"],
            "workflow": {"nodes": nodes, "edges": edges, "meta": template_meta},
        }
        project = OrchestrationService._normalize_project_payload(payload, request)
        project.meta = {
            **(project.meta or {}),
            "generated_by": "local_template_fallback",
            "orchestration_mode": "local_template",
        }
        validation = OrchestrationService._validate_project(project, prompt)
        tests = [
            WorkflowTestResultSchema(
                name="local_template_generation",
                passed=True,
                details="未配置远程模型时，已生成本地可编辑工作流模板。",
            ),
            WorkflowTestResultSchema(
                name="schema_validation",
                passed=validation.passed,
                details="结构与配置检查通过；未执行业务测试。" if validation.passed else "结构或配置检查失败。",
            ),
            WorkflowTestResultSchema(
                name="graph_connectivity",
                passed=OrchestrationService._has_reachable_terminal(project),
                details="至少存在一条从输入节点到终点节点的可达路径。",
            ),
        ]
        documentation = OrchestrationService._build_documentation(payload, project, tests, prompt)
        map_storyboard = OrchestrationService._build_fallback_map_storyboard(prompt, project.name)

        saved_project = None
        documentation_file = None
        if request.save_on_success and validation.passed and all(test.passed for test in tests):
            saved_project = ProjectService.save_project(
                ProjectSaveSchema(
                    id=request.current_project.id if request.current_project else None,
                    name=project.name,
                    file_name=project.file_name,
                    overwrite=request.overwrite,
                    nodes=project.nodes,
                    edges=project.edges,
                    meta=project.meta,
                )
            )
            documentation_file = OrchestrationService._save_documentation(saved_project, documentation)

        return WorkflowGenerateResponseSchema(
            project_name=project.name,
            project=project,
            documentation_markdown=documentation,
            validation=validation,
            tests=tests,
            provider={
                "base_url": "local://template-fallback",
                "model": "local-template",
                "api_key_configured": False,
                "mode": "local_template",
            },
            used_live_model=False,
            map_storyboard=map_storyboard,
            saved_project=saved_project,
            documentation_file=documentation_file,
        )

    @staticmethod
    def _local_control_for_prompt(prompt: str) -> Dict[str, Any] | None:
        controls = [
            (("座椅", "seat"), "座椅加热控制", "seat.set.SEAT_HEAT_STATUS_0", "seat", "SEAT_HEAT_STATUS_0"),
            (("氛围灯", "灯光", "light"), "氛围灯控制", "light.set.AMBIENCE_LIGHT_EFFECT_OPERATIONAL_FEEDBACK", "light", "AMBIENCE_LIGHT_EFFECT_OPERATIONAL_FEEDBACK"),
            (("车窗", "window"), "车窗控制", "vehicleControl.set.WINDOW_POSITION", "vehicleControl", "WINDOW_POSITION"),
            (("空调", "温度", "ac", "hvac"), "空调控制", "hvac.set.HVAC_TEMPERATURE", "hvac", "HVAC_TEMPERATURE"),
        ]
        for keywords, label, action, module, signal_key in controls:
            if any(keyword in prompt for keyword in keywords):
                return {
                    "label": label,
                    "status": 0,
                    "device_type": "car",
                    "action": action,
                    "parameter": f"endpoint=control,module={module},function=set,signal={signal_key},level=1",
                    "endpoint": "control",
                    "module": module,
                    "function": "set",
                    "signalKey": signal_key,
                    "level": 1,
                    "area": 0,
                    "baseUrlTemplate": "http://<device-ip>:8080",
                }
        return None

    @staticmethod
    def _resolve_api_key() -> str:
        import os

        env_key = (
            os.getenv("WORKFLOW_LLM_API_KEY")
            or os.getenv("OPENAI_API_KEY")
            or ""
        ).strip()
        if env_key:
            return env_key

        return OrchestrationService._resolve_api_key_from_files()

    @staticmethod
    def _resolve_base_url() -> str:
        import os

        return (
            os.getenv("WORKFLOW_LLM_BASE_URL")
            or os.getenv("OPENAI_BASE_URL")
            or "https://api.minimaxi.com/v1"
        ).rstrip("/")

    @staticmethod
    def _resolve_model() -> str:
        import os

        return (
            os.getenv("WORKFLOW_LLM_MODEL")
            or os.getenv("OPENAI_MODEL")
            or "MiniMax-M3"
        )

    @staticmethod
    def _build_messages(request: WorkflowGenerateRequestSchema) -> List[Dict[str, str]]:
        catalog_lines = []
        for node_type, spec in SUPPORTED_NODE_TYPES.items():
            if not spec['contract']['generatable']:
                continue
            catalog_lines.append(
                f"- {node_type}: {spec['description']} default_data={json.dumps(spec['default_data'], ensure_ascii=False)}"
            )

        current_project_text = "无"
        if request.current_project:
            current_project_text = json.dumps(
                request.current_project.model_dump(),
                ensure_ascii=False,
                indent=2,
            )

        system_prompt = f"""
你是 OAKEgde Studio 的工作流编排助手。你的职责是：
1. 只使用平台现有节点类型进行编排。
2. 输出严格合法的 JSON，不要输出额外解释。
3. 如果用户要“编辑当前项目”，应尽量复用已有节点，只在必要时调整。
4. 返回的 workflow 必须包含 nodes 和 edges，结构兼容 React Flow / backend projects JSON。
5. 节点类型仅允许：
{chr(10).join(catalog_lines)}

输出 JSON 必须符合以下结构：
{{
  "project_name": "string",
  "summary": "一句话说明",
  "documentation_markdown": "markdown 文档",
  "test_cases": [
    {{
      "name": "测试名称",
      "input": "示例输入",
      "expected": "预期行为"
    }}
  ],
  "workflow": {{
    "nodes": [
      {{
        "id": "node_id",
        "type": "input|systemInput|memory|llm|recognition|logic|tool|car_control|output|fallback|cockpit_alert|risk_monitor|event_log|video_display|interaction",
        "position": {{"x": 0, "y": 0}},
        "data": {{}}
      }}
    ],
    "edges": [
      {{
        "id": "edge_id",
        "source": "node_a",
        "target": "node_b",
        "type": "smoothstep",
        "sourceHandle": "逻辑分支填写 true/false；模型或互动的失败路径填写 error；普通成功路径省略"
      }}
    ],
    "meta": {{
      "goal": "用户目标",
      "generated_by": "nl_orchestrator"
    }}
  }}
}}

约束：
- 每个 node 都必须有唯一 id。
- position 必须是数字。
- llm 节点必须有 data.model。为新节点显式配置 outputFormat：text（纯文本）、json（数据）、actions（动作）。auto 仅兼容旧项目。
- json 模式必须配置 outputFields，例如 {{"nav_needed":"boolean","summary":"string"}}。支持 string/number/boolean/array/object 的顶层类型检查，下游使用 input.data.nav_needed。通常不能把 json/text 节点直接连到工具或车控；例外是 executionMode="hmi_mock" 的 ambient_light.set/restore，以及 executionMode="hmi" 且显式 valueField 的共享控制节点。后者 controlId 取能力目录，输入 input.data[valueField] 必须匹配类型。
- actions 模式只返回 reply、action、actions（name/parameters），下游条件依据 input.actions 或 input.action，不可依据会被丢弃的任意字段。为文字内容建议 maxTokens=2048。
- llm/interaction 的失败分支使用 sourceHandle="error"，成功路径省略。fallback.trigger 只是说明，不能代替 error 连线；不能在成功路径同时执行失败反馈。
- 旅程、分章节游戏、等待回答等持续场景使用 input -> interaction。每个工作流一个 interaction，唯一输入直接进入互动；不要用 memory 冒充精确进度，不用环路或一次性 llm 输出替代等待。
- interaction.data.plan 契约：mode="live" 或 "authored"；premise 为体验背景；ending 为结束语；steps 为1–12阶段，阶段有唯一 id、title、waitFor="answer"/"continue"/"arrival"。
- live 模式 plan.model 使用已配置模型（例如 MiniMax-M3），每阶段 brief 描述创意要求，进入该阶段时真实生成内容。authored 模式每阶段 content 包含 message；answer 阶段必须另含 question、answers（简短等价答案数组）、hint，可选 reward。其他阶段不能含 question/answers。隐藏谜底，不在 message/question 提前公开。
- 阶段可选 acceptedAnswers（1–12个短答案）用于固定题目的正确答案；实时模型不得改写。模型自动生成的答案未经独立事实评测，不能称为已核验。
- interaction 已展示 HMI 和聊天回复，等待期间不执行下游，通常不需要再接 output。会话进度保留到页面刷新，支持暂停、继续、跳过、退出、重新开始、事件去重、失败保留进度。
- 回答正确后仅发反馈和线索，等待“下一站”才推进；continue 阶段同样等待“下一站”。“继续”只恢复暂停或重述当前阶段。“到达了/到达/到达啦/抵达”触发 arrival 后的章节；提前到达跳过前面可选游戏。“结束/退出/再见”结束互动。建议测试用例必须遵守这些真实语义，不可自造指令。
- 互动面向乘客，不要求驾驶员看屏、回答或操作；儿童保持就座。下一站/到达事件目前由聊天明确模拟，不能声称真实导航/GPS感知。无语音播报/图形游戏。不要编造年龄、起点、路程时长。
- 先保留有价值的创意，缺失执行能力在 meta.missing_capabilities 中列出需求确实需要而平台缺失的部分；不要列出用户不需要的车控。可另在 documentation_markdown 记录未来创新提案，不能把未接入能力伪装可运行节点。
- 儿童单帧视觉场景使用 input -> llm -> recognition -> logic -> output/fallback；recognition 必须配置 resultSource="vision"，上游模型必须返回 status(normal/risk/unknown)、confidence(0-1)、risk_action、summary 的 JSON。其他感知任务若无适配器，应说明能力缺失，不能捏造识别结果。
- logic 多分支的 edges 必须明确 sourceHandle="true" 或 "false"；filter 是数据处理，不是分支。
- systemInput 仅支持 weather（模拟天气与车窗）、camera/rear_camera（单帧图片）；不能声称接入实时传感器、CAN 或语音流。
- car_control 优先使用 action="windows", parameter="close_all"/"open_all"；指定车窗用 module="vehicleControl", function="set", signalKey="WINDOW_POSITION", area=0至6, targetStatus=0至100。氛围灯使用 action="ambient_light.set" 或 "ambient_light.restore"，executionMode="hmi_mock"，不填module/signalKey/function；set读取input.data的light_color(#RRGGBB)、light_brightness(0–100)、light_reason、pose_tips。已有HMI模拟即可完成本平台调灯体验，不要求真实车机。新页面共享控制使用 executionMode="hmi", controlId, controlValue, controlOperation="set"/"get"，不填 module/signalKey/function；可用 valueField 显式绑定上游 JSON。旧座椅加热/通风与遮阳帘 get/set 已接入共享状态。其他车型信号、subscribe 和自动泊车尚未接入。
- tool 仅允许 tool="music"/"nav"/"call_phone"，全部仅界面仿真；不可生成 api_call 伪装外部接口。
- 不生成 risk_monitor 连续监测、tts 播报等未接入能力。缺失能力写入 workflow.meta.missing_capabilities 数组，并在 summary 中说明，不能以预设成功替代。
- test_cases 只是建议用例，未实际运行，不得称为已通过测试。
- memory 节点建议使用 type=buffer, window=10。
- logic 节点若是 if，condition 写成 JavaScript 风格表达式，例如 input.intent === 'pickup_child'。
- 可以输出 tool/car_control 作为末端执行节点。
- 普通流程保留 output 便于展示；interaction 自带展示，不要增加重复输出。
- 如果用户需求涉及“接送孩子放学”，应优先使用 input -> memory -> llm -> logic/tool/output 这类结构。
- 不要使用不存在的节点类型。
""".strip()

        user_prompt = f"""
用户需求：
{request.prompt}

希望的项目名：
{request.project_name or "未指定"}

当前项目（如需编辑）：
{current_project_text}
""".strip()
        messages: List[Dict[str, str]] = [{"role": "system", "content": system_prompt}]

        for turn in request.conversation_history:
            role = turn.role if turn.role in {"user", "assistant"} else "user"
            content = (turn.content or "").strip()
            if content:
                messages.append({"role": role, "content": content})

        messages.append({"role": "user", "content": user_prompt})
        return messages

    @staticmethod
    def _chat_completion(
        *,
        base_url: str,
        api_key: str,
        model: str,
        messages: List[Dict[str, str]],
    ) -> str:
        started_at = time.time()
        def _is_auth_error(exc: Exception) -> bool:
            text = str(exc).lower()
            markers = (
                "401",
                "authorized_error",
                "authentication",
                "incorrect api key",
                "api secret key",
                "authorization",
            )
            return any(marker in text for marker in markers)

        def _is_timeout_error(exc: Exception) -> bool:
            text = str(exc).lower()
            markers = (
                "timed out",
                "timeout",
                "readtimeout",
                "connecttimeout",
            )
            return any(marker in text for marker in markers)

        extra_body: Dict[str, Any] = {}
        if model.startswith("MiniMax-") or "minimaxi.com" in base_url:
            # Structured workflow generation is latency-sensitive; avoid extra reasoning
            # features on the first pass so the UI can return JSON faster.
            extra_body["reasoning_split"] = False

        def _request(active_api_key: str, timeout_seconds: float, use_fast_mode: bool = False):
            with httpx.Client(
                trust_env=False,
                timeout=httpx.Timeout(timeout_seconds, connect=20.0, write=20.0, read=timeout_seconds),
            ) as http_client:
                client = OpenAI(
                    api_key=active_api_key,
                    base_url=base_url.rstrip("/"),
                    http_client=http_client,
                )
                kwargs: Dict[str, Any] = dict(
                    model=model,
                    messages=messages,
                    temperature=0.2,
                )
                if extra_body and not use_fast_mode:
                    kwargs["extra_body"] = extra_body
                return client.chat.completions.create(**kwargs)

        fallback_file_key = OrchestrationService._resolve_api_key_from_files()
        timeout_seconds = OrchestrationService._resolve_timeout_seconds()
        try:
            response = _request(api_key, timeout_seconds, False)
        except Exception as exc:
            # #region debug-point D:chat-exception
            OrchestrationService._debug_report(
                "D",
                "orchestration_service._chat_completion:exception",
                "[DEBUG] chat completion raised exception",
                {
                    "elapsed_ms": int((time.time() - started_at) * 1000),
                    "error_type": type(exc).__name__,
                    "error": str(exc)[:300],
                    "timeout_seconds": timeout_seconds,
                    "model": model,
                    "base_url": base_url,
                },
            )
            # #endregion
            if _is_timeout_error(exc):
                retry_timeout_seconds = max(timeout_seconds, 120.0)
                try:
                    response = _request(api_key, retry_timeout_seconds, True)
                except Exception as retry_exc:
                    # #region debug-point D:chat-timeout-retry-failed
                    OrchestrationService._debug_report(
                        "D",
                        "orchestration_service._chat_completion:timeout_retry_failed",
                        "[DEBUG] chat completion retry failed after timeout",
                        {
                            "elapsed_ms": int((time.time() - started_at) * 1000),
                            "error_type": type(retry_exc).__name__,
                            "error": str(retry_exc)[:300],
                            "retry_timeout_seconds": retry_timeout_seconds,
                        },
                    )
                    # #endregion
                    raise HTTPException(
                        status_code=504,
                        detail=(
                            "Workflow orchestration model call timed out. "
                            "Retry later or increase WORKFLOW_LLM_TIMEOUT_SECONDS. "
                            + str(retry_exc)[:300]
                        ),
                    ) from retry_exc
            elif _is_auth_error(exc) and fallback_file_key and fallback_file_key != api_key:
                try:
                    response = _request(fallback_file_key, timeout_seconds, False)
                except Exception as retry_exc:
                    if _is_timeout_error(retry_exc):
                        raise HTTPException(
                            status_code=504,
                            detail=(
                                "Workflow orchestration model call timed out after retrying with API_KEY.txt fallback. "
                                "Retry later or increase WORKFLOW_LLM_TIMEOUT_SECONDS. "
                                + str(retry_exc)[:300]
                            ),
                        ) from retry_exc
                    if _is_auth_error(retry_exc):
                        detail_prefix = "Workflow orchestration authentication failed. Check WORKFLOW_LLM_API_KEY / OPENAI_API_KEY or API_KEY.txt. "
                        raise HTTPException(
                            status_code=502,
                            detail=detail_prefix + str(retry_exc)[:300],
                        ) from retry_exc
                    raise HTTPException(
                        status_code=502,
                        detail="Workflow orchestration model call failed after API key fallback. " + str(retry_exc)[:300],
                    ) from retry_exc
            else:
                detail_prefix = (
                    "Workflow orchestration authentication failed. Check WORKFLOW_LLM_API_KEY / OPENAI_API_KEY or API_KEY.txt. "
                    if _is_auth_error(exc)
                    else "Workflow orchestration model call failed: "
                )
                raise HTTPException(
                    status_code=502,
                    detail=detail_prefix + str(exc)[:300],
                ) from exc

        # #region debug-point A:chat-success
        OrchestrationService._debug_report(
            "A",
            "orchestration_service._chat_completion:success",
            "[DEBUG] chat completion succeeded",
            {
                "elapsed_ms": int((time.time() - started_at) * 1000),
                "choice_count": len(response.choices or []),
                "model": model,
            },
        )
        # #endregion
        choices = response.choices or []
        if not choices:
            raise HTTPException(status_code=502, detail="Workflow orchestration model returned no choices")
        message = choices[0].message
        reasoning_details = getattr(message, "reasoning_details", None) or []
        if not message.content and reasoning_details:
            reasoning_text = "\n".join(
                item.get("text", "") if isinstance(item, dict) else ""
                for item in reasoning_details
                if isinstance(item, dict) and item.get("text")
            ).strip()
            if reasoning_text:
                return reasoning_text
        content = message.content
        if isinstance(content, list):
            text_parts = []
            for item in content:
                if isinstance(item, dict):
                    text_parts.append(item.get("text", ""))
                else:
                    text_value = getattr(item, "text", None)
                    if text_value:
                        text_parts.append(text_value)
            return "\n".join(part for part in text_parts if part).strip()
        if isinstance(content, str):
            return content.strip()
        raise HTTPException(status_code=502, detail="Workflow orchestration model returned unsupported content format")

    @staticmethod
    def _parse_model_payload(raw_text: str) -> Dict[str, Any]:
        candidates = [raw_text]
        fenced = re.findall(r"```(?:json)?\s*(\{[\s\S]*?\})\s*```", raw_text, re.IGNORECASE)
        candidates.extend(fenced)
        brace_match = re.search(r"(\{[\s\S]*\})", raw_text)
        if brace_match:
            candidates.append(brace_match.group(1))

        for candidate in candidates:
            try:
                parsed = json.loads(candidate)
                if isinstance(parsed, dict):
                    return parsed
            except Exception:
                continue
        raise HTTPException(status_code=502, detail="Workflow orchestration model returned invalid JSON")

    @staticmethod
    def _normalize_project_payload(
        payload: Dict[str, Any], request: WorkflowGenerateRequestSchema
    ) -> ProjectSchema:
        workflow = payload.get("workflow") or {}
        raw_nodes = workflow.get("nodes") or []
        raw_edges = workflow.get("edges") or []
        meta = workflow.get("meta") or {}

        normalized_nodes = []
        id_map: Dict[str, str] = {}
        for index, raw_node in enumerate(raw_nodes):
            node_type = raw_node.get("type")
            if node_type not in SUPPORTED_NODE_TYPES:
                raise HTTPException(
                    status_code=400,
                    detail=f"Unsupported node type generated: {node_type}",
                )
            node_id = str(raw_node.get("id") or f"ai_node_{index}")
            if node_id in id_map:
                raise HTTPException(status_code=400, detail=f"生成的节点 ID 重复：{node_id}，请重新生成。")
            id_map[str(raw_node.get("id") or node_id)] = node_id

            position = raw_node.get("position") or {}
            try:
                x = float(position.get("x", 80 + (index % 4) * 280))
                y = float(position.get("y", 80 + (index // 4) * 180))
            except Exception:
                x = float(80 + (index % 4) * 280)
                y = float(80 + (index // 4) * 180)

            data = {k: v for k, v in SUPPORTED_NODE_TYPES[node_type]["default_data"].items() if k in {"label", "status"}}
            data.update(raw_node.get("data") or {})
            data.setdefault("label", data.get("label") or node_type)
            if node_type == "llm" and not data.get("model"):
                data["model"] = OrchestrationService._resolve_model()

            normalized_nodes.append(
                {
                    "id": node_id,
                    "type": node_type,
                    "position": {"x": x, "y": y},
                    **{k:raw_node[k] for k in ("parentId","extent","style") if k in raw_node},
                    "data": data,
                }
            )

        normalized_edges = []
        for index, raw_edge in enumerate(raw_edges):
            source = id_map.get(str(raw_edge.get("source")), str(raw_edge.get("source", "")))
            target = id_map.get(str(raw_edge.get("target")), str(raw_edge.get("target", "")))
            normalized_edges.append(
                {
                    "id": str(raw_edge.get("id") or f"ai_edge_{index}"),
                    "source": source,
                    "target": target,
                    "type": raw_edge.get("type") or "smoothstep",
                    **({"targetHandle":raw_edge["targetHandle"]} if raw_edge.get("targetHandle") else {}),
                    **(
                        {"sourceHandle": raw_edge["sourceHandle"]}
                        if raw_edge.get("sourceHandle")
                        else {}
                    ),
                }
            )

        project_name = (
            request.project_name
            or payload.get("project_name")
            or (request.current_project.name if request.current_project else None)
            or f"ai-workflow-{int(time.time())}"
        )
        project_id = ProjectService._sanitize_project_id(project_name)
        meta.update(
            {
                "goal": request.prompt,
                "generated_by": "nl_orchestrator",
                "summary": payload.get("summary", ""),
                "documentation_markdown": payload.get("documentation_markdown", ""),
                "test_cases": payload.get("test_cases", []),
                "generated_at": time.time(),
            }
        )
        return ProjectSchema(
            id=project_id,
            name=project_name,
            file_name=f"{project_id}.json",
            nodes=normalized_nodes,
            edges=normalized_edges,
            meta=meta,
            updated_at=time.time(),
        )

    @staticmethod
    def _normalize_logic_branch_handles(
        nodes: List[Dict[str, Any]], edges: List[Dict[str, Any]]
    ) -> List[Dict[str, Any]]:
        """Make AI-authored conditional branches explicit before the UI runs them."""
        node_by_id = {str(node.get("id")): node for node in nodes}
        fallback_types = {"fallback", "event_log"}
        fallback_pattern = re.compile(r"fallback|兜底|未识别|低置信|确认", re.IGNORECASE)

        for source_id, source_node in node_by_id.items():
            if source_node.get("type") != "logic":
                continue
            outgoing = [edge for edge in edges if edge.get("source") == source_id]
            missing = [edge for edge in outgoing if edge.get("sourceHandle") not in {"true", "false"}]
            if not missing:
                continue

            explicit_handles = {edge.get("sourceHandle") for edge in outgoing}
            if len(missing) == 1:
                if "true" not in explicit_handles:
                    missing[0]["sourceHandle"] = "true"
                continue

            def is_fallback(edge: Dict[str, Any]) -> bool:
                target = node_by_id.get(str(edge.get("target")), {})
                target_data = target.get("data") or {}
                text = " ".join(
                    str(value)
                    for value in (target.get("type"), target_data.get("label"), target_data.get("description"))
                    if value
                )
                return target.get("type") in fallback_types or bool(fallback_pattern.search(text))

            fallback_edge = next((edge for edge in missing if is_fallback(edge)), None)
            primary_edge = next((edge for edge in missing if edge is not fallback_edge), missing[0])
            if "true" not in explicit_handles:
                primary_edge["sourceHandle"] = "true"
            if fallback_edge is not None and fallback_edge is not primary_edge and "false" not in explicit_handles:
                fallback_edge["sourceHandle"] = "false"

            remaining = [edge for edge in missing if edge.get("sourceHandle") not in {"true", "false"}]
            if remaining and "false" not in explicit_handles:
                remaining[0]["sourceHandle"] = "false"
            for edge in remaining[1:]:
                edge["sourceHandle"] = "false"

        return edges

    @staticmethod
    def _validate_project(
        project: ProjectSchema, user_prompt: str
    ) -> WorkflowValidationSchema:
        errors, warnings = validate_capabilities(project.nodes, project.edges)
        if project.meta.get("missing_capabilities"):
            errors.append("场景包含尚未接入能力：" + str(project.meta["missing_capabilities"]))
        warnings.append("当前仅检查结构与配置；模型推理、业务用例和真实设备尚未验证。")
        node_ids = set()

        if not project.nodes:
            errors.append("工作流没有任何节点。")
        if not project.edges:
            warnings.append("工作流没有任何连线。")

        for node in project.nodes:
            node_id = str(node.get("id"))
            node_type = node.get("type")
            data = node.get("data") or {}
            if node_id in node_ids:
                errors.append(f"节点 ID 重复: {node_id}")
            node_ids.add(node_id)
            if node_type not in SUPPORTED_NODE_TYPES:
                errors.append(f"不支持的节点类型: {node_type}")
            if node_type == "llm" and not data.get("model"):
                errors.append(f"LLM 节点缺少 model: {node_id}")
            if node_type == "memory" and not data.get("type"):
                errors.append(f"记忆节点缺少 type: {node_id}")
            if node_type == "logic" and not (data.get("type") or data.get("logic_type") or data.get("condition") or data.get("script")):
                errors.append(f"逻辑节点缺少 type: {node_id}")
            if node_type == "car_control" and not data.get("action") and data.get("executionMode") != "hmi":
                errors.append(f"车控节点缺少 action: {node_id}")

        for edge in project.edges:
            if edge.get("source") not in node_ids:
                errors.append(f"连线 source 不存在: {edge.get('source')}")
            if edge.get("target") not in node_ids:
                errors.append(f"连线 target 不存在: {edge.get('target')}")

        for node in project.nodes:
            if node.get("type") != "logic":
                continue
            outgoing = [edge for edge in project.edges if edge.get("source") == node.get("id")]
            if len(outgoing) > 1:
                handles = {edge.get("sourceHandle") for edge in outgoing}
                if not {"true", "false"}.issubset(handles):
                    warnings.append(f"逻辑分支不完整，请核对未连接出口是否应结束: {node.get('id')}")

        if not any(node.get("type") in START_NODE_TYPES for node in project.nodes):
            errors.append("工作流缺少输入起点节点。")
        if not any(node.get("type") in TERMINAL_NODE_TYPES for node in project.nodes):
            warnings.append("工作流缺少明显的输出/执行终点节点。")

        if "接送孩子" in user_prompt and not any(
            node.get("type") in {"memory", "llm"} for node in project.nodes
        ):
            warnings.append("需求涉及接送孩子场景，通常建议至少包含 memory 和 llm 节点。")

        safety_constraints = project.meta.get("safety_constraints") if isinstance(project.meta, dict) else None
        if isinstance(safety_constraints, list) and any("不触发车控" in str(item) for item in safety_constraints):
            if any(node.get("type") == "car_control" for node in project.nodes):
                errors.append("当前场景规格禁止车控，但流程中包含 car_control 节点。")

        return WorkflowValidationSchema(
            passed=not errors,
            errors=errors,
            warnings=warnings,
        )

    @staticmethod
    def _run_tests(
        project: ProjectSchema,
        validation: WorkflowValidationSchema,
        raw_model_output: str,
    ) -> List[WorkflowTestResultSchema]:
        tests: List[WorkflowTestResultSchema] = [
            WorkflowTestResultSchema(
                name="live_model_generation",
                passed=bool(raw_model_output.strip()),
                details="远程模型已返回非空编排结果。",
            ),
            WorkflowTestResultSchema(
                name="schema_validation",
                passed=validation.passed,
                details="结构与配置检查通过；未执行业务测试。" if validation.passed else "结构或配置检查失败。",
            ),
            WorkflowTestResultSchema(
                name="graph_connectivity",
                passed=OrchestrationService._has_reachable_terminal(project),
                details="至少存在一条从输入节点到终点节点的可达路径。",
            ),
        ]
        return tests

    @staticmethod
    def _has_reachable_terminal(project: ProjectSchema) -> bool:
        adjacency: Dict[str, List[str]] = {}
        for edge in project.edges:
            adjacency.setdefault(edge.get("source"), []).append(edge.get("target"))

        start_ids = [
            node.get("id")
            for node in project.nodes
            if node.get("type") in START_NODE_TYPES
        ]
        terminal_ids = {
            node.get("id")
            for node in project.nodes
            if node.get("type") in TERMINAL_NODE_TYPES or node.get("type") in ("wait","state") and not any(e.get("source")==node.get("id") for e in project.edges)
        }
        if not start_ids or not terminal_ids:
            return False

        visited = set()
        queue = list(start_ids)
        while queue:
            node_id = queue.pop(0)
            if node_id in visited:
                continue
            visited.add(node_id)
            if node_id in terminal_ids:
                return True
            queue.extend(adjacency.get(node_id, []))
        return False

    @staticmethod
    def _build_documentation(
        payload: Dict[str, Any],
        project: ProjectSchema,
        tests: List[WorkflowTestResultSchema],
        prompt: str,
    ) -> str:
        provided_doc = str(payload.get("documentation_markdown") or "").strip()
        if provided_doc:
            return provided_doc

        lines = [
            f"# {project.name}",
            "",
            "## 需求摘要",
            prompt,
            "",
            "## 节点清单",
        ]
        for node in project.nodes:
            data = node.get("data") or {}
            lines.append(
                f"- `{node.get('id')}` / `{node.get('type')}` / {data.get('label', '')}"
            )
        lines.extend(["", "## 测试结果"])
        for test in tests:
            lines.append(
                f"- `{test.name}`: {'通过' if test.passed else '失败'}，{test.details}"
            )
        return "\n".join(lines).strip() + "\n"

    @staticmethod
    def _save_documentation(project: ProjectSchema, documentation_markdown: str) -> str:
        docs_dir = Path("projects")
        docs_dir.mkdir(exist_ok=True)
        doc_path = docs_dir / f"{project.id}.md"
        doc_path.write_text(documentation_markdown, encoding="utf-8")
        return str(doc_path.as_posix())

    @staticmethod
    def _generate_map_storyboard(
        *,
        request: WorkflowGenerateRequestSchema,
        project: ProjectSchema,
        provider_base_url: str,
        model: str,
        api_key: str,
    ) -> MapStoryboardSchema:
        project_json = json.dumps(
            {
                "name": project.name,
                "nodes": project.nodes,
                "edges": project.edges,
                "meta": project.meta,
            },
            ensure_ascii=False,
            indent=2,
        )
        system_prompt = """
你是车载工作流的“地图故事板编排器”。给定用户需求和已生成的节点工作流，请输出一份严格合法的 JSON，
用于驱动右侧俯视地图动画演示。不要输出解释，不要加 markdown。

输出结构必须是：
{
  "title": "string",
  "summary": "string",
  "duration_ms": 16000,
  "viewport": "topdown",
  "landmarks": [
    { "id": "home", "label": "家", "kind": "home", "x": 12, "y": 70, "note": "出发点" }
  ],
  "segments": [
    {
      "id": "seg_depart",
      "label": "从家出发",
      "from_id": "home",
      "to_id": "local_road",
      "road_type": "ground",
      "duration_ms": 3200,
      "narrative": "驶离小区，进入地面道路"
    }
  ],
  "events": [
    {
      "id": "evt_depart",
      "label": "出发",
      "event_type": "depart|merge|pickup|return|narration",
      "message": "从家出发前往学校",
      "segment_id": "seg_depart",
      "x": 12,
      "y": 70
    }
  ],
  "subtitle_cues": [
    {
      "id": "cue_depart",
      "label": "出发字幕",
      "start_ms": 0,
      "end_ms": 2800,
      "segment_id": "seg_depart",
      "event_id": "evt_depart",
      "location_label": "家附近地面道路",
      "trigger": "用户发起接送孩子任务，系统确认从家出发",
      "active_nodes": ["input", "memory", "llm"],
      "decision": "规划从家到学校的首段路线并准备进入主干道",
      "narration": "当前位置在家附近地面道路，因接送任务开始，输入、记忆和大模型节点被唤起，系统先决策驶离小区并汇入主路。"
    }
  ]
}

规则：
- 使用 0-100 的相对坐标。
- landmarks 至少包含家、学校；如果需求涉及高架，必须包含上匝道、主高架、下匝道。
- segments 必须按车辆真实行进顺序排列。
- road_type 只能是 ground 或 elevated。
- 动画要体现：出发、上高架、到校接人、返程回家。
- 返回路线要与去程相呼应，但不必完全重合。
- subtitle_cues 是“剧情字幕轨道”，必须覆盖完整行程与关键情形。
- narration 要像解说字幕，必须明确写出：当前位置、遇到的情况/触发条件、触发了哪些节点、系统做了什么决策。
- active_nodes 只允许填写当前工作流里真实存在且相关的节点类型，例如 input、memory、llm、logic、tool、car_control、output。
- 如果需求里存在可能分支，例如拥堵、接人、返程、切换道路、风险提醒，请在字幕里体现“当前为何做出该决策”。
""".strip()
        user_prompt = f"""
用户需求：
{request.prompt}

当前生成的工作流：
{project_json}
""".strip()
        raw_text = OrchestrationService._chat_completion(
            base_url=provider_base_url,
            api_key=api_key,
            model=model,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
        )
        payload = OrchestrationService._parse_model_payload(raw_text)
        return OrchestrationService._normalize_map_storyboard(
            payload,
            project_name=project.name,
            prompt=request.prompt,
            project=project,
        )

    @staticmethod
    def _normalize_map_storyboard(
        payload: Dict[str, Any],
        project_name: str,
        prompt: str,
        project: ProjectSchema,
    ) -> MapStoryboardSchema:
        def _clamp(value: Any, fallback: float) -> float:
            try:
                return max(0.0, min(100.0, float(value)))
            except Exception:
                return fallback

        landmarks = []
        for index, item in enumerate(payload.get("landmarks") or []):
            landmarks.append(
                {
                    "id": str(item.get("id") or f"landmark_{index}"),
                    "label": str(item.get("label") or f"地点{index + 1}"),
                    "kind": str(item.get("kind") or "poi"),
                    "x": _clamp(item.get("x"), 10 + index * 10),
                    "y": _clamp(item.get("y"), 20 + index * 10),
                    "note": str(item.get("note") or ""),
                }
            )

        landmark_ids = {item["id"] for item in landmarks}
        segments = []
        for index, item in enumerate(payload.get("segments") or []):
            from_id = str(item.get("from_id") or (landmarks[0]["id"] if landmarks else "home"))
            to_id = str(item.get("to_id") or (landmarks[-1]["id"] if landmarks else "school"))
            if from_id not in landmark_ids or to_id not in landmark_ids:
                continue
            segments.append(
                {
                    "id": str(item.get("id") or f"segment_{index}"),
                    "label": str(item.get("label") or f"路段{index + 1}"),
                    "from_id": from_id,
                    "to_id": to_id,
                    "road_type": "elevated" if str(item.get("road_type") or "").lower() == "elevated" else "ground",
                    "duration_ms": max(500, min(20000, int(item.get("duration_ms") or 3000))),
                    "narrative": str(item.get("narrative") or ""),
                }
            )

        events = []
        for index, item in enumerate(payload.get("events") or []):
            events.append(
                {
                    "id": str(item.get("id") or f"event_{index}"),
                    "label": str(item.get("label") or f"事件{index + 1}"),
                    "event_type": str(item.get("event_type") or "narration"),
                    "message": str(item.get("message") or ""),
                    "segment_id": str(item.get("segment_id") or "") or None,
                    "x": _clamp(item.get("x"), 50) if item.get("x") is not None else None,
                    "y": _clamp(item.get("y"), 50) if item.get("y") is not None else None,
                }
            )

        if not landmarks or not segments:
            return OrchestrationService._build_fallback_map_storyboard(prompt, project_name)

        duration_ms = max(2000, min(120000, int(payload.get("duration_ms") or 16000)))
        subtitle_cues = OrchestrationService._normalize_storyboard_subtitle_cues(
            payload=payload,
            segments=segments,
            events=events,
            landmarks=landmarks,
            duration_ms=duration_ms,
            prompt=prompt,
            project=project,
        )

        return MapStoryboardSchema(
            title=str(payload.get("title") or f"{project_name} 地图演示"),
            summary=str(payload.get("summary") or "根据编排结果生成的俯视地图故事板。"),
            duration_ms=duration_ms,
            viewport="topdown",
            source="llm",
            landmarks=landmarks,
            segments=segments,
            events=events,
            subtitle_cues=subtitle_cues,
        )

    @staticmethod
    def _normalize_storyboard_subtitle_cues(
        *,
        payload: Dict[str, Any],
        segments: List[Dict[str, Any]],
        events: List[Dict[str, Any]],
        landmarks: List[Dict[str, Any]],
        duration_ms: int,
        prompt: str,
        project: ProjectSchema,
    ) -> List[Dict[str, Any]]:
        segment_map = {segment["id"]: segment for segment in segments}
        event_map = {event["id"]: event for event in events}
        segment_time_ranges: Dict[str, tuple[int, int]] = {}
        cursor = 0
        for segment in segments:
            start_ms = cursor
            end_ms = min(duration_ms, start_ms + int(segment.get("duration_ms") or 0))
            segment_time_ranges[segment["id"]] = (start_ms, max(start_ms + 800, end_ms))
            cursor = end_ms

        normalized: List[Dict[str, Any]] = []
        for index, item in enumerate(payload.get("subtitle_cues") or []):
            segment_id = str(item.get("segment_id") or "") or None
            event_id = str(item.get("event_id") or "") or None
            default_start, default_end = segment_time_ranges.get(
                segment_id or "",
                (min(duration_ms, index * 2400), min(duration_ms, (index + 1) * 2400)),
            )
            start_ms = max(0, min(duration_ms, int(item.get("start_ms") or default_start)))
            end_ms = max(start_ms + 600, min(duration_ms, int(item.get("end_ms") or default_end)))
            active_nodes = [
                str(node_type)
                for node_type in (item.get("active_nodes") or [])
                if str(node_type) in SUPPORTED_NODE_TYPES
            ]
            normalized.append(
                {
                    "id": str(item.get("id") or f"cue_{index}"),
                    "label": str(item.get("label") or f"字幕{index + 1}"),
                    "start_ms": start_ms,
                    "end_ms": end_ms,
                    "segment_id": segment_id,
                    "event_id": event_id if event_id in event_map else None,
                    "location_label": str(item.get("location_label") or ""),
                    "trigger": str(item.get("trigger") or ""),
                    "active_nodes": active_nodes,
                    "decision": str(item.get("decision") or ""),
                    "narration": str(item.get("narration") or ""),
                }
            )

        if normalized:
            return normalized

        return OrchestrationService._build_default_subtitle_cues(
            segments=segments,
            events=events,
            landmarks=landmarks,
            duration_ms=duration_ms,
            prompt=prompt,
            project=project,
        )

    @staticmethod
    def _build_default_subtitle_cues(
        *,
        segments: List[Dict[str, Any]],
        events: List[Dict[str, Any]],
        landmarks: List[Dict[str, Any]],
        duration_ms: int,
        prompt: str,
        project: ProjectSchema,
    ) -> List[Dict[str, Any]]:
        landmark_map = {landmark["id"]: landmark for landmark in landmarks}
        event_by_segment: Dict[str, Dict[str, Any]] = {}
        for event in events:
            segment_id = str(event.get("segment_id") or "")
            if segment_id and segment_id not in event_by_segment:
                event_by_segment[segment_id] = event

        def node_labels_for_types(preferred_types: List[str]) -> List[str]:
            labels: List[str] = []
            seen = set()
            for node in project.nodes:
                node_type = str(node.get("type") or "")
                if node_type not in preferred_types or node_type in seen:
                    continue
                seen.add(node_type)
                label = str((node.get("data") or {}).get("label") or node_type)
                labels.append(label)
            if labels:
                return labels
            return [SUPPORTED_NODE_TYPES[node_type]["default_data"]["label"] for node_type in preferred_types if node_type in SUPPORTED_NODE_TYPES]

        cues: List[Dict[str, Any]] = []
        cursor = 0
        for index, segment in enumerate(segments):
            event = event_by_segment.get(segment["id"])
            start = cursor
            end = min(duration_ms, start + int(segment.get("duration_ms") or 2000))
            cursor = end
            from_landmark = landmark_map.get(str(segment.get("from_id") or ""))
            to_landmark = landmark_map.get(str(segment.get("to_id") or ""))
            location_label = f"{(from_landmark or {}).get('label', '当前路段')} -> {(to_landmark or {}).get('label', '下一站')}"
            text_context = " ".join(
                [
                    str(segment.get("label") or ""),
                    str(segment.get("narrative") or ""),
                    str((event or {}).get("label") or ""),
                    str((event or {}).get("message") or ""),
                    prompt,
                ]
            )
            if "高架" in text_context or str(segment.get("road_type")) == "elevated":
                preferred_types = ["input", "llm", "logic", "tool"]
                trigger = "路线进入高架或匝道，需要重新判断通行策略与主路并线时机"
                decision = "系统评估道路条件后保持路线连续，优先汇入高架主路并维持稳定通行"
            elif "学校" in text_context or "接" in text_context:
                preferred_types = ["memory", "llm", "tool", "car_control", "output"]
                trigger = "已接近学校接送区域，需要确认接人目标与临停动作"
                decision = "系统切换到接送模式，靠近目标点完成到校接人并准备返程"
            elif "回家" in text_context or "返程" in text_context or "return" in text_context.lower():
                preferred_types = ["memory", "llm", "tool", "output"]
                trigger = "接送任务完成，开始执行返程路径"
                decision = "系统沿返程路线回家，并继续根据状态决定是否调整速度与道路选择"
            else:
                preferred_types = ["input", "memory", "llm"]
                trigger = "用户任务持续推进，系统根据当前路线阶段刷新导航与执行上下文"
                decision = "系统先保持既定路线，继续推进下一段行驶目标"

            active_nodes = node_labels_for_types(preferred_types)
            event_message = str((event or {}).get("message") or "")
            narrative = str(segment.get("narrative") or "")
            narration = (
                f"当前位置来到{location_label}。"
                f"当前情况是{event_message or narrative or segment.get('label') or '路线推进中'}，"
                f"因此触发了{'、'.join(active_nodes)}，"
                f"系统决策为：{decision}。"
            )
            cues.append(
                {
                    "id": f"cue_{index}",
                    "label": str(segment.get("label") or f"字幕{index + 1}"),
                    "start_ms": start,
                    "end_ms": max(start + 800, end),
                    "segment_id": segment["id"],
                    "event_id": str((event or {}).get("id") or "") or None,
                    "location_label": location_label,
                    "trigger": trigger,
                    "active_nodes": active_nodes,
                    "decision": decision,
                    "narration": narration,
                }
            )
        return cues

    @staticmethod
    def _build_fallback_map_storyboard(prompt: str, project_name: str) -> MapStoryboardSchema:
        go_school = "接送" in prompt or "孩子" in prompt or "学校" in prompt
        title = f"{project_name} 地图演示"
        landmarks = [
            {"id": "home", "label": "家", "kind": "home", "x": 14, "y": 74, "note": "出发点"},
            {"id": "local_road", "label": "地面道路", "kind": "road", "x": 30, "y": 64, "note": "小区外道路"},
            {"id": "ramp_up", "label": "上匝道", "kind": "ramp", "x": 46, "y": 48, "note": "驶入高架"},
            {"id": "elevated", "label": "城市高架", "kind": "road", "x": 62, "y": 34, "note": "快速通行"},
            {"id": "ramp_down", "label": "下匝道", "kind": "ramp", "x": 74, "y": 46, "note": "驶离高架"},
            {"id": "school", "label": "学校", "kind": "school", "x": 84, "y": 62, "note": "接送点"},
        ]
        if not go_school:
            landmarks[-1]["label"] = "目的地"
            landmarks[-1]["kind"] = "poi"

        segments = [
            {"id": "seg_depart", "label": "从家出发", "from_id": "home", "to_id": "local_road", "road_type": "ground", "duration_ms": 2800, "narrative": "驶离小区，进入地面道路"},
            {"id": "seg_ramp_up", "label": "进入匝道", "from_id": "local_road", "to_id": "ramp_up", "road_type": "ground", "duration_ms": 2200, "narrative": "靠右进入上匝道"},
            {"id": "seg_elevated", "label": "高架通行", "from_id": "ramp_up", "to_id": "elevated", "road_type": "elevated", "duration_ms": 3200, "narrative": "在高架快速通行"},
            {"id": "seg_ramp_down", "label": "驶离高架", "from_id": "elevated", "to_id": "ramp_down", "road_type": "elevated", "duration_ms": 1800, "narrative": "从下匝道回到地面"},
            {"id": "seg_arrive_school", "label": "到校接人", "from_id": "ramp_down", "to_id": "school", "road_type": "ground", "duration_ms": 2400, "narrative": "到达学校门口完成接送"},
            {"id": "seg_return_home", "label": "返程回家", "from_id": "school", "to_id": "home", "road_type": "ground", "duration_ms": 4200, "narrative": "完成接送后返回家中"},
        ]
        events = [
            {"id": "evt_depart", "label": "出发", "event_type": "depart", "message": "车辆从家出发", "segment_id": "seg_depart", "x": 14, "y": 74},
            {"id": "evt_merge", "label": "上高架", "event_type": "merge", "message": "沿匝道汇入高架主路", "segment_id": "seg_elevated", "x": 56, "y": 38},
            {"id": "evt_pickup", "label": "接到孩子", "event_type": "pickup", "message": "到达学校接到孩子", "segment_id": "seg_arrive_school", "x": 84, "y": 62},
            {"id": "evt_return", "label": "返程", "event_type": "return", "message": "车辆开始返程回家", "segment_id": "seg_return_home", "x": 58, "y": 66},
        ]
        subtitle_cues = [
            {
                "id": "cue_depart",
                "label": "出发阶段",
                "start_ms": 0,
                "end_ms": 2800,
                "segment_id": "seg_depart",
                "event_id": "evt_depart",
                "location_label": "家附近地面道路",
                "trigger": "接送任务开始，系统确认从家出发",
                "active_nodes": ["用户输入", "短期记忆", "LLM"],
                "decision": "根据接送目标生成首段路线，先驶离小区进入地面道路",
                "narration": "当前位置在家附近地面道路，接送任务已经触发，用户输入、短期记忆和大模型节点开始协同，系统决策先离开小区并汇入主路。",
            },
            {
                "id": "cue_merge",
                "label": "高架并线",
                "start_ms": 5000,
                "end_ms": 8200,
                "segment_id": "seg_elevated",
                "event_id": "evt_merge",
                "location_label": "上匝道至城市高架",
                "trigger": "前方进入高架，需要判断并线时机与通行效率",
                "active_nodes": ["条件判断", "工具节点", "LLM"],
                "decision": "系统选择沿匝道平顺汇入高架主路，提高整体通行效率",
                "narration": "当前位置来到上匝道至城市高架，因前方需要完成高架并线，条件判断、工具节点和大模型节点被触发，系统决策平顺汇入主路并保持快速通行。",
            },
            {
                "id": "cue_pickup",
                "label": "到校接人",
                "start_ms": 10000,
                "end_ms": 12400,
                "segment_id": "seg_arrive_school",
                "event_id": "evt_pickup",
                "location_label": "学校门口",
                "trigger": "车辆抵达学校接送点，需要确认到校接人与临停动作",
                "active_nodes": ["短期记忆", "LLM", "工具节点", "Car Control", "最终回复"],
                "decision": "系统切换接送模式，完成接人并准备返程",
                "narration": "当前位置已经到达学校门口，因接送条件满足，短期记忆、大模型、工具、车控和最终回复节点依次接管，系统决策完成接人并切换到返程阶段。",
            },
            {
                "id": "cue_return",
                "label": "返程回家",
                "start_ms": 12400,
                "end_ms": 16600,
                "segment_id": "seg_return_home",
                "event_id": "evt_return",
                "location_label": "返程回家路线",
                "trigger": "接送任务已完成，系统开始执行返程策略",
                "active_nodes": ["短期记忆", "LLM", "工具节点", "最终回复"],
                "decision": "根据返程路线持续调整路径，最终返回家中",
                "narration": "当前位置进入返程回家路线，接送任务完成后触发返程策略，短期记忆、大模型、工具与输出节点继续协同，系统决策沿返程路线回家并结束本次剧情演示。",
            },
        ]
        return MapStoryboardSchema(
            title=title,
            summary="从家出发，经地面道路和高架到学校接人，再返回家中的俯视演示。",
            duration_ms=16600,
            viewport="topdown",
            source="fallback",
            landmarks=landmarks,
            segments=segments,
            events=events,
            subtitle_cues=subtitle_cues,
        )

    @staticmethod
    def _resolve_timeout_seconds() -> float:
        import os

        raw_value = (os.getenv("WORKFLOW_LLM_TIMEOUT_SECONDS") or "").strip()
        if not raw_value:
            # The orchestration path now generates workflow JSON, map storyboard,
            # and richer subtitle-ready outputs, so keep the default a bit roomier.
            return 150.0
        try:
            return max(30.0, min(300.0, float(raw_value)))
        except Exception:
            return 150.0
