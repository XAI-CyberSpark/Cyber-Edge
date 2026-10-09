import { uiText, useUiLanguage } from '@/i18n';
import { HmiControlEditor } from './HmiControlEditor';
import { memo, useState, useEffect } from 'react';
import { Handle, Position } from '@xyflow/react';
import { Car, Plane, Bot } from 'lucide-react';
import { NodeActivityOverlay, NodeStatusBadge } from './NodeStatusDecorators';
import { getNodeFrameClass } from './nodeStatus';
import carControlCatalog from '@/data/carControlCatalog.json';

export default memo(({ data, selected }: any) => {
  useUiLanguage();
  const catalog = carControlCatalog as any;
  const modules = catalog.modules as any[];
  const signalsEndpoint = catalog.endpoints.find((item: any) => item.id === 'signals');
  const [deviceType, setDeviceType] = useState(data.device_type || 'car');
  const inferCarConfig = (source: any) => {
    if (source.module && source.function) {
      return {
        endpoint: source.endpoint || 'control',
        module: source.module || 'seat',
        function: source.function || 'get',
        signalKey: source.signalKey || 'SEAT_HEAT_STATUS_0',
        level: String(source.level ?? '1'),
        area: String(source.area ?? '0'),
        status: String(source.targetStatus ?? (Number.isFinite(Number(source.status)) ? source.status : '0')),
        baseUrlTemplate: source.baseUrlTemplate || catalog.baseUrlTemplate,
      };
    }

    switch (source.action) {
      case 'windows':
        return {
          endpoint: 'control',
          module: 'vehicleControl',
          function: 'set',
          signalKey: 'WINDOW_POSITION',
          level: '1',
          area: '0',
          status: source.parameter === 'open_all' ? '100' : '0',
          baseUrlTemplate: catalog.baseUrlTemplate,
        };
      case 'ambient_light':
        return {
          endpoint: 'control',
          module: 'light',
          function: 'set',
          signalKey: 'AMBIENCE_LIGHT_SINGLE_COLOR',
          level: String(source.parameter || '32'),
          area: '0',
          status: '0',
          baseUrlTemplate: catalog.baseUrlTemplate,
        };
      case 'seat_heat':
        return {
          endpoint: 'control',
          module: 'seat',
          function: 'set',
          signalKey: 'SEAT_HEAT_STATUS_0',
          level: String(source.parameter || '1'),
          area: '0',
          status: '0',
          baseUrlTemplate: catalog.baseUrlTemplate,
        };
      case 'sunshade':
        return {
          endpoint: 'control',
          module: 'vehicleControl',
          function: 'set',
          signalKey: 'SUNSHADE_SLIDING_OPEN',
          level: '1',
          area: '1',
          status: source.parameter === 'open' ? '1' : '0',
          baseUrlTemplate: catalog.baseUrlTemplate,
        };
      default:
        return {
          endpoint: 'control',
          module: 'seat',
          function: 'get',
          signalKey: 'SEAT_HEAT_STATUS_0',
          level: '1',
          area: '0',
          status: '0',
          baseUrlTemplate: catalog.baseUrlTemplate,
        };
    }
  };
  const [carConfig, setCarConfig] = useState(inferCarConfig(data));
  const [action, setAction] = useState(data.action || 'move_base');
  const [parameter, setParameter] = useState(data.parameter || 'start');
  const lastActions = Array.isArray(data.output?.actions)
    ? data.output.actions.map((item: any) => item?.name).filter(Boolean)
    : (data.output?.action && data.output.action !== 'none' ? [data.output.action] : []);
  const lastReply = typeof data.output === 'string'
    ? data.output
    : data.output?.adapter_output || data.output?.text || data.output?.reply || data.output?.llm_output;

  useEffect(() => {
    setDeviceType(data.device_type || 'car');
    setCarConfig(inferCarConfig(data));
    setAction(data.action || 'move_base');
    setParameter(data.parameter || 'start');
  }, [data]);

  const getLegacyActions = () => {
    switch(deviceType) {
      case 'drone': return ['takeoff', 'land', 'fly_to', 'hover', 'return_home'];
      case 'robot': return ['move_base', 'gripper', 'say', 'dance', 'patrol'];
      default: return ['windows', 'ambient_light', 'seat_heat', 'sunshade'];
    }
  };

  const updateLegacyData = (key: string, value: string) => {
    if (key === 'device_type') setDeviceType(value);
    if (key === 'action') setAction(value);
    if (key === 'parameter') setParameter(value);

    if (data.onUpdate) {
       data.onUpdate({ ...data, [key]: value });
    } else {
        data[key] = value;
    }
  };

  const getModuleConfig = (moduleId: string) => modules.find((item: any) => item.id === moduleId) || modules[0];
  const getSignalConfig = (moduleId: string, signalId: string) => {
    const moduleConfig = getModuleConfig(moduleId);
    return moduleConfig.signals.find((item: any) => item.id === signalId) || moduleConfig.signals[0];
  };

  const updateCarData = (changes: Record<string, string>) => {
    const next = { ...carConfig, ...changes };
    const moduleConfig = getModuleConfig(next.module);
    const signalConfig = getSignalConfig(next.module, next.signalKey);
    const availableFunctions = signalConfig.functions || moduleConfig.functions || ['get'];
    const resolvedFunction = availableFunctions.includes(next.function) ? next.function : availableFunctions[0];
    const resolvedSignal = signalConfig.id;
    const resolved = {
      ...next,
      module: moduleConfig.id,
      function: resolvedFunction,
      signalKey: resolvedSignal,
      baseUrlTemplate: next.baseUrlTemplate || catalog.baseUrlTemplate,
    };

    setCarConfig(resolved);

    const summaryParts = [
      `endpoint=${resolved.endpoint}`,
      `module=${resolved.module}`,
      `function=${resolved.function}`,
      resolved.endpoint === 'control' ? `signal=${resolved.signalKey}` : '',
      resolved.function === 'set' && resolved.module !== 'vehicleControl' ? `level=${resolved.level}` : '',
      resolved.function === 'set' && resolved.module === 'vehicleControl' ? `area=${resolved.area}` : '',
      resolved.function === 'set' && resolved.module === 'vehicleControl' ? `status=${resolved.status}` : '',
    ].filter(Boolean);

    const payload = {
      ...data,
      device_type: 'car',
      action: `${resolved.module}.${resolved.function}.${resolved.signalKey}`,
      parameter: summaryParts.join(','),
      endpoint: resolved.endpoint,
      module: resolved.module,
      function: resolved.function,
      signalKey: resolved.signalKey,
      level: Number(resolved.level),
      area: Number(resolved.area),
      status: Number(resolved.status),
      targetStatus: Number(resolved.status),
      baseUrlTemplate: resolved.baseUrlTemplate,
    };

    if (data.onUpdate) {
      data.onUpdate(payload);
    } else {
      Object.assign(data, payload);
    }
  };

  const moduleConfig = getModuleConfig(carConfig.module);
  const signalConfig = getSignalConfig(carConfig.module, carConfig.signalKey);
  const functionOptions = carConfig.endpoint === 'signals'
    ? ['signals']
    : (signalConfig.functions || moduleConfig.functions || ['get']);
  const levelConfig = signalConfig.setParams?.level;
  const areaConfig = signalConfig.setParams?.area;
  const statusConfig = signalConfig.setParams?.status;

  return (
    <div className={`px-4 py-2 shadow-md rounded-md bg-background border min-w-[150px] relative ${getNodeFrameClass(data.status, selected ? 'border-blue-500 ring-1 ring-blue-500/50' : 'border-border')}`}>
      <NodeActivityOverlay status={data.status} />
      <NodeStatusBadge status={data.status} activationIndex={data.activationIndex} />
      <Handle type="target" position={Position.Top} className="w-3 h-3 !bg-foreground" />
      
      <div className="ce-node-header flex items-center gap-2 mb-2">
        <span className="ce-node-icon">{deviceType === 'drone' ? <Plane className="w-4 h-4 text-sky-400" /> : 
         deviceType === 'robot' ? <Bot className="w-4 h-4 text-orange-400" /> : 
         <Car className="w-4 h-4 text-blue-400" />}</span>
        <div className="type-item-title  uppercase text-foreground">{uiText(data.label || 'Device Control')}</div>
      </div>

      {!data.designOnly && data.executionMode!=='hmi_mock' && <div className="nodrag mb-2"><label className="type-caption">{uiText("执行接口")}<select className="w-full type-label rounded border border-border bg-background p-2" aria-label={uiText("执行接口")} value={data.executionMode==='hmi'?'hmi':'legacy'} onChange={e=>{
        const patch=e.target.value==='hmi' ? {executionMode:'hmi',controlId:'ac.temp',controlValue:22,controlOperation:'set',valueField:'',module:undefined,signalKey:undefined,function:undefined,action:undefined,device_type:'car'} : {executionMode:undefined,controlId:undefined,valueField:undefined,module:'vehicleControl',signalKey:'WINDOW_POSITION',function:'set',area:0,targetStatus:0};
        const next={...data,...patch};if(data.onUpdate)data.onUpdate(next);else Object.assign(data,next);
      }}><option value="legacy">{uiText("车辆信号接口")}</option><option value="hmi">{uiText("HMI 共享控制")}</option></select></label></div>}
      {data.executionMode==='hmi' && !data.designOnly ? <HmiControlEditor data={data}/> : data.designOnly ? (
        <div className="space-y-2 nodrag type-body text-muted-foreground">
          <p>{uiText("设计草稿 · 尚不能运行")}</p>
          <p>{data.description || data.designIssue || uiText("执行能力尚未通过验证。")}</p>
        </div>
      ) : data.executionMode === 'hmi_mock' && String(data.action).startsWith('ambient_light.') ? <div className="space-y-2 nodrag type-body text-muted-foreground">
        <p>{uiText(data.action === 'ambient_light.restore' ? uiText("恢复进入体验前的灯光") : uiText("从上游读取配色与亮度，更新 HMI 氛围灯"))}</p>
        <p className="type-caption">{uiText("HMI 仿真 · 无需连接车机")}</p>
      </div> : <div className="space-y-2 nodrag">
        <select
          className="w-full type-label p-1 border rounded bg-background border-border text-foreground focus:outline-none focus:ring-1 focus:ring-blue-500"
          value={deviceType}
          onChange={(e) => {
            setDeviceType(e.target.value);
            if (e.target.value === 'car') {
              updateCarData({ endpoint: carConfig.endpoint });
            } else {
              updateLegacyData('device_type', e.target.value);
            }
          }}
        >
          <option value="car">Car (Cockpit)</option>
          <option value="drone">Drone (UAV)</option>
          <option value="robot">Robot (UGV)</option>
        </select>

        {deviceType === 'car' ? (
          <>
            <div className="rounded border border-border bg-background px-2 py-1 type-body text-foreground">
              Base URL: {carConfig.baseUrlTemplate || catalog.baseUrlTemplate}
            </div>

            <select
              className="w-full type-label p-1 border rounded bg-background border-border text-foreground focus:outline-none focus:ring-1 focus:ring-blue-500"
              value={carConfig.endpoint}
              onChange={(e) => updateCarData({ endpoint: e.target.value })}
            >
              {catalog.endpoints.map((endpoint: any) => (
                <option key={endpoint.id} value={endpoint.id}>
                  {endpoint.method} {endpoint.path}
                </option>
              ))}
            </select>

            {carConfig.endpoint === 'signals' ? (
              <div className="rounded border border-border bg-background px-2 py-1 type-body text-foreground">
                GET {signalsEndpoint?.path}
              </div>
            ) : (
              <>
                <select
                  className="w-full type-label p-1 border rounded bg-background border-border text-foreground focus:outline-none focus:ring-1 focus:ring-blue-500"
                  value={carConfig.module}
                  onChange={(e) => {
                    const nextModule = e.target.value;
                    const nextModuleConfig = getModuleConfig(nextModule);
                    const nextSignal = nextModuleConfig.signals[0];
                    updateCarData({
                      module: nextModule,
                      function: nextSignal.functions[0],
                      signalKey: nextSignal.id,
                    });
                  }}
                >
                  {modules.map((moduleItem: any) => (
                    <option key={moduleItem.id} value={moduleItem.id}>
                      {uiText(moduleItem.label)}
                    </option>
                  ))}
                </select>

                <select
                  className="w-full type-label p-1 border rounded bg-background border-border text-foreground focus:outline-none focus:ring-1 focus:ring-blue-500"
                  value={carConfig.function}
                  onChange={(e) => updateCarData({ function: e.target.value })}
                >
                  {functionOptions.map((func: string) => (
                    <option key={func} value={func}>
                      {uiText(func)}
                    </option>
                  ))}
                </select>

                <select
                  className="w-full type-label p-1 border rounded bg-background border-border text-foreground focus:outline-none focus:ring-1 focus:ring-blue-500"
                  value={carConfig.signalKey}
                  onChange={(e) => updateCarData({ signalKey: e.target.value })}
                >
                  {moduleConfig.signals
                    .filter((signal: any) => signal.functions.includes(carConfig.function))
                    .map((signal: any) => (
                      <option key={signal.id} value={signal.id}>
                        {signal.id}
                      </option>
                    ))}
                </select>

                {carConfig.function === 'set' && levelConfig && (
                  <input
                    className="w-full type-label p-1 border rounded bg-background border-border text-foreground focus:outline-none focus:ring-1 focus:ring-blue-500"
                    type="number"
                    min={levelConfig.min}
                    max={levelConfig.max}
                    step={levelConfig.step || 1}
                    value={carConfig.level}
                    onChange={(e) => updateCarData({ level: e.target.value })}
                    placeholder="level"
                  />
                )}

                {carConfig.function === 'set' && areaConfig && (
                  areaConfig.options ? (
                    <select
                      className="w-full type-label p-1 border rounded bg-background border-border text-foreground focus:outline-none focus:ring-1 focus:ring-blue-500"
                      value={carConfig.area}
                      onChange={(e) => updateCarData({ area: e.target.value })}
                    >
                      {areaConfig.options.map((option: any) => (
                        <option key={option.value} value={String(option.value)}>
                          {uiText(option.value)} - {uiText(option.label)}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      className="w-full type-label p-1 border rounded bg-background border-border text-foreground focus:outline-none focus:ring-1 focus:ring-blue-500"
                      type="number"
                      min={areaConfig.min}
                      max={areaConfig.max}
                      step={areaConfig.step || 1}
                      value={carConfig.area}
                      onChange={(e) => updateCarData({ area: e.target.value })}
                      placeholder="area"
                    />
                  )
                )}

                {carConfig.function === 'set' && statusConfig && (
                  <input
                    className="w-full type-label p-1 border rounded bg-background border-border text-foreground focus:outline-none focus:ring-1 focus:ring-blue-500"
                    type="number"
                    min={statusConfig.min}
                    max={statusConfig.max}
                    step={statusConfig.step || 1}
                    value={carConfig.status}
                    onChange={(e) => updateCarData({ status: e.target.value })}
                    placeholder="status"
                  />
                )}
              </>
            )}
          </>
        ) : (
          <>
            <select
              className="w-full type-label p-1 border rounded bg-background border-border text-foreground focus:outline-none focus:ring-1 focus:ring-blue-500"
              value={action}
              onChange={(e) => updateLegacyData('action', e.target.value)}
            >
              {getLegacyActions().map(act => (
                <option key={act} value={act}>{uiText(act)}</option>
              ))}
            </select>

            <input
              className="w-full type-label p-1 border rounded bg-background border-border text-foreground focus:outline-none focus:ring-1 focus:ring-blue-500"
              placeholder="Parameter"
              value={parameter}
              onChange={(e) => updateLegacyData('parameter', e.target.value)}
            />
          </>
        )}
      </div>}
      {lastActions.length > 0 && (
        <div className="mt-2 rounded border border-cyan-400/20 bg-cyan-500/10 px-2 py-1 type-body font-semibold tracking-wide text-cyan-200">
          Action: {lastActions.join(' + ')}
        </div>
      )}
      {lastReply && (
        <div className="mt-2 rounded border border-border bg-background px-2 py-1 type-body text-foreground">
          {lastReply}
        </div>
      )}
      
      {data.status && (
          <div className={`mt-2 type-body px-1 py-0.5 rounded text-center ${
              data.status === 'running' ? 'bg-yellow-900/30 text-yellow-400 border border-yellow-500/30 animate-pulse' :
              data.status === 'success' ? 'bg-green-900/30 text-green-400 border border-green-500/30' :
              data.status === 'error' ? 'bg-red-900/30 text-red-400 border border-red-500/30' : 'bg-background text-foreground'
          }`}>
              {uiText(data.status)}
          </div>
      )}
      
      {data.output && typeof data.output === 'string' && data.output.includes("SHADOW_LOG") && (
          <div className="mt-1 type-body bg-purple-900/30 text-purple-400 p-1 rounded border border-purple-500/30">
              👻 Shadow Run
          </div>
      )}

      <Handle type="source" position={Position.Bottom} className="w-3 h-3 !bg-foreground" />
    </div>
  );
});
