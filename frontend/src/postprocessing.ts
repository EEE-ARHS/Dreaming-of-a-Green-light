import type { Camera, Scene, WebGLRenderer } from "three";
import { Vector2 } from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { RenderPixelatedPass } from "three/examples/jsm/postprocessing/RenderPixelatedPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { ENGINE_CONFIG } from "./config";

export interface ScenePostProcessing {
  render: (deltaSeconds: number) => void;
  resize: (width: number, height: number) => void;
  dispose: () => void;
}

export function createScenePostProcessing(
  renderer: WebGLRenderer,
  scene: Scene,
  camera: Camera,
  bloomEnabled: boolean,
): ScenePostProcessing {
  const settings = ENGINE_CONFIG.rendering.carGamePostProcessing;
  const composer = new EffectComposer(renderer);
  const renderPass = new RenderPass(scene, camera);
  const pixelPass = new RenderPixelatedPass(settings.pixelSize, scene, camera, {
    normalEdgeStrength: 0.22,
    depthEdgeStrength: 0.18,
  });
  const bloomPass = new UnrealBloomPass(
    new Vector2(window.innerWidth, window.innerHeight),
    settings.bloomStrength,
    settings.bloomRadius,
    settings.bloomThreshold,
  );
  bloomPass.enabled = bloomEnabled;
  const outputPass = new OutputPass();
  composer.addPass(renderPass);
  composer.addPass(pixelPass);
  composer.addPass(bloomPass);
  composer.addPass(outputPass);

  return {
    render: (deltaSeconds) => composer.render(deltaSeconds),
    resize(width, height) {
      composer.setSize(width, height);
    },
    dispose() {
      for (const pass of composer.passes) pass.dispose();
      composer.dispose();
    },
  };
}
