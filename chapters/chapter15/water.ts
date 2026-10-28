/**
 * Chapter XV — the water itself.
 *
 * The sea, current, sail response and yacht motion live here as plain numbers,
 * so wave forces can be simulated without a renderer. `ocean.ts`, `boat.ts` and
 * `index.ts` give this model a visible body.
 *
 * The tuning below was balanced against `stepBoat` rather than by eye. A
 * yacht's sail, the ocean current, and wave-driven motion are simulated here.
 */

export interface SeaTuning {
  /** Where the green light stands, and where the boat starts, in metres. */
  lightZ: number;
  startZ: number;
  /** The boat can never come nearer than this to the light. */
  minDistance: number;
  /** Once the boat is this near, the light begins to draw back. */
  retreatNear: number;
  retreatSpan: number;
  retreatSpeed: number;
  retreatLimit: number;
  /**
   * Current in metres per second: a base flow, a surge that grows near the
   * light, and a short steep term that turns the last stretch into a wall.
   */
  currentBase: number;
  currentSurge: number;
  currentRef: number;
  currentWall: number;
  currentWallRef: number;
  currentFloor: number;
  /** Hull resistance: along the keel, and across it. */
  dragLong: number;
  dragLongQuad: number;
  dragLat: number;
  dragLatQuad: number;
  /** Acceleration from the yacht's wind-filled sail. */
  sailImpulse: number;
  /** Steering response and rotational damping. */
  turnRate: number;
  yawDamp: number;
  /** Attitude from wave height around the hull. */
  hullHalfLength: number;
  hullHalfBeam: number;
  trimRoll: number;
}

export const SEA: SeaTuning = {
  lightZ: 16046.44,
  startZ: 0,
  minDistance: 24,
  retreatNear: 52,
  retreatSpan: 26,
  retreatSpeed: 0.55,
  retreatLimit: 40,
  currentBase: 0.9,
  currentSurge: 0.75,
  currentRef: 60,
  currentWall: 1.2,
  currentWallRef: 45,
  currentFloor: 14,
  dragLong: 0.26,
  dragLongQuad: 0.008,
  dragLat: 2.6,
  dragLatQuad: 0.35,
  sailImpulse: 24,
  turnRate: 1.6,
  yawDamp: 1.9,
  hullHalfLength: 1.5,
  hullHalfBeam: 0.45,
  trimRoll: 0.025,
};

export interface BoatState {
  x: number;
  z: number;
  vx: number;
  vz: number;
  /** Radians; zero points at the green light. */
  yaw: number;
  yawRate: number;
}

/** What is driving the yacht this frame. */
export interface SailingInput {
  /** Acceleration along the keel, in metres per second squared. */
  thrust: number;
  /** 0 for no sail pressure, 1 for full wind. */
  effort: number;
  /** -1 (port) to 1 (starboard): requested rudder direction. */
  trim: number;
}

export interface SailPower {
  thrust: number;
  effort: number;
}

/**
 * Convert steady sail power into usable acceleration. Retained as a small pure
 * tuning helper alongside the current and hull model.
 */
export function sailPower(wind: number, trim: number): SailPower {
  const windForce = clamp01(wind);
  const trimEfficiency = 1 - 0.25 * Math.abs(Math.max(-1, Math.min(1, trim)));
  return { thrust: SEA.sailImpulse * windForce * trimEfficiency, effort: windForce };
}

export interface BoatAttitude {
  heave: number;
  pitch: number;
  roll: number;
}

export function clamp01(value: number): number {
  return value < 0 ? 0 : value > 1 ? 1 : value;
}

export function createBoat(): BoatState {
  return { x: 0, z: SEA.startZ, vx: 0, vz: 0, yaw: 0, yawRate: 0 };
}

export function distanceToLight(state: BoatState, lightZ: number): number {
  return Math.hypot(lightZ - state.z, -state.x);
}

/** The current runs against the boat, and strengthens as the light nears. */
export function currentSpeed(distance: number): number {
  const near = Math.max(distance, SEA.currentFloor);
  const surge = (SEA.currentRef / near) ** 2;
  const wall = (SEA.currentWallRef / near) ** 4;
  return SEA.currentBase + SEA.currentSurge * surge + SEA.currentWall * wall;
}

/** The light draws back once the boat is close, never further than its limit. */
export function retreatLight(lightZ: number, distance: number, dt: number): number {
  const proximity = clamp01((SEA.retreatNear + SEA.retreatSpan - distance) / SEA.retreatSpan);
  if (proximity <= 0) return lightZ;
  return Math.min(SEA.lightZ + SEA.retreatLimit, lightZ + SEA.retreatSpeed * proximity * dt);
}

export interface WaveSample {
  height: number;
  slopeX: number;
  slopeZ: number;
}

/**
 * Sum of long swells: the surface the yacht rides. The slope
 * comes along for free so the sea mesh can light itself without recomputing
 * normals every frame.
 */
export function sampleWave(x: number, z: number, time: number, out: WaveSample = { height: 0, slopeX: 0, slopeZ: 0 }): WaveSample {
  let height = 0;
  let slopeX = 0;
  let slopeZ = 0;
  for (const wave of SWELL) {
    const phase = wave.x * x + wave.z * z + wave.speed * time;
    height += wave.amplitude * Math.sin(phase);
    const slope = wave.amplitude * Math.cos(phase);
    slopeX += slope * wave.x;
    slopeZ += slope * wave.z;
  }
  out.height = height;
  out.slopeX = slopeX;
  out.slopeZ = slopeZ;
  return out;
}

