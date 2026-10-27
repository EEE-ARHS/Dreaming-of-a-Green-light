import * as THREE from "three";
import type { Chapter, ChapterContext, ChapterFlavor, ChapterOutcome } from "../../frontend/src/chapters/types";
import { disposeObjectTree } from "../../frontend/src/scene-resources";
import { crateCounter } from "../../frontend/src/ui";
import manifest from "./assets/manifest.json";
import { createSailingYacht, type SailingYachtRig } from "./boat";
import {
  BEATS, CAMERA_AIM, CAMERA_AIM_HEIGHT, CAMERA_BEHIND, CAMERA_FOV, CAMERA_HEIGHT, CAMERA_RATE,
  ENDING_BEHIND, ENDING_HEIGHT, ENDING_SECONDS, WAKE_INTERVAL,
} from "./constants";
import { createGlowTexture, SplashField } from "./fx";
import { createOcean, type Ocean } from "./ocean";
import { createShore, type Shore } from "./shore";
import {
  boatAttitude, clamp01, createBoat, createProgressTracker, currentSpeed, distanceToLight, retreatLight,
  sailPower, SEA, stepBoat, updateProgress, waveHeight, type BoatState, type ProgressTracker,
} from "./water";

export const id = "boatsAgainst";
export const name = manifest.name;
export const blurb = manifest.blurb;
export const command = manifest.command;
export const how = manifest.how;
export const duration = manifest.duration as number | null;

type Phase = "sailing" | "ending";

interface LightSnapshot {
  light: THREE.Light;
  intensity: number;
  color: THREE.Color;
  position: THREE.Vector3;
  ground: THREE.Color | null;
  castShadow: boolean;
}

interface SceneSnapshot {
  background: THREE.Scene["background"];
  fog: THREE.Scene["fog"];
  lights: LightSnapshot[];
}

/**
 * CHAPTER 15 — Boats Against the Current.
 *
 * The player steers a moonlit yacht toward the green light at the end of
 * Daisy's dock. Sum-of-sines swells buffet the hull, the current strengthens,
 * and the light draws back as it is approached.
 */
export class BoatsAgainstTheCurrentChapter implements Chapter {
  readonly id = id;
  readonly name = name;
  readonly blurb = blurb;
  readonly command = command;
  readonly how = how;
  readonly duration: number | null = duration;
  readonly physicsScale = 1;

  private readonly ctx: ChapterContext;
  private group: THREE.Group | null = null;
  private ocean: Ocean | null = null;
  private shore: Shore | null = null;
  private rig: SailingYachtRig | null = null;
  private splash: SplashField | null = null;
  private glow: THREE.CanvasTexture | null = null;
  private snapshot: SceneSnapshot | null = null;
  private counter: HTMLElement | null = null;

  private boat: BoatState = createBoat();
  private tracker: ProgressTracker = createProgressTracker(SEA.lightZ);
  private lightZ = SEA.lightZ;
  private phase: Phase = "sailing";
  private time = 0;
  private endingTime = 0;
  private ended = false;

  private steering = 0;
  private pointerX = 0.5;
  private trim = 0;
  private trimTarget = 0;
  private thrust = 0;
  private wakeAt = 0;

  private readonly savedCameraPosition = new THREE.Vector3();
  private readonly savedCameraQuaternion = new THREE.Quaternion();
  private savedFov = 50;
  private readonly cameraDesired = new THREE.Vector3();
  private readonly lookAt = new THREE.Vector3();
  private readonly lookDesired = new THREE.Vector3();
  private readonly bowPoint = new THREE.Vector3();

  constructor(ctx: ChapterContext) {
    this.ctx = ctx;
  }

