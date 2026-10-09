import { HMI_CONTROLS, validateHmiControl, readHmiControl, writeHmiControl, type HmiValue, type HmiControlRequest, type HmiControlResult } from './hmiControls';
export const WINDOW_KEYS = ['fl', 'fr', 'rl', 'rr'] as const;
export type WindowKey = typeof WINDOW_KEYS[number];
export const WINDOW_NAMES: Record<WindowKey, string> = { fl: '左前窗', fr: '右前窗', rl: '左后窗', rr: '右后窗' };
export interface VehicleState {
  hmiSettings?: Record<string,HmiValue>;
  windows: Record<WindowKey, number>;
  ac: { on: boolean; temp: number; mode: 'auto' | 'cool' | 'heat'; fan: number };
  doors: { locked: boolean };
  lights: { ambientColor: string; brightness: number };
  seats: { driverPos: number; passengerPos: number };
}
export interface WindowActionResult {
  id: number;
  success: boolean;
  source: 'manual' | 'workflow';
  requested: Partial<Record<WindowKey, number>>;
  actual: Record<WindowKey, number>;
  failedWindows: WindowKey[];
  reason?: 'blocked' | 'busy' | 'cancelled';
}
export interface AmbientLightRequest { color: string; brightness: number; reason?: string; poseTips?: string }
export interface AmbientLightResult { success: true; source: 'hmi_mock'; actual: VehicleState['lights']; restored: boolean; reason?: string; poseTips?: string }
export function validateAmbientLight(request: AmbientLightRequest) {
  if (!request || typeof request.color !== 'string' || !/^#[0-9a-f]{6}$/i.test(request.color)
    || typeof request.brightness !== 'number' || !Number.isFinite(request.brightness) || request.brightness < 0 || request.brightness > 100)
    throw new Error('氛围灯需要 #RRGGBB 颜色与 0–100 的亮度。');
  for (const value of [request.reason, request.poseTips]) if (value !== undefined && (typeof value !== 'string' || value.length > 600)) throw new Error('氛围灯说明或姿势建议无效。');
}
export interface VehicleWorldSnapshot {
  car: VehicleState;
  ambientFeedback?: AmbientLightResult | null;
  blockedWindow: WindowKey | null;
  moving: boolean;
  lastResult: WindowActionResult | null;
}
export interface VehicleWorldCheckpoint {
  version:1; snapshot:VehicleWorldSnapshot; ambientBefore:VehicleState['lights']|null; commandId:number; revision:number;
}
export const initialVehicle = (): VehicleState => ({
  windows: { fl: 0, fr: 0, rl: 0, rr: 0 },
  ac: { on: true, temp: 22, mode: 'auto', fan: 3 },
  doors: { locked: true }, lights: { ambientColor: '#88ded7', brightness: 50 },
  seats: { driverPos: 10, passengerPos: 10 },
});