/** Height of the swell at a point. */
export function waveHeight(x: number, z: number, time: number): number {
  return sampleWave(x, z, time).height;
}

/** Hull motion over the swell, plus a little heel from the rudder. */
export function boatAttitude(state: BoatState, time: number, trim: number): BoatAttitude {
  const forwardX = Math.sin(state.yaw);
  const forwardZ = Math.cos(state.yaw);
  const rightX = Math.cos(state.yaw);
  const rightZ = -Math.sin(state.yaw);
  const length = SEA.hullHalfLength;
  const beam = SEA.hullHalfBeam;
  const fore = waveHeight(state.x + forwardX * length, state.z + forwardZ * length, time);
  const aft = waveHeight(state.x - forwardX * length, state.z - forwardZ * length, time);
  const starboard = waveHeight(state.x + rightX * beam, state.z + rightZ * beam, time);
  const port = waveHeight(state.x - rightX * beam, state.z - rightZ * beam, time);
  return {
    heave: waveHeight(state.x, state.z, time) * 0.9,
    pitch: -Math.atan2(fore - aft, length * 2) * 0.85,
    roll: Math.atan2(starboard - port, beam * 2) * 0.7 - trim * SEA.trimRoll,
  };
}

/**
 * One frame of sailing. The hull follows its heading against the current,
 * with wave impulses upsetting its course and the keel shedding lateral drift.
 */
export function stepBoat(state: BoatState, input: SailingInput, lightZ: number, dt: number, time = 0): void {
  const distance = distanceToLight(state, lightZ);
  const current = currentSpeed(distance);
  const trim = input.trim < -1 ? -1 : input.trim > 1 ? 1 : input.trim;
  const trimCost = 1 - 0.25 * Math.abs(trim);
  const thrust = Math.max(0, input.thrust) * trimCost;

  const forwardX = Math.sin(state.yaw);
  const forwardZ = Math.cos(state.yaw);
  const rightX = Math.cos(state.yaw);
  const rightZ = -Math.sin(state.yaw);

  // Motion through the water: the water runs toward -Z at `current`.
  const relX = state.vx;
  const relZ = state.vz + current;
  const along = relX * forwardX + relZ * forwardZ;
  const across = relX * rightX + relZ * rightZ;

  const alongDrag = SEA.dragLong * along + SEA.dragLongQuad * along * Math.abs(along);
  const acrossDrag = SEA.dragLat * across + SEA.dragLatQuad * across * Math.abs(across);
  const alongNext = along + (thrust - alongDrag) * dt;
  const acrossNext = across - acrossDrag * dt;

  state.vx = forwardX * alongNext + rightX * acrossNext;
  state.vz = forwardZ * alongNext + rightZ * acrossNext - current;

  // Each swell pushes the hull differently as its crest passes under the keel.
  let wavePushX = 0;
  let wavePushZ = 0;
  for (const wave of SWELL) {
    const phase = wave.x * state.x + wave.z * state.z + wave.speed * time;
    const pressure = Math.cos(phase) * wave.amplitude;
    wavePushX += pressure * wave.x;
    wavePushZ += pressure * wave.z;
  }
  state.vx += wavePushX * 3.2 * dt;
  state.vz += wavePushZ * 3.2 * dt;
  state.yawRate += (trim * input.effort * SEA.turnRate + wavePushX * 0.32) * dt;
  state.yawRate *= Math.exp(-SEA.yawDamp * dt);
  state.yaw += state.yawRate * dt;

  state.x += state.vx * dt;
  state.z += state.vz * dt;

  // The last gate: project the hull outside the exclusion radius and remove
  // any velocity aimed back toward the light, including a direct overlap.
  const awayX = state.x;
  const awayZ = state.z - lightZ;
  const gap = Math.hypot(awayX, awayZ);
  if (gap < SEA.minDistance) {
    const normalX = gap > 0.0001 ? awayX / gap : 0;
    const normalZ = gap > 0.0001 ? awayZ / gap : -1;
    state.x = normalX * SEA.minDistance;
    state.z = lightZ + normalZ * SEA.minDistance;
    const inwardSpeed = state.vx * normalX + state.vz * normalZ;
    if (inwardSpeed < 0) {
      state.vx -= inwardSpeed * normalX;
      state.vz -= inwardSpeed * normalZ;
    }
  }
  const speed = Math.hypot(state.vx, state.vz);
  const maximumSpeed = 44.7; // Approximately 100 mph.
  if (speed > maximumSpeed) {
    state.vx *= maximumSpeed / speed;
    state.vz *= maximumSpeed / speed;
  }
}

export interface ProgressTracker {
  /** The closest the boat has ever come to the light. */
  best: number;
}

export function createProgressTracker(distance: number): ProgressTracker {
  return { best: distance };
}

export function updateProgress(tracker: ProgressTracker, distance: number): boolean {
  tracker.best = Math.min(tracker.best, distance);
  return distance <= SEA.minDistance + 0.5;
}

interface Swell {
  amplitude: number;
  x: number;
  z: number;
  speed: number;
}

/** Long, low waves in metres: four swells is enough to read as open water. */
const SWELL: Swell[] = [
  { amplitude: 0.28, x: 0.31, z: 0.12, speed: 0.95 },
  { amplitude: 0.2, x: -0.19, z: 0.34, speed: 0.72 },
  { amplitude: 0.12, x: 0.55, z: 0.47, speed: 1.9 },
  { amplitude: 0.075, x: 0.9, z: -0.6, speed: 2.7 },
];
