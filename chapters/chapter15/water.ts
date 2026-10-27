/**
 * Chapter XV — the water itself.
 *
 * The sea, the current and the rowboat's motion live here as plain numbers, so
 * the chapter's single promise can be simulated and checked without a
 * renderer: the green light is never reached. Nothing in this file touches
 * Three.js or the DOM — `ocean.ts`, `boat.ts` and `index.ts` give it a body.
 *
 * The numbers below were tuned against `stepBoat` rather than by eye. A
 * tireless rower who never misses the water stalls about thirty metres short
 * of the light; a good, human stroke stalls about fifty metres short. Both are
 * short, and the water keeps the difference.
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
  /**
   * The oars do work rather than push for a set time: a stroke hands the boat a
   * fixed amount of speed however long the rower takes over it, so a fast
   * cadence buys power and a careful one still moves the boat.
   */
  strokeImpulse: number;
  /** Ceiling on how fast a stroke can be dragged, in stroke units per second. */
  strokeRateCap: number;
  /** How buried a blade has to be before it is pulling with everything it has. */
  bladeDepth: number;
  /** Yaw of a full stroke rowed harder on one side, and how the hull sheds rotation. */
  turnRate: number;
  yawDamp: number;
  /** Attitude: how the swell and the stroke move the boat. */
  hullHalfLength: number;
  hullHalfBeam: number;
  strokePitch: number;
  trimRoll: number;
  /** Progress tracking: when the chapter decides the light will not be reached. */
  progressWindow: number;
  progressSample: number;
  /** How fast a rower must be going before the chapter lets them keep rowing. */
  stallRate: number;
  /** How long a rower can coast after a pull before the chapter counts them idle. */
  pullingGrace: number;
  /** The fraction of the sea the rower must have covered before the chapter stops pressing. */
  progressGate: number;
  /** The longest a rower may keep rowing without moving before the chapter ends. */
  wallSeconds: number;
  /** The night ends by itself this long after the rowing, and this long in total. */
  idleLimit: number;
  timeLimit: number;
}

