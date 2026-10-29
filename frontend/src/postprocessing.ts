import type { Camera, Scene, WebGLRenderer } from "three";
import { Vector2 } from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { RenderPixelatedPass } from "three/examples/jsm/postprocessing/RenderPixelatedPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass.js";
import { ENGINE_CONFIG } from "./config";

export interface ScenePostProcessing {
  render: (deltaSeconds: number) => void;
  setMotionBlur: (speedRatio: number) => void;
  resize: (width: number, height: number) => void;
  dispose: () => void;
}

export function createScenePostProcessing(
  renderer: WebGLRenderer,
  scene: Scene,
  camera: Camera,
  bloomEnabled: boolean,
  bloomSettings?: { bloomStrength?: number; bloomRadius?: number; bloomThreshold?: number },
): ScenePostProcessing {
  const settings = ENGINE_CONFIG.rendering.carGamePostProcessing;
  const composer = new EffectComposer(renderer);
  const renderPass = new RenderPass(scene, camera);
  const pixelPass = new RenderPixelatedPass(settings.pixelSize, scene, camera, {
    normalEdgeStrength: 0.22,
    depthEdgeStrength: 0.18,
  });
  const effectiveSettings = bloomSettings ? { ...settings, ...bloomSettings } : settings;
  const bloomPass = new UnrealBloomPass(
    new Vector2(window.innerWidth, window.innerHeight),
    effectiveSettings.bloomStrength,
    effectiveSettings.bloomRadius,
    effectiveSettings.bloomThreshold,
  );
  bloomPass.enabled = bloomEnabled;
  const motionBlurPass = new ShaderPass({
    uniforms: {
      tDiffuse: { value: null },
      strength: { value: 0 },
    },
    vertexShader: `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `
      uniform sampler2D tDiffuse;
      uniform float strength;
      varying vec2 vUv;
      void main() {
        vec2 radial = vUv - vec2(0.5);
        float pixelDistance = length(radial);
        vec2 blurStep = normalize(radial + vec2(0.00001)) * strength * (0.12 + pixelDistance * 0.88);
        vec4 color = texture2D(tDiffuse, vUv) * 0.20;
        color += texture2D(tDiffuse, vUv - blurStep * 0.40) * 0.16;
        color += texture2D(tDiffuse, vUv + blurStep * 0.40) * 0.16;
        color += texture2D(tDiffuse, vUv - blurStep * 0.75) * 0.12;
        color += texture2D(tDiffuse, vUv + blurStep * 0.75) * 0.12;
        color += texture2D(tDiffuse, vUv - blurStep) * 0.12;
        color += texture2D(tDiffuse, vUv + blurStep) * 0.12;
        gl_FragColor = color;
      }
    `,
  });
  motionBlurPass.enabled = false;
  const outputPass = new OutputPass();
  composer.addPass(renderPass);
  composer.addPass(pixelPass);
  composer.addPass(bloomPass);
  composer.addPass(motionBlurPass);
  composer.addPass(outputPass);

  return {
    render: (deltaSeconds) => composer.render(deltaSeconds),
    setMotionBlur(speedRatio) {
      motionBlurPass.uniforms.strength.value = Math.max(0, Math.min(1, speedRatio)) * 0.022;
      motionBlurPass.enabled = speedRatio > 0.01;
    },
    resize(width, height) {
      composer.setSize(width, height);
    },
    dispose() {
      for (const pass of composer.passes) pass.dispose();
      composer.dispose();
    },
  };
}
