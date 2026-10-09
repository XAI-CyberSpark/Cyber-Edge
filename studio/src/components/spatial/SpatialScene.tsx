import { uiText, useUiLanguage  } from '@/i18n';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, PerspectiveCamera, Grid, ContactShadows, Text, Float, Line, Environment } from '@react-three/drei';
import { useRef, useMemo, Component, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import * as THREE from 'three';
import type { VehicleDynamics } from '@/components/core/VehicleSimulator';
// Postprocessing temporarily removed due to React 19 compatibility issues
// import { EffectComposer, Bloom, Vignette } from '@react-three/postprocessing';

// Physical scene units, not CSS pixels. See docs/product/TYPOGRAPHY.md.
const SCENE_TEXT = {
  instrumentValue: 0.08,
  instrumentCaption: 0.03,
  screenCaption: 0.03,
  screenMessage: 0.035,
  screenTitle: 0.04,
  screenControl: 0.04,
  roadSignTitle: 0.6,
  roadSignCaption: 0.35,
  speedLimit: 0.45,
  groundMarking: 0.5,
  buildingSign: 1.2,
  emotionLabel: 0.15,
  entityLabel: 0.2,
} as const;

// Simple Error Boundary for 3D components
class ModelErrorBoundary extends Component<{ fallback: ReactNode, children: ReactNode }, { hasError: boolean }> {
  constructor(props: any) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(_error: any) {
    return { hasError: true };
  }

  componentDidCatch(error: any, errorInfo: any) {
    console.error("3D Model failed to load:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback;
    }

    return this.props.children;
  }
}

export function SpatialScene({ mode = 'automotive', cameraView = 'exterior', quality = 'high', carState, droneState, robotState, driverState, passengers, hmiState, scenario, vehicleDynamics }: any) {
  useUiLanguage();
    const cameraPos = useMemo<[number, number, number]>(() => {
        if (cameraView === 'interior') return [0, 1.3, 1.8]; // Dashboard perspective looking back
        return mode === 'automotive' ? [6, 3.5, 10] : [8, 6, 8];
    }, [mode, cameraView]);

    return (
        <Canvas shadows gl={{ antialias: true }} dpr={[1, 1.5]} className="w-full h-full rounded-lg border bg-gradient-to-b from-foreground to-foreground">
            <PerspectiveCamera makeDefault position={cameraPos} fov={cameraView === 'interior' ? 80 : 45} />
            <SceneLighting scenario={scenario} />
            <OrbitControls 
                target={cameraView === 'interior' ? [0, 0.8, -1] : [0, 1, 0]} 
                maxPolarAngle={Math.PI / 1.8} 
                enableZoom={cameraView === 'exterior'}
            />

            {mode === 'automotive' && (
                <>
                    {quality === 'high' && (
                        <Environment
                            preset={scenario?.time === 'night' ? 'night' : 'city'}
                            background={true}
                            blur={0.5}
                        />
                    )}
                    <group position={[0, 0, 0]}>
                        <VehicleDynamicsController dynamics={vehicleDynamics}>
                        <CarSuspensionAnimation active={scenario?.name === 'highway'}>
                          <group rotation={[0, Math.PI, 0]}>
                          <ModelErrorBoundary fallback={<CarModel state={carState} driverState={driverState} passengers={passengers} />}>
                            {quality === 'high' ? (
                                <CarWithInterior state={carState} driverState={driverState} passengers={passengers} hmiState={hmiState} cameraView={cameraView} />
                            ) : (
                                <CarModel state={carState} driverState={driverState} passengers={passengers} hmiState={hmiState} />
                            )}
                          </ModelErrorBoundary>
                          <VehicleLights dynamics={vehicleDynamics} />
                          </group>
                        </CarSuspensionAnimation>
                        </VehicleDynamicsController>
                        <ContactShadows resolution={1024} scale={18} blur={2.2} opacity={0.28} far={8} color="#000000" position={[0, 0.02, 0]} />
                        <RoadEnvironment scenario={scenario} vehicleDynamics={vehicleDynamics} />

                        {/* Rain/Snow Effects */}
                        {scenario?.weather === 'rain' && <RainEffect />}
                        {scenario?.weather === 'snow' && <SnowEffect />}
                    </group>
                </>
            )}

            {mode === 'logistics' && (
                <>
                    <Grid args={[30, 30]} cellSize={1} cellThickness={0.5} cellColor="#ccc" sectionColor="#888" fadeDistance={25} position={[0, -0.01, 0]} />
                    <ContactShadows resolution={1024} scale={30} blur={2} opacity={0.4} far={10} color="#000000" />
                    <group position={[0, 0, 0]}>
                        <DroneModel state={droneState} />
                    </group>
                </>
            )}

            {mode === 'manufacturing' && (
                <>
                    <Grid args={[20, 20]} cellSize={0.5} cellThickness={0.5} cellColor="#888" sectionColor="#444" fadeDistance={15} position={[0, -0.01, 0]} />
                    <ContactShadows resolution={1024} scale={20} blur={2} opacity={0.6} far={10} color="#000000" />
                    <group position={[0, 0, 0]}>
                        <RobotModel state={robotState} />
                    </group>
                </>
            )}

            {quality === 'high' && (
                <>
                    {/* Post-processing disabled for React 19 stability */}
                </>
            )}
        </Canvas>
    )
}

function SceneLighting({ scenario }: any) {
  useUiLanguage();
    const { gl, scene } = useThree();
    const isNight = scenario?.time === 'night';

    useEffect(() => {
        gl.toneMapping = THREE.ACESFilmicToneMapping;
        gl.toneMappingExposure = isNight ? 0.98 : 1.08;
        scene.fog = isNight
            ? new THREE.Fog('#050816', 25, 50)
            : new THREE.Fog('#c8daf0', 40, 80);
    }, [gl, isNight, scene]);

    return (
        <>
            <ambientLight intensity={isNight ? 0.26 : 0.68} />
            <hemisphereLight
                args={[isNight ? '#312e81' : '#f8fbff', isNight ? '#050816' : '#d7deeb', isNight ? 0.32 : 0.72]}
            />
            <directionalLight
                position={[7, 12, 7]}
                intensity={isNight ? 0.42 : 1.82}
                color={isNight ? '#93c5fd' : '#fff8f1'}
                castShadow
                shadow-mapSize={[2048, 2048]}
                shadow-bias={-0.0001}
            />
            <directionalLight
                position={[-7, 4, -6]}
                intensity={isNight ? 0.2 : 0.86}
                color={isNight ? '#8b5cf6' : '#c4b5fd'}
            />
            <spotLight
                position={[0, 6, -5]}
                angle={0.42}
                penumbra={0.7}
                intensity={isNight ? 0.34 : 0.96}
                color={isNight ? '#ddd6fe' : '#ffffff'}
            />
            <pointLight position={[4.5, 2.2, 3.5]} intensity={isNight ? 0.3 : 0.55} color="#60a5fa" />
            <pointLight position={[-4.5, 2.0, 2.5]} intensity={isNight ? 0.26 : 0.48} color="#a855f7" />

            {isNight && (
                <>
                    <pointLight position={[0, 4, 0]} intensity={0.9} color="#334155" />
                    <pointLight position={[5, 2, 5]} intensity={1.35} color="#60a5fa" />
                </>
            )}
        </>
    );
}

function CarWithInterior({ state, driverState, passengers, hmiState, cameraView }: any) {
  useUiLanguage();
  return (
    <group>
      {cameraView !== 'interior' && (
        <CarModel state={state} driverState={driverState} passengers={passengers} />
      )}

      {cameraView === 'interior' && (
        <>
          <CarInterior state={state} hmiState={hmiState} />

          <group position={[0.35, 0.7, 0.2]}>
            <PassengerModel passenger={{ seat: 'driver', state: driverState }} scale={0.8} />
          </group>

          {passengers?.map((p: any) => {
            let pos: [number, number, number] = [0, 0, 0];
            if (p.seat === 'front_right') pos = [-0.35, 0.7, 0.2];
            if (p.seat === 'rear_left') pos = [0.35, 0.7, -0.5];
            if (p.seat === 'rear_right') pos = [-0.35, 0.7, -0.5];

            return (
              <group key={p.id} position={pos}>
                <PassengerModel passenger={p} scale={0.8} />
              </group>
            );
          })}
        </>
      )}
    </group>
  );
}


function CarInterior({ state, hmiState }: any) {
  useUiLanguage();
    return (
        <group position={[0, 0.6, 0.8]}>
            {/* Dashboard Main Shape */}
            <mesh position={[0, 0, 0]} castShadow receiveShadow>
                <boxGeometry args={[2.0, 0.15, 0.6]} />
                <meshStandardMaterial color="#222" roughness={0.9} />
            </mesh>

            {/* Steering Wheel Area */}
            <group position={[0.5, 0.1, -0.2]} rotation={[0, 0, 0]}>
                <mesh rotation={[Math.PI / 2, 0, 0]}>
                    <torusGeometry args={[0.15, 0.02, 16, 32]} />
                    <meshStandardMaterial color="#111" />
                </mesh>
                {/* Instrument Cluster */}
                <group position={[0, 0.15, 0.3]} rotation={[-0.2, 0, 0]}>
                    <mesh>
                        <planeGeometry args={[0.5, 0.2]} />
                        <meshBasicMaterial color="#000" />
                    </mesh>
                    <Text position={[0, 0, 0.01]} fontSize={SCENE_TEXT.instrumentValue} color="#00ffff" anchorX="center" anchorY="middle">
                        {uiText(state?.ac?.fan * 12 || 0)} km/h
                    </Text>
                    <Text position={[0, -0.06, 0.01]} fontSize={SCENE_TEXT.instrumentCaption} color="#888" anchorX="center" anchorY="middle">
                        READY
                    </Text>
                </group>
            </group>

            {/* Center Console HMI */}
            <group position={[0, 0.1, 0.1]} rotation={[-0.3, 0, 0]}>
                <mesh>
                    <planeGeometry args={[0.8, 0.5]} />
                    <meshStandardMaterial color="#111" metalness={0.8} roughness={0.2} />
                </mesh>
                {/* HMI Content */}
                <group position={[0, 0, 0.01]}>
                    <mesh position={[0, 0, -0.005]}>
                        <planeGeometry args={[0.75, 0.45]} />
                        <meshBasicMaterial color="#000" />
                    </mesh>
                    
                    {/* Header Bar */}
                    <group position={[0, 0.18, 0]}>
                        <Text position={[-0.3, 0, 0]} fontSize={SCENE_TEXT.screenCaption} color="#fff" anchorX="center" anchorY="middle">12:45 PM</Text>
                        <Text position={[0.3, 0, 0]} fontSize={SCENE_TEXT.screenCaption} color="#fff" anchorX="center" anchorY="middle">5G</Text>
                    </group>

                    {/* Agent Avatar Area (Dynamic) */}
                    <group position={[0, 0.08, 0]}>
                         {/* Dynamic Agent Orb */}
                         <mesh position={[0, 0, 0.02]}>
                            <sphereGeometry args={[0.08, 32, 32]} />
                            <meshStandardMaterial 
                                color={
                                    hmiState?.agentStatus === 'processing' ? '#a855f7' : // Purple pulsing
                                    hmiState?.agentStatus === 'speaking' ? '#22c55e' :   // Green speaking
                                    '#3b82f6' // Blue Idle
                                } 
                                emissive={
                                    hmiState?.agentStatus === 'processing' ? '#a855f7' :
                                    hmiState?.agentStatus === 'speaking' ? '#22c55e' :
                                    '#1d4ed8'
                                }
                                emissiveIntensity={hmiState?.agentStatus === 'idle' ? 0.5 : 2}
                                toneMapped={false}
                            />
                         </mesh>
                         {/* Agent Ring */}
                         <mesh position={[0, 0, 0.01]} rotation={[Math.PI/2, 0, 0]}>
                            <torusGeometry args={[0.1, 0.005, 16, 32]} />
                            <meshBasicMaterial color="#ffffff" transparent opacity={0.3} />
                         </mesh>
                         
                         <Text position={[0, -0.12, 0.02]} fontSize={SCENE_TEXT.screenMessage} color="#60a5fa" maxWidth={0.65} textAlign="center" anchorX="center" anchorY="middle">
                            {hmiState?.message || "Hi, I'm CyberClaw"}
                         </Text>
                    </group>

                    {/* Map / Nav Visualization */}
                    <group position={[-0.2, -0.08, 0]}>
                        <Line points={[[-0.15, -0.1, 0], [0, 0.1, 0], [0.15, -0.05, 0]]} color="#00ffff" lineWidth={2} />
                        <Text position={[0, -0.12, 0]} fontSize={SCENE_TEXT.screenCaption} color="#fff" anchorX="center" anchorY="middle">NAV: {hmiState?.navDestination || 'Home'}</Text>
                    </group>
                    
                    {/* Media / Status */}
                    <group position={[0.2, -0.05, 0]}>
                        <Text position={[0, 0.05, 0]} fontSize={SCENE_TEXT.screenTitle} color="#fff" anchorX="center" anchorY="middle">🎵 Music</Text>
                        <Text position={[0, -0.05, 0]} fontSize={SCENE_TEXT.screenCaption} color="#888" anchorX="center" anchorY="middle">{hmiState?.musicTrack || 'CyberWave.mp3'}</Text>
                    </group>
                    
                    {/* Bottom Bar */}
                    <group position={[0, -0.18, 0]}>
                        <Text position={[-0.3, 0, 0]} fontSize={SCENE_TEXT.screenControl} color="#fff" anchorX="center" anchorY="middle">{state?.ac?.temp}°C</Text>
                        <Text position={[0.3, 0, 0]} fontSize={SCENE_TEXT.screenControl} color="#fff" anchorX="center" anchorY="middle">AUTO</Text>
                    </group>
                </group>
            </group>
        </group>
    )
}


function CarSuspensionAnimation({ active, children }: { active: boolean; children: ReactNode }) {
  useUiLanguage();
    const groupRef = useRef<THREE.Group>(null);

    useFrame(({ clock }) => {
        if (!groupRef.current || !active) return;
        const t = clock.getElapsedTime();
        groupRef.current.position.y = Math.sin(t * 3.2) * 0.012 + Math.sin(t * 5.7) * 0.006;
        groupRef.current.rotation.x = Math.sin(t * 2.8) * 0.003;
        groupRef.current.rotation.z = Math.sin(t * 1.9) * 0.002;
    });

    return <group ref={groupRef}>{children}</group>;
}

function VehicleDynamicsController({ dynamics, children }: { dynamics?: VehicleDynamics; children: ReactNode }) {
  useUiLanguage();
    const groupRef = useRef<THREE.Group>(null);
    const currentX = useRef(0);
    const currentTilt = useRef(0);

    const LANE_WIDTH = 3.8;

    useFrame((_, delta) => {
        if (!groupRef.current || !dynamics) return;
        const targetX = dynamics.targetLane * LANE_WIDTH;
        currentX.current = THREE.MathUtils.lerp(currentX.current, targetX, delta * 2.5);
        groupRef.current.position.x = currentX.current;

        const targetTilt = dynamics.steeringAngle * 0.04;
        currentTilt.current = THREE.MathUtils.lerp(currentTilt.current, targetTilt, delta * 4);
        groupRef.current.rotation.z = currentTilt.current;
        groupRef.current.rotation.y = dynamics.steeringAngle * 0.02;
    });

    return <group ref={groupRef}>{children}</group>;
}

function VehicleLights({ dynamics }: { dynamics?: VehicleDynamics }) {
  useUiLanguage();
    const [blinkOn, setBlinkOn] = useState(true);

    useFrame(({ clock }) => {
        const t = clock.getElapsedTime();
        setBlinkOn(Math.floor(t * 2) % 2 === 0);
    });

    if (!dynamics) return null;

    const showLeft = (dynamics.turnSignal === 'left' || dynamics.turnSignal === 'hazard') && blinkOn;
    const showRight = (dynamics.turnSignal === 'right' || dynamics.turnSignal === 'hazard') && blinkOn;
    const showBrake = dynamics.braking;
    const showHeadlights = dynamics.headlights || dynamics.speed > 0;

    return (
        <group>
            {/* Turn signal - left front (car is rotated 180, so positions are mirrored) */}
            <mesh position={[-0.85, 0.55, 2.3]}>
                <boxGeometry args={[0.2, 0.12, 0.05]} />
                <meshStandardMaterial
                    color={showLeft ? '#f59e0b' : '#3f3f00'}
                    emissive={showLeft ? '#f59e0b' : '#000'}
                    emissiveIntensity={showLeft ? 4 : 0}
                    toneMapped={false}
                />
            </mesh>
            {/* Turn signal - right front */}
            <mesh position={[0.85, 0.55, 2.3]}>
                <boxGeometry args={[0.2, 0.12, 0.05]} />
                <meshStandardMaterial
                    color={showRight ? '#f59e0b' : '#3f3f00'}
                    emissive={showRight ? '#f59e0b' : '#000'}
                    emissiveIntensity={showRight ? 4 : 0}
                    toneMapped={false}
                />
            </mesh>
            {/* Turn signal - left rear */}
            <mesh position={[-0.85, 0.55, -2.3]}>
                <boxGeometry args={[0.2, 0.12, 0.05]} />
                <meshStandardMaterial
                    color={showLeft ? '#f59e0b' : '#3f3f00'}
                    emissive={showLeft ? '#f59e0b' : '#000'}
                    emissiveIntensity={showLeft ? 3 : 0}
                    toneMapped={false}
                />
            </mesh>
            {/* Turn signal - right rear */}
            <mesh position={[0.85, 0.55, -2.3]}>
                <boxGeometry args={[0.2, 0.12, 0.05]} />
                <meshStandardMaterial
                    color={showRight ? '#f59e0b' : '#3f3f00'}
                    emissive={showRight ? '#f59e0b' : '#000'}
                    emissiveIntensity={showRight ? 3 : 0}
                    toneMapped={false}
                />
            </mesh>
            {/* Brake lights (rear) */}
            <mesh position={[-0.5, 0.6, -2.35]}>
                <boxGeometry args={[0.35, 0.1, 0.05]} />
                <meshStandardMaterial
                    color={showBrake ? '#ef4444' : '#400000'}
                    emissive={showBrake ? '#ef4444' : '#000'}
                    emissiveIntensity={showBrake ? 5 : 0}
                    toneMapped={false}
                />
            </mesh>
            <mesh position={[0.5, 0.6, -2.35]}>
                <boxGeometry args={[0.35, 0.1, 0.05]} />
                <meshStandardMaterial
                    color={showBrake ? '#ef4444' : '#400000'}
                    emissive={showBrake ? '#ef4444' : '#000'}
                    emissiveIntensity={showBrake ? 5 : 0}
                    toneMapped={false}
                />
            </mesh>
            {/* Headlights (front) */}
            {showHeadlights && (
                <>
                    <pointLight position={[-0.6, 0.5, 2.5]} intensity={2} distance={15} color="#fffde6" />
                    <pointLight position={[0.6, 0.5, 2.5]} intensity={2} distance={15} color="#fffde6" />
                    <mesh position={[-0.6, 0.5, 2.35]}>
                        <boxGeometry args={[0.35, 0.15, 0.05]} />
                        <meshStandardMaterial color="#fef9c3" emissive="#fef9c3" emissiveIntensity={3} toneMapped={false} />
                    </mesh>
                    <mesh position={[0.6, 0.5, 2.35]}>
                        <boxGeometry args={[0.35, 0.15, 0.05]} />
                        <meshStandardMaterial color="#fef9c3" emissive="#fef9c3" emissiveIntensity={3} toneMapped={false} />
                    </mesh>
                </>
            )}
        </group>
    );
}

function RoadEnvironment({ scenario, vehicleDynamics }: any) {
  useUiLanguage();
    const roadType = scenario?.road || 'asphalt';
    const scenarioName = scenario?.name || 'highway';

    if (scenarioName === 'parking' || roadType === 'parking') {
        return <ParkingLotScene />;
    }
    if (scenarioName === 'highway') {
        return <HighwayScene vehicleDynamics={vehicleDynamics} />;
    }
    return <CityRoadScene />;
}

function HighwayScene({ vehicleDynamics }: { vehicleDynamics?: VehicleDynamics }) {
  useUiLanguage();
    const groupRef = useRef<THREE.Group>(null);
    const currentSpeed = useRef(18);
    const LOOP_LEN = 100;
    const SPEED = 18;
    const LANE_X = -5.5;

    useFrame((_, delta) => {
        if (!groupRef.current) return;
        const targetSpeed = vehicleDynamics?.speed ? (vehicleDynamics.speed / 120) * SPEED : SPEED;
        currentSpeed.current = THREE.MathUtils.lerp(currentSpeed.current, targetSpeed, delta * 2);
        groupRef.current.position.z += currentSpeed.current * delta;
        if (groupRef.current.position.z > LOOP_LEN) {
            groupRef.current.position.z -= LOOP_LEN;
        }
    });

    return (
        <group position={[LANE_X, 0, 0]}>
            {/* Scrolling part */}
            <group ref={groupRef}>
                <HighwayStrip zOffset={0} />
                <HighwayStrip zOffset={-LOOP_LEN} />
            </group>

            {/* Static elements that don't scroll (far background) */}
            {[-30, 30, -35, 35].map((x, i) => (
                <mesh key={`hill-${i}`} position={[x, -1, -40 + i * 15]}>
                    <sphereGeometry args={[12, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2]} />
                    <meshStandardMaterial color="#1a3d12" roughness={1} />
                </mesh>
            ))}
        </group>
    );
}

function HighwayStrip({ zOffset }: { zOffset: number }) {
  useUiLanguage();
    return (
        <group position={[0, 0, zOffset]}>
            {/* Highway surface - 6 lanes */}
            <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, 0]} receiveShadow>
                <planeGeometry args={[24, 100]} />
                <meshStandardMaterial color="#2d2d2d" roughness={0.9} metalness={0.0} />
            </mesh>

            {/* Grass on sides */}
            {[-1, 1].map((side) => (
                <mesh key={`grass-${side}`} rotation={[-Math.PI / 2, 0, 0]} position={[side * 22, -0.02, 0]} receiveShadow>
                    <planeGeometry args={[20, 100]} />
                    <meshStandardMaterial color="#2d5016" roughness={1} />
                </mesh>
            ))}

            {/* Central barrier */}
            <mesh position={[0, 0.4, 0]}>
                <boxGeometry args={[0.6, 0.8, 100]} />
                <meshStandardMaterial color="#9ca3af" roughness={0.6} metalness={0.1} />
            </mesh>

            {/* Lane markings - left side */}
            {[-7.5, -3.8].map((x) =>
                Array.from({ length: 25 }).map((_, i) => (
                    <mesh key={`ll-${x}-${i}`} rotation={[-Math.PI / 2, 0, 0]} position={[x, 0.01, i * 4 - 48]}>
                        <planeGeometry args={[0.15, 2.5]} />
                        <meshStandardMaterial color="#ffffff" emissive="#ffffff" emissiveIntensity={0.08} />
                    </mesh>
                ))
            )}

            {/* Lane markings - right side */}
            {[3.8, 7.5].map((x) =>
                Array.from({ length: 25 }).map((_, i) => (
                    <mesh key={`lr-${x}-${i}`} rotation={[-Math.PI / 2, 0, 0]} position={[x, 0.01, i * 4 - 48]}>
                        <planeGeometry args={[0.15, 2.5]} />
                        <meshStandardMaterial color="#ffffff" emissive="#ffffff" emissiveIntensity={0.08} />
                    </mesh>
                ))
            )}

            {/* Edge lines */}
            {[-11, 11].map((x) => (
                <mesh key={`edge-${x}`} rotation={[-Math.PI / 2, 0, 0]} position={[x, 0.01, 0]}>
                    <planeGeometry args={[0.2, 100]} />
                    <meshStandardMaterial color="#ffffff" emissive="#ffffff" emissiveIntensity={0.1} />
                </mesh>
            ))}

            {/* Guardrails */}
            {[-12.5, 12.5].map((x) =>
                Array.from({ length: 20 }).map((_, i) => (
                    <group key={`rail-${x}-${i}`} position={[x, 0, i * 5 - 48]}>
                        <mesh position={[0, 0.4, 0]}>
                            <boxGeometry args={[0.08, 0.6, 0.08]} />
                            <meshStandardMaterial color="#6b7280" metalness={0.7} roughness={0.3} />
                        </mesh>
                        <mesh position={[0, 0.55, 0]}>
                            <boxGeometry args={[0.12, 0.08, 5]} />
                            <meshStandardMaterial color="#9ca3af" metalness={0.8} roughness={0.2} />
                        </mesh>
                    </group>
                ))
            )}

            {/* Highway sign - faces toward camera (+z) */}
            <group position={[0, 6, -20]}>
                <mesh>
                    <boxGeometry args={[8, 2.5, 0.15]} />
                    <meshStandardMaterial color="#065f46" roughness={0.5} />
                </mesh>
                <Text position={[0, 0.3, 0.1]} fontSize={SCENE_TEXT.roadSignTitle} color="#ffffff" anchorX="center">
                    {uiText("G4 京港澳高速")}</Text>
                <Text position={[0, -0.5, 0.1]} fontSize={SCENE_TEXT.roadSignCaption} color="#22c55e" anchorX="center">
                    120 km/h
                </Text>
                {[-3.5, 3.5].map((x) => (
                    <mesh key={`post-${x}`} position={[x, -3.5, 0]}>
                        <cylinderGeometry args={[0.08, 0.08, 5, 8]} />
                        <meshStandardMaterial color="#6b7280" metalness={0.6} />
                    </mesh>
                ))}
            </group>

            {/* Speed limit sign - faces toward camera */}
            <group position={[13, 3, 30]}>
                <mesh>
                    <circleGeometry args={[0.8, 24]} />
                    <meshStandardMaterial color="#ffffff" />
                </mesh>
                <mesh position={[0, 0, -0.02]}>
                    <ringGeometry args={[0.65, 0.8, 24]} />
                    <meshStandardMaterial color="#dc2626" />
                </mesh>
                <Text position={[0, 0, 0.02]} fontSize={SCENE_TEXT.speedLimit} color="#1f2937" anchorX="center" anchorY="middle">
                    120
                </Text>
                <mesh position={[0, -2, 0]}>
                    <cylinderGeometry args={[0.05, 0.05, 3.5, 8]} />
                    <meshStandardMaterial color="#6b7280" metalness={0.5} />
                </mesh>
            </group>
        </group>
    );
}

