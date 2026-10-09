import { uiText } from '@/i18n';
import { AppIcon } from '@/components/ui/AppIcon';
import { CockpitHmi } from './CockpitHmi';
import { VehicleWorld, type WindowActionResult, type WindowKey, type AmbientLightRequest, type AmbientLightResult } from '@/domain/vehicleWorld';
import type { RuntimeRunResult } from '@/domain/runtime';
export type { VehicleState } from '@/domain/vehicleWorld';
import type { HmiControlRequest, HmiControlResult } from '@/domain/hmiControls';
import { useState, useEffect, useRef, useSyncExternalStore, forwardRef, useImperativeHandle } from 'react';
import { Car, Wind, Lock, Plane, Bot, Settings2, User, Activity } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import type { ScenarioItem } from '@/data/scenarios';

export interface DriverState {
    emotion: 'neutral' | 'happy' | 'angry' | 'drowsy' | 'stressed';
    gaze: 'forward' | 'left' | 'right' | 'phone';
    heartRate: number;
}

export interface Passenger {
    id: string;
    seat: 'front_right' | 'rear_left' | 'rear_right';
    profile: {
        age: number;
        gender: 'male' | 'female';
    };
    state: {
        emotion: 'neutral' | 'happy' | 'angry' | 'drowsy';
        action: 'sitting' | 'phone' | 'sleeping';
    };
}

export interface DroneState {
    altitude: number;
    speed: number;
    battery: number;
    status: 'ground' | 'flying' | 'hover';
}

export interface RobotState {
    pose: { x: number, y: number, theta: number };
    gripper: number; // 0-100 open
    status: 'idle' | 'moving' | 'working';
}

export interface HMIState {
    speechRequest?: { id: number; text: string };
    careFrame?: string;
    careSummary?: string;
    message: string;
    navDestination: string;
    musicTrack: string;
    alert: 'none' | 'warning' | 'info' | 'off';
    agentStatus: 'idle' | 'listening' | 'processing' | 'speaking';
    rearCamera: {
        visible: boolean;
        riskAction: string;
        durationSeconds: number;
    };
}

export interface VehicleDynamics {
    speed: number;          // km/h, controls road scroll speed
    targetLane: number;     // -1=left, 0=center, 1=right
    steeringAngle: number;  // -1 to 1, visual body tilt
    turnSignal: 'off' | 'left' | 'right' | 'hazard';
    braking: boolean;
    headlights: boolean;
}

export interface ScenarioState {
    name: 'default' | 'parking' | 'highway' | 'urban' | 'rain' | 'snow' | 'night';
    weather: 'clear' | 'rain' | 'snow';
    time: 'day' | 'night';
    road: 'asphalt' | 'parking' | 'offroad';
}

export interface VehicleSimulatorRef {
    exportExecutionState: () => unknown;
    prepareExecutionState: (value: unknown) => () => void;
    executeAmbientLight: (request: AmbientLightRequest) => AmbientLightResult;
    restoreAmbientLight: () => AmbientLightResult;
    executeHmiControl: (request: HmiControlRequest) => HmiControlResult;
    executeWindowTargets: (targets: Partial<Record<WindowKey, number>>) => Promise<WindowActionResult>;
    executeWindowAction: (action: 'open_all' | 'close_all') => Promise<WindowActionResult>;
    updateState: (deviceType: string, action: string, param: string) => void;
    getState: () => any;
    setState: (state: any) => void; // New method for Time Travel
    loadScenario: (item: any) => void;
}

export interface VehicleSimulatorProps {
    fullScreen?: boolean;
    active?: boolean;
    simConfig?: any;
    onRun?: () => Promise<RuntimeRunResult>;
    onCreateRain?: () => void; onCreateChild?: () => void;
    running?: boolean;
    workflowName?: string;
}