  start(): void {
    if (this.group) this.dispose();
    const { scene, camera, dom } = this.ctx;
    this.savedCameraPosition.copy(camera.position);
    this.savedCameraQuaternion.copy(camera.quaternion);
    this.savedFov = camera.fov;

    this.boat = createBoat();
    this.lightZ = SEA.lightZ;
    this.tracker = createProgressTracker(distanceToLight(this.boat, this.lightZ));
    this.phase = "sailing";
    this.time = 0;
    this.endingTime = 0;
    this.ended = false;
    this.steering = 0;
    this.pointerX = 0.5;
    this.trim = 0;
    this.trimTarget = 0;
    this.thrust = 0;
    this.wakeAt = 0;
    for (const beat of BEATS) beat.done = false;

    this.snapshot = captureScene(scene);
    const group = new THREE.Group();
    group.name = "chapter15";
    scene.add(group);
    this.group = group;
    this.glow = createGlowTexture();
    this.ocean = createOcean(this.glow);
    group.add(this.ocean.group);
    this.shore = createShore(this.glow);
    group.add(this.shore.group);
    this.splash = new SplashField(this.glow);
    group.add(this.splash.group);
    this.rig = createSailingYacht();
    this.rig.root.rotation.order = "YXZ";
    group.add(this.rig.root);

    scene.background = new THREE.Color("#04060a");
    scene.fog = new THREE.Fog("#06090f", 26, 250);
    for (const entry of this.snapshot.lights) applyNightLight(entry);

    this.poseRig(1);
    this.ocean.update(this.time, this.boat.x, this.boat.z);
    this.shore.update(this.lightZ, camera.position.z, this.time, distanceToLight(this.boat, this.lightZ));
    camera.position.set(0, CAMERA_HEIGHT, -CAMERA_BEHIND);
    this.lookAt.set(0, CAMERA_AIM_HEIGHT, CAMERA_AIM);
    camera.lookAt(this.lookAt);
    camera.fov = CAMERA_FOV;
    camera.updateProjectionMatrix();

    const canvas = this.ctx.engine.domElement;
    canvas.style.cursor = "grab";
    canvas.addEventListener("pointerdown", this.onPointerDown);
    window.addEventListener("pointermove", this.onPointerMove);
    window.addEventListener("pointerup", this.onPointerUp);
    window.addEventListener("pointercancel", this.onPointerUp);
    window.addEventListener("blur", this.onPointerUp);

    this.counter = crateCounter;
    this.counter?.classList.add("show");
    this.updateCounter();
    dom.hud.classList.add("live");
    dom.letterbox.classList.remove("on");
    // This chapter is driven by wind and rudder rather than the shared car audio.
    this.ctx.audio.setEngine(0, 0, true);
    this.ctx.say("Move the mouse left or right to steer. The wind fills the sail; the sum-of-sines swells can shove your yacht off course.", 6, true);
  }

  update(dt: number): void {
    const { rig, ocean, shore, splash } = this;
    if (!this.group || !rig || !ocean || !shore || !splash) return;
    this.time += dt;

    this.poseRig(dt);
    if (this.phase === "sailing") this.updateSailing(dt);
    else this.updateEnding(dt);

    ocean.update(this.time, this.boat.x, this.boat.z);
    shore.update(this.lightZ, this.ctx.camera.position.z, this.time, distanceToLight(this.boat, this.lightZ));
    splash.update(dt, this.time);
    this.placeCamera(dt);
    this.updateCounter();
  }

  idle(_dt: number): void {
    /* The Sound is only built while the chapter is live. */
  }

  abandon(): void {
    this.ctx.engine.domElement.style.cursor = "default";
  }

  expire(): void {
    if (this.phase === "sailing") this.beginEnding();
  }

  outcome(): ChapterOutcome {
    return this.ended ? "lose" : "pending";
  }

  flavor(outcome: "win" | "lose"): ChapterFlavor {
    const text = manifest.flavor[outcome];
    return {
      kicker: text.kicker,
      title: text.title,
      body: text.body.replace("{closest}", `You came no nearer than ${Math.round(this.tracker.best)} metres.`),
      quote: text.quote,
      cite: text.cite,
      stamp: text.stamp,
    };
  }

