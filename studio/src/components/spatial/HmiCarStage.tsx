import { uiText, useUiLanguage } from '@/i18n';
import { AppIcon } from '@/components/ui/AppIcon';
import { Component, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Html, Environment, MeshReflectorMaterial, OrbitControls, useGLTF } from '@react-three/drei';
import * as THREE from 'three';

import type { WindowKey } from '@/domain/vehicleWorld';
import { activeCarRig } from '@/data/activeCarRig';
import { prepareCarRig, disposeCarRig, type CarRig } from '@/domain/carRig';

type Props = { rig?: CarRig; windows: Record<WindowKey, number>; night: boolean; onError: () => void; locked: boolean; onUnlock: () => void };

class CarBoundary extends Component<{ children: ReactNode; onError: () => void }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch() { this.props.onError(); }
  render() { return this.state.failed ? null : this.props.children; }
}

const DOOR_NAMES = { fl: '左前门', fr: '右前门', rl: '左后门', rr: '右后门' };

function Vehicle({ windows, locked, onUnlock, rig }: Pick<Props, 'windows' | 'locked' | 'onUnlock'> & { rig: CarRig }) {
  useUiLanguage();
  const { scene } = useGLTF(rig.model, false, true);
  const windowRefs = useRef<Partial<Record<WindowKey, THREE.Mesh[]>>>({});
  const [opened, setOpened] = useState<Record<WindowKey, boolean>>({ fl: false, fr: false, rl: false, rr: false });
  const doorRefs = useRef<Partial<Record<WindowKey, THREE.Group>>>({});
  const icons = useRef<Partial<Record<WindowKey, HTMLDivElement>>>({});
  const prepared = useMemo(() => prepareCarRig(scene, rig), [scene, rig]);
  const parts = prepared.parts;
  const doorKeys = (Object.keys(rig.doors) as WindowKey[]).filter(key => prepared.doors[key]);
  const previousLock = useRef(locked);
  useEffect(() => {
    if (locked && !previousLock.current) setOpened({ fl: false, fr: false, rl: false, rr: false });
    previousLock.current = locked;
  }, [locked]);
  useFrame(({ camera }, delta) => {
    for (const key of doorKeys) {
      const group = doorRefs.current[key];
      const binding = rig.doors[key]!;
      if (group) group.rotation[binding.axis] = THREE.MathUtils.damp(group.rotation[binding.axis], opened[key] ? binding.angle : 0, 9, delta);
      const icon = icons.current[key];
      if (icon) icon.style.visibility = (binding.side === 'left' ? camera.position.x > .15 : camera.position.x < -.15) ? 'visible' : 'hidden';
    }
  });
  useEffect(() => {
    for (const [key, meshes] of Object.entries(windowRefs.current)) {
      const binding = rig.windows[key as WindowKey];
      if (!binding || !prepared.windows[key as WindowKey]) continue;
      const value = windows[key as WindowKey] / 100;
      meshes?.forEach(mesh => mesh.position.set(...binding.travel.map(v => v * value) as [number, number, number]));
    }
  }, [windows, rig, prepared]);
  useEffect(() => () => disposeCarRig(prepared), [prepared]);
  // Multiple meshes may form a window. Ref detach removes stale parts after a rig change.
  const renderPart = (part: typeof parts[number], i: number) => <mesh key={i} geometry={part.geometry} material={part.material} castShadow receiveShadow ref={mesh => {
    if (!part.window) return;
    const list = windowRefs.current[part.window] ?? [];
    windowRefs.current[part.window] = mesh ? [...list.filter(m => m.geometry !== part.geometry), mesh] : list.filter(m => m.geometry !== part.geometry);
  }} />;
  return <group>
    {parts.filter(part => !part.door).map(renderPart)}
    {doorKeys.map(key => <group key={key} position={rig.doors[key]!.pivot} ref={group => { if (group) doorRefs.current[key] = group; }}>
      {parts.filter(part => part.door === key).map(renderPart)}
      <Html position={rig.doors[key]!.hotspot} center zIndexRange={[4, 1]}>
        <div ref={element => { if (element) icons.current[key] = element; }}>
          <button className="hmi-door-hotspot" aria-label={uiText(opened[key] ? "关闭{0}" : "打开{0}", [uiText(DOOR_NAMES[key])])} aria-pressed={opened[key]} title={uiText(opened[key] ? "关闭{0}" : "打开{0}", [uiText(DOOR_NAMES[key])])} onPointerDown={event => event.stopPropagation()} onClick={event => { event.stopPropagation(); if (!opened[key]) onUnlock(); setOpened(old => ({ ...old, [key]: !old[key] })); }}>
            <AppIcon name={opened[key] ? 'door-open' : 'door-closed'} size={17} />
          </button>
        </div>
      </Html>
    </group>)}
  </group>;
}

