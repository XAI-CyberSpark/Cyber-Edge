import { useUiLanguage, setUiLanguage, uiText } from '@/i18n';
import React, { createContext, useContext, useState, useEffect } from 'react';
import { defaultTargetDevice, deviceApiBaseUrl } from '@/lib/api';

type Language = 'en' | 'zh';
type Theme = 'light' | 'dark';

type Translations = {
  [key: string]: {
    en: string;
    zh: string;
  };
};

const translations: Translations = {
  // General
  'app.title': { en: 'OAKEgde Studio', zh: 'OAKEgde Studio' },
  'app.subtitle': { en: 'Agent Orchestrator', zh: '编排系统' },
  'settings': { en: 'Settings', zh: '设置' },
  'run': { en: 'Run Pipeline', zh: '运行流程' },
  'running': { en: 'Running...', zh: '运行中...' },
  'component.library': { en: 'Component Library', zh: '组件库' },
  'nodes': { en: 'Nodes', zh: '节点' },
  'templates': { en: 'Templates', zh: '模板' },
  
  // Categories
  'cat.io': { en: 'I/O', zh: '输入/输出' },
  'cat.models': { en: 'Models', zh: '模型' },
  'cat.memory': { en: 'Memory & Data', zh: '记忆与数据' },
  'cat.tools': { en: 'Tools', zh: '工具' },
  'cat.logic': { en: 'Logic', zh: '逻辑' },
  'cat.perception': { en: 'Perception', zh: '感知' },

  // Nodes
  'node.user_input': { en: 'User Input', zh: '用户输入' },
  'node.final_response': { en: 'Final Response', zh: '最终回复' },
  'node.llm_text': { en: 'LLM (Text)', zh: '大语言模型' },
  'node.vlm_vision': { en: 'VLM (Vision)', zh: '视觉模型' },
  'node.audio_model': { en: 'Audio Model', zh: '语音模型' },
  'node.omni_model': { en: 'Omni Model', zh: '全模态模型' },
  'node.vector_db': { en: 'Vector DB', zh: '向量数据库' },
  'node.short_term_mem': { en: 'Short-term Mem', zh: '短期记忆' },
  'node.file_source': { en: 'File Source', zh: '文件源' },
  'node.web_search': { en: 'Web Search', zh: '网页搜索' },
  'node.python_exec': { en: 'Python Exec', zh: 'Python 执行' },
  'node.api_call': { en: 'API Call', zh: 'API 调用' },
  'node.condition': { en: 'Condition (If)', zh: '条件判断' },
  'node.object_det': { en: 'Object Detection', zh: '目标检测' },
  'node.pose_est': { en: 'Pose Estimation', zh: '姿态估计' },
  'node.audio_event': { en: 'Audio Event', zh: '音频事件' },

  // Property Panel
  'prop.config': { en: 'Configuration', zh: '配置' },
  'prop.label': { en: 'Node Label', zh: '节点标签' },
  'prop.model': { en: 'Model', zh: '模型' },
  'prop.params': { en: 'Parameters', zh: '参数' },
  'prop.source': { en: 'Model Source', zh: '模型来源' },
  'prop.quant': { en: 'Quantization', zh: '量化等级' },
  'prop.sys_prompt': { en: 'System Prompt', zh: '系统提示词' },
  'prop.temp': { en: 'Temperature', zh: '温度' },
  'prop.max_tokens': { en: 'Max Tokens', zh: '最大Token数' },
  'prop.stream': { en: 'Stream Response', zh: '流式响应' },
  'prop.json_mode': { en: 'JSON Mode', zh: 'JSON 模式' },

  // Versions
  'ver.save': { en: 'Save Version', zh: '保存版本' },
  'ver.history': { en: 'History', zh: '历史记录' },
  'ver.restore': { en: 'Restore', zh: '恢复' },
  'ver.current': { en: 'Current', zh: '当前' },
  // Settings
  'settings.general': { en: 'General', zh: '通用' },
  'settings.models': { en: 'Model Manager', zh: '模型管理' },
  'settings.system': { en: 'System Status', zh: '系统状态' },
  'model.name': { en: 'Model Name', zh: '模型名称' },
  'model.size': { en: 'Size', zh: '大小' },
  'model.status': { en: 'Status', zh: '状态' },
  'model.action': { en: 'Action', zh: '操作' },
  'model.download': { en: 'Download', zh: '下载' },
  'model.delete': { en: 'Delete', zh: '删除' },
  'model.downloading': { en: 'Downloading...', zh: '下载中...' },
  'model.ready': { en: 'Ready', zh: '就绪' },
  'sys.cpu': { en: 'CPU Usage', zh: 'CPU 使用率' },
  'sys.mem': { en: 'Memory Usage', zh: '内存使用率' },
  'sys.backend': { en: 'Backend Status', zh: '后端状态' },
  'sys.connected': { en: 'Connected', zh: '已连接' },
  'sys.disconnected': { en: 'Disconnected', zh: '未连接' },
  // Skills
  'cat.skills': { en: 'Skills', zh: '技能' },
  'skill.add': { en: 'Add Skill', zh: '添加技能' },
  'skill.import': { en: 'Import', zh: '导入' },
  'skill.name': { en: 'Skill Name', zh: '技能名称' },
  'skill.desc': { en: 'Description', zh: '描述' },
  'skill.author': { en: 'Author', zh: '作者' },

  // HAL Monitor
  'hal.layer': { en: 'Sensor Abstraction Layer (HAL)', zh: '传感器抽象层 (HAL)' },
  'hal.camera': { en: 'Camera Front', zh: '前视摄像头' },
  'hal.lidar': { en: 'LiDAR Main', zh: '主激光雷达' },
  'hal.mic': { en: 'Mic Array', zh: '麦克风阵列' },
  'hal.av_services': { en: 'AV Services', zh: '音视频服务' },
  'hal.asr': { en: 'ASR Service', zh: '语音识别服务' },
  'hal.tts': { en: 'TTS Service', zh: '语音合成服务' },
  'hal.can_bus': { en: 'Vehicle Bus (CAN-FD)', zh: '车载总线 (CAN-FD)' },
  'hal.v2x': { en: 'V2X Connectivity', zh: 'V2X 车联网' },
  'hal.peers': { en: 'Connected Peers', zh: '连接节点' },
  'hal.safety': { en: 'Safety Guardrails Active', zh: '安全护栏已激活' },
  'hal.input_filter': { en: 'Input Filter: OK', zh: '输入过滤: 正常' },
  'hal.command_policy': { en: 'Command Policy: Enforced', zh: '指令策略: 强制' },
  'hal.latency_watchdog': { en: 'Latency Watchdog: Armed', zh: '延迟看门狗: 待命' },

  // Safety Monitor
  'safety.status': { en: 'Security Status', zh: '安全状态' },
  'safety.secure': { en: 'SYSTEM SECURE', zh: '系统安全' },
  'safety.threat': { en: 'THREAT DETECTED', zh: '检测到威胁' },
  'safety.blocked': { en: 'Blocked', zh: '拦截' },
  'safety.flagged': { en: 'Flagged', zh: '标记' },
  'safety.rate': { en: 'Rate', zh: '拦截率' },
  'safety.active_policies': { en: 'Active Policies', zh: '激活策略' },
  'safety.log': { en: 'Guardrail Inspection Log', zh: '护栏检查日志' },
  'safety.live': { en: 'Live', zh: '实时' },
  'safety.no_events': { en: 'No security events logged', zh: '无安全事件记录' },
  'safety.privacy': { en: 'Data Privacy (PII)', zh: '数据隐私 (PII)' },
  'safety.masking': { en: 'Automatic masking active for: Phone, Email, Location', zh: '自动脱敏已激活: 电话, 邮箱, 位置' },

  // Kernel Monitor
  'kernel.npu': { en: 'Neural Engine (NPU)', zh: '神经引擎 (NPU)' },
  'kernel.utilization': { en: 'utilization', zh: '利用率' },
  'kernel.vram': { en: 'VRAM (KV Cache)', zh: '显存 (KV Cache)' },
  'kernel.gb_used': { en: 'GB used', zh: 'GB 已用' },
  'kernel.weights': { en: 'Weights', zh: '权重' },
  'kernel.kv_cache': { en: 'KV Cache', zh: 'KV 缓存' },
  'kernel.free': { en: 'Free', zh: '空闲' },
  'kernel.throughput': { en: 'Throughput', zh: '吞吐量' },
  'kernel.tokens_sec': { en: 'tokens/sec', zh: 'Token/秒' },
  'kernel.scheduler': { en: 'Task Scheduler', zh: '任务调度器' },
  'kernel.running': { en: 'Running', zh: '运行中' },
  'kernel.pending': { en: 'Pending', zh: '等待中' },
  'kernel.ready_queue': { en: 'Ready Queue', zh: '就绪队列' },
  'kernel.queue_empty': { en: 'Queue Empty', zh: '队列为空' },
  'kernel.exec_units': { en: 'Execution Units (Running)', zh: '执行单元 (运行中)' },
  'kernel.no_active_tasks': { en: 'No Active Tasks', zh: '无活动任务' },

  // Memory Monitor
  'memory.working': { en: 'Working Memory', zh: '工作记忆' },
  'memory.context_window': { en: 'Context Window', zh: '上下文窗口' },
  'memory.active': { en: 'Active', zh: '活跃' },
  'memory.vector_db': { en: 'Vector DB', zh: '向量数据库' },
  'memory.entries': { en: 'entries', zh: '条目' },
  'memory.rag_stream': { en: 'RAG Retrieval Stream', zh: 'RAG 检索流' },
  'memory.no_retrievals': { en: 'No retrievals yet', zh: '暂无检索' },
  'memory.query': { en: 'Query', zh: '查询' },
  'memory.match': { en: 'match', zh: '匹配度' },
  'memory.graph': { en: 'Active Context Graph', zh: '活跃上下文图谱' },
  'memory.no_context': { en: 'No active context', zh: '无活跃上下文' },

  // Sidebar & Tabs
  'tab.safety': { en: 'Safety', zh: '安全' },
  'tab.hal': { en: 'HAL', zh: '硬件层' },
  'tab.memory': { en: 'Memory', zh: '记忆' },
  'tab.kernel': { en: 'Kernel', zh: '内核' },
  'tab.inspector': { en: 'Inspector', zh: '检查器' },
  'tab.orchestration': { en: 'Orchestration', zh: '编排' },
  'tab.telemetry': { en: 'Telemetry', zh: '遥测' },
  'sidebar.debug': { en: 'Debug Scenarios', zh: '调试场景' },
  'sidebar.medical': { en: 'Trigger Medical Emergency', zh: '触发医疗急救' },
  'sidebar.drowsiness': { en: 'Trigger Drowsiness Alert', zh: '触发疲劳预警' },
  'sidebar.stop': { en: 'Stop Simulation', zh: '停止模拟' },
  'sidebar.library': { en: 'Scenario Library', zh: '场景库' },
  'sidebar.env': { en: 'Environment', zh: '环境' },
  'selector.desc': { en: 'Select a predefined agent scenario to configure the vehicle, environment, and HMI instantly.', zh: '选择预定义的智能体场景，即刻配置车辆、环境和 HMI。' },

  // Deployment Wizard
  'wizard.title': { en: 'Edge Deployment Wizard', zh: '端侧部署向导' },
  'wizard.desc': { en: 'Deploy your agent pipeline to edge hardware.', zh: '将您的智能体流水线部署到端侧硬件。' },
  'wizard.target': { en: 'Target Environment', zh: '目标环境' },
  'wizard.local': { en: 'Local Simulator', zh: '本地模拟器' },
  'wizard.remote': { en: 'NVIDIA Orin NX (Remote)', zh: 'NVIDIA Orin NX (远程)' },
  'wizard.opt': { en: 'Optimization', zh: '优化' },
  'wizard.quant': { en: 'Int8 Quantization', zh: 'Int8 量化' },
  'wizard.runtime': { en: 'Runtime', zh: '运行时' },
  'wizard.latency': { en: 'Est. Latency', zh: '预估延迟' },
  'wizard.size': { en: 'Package Size', zh: '包大小' },
  'wizard.building': { en: 'Building Pipeline...', zh: '正在构建流水线...' },
  'wizard.pushing': { en: 'Pushing to Edge...', zh: '正在推送到端侧...' },
  'wizard.log': { en: 'Build Log', zh: '构建日志' },
  'wizard.success': { en: 'Deployment Successful!', zh: '部署成功！' },
  'wizard.live': { en: 'Your agent is now live on', zh: '您的智能体已上线运行于' },
  'wizard.api_ready': { en: 'API Endpoint Ready', zh: 'API 端点就绪' },
  'wizard.monitoring': { en: 'Monitoring Active', zh: '监控已激活' },
  'wizard.cancel': { en: 'Cancel', zh: '取消' },
  'wizard.start': { en: 'Start Build', zh: '开始构建' },
  'wizard.processing': { en: 'Processing...', zh: '处理中...' },
  'wizard.done': { en: 'Done', zh: '完成' },
};

