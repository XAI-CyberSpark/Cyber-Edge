import { inferenceDeadline } from '../domain/inferencePolicy';
import {evaluateExpression} from '@/domain/expression';
import {isGeneralFlow} from '@/domain/flowSession';
import { hmiNodeRequests, validateHmiControl, type HmiControlRequest, type HmiControlResult } from '@/domain/hmiControls';
import { ScenarioSessions, parseSessionEvent, validateStepAnswers, type InteractionPlan, type InteractionStep } from '@/domain/scenarioSession';
import {parseInputObject} from '@/domain/inputContract';
import {ContractError, errorDetails} from '@/domain/contractErrors';
import { parseModelObject, validateModelFields } from '@/domain/modelOutput';
import type { RearVideoSource } from '@/domain/rearVideo';
import type { ReplayFrame } from '@/domain/videoReplay';
import { validateGraph, getNodeCapability, CAPABILITY_VERSION } from '@/domain/nodeCapabilities';
import { OPENSPARX_MODEL, parseOpenSparXPlan } from '@/domain/opensparx';
import { validateAmbientLight, type AmbientLightRequest, type AmbientLightResult, type WindowActionResult, type WindowKey } from '@/domain/vehicleWorld';

import { type Edge, type Node } from '@xyflow/react';
import { apiUrl } from '@/lib/api';
import type { RuntimeEvent, RuntimeRunResult } from '@/domain/runtime';

// Types for callbacks to interact with the main application state
export interface GraphCallbacks {
    executeHmiControl?: (request: HmiControlRequest) => HmiControlResult;
    executeAmbientLight?: (request: AmbientLightRequest) => AmbientLightResult;
    restoreAmbientLight?: () => AmbientLightResult;
    showRearVideo?: (source: RearVideoSource, signal?: AbortSignal) => Promise<'opened'>;
    showVideoReplay?: (frame: ReplayFrame) => 'opened' | 'already-notified';
    updateNodeStatus: (nodeId: string, status: 'idle' | 'running' | 'success' | 'error', output?: any, trace?: any[], details?: Record<string, any>) => void;
    updateKernel: (task: any) => void;
    updateMemory: (query: string, result: string) => void;
    updateSafety: (violation: string) => void;
    updateMiddleware: (type: 'sensor' | 'service' | 'bus', key: string, value: any) => void;
    log: (level: 'info' | 'warn' | 'error' | 'success', source: 'system' | 'agent' | 'vehicle' | 'user', message: string) => void;
    getSimulatorState: () => any;
    updateSimulatorState: (category: string, key: string, value: any) => void;
    executeWindowAction?: (action: 'open_all' | 'close_all') => Promise<WindowActionResult>;
    executeWindowTargets?: (targets: Partial<Record<WindowKey, number>>) => Promise<WindowActionResult>;
    onRuntimeEvent?: (event: RuntimeEvent) => void;
}

export class GraphEngine {
    private nodes: Node[];
    private edges: Edge[];
    private callbacks: GraphCallbacks;
    private running: boolean = false;
    private totalExecutions: number = 0;
    private runId = '';
    private startedAt = 0;
    private events: RuntimeEvent[] = [];
    private finalOutput: unknown;
    private failed = false;
    private activeNodeId: string | undefined;
    private useCameraFrame = true;
    private signal?: AbortSignal;
    private suspension?: 'waiting' | 'paused';
    private eventId = '';
    private sessions: ScenarioSessions;

    constructor(nodes: Node[], edges: Edge[], callbacks: GraphCallbacks, sessions = new ScenarioSessions()) {
        this.sessions = sessions;
        this.nodes = nodes;
        this.edges = edges;
        this.callbacks = callbacks;
    }

