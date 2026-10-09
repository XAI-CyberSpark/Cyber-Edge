import { memo, useState } from 'react';
import { Handle, Position } from '@xyflow/react';
import { Cpu, TerminalSquare } from 'lucide-react';
import { NodeActivityOverlay, NodeStatusBadge } from './NodeStatusDecorators';
import { getNodeFrameClass } from './nodeStatus';

export default memo(({ data, selected }: any) => {
  const [task, setTask] = useState(data.taskPrompt || 'Auto-generate and fix logic');
  const [mode, setMode] = useState(data.mode || 'orchestrator');

  const updateData = (key: string, val: string) => {
    if (key === 'taskPrompt') setTask(val);
    if (key === 'mode') setMode(val);
    
    if (data.onUpdate) {
        data.onUpdate({ ...data, [key]: val });
    } else {
        data[key] = val;
    }
  };

  return (
    <div className={`px-4 py-2 shadow-md rounded-md bg-background border min-w-[220px] relative ${getNodeFrameClass(data.status, selected ? 'border-red-500 ring-1 ring-red-500/50' : 'border-border')}`}>
      <NodeActivityOverlay status={data.status} />
      <NodeStatusBadge status={data.status} activationIndex={data.activationIndex} />
      <Handle type="target" position={Position.Top} className="w-3 h-3 !bg-foreground" />
      
      <div className="ce-node-header flex items-center gap-2 mb-2 border-b border-border pb-2">
        <div className="bg-red-900/30 p-1.5 rounded-md">
            <Cpu className="w-4 h-4 text-red-400" />
        </div>
        <div className="type-item-title  uppercase text-red-300">OpenClaw Agent</div>
      </div>

      <div className="space-y-3 nodrag mt-2">
        <div>
          <label className="type-label  text-foreground block mb-1">Execution Mode</label>
          <select 
              className="w-full type-label p-1.5 border border-border rounded bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-red-500"
              value={mode}
              onChange={(e) => updateData('mode', e.target.value)}
          >
              <option value="orchestrator">Control Plane Orchestrator</option>
              <option value="healing">Self-Healing Loop</option>
              <option value="code_gen">Provider Code Gen</option>
          </select>
        </div>

        <div>
          <label className="type-label  text-foreground block mb-1">Intent / Prompt</label>
          <textarea 
              className="w-full type-code p-2 border border-border rounded bg-background text-foreground min-h-[60px] resize-none focus:outline-none focus:ring-1 focus:ring-red-500 font-mono"
              placeholder="e.g. Generate a new HAL driver for Lidar..."
              value={task}
              onChange={(e) => updateData('taskPrompt', e.target.value)}
          />
        </div>
        
        <div className="flex items-center gap-1.5 type-body text-red-400 bg-red-950/40 p-1.5 rounded border border-red-900/50 mt-2">
            <TerminalSquare className="w-3 h-3" />
            <span>Connects to GitOps & Core API</span>
        </div>
      </div>

      <Handle type="source" position={Position.Bottom} className="w-3 h-3 !bg-foreground" />
    </div>
  );
});
