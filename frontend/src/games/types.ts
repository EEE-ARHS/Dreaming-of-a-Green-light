import { Vector3, type PerspectiveCamera, type Scene, type WebGLRenderer } from "three";
import type { GameAudio } from "../audio";
import type { World } from "../world";
import type { Car } from "../car";
import type { Myrtle } from "../ragdoll";
import type { ArcadePhysics } from "../physics";

export interface MiniGameFlavor {
  kicker: string;
  title: string;
  body: string;
  quote: string;
  cite: string;
}

export type MiniGameOutcome = "win" | "lose" | "pending";

/** Mouse-driven steering. Positive steer means game-right. The shell writes
 * the current pointer steer + a constant random wander into this each frame. */
export interface PointerInput {
  steer: number;
}

export interface MiniGameDom {
  hud: HTMLElement;
  speedValue: HTMLElement;
  gearValue: HTMLElement;
  distanceValue: HTMLElement;
  subtitle: HTMLElement;
  flash: HTMLElement;
  letterbox: HTMLElement;
  titleFlash: (text: string) => void;
}

export interface MiniGameContext {
  scene: Scene;
  engine: WebGLRenderer;
  camera: PerspectiveCamera;
  physics: ArcadePhysics;
  audio: GameAudio;
  world: World;
  car: Car;
  myrtle: Myrtle;
  keys: Set<string>;
  pointer: PointerInput;
  dom: MiniGameDom;
  onKey: (handler: (key: string) => void) => () => void;
  say: (text: string, hold?: number, priority?: boolean) => void;
}

export interface MiniGame {
  readonly id: string;
  readonly name: string;
  readonly blurb: string;
  readonly command: string;
  readonly how: string;
  readonly duration: number;
  start(): void;
  update(dt: number): void;
  idle(dt: number): void;
  abandon?(): void;
  expire?(): void;
  readonly physicsScale: number;
  outcome(): MiniGameOutcome;
  flavor(outcome: "win" | "lose"): MiniGameFlavor;
  dispose(): void;
}

export function toMph(speed: number): number {
  return Math.abs(speed) * 2.236936;
}

export function vec(x = 0, y = 0, z = 0): Vector3 {
  return new Vector3(x, y, z);
}
