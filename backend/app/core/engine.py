import logging
from typing import List, Dict, Any

logger = logging.getLogger(__name__)


class GraphEngine:
    def __init__(self, nodes: List[Dict], edges: List[Dict]):
        self.nodes = {n["id"]: n for n in nodes}
        self.edges = edges
        self.context = {}
        self.execution_log = []  # Store executed node IDs for testing

    def run(self, initial_input: Any):
        logger.info(f"Starting Graph Execution with input: {initial_input}")
        self.execution_log = []

        # Find start nodes (systemInput)
        start_nodes = [n for n in self.nodes.values() if n["type"] == "systemInput"]

        if not start_nodes:
            logger.error("No start nodes found")
            return

        for node in start_nodes:
            self._execute_node(node, initial_input)

    def _execute_node(self, node: Dict, input_data: Any):
        logger.info(
            f"Executing Node: {node['data'].get('label', node['id'])} ({node['type']})"
        )
        self.execution_log.append(node["id"])

        output = input_data

        # 1. Process Node Logic
        try:
            if node["type"] == "llm":
                output = self._process_llm(node, input_data)
            elif node["type"] == "logic":
                output = self._process_logic(node, input_data)
            elif node["type"] == "car_control":
                output = self._process_control(node, input_data)
            elif node["type"] == "tool":
                output = self._process_tool(node, input_data)

            # 2. Traverse Edges
            outgoing = [e for e in self.edges if e["source"] == node["id"]]

            for edge in outgoing:
                target_node = self.nodes.get(edge["target"])
                if not target_node:
                    continue

                # Logic Node Branching
                if node["type"] == "logic":
                    if edge.get("sourceHandle") == "true" and output is True:
                        self._execute_node(target_node, output)
                    elif edge.get("sourceHandle") == "false" and output is False:
                        self._execute_node(target_node, output)
                else:
                    self._execute_node(target_node, output)

        except Exception as e:
            logger.error(f"Node execution failed: {e}")

    def _process_llm(self, node: Dict, input_data: Any):
        # Mock LLM processing
        # In real implementation, this would call self.inference_service
        text = input_data if isinstance(input_data, str) else str(input_data)
        intent = "unknown"

        if "dizzy" in text.lower() or "help" in text.lower():
            intent = "medical_emergency"
        elif "window" in text.lower():
            intent = "control_windows"

        return {"intent": intent, "text": "Processed by Python Engine", "raw": text}

    def _process_logic(self, node: Dict, input_data: Any):
        # Simple evaluation
        condition = node["data"].get("condition", "")
        if not condition:
            return True

        # Safe eval environment
        local_scope = {"input": input_data, "intent": input_data.get("intent")}
        try:
            # Very basic eval for demo - security risk in prod
            # "input.intent == 'medical_emergency'"
            # Python equivalent: input_data['intent'] == 'medical_emergency'

            # Simple translator for JS-like syntax to Python
            py_condition = condition.replace("===", "==").replace(
                "input.intent", "intent"
            )
            return eval(py_condition, {}, local_scope)
        except Exception as e:
            logger.error(f"Logic eval error: {e}")
            return False

    def _process_control(self, node: Dict, input_data: Any):
        action = node["data"].get("action")
        logger.info(f"ACTION TRIGGERED: {action}")
        return f"Executed {action}"

    def _process_tool(self, node: Dict, input_data: Any):
        tool = node["data"].get("tool")
        logger.info(f"TOOL CALLED: {tool}")
        return f"Called {tool}"