function ParkingLotScene() {
  useUiLanguage();
    return (
        <group>
            {/* Parking lot ground - concrete */}
            <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, 0]} receiveShadow>
                <planeGeometry args={[40, 40]} />
                <meshStandardMaterial color="#6b7280" roughness={0.95} metalness={0.0} />
            </mesh>

            {/* Parking spaces - 2 rows */}
            {Array.from({ length: 8 }).map((_, i) => (
                <group key={`spot-top-${i}`} position={[i * 3.2 - 11.2, 0.02, -6]}>
                    {/* Side lines */}
                    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[-1.4, 0, 0]}>
                        <planeGeometry args={[0.1, 5.5]} />
                        <meshStandardMaterial color="#ffffff" emissive="#ffffff" emissiveIntensity={0.15} />
                    </mesh>
                    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[1.4, 0, 0]}>
                        <planeGeometry args={[0.1, 5.5]} />
                        <meshStandardMaterial color="#ffffff" emissive="#ffffff" emissiveIntensity={0.15} />
                    </mesh>
                    {/* Back line */}
                    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, -2.75]}>
                        <planeGeometry args={[2.8, 0.1]} />
                        <meshStandardMaterial color="#ffffff" emissive="#ffffff" emissiveIntensity={0.15} />
                    </mesh>
                    {/* Spot number */}
                    <Text rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, 0]} fontSize={SCENE_TEXT.groundMarking} color="#d1d5db">
                        {uiText(`P${i + 1}`)}
                    </Text>
                </group>
            ))}

            {/* Bottom row of parking spaces */}
            {Array.from({ length: 8 }).map((_, i) => (
                <group key={`spot-bot-${i}`} position={[i * 3.2 - 11.2, 0.02, 8]}>
                    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[-1.4, 0, 0]}>
                        <planeGeometry args={[0.1, 5.5]} />
                        <meshStandardMaterial color="#ffffff" emissive="#ffffff" emissiveIntensity={0.15} />
                    </mesh>
                    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[1.4, 0, 0]}>
                        <planeGeometry args={[0.1, 5.5]} />
                        <meshStandardMaterial color="#ffffff" emissive="#ffffff" emissiveIntensity={0.15} />
                    </mesh>
                    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 2.75]}>
                        <planeGeometry args={[2.8, 0.1]} />
                        <meshStandardMaterial color="#ffffff" emissive="#ffffff" emissiveIntensity={0.15} />
                    </mesh>
                    <Text rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, 0]} fontSize={SCENE_TEXT.groundMarking} color="#d1d5db">
                        {uiText(`P${i + 9}`)}
                    </Text>
                </group>
            ))}

            {/* Driving lane arrows */}
            {Array.from({ length: 4 }).map((_, i) => (
                <group key={`arrow-${i}`} rotation={[-Math.PI / 2, 0, 0]} position={[i * 6 - 9, 0.02, 1]}>
                    <mesh>
                        <planeGeometry args={[0.3, 1.5]} />
                        <meshStandardMaterial color="#facc15" emissive="#facc15" emissiveIntensity={0.1} />
                    </mesh>
                    <mesh position={[0, 1, 0]}>
                        <bufferGeometry>
                            <float32BufferAttribute attach="attributes-position" args={[new Float32Array([-0.5, 0, 0, 0.5, 0, 0, 0, 0.6, 0]), 3]} />
                        </bufferGeometry>
                        <meshStandardMaterial color="#facc15" emissive="#facc15" emissiveIntensity={0.1} side={THREE.DoubleSide} />
                    </mesh>
                </group>
            ))}

            {/* Concrete pillars (covered parking area) */}
            {[-15, -8, 0, 8, 15].map((x) =>
                [-12, 12].map((z) => (
                    <group key={`pillar-${x}-${z}`} position={[x, 0, z]}>
                        <mesh position={[0, 2, 0]}>
                            <boxGeometry args={[0.5, 4, 0.5]} />
                            <meshStandardMaterial color="#d1d5db" roughness={0.8} />
                        </mesh>
                        {/* Yellow bumper at base */}
                        <mesh position={[0, 0.4, 0]}>
                            <boxGeometry args={[0.6, 0.8, 0.6]} />
                            <meshStandardMaterial color="#eab308" roughness={0.6} />
                        </mesh>
                    </group>
                ))
            )}

            {/* Ceiling beams */}
            {[-12, -4, 4, 12].map((z) => (
                <mesh key={`beam-${z}`} position={[0, 4, z]}>
                    <boxGeometry args={[34, 0.3, 0.8]} />
                    <meshStandardMaterial color="#e5e7eb" roughness={0.7} />
                </mesh>
            ))}

            {/* Parking sign */}
            <group position={[0, 3.5, -14]}>
                <mesh>
                    <boxGeometry args={[2, 2, 0.1]} />
                    <meshStandardMaterial color="#2563eb" roughness={0.4} />
                </mesh>
                <Text position={[0, 0, 0.06]} fontSize={SCENE_TEXT.buildingSign} color="#ffffff" anchorX="center" anchorY="middle" font={undefined}>
                    P
                </Text>
            </group>

            {/* Parked vehicles (static boxes as other cars) */}
            {[[-8, -6], [-5, -6], [5, -6], [8, -6], [-8, 8], [-5, 8]].map(([x, z], i) => (
                <group key={`parked-${i}`} position={[x, 0, z]}>
                    <mesh position={[0, 0.5, 0]}>
                        <boxGeometry args={[1.8, 0.5, 4]} />
                        <meshStandardMaterial color={['#374151', '#1e3a5f', '#4c1d95', '#7f1d1d', '#1e3a5f', '#374151'][i]} roughness={0.3} metalness={0.6} />
                    </mesh>
                    <mesh position={[0, 1.1, -0.2]}>
                        <boxGeometry args={[1.6, 0.8, 2.2]} />
                        <meshStandardMaterial color={['#1f2937', '#1e3a5f', '#3b0764', '#450a0a', '#1e3a5f', '#1f2937'][i]} roughness={0.3} metalness={0.5} />
                    </mesh>
                </group>
            ))}
        </group>
    );
}