export const SEA: SeaTuning = {
  lightZ: 130,
  startZ: 0,
  minDistance: 26,
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
  dragLong: 0.36,
  dragLongQuad: 0.05,
  dragLat: 2.6,
  dragLatQuad: 0.35,
  strokeImpulse: 1.6,
  strokeRateCap: 5,
  bladeDepth: 0.22,
  turnRate: 1.6,
  yawDamp: 1.9,
  hullHalfLength: 1.5,
  hullHalfBeam: 0.45,
  strokePitch: 0.015,
  trimRoll: 0.025,
  progressWindow: 8,
  progressSample: 0.25,
  stallRate: 0.35,
  pullingGrace: 2.5,
  progressGate: 0.66,
  wallSeconds: 4.5,
  idleLimit: 30,
  timeLimit: 100,
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

/** What the oars are doing this frame. */
export interface RowingInput {
  /** Acceleration along the keel, in metres per second squared. */
  thrust: number;
  /** 0 for a feathered blade, 1 for a stroke pulling with everything it has. */
  effort: number;
  /** -1 (port) to 1 (starboard): the way the rower is asking the boat to turn. */
  trim: number;
}

export interface StrokePower {
  thrust: number;
  effort: number;
}

/**
 * How hard a stroke is telling on the boat. `rate` is how quickly the stroke is
 * being rowed, in stroke units per second, and `depth` is how far under the
 * surface the blades are.
 */
export function strokePower(rate: number, depth: number): StrokePower {
  if (rate <= 0 || depth <= 0) return { thrust: 0, effort: 0 };
  const effort = Math.min(rate, SEA.strokeRateCap) / SEA.strokeRateCap;
  const bite = clamp01(0.45 + depth / SEA.bladeDepth);
  return { thrust: SEA.strokeImpulse * Math.min(rate, SEA.strokeRateCap) * bite, effort: effort * bite };
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
 * Sum of long swells: the surface the boat rides and the oars break. The slope
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

/** Hull motion over the swell, plus the roll of one oar pulling harder than the other. */
export function boatAttitude(state: BoatState, time: number, stroke: number, trim: number): BoatAttitude {
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
    pitch: -Math.atan2(fore - aft, length * 2) * 0.85 + stroke * SEA.strokePitch,
    roll: Math.atan2(starboard - port, beam * 2) * 0.7 - trim * SEA.trimRoll,
  };
}

/**
 * One frame of rowing. The hull is pushed along its own heading, resisted by
 * the water it is moving through, which is itself moving against the boat. A
 * boat carrying way is turned by the oar pulling harder on one side, and the
 * keel sheds sideways motion far faster than forward motion.
 */
export function stepBoat(state: BoatState, input: RowingInput, lightZ: number, dt: number): void {
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

  state.yawRate += trim * input.effort * SEA.turnRate * dt;
  state.yawRate *= Math.exp(-SEA.yawDamp * dt);
  state.yaw += state.yawRate * dt;

  state.x += state.vx * dt;
  state.z += state.vz * dt;

  // The last gate: the boat is never permitted nearer than `minDistance`.
  const gap = distanceToLight(state, lightZ);
  if (gap < SEA.minDistance) {
    const scale = SEA.minDistance / Math.max(gap, 0.0001);
    state.x *= scale;
    state.z = lightZ + (state.z - lightZ) * scale;
    if (state.vz > 0) state.vz = 0;
  }
}

export interface ProgressTracker {
  /** Seconds since the chapter began. */
  time: number;
  /** The closest the boat has ever come to the light. */
  best: number;
  /** Sampled bests over the last few seconds, newest last. */
  history: number[];
  sampleAt: number;
  idleSince: number;
  /** Seconds spent rowing hard without gaining ground. */
  wall: number;
}

export function createProgressTracker(distance: number): ProgressTracker {
  return { time: 0, best: distance, history: [distance], sampleAt: 0, idleSince: 0, wall: 0 };
}

/**
 * Decides when the chapter is over: the rower has gone on pulling while the
 * light stopped coming any nearer, or the night has simply been long enough.
 */
export function updateProgress(tracker: ProgressTracker, distance: number, pulling: boolean, dt: number): boolean {
  tracker.time += dt;
  tracker.best = Math.min(tracker.best, distance);
  if (tracker.time - tracker.sampleAt >= SEA.progressSample) {
    tracker.sampleAt = tracker.time;
    tracker.history.push(tracker.best);
    while (tracker.history.length > Math.ceil(SEA.progressWindow / SEA.progressSample)) tracker.history.shift();
  }   if (pulling) tracker.idleSince = tracker.time;
   const newest = tracker.history[tracker.history.length - 1] ?? tracker.best;
   const oldest = tracker.history[0] ?? tracker.best;
   const span = Math.max(1, (tracker.history.length - 1) * SEA.progressSample);
   const rate = (newest - oldest) / span;
   const idle = tracker.time - tracker.idleSince;
   const rowing = idle < SEA.pullingGrace;
   const farToGo = tracker.best > SEA.lightZ * SEA.progressGate;
   tracker.wall = rowing && !farToGo && rate < SEA.stallRate ? tracker.wall + dt : Math.max(0, tracker.wall - dt * 0.55);
   return tracker.wall >= SEA.wallSeconds || idle >= SEA.idleLimit || tracker.time >= SEA.timeLimit;
 }

interface Swell {
  amplitude: number;
  x: number;
  z: number;
  speed: number;
}

/** Long, low waves in metres: four swells is enough to read as open water. */
const SWELL: Swell[] = [
  { amplitude: 0.13, x: 0.31, z: 0.12, speed: 0.95 },
  { amplitude: 0.09, x: -0.19, z: 0.34, speed: 0.72 },
  { amplitude: 0.05, x: 0.55, z: 0.47, speed: 1.9 },
  { amplitude: 0.03, x: 0.9, z: -0.6, speed: 2.7 },
];