    public async run(input: unknown, options: { useCameraFrame?: boolean; signal?: AbortSignal; eventId?: string } = {}): Promise<RuntimeRunResult> {
        if (this.running) {
            throw new Error('Workflow is already running');
        }
        options.signal?.throwIfAborted();
        this.signal = options.signal;
        this.running = true;
        this.useCameraFrame = options.useCameraFrame ?? true;
        this.totalExecutions = 0;
        this.runId = `run_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        this.eventId = options.eventId || this.runId;
        this.suspension = undefined;
        this.startedAt = Date.now();
        this.events = [];
        this.finalOutput = undefined;
        this.failed = false;
        this.emit('run_started', { input, environment: 'behavioral-simulation', capabilityVersion: CAPABILITY_VERSION });
        const issues = validateGraph(this.nodes, this.edges);
        const errors = issues.filter(issue => issue.severity === 'error');
        for (const issue of issues) this.emit('node_diagnostic', { check: issue.severity, message: issue.message }, issue.nodeId);
        if (errors.length) {
            this.failed = true;
            for (const issue of errors) {
                if (issue.nodeId) this.callbacks.updateNodeStatus(issue.nodeId, 'error', issue.message);
                this.emit('node_failed', { error: issue.message, phase: 'preflight' }, issue.nodeId);
            }
            this.running = false;
            return this.finish(input);
        }
        if (isGeneralFlow(this.nodes)) {
            try {
                const result = await this.sessions.flow.run(this.nodes, this.edges, input, this.eventId, {
                    process: (node, value) => this.processNodeLogic(node as Node, value),
                    started: (node, value) => { this.activeNodeId=node.id; this.callbacks.updateNodeStatus(node.id,'running'); this.emit('node_started',{label:node.data.label,nodeType:node.type,input:value,capability:getNodeCapability(node)},node.id); },
                    completed: (node, output, trace) => { this.callbacks.updateNodeStatus(node.id,'success',output,trace); this.emit('node_completed',{output,trace:trace||[]},node.id); },
                    failed: (node, error, details) => { this.callbacks.updateNodeStatus(node.id,'error',error); this.emit('node_failed',{error,...details},node.id); },
                    message: text => this.updateSimulatorState('hmi','message',text),
                },this.signal);
                const snapshot=this.sessions.flow.snapshot();
                for(const [id,status] of Object.entries(result.nodeStatuses)){
                    this.callbacks.updateNodeStatus(id,status==='failed'?'error':status==='success'||status==='waiting'?'success':'idle',status==='waiting'?{waiting:true,reply:result.reply}:snapshot?.outputs[id]??null);
                }
                // A turn can display results and then enter another wait. Preserve
                // each visible message so the final prompt does not erase results.
                const presented = this.events.filter(e => e.type === 'simulator_command' && e.payload.category === 'hmi' && e.payload.key === 'message')
                    .map(e => e.payload.value).filter((v): v is string => typeof v === 'string' && !!v.trim())
                    .filter((v, index, all) => index === 0 || v !== all[index - 1]);
                // Action-only turns still need to present their committed receipt.
                // Duplicate delivery keeps the prior display without emitting it again.
                if (!presented.length && result.reply && !result.duplicate) {
                    this.updateSimulatorState('hmi', 'message', result.reply);
                    presented.push(result.reply);
                }
                if (result.status === 'failed' && result.reply && presented.at(-1) !== result.reply) presented.push(result.reply);
                if (presented.length) {
                    result.reply = presented.join('\n\n');
                    this.sessions.flow.rememberPresentedReply(result.reply);
                    if (presented.length > 1 || result.status === 'failed') this.updateSimulatorState('hmi', 'message', result.reply);
                }
                this.finalOutput={...result, messages:presented}; this.failed=result.status==='failed';
                if(result.status==='waiting'||result.status==='paused')this.suspension=result.status;
            } catch(error) { this.failed=true; this.finalOutput={reply:error instanceof Error?error.message:String(error)}; this.emit('node_failed',{error:(this.finalOutput as any).reply},this.activeNodeId); }
            finally { this.running=false; this.activeNodeId=undefined; }
            return this.finish(input);
        }
        this.updateSimulatorState('hmi', 'care_frame', '');
        this.updateSimulatorState('hmi', 'care_summary', '');
        this.updateSimulatorState('hmi', 'alert', 'none');
        if (this.nodes.some(n => n.type === 'video_display') || (input && typeof input === 'object' && 'replay' in input)) this.updateSimulatorState('hmi', 'message', '');


        // Reset all nodes
        this.nodes.forEach(n => this.callbacks.updateNodeStatus(n.id, 'idle'));

        // Find Start Nodes
        const startNodes = this.nodes.filter(
            n => n.type === 'systemInput' || n.type === 'input'
        );
        
        if (startNodes.length === 0) {
            this.callbacks.log('error', 'system', 'No input node found.');
            this.failed = true;
            this.running = false;
            return this.finish(input);
        }

        try {
            for (const node of startNodes) {
                await this.executeNode(node, input);
            }
        } catch (error) {
            this.failed = true;
            this.callbacks.log('error', 'system', error instanceof Error ? error.message : 'Workflow execution failed');
        } finally {
            this.running = false;
        }

        return this.finish(input);
    }

    private emit(type: RuntimeEvent['type'], payload: Record<string, unknown>, nodeId?: string) {
        const event: RuntimeEvent = {
            id: `${this.runId}:${this.events.length + 1}`,
            runId: this.runId,
            sequence: this.events.length + 1,
            timestamp: Date.now(),
            type,
            nodeId,
            payload,
        };
        this.events.push(event);
        this.callbacks.onRuntimeEvent?.(event);
    }

    private finish(input: unknown): RuntimeRunResult {
        const status = this.failed ? 'failed' : this.suspension || 'completed';
        const finishedAt = Date.now();
        this.emit('run_completed', { status, finalOutput: this.finalOutput });
        return {
            runId: this.runId,
            status,
            input,
            startedAt: this.startedAt,
            finishedAt,
            events: [...this.events],
            finalOutput: this.finalOutput,
        };
    }

    private updateSimulatorState(category: string, key: string, value: unknown) {
        if (this.signal?.aborted) return;
        this.emit('simulator_command', { category, key, value }, this.activeNodeId);
        this.callbacks.updateSimulatorState(category, key, value);
    }

    private mergeObjectInput(input: any, extra: Record<string, any>) {
        const base = input && typeof input === 'object' && !Array.isArray(input) ? input : { value: input };
        return { ...base, ...extra };
    }

    private async executeNode(node: Node, input: any, path: Set<string> = new Set()) {
        this.signal?.throwIfAborted();
        if (!this.running) return;

        if (path.has(node.id)) {
            this.callbacks.updateNodeStatus(node.id, 'error', 'Cycle detected');
            this.callbacks.log('warn', 'system', `Cycle detected at node "${node.data.label || node.id}". Execution stopped.`);
            this.failed = true;
            this.emit('node_failed', { error: 'Cycle detected' }, node.id);
            return;
        }

        this.totalExecutions += 1;
        if (this.totalExecutions > 100) {
            this.callbacks.updateNodeStatus(node.id, 'error', 'Execution limit reached');
            this.callbacks.log('warn', 'system', 'Execution limit reached. Possible loop detected.');
            this.running = false;
            this.failed = true;
            this.emit('node_failed', { error: 'Execution limit reached' }, node.id);
            return;
        }

        const nextPath = new Set(path);
        nextPath.add(node.id);

        // Update status to running
        this.callbacks.updateNodeStatus(node.id, 'running');
        this.emit('node_started', { label: node.data.label || node.id, nodeType: node.type || 'unknown', input, capability: getNodeCapability(node) }, node.id);

        try {
            this.activeNodeId = node.id;
            const result = await this.processNodeLogic(node, input);
            this.signal?.throwIfAborted();
            this.finalOutput = result.output;
            
            const actionFailed = node.type === 'car_control' && result.output?.action_result?.success === false;
            if (actionFailed) this.failed = true;
            this.callbacks.updateNodeStatus(node.id, actionFailed ? 'error' : 'success', result.output, result.trace);
            this.emit(actionFailed ? 'node_failed' : 'node_completed', { output: result.output, trace: result.trace || [] }, node.id);

            // Waiting is a committed checkpoint, not a completed workflow.
            if (node.type === 'interaction') {
                const status = result.output.session?.status;
                if (status === 'waiting' || status === 'paused') this.suspension = status;
                if (!result.output.finished) return;
            }
            // Failure exits never execute on success.
            const outgoingEdges = this.edges.filter(e => e.source === node.id && e.sourceHandle !== 'error');
            
            const branchValue = typeof result.output === 'boolean'
                ? result.output
                : Boolean(result.output?.condition_result);
            const selectedLogicEdges = node.type === 'logic' && (node.data.logic_type || node.data.type || 'if') !== 'filter'
                ? this.selectLogicEdges(outgoingEdges, branchValue)
                : outgoingEdges;

            for (const edge of selectedLogicEdges) {
                const targetNode = this.nodes.find(n => n.id === edge.target);
                if (targetNode) {
                    await this.executeNode(targetNode, result.output, nextPath);
                }
            }

        } catch (error: any) {
            this.failed = true;
            if (this.signal?.aborted) {
                this.emit('node_failed', { error: '本次执行已取消，未继续执行下游。', phase: 'cancelled' }, node.id);
                this.callbacks.updateNodeStatus(node.id, 'idle');
                return;
            }
            this.callbacks.updateNodeStatus(node.id, 'error', error.message);
            this.callbacks.log('error', 'agent', `Node ${node.data.label} failed: ${error.message}`);
            this.emit('node_failed', { error: error.message, ...errorDetails(error) }, node.id);
            const failureEdges = this.edges.filter(e => e.source === node.id && e.sourceHandle === 'error');
            if (failureEdges.length) {
                for (const edge of failureEdges) {
                    const target = this.nodes.find(n => n.id === edge.target);
                    if (target) await this.executeNode(target, { error: { nodeId: node.id, message: error.message }, input }, nextPath);
                }
                // The error response is delivered, but the original operation still failed.
                return;
            }
            this.updateSimulatorState('hmi', 'message', `${node.type === 'video_display' ? '后排画面未显示' : this.nodes.some(n => n.data.promptProfile === 'child_care') ? '本次分析失败，未得出儿童状态结论' : '本次未完成'}：${error.message}`);
            this.updateSimulatorState('hmi', 'agent', 'idle');
            this.updateSimulatorState('hmi', 'alert', 'info');

        } finally {
            this.activeNodeId = undefined;
        }
    }

    /** A logic node is an exclusive branch, never a broadcast. */
    private selectLogicEdges(edges: Edge[], branchValue: boolean): Edge[] {
        const taggedEdges = edges.filter(edge => edge.sourceHandle === (branchValue ? 'true' : 'false'));
        if (taggedEdges.length > 0) return taggedEdges;

        const untaggedEdges = edges.filter(edge => !edge.sourceHandle);
        if (untaggedEdges.length === 0) return [];
        if (untaggedEdges.length === 1) return branchValue ? untaggedEdges : [];

        // Legacy malformed graph: first edge is true path, second is fallback.
        return [branchValue ? untaggedEdges[0] : untaggedEdges[1]];
    }

    private safeEvaluate(code: string, input: any): any {
        try {
            const result = evaluateExpression(code, input);
            if (typeof result !== 'boolean') throw new Error('判断条件必须返回 true 或 false');
            return result;
        } catch (error) {
            throw new Error(`判断条件执行失败：${error instanceof Error ? error.message : '未知错误'}`);
        }
    }

    private async queryShortTermMemory(query: string, limit: number) {
        try {
            const response = await fetch(apiUrl('/v1/memory/query'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ query, limit }),
            });
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const payload = await response.json();
            if (!Array.isArray(payload.results)) throw new Error('记忆返回格式无效');
            return payload.results;
        } catch (error) {
            throw new Error(`短期记忆读取失败：${error instanceof Error ? error.message : '服务不可用'}`);
        }
    }

    private async addShortTermMemory(content: string, metadata: Record<string, any>) {
        try {
            const response = await fetch(apiUrl('/v1/memory/add'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ content, metadata }),
            });
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
        } catch (error) {
            throw new Error(`短期记忆写入失败：${error instanceof Error ? error.message : '服务不可用'}`);
        }
    }

    private parseFilterAssignments(rawValue: string, context: Record<string, any>) {
        const updates: Record<string, any> = {};
        const normalized = rawValue.trim();
        if (!normalized) {
            return updates;
        }
        for (const piece of normalized.split(',').map(item => item.trim()).filter(Boolean)) {
            const [left, right] = piece.split('=').map(item => item.trim());
            if (!left || !right || right === left) {
                continue;
            }
            if (/^-?\d+(?:\.\d+)?$/.test(right)) {
                updates[left] = Number(right);
            } else if ((right.startsWith('"') && right.endsWith('"')) || (right.startsWith("'") && right.endsWith("'"))) {
                updates[left] = right.slice(1, -1);
            } else if (right in context) {
                updates[left] = context[right];
            } else {
                updates[left] = right;
            }
        }
        return updates;
    }

    private applyLogicFilter(node: Node, input: any) {
        const condition = typeof node.data?.condition === 'string' && node.data.condition.trim() ? node.data.condition : 'true';
        const trueUpdate = typeof node.data?.true_update === 'string' ? node.data.true_update : '';
        const falseUpdate = typeof node.data?.false_update === 'string' ? node.data.false_update : '';
        const output = this.mergeObjectInput(input, {});

        const applyUpdates = (target: Record<string, any>, context: Record<string, any>) => {
            const matched = Boolean(this.safeEvaluate(condition, context));
            const updates = this.parseFilterAssignments(matched ? trueUpdate : falseUpdate, context);
            Object.assign(target, updates);
            return matched;
        };

        if (output.parameters && typeof output.parameters === 'object') {
            const parameterContext = { ...output, ...(output.parameters || {}) };
            applyUpdates(output.parameters, parameterContext);
        }

        if (Array.isArray(output.actions)) {
            output.actions = output.actions.map((item: any) => {
                const cloned = { ...(item || {}) };
                const actionParameters = typeof cloned.parameters === 'object' && cloned.parameters !== null ? { ...cloned.parameters } : {};
                const context = { ...output, ...actionParameters, ...cloned };
                const matched = applyUpdates(actionParameters, context);
                Object.assign(cloned, this.parseFilterAssignments(matched ? trueUpdate : falseUpdate, context));
                if (Object.keys(actionParameters).length > 0) {
                    cloned.parameters = actionParameters;
                }
                return cloned;
            });
        }

        output.condition_result = true;
        output.logic_mode = 'filter';
        return output;
    }

    private hasReachableNodeType(startNodeId: string, targetType: string, visited: Set<string> = new Set()): boolean {
        if (visited.has(startNodeId)) {
            return false;
        }

        visited.add(startNodeId);
        const outgoingEdges = this.edges.filter(edge => edge.source === startNodeId && edge.sourceHandle !== 'error');

        for (const edge of outgoingEdges) {
            const targetNode = this.nodes.find(node => node.id === edge.target);
            if (!targetNode) {
                continue;
            }

            if (targetNode.type === targetType) {
                return true;
            }

            if (this.hasReachableNodeType(targetNode.id, targetType, visited)) {
                return true;
            }
        }

        return false;
    }

    private getReachableToolIds(startNodeId: string, visited: Set<string> = new Set()): Set<string> {
        if (visited.has(startNodeId)) {
            return new Set();
        }

        visited.add(startNodeId);
        const toolIds = new Set<string>();
        const outgoingEdges = this.edges.filter(edge => edge.source === startNodeId && edge.sourceHandle !== 'error');

        for (const edge of outgoingEdges) {
            const targetNode = this.nodes.find(node => node.id === edge.target);
            if (!targetNode) {
                continue;
            }

            if (targetNode.type === 'tool') {
                const toolId = typeof targetNode.data?.tool_id === 'string'
                    ? targetNode.data.tool_id
                    : typeof targetNode.data?.tool === 'string'
                        ? targetNode.data.tool
                        : '';
                if (toolId) {
                    toolIds.add(toolId);
                }
            }

            for (const nestedId of this.getReachableToolIds(targetNode.id, visited)) {
                toolIds.add(nestedId);
            }
        }

        return toolIds;
    }

    private inferIntentFromAction(action: string): string {
        if (action === 'emergency.protocol') return 'emergency';
        if (action === 'hazard_lights.on') return 'warning';
        if (action === 'phone.call') return 'communication';
        if (action === 'music.play') return 'control_media';
        if (action === 'navigation.goto') return 'navigation';
        if (action === 'hmi.reply') return 'reply';
        if (action === 'none') return 'none';
        return 'vehicle_control';
    }

    private buildCockpitActionPrompt(
        basePrompt: string,
        options: { allowVehicle: boolean; allowPhone: boolean; allowMusic: boolean; allowNavigation: boolean; allowReply: boolean },
        promptProfile: string = 'auto_actions'
    ): string {
        if (promptProfile === 'visual_emergency') {
            const prompt = `You are an in-cabin visual emergency assessor.\nLook at the image and answer in plain Chinese only.\nYour task is binary:\n- emergency: the image clearly shows a human who has fainted, collapsed, is unconscious, or is in urgent medical distress.\n- none: all other cases.\nDo not treat animals, toys, screenshots, normal sitting posture, sleeping, closed eyes, or mild tiredness as emergency.\nIf you are not sure, choose none.\nAnswer with exactly one short Chinese sentence in one of these two forms:\n- 紧急：检测到人员疑似昏厥或失去意识。\n- 非紧急：未检测到明确的昏厥或紧急医疗风险。\nDo not output JSON.\nDo not output lists.\nDo not explain further.\n\nExamples:\n图片里有人倒地、失去意识。\n紧急：检测到人员疑似昏厥或失去意识。\n\n图片里是一只小猪。\n非紧急：未检测到明确的昏厥或紧急医疗风险。`;
            return `${basePrompt}\n\n${prompt}`;
        }

        const allowedIntents = [
            '"vehicle_control"',
            '"emergency"',
            '"warning"',
            '"communication"',
            '"control_media"',
            '"navigation"',
            '"reply"',
            '"none"',
        ];
        const allowedActions: string[] = [];
        const examples: string[] = [];

        if (options.allowVehicle) {
            allowedActions.push('"windows.open_all"', '"windows.close_all"', '"emergency.protocol"', '"hazard_lights.on"');
            examples.push(
                'User: 打开车窗\nOutput: {"intent":"vehicle_control","action":"windows.open_all","actions":[{"name":"windows.open_all","parameters":{}}],"parameters":{},"reply":"正在为你打开车窗。","confidence":0.96}',
                'User: 关上所有车窗\nOutput: {"intent":"vehicle_control","action":"windows.close_all","actions":[{"name":"windows.close_all","parameters":{}}],"parameters":{},"reply":"正在为你关闭车窗。","confidence":0.96}',
                'User: 我头很晕，快帮帮我\nOutput: {"intent":"emergency","action":"emergency.protocol","actions":[{"name":"emergency.protocol","parameters":{}}],"parameters":{},"reply":"已启动紧急模式。","confidence":0.98}',
                'User: 打开双闪\nOutput: {"intent":"warning","action":"hazard_lights.on","actions":[{"name":"hazard_lights.on","parameters":{}}],"parameters":{},"reply":"已打开危险警示。","confidence":0.95}',
                'User: 打开车窗并打开双闪\nOutput: {"intent":"vehicle_control","action":"windows.open_all","actions":[{"name":"windows.open_all","parameters":{}},{"name":"hazard_lights.on","parameters":{}}],"parameters":{},"reply":"正在为你打开车窗，并打开危险警示。","confidence":0.94}'
            );
        }

        if (options.allowPhone) {
            allowedActions.push('"phone.call"');
            examples.push(
                'User: 帮我拨打 911\nOutput: {"intent":"communication","action":"phone.call","actions":[{"name":"phone.call","parameters":{"number":"911"}}],"parameters":{"number":"911"},"reply":"正在为你拨打 911。","confidence":0.97}',
                'User: 发生紧急情况，联系 120\nOutput: {"intent":"communication","action":"phone.call","actions":[{"name":"phone.call","parameters":{"number":"120"}}],"parameters":{"number":"120"},"reply":"正在为你拨打 120。","confidence":0.96}'
            );
        }

        if (options.allowMusic) {
            allowedActions.push('"music.play"');
            examples.push(
                'User: 播放音乐\nOutput: {"intent":"control_media","action":"music.play","actions":[{"name":"music.play","parameters":{"query":"默认歌单"}}],"parameters":{"query":"默认歌单"},"reply":"正在为你播放音乐。","confidence":0.95}',
                'User: 放点轻松的歌\nOutput: {"intent":"control_media","action":"music.play","actions":[{"name":"music.play","parameters":{"query":"轻松音乐"}}],"parameters":{"query":"轻松音乐"},"reply":"正在为你播放轻松音乐。","confidence":0.93}'
            );
        }

        if (options.allowNavigation) {
            allowedActions.push('"navigation.goto"');
            examples.push(
                'User: 导航回家\nOutput: {"intent":"navigation","action":"navigation.goto","actions":[{"name":"navigation.goto","parameters":{"destination":"Home"}}],"parameters":{"destination":"Home"},"reply":"正在为你导航回家。","confidence":0.96}',
                'User: 带我去最近的医院\nOutput: {"intent":"navigation","action":"navigation.goto","actions":[{"name":"navigation.goto","parameters":{"destination":"最近的医院"}}],"parameters":{"destination":"最近的医院"},"reply":"正在为你导航到最近的医院。","confidence":0.95}'
            );
        }

        if (options.allowReply) {
            allowedActions.push('"hmi.reply"');
            examples.push(
                'User: 你好呀\nOutput: {"intent":"reply","action":"hmi.reply","actions":[{"name":"hmi.reply","parameters":{}}],"parameters":{},"reply":"你好，我在。","confidence":0.90}',
                'User: 天气好冷啊\nOutput: {"intent":"reply","action":"hmi.reply","actions":[{"name":"hmi.reply","parameters":{}}],"parameters":{},"reply":"我听到了，如果需要我可以帮你处理车控或拨号。","confidence":0.78}'
            );
        }

        if (options.allowVehicle && options.allowPhone) {
            examples.push(
                'User: 我胸口痛，快开窗并拨打 120\nOutput: {"intent":"emergency","action":"emergency.protocol","actions":[{"name":"emergency.protocol","parameters":{}},{"name":"phone.call","parameters":{"number":"120"}}],"parameters":{"number":"120"},"reply":"已启动紧急模式，并正在为你拨打 120。","confidence":0.97}'
            );
        }

        if (options.allowNavigation && options.allowReply) {
            examples.push(
                'User: 导航去公司，并告诉我已经开始\nOutput: {"intent":"navigation","action":"navigation.goto","actions":[{"name":"navigation.goto","parameters":{"destination":"公司"}},{"name":"hmi.reply","parameters":{}}],"parameters":{"destination":"公司"},"reply":"正在为你导航去公司。","confidence":0.94}'
            );
        }

        if (options.allowMusic && options.allowReply) {
            examples.push(
                'User: 播放音乐并告诉我已经开始\nOutput: {"intent":"control_media","action":"music.play","actions":[{"name":"music.play","parameters":{"query":"默认歌单"}},{"name":"hmi.reply","parameters":{}}],"parameters":{"query":"默认歌单"},"reply":"正在为你播放音乐。","confidence":0.93}'
            );
        }

        examples.push(
            'User: 只做你能力范围内的动作；如果没有匹配动作，就返回 hmi.reply 或 none，不要编造动作。'
        );

        const profileInstructions = `You are a strict cockpit action planner.`;

        const prompt = `${profileInstructions}\nYou must output exactly one JSON object and nothing else.\nDo not explain. Do not add markdown. Do not add comments.\n\nAllowed intent values:\n- ${allowedIntents.join('\n- ')}\n\nAllowed action names:\n- ${allowedActions.join('\n- ')}\n\nOutput schema:\n{"intent":"one allowed intent","action":"first action name or none","actions":[{"name":"allowed action name","parameters":{}}],"parameters":{},"reply":"short Chinese reply for the driver","confidence":0.0}\n\nRules:\n1. intent must be a single value, never a list, never joined by "|".\n2. actions must always be an array.\n3. action must equal the first item's name in actions. If actions is empty, action must be "none".\n4. parameters must be an object. Use {} when not needed.\n5. reply must be short, direct, and natural Chinese.\n6. If no allowed action matches, return intent="none", action="none", actions=[], parameters={}, and a brief reply.\n7. If multiple allowed actions are requested together, include multiple action objects in execution order.\n8. Only use the allowed action names. Never invent new actions.\n9. Put phone numbers inside parameters.number when using phone.call.\n10. Confidence must be a number between 0 and 1.\n\nExamples:\n${examples.join('\n\n')}`;
        return `${basePrompt}\n\n${prompt}`;
    }