interface AppContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (key: string) => string;
  theme: Theme;
  toggleTheme: () => void;
  versions: Version[];
  saveVersion: (name: string, data: any) => void;
  restoreVersion: (id: string) => any;
  targetDevice: string;
  isRemote: boolean;
  switchDevice: (ip: string) => void;
}

interface Version {
  id: string;
  name: string;
  timestamp: number;
  data: any;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const language = useUiLanguage();
  const setLanguage = setUiLanguage;
  useEffect(() => { document.documentElement.lang = language === 'en' ? 'en' : 'zh-CN'; }, [language]);
  const [theme, setTheme] = useState<Theme>(() => {
    const saved = localStorage.getItem('cyber-edge-theme');
    return (saved === 'light' || saved === 'dark') ? saved : 'dark';
  });
  const [versions, setVersions] = useState<Version[]>([]);
  const [targetDevice, setTargetDevice] = useState<string>(defaultTargetDevice());
  const [isRemote, setIsRemote] = useState<boolean>(false);

  // Apply theme class to document
  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    localStorage.setItem('cyber-edge-theme', theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme(prev => prev === 'dark' ? 'light' : 'dark');
  };

  useEffect(() => {
    // Load persisted device connection
    const savedDevice = localStorage.getItem('cyber-edge-device');
    if (savedDevice) {
        setTargetDevice(savedDevice);
        setIsRemote(savedDevice !== defaultTargetDevice());
    }

    // Load from backend if available, fallback to local
    fetch(`${deviceApiBaseUrl(targetDevice)}/v1/pipelines`)
        .then(res => res.json())
        .then(data => {
            if (Array.isArray(data) && data.length > 0) {
                // Map backend format to frontend format
                const mapped = data.map((p: any) => ({
                    id: p.id,
                    name: p.name,
                    timestamp: new Date(p.created_at).getTime(),
                    data: JSON.parse(p.data)
                }));
                setVersions(mapped);
            } else {
                // Fallback
                const savedVersions = localStorage.getItem('cyber-edge-versions');
                if (savedVersions) setVersions(JSON.parse(savedVersions));
            }
        })
        .catch(() => {
            const savedVersions = localStorage.getItem('cyber-edge-versions');
            if (savedVersions) setVersions(JSON.parse(savedVersions));
        });
  }, [targetDevice]);

