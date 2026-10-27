import { Vector3, type PerspectiveCamera, type Scene, type WebGLRenderer } from "three";
import type { GameAudio } from "../audio";
import type { HavokPhysics } from "../physics";
import type { Car } from "../car";
import type { Myrtle } from "../ragdoll";
import type { World } from "../world";

export interface ChapterFlavor {
  kicker: string;
  title: string;
  body: string;
  quote: string;
  cite: string;
}

export type ChapterOutcome = "win" | "lose" | "pending";

export interface ChapterDom {
  hud: HTMLElement;
  speedValue: HTMLElement;
  gearValue: HTMLElement;
  distanceValue: HTMLElement;
  subtitle: HTMLElement;
  flash: HTMLElement;
  letterbox: HTMLElement;
  titleFlash: (text: string) => void;
}

export interface ChapterContext {
  scene: Scene;
  engine: WebGLRenderer;
  camera: PerspectiveCamera;
  physics?: HavokPhysics;
  car?: Car;
  myrtle?: Myrtle;
  world?: World;
  audio: GameAudio;
  keys: Set<string>;
  dom: ChapterDom;
  onKey: (handler: (key: string) => void) => () => void;
  say: (text: string, hold?: number, priority?: boolean) => void;
}

export interface Chapter {
  readonly id: string;
  readonly name: string;
  readonly blurb: string;
  readonly command: string;
  readonly how: string;
  readonly duration: number | null;
  start(): void;
  update(dt: number): void;
  idle(dt: number): void;
  abandon?(): void;
  expire?(): void;
  readonly physicsScale: number;
  outcome(): ChapterOutcome;
  flavor(outcome: "win" | "lose"): ChapterFlavor;
  dispose(): void;
}

export function toMph(speed: number): number {
  return Math.abs(speed) * 2.236936;
}

export function vec(x = 0, y = 0, z = 0): Vector3 {
  return new Vector3(x, y, z);
}