  dispose(): void {
    const canvas = this.ctx.engine.domElement;
    canvas.removeEventListener("pointerdown", this.onPointerDown);
    window.removeEventListener("pointermove", this.onPointerMove);
    window.removeEventListener("pointerup", this.onPointerUp);
    window.removeEventListener("pointercancel", this.onPointerUp);
    window.removeEventListener("blur", this.onPointerUp);
    canvas.style.cursor = "default";

    if (this.group) {
      this.ctx.scene.remove(this.group);
      disposeObjectTree(this.group);
      this.group = null;
    }
    this.glow?.dispose();
    this.glow = null;
    this.ocean = null;
    this.shore = null;
    this.rig = null;
    this.splash = null;
    if (this.snapshot) {
      restoreScene(this.ctx.scene, this.snapshot);
      this.snapshot = null;
    }

    const { camera, dom } = this.ctx;
    camera.position.copy(this.savedCameraPosition);
    camera.quaternion.copy(this.savedCameraQuaternion);
    camera.fov = this.savedFov;
    camera.updateProjectionMatrix();
    dom.hud.classList.remove("live");
    dom.letterbox.classList.remove("on");
    if (this.counter) {
      this.counter.classList.remove("show");
      this.counter.textContent = "";
      this.counter = null;
    }
  }

  private updateSailing(dt: number): void {
    this.steering += (this.trimTarget - this.steering) * Math.min(1, 2.8 * dt);
    this.trim = this.steering;
    const wind = 0.78 + Math.sin(this.time * 0.31) * 0.08;
    const power = sailPower(wind, this.steering);
    this.thrust = power.thrust;

    const before = distanceToLight(this.boat, this.lightZ);
    stepBoat(this.boat, { thrust: power.thrust, effort: power.effort, trim: this.steering }, this.lightZ, dt, this.time);
    this.lightZ = retreatLight(this.lightZ, before, dt);
    const distance = distanceToLight(this.boat, this.lightZ);

    this.spawnWake(dt);
    this.updateBeats(distance);
    if (updateProgress(this.tracker, distance, true, dt)) this.beginEnding();
  }

  private updateEnding(dt: number): void {
    this.endingTime += dt;
    this.thrust = 0;
    this.trim += (0 - this.trim) * Math.min(1, 2 * dt);
    this.steering += (0 - this.steering) * Math.min(1, 0.8 * dt);
    stepBoat(this.boat, { thrust: 0, effort: 0, trim: this.steering }, this.lightZ, dt, this.time);
    this.lightZ = retreatLight(this.lightZ, distanceToLight(this.boat, this.lightZ), dt);
    if (!this.ended && this.endingTime >= ENDING_SECONDS) this.ended = true;
  }

  private updateBeats(distance: number): void {
    for (const beat of BEATS) {
      if (beat.done || distance > beat.distance) continue;
      beat.done = true;
      this.ctx.say(beat.text, beat.hold);
    }
  }

  private beginEnding(): void {
    if (this.phase === "ending") return;
    this.phase = "ending";
    this.endingTime = 0;
    this.ctx.engine.domElement.style.cursor = "default";
    this.ctx.say("The sail slackens. The green light holds its distance, and the Sound carries the yacht back into the night.", 6.5, true);
  }

  private poseRig(dt: number): void {
    const rig = this.rig;
    if (!rig) return;
    const attitude = boatAttitude(this.boat, this.time, this.trim);
    rig.root.position.set(this.boat.x, attitude.heave - 0.1, this.boat.z);
    rig.root.rotation.set(attitude.pitch, this.boat.yaw, attitude.roll);
    rig.setSail(this.steering, this.time, dt);
  }

  private spawnWake(dt: number): void {
    const splash = this.splash;
    if (!splash) return;
    const speed = Math.hypot(this.boat.vx, this.boat.vz);
    this.wakeAt += dt;
    if (this.wakeAt < WAKE_INTERVAL) return;
    this.wakeAt = 0;
    if (speed < 0.5 || this.phase !== "sailing") return;
    const forwardX = Math.sin(this.boat.yaw);
    const forwardZ = Math.cos(this.boat.yaw);
    this.bowPoint.set(this.boat.x + forwardX * 1.5, 0, this.boat.z + forwardZ * 1.5);
    splash.ripple(this.bowPoint.x, this.bowPoint.z, Math.min(1, speed * 0.4));
    if (speed > 1.4) splash.spray(this.bowPoint.x, waveHeight(this.bowPoint.x, this.bowPoint.z, this.time) + 0.1, this.bowPoint.z, 0.5);
  }