function CityRoadScene() {
  useUiLanguage();
    const buildings = useMemo(() => {
        const items: { x: number; z: number; w: number; d: number; h: number; color: string }[] = [];
        const colors = ['#5c6370', '#6b7280', '#4a5568', '#78716c', '#57534e', '#64748b', '#475569'];
        for (let side = -1; side <= 1; side += 2) {
            let z = -50;
            while (z < 50) {
                const w = 6 + Math.random() * 8;
                const d = 8 + Math.random() * 6;
                const h = 8 + Math.random() * 20;
                const gap = Math.random() * 2;
                items.push({
                    x: side * (10 + d / 2 + Math.random() * 3),
                    z: z + w / 2,
                    w, d, h,
                    color: colors[Math.floor(Math.random() * colors.length)]
                });
                z += w + gap + 1;
            }
        }
        return items;
    }, []);

    const trees = useMemo(() => {
        const items: { x: number; z: number; h: number }[] = [];
        for (let side = -1; side <= 1; side += 2) {
            for (let i = -5; i <= 5; i++) {
                items.push({
                    x: side * 8.5,
                    z: i * 9 + (Math.random() - 0.5) * 2,
                    h: 2.5 + Math.random() * 1.5
                });
            }
        }
        return items;
    }, []);

    const streetLamps = useMemo(() => {
        const items: { x: number; z: number }[] = [];
        for (let side = -1; side <= 1; side += 2) {
            for (let i = -4; i <= 4; i++) {
                items.push({ x: side * 6.8, z: i * 12 });
            }
        }
        return items;
    }, []);

    return (
        <group>
            {/* Main road surface */}
            <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, 0]} receiveShadow>
                <planeGeometry args={[14, 120]} />
                <meshStandardMaterial color="#3a3a3a" roughness={0.85} metalness={0.02} />
            </mesh>

            {/* Sidewalks */}
            {[-1, 1].map((side) => (
                <group key={`sidewalk-${side}`}>
                    <mesh position={[side * 8.5, 0.06, 0]} receiveShadow>
                        <boxGeometry args={[5, 0.12, 120]} />
                        <meshStandardMaterial color="#9ca3af" roughness={0.7} />
                    </mesh>
                    <mesh position={[side * 6.1, 0.06, 0]}>
                        <boxGeometry args={[0.2, 0.14, 120]} />
                        <meshStandardMaterial color="#d1d5db" roughness={0.6} />
                    </mesh>
                </group>
            ))}

            {/* Center dashed line */}
            {Array.from({ length: 30 }).map((_, i) => (
                <mesh key={`center-${i}`} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, i * 4 - 58]}>
                    <planeGeometry args={[0.15, 2.5]} />
                    <meshStandardMaterial color="#ffffff" emissive="#ffffff" emissiveIntensity={0.1} />
                </mesh>
            ))}

            {/* Edge lines */}
            {[-1, 1].map((side) => (
                <mesh key={`edge-${side}`} rotation={[-Math.PI / 2, 0, 0]} position={[side * 5.8, 0.01, 0]}>
                    <planeGeometry args={[0.15, 120]} />
                    <meshStandardMaterial color="#facc15" emissive="#facc15" emissiveIntensity={0.05} />
                </mesh>
            ))}

            {/* Lane lines */}
            {[-1, 1].map((side) =>
                Array.from({ length: 30 }).map((_, i) => (
                    <mesh key={`lane-${side}-${i}`} rotation={[-Math.PI / 2, 0, 0]} position={[side * 2.9, 0.01, i * 4 - 58]}>
                        <planeGeometry args={[0.12, 2]} />
                        <meshStandardMaterial color="#e5e7eb" />
                    </mesh>
                ))
            )}

            {/* Buildings */}
            {buildings.map((b, i) => (
                <group key={`bld-${i}`} position={[b.x, b.h / 2, b.z]}>
                    <mesh castShadow receiveShadow>
                        <boxGeometry args={[b.d, b.h, b.w]} />
                        <meshStandardMaterial color={b.color} roughness={0.75} metalness={0.1} />
                    </mesh>
                    {Array.from({ length: Math.floor(b.h / 3) }).map((_, row) => (
                        <mesh key={`win-${row}`} position={[b.d / 2 + 0.01, -b.h / 2 + row * 3 + 2, 0]}>
                            <planeGeometry args={[0.01, 1.2]} />
                            <meshBasicMaterial color="#fef9c3" transparent opacity={0.6} />
                        </mesh>
                    ))}
                </group>
            ))}

            {/* Trees */}
            {trees.map((t, i) => (
                <group key={`tree-${i}`} position={[t.x, 0, t.z]}>
                    <mesh position={[0, t.h / 2, 0]} castShadow>
                        <cylinderGeometry args={[0.08, 0.12, t.h, 8]} />
                        <meshStandardMaterial color="#78350f" roughness={0.9} />
                    </mesh>
                    <mesh position={[0, t.h + 0.8, 0]} castShadow>
                        <sphereGeometry args={[1.2, 12, 10]} />
                        <meshStandardMaterial color="#166534" roughness={0.8} />
                    </mesh>
                </group>
            ))}

            {/* Street lamps */}
            {streetLamps.map((lamp, i) => (
                <group key={`lamp-${i}`} position={[lamp.x, 0, lamp.z]}>
                    <mesh position={[0, 2.5, 0]}>
                        <cylinderGeometry args={[0.04, 0.06, 5, 8]} />
                        <meshStandardMaterial color="#374151" metalness={0.6} roughness={0.3} />
                    </mesh>
                    <mesh position={[0, 5.1, 0]}>
                        <sphereGeometry args={[0.15, 8, 8]} />
                        <meshBasicMaterial color="#fef3c7" />
                    </mesh>
                    <pointLight position={[0, 4.8, 0]} intensity={0.3} distance={8} color="#fef3c7" />
                </group>
            ))}

            {/* Traffic lights */}
            <group position={[7, 0, 0]}>
                <mesh position={[0, 3, 0]}>
                    <cylinderGeometry args={[0.06, 0.06, 6, 8]} />
                    <meshStandardMaterial color="#374151" metalness={0.5} />
                </mesh>
                <mesh position={[0, 5.8, 0]}>
                    <boxGeometry args={[0.5, 1.4, 0.3]} />
                    <meshStandardMaterial color="#1f2937" />
                </mesh>
                <mesh position={[0, 6.2, 0.16]}>
                    <circleGeometry args={[0.12, 16]} />
                    <meshBasicMaterial color="#ef4444" />
                </mesh>
                <mesh position={[0, 5.8, 0.16]}>
                    <circleGeometry args={[0.12, 16]} />
                    <meshBasicMaterial color="#eab308" />
                </mesh>
                <mesh position={[0, 5.4, 0.16]}>
                    <circleGeometry args={[0.12, 16]} />
                    <meshBasicMaterial color="#22c55e" />
                </mesh>
            </group>

            {/* Crosswalk */}
            {Array.from({ length: 8 }).map((_, i) => (
                <mesh key={`xwalk-${i}`} rotation={[-Math.PI / 2, 0, 0]} position={[i * 1.4 - 4.9, 0.015, 15]}>
                    <planeGeometry args={[0.7, 4]} />
                    <meshStandardMaterial color="#ffffff" emissive="#ffffff" emissiveIntensity={0.05} />
                </mesh>
            ))}
        </group>
    );
}

