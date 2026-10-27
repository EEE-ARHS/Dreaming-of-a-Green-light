/**
 * Global Game Configuration
 * Edit these values to change the overall feel and behavior of the engine
 * without modifying the core logic.
 */

export const ENGINE_CONFIG = {
  rendering: {
    pixelRatioLimit: 1.15,
    toneMappingExposure: 1.1,
    antialias: false,
    powerPreference: "high-performance",
    carGamePostProcessing: {
      pixelSize: 3,
      bloomStrength: 0.65,
      bloomRadius: 0.58,
      bloomThreshold: 0.58,
    },
  },
  physics: {
    defaultTimeStep: 1 / 12,
    defaultFriction: 0.85,
    defaultRestitution: 0.05,
  },
  ui: {
    menuRenderInterval: 1000 / 30,
    captionDefaultHold: 4.4,
    captionPriorityHold: 1.4,
  },
  camera: {
    defaultFov: 52.7,
    driverPos: { x: 0, y: 3.1, z: -7.6 },
    driverTarget: { x: 0, y: 1.1, z: 8 },
  }
} as const;

export const THEME_COLORS = {
  primary: "#bc8f8f", // Dusty Rose
  accent: "#d2b48c",  // Tan
  background: "#08090c",
  text: "#f5f5dc",    // Beige
} as const;