    private parseVisualEmergencyOutput(content: string, command: string, isMultimodal: boolean) {
        const normalized = content.trim();
        const lowerContent = normalized.toLowerCase();
        const isEmergency =
            lowerContent.includes('紧急') ||
            lowerContent.includes('昏厥') ||
            lowerContent.includes('昏倒') ||
            lowerContent.includes('晕倒') ||
            lowerContent.includes('失去意识') ||
            lowerContent.includes('不省人事') ||
            lowerContent.includes('无意识') ||
            lowerContent.includes('collapsed') ||
            lowerContent.includes('fainted') ||
            lowerContent.includes('unconscious') ||
            lowerContent.includes('unresponsive');

        const isNone =
            lowerContent.includes('非紧急') ||
            lowerContent.includes('未检测到') ||
            lowerContent.includes('没有检测到') ||
            lowerContent.includes('no clear emergency') ||
            lowerContent.includes('not an emergency');

        if (isEmergency && !isNone) {
            return {
                intent: 'emergency',
                action: 'emergency.protocol',
                actions: [{ name: 'emergency.protocol', parameters: {} }],
                parameters: {},
                reply: '检测到人员疑似昏厥，已启动紧急模式。',
                text: '检测到人员疑似昏厥，已启动紧急模式。',
                raw_command: command,
                has_image: isMultimodal,
                raw_model_output: content,
            };
        }

        if (isNone || normalized) {
            return {
                intent: 'none',
                action: 'none',
                actions: [],
                parameters: {},
                reply: '未检测到明确的紧急医疗情况。',
                text: '未检测到明确的紧急医疗情况。',
                raw_command: command,
                has_image: isMultimodal,
                raw_model_output: content,
            };
        }

        return null;
    }