export const VehicleSimulator = forwardRef<VehicleSimulatorRef, VehicleSimulatorProps>(({ fullScreen, active = true, onRun, onCreateRain, onCreateChild, running, workflowName }, ref) => {
    const speechSequence = useRef(0);
    const [activeTab, setActiveTab] = useState("driver");
    
    // HMI State (New)
    const [hmiState, setHmiState] = useState<HMIState>({
        message: "System Ready",
        navDestination: "Home",
        musicTrack: "",
        alert: "none",
        agentStatus: 'idle',
        rearCamera: { visible: false, riskAction: '', durationSeconds: 0 },
    });

    // Vehicle Dynamics State
    const [vehicleDynamics, setVehicleDynamics] = useState<VehicleDynamics>({
        speed: 0,
        targetLane: 0,
        steeringAngle: 0,
        turnSignal: 'off',
        braking: false,
        headlights: false,
    });

    // Scenario State
    const [scenario, setScenario] = useState<ScenarioState>({
        name: 'highway',
        weather: 'clear',
        time: 'day',
        road: 'asphalt'
    });
    
    // Scenario Selection Handler
    const handleScenarioSelect = (item: ScenarioItem) => {
        // Update Scenario Context
        setScenario(prev => ({
            ...prev,
            ...item.config.scenario
        } as any));

        // Update Car Config
        setCarState(prev => {
            const next = { ...prev };
            const c = item.config.car;
            
            // Windows
            if (c.windows === 'close_all') next.windows = { fl: 0, fr: 0, rl: 0, rr: 0 };
            else if (c.windows === 'open') next.windows = { fl: 20, fr: 20, rl: 20, rr: 20 };
            
            // AC
            const temp = parseInt(c.ac_temp.replace('C', ''));
            if (!isNaN(temp)) next.ac.temp = temp;
            if (c.ac_mode) next.ac.mode = c.ac_mode as any;
            
            // Lights
            if (c.lights === 'off') next.lights.brightness = 0;
            else if (c.lights === 'ambient_warm') { next.lights.brightness = 60; next.lights.ambientColor = '#f59e0b'; }
            else if (c.lights === 'bright_white') { next.lights.brightness = 100; next.lights.ambientColor = '#ffffff'; }
            
            return next;
        });

        // Update HMI
        setHmiState({
            message: item.config.hmi.message,
            musicTrack: item.config.hmi.music === 'off' ? '' : item.config.hmi.music,
            navDestination: item.config.hmi.nav === 'off' ? '' : item.config.hmi.nav,
            alert: 'info',
            agentStatus: 'idle',
            rearCamera: { visible: false, riskAction: '', durationSeconds: 0 },
        });
        
    };

    // Driver State
    const [driverState, setDriverState] = useState<DriverState>({
        emotion: 'neutral',
        gaze: 'forward',
        heartRate: 75
    });

    // Passengers State
    const [passengers, setPassengers] = useState<Passenger[]>([
        { id: 'p1', seat: 'front_right', profile: { age: 28, gender: 'female' }, state: { emotion: 'happy', action: 'phone' } },
        { id: 'p2', seat: 'rear_right', profile: { age: 8, gender: 'male' }, state: { emotion: 'drowsy', action: 'sleeping' } }
    ]);

    const [world] = useState(() => new VehicleWorld());
    const worldSnapshot = useSyncExternalStore(world.subscribe, world.getSnapshot);
    const carState = worldSnapshot.car;
    const setCarState = world.setCar;
    useEffect(() => () => world.cancel(), [world]);
    const latest = useRef({ scenario, hmi: hmiState, vehicleDynamics });
    latest.current = { scenario, hmi: hmiState, vehicleDynamics };

    // Drone State
    const [droneState, setDroneState] = useState<DroneState>({
        altitude: 0,
        speed: 0,
        battery: 98,
        status: 'ground'
    });

    // Robot State
    const [robotState, setRobotState] = useState<RobotState>({
        pose: { x: 0, y: 0, theta: 0 },
        gripper: 0,
        status: 'idle'
    });
    
    const controls = {
        exportExecutionState: () => ({ world:world.exportCheckpoint(), state:controls.getState() }),
        prepareExecutionState: (value:unknown) => {
            const v=structuredClone(value) as any;
            const checked=new VehicleWorld();checked.restoreCheckpoint(v?.world);
            if(!v?.state||typeof v.state!== 'object'||!v.state.hmi||typeof v.state.hmi.message!=='string')throw Error('HMI执行快照无效。');
            return () => {
                world.restoreCheckpoint(checked.exportCheckpoint());
                const {car:_car,...rest}=v.state;controls.setState(rest);
            };
        },
        executeHmiControl: world.executeHmiControl,
        executeAmbientLight: world.setAmbientLight,
        restoreAmbientLight: world.restoreAmbientLight,
        executeWindowTargets: (targets: Partial<Record<WindowKey, number>>) => world.moveWindows(targets, 'workflow'),
        getState: () => ({ car: world.getSnapshot().car, drone: droneState, robot: robotState, driver: driverState, passengers, ...latest.current }),
        executeWindowAction: (action: 'open_all' | 'close_all') => {
            const value = action === 'open_all' ? 100 : 0;
            return world.moveWindows({ fl: value, fr: value, rl: value, rr: value }, 'workflow');
        },
        setState: (state: any) => {
            if (state.car) { world.cancel(); setCarState(state.car); }
            if (state.drone) setDroneState(state.drone);
            if (state.robot) setRobotState(state.robot);
            if (state.driver) setDriverState(state.driver);
            if (state.passengers) setPassengers(state.passengers);
            if (state.hmi) { const restored = { ...state.hmi, speechRequest: undefined }; latest.current.hmi=restored;setHmiState(restored); }
            if (state.scenario) { latest.current.scenario=state.scenario;setScenario(state.scenario); }
            if (state.vehicleDynamics) { latest.current.vehicleDynamics=state.vehicleDynamics;setVehicleDynamics(state.vehicleDynamics); }
        },
        loadScenario: (item: any) => handleScenarioSelect(item),
        updateState: (deviceType: string, action: string, param: string) => {
            // Auto switch tab logic for sidebar mode
            if (!fullScreen) {
                if (deviceType === 'drone') setActiveTab('drone');
                else if (deviceType === 'robot') setActiveTab('robot');
                else if (deviceType === 'driver') setActiveTab('driver');
                else setActiveTab('car');
            }

            if (deviceType === 'scenario') {
                if (action === 'weather') latest.current.scenario = { ...latest.current.scenario, weather: param as ScenarioState['weather'] };
                setScenario(prev => {
                    const next = { ...prev };
                    if (action === 'set') {
                        // Quick Presets
                        if (param === 'parking') { next.name = 'parking'; next.road = 'parking'; }
                        if (param === 'highway') { next.name = 'highway'; next.road = 'asphalt'; next.weather = 'clear'; }
                        if (param === 'rain') { next.name = 'rain'; next.weather = 'rain'; }
                        if (param === 'night') { next.name = 'night'; next.time = 'night'; }
                    }
                    if (action === 'weather') next.weather = param as any;
                    if (action === 'time') next.time = param as any;
                    return next;
                });
            } else if (deviceType === 'hmi') {
                const next = { ...latest.current.hmi };
                    if (action === 'message') { next.message = param; next.speechRequest = { id: ++speechSequence.current, text: param }; }
                    if (action === 'nav') next.navDestination = param;
                    if (action === 'music') next.musicTrack = param;
                    if (action === 'care_frame') next.careFrame = param;
                    if (action === 'care_summary') next.careSummary = param;
                    if (action === 'alert') next.alert = param as any;
                    if (action === 'agent') next.agentStatus = param as any;
                    if (action === 'rear_camera') next.rearCamera = { ...next.rearCamera, visible: param === 'on' };
                    if (action === 'rear_camera_risk') next.rearCamera = { ...next.rearCamera, riskAction: param };
                    if (action === 'rear_camera_duration') next.rearCamera = { ...next.rearCamera, durationSeconds: Number(param) || 0 };
                latest.current.hmi = next;
                setHmiState(next);
            } else if (deviceType === 'drone') {
                setDroneState(prev => {
                    const next = { ...prev };
                    if (action === 'takeoff') { next.status = 'flying'; next.altitude = parseInt(param) || 10; }
                    if (action === 'land') { next.status = 'ground'; next.altitude = 0; }
                    if (action === 'fly_to') { next.status = 'flying'; next.speed = 5; }
                    return next;
                });
            } else if (deviceType === 'robot') {
                setRobotState(prev => {
                    const next = { ...prev };
                    if (action === 'move_base') { next.status = 'moving'; next.pose.x += 1; }
                    if (action === 'gripper') { next.gripper = param === 'open' ? 100 : 0; }
                    return next;
                });
            } else if (deviceType === 'driver') {
                setDriverState(prev => {
                    const next = { ...prev };
                    if (action === 'heartRate') next.heartRate = parseInt(param);
                    if (action === 'emotion') next.emotion = param as any;
                    return next;
                });
            } else if (deviceType === 'car') {
                if (action === 'windows') {
                    const value = ['close_all', 'closed'].includes(param) ? 0 : param === 'open_all' ? 100 : 20;
                    void world.moveWindows({ fl: value, fr: value, rl: value, rr: value }, 'workflow');
                    return;
                }
                setCarState(prev => {
                    const next = { ...prev };
                    switch(action) {
                        case 'windows':
                            break; // handled through the actuator before the React updater
                        case 'ac_temp': {
                            const temp = parseInt(param.replace('C', ''));
                            if (!isNaN(temp)) next.ac = { ...next.ac, temp };
                            break;
                        }
                        case 'ac_mode':
                             if (param === 'max') { next.ac.fan = 10; next.ac.temp = 18; }
                             break;
                    }
                    return next;
                });
            } else if (deviceType === 'vehicle') {
                setVehicleDynamics(prev => {
                    const next = { ...prev };
                    switch (action) {
                        case 'accelerate': {
                            const target = parseInt(param) || 120;
                            next.speed = Math.min(200, target);
                            next.braking = false;
                            break;
                        }
                        case 'brake': {
                            const target = parseInt(param) || 0;
                            next.speed = Math.max(0, target);
                            next.braking = true;
                            break;
                        }
                        case 'laneChange': {
                            if (param === 'left') {
                                next.targetLane = Math.max(-1, next.targetLane - 1);
                                next.steeringAngle = -0.6;
                                next.turnSignal = 'left';
                            } else if (param === 'right') {
                                next.targetLane = Math.min(1, next.targetLane + 1);
                                next.steeringAngle = 0.6;
                                next.turnSignal = 'right';
                            }
                            setTimeout(() => {
                                setVehicleDynamics(p => ({ ...p, steeringAngle: 0, turnSignal: 'off' }));
                            }, 2000);
                            break;
                        }
                        case 'turnSignal':
                            next.turnSignal = param as any;
                            break;
                        case 'headlights':
                            next.headlights = param === 'on';
                            break;
                        case 'hazard':
                            next.turnSignal = param === 'on' ? 'hazard' : 'off';
                            break;
                        case 'cruise': {
                            const speed = parseInt(param) || 120;
                            next.speed = speed;
                            next.braking = false;
                            next.headlights = true;
                            break;
                        }
                    }
                    return next;
                });
            }
        }
    };
    useImperativeHandle(ref, () => controls);

    if (fullScreen) {
        return <CockpitHmi active={active} world={world} snapshot={worldSnapshot} scenario={scenario} hmi={hmiState}
          dynamics={vehicleDynamics} update={controls.updateState} onRun={onRun} onCreateRain={onCreateRain} onCreateChild={onCreateChild}
          running={running} workflowName={workflowName} />;
    }

    // Sidebar Mode (Original)
    return (
        <Card className="w-80 h-full border-l bg-background overflow-y-auto">
            <CardHeader className="pb-2">
                <CardTitle className="type-item-title  flex items-center gap-2 uppercase tracking-wider text-foreground">
                    <Settings2 className="w-4 h-4" /> Jarvis Simulator
                </CardTitle>
            </CardHeader>
            <CardContent>
                <Tabs value={activeTab} onValueChange={setActiveTab}>
                    <TabsList className="grid w-full grid-cols-4 mb-4 h-auto">
                        <TabsTrigger value="driver" className="type-label"><User className="w-3 h-3 mr-1"/> Driver</TabsTrigger>
                        <TabsTrigger value="car" className="type-label"><Car className="w-3 h-3 mr-1"/> Car</TabsTrigger>
                        <TabsTrigger value="drone" className="type-label"><Plane className="w-3 h-3 mr-1"/> UAV</TabsTrigger>
                        <TabsTrigger value="robot" className="type-label"><Bot className="w-3 h-3 mr-1"/> UGV</TabsTrigger>
                    </TabsList>
                    
                    <TabsContent value="driver" className="space-y-4">
                        <div className="bg-white p-3 rounded-lg border shadow-sm">
                            <span className="type-label text-muted-foreground uppercase  mb-2 block">Simulate Emotion</span>
                            <div className="grid grid-cols-2 gap-2">
                                <Button variant={driverState.emotion === 'neutral' ? 'default' : 'outline'} size="sm" onClick={() => setDriverState({...driverState, emotion: 'neutral'})} className="type-label h-7">😐 Neutral</Button>
                                <Button variant={driverState.emotion === 'happy' ? 'default' : 'outline'} size="sm" onClick={() => setDriverState({...driverState, emotion: 'happy'})} className="type-label h-7 text-green-600">😊 Happy</Button>
                                <Button variant={driverState.emotion === 'angry' ? 'default' : 'outline'} size="sm" onClick={() => setDriverState({...driverState, emotion: 'angry'})} className="type-label h-7 text-red-600">😡 Angry</Button>
                                <Button variant={driverState.emotion === 'drowsy' ? 'default' : 'outline'} size="sm" onClick={() => setDriverState({...driverState, emotion: 'drowsy'})} className="type-label h-7 text-purple-600">😴 Drowsy</Button>
                            </div>
                        </div>

                        <div className="bg-white p-3 rounded-lg border shadow-sm">
                            <span className="type-label text-muted-foreground uppercase  mb-2 block">Simulate Gaze</span>
                            <div className="grid grid-cols-2 gap-2">
                                <Button variant={driverState.gaze === 'forward' ? 'default' : 'outline'} size="sm" onClick={() => setDriverState({...driverState, gaze: 'forward'})} className="type-label h-7">👀 Forward</Button>
                                <Button variant={driverState.gaze === 'phone' ? 'default' : 'outline'} size="sm" onClick={() => setDriverState({...driverState, gaze: 'phone'})} className="type-label h-7 text-red-500">📱 Phone</Button>
                                <Button variant={driverState.gaze === 'left' ? 'default' : 'outline'} size="sm" onClick={() => setDriverState({...driverState, gaze: 'left'})} className="type-label h-7">👈 Left</Button>
                                <Button variant={driverState.gaze === 'right' ? 'default' : 'outline'} size="sm" onClick={() => setDriverState({...driverState, gaze: 'right'})} className="type-label h-7">👉 Right</Button>
                            </div>
                        </div>

                        <div className="flex items-center justify-between p-2 bg-background rounded">
                            <span className="type-label flex items-center gap-1"><Activity className="w-3 h-3 text-red-500"/> Heart Rate</span>
                            <span className="type-body font-mono font-bold">{uiText(driverState.heartRate)} BPM</span>
                        </div>
                    </TabsContent>

                    <TabsContent value="car" className="space-y-6">
                        <div className="space-y-2">
                            <div className="flex items-center justify-between">
                                <span className="type-label  flex items-center gap-1"><Wind className="w-3 h-3" /> Climate</span>
                                <span className="type-body font-mono">{uiText(carState.ac.temp)}°C</span>
                            </div>
                            <Progress value={(carState.ac.temp - 16) * 10} className="h-1.5" />
                        </div>
                        <div className="space-y-2">
                            <div className="flex items-center justify-between">
                                <span className="type-label  flex items-center gap-1"><Lock className="w-3 h-3" /> Doors</span>
                                <AppIcon name={carState.doors.locked ? 'lock' : 'unlock'} className={`w-3 h-3 ${carState.doors.locked ? 'text-green-500' : 'text-red-500'}`} />
                            </div>
                        </div>
                    </TabsContent>

                    <TabsContent value="drone" className="space-y-6">
                        <div className="flex justify-between items-center bg-white p-3 rounded-lg border">
                            <div className="flex flex-col">
                                <span className="type-label text-muted-foreground">STATUS</span>
                                <Badge variant={droneState.status === 'flying' ? 'default' : 'secondary'}>{uiText(droneState.status.toUpperCase())}</Badge>
                            </div>
                            <div className="flex flex-col items-end">
                                <span className="type-label text-muted-foreground">BATTERY</span>
                                <span className="type-body font-bold text-green-600">{uiText(droneState.battery)}%</span>
                            </div>
                        </div>
                        <div className="space-y-2">
                            <div className="flex justify-between type-body">
                                <span>Altitude</span>
                                <span>{uiText(droneState.altitude)}m</span>
                            </div>
                            <Progress value={Math.min(100, droneState.altitude)} className="h-1.5" />
                        </div>
                    </TabsContent>

                    <TabsContent value="robot" className="space-y-6">
                        <div className="flex justify-between items-center bg-white p-3 rounded-lg border">
                            <div className="flex flex-col">
                                <span className="type-label text-muted-foreground">STATUS</span>
                                <Badge variant={robotState.status === 'moving' ? 'default' : 'outline'}>{uiText(robotState.status.toUpperCase())}</Badge>
                            </div>
                            <Bot className="w-6 h-6 text-orange-500" />
                        </div>
                        <div className="space-y-2">
                            <div className="flex justify-between type-body">
                                <span>Gripper Open</span>
                                <span>{uiText(robotState.gripper)}%</span>
                            </div>
                            <Progress value={robotState.gripper} className="h-1.5" />
                        </div>
                        <div className="grid grid-cols-3 gap-2 text-center type-body">
                            <div className="bg-background p-2 rounded">X: {uiText(robotState.pose.x)}</div>
                            <div className="bg-background p-2 rounded">Y: {uiText(robotState.pose.y)}</div>
                            <div className="bg-background p-2 rounded">θ: {uiText(robotState.pose.theta)}</div>
                        </div>
                    </TabsContent>
                </Tabs>
            </CardContent>
        </Card>
    );
});

VehicleSimulator.displayName = 'VehicleSimulator';