  private placeCamera(dt: number): void {
    const camera = this.ctx.camera;
    const forwardX = Math.sin(this.boat.yaw);
    const forwardZ = Math.cos(this.boat.yaw);
    const speed = Math.hypot(this.boat.vx, this.boat.vz);
    const ending = this.phase === "ending" ? clamp01(this.endingTime / ENDING_SECONDS) : 0;
    const behind = THREE.MathUtils.lerp(CAMERA_BEHIND + Math.min(speed, 2.5) * 0.35, ENDING_BEHIND, ending * ending);
    const height = THREE.MathUtils.lerp(CAMERA_HEIGHT + this.thrust * 0.03, ENDING_HEIGHT, ending * ending);
    this.cameraDesired.set(
      this.boat.x - forwardX * behind,
      height,
      this.boat.z - forwardZ * behind,
    );
    this.lookDesired.set(
      THREE.MathUtils.lerp(this.boat.x + forwardX * CAMERA_AIM, 0, ending),
      THREE.MathUtils.lerp(CAMERA_AIM_HEIGHT, 2.3, ending),
      THREE.MathUtils.lerp(this.boat.z + forwardZ * CAMERA_AIM, this.lightZ, ending),
    );
    const blend = 1 - Math.exp(-CAMERA_RATE * dt);
    camera.position.lerp(this.cameraDesired, blend);
    this.lookAt.lerp(this.lookDesired, blend);
    camera.lookAt(this.lookAt);
    camera.fov = CAMERA_FOV + ending * 3;
    camera.updateProjectionMatrix();
  }

  private updateCounter(): void {
    if (!this.counter) return;
    if (this.phase === "ending") {
      this.counter.textContent = "THE LIGHT DOES NOT DRAW NEARER";
      return;
    }
    const distance = Math.max(0, Math.round(distanceToLight(this.boat, this.lightZ)));
    this.counter.textContent = `GREEN LIGHT ${distance} M · STEER ${Math.round(this.pointerX * 100)}% · CURRENT ${currentSpeed(distance).toFixed(1)} M/S`;
  }

  private readonly onPointerDown = (event: PointerEvent): void => {
    if (this.phase !== "sailing" || event.button !== 0) return;
    this.updateSteeringFromPointer(event.clientX);
  };

  private readonly onPointerMove = (event: PointerEvent): void => {
    if (this.phase !== "sailing") return;
    this.updateSteeringFromPointer(event.clientX);
  };

  private updateSteeringFromPointer(clientX: number): void {
    const rect = this.ctx.engine.domElement.getBoundingClientRect();
    this.pointerX = THREE.MathUtils.clamp((clientX - rect.left) / Math.max(1, rect.width), 0, 1);
    this.trimTarget = THREE.MathUtils.clamp((this.pointerX - 0.5) * 2, -1, 1);
  }

  private readonly onPointerUp = (): void => undefined;
}

/** The shell hands every chapter the same lamp-lit room; this one needs a night sea. */
function captureScene(scene: THREE.Scene): SceneSnapshot {
  const lights: LightSnapshot[] = [];
  scene.traverse((object) => {
    if (!(object instanceof THREE.Light)) return;
    lights.push({
      light: object,
      intensity: object.intensity,
      color: object.color.clone(),
      position: object.position.clone(),
      ground: object instanceof THREE.HemisphereLight ? object.groundColor.clone() : null,
      castShadow: object.castShadow,
    });
  });
  return { background: scene.background, fog: scene.fog, lights };
}

function applyNightLight(entry: LightSnapshot): void {
  if (entry.light instanceof THREE.HemisphereLight) {
    entry.light.color.set("#22395e");
    entry.light.groundColor.set("#03060b");
    entry.light.intensity = 0.62;
    return;
  }
  if (entry.light instanceof THREE.DirectionalLight) {
    entry.light.color.set("#a9c2f0");
    entry.light.intensity = 2.8;
    entry.light.position.set(-140, 110, 90);
    entry.light.castShadow = false;
    return;
  }
  entry.light.intensity = 0;
}

function restoreScene(scene: THREE.Scene, snapshot: SceneSnapshot): void {
  scene.background = snapshot.background;
  scene.fog = snapshot.fog;
  for (const entry of snapshot.lights) {
    entry.light.intensity = entry.intensity;
    entry.light.color.copy(entry.color);
    entry.light.position.copy(entry.position);
    if (entry.ground && entry.light instanceof THREE.HemisphereLight) entry.light.groundColor.copy(entry.ground);
    entry.light.castShadow = entry.castShadow;
  }
}
