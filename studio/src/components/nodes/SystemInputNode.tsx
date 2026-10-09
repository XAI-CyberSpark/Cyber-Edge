import { uiText, useUiLanguage  } from '@/i18n';
import { memo, useEffect, useRef, useState } from 'react';
import { Handle, Position } from '@xyflow/react';
import { Camera, Mic, Radio, Activity, Video } from 'lucide-react';
import { NodeActivityOverlay, NodeStatusBadge } from './NodeStatusDecorators';
import { getNodeFrameClass } from './nodeStatus';

export const SystemInputNode = memo(({ data }: { data: any }) => {
  useUiLanguage();
  const videoRef = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [isActive, setIsActive] = useState(false);

  // Icon mapping based on input type
  const getIcon = () => {
    switch (data.inputType) {
      case 'camera': return <Camera className={`w-5 h-5 ${error ? 'text-red-500' : 'text-pink-500'}`} />;
      case 'image':
      case 'rear_camera': return <Camera className="w-5 h-5 text-sky-400" />;
      case 'microphone': return <Mic className={`w-5 h-5 ${error ? 'text-red-500' : 'text-purple-500'}`} />;
      case 'can': return <Activity className="w-5 h-5 text-orange-500" />;
      case 'sensor': return <Radio className="w-5 h-5 text-blue-500" />;
      default: return <Video className="w-5 h-5 text-gray-500" />;
    }
  };

  // Label mapping
  const getLabel = () => {
    switch (data.inputType) {
      case 'camera': return 'Camera Input';
      case 'image': return '座舱图片输入';
      case 'rear_camera': return '后排单帧图片';
      case 'microphone': return 'Microphone';
      case 'can': return 'CAN Bus';
      case 'sensor': return 'Sensor Data';
      default: return 'System Input';
    }
  };

  // Preview logic (only active when running or configured to preview)
  useEffect(() => {
    let stream: MediaStream | null = null;
    setError(null);

    if (data.inputType === 'camera' && !data.simulated) {
        const timer = setTimeout(() => {
            navigator.mediaDevices.getUserMedia({ video: true })
            .then(s => {
                stream = s;
                if (videoRef.current) {
                    videoRef.current.srcObject = s;
                    videoRef.current.play().catch(e => {
                        if (e.name !== 'AbortError') console.error("Play failed", e);
                    });
                    setIsActive(true);
                }
            })
            .catch(err => {
                console.error("Camera access denied:", err);
                setIsActive(false);
                setError("Access Denied");
            });
        }, 100);
        return () => {
            clearTimeout(timer);
            if (stream) stream.getTracks().forEach(track => track.stop());
        };
    }
    
    return () => {
        if (stream) {
            (stream as MediaStream).getTracks().forEach(track => track.stop());
        }
    };
  }, [data.status, data.inputType]);

  // Auto-capture frame to data.lastImage every 1s if active
  useEffect(() => {
      if (!isActive || data.inputType !== 'camera' || !videoRef.current) return;

      const interval = setInterval(() => {
          if (videoRef.current) {
              const canvas = document.createElement('canvas');
              canvas.width = videoRef.current.videoWidth || 640;
              canvas.height = videoRef.current.videoHeight || 480;
              const ctx = canvas.getContext('2d');
              if (ctx) {
                  ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
                  // Update the node data in a way that doesn't cause re-renders of the whole graph constantly?
                  // We can't easily update 'data' without triggering ReactFlow changes.
                  // HACK: Mutate the data object directly for the engine to pick up, 
                  // avoiding setNodes() which re-renders.
                  data.lastImage = canvas.toDataURL('image/jpeg', 0.8);
              }
          }
      }, 1000);

      return () => clearInterval(interval);
  }, [isActive, data]);

  return (
    <div className={`px-4 py-2 shadow-md rounded-md bg-background border w-64 relative ${error ? 'ce-node-card border-red-500' : getNodeFrameClass(data.status, 'border-border')}`}>
      <NodeActivityOverlay status={data.status} />
      <NodeStatusBadge status={error ? 'error' : data.status} activationIndex={data.activationIndex} />
      <div className="ce-node-header flex items-center mb-2">
        <div className="rounded-full w-8 h-8 flex justify-center items-center bg-background mr-2">
          {getIcon()}
        </div>
        <div>
          <div className="type-item-title  text-foreground">{uiText(data.label || getLabel())}</div>
          <div className="type-caption text-foreground">{data.inputType?.toUpperCase() || 'SYS'}</div>
        </div>
      </div>

      {error && (
          <div className="type-body text-red-500 mb-2 font-semibold">
              Error: {uiText(error)}
          </div>
      )}

      {data.inputType === 'image' && <div className="mb-2 type-body text-muted-foreground">
        {data.status === 'success' && data.output?.type === 'image' && typeof data.output.content === 'string' && data.output.content.startsWith('data:image/')
          ? <img className="w-full h-32 object-contain rounded" src={data.output.content} alt={uiText("本次输入的座舱图片")} />
          : <p>{uiText("在仿真中上传座舱图片或选择本地视频")}</p>}
        <p className="mt-2">{uiText("每次接收一张图片或视频抽帧，非实时摄像头")}</p>
      </div>}
      {/* Live Preview Area */}
      {data.inputType === 'rear_camera' && (
        <div className="relative mb-2 h-32 w-full overflow-hidden rounded border border-sky-400/20 bg-gradient-to-br from-slate-950 via-sky-950/60 to-slate-900">
          <div className="absolute left-2 top-2 inline-flex items-center gap-1 rounded bg-black/45 px-1.5 py-0.5 type-tag  text-sky-100">
            <span className="h-1.5 w-1.5 rounded-full bg-red-400 animate-pulse" /> {uiText("LIVE · 后排")}</div>
          <div className="absolute inset-x-7 bottom-3 top-9 rounded border border-sky-300/40 bg-sky-400/5">
            <div className="absolute bottom-2 left-1/2 h-12 w-9 -translate-x-1/2 rounded-t-[18px] border border-sky-200/35 bg-sky-200/10" />
            <div className="absolute bottom-3 left-1/2 h-6 w-12 -translate-x-1/2 rounded bg-sky-300/10" />
          </div>
          <span className="absolute bottom-2 right-2 type-tag text-sky-200/80">{uiText("仿真画面")}</span>
        </div>
      )}

      {data.inputType === 'camera' && (
        <div className="relative w-full h-32 bg-background rounded overflow-hidden mb-2 flex items-center justify-center">
            {/* Always render video to ensure ref is populated, toggle visibility */}
            <video 
                ref={videoRef} 
                className={`w-full h-full object-cover ${isActive ? 'block' : 'hidden'}`} 
                muted 
                playsInline 
                autoPlay
            />
            
            {!isActive && (
                <div className="absolute inset-0 flex flex-col items-center justify-center type-body text-gray-500">
                    <Camera className="w-8 h-8 mb-1 opacity-20" />
                    <span>{uiText(error ? 'Camera Error' : 'Connecting...')}</span>
                </div>
            )}
            
            {data.status === 'running' && (
                <div className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full animate-pulse" />
            )}
        </div>
      )}

      {data.inputType === 'microphone' && data.status === 'running' && (
        <div className="w-full h-8 bg-background rounded mb-2 flex items-center justify-center overflow-hidden relative">
             <div className="absolute inset-0 flex items-center justify-center gap-1">
                {[1,2,3,4,5].map(i => (
                    <div key={i} className="w-1 bg-purple-500 animate-bounce" style={{ height: `${Math.random() * 20 + 5}px`, animationDelay: `${i * 0.1}s` }} />
                ))}
             </div>
        </div>
      )}

      {data.inputType === 'can' && (
         <div className="type-code font-mono bg-background p-2 rounded mb-2 text-green-400">
            {uiText(data.status === 'running' ? 'ID: 0x123 DATA: [FF 00 ...]' : 'Waiting for signal...')}
         </div>
      )}

      <div className="type-body text-foreground text-right">
        {uiText(['image','rear_camera','camera'].includes(data.inputType) ? uiText("输出：本次单帧图片") : 'Output: Data')}
      </div>

      <Handle type="source" position={Position.Right} className="w-3 h-3 bg-red-500" />
    </div>
  );
});
