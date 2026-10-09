import catalog from '@/data/hmiControls.json';
import type { VehicleState } from './vehicleWorld';

export type HmiValue = boolean | number | string;
export type HmiControlSpec = { label: string; page: string; default: HmiValue; type: string; min?: number; max?: number; step?: number; unit?: string; options?: Record<string,string>; format?: string; path?: string[] };
export const HMI_CONTROLS: Record<string,HmiControlSpec> = catalog;
export interface HmiControlRequest { control: string; operation?: 'set' | 'get'; value?: unknown }
export interface HmiControlResult { success: true; source: 'hmi'; control: string; operation: 'set' | 'get'; requested?: HmiValue; actual: HmiValue; revision: number }
/** A typed reference is resolved by general-flow binding before runtime validation. */
export function isHmiValueBinding(value: unknown): boolean {
  if(!value || typeof value!=='object' || Array.isArray(value) || Object.keys(value).length!==1 || typeof (value as any).$ref!=='string')return false;
  const parts=(value as {$ref:string}).$ref.split('.');
  return ['input','event','state','outputs'].includes(parts[0]) && parts.every(p=>/^[A-Za-z][A-Za-z0-9_]*$/.test(p)&&!['constructor','prototype','__proto__'].includes(p));
}
export function validateHmiControl({ control, operation = 'set', value }: HmiControlRequest) {
  if (typeof control !== 'string') throw new Error('HMI 控制项 ID 必须为字符串。');
  const spec = Object.hasOwn(HMI_CONTROLS, control) ? HMI_CONTROLS[control] : undefined;
  if (!spec) throw new Error(`HMI 未接入控制项：${control}`);
  if (!['set','get'].includes(operation)) throw new Error('HMI 只支持读取和设置。');
  if (operation === 'get') return spec;
  if (typeof value !== spec.type) throw new Error(`${spec.label}需要${spec.type}类型的目标值。`);
  if (typeof value === 'number' && (!Number.isFinite(value) || value < spec.min! || value > spec.max! || (spec.step === 1 && !Number.isInteger(value)))) throw new Error(`${spec.label}必须在 ${spec.min}–${spec.max} 范围内。`);
  if (spec.options && !Object.hasOwn(spec.options, String(value))) throw new Error(`${spec.label}选项无效。`);
  if (spec.format === 'color' && !/^#[0-9a-f]{6}$/i.test(String(value))) throw new Error('颜色必须为 #RRGGBB。');
  return spec;
}
export function readHmiControl(car: VehicleState, control: string): HmiValue {
  const spec = validateHmiControl({control,operation:'get'});
  if (spec.path) return spec.path.reduce<any>((object,key)=>object?.[key],car) ?? spec.default;
  return car.hmiSettings?.[control] ?? spec.default;
}
export function writeHmiControl(car: VehicleState, request: HmiControlRequest): VehicleState {
  const spec = validateHmiControl(request);
  if (request.operation === 'get') return car;
  const next = structuredClone(car);
  if (spec.path) {
    const parent = spec.path.slice(0,-1).reduce<any>((object,key)=>object[key],next);
    parent[spec.path.at(-1)!] = request.value;
  } else next.hmiSettings = {...next.hmiSettings,[request.control]:request.value as HmiValue};
  return next;
}
/** Maps only published legacy seat/sunshade contracts; unknown interfaces remain unavailable. */
export function legacyHmiRequests(data: Record<string,any>): HmiControlRequest[] | null {
  if (!['get','set'].includes(data.function)) return null;
  const seat = /^SEAT_(HEAT|VENTILATION)_STATUS(?:_([0-3]))?$/.exec(data.signalKey || '');
  if (data.module === 'seat' && seat && data.function === 'set' && (typeof data.level === 'boolean' || data.level == null || String(data.level).trim()==='')) throw new Error('座椅档位无效。');
  if (data.module === 'seat' && seat) return (seat[2] === undefined ? [0,1,2,3] : [Number(seat[2])]).map(i=>({control:`seat.${seat[1] === 'HEAT' ? 'heat' : 'vent'}.${i}`,operation:data.function,value:Number(data.level)}));
  if (data.module === 'vehicleControl' && data.signalKey === 'SUNSHADE_SLIDING_OPEN' && [1,2,3,4].includes(Number(data.area))) {
    if (data.function === 'set' && (typeof data.targetStatus === 'boolean' || data.targetStatus == null || String(data.targetStatus).trim()==='' || ![0,1].includes(Number(data.targetStatus)))) throw new Error('遮阳帘目标值必须为 0 或 1。');
    return [{control:`sunshade.${Number(data.area)}`,operation:data.function,value:Number(data.targetStatus) === 1}];
  }
  return null;
}
export function hmiNodeRequests(data: Record<string,any>, input?: any): HmiControlRequest[] | null {
  if (data.executionMode !== 'hmi') return legacyHmiRequests(data);
  if (data.module || data.signalKey || data.function) throw new Error('HMI 控制项不能同时配置其他车辆接口。');
  const value = data.valueField ? input?.data?.[data.valueField] : data.controlValue;
  return [{control:data.controlId,operation:data.controlOperation || 'set',value}];
}