function RainEffect() {
  useUiLanguage();
    const count = 1000;
    const mesh = useRef<THREE.InstancedMesh>(null);
    const dummy = useMemo(() => new THREE.Object3D(), []);
    
    // Static rain particles for now (animated shader would be better but keeping it simple)
    const particles = useMemo(() => {
        const temp = [];
        for (let i = 0; i < count; i++) {
            const x = (Math.random() - 0.5) * 20;
            const y = Math.random() * 10;
            const z = (Math.random() - 0.5) * 20;
            temp.push({ x, y, z });
        }
        return temp;
    }, []);

    useFrame(() => {
        if (!mesh.current) return;
        particles.forEach((p, i) => {
            p.y -= 0.2;
            if (p.y < 0) p.y = 10;
            dummy.position.set(p.x, p.y, p.z);
            dummy.scale.set(0.02, 0.4, 0.02);
            dummy.updateMatrix();
            mesh.current!.setMatrixAt(i, dummy.matrix);
        });
        mesh.current.instanceMatrix.needsUpdate = true;
    });

    return (
        <instancedMesh ref={mesh} args={[undefined, undefined, count]}>
            <boxGeometry />
            <meshBasicMaterial color="#a5f3fc" transparent opacity={0.6} />
        </instancedMesh>
    )
}

