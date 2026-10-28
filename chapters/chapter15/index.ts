import * as THREE from "three";
import type { Chapter, ChapterContext, ChapterFlavor, ChapterOutcome } from "../../frontend/src/chapters/types";
import { disposeObjectTree } from "../../frontend/src/scene-resources";
import { crateCounter } from "../../frontend/src/ui";
import manifest from "./assets/manifest.json";
import { createLuxuryYacht, type LuxuryYachtRig } from "./boat";
import {
  BEATS, CAMERA_AIM, CAMERA_AIM_HEIGHT, CAMERA_BEHIND, CAMERA_FOV, CAMERA_HEIGHT, CAMERA_RATE,
  ENDING_BEHIND, ENDING_HEIGHT, WAKE_INTERVAL,
} from "./constants";
import { createGlowTexture, SplashField } from "./fx";
import { createOcean, type Ocean } from "./ocean";
import { createShore, type Shore } from "./shore";
import {
  boatAttitude, createBoat, createProgressTracker, currentSpeed, distanceToLight, retreatLight,
  SEA, stepBoat, updateProgress, waveHeight, type BoatState, type ProgressTracker,
} from "./water";

export const id = "boatsAgainst";
export const name = manifest.name;
export const blurb = manifest.blurb;
export const command = manifest.command;
export const how = manifest.how;

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
 * The player drives a moonlit luxury yacht toward the green light at the end
 * of Daisy's dock. Sum-of-sines swells buffet the hull, the current strengthens,
 * and the light draws back as it is approached.
 */
export class BoatsAgainstTheCurrentChapter implements Chapter {
  readonly id = id;
  readonly name = name;
  readonly blurb = blurb;
  readonly command = command;
  readonly how = how;
  readonly physicsScale = 1;

  private readonly ctx: ChapterContext;
  private group: THREE.Group | null = null;
  private ocean: Ocean | null = null;
  private shore: Shore | null = null;
  private rig: LuxuryYachtRig | null = null;
  private splash: SplashField | null = null;
  private glow: THREE.CanvasTexture | null = null;
  private snapshot: SceneSnapshot | null = null;
  private counter: HTMLElement | null = null;

  private boat: BoatState = createBoat();
  private tracker: ProgressTracker = createProgressTracker(SEA.lightZ);
  private lightZ = SEA.lightZ;
  private phase: Phase = "sailing";
  private time = 0;
  private ended = false;

  private steering = 0;
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
    this.ended = false;
    this.steering = 0;
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
    this.rig = createLuxuryYacht();
    this.rig.root.rotation.order = "YXZ";
    group.add(this.rig.root);

    scene.background = new THREE.Color("#04060a");
    scene.fog = new THREE.Fog("#090a0d", 26, 19000);
    for (const entry of this.snapshot.lights) applyNightLight(entry);

    this.poseRig();
    this.ocean.update(this.time, this.boat.x, this.boat.z);
    this.shore.update(this.lightZ, camera.position.z, this.time, distanceToLight(this.boat, this.lightZ));
    camera.far = 24000;
    camera.updateProjectionMatrix();
    camera.position.set(0, CAMERA_HEIGHT, -CAMERA_BEHIND);
    this.lookAt.set(0, CAMERA_AIM_HEIGHT, CAMERA_AIM);
    camera.lookAt(this.lookAt);
    camera.fov = CAMERA_FOV;
    camera.updateProjectionMatrix();