  const switchDevice = (ip: string) => {
      const endpoint = ip.includes(':') ? ip : `${ip}:8000`;
      setTargetDevice(endpoint);
      setIsRemote(endpoint !== defaultTargetDevice());
      localStorage.setItem('cyber-edge-device', endpoint);
  };

  const t = (key: string) => {
    return translations[key]?.[language] || uiText(key);
  };

  const saveVersion = (name: string, data: any) => {
    const id = Date.now().toString();
    const newVersion: Version = {
      id,
      name,
      timestamp: Date.now(),
      data
    };
    
    // Save to Backend
    fetch(`${deviceApiBaseUrl(targetDevice)}/v1/pipelines/save`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            id: id,
            name: name,
            data: JSON.stringify(data)
        })
    }).then(res => {
        if (res.ok) {
            console.log("Saved to backend");
        } else {
            console.error("Backend save failed with status", res.status);
        }
    }).catch(e => console.error("Backend save failed", e));

    const newVersions = [newVersion, ...versions];
    setVersions(newVersions);
    localStorage.setItem('cyber-edge-versions', JSON.stringify(newVersions));
  };

  const restoreVersion = (id: string) => {
    const version = versions.find(v => v.id === id);
    return version ? version.data : null;
  };

  return (
    <AppContext.Provider value={{ language, setLanguage, t, theme, toggleTheme, versions, saveVersion, restoreVersion, targetDevice, isRemote, switchDevice }}>
      {children}
    </AppContext.Provider>
  );
};

export const useApp = () => {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
};