function SnowEffect() {
  useUiLanguage();
    const count = 500;
    const mesh = useRef<THREE.InstancedMesh>(null);
    const dummy = useMemo(() => new THREE.Object3D(), []);
    
    const particles = useMemo(() => {
        const temp = [];
        for (let i = 0; i < count; i++) {
            const x = (Math.random() - 0.5) * 20;
            const y = Math.random() * 10;
            const z = (Math.random() - 0.5) * 20;
            temp.push({ x, y, z, speed: Math.random() * 0.05 + 0.02 });
        }
        return temp;
    }, []);

    useFrame(() => {
        if (!mesh.current) return;
        particles.forEach((p, i) => {
            p.y -= p.speed;
            if (p.y < 0) p.y = 10;
            dummy.position.set(p.x, p.y, p.z);
            dummy.scale.set(0.05, 0.05, 0.05);
            dummy.rotation.x += 0.01;
            dummy.updateMatrix();
            mesh.current!.setMatrixAt(i, dummy.matrix);
        });
        mesh.current.instanceMatrix.needsUpdate = true;
    });

    return (
        <instancedMesh ref={mesh} args={[undefined, undefined, count]}>
            <sphereGeometry args={[1, 6, 6]} />
            <meshBasicMaterial color="#fff" />
        </instancedMesh>
    )
}