// OrbitControls rotates the camera. Keep the lighting rig on the viewing side,
// at a fixed distance from the car so zooming cannot move the pool of light away.
function VehicleLighting({ night }: { night: boolean }) {
  useUiLanguage();
  const rig = useRef<THREE.Group>(null);
  const target = useMemo(() => {
    const object = new THREE.Object3D();
    object.position.set(0, .65, 0);
    return object;
  }, []);
  useFrame(({ camera }) => {
    if (rig.current) rig.current.rotation.y = Math.atan2(camera.position.x, camera.position.z);
  }, -.5);
  return <>
    <primitive object={target} />
    <group ref={rig}>
      {/* Back light traces the roof/shoulder; a weaker front fill keeps the paint readable. */}
      <spotLight position={[-3.8, 4.5, -4]} target={target} intensity={night ? 110 : 145} angle={.7} penumbra={1} color="#c6e5fa" castShadow shadow-mapSize={[1024, 1024]} shadow-bias={-.0001} />
      <spotLight position={[-3, 4, 5]} target={target} intensity={night ? 55 : 75} angle={.7} penumbra={1} color="#e4edf2" />
      <directionalLight position={[3, 3, -5]} target={target} intensity={2.2} color="#b6d9f2" />
      <directionalLight position={[4, 2, 5]} target={target} intensity={.45} color="#d6e5eb" />
      <StudioBackdrop />
    </group>
  </>;
}

// The main camera sees the backdrop; the planar reflection camera keeps layer 0.
// Excluding the blue wall preserves the dark water and the vehicle silhouette.
// Its floor-level blue glow fades vertically to black; it never overlays the body or UI.
function StudioBackdrop() {
  useUiLanguage();
  const camera = useThree(state => state.camera);
  useEffect(() => {
    const alreadyEnabled = camera.layers.isEnabled(1);
    camera.layers.enable(1);
    return () => { if (!alreadyEnabled) camera.layers.disable(1); };
  }, [camera]);
  const uniforms = useMemo(() => ({
    baseColor: { value: new THREE.Color('#030609') },
    glowColor: { value: new THREE.Color('#437c9f') },
  }), []);
  return <mesh position={[0, 8.965, -2.9]} ref={mesh => { if (mesh) mesh.layers.set(1); }} renderOrder={-1}>
    <planeGeometry args={[36, 18]} />
    <shaderMaterial uniforms={uniforms} toneMapped={false}
      vertexShader={`varying vec2 backdropUv;
        void main() { backdropUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`}
      fragmentShader={`varying vec2 backdropUv;
        uniform vec3 baseColor;
        uniform vec3 glowColor;
        void main() {
          vec2 distanceToGlow = (backdropUv - vec2(0.5, 0.025)) / vec2(0.29, 0.20);
          float glow = exp(-dot(distanceToGlow, distanceToGlow) * 1.6);
          gl_FragColor = vec4(mix(baseColor, glowColor, glow), 1.0);
          #include <colorspace_fragment>
        }`} />
  </mesh>;
}

// Use the reflected image directly so the floor does not create a lit grey pool.
function configureFloorReflection(material: THREE.Material | null) {
  if (!material || material.userData.blackReflection) return;
  material.userData.blackReflection = true;
  const rippleTime = { value: 0 };
  material.userData.rippleTime = rippleTime;
  const compile = material.onBeforeCompile.bind(material);
  material.onBeforeCompile = (shader, renderer) => {
    compile(shader, renderer);
    shader.uniforms.rippleTime = rippleTime;
    shader.vertexShader = 'varying vec2 waterPosition;\n' + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>',
      '#include <begin_vertex>\nwaterPosition = (modelMatrix * vec4(position, 1.0)).xz;');
    shader.fragmentShader = 'uniform float rippleTime;\nvarying vec2 waterPosition;\n' + shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace('vec4 new_vUv = my_vUv;', `
      vec4 new_vUv = my_vUv;
      float waveA = sin(waterPosition.x * 4.2 + waterPosition.y * 2.7 - rippleTime * 0.65);
      float waveB = sin(waterPosition.y * 7.0 - waterPosition.x * 1.8 + rippleTime * 0.42);
      new_vUv.xy += vec2(waveA * 0.002, (waveA + waveB * 0.45) * 0.003) * new_vUv.w;
    `);
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <opaque_fragment>',
      'outgoingLight = newMerge.rgb * 0.34;\n#include <opaque_fragment>',
    );
  };
  material.customProgramCacheKey = () => 'black-water-reflection-v1';
  material.needsUpdate = true;
}