/** One vehicle per simulator. Commands resolve only after the actuator finishes. */
export class VehicleWorld {
  private state: VehicleWorldSnapshot = { car: initialVehicle(), blockedWindow: null, moving: false, lastResult: null };
  private listeners = new Set<() => void>();
  private ambientBefore: VehicleState['lights'] | null = null;
  private generation = 0;
  private commandId = 0;
  private revision = 0;
  exportCheckpoint = ():VehicleWorldCheckpoint => {
    if(this.state.moving)throw Error('车窗仍在运动，不能保存稳定执行进度。');
    return structuredClone({version:1,snapshot:this.state,ambientBefore:this.ambientBefore,commandId:this.commandId,revision:this.revision});
  };
  restoreCheckpoint = (value:unknown) => {
    const v=structuredClone(value) as VehicleWorldCheckpoint;
    if(!v||v.version!==1||!v.snapshot||v.snapshot.moving!==false||![null,...WINDOW_KEYS].includes(v.snapshot.blockedWindow)
      ||!Number.isSafeInteger(v.commandId)||v.commandId<0||!Number.isSafeInteger(v.revision)||v.revision<0)throw Error('车辆执行快照无效。');
    const car=v.snapshot.car;
    if(!car||!car.windows||!car.ac||!car.doors||!car.lights||!car.seats)throw Error('车辆状态不完整。');
    for(const [control,spec] of Object.entries(HMI_CONTROLS)){
      if(spec.path&&spec.path.reduce<any>((o,k)=>o?.[k],car)===undefined)throw Error('车辆控制状态缺失。');
      validateHmiControl({control,value:readHmiControl(car,control)});
    }
    for(const [control,value] of Object.entries(car.hmiSettings||{}))validateHmiControl({control,value});
    validateAmbientLight({color:car.lights.ambientColor,brightness:car.lights.brightness});
    if(v.ambientBefore)validateAmbientLight({color:v.ambientBefore.ambientColor,brightness:v.ambientBefore.brightness});
    if(this.state.moving)throw Error('请等待车辆动作完成后恢复进度。');
    this.generation++;this.ambientBefore=v.ambientBefore;this.commandId=v.commandId;this.revision=v.revision;this.publish(v.snapshot);
  };
  executeHmiControl = (request: HmiControlRequest): HmiControlResult => {
    const car = writeHmiControl(this.state.car, request);
    if (request.operation !== 'get') { this.revision++; this.publish({ ...this.state, car }); }
    return {success:true, source:'hmi', control:request.control, operation:request.operation || 'set', requested:request.operation === 'get' ? undefined : request.value as HmiValue, actual:readHmiControl(this.state.car,request.control), revision:this.revision};
  };
  getSnapshot = () => this.state;
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  private publish(next: VehicleWorldSnapshot) { this.state = next; this.listeners.forEach(listener => listener()); }
  setCar = (update: VehicleState | ((previous: VehicleState) => VehicleState)) => {
    const car = typeof update === 'function' ? update(structuredClone(this.state.car)) : structuredClone(update);
    this.publish({ ...this.state, car });
  };
  setFault = (blockedWindow: WindowKey | null) => { if (!this.state.moving) this.publish({ ...this.state, blockedWindow }); };
  setAmbientLight = (request: AmbientLightRequest): AmbientLightResult => {
    validateAmbientLight(request);
    if (!this.ambientBefore) this.ambientBefore = { ...this.state.car.lights };
    const actual = { ambientColor: request.color.toLowerCase(), brightness: request.brightness };
    const feedback: AmbientLightResult = { success: true, source: 'hmi_mock', actual, restored: false, reason: request.reason, poseTips: request.poseTips };
    this.publish({ ...this.state, car: { ...this.state.car, lights: { ...actual } }, ambientFeedback: feedback });
    return feedback;
  };
  restoreAmbientLight = (): AmbientLightResult => {
    const actual = { ...(this.ambientBefore || this.state.car.lights) };
    this.ambientBefore = null;
    const feedback: AmbientLightResult = { success: true, source: 'hmi_mock', actual, restored: true };
    this.publish({ ...this.state, car: { ...this.state.car, lights: { ...actual } }, ambientFeedback: feedback });
    return feedback;
  };
  reset = () => { this.ambientBefore = null; this.generation++; this.publish({ car: initialVehicle(), blockedWindow: null, moving: false, lastResult: null }); };
  cancel = () => { this.generation++; this.publish({ ...this.state, moving: false }); };
  async moveWindows(requested: Partial<Record<WindowKey, number>>, source: WindowActionResult['source'], durationMs = 1400): Promise<WindowActionResult> {
    for (const [key, value] of Object.entries(requested)) {
      if (!WINDOW_KEYS.includes(key as WindowKey) || !Number.isFinite(value) || value < 0 || value > 100) throw new Error('Invalid window target');
    }
    const id = ++this.commandId;
    const result = (reason?: WindowActionResult['reason']): WindowActionResult => ({
      id, source, requested, actual: { ...this.state.car.windows }, reason,
      success: !reason,
      failedWindows: WINDOW_KEYS.filter(key => requested[key] !== undefined && this.state.car.windows[key] !== requested[key]),
    });
    if (this.state.moving) return result('busy');
    const generation = this.generation;
    const start = { ...this.state.car.windows };
    const blocked = this.state.blockedWindow;
    this.publish({ ...this.state, moving: true, lastResult: null });
    const steps = Math.max(1, Math.ceil(durationMs / 40));
    for (let step = 1; step <= steps; step++) {
      await new Promise(resolve => setTimeout(resolve, durationMs / steps));
      if (generation !== this.generation) return result('cancelled');
      const windows = { ...start };
      for (const key of WINDOW_KEYS) {
        if (requested[key] !== undefined && key !== blocked) windows[key] = Math.round(start[key] + (requested[key]! - start[key]) * step / steps);
      }
      this.publish({ ...this.state, car: { ...this.state.car, windows } });
    }
    const failed = WINDOW_KEYS.some(key => requested[key] !== undefined && this.state.car.windows[key] !== requested[key]);
    const final = result(failed ? 'blocked' : undefined);
    this.publish({ ...this.state, moving: false, lastResult: final });
    return final;
  }
}