function CarModel({ state, driverState, passengers }: any) {
  useUiLanguage();
    if (!state || !state.windows) return null;
    const lightsOn = state.lights.brightness > 0;
    
    return (
        <group>
            {/* Chassis */}
            <mesh position={[0, 0.5, 0]} castShadow receiveShadow>
                <boxGeometry args={[2, 0.5, 4.5]} />
                <meshStandardMaterial color="#3b82f6" roughness={0.3} metalness={0.7} />
            </mesh>

            {/* Cabin */}
            <group position={[0, 1.2, -0.2]}>
                <mesh castShadow receiveShadow>
                    <boxGeometry args={[1.8, 1, 2.5]} />
                    <meshStandardMaterial color="#1e40af" roughness={0.3} />
                </mesh>
                
                {/* Windows (Animated) */}
                <mesh position={[0.91, 0.1 - (state.windows.fl / 100) * 0.4, 0.5]}>
                    <boxGeometry args={[0.02, 0.8, 1]} />
                    <meshStandardMaterial color="#93c5fd" transparent opacity={0.6} />
                </mesh>
                <mesh position={[-0.91, 0.1 - (state.windows.fr / 100) * 0.4, 0.5]}>
                    <boxGeometry args={[0.02, 0.8, 1]} />
                    <meshStandardMaterial color="#93c5fd" transparent opacity={0.6} />
                </mesh>
            </group>

            {/* Wheels */}
            <Wheel position={[1, 0.35, 1.5]} />
            <Wheel position={[-1, 0.35, 1.5]} />
            <Wheel position={[1, 0.35, -1.5]} />
            <Wheel position={[-1, 0.35, -1.5]} />

            {/* Headlights */}
            <mesh position={[0.6, 0.5, 2.26]}>
                <boxGeometry args={[0.4, 0.2, 0.1]} />
                <meshStandardMaterial color={lightsOn ? "#fbbf24" : "#555"} emissive={lightsOn ? "#fbbf24" : "#000"} emissiveIntensity={lightsOn ? 2 : 0} />
            </mesh>
            <mesh position={[-0.6, 0.5, 2.26]}>
                <boxGeometry args={[0.4, 0.2, 0.1]} />
                <meshStandardMaterial color={lightsOn ? "#fbbf24" : "#555"} emissive={lightsOn ? "#fbbf24" : "#000"} emissiveIntensity={lightsOn ? 2 : 0} />
            </mesh>
            
            {/* Driver Avatar (Inside) */}
            <PassengerModel passenger={{ seat: 'driver', state: driverState }} />

            {/* Other Passengers */}
            {passengers?.map((p: any) => (
                 <PassengerModel key={p.id} passenger={p} />
            ))}
        </group>
    );
}