function WaterReflectionFloor() {
  useUiLanguage();
  const floor = useRef<THREE.Mesh>(null);
  const reducedMotion = useMemo(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches, []);
  useFrame(({ clock }) => {
    const material = floor.current?.material as THREE.Material | undefined;
    const time = material?.userData.rippleTime;
    if (time) time.value = reducedMotion ? 0 : clock.elapsedTime;
  });
  return (
      <mesh ref={floor} rotation={[-Math.PI / 2, 0, 0]} position={[0, -.035, 0]} receiveShadow>
        <planeGeometry args={[160, 160]} />
        {/* A dark mirror keeps the ground black while reflecting the live vehicle. */}
        <MeshReflectorMaterial
          ref={configureFloorReflection}
          resolution={512}
          blur={[24, 12]}
          mixBlur={.55}
          mixStrength={1.3}
          mirror={1}
          color="#777777"
          roughness={.9}
          metalness={0}
          envMapIntensity={0}
        />
      </mesh>
  );
}

// Lower the composition by 20% of the projected vehicle height. Using the
// vehicle (not the whole stage) leaves room for its reflection above the Dock.
function LowerVehicleFraming({ rig }: { rig: CarRig }) {
  useUiLanguage();
  const { scene } = useGLTF(rig.model, false, true);
  const { camera } = useThree();
  const corners = useMemo(() => {
    const box = new THREE.Box3().setFromObject(scene);
    const rotation = new THREE.Matrix4().makeRotationY(rig.rotationY);
    return [box.min.x, box.max.x].flatMap(x =>
      [box.min.y, box.max.y].flatMap(y =>
        [box.min.z, box.max.z].map(z => new THREE.Vector3(x, y, z).applyMatrix4(rotation))));
  }, [scene, rig.rotationY]);
  const projected = useMemo(() => new THREE.Vector3(), []);
  useEffect(() => () => {
    if (camera instanceof THREE.PerspectiveCamera) camera.clearViewOffset();
  }, [camera]);
  useFrame(({ camera, size }) => {
    if (!(camera instanceof THREE.PerspectiveCamera) || !size.width || !size.height) return;
    camera.clearViewOffset();
    let minY = Infinity;
    let maxY = -Infinity;
    for (const corner of corners) {
      const y = projected.copy(corner).project(camera).y;
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
    }
    const vehicleHeight = (maxY - minY) * size.height / 2;
    camera.setViewOffset(size.width, size.height, 0, -vehicleHeight * .2, size.width, size.height);
  }, -.25);
  return null;
}

export function HmiCarStage({ windows, night, onError, locked, onUnlock, rig = activeCarRig }: Props) {
  useUiLanguage();
  return <CarBoundary onError={onError}><Canvas shadows dpr={[1, 1.5]} camera={{ position: [5.4, 2.5, 5.4], fov: 35 }} gl={{ alpha: true, antialias: true, localClippingEnabled: true }}>
    <fog attach="fog" args={['#050505', 10, 30]} />
    <ambientLight intensity={night ? .18 : .25} />
    <hemisphereLight args={['#e5e5e5', '#050505', .4]} />
    <VehicleLighting night={night} />
    <Suspense fallback={null}>
      <LowerVehicleFraming rig={rig} />
      {rig.environment && <Environment files={rig.environment} environmentIntensity={.32} />}
      <Vehicle key={rig.id} rig={rig} windows={windows} locked={locked} onUnlock={onUnlock} />
      <WaterReflectionFloor />
      {/* Avoid a second shadow plane above the water: it can obscure the reflection. */}
    </Suspense>
    <OrbitControls target={[0, .65, 0]} minDistance={5} maxDistance={12} minPolarAngle={.6} maxPolarAngle={1.5} enablePan={false} />
  </Canvas></CarBoundary>;
}


