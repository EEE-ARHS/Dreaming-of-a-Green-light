import { useEffect, useMemo, useRef } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { ENGINE_CONFIG } from "./config";

function SceneElements() {
  const lightsRef = useRef<THREE.Group>(null);
  const composerRef = useRef<EffectComposer | null>(null);
  const pointerTarget = useRef({ x: 0, y: 0 });
  const pointer = useRef({ x: 0, y: 0 });
  const { gl, scene, camera, size } = useThree();

  useEffect(() => {
    const composer = new EffectComposer(gl);
    composer.setPixelRatio(gl.getPixelRatio());
    composer.setSize(size.width, size.height);
    composer.addPass(new RenderPass(scene, camera));
    composer.addPass(new UnrealBloomPass(new THREE.Vector2(size.width, size.height), 2.1, 0.9, 0.12));
    composer.addPass(new OutputPass());
    composerRef.current = composer;
    return () => {
      composer.passes.forEach((pass) => pass.dispose());
      composer.dispose();
      composerRef.current = null;
    };
  }, [gl, scene, camera]);

  useEffect(() => {
    composerRef.current?.setSize(size.width, size.height);
  }, [size.width, size.height]);

  useEffect(() => {
    const onPointerMove = (event: PointerEvent) => {
      pointerTarget.current.x = (event.clientX / window.innerWidth) * 2 - 1;
      pointerTarget.current.y = 1 - (event.clientY / window.innerHeight) * 2;
    };
    const resetPointer = () => {
      pointerTarget.current.x = 0;
      pointerTarget.current.y = 0;
    };

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("blur", resetPointer);
    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("blur", resetPointer);
    };
  }, []);
  const ambientLights = useMemo(() => Array.from({ length: 96 }, (_, index) => {
    const seed = index + 1;
    const hue = ["#ffd18a", "#ffb76b", "#d6e4ff", "#8fffd0", "#ffdfb0"][index % 5] ?? "#ffd18a";
    return {
      x: Math.sin(seed * 127.1) * 23,
      y: 0.3 + (Math.sin(seed * 78.2) * 0.5 + 0.5) * 14,
      z: -8 - (Math.sin(seed * 39.4) * 0.5 + 0.5) * 39,
      size: 0.035 + (Math.sin(seed * 21.7) * 0.5 + 0.5) ** 3 * 0.24,
      phase: seed * 1.73,
      hue,
    };
  }), []);

  useFrame(({ camera, clock }, delta) => {
    const time = clock.elapsedTime;
    const smoothing = 1 - Math.exp(-delta * 3.5);
    pointer.current.x += (pointerTarget.current.x - pointer.current.x) * smoothing;
    pointer.current.y += (pointerTarget.current.y - pointer.current.y) * smoothing;
    camera.position.x = Math.sin(time * 0.08) * 0.2 + pointer.current.x * 0.55;
    camera.position.y = 5 + Math.sin(time * 0.12) * 0.12 + pointer.current.y * 0.3;
    camera.position.z = 15 - Math.min(time * 0.06, 0.45);
    camera.lookAt(pointer.current.x * 0.5, 4.2 + pointer.current.y * 0.2, -12);
    lightsRef.current?.children.forEach((light) => {
      const { baseSize, phase } = light.userData as { baseSize: number; phase: number };
      const pulse = 0.88 + Math.sin(time * 0.7 + phase) * 0.12;
      light.scale.setScalar(baseSize * pulse);
    });
    composerRef.current?.render(delta);
  }, 1);

  return <>
    <color attach="background" args={["#03050b"]} />
    <fog attach="fog" args={["#050812", 24, 68]} />
    <ambientLight intensity={0.18} color="#7486a8" />
    <group ref={lightsRef}>
      {ambientLights.map((light, index) => <mesh key={index} position={[light.x, light.y, light.z]} scale={light.size} userData={{ baseSize: light.size, phase: light.phase }}>
        <sphereGeometry args={[1, 10, 10]} />
        <meshBasicMaterial color={light.hue} toneMapped={false} />
      </mesh>)}
    </group>
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.12, -13]}>
      <planeGeometry args={[200, 200]} />
      <meshStandardMaterial color="#080b12" roughness={0.28} metalness={0.5} />
    </mesh>
  </>;
}

export function TitleScene() {
  return <Canvas className="title-scene-canvas" dpr={[1, ENGINE_CONFIG.rendering.pixelRatioLimit]} camera={{ position: [0, 4.2, 15], fov: 42, near: 0.1, far: 100 }} gl={{ antialias: false, alpha: false, powerPreference: "low-power" }}>
    <SceneElements />
  </Canvas>;
}
