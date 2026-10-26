import { useEffect, useMemo, useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { ENGINE_CONFIG } from "./config";

function SceneElements() {
  const arches = useRef<THREE.Group>(null);
  const pointerTarget = useRef({ x: 0, y: 0 });
  const pointer = useRef({ x: 0, y: 0 });

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
  const stars = useMemo(() => {
    const points = new Float32Array(420 * 3);
    for (let index = 0; index < 420; index += 1) {
      const seed = index + 1;
      points[index * 3] = Math.sin(seed * 127.1) * 18;
      points[index * 3 + 1] = 3 + (Math.sin(seed * 78.2) * 0.5 + 0.5) * 13;
      points[index * 3 + 2] = -18 - (Math.sin(seed * 39.4) * 0.5 + 0.5) * 22;
    }
    return points;
  }, []);
  const skyline = useMemo(() => Array.from({ length: 19 }, (_, index) => ({
    x: (index - 9) * 2.8,
    width: 1.5 + (index * 7 % 5) * 0.14,
    height: 2.4 + (index * 13 % 8) * 0.58,
    depth: 1.6 + (index * 3 % 4) * 0.22,
  })), []);

  useFrame(({ camera, clock }, delta) => {
    const time = clock.elapsedTime;
    const smoothing = 1 - Math.exp(-delta * 3.5);
    pointer.current.x += (pointerTarget.current.x - pointer.current.x) * smoothing;
    pointer.current.y += (pointerTarget.current.y - pointer.current.y) * smoothing;
    camera.position.x = Math.sin(time * 0.11) * 0.28 + pointer.current.x * 0.85;
    camera.position.y = 4.2 + Math.sin(time * 0.16) * 0.08 + pointer.current.y * 0.42;
    camera.position.z = 15 - Math.min(time * 0.12, 0.8);
    camera.lookAt(pointer.current.x * 0.7, 2.1 + pointer.current.y * 0.25, -2);
    if (arches.current) arches.current.rotation.y = Math.sin(time * 0.12) * 0.035;
  });

  return <>
    <color attach="background" args={["#07090e"]} />
    <fog attach="fog" args={["#07090e", 18, 52]} />
    <ambientLight intensity={0.45} color="#9caac5" />
    <directionalLight position={[-5, 9, 5]} intensity={1.15} color="#c8d8f2" />
    <pointLight position={[0, 4, 1]} intensity={26} distance={18} color="#c5a66b" />
    <mesh position={[-7, 8, -24]}>
      <sphereGeometry args={[2.1, 24, 24]} />
      <meshBasicMaterial color="#d8d5c9" />
    </mesh>
    <points>
      <bufferGeometry><bufferAttribute attach="attributes-position" args={[stars, 3]} /></bufferGeometry>
      <pointsMaterial color="#cdd6e7" size={0.045} sizeAttenuation transparent opacity={0.72} />
    </points>
    {skyline.map((building, index) => <mesh key={index} position={[building.x, building.height / 2, -17 - building.depth / 2]}>
      <boxGeometry args={[building.width, building.height, building.depth]} />
      <meshStandardMaterial color={index % 3 === 0 ? "#171b25" : "#10141d"} roughness={0.92} metalness={0.12} />
    </mesh>)}
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.08, -5]}>
      <planeGeometry args={[200, 200]} />
      <meshStandardMaterial color="#10131a" roughness={0.34} metalness={0.42} />
    </mesh>
    <group ref={arches} position={[0, 3.1, -3]}>
      <mesh scale={[0.76, 1.15, 1]}>
        <torusGeometry args={[2.35, 0.045, 8, 96]} />
        <meshStandardMaterial color="#bca16b" emissive="#45351d" metalness={0.82} roughness={0.3} />
      </mesh>
      <mesh scale={[1.04, 1.42, 1]}>
        <torusGeometry args={[2.35, 0.018, 6, 96]} />
        <meshStandardMaterial color="#746647" metalness={0.78} roughness={0.35} />
      </mesh>
    </group>
  </>;
}

export function TitleScene() {
  return <Canvas className="title-scene-canvas" dpr={[1, ENGINE_CONFIG.rendering.pixelRatioLimit]} camera={{ position: [0, 4.2, 15], fov: 42, near: 0.1, far: 100 }} gl={{ antialias: false, alpha: false, powerPreference: "low-power" }}>
    <SceneElements />
  </Canvas>;
}
