import { uiText, useUiLanguage } from '@/i18n';
import {
  Car, Accessibility, Activity, Wind, Camera, Eye,
  ShieldAlert, Mic, Database, Brain, Layers
} from 'lucide-react';
import { NavigationPanel } from './NavigationPanel';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { buildChildSafetyTemplate, createChildSafetyScenarioSpec } from '@/data/childSafetyScenario';

interface SceneLibraryPanelProps {
  open: boolean;
  onClose: () => void;
  onLoadTemplate: (template: { nodes: any[]; edges: any[]; meta?: Record<string, unknown> }, name: string) => void;
}

export function SceneLibraryPanel({ open, onClose, onLoadTemplate }: SceneLibraryPanelProps) {
  useUiLanguage();
  if (!open) return null;

  const loadTemplate = (templateName: string, name: string) => {
    const templates: Record<string, any> = {
      'parking-agent': {
        nodes: [
          { id: '1', type: 'systemInput', position: { x: 50, y: 150 }, data: { label: 'Parking Cam', inputType: 'camera' } },
          { id: '2', type: 'llm', position: { x: 300, y: 50 }, data: { label: 'Barrier Recog', category: 'vlm', systemPrompt: 'Identify if barrier is open/closed' } },
          { id: '3', type: 'llm', position: { x: 300, y: 250 }, data: { label: 'QR/Floor Recog', category: 'vlm', systemPrompt: 'Read QR code and floor number' } },
          { id: '4', type: 'logic', position: { x: 600, y: 50 }, data: { label: 'Barrier Open?', type: 'if', condition: 'status == "open"' } },
          { id: '5', type: 'car_control', position: { x: 850, y: 50 }, data: { label: 'Start Park', action: 'auto_park', parameter: 'start' } },
          { id: '6', type: 'tool', position: { x: 600, y: 250 }, data: { label: 'Payment', tool: 'pay_parking' } },
        ],
        edges: [
          { id: 'e1-2', source: '1', target: '2' },
          { id: 'e1-3', source: '1', target: '3' },
          { id: 'e2-4', source: '2', target: '4' },
          { id: 'e4-5', source: '4', target: '5', sourceHandle: 'true' },
          { id: 'e3-6', source: '3', target: '6' },
        ]
      },
      'elderly-care': {
        nodes: [
          { id: '1', type: 'systemInput', position: { x: 50, y: 150 }, data: { label: 'DMS Camera', inputType: 'camera' } },
          { id: '2', type: 'llm', position: { x: 300, y: 150 }, data: { label: 'Health Analysis', category: 'vlm', systemPrompt: 'Analyze face for pain, pale, or distress' } },
          { id: '3', type: 'logic', position: { x: 550, y: 150 }, data: { label: 'Is Distress?', type: 'if', condition: 'status == "distress"' } },
          { id: '4', type: 'tts', position: { x: 800, y: 50 }, data: { label: 'Voice Comfort', model: 'cosyvoice' } },
          { id: '5', type: 'tool', position: { x: 800, y: 250 }, data: { label: 'Notify Family', tool: 'send_alert' } },
        ],
        edges: [
          { id: 'e1-2', source: '1', target: '2' },
          { id: 'e2-3', source: '2', target: '3' },
          { id: 'e3-4', source: '3', target: '4', sourceHandle: 'true' },
          { id: 'e3-5', source: '3', target: '5', sourceHandle: 'true' },
        ]
      },
      'child-nanny': buildChildSafetyTemplate(createChildSafetyScenarioSpec()),
      'environment-assistant': {
        nodes: [
          { id: '1', type: 'systemInput', position: { x: 50, y: 50 }, data: { label: 'Rain Sensor', inputType: 'sensor' } },
          { id: '2', type: 'systemInput', position: { x: 50, y: 200 }, data: { label: 'Ext Camera', inputType: 'camera' } },
          { id: '3', type: 'logic', position: { x: 300, y: 50 }, data: { label: 'Raining?', type: 'if', condition: 'rain > 0' } },
          { id: '4', type: 'llm', position: { x: 300, y: 200 }, data: { label: 'Fog/Dust Check', category: 'vlm', systemPrompt: 'Detect fog, dust, or frost on window' } },
          { id: '5', type: 'car_control', position: { x: 550, y: 50 }, data: { label: 'Wipers On', action: 'wipers', parameter: 'auto' } },
          { id: '6', type: 'car_control', position: { x: 550, y: 150 }, data: { label: 'Close Windows', action: 'windows', parameter: 'close_all' } },
          { id: '7', type: 'car_control', position: { x: 550, y: 250 }, data: { label: 'AC Recirc', action: 'ac_mode', parameter: 'recirculation' } },
        ],
        edges: [
          { id: 'e1-3', source: '1', target: '3' },
          { id: 'e3-5', source: '3', target: '5', sourceHandle: 'true' },
          { id: 'e3-6', source: '3', target: '6', sourceHandle: 'true' },
          { id: 'e2-4', source: '2', target: '4' },
          { id: 'e4-7', source: '4', target: '7' },
        ]
      },
      'mobile-studio': {
        nodes: [
          { id: '1', type: 'systemInput', position: { x: 50, y: 150 }, data: { label: 'Cabin Cam', inputType: 'camera' } },
          { id: '2', type: 'llm', position: { x: 300, y: 150 }, data: { label: 'Selfie Analysis', category: 'vlm', systemPrompt: 'Detect selfie gesture and clothing colors' } },
          { id: '3', type: 'logic', position: { x: 550, y: 150 }, data: { label: 'Selfie Mode?', type: 'if', condition: 'gesture == "selfie"' } },
          { id: '4', type: 'car_control', position: { x: 800, y: 50 }, data: { label: 'Seat Adjust', action: 'seat_pos', parameter: 'photo_mode' } },
          { id: '5', type: 'car_control', position: { x: 800, y: 150 }, data: { label: 'Ambient Light', action: 'ambient_light', parameter: 'match_clothing' } },
          { id: '6', type: 'car_control', position: { x: 800, y: 250 }, data: { label: 'Visor Light', action: 'visor_light', parameter: 'on' } },
        ],
        edges: [
          { id: 'e1-2', source: '1', target: '2' },
          { id: 'e2-3', source: '2', target: '3' },
          { id: 'e3-4', source: '3', target: '4', sourceHandle: 'true' },
          { id: 'e3-5', source: '3', target: '5', sourceHandle: 'true' },
          { id: 'e3-6', source: '3', target: '6', sourceHandle: 'true' },
        ]
      },
      'smoking-detection': {
        nodes: [
          { id: '1', type: 'systemInput', position: { x: 50, y: 100 }, data: { label: 'Monitoring Camera', inputType: 'camera' } },
          { id: '2', type: 'llm', position: { x: 350, y: 100 }, data: { label: 'Visual Analysis', category: 'vlm', model: 'llava-v1.6-vicuna-7b', systemPrompt: 'Analyze the image for safety hazards. Is there anyone smoking?' } },
          { id: '3', type: 'logic', position: { x: 650, y: 100 }, data: { label: 'Is Smoking?', type: 'if', condition: 'smoking' } },
          { id: '4', type: 'tool', position: { x: 950, y: 50 }, data: { label: 'Send Alert', tool: 'notify_security', isSkill: true } },
          { id: '5', type: 'tool', position: { x: 950, y: 180 }, data: { label: 'Log Safe', tool: 'log_event' } },
        ],
        edges: [
          { id: 'e1-2', source: '1', target: '2' },
          { id: 'e2-3', source: '2', target: '3' },
          { id: 'e3-4', source: '3', target: '4', sourceHandle: 'true' },
          { id: 'e3-5', source: '3', target: '5', sourceHandle: 'false' },
        ]
      },
      'medical-emergency': {
        nodes: [
          { id: '1', type: 'systemInput', position: { x: 50, y: 150 }, data: { label: 'Microphone', inputType: 'microphone' } },
          { id: '2', type: 'llm', position: { x: 300, y: 150 }, data: { label: 'Intent NLU', category: 'llm', systemPrompt: 'Classify intent: medical_emergency or other' } },
          { id: '3', type: 'logic', position: { x: 550, y: 150 }, data: { label: 'Is Emergency?', type: 'if', condition: 'intent == "medical_emergency"' } },
          { id: '4', type: 'car_control', position: { x: 800, y: 50 }, data: { label: 'Emergency Stop', action: 'hazard_lights', parameter: 'on' } },
          { id: '5', type: 'tool', position: { x: 800, y: 150 }, data: { label: 'Call 911', tool: 'call_phone', parameter: '911' } },
          { id: '6', type: 'output', position: { x: 800, y: 250 }, data: { label: 'Comfort TTS' } },
        ],
        edges: [
          { id: 'e1-2', source: '1', target: '2' },
          { id: 'e2-3', source: '2', target: '3' },
          { id: 'e3-4', source: '3', target: '4', sourceHandle: 'true' },
          { id: 'e3-5', source: '3', target: '5', sourceHandle: 'true' },
          { id: 'e3-6', source: '3', target: '6', sourceHandle: 'false' },
        ]
      },
      'child-safety': {
        nodes: [
          { id: '1', type: 'data', position: { x: 50, y: 100 }, data: { label: 'Camera Stream', sourceType: 'stream', format: 'video' } },
          { id: '2', type: 'llm', position: { x: 300, y: 100 }, data: { label: 'Pose Estimation', category: 'vlm', model: 'yolo-v8-pose' } },
          { id: '3', type: 'logic', position: { x: 550, y: 100 }, data: { label: 'Dangerous?', type: 'if', condition: 'fall_detected || climb_detected' } },
          { id: '4', type: 'tool', position: { x: 800, y: 50 }, data: { label: 'Send Alert', tool: 'notify_parent' } },
          { id: '5', type: 'tool', position: { x: 800, y: 150 }, data: { label: 'Play Soothing', tool: 'play_audio' } },
        ],
        edges: [
          { id: 'e1-2', source: '1', target: '2' },
          { id: 'e2-3', source: '2', target: '3' },
          { id: 'e3-4', source: '3', target: '4', sourceHandle: 'true' },
          { id: 'e3-5', source: '3', target: '5', sourceHandle: 'true' },
        ]
      },
      'sentry': {
        nodes: [
          { id: '1', type: 'data', position: { x: 50, y: 100 }, data: { label: 'Outdoor Cam', sourceType: 'stream' } },
          { id: '2', type: 'llm', position: { x: 300, y: 100 }, data: { label: 'Object Det', category: 'vlm', model: 'yolo-world' } },
          { id: '3', type: 'logic', position: { x: 550, y: 100 }, data: { label: 'Person?', type: 'if', condition: 'class == "person"' } },
          { id: '4', type: 'tool', position: { x: 800, y: 100 }, data: { label: 'Trigger Alarm', tool: 'trigger_siren' } },
        ],
        edges: [
          { id: 'e1-2', source: '1', target: '2' },
          { id: 'e2-3', source: '2', target: '3' },
          { id: 'e3-4', source: '3', target: '4', sourceHandle: 'true' },
        ]
      },
      'voice-assistant': {
        nodes: [
          { id: '1', type: 'data', position: { x: 50, y: 100 }, data: { label: 'Microphone', sourceType: 'stream', format: 'audio' } },
          { id: '2', type: 'llm', position: { x: 300, y: 100 }, data: { label: 'Whisper STT', category: 'audio', model: 'whisper-large-v3' } },
          { id: '3', type: 'llm', position: { x: 550, y: 100 }, data: { label: 'Intent NLU', category: 'llm', systemPrompt: 'Extract user intent' } },
          { id: '4', type: 'logic', position: { x: 800, y: 100 }, data: { label: 'Is Command?', type: 'if' } },
          { id: '5', type: 'tool', position: { x: 1050, y: 50 }, data: { label: 'Execute Action', tool: 'smart_home_api' } },
          { id: '6', type: 'output', position: { x: 1050, y: 200 }, data: { label: 'Reply TTS' } },
        ],
        edges: [
          { id: 'e1-2', source: '1', target: '2' },
          { id: 'e2-3', source: '2', target: '3' },
          { id: 'e3-4', source: '3', target: '4' },
          { id: 'e4-5', source: '4', target: '5', sourceHandle: 'true' },
          { id: 'e4-6', source: '4', target: '6', sourceHandle: 'false' },
        ]
      },
      'rag-qa': {
        nodes: [
          { id: '1', type: 'input', position: { x: 50, y: 50 }, data: { label: 'User Question' } },
          { id: '2', type: 'memory', position: { x: 300, y: 50 }, data: { label: 'Vector DB', type: 'vector' } },
          { id: '3', type: 'llm', position: { x: 550, y: 50 }, data: { label: 'Answer Gen', category: 'llm' } },
          { id: '4', type: 'output', position: { x: 800, y: 50 }, data: { label: 'Final Answer' } },
        ],
        edges: [
          { id: 'e1-2', source: '1', target: '2' },
          { id: 'e2-3', source: '2', target: '3' },
          { id: 'e3-4', source: '3', target: '4' },
        ]
      },
      'react-agent': {
        nodes: [
          { id: '1', type: 'input', position: { x: 50, y: 150 }, data: { label: 'Task' } },
          { id: '2', type: 'llm', position: { x: 300, y: 150 }, data: { label: 'Planner', category: 'llm' } },
          { id: '3', type: 'logic', position: { x: 550, y: 150 }, data: { label: 'Need Tool?', type: 'if' } },
          { id: '4', type: 'tool', position: { x: 550, y: 300 }, data: { label: 'Web Search', tool: 'search_web' } },
          { id: '5', type: 'output', position: { x: 800, y: 150 }, data: { label: 'Result' } },
        ],
        edges: [
          { id: 'e1-2', source: '1', target: '2' },
          { id: 'e2-3', source: '2', target: '3' },
          { id: 'e3-4', source: '3', target: '4', sourceHandle: 'true' },
          { id: 'e3-5', source: '3', target: '5', sourceHandle: 'false' },
          { id: 'e4-2', source: '4', target: '2', type: 'smoothstep' },
        ]
      },
    };

    const template = templates[templateName];
    if (template) {
      onLoadTemplate(template, name);
    }
  };

  return (
    <NavigationPanel id="library" title={uiText("场景库")} icon={Layers} onClose={onClose}>
      <div className="navigation-panel-scroll">
        <div className="navigation-card-grid navigation-scene-grid">

          <Card role="button" tabIndex={0} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); event.currentTarget.click(); } }} className="cursor-pointer bg-background border-border hover:border-blue-500 transition-all group" onClick={() => loadTemplate('parking-agent', '智能泊车助手')}>
            <CardHeader className="p-3">
              <CardTitle className="type-item-title flex items-center gap-2 text-foreground group-hover:text-blue-400 transition-colors">
                <Car className="w-4 h-4 text-blue-500" /> {uiText("智能泊车助手")}</CardTitle>
              <CardDescription className="type-body text-foreground">{uiText("停车场环境感知 + 闸机/楼层识别 + 自动泊车")}</CardDescription>
            </CardHeader>
          </Card>

          <Card role="button" tabIndex={0} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); event.currentTarget.click(); } }} className="cursor-pointer bg-background border-border hover:border-blue-500 transition-all group" onClick={() => loadTemplate('child-nanny', '智能带娃')}>
            <CardHeader className="p-3">
              <CardTitle className="type-item-title flex items-center gap-2 text-foreground group-hover:text-blue-400 transition-colors">
                <Accessibility className="w-4 h-4 text-green-500" /> {uiText("智能带娃")}</CardTitle>
              <CardDescription className="type-body text-foreground">{uiText("后排危险动作识别 + 实时影像 + 一次性安全提醒")}</CardDescription>
            </CardHeader>
          </Card>

          <Card role="button" tabIndex={0} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); event.currentTarget.click(); } }} className="cursor-pointer bg-background border-border hover:border-blue-500 transition-all group" onClick={() => loadTemplate('elderly-care', '老人健康监护')}>
            <CardHeader className="p-3">
              <CardTitle className="type-item-title flex items-center gap-2 text-foreground group-hover:text-blue-400 transition-colors">
                <Activity className="w-4 h-4 text-red-500" /> {uiText("老人健康监护")}</CardTitle>
              <CardDescription className="type-body text-foreground">{uiText("DMS 摄像头 + 面部状态分析 + 紧急联系")}</CardDescription>
            </CardHeader>
          </Card>

          <Card role="button" tabIndex={0} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); event.currentTarget.click(); } }} className="cursor-pointer bg-background border-border hover:border-blue-500 transition-all group" onClick={() => loadTemplate('environment-assistant', '环境感知助手')}>
            <CardHeader className="p-3">
              <CardTitle className="type-item-title flex items-center gap-2 text-foreground group-hover:text-blue-400 transition-colors">
                <Wind className="w-4 h-4 text-cyan-500" /> {uiText("环境感知助手")}</CardTitle>
              <CardDescription className="type-body text-foreground">{uiText("雨量/雾气检测 + 车窗/空调/雨刮自动控制")}</CardDescription>
            </CardHeader>
          </Card>

          <Card role="button" tabIndex={0} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); event.currentTarget.click(); } }} className="cursor-pointer bg-background border-border hover:border-blue-500 transition-all group" onClick={() => loadTemplate('mobile-studio', '移动直播间')}>
            <CardHeader className="p-3">
              <CardTitle className="type-item-title flex items-center gap-2 text-foreground group-hover:text-blue-400 transition-colors">
                <Camera className="w-4 h-4 text-pink-500" /> {uiText("移动直播间")}</CardTitle>
              <CardDescription className="type-body text-foreground">{uiText("自拍/直播手势识别 + 氛围灯/座椅联动")}</CardDescription>
            </CardHeader>
          </Card>


          <Card role="button" tabIndex={0} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); event.currentTarget.click(); } }} className="cursor-pointer bg-background border-border hover:border-blue-500 transition-all group" onClick={() => loadTemplate('smoking-detection', '吸烟行为识别')}>
            <CardHeader className="p-3">
              <CardTitle className="type-item-title flex items-center gap-2 text-foreground group-hover:text-blue-400 transition-colors">
                <Eye className="w-4 h-4 text-red-500" /> {uiText("吸烟行为识别")}</CardTitle>
              <CardDescription className="type-body text-foreground">{uiText("实时摄像头 + VLM 视觉分析 + 自动报警")}</CardDescription>
            </CardHeader>
          </Card>
          <Card role="button" tabIndex={0} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); event.currentTarget.click(); } }} className="cursor-pointer bg-background border-border hover:border-blue-500 transition-all group" onClick={() => loadTemplate('medical-emergency', '医疗急救')}>
            <CardHeader className="p-3">
              <CardTitle className="type-item-title flex items-center gap-2 text-foreground group-hover:text-blue-400 transition-colors">
                <Activity className="w-4 h-4 text-red-600" /> {uiText("医疗急救")}</CardTitle>
              <CardDescription className="type-body text-foreground">{uiText("语音求救识别 + 自动靠边/双闪 + 拨打 120")}</CardDescription>
            </CardHeader>
          </Card>


          <Card role="button" tabIndex={0} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); event.currentTarget.click(); } }} className="cursor-pointer bg-background border-border hover:border-blue-500 transition-all group" onClick={() => loadTemplate('child-safety', '儿童危险预警')}>
            <CardHeader className="p-3">
              <CardTitle className="type-item-title flex items-center gap-2 text-foreground group-hover:text-blue-400 transition-colors">
                <ShieldAlert className="w-4 h-4 text-orange-500" /> {uiText("儿童危险预警")}</CardTitle>
              <CardDescription className="type-body text-foreground">{uiText("视觉姿态分析 + 危险行为识别 + 报警/安抚")}</CardDescription>
            </CardHeader>
          </Card>

          <Card role="button" tabIndex={0} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); event.currentTarget.click(); } }} className="cursor-pointer bg-background border-border hover:border-blue-500 transition-all group" onClick={() => loadTemplate('sentry', '舱外/家庭哨兵')}>
            <CardHeader className="p-3">
              <CardTitle className="type-item-title flex items-center gap-2 text-foreground group-hover:text-blue-400 transition-colors">
                <Eye className="w-4 h-4 text-red-500" /> {uiText("舱外/家庭哨兵")}</CardTitle>
              <CardDescription className="type-body text-foreground">{uiText("实时画面监控 + 人形检测 + 自动报警")}</CardDescription>
            </CardHeader>
          </Card>


          <Card role="button" tabIndex={0} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); event.currentTarget.click(); } }} className="cursor-pointer bg-background border-border hover:border-blue-500 transition-all group" onClick={() => loadTemplate('voice-assistant', '语音交互助手')}>
            <CardHeader className="p-3">
              <CardTitle className="type-item-title flex items-center gap-2 text-foreground group-hover:text-blue-400 transition-colors">
                <Mic className="w-4 h-4 text-blue-500" /> {uiText("语音交互助手")}</CardTitle>
              <CardDescription className="type-body text-foreground">{uiText("语音转文字 + 意图理解 + 智能家居控制")}</CardDescription>
            </CardHeader>
          </Card>


          <Card role="button" tabIndex={0} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); event.currentTarget.click(); } }} className="cursor-pointer bg-background border-border hover:border-blue-500 transition-all group" onClick={() => loadTemplate('rag-qa', '知识库问答 (RAG)')}>
            <CardHeader className="p-3">
              <CardTitle className="type-item-title flex items-center gap-2 text-foreground group-hover:text-blue-400 transition-colors">
                <Database className="w-4 h-4 text-cyan-500" /> {uiText("知识库问答 (RAG)")}</CardTitle>
              <CardDescription className="type-body text-foreground">{uiText("本地文档 + 向量检索 + 智能问答")}</CardDescription>
            </CardHeader>
          </Card>

          <Card role="button" tabIndex={0} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); event.currentTarget.click(); } }} className="cursor-pointer bg-background border-border hover:border-blue-500 transition-all group" onClick={() => loadTemplate('react-agent', '任务规划 Agent')}>
            <CardHeader className="p-3">
              <CardTitle className="type-item-title flex items-center gap-2 text-foreground group-hover:text-blue-400 transition-colors">
                <Brain className="w-4 h-4 text-purple-500" /> {uiText("任务规划 Agent")}</CardTitle>
              <CardDescription className="type-body text-foreground">{uiText("ReAct 推理循环 + 联网搜索工具")}</CardDescription>
            </CardHeader>
          </Card>
        </div>
      </div>
    </NavigationPanel>
  );
}
