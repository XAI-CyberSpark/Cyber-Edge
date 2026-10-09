import io
import json
import re
import textwrap
import zipfile
from typing import Any, Dict, List, Tuple


class SDKService:
    @staticmethod
    def _slugify(value: str) -> str:
        slug = re.sub(r"[^a-zA-Z0-9]+", "_", value.strip().lower()).strip("_")
        return slug or "oakegde_agent"

    @staticmethod
    def _sdk_package_name(name: str, package_name: str | None) -> str:
        base = package_name or name
        return SDKService._slugify(base)

    @staticmethod
    def _distribution_name(package_name: str) -> str:
        return package_name.replace("_", "-")

    @staticmethod
    def _find_default_model(
        nodes: List[Dict[str, Any]], default_model: str | None
    ) -> str:
        if default_model:
            return default_model

        for node in nodes:
            if node.get("type") == "llm":
                model = (node.get("data") or {}).get("model")
                if model:
                    return model

        return "qwen2.5:0.5b"

    @staticmethod
    def _make_graph_payload(
        name: str, nodes: List[Dict[str, Any]], edges: List[Dict[str, Any]]
    ) -> Dict[str, Any]:
        return {
            "name": name,
            "nodes": nodes,
            "edges": edges,
        }

    @staticmethod
    def _readme(name: str, package_name: str, distribution_name: str) -> str:
        return textwrap.dedent(
            f"""
            # {name} SDK

            ```bash
            pip install . 
            ```

            ```python
            from {package_name} import ExportedAgent

            agent = ExportedAgent()
            result = agent.run("请用一句话介绍你自己")
            print(result["final_output"])
            print(result["execution_log"])
            ```

            默认会调用本机 Ollama 的 OpenAI 兼容接口 `http://127.0.0.1:11434/v1`。

            如果你想切换模型或接口地址：

            ```python
            from {package_name} import ExportedAgent

            agent = ExportedAgent(
                inference_base_url="http://127.0.0.1:11434/v1",
                default_model="qwen2.5:0.5b",
            )
            ```

            打包发布：

            ```bash
            python -m build
            ```

            生成的包名默认为 `{distribution_name}`。
            """
        ).strip() + "\n"

    @staticmethod
    def _pyproject(name: str, distribution_name: str, package_name: str) -> str:
        safe_name = name.replace('"', '\\"')
        return textwrap.dedent(
            f"""
            [build-system]
            requires = ["setuptools>=68", "wheel"]
            build-backend = "setuptools.build_meta"

            [project]
            name = "{distribution_name}"
            version = "0.1.0"
            description = "{safe_name} exported from OAKEgde Studio"
            requires-python = ">=3.10"
            dependencies = ["requests>=2.31.0"]

            [tool.setuptools]
            packages = ["{package_name}"]
            """
        ).strip() + "\n"

    @staticmethod
    def _init_py(package_name: str) -> str:
        return textwrap.dedent(
            f"""
            from .runner import ExportedAgent

            __all__ = ["ExportedAgent"]
            """
        ).strip() + "\n"

    @staticmethod
    def _runner_py(default_model: str) -> str:
        return textwrap.dedent(
            f"""
            import json
            from pathlib import Path
            from typing import Any, Dict, List

            import requests


            class ExportedAgent:
                def __init__(
                    self,
                    inference_base_url: str = "http://127.0.0.1:11434/v1",
                    default_model: str = "{default_model}",
                ):
                    self.inference_base_url = inference_base_url.rstrip("/")
                    self.default_model = default_model
                    self.graph = self._load_graph()
                    self.nodes = {{node["id"]: node for node in self.graph["nodes"]}}
                    self.edges = self.graph["edges"]
                    self.execution_log: List[Dict[str, Any]] = []

                def _load_graph(self) -> Dict[str, Any]:
                    graph_path = Path(__file__).with_name("graph.json")
                    return json.loads(graph_path.read_text())

                def run(self, user_input: str) -> Dict[str, Any]:
                    self.execution_log = []
                    start_nodes = [
                        node
                        for node in self.nodes.values()
                        if node.get("type") in {{"input", "systemInput"}}
                    ]
                    if not start_nodes:
                        raise RuntimeError("No input node found in exported graph")

                    outputs = []
                    for node in start_nodes:
                        outputs.extend(self._execute(node, user_input, set()))

                    final_output = next((item for item in reversed(outputs) if item), "")
                    return {{
                        "final_output": final_output,
                        "outputs": outputs,
                        "execution_log": self.execution_log,
                    }}

                def _execute(self, node: Dict[str, Any], input_data: Any, path: set[str]) -> List[Any]:
                    node_id = node["id"]
                    if node_id in path:
                        raise RuntimeError(f"Cycle detected at {{node_id}}")

                    next_path = set(path)
                    next_path.add(node_id)
                    self.execution_log.append({{
                        "node_id": node_id,
                        "label": (node.get("data") or {{}}).get("label", node_id),
                        "type": node.get("type"),
                    }})

                    output = self._process_node(node, input_data)
                    results = [output]
                    outgoing = [edge for edge in self.edges if edge["source"] == node_id]

                    for edge in outgoing:
                        target = self.nodes.get(edge["target"])
                        if not target:
                            continue

                        if node.get("type") == "logic":
                            if edge.get("sourceHandle") == "true" and output is True:
                                results.extend(self._execute(target, output, next_path))
                            elif edge.get("sourceHandle") == "false" and output is False:
                                results.extend(self._execute(target, output, next_path))
                        else:
                            results.extend(self._execute(target, output, next_path))

                    return results

                def _process_node(self, node: Dict[str, Any], input_data: Any) -> Any:
                    node_type = node.get("type")
                    data = node.get("data") or {{}}

                    if node_type in {{"input", "systemInput"}}:
                        if data.get("inputType") == "camera":
                            return {{"type": "image", "content": data.get("lastImage"), "text": input_data}}
                        return {{"type": "text", "text": input_data}}

                    if node_type == "llm":
                        return self._process_llm(data, input_data)

                    if node_type == "logic":
                        return self._process_logic(data, input_data)

                    if node_type == "car_control":
                        return self._process_car_control(data, input_data)

                    if node_type == "tool":
                        return self._process_tool(data, input_data)

                    if node_type in {{"output", "tts"}}:
                        return input_data.get("text") if isinstance(input_data, dict) else input_data

                    return input_data

                def _process_llm(self, data: Dict[str, Any], input_data: Any) -> Dict[str, Any]:
                    is_multimodal = isinstance(input_data, dict) and input_data.get("type") == "image"
                    command = input_data.get("text") if isinstance(input_data, dict) else str(input_data)
                    system_prompt = data.get("systemPrompt") or "You are a concise assistant."
                    model = data.get("model") or self.default_model

                    messages: List[Dict[str, Any]] = [{{"role": "system", "content": system_prompt}}]
                    if is_multimodal and input_data.get("content"):
                        messages.append(
                            {{
                                "role": "user",
                                "content": [
                                    {{"type": "text", "text": command}},
                                    {{
                                        "type": "image_url",
                                        "image_url": {{"url": input_data["content"]}},
                                    }},
                                ],
                            }}
                        )
                    else:
                        messages.append({{"role": "user", "content": command}})

                    response = requests.post(
                        f"{{self.inference_base_url}}/chat/completions",
                        json={{
                            "model": model,
                            "messages": messages,
                            "temperature": data.get("temperature", 0.7),
                            "max_tokens": data.get("maxTokens", 128),
                            "stream": False,
                        }},
                        timeout=30,
                    )
                    response.raise_for_status()
                    payload = response.json()
                    content = payload["choices"][0]["message"]["content"]
                    lower = content.lower()

                    intent = "unknown"
                    if "window" in lower:
                        intent = "control_windows"
                    elif "music" in lower or "play" in lower:
                        intent = "control_media"
                    elif "nav" in lower or "home" in lower:
                        intent = "navigation"
                    elif "emergency" in lower or "help" in lower:
                        intent = "medical_emergency"

                    return {{
                        "intent": intent,
                        "text": content,
                        "raw_command": command,
                        "model": payload.get("model", model),
                    }}

                def _process_logic(self, data: Dict[str, Any], input_data: Any) -> bool:
                    condition = data.get("condition")
                    if not condition:
                        return True

                    translated = (
                        condition
                        .replace("===", "==")
                        .replace("&&", " and ")
                        .replace("||", " or ")
                        .replace("input.intent", "intent")
                        .replace("input.text", "text")
                        .replace("input.raw_command", "raw_command")
                    )

                    scope = {{
                        "input": input_data,
                        "intent": input_data.get("intent") if isinstance(input_data, dict) else None,
                        "text": input_data.get("text") if isinstance(input_data, dict) else str(input_data),
                        "raw_command": input_data.get("raw_command") if isinstance(input_data, dict) else str(input_data),
                    }}
                    return bool(eval(translated, {{}}, scope))

                def _process_car_control(self, data: Dict[str, Any], input_data: Any) -> str:
                    action = data.get("action") or "generic"
                    intent = input_data.get("intent") if isinstance(input_data, dict) else ""
                    command = input_data.get("raw_command") if isinstance(input_data, dict) else str(input_data)

                    if intent == "control_windows" or "window" in command.lower():
                        if "open" in command.lower():
                            return "Opened all windows"
                        return "Closed all windows"

                    if intent == "medical_emergency":
                        return "Executed Emergency Protocol"

                    return f"Executed action: {{action}}"

                def _process_tool(self, data: Dict[str, Any], input_data: Any) -> str:
                    tool_id = data.get("tool_id") or data.get("tool") or data.get("label") or "tool"
                    intent = input_data.get("intent") if isinstance(input_data, dict) else ""

                    if tool_id == "music" and intent == "control_media":
                        return "Music Playing"
                    if tool_id == "nav" and intent in {{"navigation", "medical_emergency"}}:
                        return "Navigating"
                    if tool_id == "call_phone":
                        return f"Calling {{data.get('parameter', '911')}}"

                    return f"Executed Tool: {{tool_id}}"
            """
        ).strip() + "\n"

    @staticmethod
    def build_sdk_archive(
        name: str,
        nodes: List[Dict[str, Any]],
        edges: List[Dict[str, Any]],
        package_name: str | None = None,
        default_model: str | None = None,
    ) -> Tuple[str, bytes]:
        resolved_package = SDKService._sdk_package_name(name, package_name)
        distribution_name = SDKService._distribution_name(resolved_package)
        resolved_model = SDKService._find_default_model(nodes, default_model)
        graph_payload = SDKService._make_graph_payload(name, nodes, edges)

        buffer = io.BytesIO()
        root_dir = distribution_name

        with zipfile.ZipFile(buffer, "w", zipfile.ZIP_DEFLATED) as archive:
            archive.writestr(
                f"{root_dir}/README.md",
                SDKService._readme(name, resolved_package, distribution_name),
            )
            archive.writestr(
                f"{root_dir}/pyproject.toml",
                SDKService._pyproject(name, distribution_name, resolved_package),
            )
            archive.writestr(
                f"{root_dir}/{resolved_package}/__init__.py",
                SDKService._init_py(resolved_package),
            )
            archive.writestr(
                f"{root_dir}/{resolved_package}/runner.py",
                SDKService._runner_py(resolved_model),
            )
            archive.writestr(
                f"{root_dir}/{resolved_package}/graph.json",
                json.dumps(graph_payload, indent=2, ensure_ascii=False),
            )

        return f"{distribution_name}.zip", buffer.getvalue()