function PassengerModel({ passenger, scale = 1 }: any) {
  useUiLanguage();
    const { state } = passenger;
    // Default pos is overridden by parent group
    const pos: [number, number, number] = [0, 0, 0]; 

    const color = state.emotion === 'happy' ? '#86efac' : 
                  state.emotion === 'angry' ? '#fca5a5' : 
                  state.emotion === 'drowsy' ? '#c084fc' : '#e5e7eb';

    return (
        <group position={pos} scale={scale}>
            {/* Head */}
            <mesh>
                <sphereGeometry args={[0.25, 16, 16]} />
                <meshStandardMaterial color={color} />
            </mesh>
            {/* Eyes */}
            <mesh position={[0.1, 0.05, 0.2]}>
                <sphereGeometry args={[0.05]} />
                <meshStandardMaterial color="black" />
            </mesh>
            <mesh position={[-0.1, 0.05, 0.2]}>
                <sphereGeometry args={[0.05]} />
                <meshStandardMaterial color="black" />
            </mesh>
            
            {/* Emotion Bubble */}
            {state.emotion !== 'neutral' && (
                <Float speed={2} rotationIntensity={0} floatIntensity={0.5}>
                    <Text position={[0, 0.6, 0]} fontSize={SCENE_TEXT.emotionLabel} color={color} outlineWidth={0.01} outlineColor="black" anchorX="center" anchorY="middle">
                        {state.emotion.toUpperCase()}
                    </Text>
                </Float>
            )}
        </group>
    );
}