    this.counter = crateCounter;
    this.counter?.classList.add("show");
    this.updateCounter();
    dom.hud.classList.add("live");
    dom.letterbox.classList.remove("on");
    // Keep shared car audio muted; this chapter uses its own quiet motor yacht.
    this.ctx.audio.setEngine(0, 0, true);
    this.ctx.dom.speedValue.textContent = "0";
    document.body.classList.remove("boats-fast");
    document.body.style.removeProperty("--boat-speed");
    document.body.style.removeProperty("--boat-speed-drift");
    document.body.style.removeProperty("--boat-speed-duration");
    this.ctx.say("W accelerates toward 100 mph, S brakes, and A / D steer Gatsby's yacht toward the distant mansion lights.", 6, true);
  }

  update(dt: number): void {
    const { rig, ocean, shore, splash } = this;
    if (!this.group || !rig || !ocean || !shore || !splash) return;
    this.time += dt;

    this.poseRig();
    if (this.phase === "sailing") this.updateSailing(dt);
    else this.updateEnding(dt);
    this.updateSpeedometer();

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

    document.body.classList.remove("boats-fast");
    document.body.style.removeProperty("--boat-speed");
    document.body.style.removeProperty("--boat-speed-drift");
    document.body.style.removeProperty("--boat-speed-duration");
    this.ctx.dom.speedValue.textContent = "0";
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
    camera.far = 1200;
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
    this.trimTarget = Number(this.ctx.keys.has("a")) - Number(this.ctx.keys.has("d"));
    this.steering += (this.trimTarget - this.steering) * Math.min(1, 2.8 * dt);
    this.trim = this.steering;
    const throttle = Number(this.ctx.keys.has("w")) - Number(this.ctx.keys.has("s"));
    this.thrust = throttle > 0 ? SEA.sailImpulse * 2.2 : 0;

    const before = distanceToLight(this.boat, this.lightZ);
    stepBoat(this.boat, { thrust: this.thrust, effort: Math.abs(throttle), trim: this.steering }, this.lightZ, dt, this.time);
    if (throttle < 0) {
      const brake = Math.max(0, 1 - 5 * dt);
      this.boat.vx *= brake;
      this.boat.vz *= brake;
    }
    this.lightZ = retreatLight(this.lightZ, before, dt);
    const distance = distanceToLight(this.boat, this.lightZ);

    this.spawnWake(dt);
    this.updateBeats(distance);
    if (updateProgress(this.tracker, distance)) this.beginEnding();
  }

  private updateSpeedometer(): void {
    const mph = Math.hypot(this.boat.vx, this.boat.vz) * 2.236936;
    this.ctx.dom.speedValue.textContent = String(Math.round(mph));
    const intensity = THREE.MathUtils.clamp(mph / 100, 0, 1);
    document.body.style.setProperty("--boat-speed", intensity.toFixed(3));
    document.body.style.setProperty("--boat-speed-drift", `${(0.25 + intensity * 2.25).toFixed(2)}%`);
    document.body.style.setProperty("--boat-speed-duration", `${(0.95 - intensity * 0.72).toFixed(2)}s`);
    document.body.classList.toggle("boats-fast", intensity > 0.005);
  }

  private updateEnding(dt: number): void {
    this.thrust = 0;
    this.trim += (0 - this.trim) * Math.min(1, 2 * dt);
    this.steering += (0 - this.steering) * Math.min(1, 0.8 * dt);
    stepBoat(this.boat, { thrust: 0, effort: 0, trim: this.steering }, this.lightZ, dt, this.time);
    if (this.ctx.keys.has("s")) {
      this.boat.vx *= Math.max(0, 1 - 3.5 * dt);
      this.boat.vz *= Math.max(0, 1 - 3.5 * dt);
    }
    this.lightZ = retreatLight(this.lightZ, distanceToLight(this.boat, this.lightZ), dt);
    if (distanceToLight(this.boat, this.lightZ) >= SEA.retreatLimit + SEA.lightZ) this.ended = true;
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
    this.ctx.engine.domElement.style.cursor = "default";
    this.ctx.say("The sail slackens. The green light holds its distance, and the Sound carries the yacht back into the night.", 6.5, true);
  }

  private poseRig(): void {
    const rig = this.rig;
    if (!rig) return;
    const attitude = boatAttitude(this.boat, this.time, this.trim);
    rig.root.position.set(this.boat.x, attitude.heave - 0.1, this.boat.z);
    rig.root.rotation.set(attitude.pitch, this.boat.yaw, attitude.roll);
    rig.animate(this.steering, this.time);
  }

  private spawnWake(dt: number): void {
    const splash = this.splash;
    if (!splash) return;
    const speed = Math.hypot(this.boat.vx, this.boat.vz);
    const speedRatio = THREE.MathUtils.clamp(speed / 44.7, 0, 1);
    this.wakeAt += dt;
    if (this.wakeAt < THREE.MathUtils.lerp(WAKE_INTERVAL, 0.1, speedRatio)) return;
    this.wakeAt = 0;
    if (speed < 0.5 || this.phase !== "sailing") return;
    const forwardX = Math.sin(this.boat.yaw);
    const forwardZ = Math.cos(this.boat.yaw);
    this.bowPoint.set(this.boat.x + forwardX * 4.3, 0, this.boat.z + forwardZ * 4.3);
    splash.ripple(this.bowPoint.x, this.bowPoint.z, THREE.MathUtils.clamp(speed / 18, 0.18, 1.6));
    if (speed > 1.4) {
      const sprayStrength = THREE.MathUtils.clamp(0.25 + speedRatio * 1.15, 0.25, 1.4);
      splash.spray(this.bowPoint.x, waveHeight(this.bowPoint.x, this.bowPoint.z, this.time) + 0.1, this.bowPoint.z, sprayStrength);
    }
  }

  private placeCamera(dt: number): void {
    const camera = this.ctx.camera;
    const forwardX = Math.sin(this.boat.yaw);
    const forwardZ = Math.cos(this.boat.yaw);
    const speed = Math.hypot(this.boat.vx, this.boat.vz);
    const ending = this.phase === "ending" ? 1 : 0;
    const speedRatio = THREE.MathUtils.clamp(speed / 44.7, 0, 1);
    const behind = THREE.MathUtils.lerp(CAMERA_BEHIND + 2.2 + speedRatio * 2.4, ENDING_BEHIND, ending * ending);
    const height = THREE.MathUtils.lerp(CAMERA_HEIGHT + this.thrust * 0.03, ENDING_HEIGHT, ending * ending);
    this.cameraDesired.set(
      this.boat.x - forwardX * behind,
      height,
      this.boat.z - forwardZ * behind,
    );
    const horizonFocus = THREE.MathUtils.clamp(distanceToLight(this.boat, this.lightZ) / 500, 0, 1);
    const mansionZ = this.lightZ + 47;
    this.lookDesired.set(
      THREE.MathUtils.lerp(this.boat.x + forwardX * CAMERA_AIM, 0, horizonFocus),
      THREE.MathUtils.lerp(CAMERA_AIM_HEIGHT, 10, horizonFocus),
      THREE.MathUtils.lerp(this.boat.z + forwardZ * CAMERA_AIM, mansionZ, horizonFocus),
    );
    if (ending) this.lookDesired.set(0, 10, mansionZ);
    const blend = 1 - Math.exp(-CAMERA_RATE * dt);
    camera.position.lerp(this.cameraDesired, blend);
    this.lookAt.lerp(this.lookDesired, blend);
    camera.lookAt(this.lookAt);
    camera.fov = CAMERA_FOV + ending * 3 + speedRatio * 7;
    camera.updateProjectionMatrix();
  }

  private updateCounter(): void {
    if (!this.counter) return;
    if (this.phase === "ending") {
      this.counter.textContent = "THE LIGHT DOES NOT DRAW NEARER";
      return;
    }
    const distance = Math.max(0, Math.round(distanceToLight(this.boat, this.lightZ)));
    const distanceLabel = distance >= 1609.344 ? `${(distance / 1609.344).toFixed(1)} MI` : `${distance} M`;
    this.counter.textContent = `GREEN LIGHT ${distanceLabel} · RUDDER ${Math.round(this.steering * 100)}% · CURRENT ${currentSpeed(distance).toFixed(1)} M/S`;
  }

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
    entry.light.intensity = 1.5;
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