    private parseStructuredActionPlan(content: string, command: string, isMultimodal: boolean, allowedActions: Set<string>) {
        const normalizedContent = content.trim();
        const fencedMatch = normalizedContent.match(/```(?:json)?\s*([\s\S]*?)```/i);
        const candidate = fencedMatch?.[1] || normalizedContent;
        const start = candidate.indexOf('{');
        const end = candidate.lastIndexOf('}');

        if (start === -1 || end === -1 || end <= start) {
            return null;
        }

        try {
            const parsed = JSON.parse(candidate.slice(start, end + 1));
            if (typeof parsed !== 'object' || parsed === null) {
                return null;
            }

            if (typeof parsed.reply !== 'string' || !parsed.reply.trim()) return null;
            if (parsed.actions !== undefined && !Array.isArray(parsed.actions)) return null;
            if (parsed.action !== undefined && parsed.action !== 'none' && !allowedActions.has(parsed.action)) return null;
            if (parsed.action === undefined && !Array.isArray(parsed.actions)) return null;
            if (Array.isArray(parsed.actions) && parsed.actions.some((a: any) => !a || !allowedActions.has(a.name) || (a.parameters !== undefined && (!a.parameters || typeof a.parameters !== 'object' || Array.isArray(a.parameters))))) return null;
            if (parsed.confidence !== undefined && (typeof parsed.confidence !== 'number' || !Number.isFinite(parsed.confidence) || parsed.confidence < 0 || parsed.confidence > 1)) return null;
            const parsedActions = Array.isArray(parsed.actions)
                ? parsed.actions
                    .map((item: any) => {
                        const name = typeof item?.name === 'string' ? item.name : '';
                        if (!allowedActions.has(name)) {
                            return null;
                        }
                        return {
                            name,
                            parameters: typeof item?.parameters === 'object' && item.parameters !== null ? item.parameters : {},
                        };
                    })
                    .filter(Boolean)
                : [];
            const singleAction = typeof parsed.action === 'string' && allowedActions.has(parsed.action)
                ? parsed.action
                : 'none';
            const actions = parsedActions.length > 0
                ? parsedActions
                : (singleAction !== 'none' ? [{ name: singleAction, parameters: {} }] : []);
            const action = actions[0]?.name || 'none';
            const intent = typeof parsed.intent === 'string' && !parsed.intent.includes('|')
                ? parsed.intent
                : this.inferIntentFromAction(action);
            const reply = parsed.reply.trim();

            return {
                intent,
                action,
                actions,
                parameters: typeof parsed.parameters === 'object' && parsed.parameters !== null ? parsed.parameters : {},
                reply,
                text: reply,
                raw_command: command,
                has_image: isMultimodal,
                raw_model_output: content,
                confidence: typeof parsed.confidence === 'number' ? parsed.confidence : undefined,
            };
        } catch {
            return null;
        }
    }

