import { useCallback, useRef } from "react";
import type { RefObject } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import type { RootState } from "@react-three/fiber";
import * as THREE from "three";
import { ENGINE_CONFIG } from "./config";
import "./style.css";
import "../../title-screen/assets/title-screen.css";

interface RuntimeCanvasProps {
  initialChapterId: string;
  onReady: () => void;
  onError: (message: string) => void;
}

function RuntimeLoop({ renderFrame }: { renderFrame: RefObject<((now: number, delta: number) => void) | null> }) {
  useFrame((state, delta) => renderFrame.current?.(state.clock.elapsedTime * 1000, delta), -1);
  return null;
}

export function RuntimeCanvas({ initialChapterId, onReady, onError }: RuntimeCanvasProps) {
  const renderFrame = useRef<((now: number, delta: number) => void) | null>(null);
  const initialized = useRef(false);

  const handleCreated = useCallback((state: RootState) => {
    if (initialized.current) return;
    initialized.current = true;
    state.gl.shadowMap.type = THREE.PCFSoftShadowMap;
    state.gl.toneMapping = THREE.ACESFilmicToneMapping;
    state.gl.toneMappingExposure = ENGINE_CONFIG.rendering.toneMappingExposure;
    void import("./runtime").then(({ startRuntime }) => {
      renderFrame.current = startRuntime(state, initialChapterId, onReady);
    }).catch((error: unknown) => {
      console.error(error);
      onError(error instanceof Error ? error.message : String(error));
    });
  }, [initialChapterId, onError, onReady]);

  return <Canvas
    className="r3f-canvas"
    dpr={[1, ENGINE_CONFIG.rendering.pixelRatioLimit]}
    shadows
    gl={{ antialias: ENGINE_CONFIG.rendering.antialias, stencil: false, preserveDrawingBuffer: false, powerPreference: ENGINE_CONFIG.rendering.powerPreference }}
    camera={{ fov: ENGINE_CONFIG.camera.defaultFov, near: 0.18, far: 1200, position: [ENGINE_CONFIG.camera.driverPos.x, ENGINE_CONFIG.camera.driverPos.y, ENGINE_CONFIG.camera.driverPos.z] }}
    onCreated={handleCreated}
    aria-label="3D night driving scene"
  >
    <RuntimeLoop renderFrame={renderFrame} />
  </Canvas>;
}