function Wheel({ position }: { position: [number, number, number] }) {
  useUiLanguage();
    return (
        <mesh position={position} rotation={[0, 0, Math.PI / 2]} castShadow>
            <cylinderGeometry args={[0.35, 0.35, 0.2, 32]} />
            <meshStandardMaterial color="#1f2937" />
        </mesh>
    );
}

function DroneModel({ state }: any) {
  useUiLanguage();
    const isFlying = state.status === 'flying';
    const altitude = state.altitude || 0;
    
    // Animation for propellers
    const propRef = useRef<THREE.Group>(null);
    useFrame((_, delta) => {
        if (isFlying && propRef.current) {
            propRef.current.rotation.y += delta * 10;
        }
    });

    return (
        <group position={[0, isFlying ? Math.max(1, altitude / 2) : 0.2, 0]}>
             <Float speed={isFlying ? 2 : 0} rotationIntensity={isFlying ? 0.5 : 0} floatIntensity={isFlying ? 0.5 : 0}>
                <Text position={[0, 1, 0]} fontSize={SCENE_TEXT.entityLabel} color="black">
                    Survey Drone
                </Text>
                
                {/* Body */}
                <mesh castShadow>
                    <boxGeometry args={[0.5, 0.2, 0.5]} />
                    <meshStandardMaterial color="#0ea5e9" />
                </mesh>
                
                {/* Arms */}
                <mesh rotation={[0, Math.PI/4, 0]}>
                    <boxGeometry args={[1.5, 0.05, 0.05]} />
                    <meshStandardMaterial color="#333" />
                </mesh>
                <mesh rotation={[0, -Math.PI/4, 0]}>
                    <boxGeometry args={[1.5, 0.05, 0.05]} />
                    <meshStandardMaterial color="#333" />
                </mesh>

                {/* Propellers */}
                <group ref={propRef}>
                    <Propeller position={[0.5, 0.1, 0.5]} />
                    <Propeller position={[-0.5, 0.1, -0.5]} />
                    <Propeller position={[0.5, 0.1, -0.5]} />
                    <Propeller position={[-0.5, 0.1, 0.5]} />
                </group>
            </Float>
        </group>
    );
}

function Propeller({ position }: { position: [number, number, number] }) {
  useUiLanguage();
    return (
        <mesh position={position}>
            <cylinderGeometry args={[0.3, 0.3, 0.02, 4]} />
            <meshStandardMaterial color="#ccc" transparent opacity={0.8} />
        </mesh>
    );
}

function RobotModel({ state }: any) {
  useUiLanguage();
    const x = state.pose?.x || 0;
    const y = state.pose?.y || 0;
    
    // Convert 2D pose to 3D position (mock mapping)
    // Scale down movement for scene
    const posX = x * 0.5;
    const posZ = y * 0.5;

    return (
        <group position={[posX, 0, posZ]}>
            <Text position={[0, 1.5, 0]} fontSize={SCENE_TEXT.entityLabel} color="black">
                UGV-01
            </Text>
            
            {/* Base */}
            <mesh position={[0, 0.25, 0]} castShadow>
                <boxGeometry args={[0.8, 0.5, 1]} />
                <meshStandardMaterial color="#f97316" />
            </mesh>
            
            {/* Wheels */}
            <Wheel position={[0.45, 0.2, 0.3]} />
            <Wheel position={[-0.45, 0.2, 0.3]} />
            <Wheel position={[0.45, 0.2, -0.3]} />
            <Wheel position={[-0.45, 0.2, -0.3]} />
            
            {/* Head/Gripper */}
            <group position={[0, 0.6, 0.3]}>
                <mesh>
                    <boxGeometry args={[0.4, 0.4, 0.4]} />
                    <meshStandardMaterial color="#333" />
                </mesh>
                {/* Gripper Arms */}
                <mesh position={[0.1 + (state.gripper/100)*0.1, 0, 0.25]}>
                    <boxGeometry args={[0.05, 0.2, 0.3]} />
                    <meshStandardMaterial color="#aaa" />
                </mesh>
                <mesh position={[-0.1 - (state.gripper/100)*0.1, 0, 0.25]}>
                    <boxGeometry args={[0.05, 0.2, 0.3]} />
                    <meshStandardMaterial color="#aaa" />
                </mesh>
            </group>
        </group>
    );
}