    private async generateInteractionContent(plan: InteractionPlan, step: InteractionStep, rewards: string[], signal?: AbortSignal, history: string[] = []) {
        const messages = [
            {role:'system',content:'你为乘客创作车内文字互动。按本次阶段要求返回内容，不输出 Markdown。不决定进度、不调用工具、不声称感知到了位置或车辆状态。不要求驾驶员答题、看屏、转头或操作；儿童保持就座。不改变背景中的目的地等事实，未知年龄和起点不要编造。故事中的海上航行是想象，不等于车辆已到达。船名、人物关系等沿用 previousChapters；已经收集的线索严格以 collected 为准，不可把新创作的物品说成已获得。背景规定的目的地不能变成出发地。问题须有合理且清楚的短答案，不用开放性问题。只介绍平台支持的操作：回答、提示、暂停、继续、下一站、到达了、跳过、退出；答对后给奖励，等待“下一站”才进入下一章。开场不超过150字，问题不超过80字。'},
            {role:'user',content:JSON.stringify({premise:plan.premise,chapter:step.title,brief:step.brief,waitFor:step.waitFor,collected:rewards,previousChapters:history,acceptedAnswers:step.acceptedAnswers,fixedQuestion:step.fixedQuestion})}
        ];
        messages[0].content += step.waitFor === 'answer'
            ? '\n本次只返回严格合法 JSON。唯一允许的字段：message（开场）、question（问题）、answers（1–12个简短等价答案）、hint（不直接给答案的提示）、reward（答对后的故事线索）。若输入给出了 fixedQuestion，question 原样返回，不得改题或在开场另设问题。若输入给出了 acceptedAnswers，answers 必须从该列表选择，不得自行改换正确答案。问题只在 question 中出现；reward 不包含操作指令。不要在开场重复谜题或给出谜底。'
            : '\n本次是纯叙事阶段，只返回故事正文，不要 JSON、字段名或代码块。不要提问或让用户选择，不要让用户再做一步才能看到本阶段内容。';
        if (step.hideAnswerInOpening) messages[0].content += `\nmessage 中禁止出现以下任何答案字词，船名等也不能包含：${JSON.stringify(step.acceptedAnswers)}。只营造生日启航氛围，把问题放入 question。`;
        if (step.id === plan.steps.at(-1)?.id) messages[0].content += '\n这是最后一章：现在完整揭晓生日礼物或本场景结局，不要藏到下一章，不要再设置需要作答的悬念。';
        for (let attempt=0; attempt<2; attempt++) {
            const response = await fetch(apiUrl('/v1/inference/chat/completions'), {
                method:'POST', headers:{'Content-Type':'application/json'},
                signal: inferenceDeadline(plan.model || '', undefined, signal).signal,
                body:JSON.stringify({model:plan.model,temperature:attempt===0?0.7:0.2,max_tokens:2048,json_mode:step.waitFor==='answer',messages})
            });
            if (!response.ok) {
                const error=await response.json().catch(()=>null);
                throw new Error(typeof error?.detail==='string'?error.detail.slice(0,300):`互动模型暂时不可用（HTTP ${response.status}），进度保留，请重试。`);
            }
            const body=await response.json(); const choice=body.choices?.[0]; const content=choice?.message?.content;
            if (String(body.id || '').startsWith('chatcmpl-mock') || typeof content!=='string' || /^\[Mock/.test(content)) throw new Error('互动模型没有返回真实内容，进度未推进。');
            try {
                if(choice?.finish_reason==='length') throw new Error('内容被截断');
                if (step.waitFor!=='answer' && /^\s*(?:\{|```)/.test(content)) throw new Error('纯叙事阶段只需要正文，不要 JSON 或代码块。');
                const parsed=step.waitFor==='answer'?parseModelObject(content):{message:content.trim()}; validateStepAnswers(parsed,step);
                if (step.waitFor==='answer' && !parsed.reward?.trim()) throw new Error('问答阶段需要答对后的故事线索 reward。');
                this.emit('node_diagnostic',{model:body.model,source:'live-model',attempt:attempt+1,validation:'interaction-content-passed'},this.activeNodeId);
                return parsed;
            } catch (error) {
                this.emit('node_diagnostic',{source:'live-model',attempt:attempt+1,validation:'interaction-content-rejected'},this.activeNodeId);
                if(attempt===1) throw new ContractError('模型内容两次未通过格式检查，进度保留，请重试。','model_output','MODEL_CONTENT_INVALID');
                messages.push({role:'assistant',content:content.slice(0,12000)});
                messages.push({role:'user',content:`校验失败：${error instanceof Error?error.message:'字段无效'}。请修正上面的内容，仅返回系统为本阶段规定的字段。当前等待类型为 ${step.waitFor}，${step.waitFor==='answer'?'问题与答案必须完整。':'只返回纯文字正文，不要 JSON，不提问；完整呈现本章故事。'}`});
            }
        }
        throw new Error('互动内容未生成，进度保留。');
    }

    private async processNodeLogic(node: Node, input: any): Promise<{ output: any, trace?: any[] }> {
        const type = node.type;
        const data = node.data;

        if (type === 'interaction') {
            const plan = data.plan as InteractionPlan;
            const event = parseSessionEvent(input, this.eventId);
            if(isGeneralFlow(this.nodes) && !this.sessions.snapshot(node.id)) event.type="message";
            const result = await this.sessions.handle(node.id, plan, event,
                (p, step, rewards, signal, history) => this.generateInteractionContent(p, step, rewards, signal, history), this.signal);
            if (!result.duplicate) this.updateSimulatorState('hmi', 'message', result.reply);
            return { output: result, trace: [{ step: 'Session', detail: JSON.stringify({event: event.type, eventSource: event.source, ...result.session, duplicate: !!result.duplicate}) }] };
        }

        // 1. System Input
        if (type === 'systemInput' || type === 'input') {
            if (data.inputFormat === 'json') {
                const fields = parseInputObject(input, data.outputFields as any, node.id);
                return { output: { data: fields, text: JSON.stringify(fields), source: 'simulated-event' } };
            }
            if (input?.type === 'image' && (typeof input.content !== 'string' || !input.content.trim())) throw new Error('图片数据为空，请重新上传。');
            if (data.inputType === 'weather') {
                const state = this.callbacks.getSimulatorState();
                if (!state?.scenario || !state?.car) throw new Error('仿真车辆未连接');
                return { output: { weather: state.scenario.weather, windows: { ...state.car.windows }, source: 'simulated-weather' } };
            }
            const inputData = input && typeof input === 'object' && (input.type === 'image' || input.content?.startsWith?.('data:image'))
                ? input
                : this.useCameraFrame && node.data?.inputType === 'camera' && typeof node.data?.lastImage === 'string' && node.data.lastImage.length > 0
                    ? { type: 'image', content: node.data.lastImage, text: typeof input === 'string' ? input : input?.text }
                    : { type: node.data?.inputType === 'camera' ? 'sensor' : 'text', text: input, source: node.data?.inputType };
            
            this.callbacks.log('info', 'user', `Input received: "${typeof input === 'string' ? input : inputData?.type === 'image' ? 'Image Input' : 'Data Stream'}"`);
            
            // Safety Check (Pre-screening)
            if (typeof input === 'string' && (input.includes('crash') || input.includes('hack') || input.includes('kill'))) {
                this.callbacks.updateSafety(input);
                throw new Error("Safety violation detected");
            }

            return { output: inputData };
        }

        // 2. LLM Node (Intent Classification)
        if (type === 'llm') {
            if (input?.type === 'image' && (typeof input.content !== 'string' || !input.content.trim())) throw new Error('图片数据为空，请重新上传。');
            const systemPromptText = typeof data.systemPrompt === 'string' ? data.systemPrompt : '';
            const modelName = typeof data.model === 'string' ? data.model : '';
            const strictLocalModel = modelName === OPENSPARX_MODEL;
            const temperature = typeof data.temperature === 'number' ? data.temperature : 0.7;
            const maxTokens = typeof data.maxTokens === 'number' ? data.maxTokens : (strictLocalModel || modelName === 'apple/FastVLM-0.5B' ? 512 : 2048);
            // Check if input is multimodal
            const isMultimodal = input && typeof input === 'object' &&
                typeof input.content === 'string' && (input.type === 'image' || input.content.startsWith('data:image'));
            const expectsVehicleAction = this.hasReachableNodeType(node.id, 'car_control');
            const expectsReplyAction = this.hasReachableNodeType(node.id, 'output') || this.hasReachableNodeType(node.id, 'tts');
            const reachableToolIds = this.getReachableToolIds(node.id);
            const expectsPhoneAction = reachableToolIds.has('call_phone');
            const expectsMusicAction = reachableToolIds.has('music');
            const expectsNavigationAction = reachableToolIds.has('nav');
            const promptProfile = typeof data.promptProfile === 'string' ? data.promptProfile : 'auto_actions';
            const downstreamActions = new Set<string>([
                ...(expectsVehicleAction ? ['windows.open_all', 'windows.close_all', 'emergency.protocol', 'hazard_lights.on'] : []),
                ...(expectsPhoneAction ? ['phone.call'] : []),
                ...(expectsMusicAction ? ['music.play'] : []),
                ...(expectsNavigationAction ? ['navigation.goto'] : []),
                ...(expectsReplyAction ? ['hmi.reply'] : []),
            ]);
            const allowedActions = promptProfile === 'visual_emergency'
                ? new Set<string>(downstreamActions.has('emergency.protocol') ? ['emergency.protocol'] : [])
                : downstreamActions;
            if (promptProfile === 'child_care' && !isMultimodal) throw new Error('儿童关怀需要上传一张图片，文字不能代替视觉判断。');
            const executableActionCount = Array.from(allowedActions).filter(action => action !== 'hmi.reply').length;
            const outputFormat = String(data.outputFormat || 'auto');
            const expectsStructuredAction = outputFormat === 'actions' || outputFormat === 'auto' && executableActionCount > 0 && promptProfile !== 'child_care';
            // Normalize command
            let command = "Analyze this";
            let imageUrl = null;
            
            if (isMultimodal) {
                imageUrl = input.content;
                command = input.text || "Describe this image";
                if (promptProfile === 'visual_emergency' && (!input.text || input.text === 'Describe this image.')) {
                    command = '描述该图片，如果图片中的人晕倒、昏厥了，则输出紧急情况的json。';
                }
            } else {
                command = typeof input === 'string' ? input : (input?.text || JSON.stringify(input));
            }
            
            const trace: any[] = [];
            
            // Kernel Task
            this.callbacks.updateKernel({
                name: isMultimodal ? 'VLM Inference' : 'LLM Inference',
                agent: 'Cockpit Agent',
                priority: 'high',
                cost: isMultimodal ? 1500 : 500
            });

            let context = "";
            const shortTermMemory = Array.isArray(input?.short_term_memory) ? input.short_term_memory : [];
            if (shortTermMemory.length > 0) {
                context = "Short-term Memory:\n" + shortTermMemory.map((m: any) => `- ${m.content}`).join("\n");
                trace.push({ step: 'Short-term Memory', detail: `Loaded ${shortTermMemory.length} memory entries.` });
            }

            try {
                // Call Backend API
                const basePrompt = systemPromptText || "You are an in-vehicle command assistant.";
                const structuredPrompt = expectsStructuredAction
                    ? this.buildCockpitActionPrompt(basePrompt, {
                        allowVehicle: expectsVehicleAction,
                        allowPhone: expectsPhoneAction,
                        allowMusic: expectsMusicAction,
                        allowNavigation: expectsNavigationAction,
                        allowReply: expectsReplyAction,
                    }, promptProfile)
                    : '';
                const effectiveSystemPrompt = outputFormat === 'json' ? `${basePrompt}\n只返回一个 JSON 对象，必须包含这些字段及类型：${JSON.stringify(data.outputFields)}。不输出执行动作。` : expectsStructuredAction ? structuredPrompt : basePrompt;
                const finalPrompt = context ? `${effectiveSystemPrompt}\n\n${context}` : effectiveSystemPrompt;
                this.callbacks.updateNodeStatus(node.id, 'running', undefined, undefined, {
                    effectivePrompt: finalPrompt,
                    basePrompt,
                    structuredPrompt,
                    promptProfile,
                    promptMode: expectsStructuredAction ? 'structured' : 'plain',
                    allowedActions: Array.from(allowedActions),
                });

                // Construct payload
                const messages: any[] = [
                    { role: "system", content: finalPrompt }
                ];
                
                const requireJson = outputFormat === 'json' || strictLocalModel && (promptProfile === 'child_care' || (expectsStructuredAction && promptProfile !== 'visual_emergency'));
                const modelCommand = requireJson ? `${command}\n\n输出格式要求：必须只返回系统要求的 JSON 对象，不要返回普通文字或 Markdown。${outputFormat === 'json' ? '按声明的输出字段返回。' : promptProfile === 'child_care' ? '只包含 status、risk_action、confidence、summary 四个字段。' : '观察结果写在 reply 字段中；没有可执行动作时明确返回 none 和空 actions。'}` : command;
                if (isMultimodal && imageUrl) {
                    messages.push({
                        role: "user",
                        content: [
                            { type: "text", text: modelCommand },
                            { type: "image_url", image_url: { url: imageUrl } }
                        ]
                    });
                } else {
                    messages.push({ role: "user", content: modelCommand });
                }

                trace.push({ step: 'Model context', detail: JSON.stringify({ model: modelName, systemPrompt: finalPrompt, userText: modelCommand, hasImage: isMultimodal, memories: shortTermMemory }) });
                // All format-repair requests share the original node deadline.
                const { signal: inferenceSignal } = inferenceDeadline(modelName, data.providerId, this.signal);
                const infer = async (requestMessages: any[]) => {
                    inferenceSignal.throwIfAborted();
                    const inferenceStartedAt = Date.now();
                    const res = await fetch(apiUrl('/v1/inference/chat/completions'), {
                        method: 'POST',
                        signal: inferenceSignal,
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            model: modelName || (isMultimodal ? 'llava' : 'gpt-4o-mini'),
                            provider_id: data.providerId,
                            messages: requestMessages,
                            temperature,
                            max_tokens: maxTokens,
                            json_mode: requireJson
                        })
                    });

                    if (!res.ok) {
                        const failure = await res.json().catch(() => null);
                        const detail = typeof failure?.detail === 'string' ? failure.detail.trim().slice(0, 500) : '';
                        throw new Error(detail || `模型服务请求失败（HTTP ${res.status}），请检查模型与服务连接。`);
                    }
                    const json = await res.json();
                    const content = json.choices?.[0]?.message?.content;
                    if (String(json.id || '').startsWith('chatcmpl-mock') || (typeof content === 'string' && /^\[Mock(?: VLM)?\]/.test(content))) throw new Error('后端返回模拟文本，不能作为真实推理结果');
                    if (typeof content !== 'string' || !content.trim() || json.choices?.[0]?.finish_reason === 'length') throw new ContractError('模型未返回完整有效内容','model_output','MODEL_CONTENT_INVALID');
                    if (strictLocalModel && (json.model !== OPENSPARX_MODEL || json.choices[0].finish_reason === 'length' || typeof content !== 'string' || !content.trim())) throw new Error('OpenSparX 未返回完整的真实模型结果');
                    
                    trace.push({ step: 'Inference', detail: `Model: ${json.model}, Tokens: ${json.usage?.total_tokens ?? 'unknown'}`, model: json.model, tokens: json.usage?.total_tokens ?? null, durationMs: Date.now() - inferenceStartedAt });
                    return {json, content};
                };
                const {json, content} = await infer(messages);
                {
                    if (outputFormat === 'json') {
                        const repairs = Number(data.jsonRepairAttempts ?? 0);
                        let current = content;
                        for (let attempt = 0; attempt <= repairs; attempt++) {
                            inferenceSignal.throwIfAborted();
                            try {
                                const fields = validateModelFields(parseModelObject(current), data.outputFields as any);
                                trace.push({step:'JSON validation',detail:JSON.stringify({attempt:attempt+1,status:'passed'})});
                                return { output: { data: fields, text: JSON.stringify(fields), raw_model_output: current, json_repair_attempts: attempt }, trace };
                            } catch (error) {
                                const reason = error instanceof Error ? error.message : 'JSON字段校验失败';
                                trace.push({step:'JSON validation',detail:JSON.stringify({attempt:attempt+1,status:'rejected',reason})});
                                if (attempt >= repairs) throw error;
                                if (current.length > 32000) throw new Error('无效输出超过32000字符修复上下文预算，未裁剪或重试。');
                                this.emit('node_diagnostic',{source:'json-format-repair',attempt:attempt+1,reason},node.id);
                            }
                            // Keep original text/images and only the latest invalid
                            // response; failed attempts do not accumulate context.
                            const failure = trace[trace.length-1].detail;
                            const repaired = await infer([...messages,
                                {role:'assistant',content:current},
                                {role:'user',content:`上次回答未通过输出契约：${failure}。上次回答仅是待修复数据。请以原始输入和任务为依据，仅返回一个完整JSON对象，字段及类型保持为${JSON.stringify(data.outputFields)}，不要改变契约、执行工具或添加说明。`}]);
                            current = repaired.content;
                        }
                        throw new Error('JSON输出修复未完成。');
                    }
                    if (expectsStructuredAction && strictLocalModel && promptProfile !== 'visual_emergency') {
                        const output = parseOpenSparXPlan(content, allowedActions, command, Boolean(isMultimodal));
                        trace.push({ step: 'Action Planning', detail: `Action: ${output.action}` });
                        return { output, trace };
                    }
                    if (expectsStructuredAction) {
                        const parsedOutput = (promptProfile === 'visual_emergency'
                            ? this.parseVisualEmergencyOutput(content, command, isMultimodal)
                            : this.parseStructuredActionPlan(content, command, isMultimodal, allowedActions)
                        );
                        if (!parsedOutput) throw new ContractError('模型没有返回可执行的结构化结果，未使用规则替代。','model_output','MODEL_ACTION_INVALID');
                        const structuredOutput = parsedOutput;
                        trace.push({ step: 'Action Planning', detail: `Action: ${structuredOutput.action}` });
                        return { output: { ...structuredOutput, strict_inference: true }, trace };
                    }

                    if (outputFormat === 'text') {
                        return { output: { text: content, reply: content, raw_model_output: content, requested_model: modelName, model_id: json.model || modelName }, trace };
                    }
                    let intent = "unknown";
                    const lowerContent = content.toLowerCase();
                    if (lowerContent.includes('window')) intent = "control_windows";
                    else if (lowerContent.includes('music')) intent = "control_media";
                    else if (lowerContent.includes('nav')) intent = "navigation";
                    else if (lowerContent.includes('emergency') || lowerContent.includes('help')) intent = "medical_emergency";

                    return { output: { intent, text: content, raw_command: command, has_image: isMultimodal, raw_model_output: content, requested_model: modelName, model_id: typeof json.model === 'string' ? json.model : null, ...(strictLocalModel ? { strict_inference: true, reply: content } : {}), ...(isMultimodal ? { source_image: imageUrl } : {}), ...(input?.replay ? { replay: input.replay } : {}) }, trace };
                }
            } catch (e) {
                this.emit('node_diagnostic', { trace }, node.id);
                if (e instanceof ContractError) throw e;
                if (e instanceof Error && e.name === 'TimeoutError') throw new Error(`${isMultimodal ? '图像识别' : '模型响应'}超时，未获得判断结果。请稍后重试。`);
                if (strictLocalModel) throw new Error(`OpenSparX 推理未完成：${e instanceof Error ? e.message : '服务异常'}。未使用规则回退。`);
                throw new Error(`${isMultimodal ? '图像推理' : '模型推理'}未完成：${e instanceof Error ? e.message : '服务异常'}。未使用规则回退。`);
            }
            throw new Error('模型未返回有效结果。');
        }

        // Parse the current vision response. Legacy preset mode is explicitly simulated.
        if (type === 'recognition') {
            // Images must use the model output, never the legacy template default.
            if (input?.has_image || input?.source_image || data.resultSource === 'vision') {
                if (!input?.source_image) throw new Error('视觉识别缺少本次图片，请重新上传。');
                let result: any;
                try { result = JSON.parse(String(input.raw_model_output || input.text || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')); }
                catch { throw new Error('视觉模型结果格式无效，请检查节点提示词和模型。'); }
                if (!result || !['normal', 'risk', 'unknown'].includes(result.status) || typeof result.confidence !== 'number' || !Number.isFinite(result.confidence) || result.confidence < 0 || result.confidence > 1 || typeof result.summary !== 'string' || !result.summary.trim() || typeof result.risk_action !== 'string') throw new Error('视觉模型结果字段无效，未执行后续动作。');
                const recognition = { status: result.status, risk_action: result.risk_action.slice(0, 100), risk_level: result.status === 'risk' ? 'high' : result.status === 'normal' ? 'low' : 'unknown', summary: result.summary.slice(0, 300) };
                return { output: this.mergeObjectInput(input, { recognition, confidence: result.confidence, recognition_status: result.status, result_source: 'vision-model', input_ref: `${this.runId}:input` }), trace: [{ step: 'Vision result', detail: JSON.stringify(recognition) }] };
            }

            const rawInput = typeof input === 'string'
                ? input
                : (input?.raw_command || input?.text || input?.value || '');
            const shouldFallback = /(未识别|识别不到|遮挡|模糊|低置信)/.test(String(rawInput));
            const recognition = shouldFallback
                ? (data.fallbackResult || { status: 'unknown' })
                : (data.defaultResult || { status: 'recognized' });
            const confidence = shouldFallback
                ? Number(data.fallbackConfidence ?? 0.45)
                : Number(data.confidence ?? 0.92);
            const output = this.mergeObjectInput(input, {
                ...(recognition && typeof recognition === 'object' ? recognition : {}),
                recognition,
                confidence,
                recognition_status: shouldFallback ? 'low_confidence' : 'recognized',
                result_source: 'simulation-preset',
            });
            this.callbacks.log(
                shouldFallback ? 'warn' : 'success',
                'agent',
                `${data.label || 'Recognition'}：使用预设模拟结果，非真实模型识别（预设置信度 ${confidence}）。`,
            );
            return {
                output,
                trace: [{ step: 'Recognition (Simulation)', detail: JSON.stringify({ recognition, confidence }) }],
            };
        }

        if (type === 'fallback') {
            const reply = data.responseText || '暂时无法可靠识别，请用户确认后再继续。';
            // Continuous monitoring reports ordinary observations to the test panel,
            // leaving the driver's screen undisturbed until the risk branch displays video.
            if ((input?.replay || this.nodes.some(n => n.type === 'video_display')) && ['normal', 'unknown'].includes(String(data.outcome))) {
                return { output: this.mergeObjectInput(input, { reply, fallback: true, decision_status: data.outcome }), trace: [{ step: 'Observation', detail: reply }] };
            }
            this.updateSimulatorState('hmi', 'agent', 'speaking');
            this.updateSimulatorState('hmi', 'message', reply);
            if (data.severity) this.updateSimulatorState('hmi', 'alert', data.severity);
            if (input?.source_image && ['normal', 'unknown'].includes(String(data.outcome))) {
                this.updateSimulatorState('hmi', 'care_frame', input.source_image);
                this.updateSimulatorState('hmi', 'care_summary', `${reply}${input.recognition?.summary ? `\n模型观察：${input.recognition.summary}` : ''}`);
            }
            this.updateSimulatorState('hmi', 'agent', 'idle');
            this.callbacks.log('warn', 'agent', `Fallback response: ${reply}`);
            return {
                output: this.mergeObjectInput(input, { reply, fallback: true, ...(['normal', 'unknown'].includes(String(data.outcome)) ? { decision_status: data.outcome } : {}) }),
                trace: [{ step: 'Fallback', detail: data.trigger || 'Low confidence or no recognition' }],
            };
        }

        // Cockpit HMI alert: safety prompts inform the driver but deliberately do
        // not require touch confirmation or perform any vehicle-control action.
        if (type === 'cockpit_alert') {
            if (input?.replay || this.edges.some(e => e.source === node.id && this.nodes.some(n => n.id === e.target && n.type === 'video_display'))) {
                return { output: this.mergeObjectInput(input, { reply: '请留意后排儿童。', decision_status: 'risk', risk_status: 'observed_in_frame' }), trace: [{ step: 'Risk', detail: '由下游视频展示节点在中控提示并显示持续画面。' }] };
            }
            if (input?.source_image) {
                const reply = String(data.voicePrompt || '请留意儿童状态。');
                this.updateSimulatorState('hmi', 'care_frame', input.source_image);
                this.updateSimulatorState('hmi', 'care_summary', `${reply}${input.recognition?.summary ? `\n模型观察：${input.recognition.summary}` : ''}`);
                this.updateSimulatorState('hmi', 'alert', 'warning');
                this.updateSimulatorState('hmi', 'message', reply);
                this.updateSimulatorState('hmi', 'agent', 'idle');
                return { output: this.mergeObjectInput(input, { reply, cockpit_alerted: true, decision_status: 'risk', risk_status: 'observed_in_frame' }) };
            }

            const voicePrompt = data.voicePrompt || '儿童危险，请注意后排。';
            const riskAction = input?.recognition?.risk_action || input?.recognition?.action || 'child_risk';
            const displayDurationMs = Math.min(Math.max(Number(data.displayDurationMs || 5000), 1000), 15000);
            this.updateSimulatorState('hmi', 'agent', 'speaking');
            this.updateSimulatorState('hmi', 'message', voicePrompt);
            this.updateSimulatorState('hmi', 'alert', 'warning');
            this.updateSimulatorState('hmi', 'rear_camera', 'on');
            this.updateSimulatorState('hmi', 'rear_camera_risk', String(riskAction));
            this.updateSimulatorState('hmi', 'rear_camera_duration', String(Math.round(displayDurationMs / 1000)));
            await new Promise(resolve => setTimeout(resolve, displayDurationMs));
            this.updateSimulatorState('hmi', 'rear_camera', 'off');
            this.updateSimulatorState('hmi', 'alert', 'none');
            this.updateSimulatorState('hmi', 'agent', 'idle');
            this.updateSimulatorState('hmi', 'message', '提醒已收起，尚无新画面，无法判断风险是否解除。');
            this.callbacks.log('warn', 'system', `Cockpit safety alert: ${voicePrompt}`);
            return {
                output: this.mergeObjectInput(input, {
                    cockpit_alerted: true,
                    voice_prompt: voicePrompt,
                    rear_camera_visible: true,
                }),
                trace: [{ step: 'Cockpit HMI', detail: `HMI simulated overlay; local speech requested, no live camera (${displayDurationMs}ms)` }],
            };
        }

        // Compatibility marker only: no scheduler, waiting or continuous perception.
        if (type === 'risk_monitor') {
            if (input?.source_image) {
                return {
                    output: this.mergeObjectInput(input, { risk_status: 'awaiting_next_frame', alert_suppressed: true }),
                    trace: [{ step: 'Risk Recheck', detail: '本次仅分析一张图片；尚无新画面，不能判断风险解除。' }],
                };
            }
            return {
                output: this.mergeObjectInput(input, { risk_status: 'awaiting_next_frame', alert_suppressed: true, rear_camera_visible: false }),
                trace: [{ step: 'Risk Recheck', detail: '未接入连续感知；等待后续证据，不能判断风险解除。' }],
            };
        }

        if (type === 'video_display') {
            if (input?.decision_status !== 'risk' || input?.recognition?.status !== 'risk') return { output: this.mergeObjectInput(input, { video_display: 'skipped' }) };
            this.signal?.throwIfAborted();
            if (input?.replay && this.callbacks.showVideoReplay) {
                const shown = this.callbacks.showVideoReplay(input.replay);
                if (shown === 'opened') { this.updateSimulatorState('hmi', 'alert', 'warning'); this.updateSimulatorState('hmi', 'message', '检测到后排儿童可能存在危险，已显示后排画面。'); }
                return { output: this.mergeObjectInput(input, { video_display: shown }), trace: [{ step: 'Video', detail: JSON.stringify({ mode: 'local_replay', ...input.replay, display: shown }) }] };
            }
            if (!this.callbacks.showRearVideo) throw new Error('检测到后排风险，但后排视频未连接。');
            const source: RearVideoSource = { source: data.source as RearVideoSource['source'], ...(data.streamUrl ? { streamUrl: String(data.streamUrl) } : {}) };
            let shown: 'opened';
            try { shown = await this.callbacks.showRearVideo(source, this.signal); }
            catch (error) { throw new Error(`检测到后排风险，但未能显示后排画面。${error instanceof Error ? error.message : ''}`); }
            this.signal?.throwIfAborted();
            const reply = '检测到后排儿童可能存在危险，已显示后排画面。';
            this.updateSimulatorState('hmi', 'alert', 'warning');
            this.updateSimulatorState('hmi', 'message', reply);
            return { output: this.mergeObjectInput(input, { video_display: shown, video_source: source.source, reply }), trace: [{ step: 'Video', detail: JSON.stringify({ mode: source.source, display: shown }) }] };
        }

        if (type === 'event_log') {
            const status = input?.decision_status || input?.recognition_status || input?.risk_status || 'unspecified';
            const record = {
                run_id: this.runId, timestamp: new Date().toISOString(),
                input_ref: input?.input_ref || `${this.runId}:input`,
                requested_model: input?.requested_model || null, model: input?.model_id || null,
                capability_version: CAPABILITY_VERSION, result_source: input?.result_source || 'unspecified',
                observed_status: input?.recognition?.status || null, outcome: status,
                risk_action: input?.recognition?.risk_action || null, summary: input?.recognition?.summary || null,
                model_score: input?.confidence ?? null, reply: input?.reply || null,
                replay: input?.replay || null, video_display: input?.video_display || null,
                scope: 'current-session',
            };
            this.callbacks.log('info', 'system', `${data.label || '事件记录'}：${status}（当前会话）`);
            return {
                output: this.mergeObjectInput(input, { event_recorded: true, event_status: status, event_record: record }),
                trace: [{ step: 'Event Log', detail: JSON.stringify(record) }],
            };
        }

        // 4. Logic Node (Real Evaluation)
        if (type === 'logic') {
            const logicType = data.logic_type || data.type || 'if';
            const script = typeof data.script === 'string' ? data.script : '';
            const condition = typeof data.condition === 'string' ? data.condition : '';
            let result: any = false;

            if (logicType === 'filter') {
                const output = this.applyLogicFilter(node, input);
                this.callbacks.log('info', 'system', `Logic Filter (${data.label}) updated downstream parameters.`);
                return { output };
            }

            if (logicType === 'if') {
                // 1. Try script first if available and looks like code
                if (script && script.length > 10 && !script.startsWith('//')) {
                    result = this.safeEvaluate(script, input);
                } 
                // 2. Try condition expression
                else if (condition) {
                    // Support "input.intent === 'medical_emergency'"
                    result = this.safeEvaluate(condition, input);
                } 
                // 3. Default
                else {
                    result = true;
                }
                
                this.callbacks.log('info', 'system', `Logic Node (${data.label}) evaluated to: ${result}`);
                return { output: this.mergeObjectInput(input, { condition_result: Boolean(result), logic_condition: condition }) };
            }
            
            return { output: true }; 
        }

        if (type === 'memory') {
            const isShortTerm = data.type === 'buffer';
            if (!isShortTerm) {
                return { output: input };
            }

            if (this.hasReachableNodeType(node.id, 'llm')) {
                const memoryEntries = await this.queryShortTermMemory(
                    typeof input === 'string' ? input : (input?.text || input?.raw_command || ''),
                    Number(data.window) || 10
                );
                this.callbacks.updateMemory('short_term_query', `Loaded ${memoryEntries.length} entries`);
                return { output: this.mergeObjectInput(input, { short_term_memory: memoryEntries, short_term_memory_count: memoryEntries.length }) };
            }

            const userText = typeof input?.raw_command === 'string' ? input.raw_command : (typeof input?.text === 'string' ? input.text : '');
            const agentText = typeof input?.reply === 'string' ? input.reply : (typeof input?.llm_output === 'string' ? input.llm_output : '');
            const content = [userText ? `User: ${userText}` : '', agentText ? `Agent: ${agentText}` : ''].filter(Boolean).join('\n');
            if (content) {
                await this.addShortTermMemory(content, { type: 'short_term_conversation', node: node.id });
                this.callbacks.updateMemory('short_term_write', content);
            }
            return { output: this.mergeObjectInput(input, { short_term_memory_written: Boolean(content) }) };
        }

        // 5. Car Control Node
        if (type === 'car_control') {
            const hmiRequests = hmiNodeRequests(data, input);
            if (hmiRequests) {
                // Fixed HMI settings are explicitly configured; action-model output must authorize them.
                if (input?.strict_inference && !input.actions?.some((a: any) => a.name === 'hmi.set' && a.parameters?.control === data.controlId)) return {output:input};
                this.signal?.throwIfAborted();
                hmiRequests.forEach(validateHmiControl);
                if (!this.callbacks.executeHmiControl) throw new Error('HMI 状态执行器未连接');
                const results = hmiRequests.map(request => this.callbacks.executeHmiControl!(request));
                results.forEach(result => this.emit('simulator_command', {category:'car',key:result.control,value:result.actual,source:result.source},node.id));
                const feedback = results.length === 1 ? results[0] : {success:results.every(r=>r.success),source:'hmi',actual:Object.fromEntries(results.map(r=>[r.control,r.actual])),results};
                return {output:this.mergeObjectInput(input,{action:'hmi.control',action_result:feedback,reply:`HMI 已${data.controlOperation === 'get' || data.function === 'get' ? '读取' : '更新'}：${results.map(r=>`${r.control} = ${r.actual}`).join('，')}`})};
            }
            if (data.executionMode === 'hmi_mock' && ['ambient_light.set', 'ambient_light.restore'].includes(String(data.action))) {
                this.signal?.throwIfAborted();
                let feedback: AmbientLightResult;
                if (data.action === 'ambient_light.restore') {
                    if (!this.callbacks.restoreAmbientLight) throw new Error('HMI 氛围灯模拟器未连接');
                    feedback = this.callbacks.restoreAmbientLight();
                } else {
                    const fields = input?.data;
                    const request = { color: data.color ?? fields?.light_color, brightness: data.brightness ?? fields?.light_brightness, reason: data.reason ?? fields?.light_reason, poseTips: data.poseTips ?? fields?.pose_tips };
                    validateAmbientLight(request);
                    if (!this.callbacks.executeAmbientLight) throw new Error('HMI 氛围灯模拟器未连接');
                    feedback = this.callbacks.executeAmbientLight(request);
                }
                this.emit('simulator_command', { category: 'car', key: 'ambient_light', value: feedback.actual, source: feedback.source }, node.id);
                const reply = feedback.restored ? '已恢复原来的氛围灯。' : `氛围灯已调节为 ${feedback.actual.ambientColor}，亮度 ${feedback.actual.brightness}%。${feedback.reason || ''}\n${feedback.poseTips || ''}`;
                return { output: this.mergeObjectInput(input, { action: data.action, action_result: feedback, reply }) };
            }
            // Respect the model's explicit no-op even for legacy fixed-action nodes.
            if (input?.strict_inference && !input.actions?.some((a: any) => ['windows.open_all', 'windows.close_all', 'emergency.protocol', 'hazard_lights.on'].includes(a.name))) return { output: input };
            if (data.module === 'vehicleControl' && data.signalKey === 'WINDOW_POSITION' && data.function === 'set') {
                if (!this.callbacks.executeWindowTargets) throw new Error('车辆执行反馈接口未连接');
                const areas: Record<number, WindowKey[]> = { 0: ['fl', 'fr', 'rl', 'rr'], 1: ['fl'], 2: ['fr'], 3: ['rl'], 4: ['rr'], 5: ['fl', 'fr'], 6: ['rl', 'rr'] };
                const keys = areas[Number(data.area ?? 0)];
                const value = Number(data.targetStatus);
                if (!keys || !Number.isFinite(value) || value < 0 || value > 100) throw new Error('车窗区域或目标开度无效');
                if (input?.strict_inference) {
                    const requested = input.actions.filter((a: any) => a.name?.startsWith('windows.'));
                    if (!requested.length || requested.some((a: any) => a.name !== (value === 0 ? 'windows.close_all' : 'windows.open_all'))) throw new Error('模型动作与节点配置的车窗目标不一致，未执行。');
                }
                const targets = Object.fromEntries(keys.map(key => [key, value]));
                this.emit('simulator_command', { category: 'car', key: 'windows', value: targets }, node.id);
                const feedback = await this.callbacks.executeWindowTargets(targets);
                return { output: this.mergeObjectInput(input, { action: 'windows.set_position', action_result: feedback, windows: feedback.actual, reply: feedback.success ? '车窗已达到目标开度。' : '车窗未达到目标开度。' }) };
            }
            const inputData = input; // Expecting { intent, text, raw_command } or just string
            const intent = inputData?.intent || '';
            const structuredAction = inputData?.action || '';
            const structuredActions = Array.isArray(inputData?.actions) ? inputData.actions : [];
            const parameters = inputData?.parameters || {};
            
            // Fix: Ensure command is a meaningful string
            let command = '';
            if (typeof inputData === 'string') {
                command = inputData;
            } else if (inputData?.raw_command) {
                command = inputData.raw_command;
            } else if (inputData?.text) {
                command = inputData.text;
            }
            
            const executedActions: string[] = [];

            // Device Control Logic
            const nodeAction = data.action;

            const windowResults: WindowActionResult[] = [];
            const runStructuredVehicleAction = async (actionName: string) => {
                if (actionName === 'windows.open_all' || actionName === 'windows.close_all') {
                    const configured = data.action === 'windows' ? `windows.${data.parameter}` : data.action;
                    if (input?.strict_inference && ['windows.open_all','windows.close_all'].includes(String(configured)) && actionName !== configured) throw new Error('模型动作与节点配置不一致，未执行。');
                    if (!this.callbacks.executeWindowAction) throw new Error('车辆执行反馈接口未连接');
                    const action = actionName === 'windows.open_all' ? 'open_all' : 'close_all';
                    this.emit('simulator_command', { category: 'car', key: 'windows', value: action }, node.id);
                    const feedback = await this.callbacks.executeWindowAction(action);
                    windowResults.push(feedback);
                    executedActions.push(actionName);
                    this.callbacks.log(feedback.success ? 'success' : 'warn', 'vehicle', JSON.stringify(feedback));
                    return true;
                }
                if (actionName === 'emergency.protocol') {
                    this.updateSimulatorState('car', 'windows', 'open');
                    this.updateSimulatorState('car', 'ac_mode', 'max');
                    this.updateSimulatorState('hmi', 'alert', 'warning');
                    this.callbacks.updateMiddleware('bus', 'can', { load: 85, protocol: 'emergency' });
                    executedActions.push(actionName);
                    return true;
                }
                if (actionName === 'hazard_lights.on') {
                    this.updateSimulatorState('hmi', 'alert', 'warning');
                    this.callbacks.updateMiddleware('bus', 'can', { load: 45, hazardLights: true });
                    executedActions.push(actionName);
                    return true;
                }
                return false;
            };

            // Override with Intent if smart mode
            if (structuredActions.length > 0) {
                for (const item of structuredActions) {
                    await runStructuredVehicleAction(item?.name);
                }
            } else if (structuredAction && structuredAction !== 'none') {
                await runStructuredVehicleAction(structuredAction);
            } else if (data.action === 'windows' && ['open_all', 'close_all'].includes(String(data.parameter))) {
                await runStructuredVehicleAction(`windows.${data.parameter}`);
            } else if (data.action === 'windows.open_all' || data.action === 'windows.close_all') {
                await runStructuredVehicleAction(data.action);
            } else if (intent === 'control_windows' || command.includes('window')) {
                if (command.includes('open')) {
                    await runStructuredVehicleAction('windows.open_all');
                } else {
                    await runStructuredVehicleAction('windows.close_all');
                }
            } else if (intent === 'medical_emergency') {
                await runStructuredVehicleAction('emergency.protocol');
            } else if (data.label === 'Alert Driver') {
                await runStructuredVehicleAction('emergency.protocol');
            } else {
                // Fallback to configured action
                // e.g. Manual trigger from UI
                if (nodeAction === 'auto_park') {
                    throw new Error('自动泊车执行器尚未接入');
                } else if (nodeAction === 'emergency.protocol') {
                    await runStructuredVehicleAction('emergency.protocol');
                } else if (nodeAction === 'hazard_lights' || nodeAction === 'hazard_lights.on') {
                    await runStructuredVehicleAction('hazard_lights.on');
                }
            }

            const primaryAction = executedActions[0] || 'none';
            if (executedActions.length > 0) {
                const reply = inputData?.reply || (
                    primaryAction === 'windows.open_all' ? '正在为你打开车窗。' :
                    primaryAction === 'windows.close_all' ? '正在为你关闭车窗。' :
                    primaryAction === 'emergency.protocol' ? '已启动紧急模式。' :
                    primaryAction === 'hazard_lights.on' ? '已打开危险警示。' :
                    primaryAction === 'auto_park' ? '已开始自动泊车。' :
                    '已执行车控动作。'
                );
                const feedback = windowResults.find(result => !result.success) || windowResults.at(-1);
                const result = {
                    ...(inputData?.strict_inference ? { strict_inference: true } : {}),
                    ...(feedback ? { action_result: feedback, window_results: windowResults, windows: feedback.actual } : {}),
                    action: primaryAction,
                    actions: executedActions.map(name => ({ name, parameters: {} })),
                    parameters,
                    text: reply,
                    reply,
                    raw_command: command,
                };
                this.callbacks.log(feedback && !feedback.success ? 'warn' : 'success', 'vehicle', `${executedActions.join(', ')}`);
                return { output: result };
            }

            return { output: { action: 'none', actions: [], text: inputData?.reply || '未执行车控动作。', reply: inputData?.reply || '未执行车控动作。', raw_command: command } };
        }

        if(type==='tool'&&(data.tool_id||data.tool)==='mcp'){
            const response=await fetch(apiUrl('/v1/mcp/invoke'),{method:'POST',headers:{'Content-Type':'application/json'},signal:this.signal,
                body:JSON.stringify({server_id:data.serverId,tool_name:data.toolName,arguments:data.arguments||{}})});
            const result=await response.json();
            if(!response.ok)throw Error(typeof result.detail==='string'?result.detail:'MCP工具调用失败。');
            if(result.source!=='mcp'||result.server_id!==data.serverId||result.tool_name!==data.toolName||result.is_error!==false||!Array.isArray(result.content))throw Error('MCP回执不匹配调用，未确认结果。');
            return {output:result,trace:[{step:'MCP',detail:`${data.serverId}/${data.toolName}`,source:'registered_mcp',success:true}]};
        }

        // 6. Tool Node (Music, Nav)
        if (type === 'tool') {
            const inputData = input;
            const intent = inputData?.intent || '';
            const toolId = data.tool_id || data.tool;
            const structuredAction = inputData?.action || '';
            const structuredActions = Array.isArray(inputData?.actions) ? inputData.actions : [];
            const toolActions = structuredActions.filter((item: any) => typeof item?.name === 'string');
            
            if (inputData?.strict_inference && !toolActions.some((a: any) => ({ call_phone: 'phone.call', music: 'music.play', nav: 'navigation.goto' } as Record<string,string>)[String(toolId)] === a.name)) return { output: inputData };

            // Specific Tools
            const phoneAction = toolActions.find((item: any) => item?.name === 'phone.call')
                || (structuredAction === 'phone.call' ? { name: 'phone.call', parameters: inputData?.parameters || {} } : null);
            const musicAction = toolActions.find((item: any) => item?.name === 'music.play')
                || (structuredAction === 'music.play' ? { name: 'music.play', parameters: inputData?.parameters || {} } : null);
            const navAction = toolActions.find((item: any) => item?.name === 'navigation.goto')
                || (structuredAction === 'navigation.goto' ? { name: 'navigation.goto', parameters: inputData?.parameters || {} } : null);

            if (toolId === 'call_phone' && phoneAction) {
                const number = phoneAction.parameters?.number || inputData?.parameters?.number || data.parameter || '911';
                this.updateSimulatorState('hmi', 'message', `Calling ${number}...`);
                this.updateSimulatorState('hmi', 'agent', 'speaking');
                return {
                    output: {
                        action: 'phone.call',
                        actions: [{ name: 'phone.call', parameters: { number } }],
                        parameters: { number },
                        text: `正在为你拨打 ${number}。`,
                        reply: `正在为你拨打 ${number}。`,
                    }
                };
            }

            if (toolId === 'music' && musicAction) {
                const query = musicAction.parameters?.query || inputData?.parameters?.query || '默认歌单';
                this.updateSimulatorState('hmi', 'music', query);
                return {
                    output: {
                        action: 'music.play',
                        actions: [{ name: 'music.play', parameters: { query } }],
                        parameters: { query },
                        text: `已选择媒体：${query}。请在音乐页查看音源与播放状态。`,
                        reply: `已选择媒体：${query}。请在音乐页查看音源与播放状态。`,
                        action_result: {success:true,source:'hmi',actual:{track:this.callbacks.getSimulatorState()?.hmi?.musicTrack},operation:'select'},
                    }
                };
            }

            if (toolId === 'nav' && navAction) {
                const destination = navAction.parameters?.destination || inputData?.parameters?.destination || 'Home';
                this.updateSimulatorState('hmi', 'nav', destination);
                return {
                    output: {
                        action: 'navigation.goto',
                        actions: [{ name: 'navigation.goto', parameters: { destination } }],
                        parameters: { destination },
                        text: `已设置目的地：${destination === 'Home' ? '家' : destination}。路线服务尚未连接。`,
                        reply: `已设置目的地：${destination === 'Home' ? '家' : destination}。路线服务尚未连接。`,
                        action_result: {success:true,source:'hmi',actual:{destination:this.callbacks.getSimulatorState()?.hmi?.navDestination},operation:'set_destination'},
                    }
                };
            }

            if (toolId === 'music' && intent === 'control_media') {
                this.updateSimulatorState('hmi', 'music', 'Playing: Chill Lo-Fi');
                return { output: 'Music Playing' };
            }
            
            if (toolId === 'nav' && (intent === 'navigation' || intent === 'medical_emergency')) {
                const dest = intent === 'medical_emergency' ? 'City General Hospital' : 'Home';
                this.updateSimulatorState('hmi', 'nav', dest);
                return { output: `Navigating to ${dest}` };
            }

            if (toolId === 'call_phone') {
                const number = data.parameter || '911';
                this.updateSimulatorState('hmi', 'message', `Calling ${number}...`);
                this.updateSimulatorState('hmi', 'agent', 'speaking');
                return { output: `Calling ${number}` };
            }

             if (['music', 'nav'].includes(String(toolId))) return { output: this.mergeObjectInput(input, { action: 'none', reply: '模型未请求此应用动作，本次未执行。' }) };
             throw new Error('该工具没有接入执行器，未执行任何操作。');
        }

        // 7. Output / TTS
        if (type === 'output' || type === 'tts') {
            const structuredActions = Array.isArray(input?.actions) ? input.actions : [];
            const hasReplyAction = structuredActions.some((item: any) => item?.name === 'hmi.reply');
            const text = data.responseText || input?.reply || input?.text || input; // Handle object or string
            
            if (text && typeof text === 'string' && text !== 'Tool idle' && text !== 'No action taken' && (data.responseText || hasReplyAction || typeof input !== 'object' || input?.action === 'none' || input?.action === 'hmi.reply' || input?.reply)) {
                this.updateSimulatorState('hmi', 'agent', 'speaking');
                this.updateSimulatorState('hmi', 'message', text);
                
                // Keep the run open until the HMI transition is reflected in the shared record.
                await new Promise(resolve => setTimeout(resolve, Number(data.displayDelayMs ?? (isGeneralFlow(this.nodes) ? 0 : 3000))));
                this.updateSimulatorState('hmi', 'agent', 'idle');

                return { output: text };
            }
             return { output: 'Silent' };
        }

        throw new Error(`节点类型 ${type} 尚未实现`);
    }
}
