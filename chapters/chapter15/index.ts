import * as THREE from "three";
import type { Chapter, ChapterContext, ChapterFlavor, ChapterOutcome } from "../../frontend/src/chapters/types";
import { disposeObjectTree } from "../../frontend/src/scene-resources";
import { crateCounter } from "../../frontend/src/ui";
import manifest from "./assets/manifest.json";
import { createRowboat, type RowboatRig } from "./boat";
import {
  BEATS, CAMERA_AIM, CAMERA_AIM_HEIGHT, CAMERA_BEHIND, CAMERA_FOV, CAMERA_HEIGHT, CAMERA_RATE, DRAG_SPAN,
  ENDING_BEHIND, ENDING_HEIGHT, ENDING_SECONDS, STROKE_CATCH, STROKE_RELEASE, TRIM_SPAN, WAKE_INTERVAL,
} from "./constants";
import { createGlowTexture, SplashField } from "./fx";
import { createOcean, type Ocean } from "./ocean";
import { createShore, type Shore } from "./shore";
import {
  boatAttitude, clamp01, createBoat, createProgressTracker, currentSpeed, distanceToLight, retreatLight,
  SEA, stepBoat, strokePower, updateProgress, waveHeight, type BoatState, type ProgressTracker,
} from "./water";

export const id = "boatsAgainst";
export const name = manifest.name;
export const blurb = manifest.blurb;
export const command = manifest.command;
export const how = manifest.how;
export const duration = manifest.duration as number | null;

type Phase = "rowing" | "ending";

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
 * The player drags the oars through black water toward the green light at the
 * end of Daisy's dock. The current strengthens with every metre gained, the
 * light draws back as it is approached, and the chapter ends — with text —
 * once the rowing has stopped buying ground. See `water.ts`: the sea there is
 * the same sea drawn here, and it has been simulated to make sure the light is
 * out of reach even for a rower who never misses a stroke.
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
  private rig: RowboatRig | null = null;
  private splash: SplashField | null = null;
  private glow: THREE.CanvasTexture | null = null;
  private snapshot: SceneSnapshot | null = null;
  private counter: HTMLElement | null = null;

  private boat: BoatState = createBoat();
  private tracker: ProgressTracker = createProgressTracker(SEA.lightZ);
  private lightZ = SEA.lightZ;
  private phase: Phase = "rowing";
  private time = 0;
  private endingTime = 0;
  private ended = false;

  private stroke = -1;
  private previousStroke = -1;
  private strokeAtGrab = -1;
  private grabX = 0;
  private grabY = 0;
  private dragging = false;
  private trim = 0;
  private trimTarget = 0;
  private thrust = 0;
  private driving = false;
  private strokes = 0;
  private depth = [0, 0];
  private wakeAt = 0;
  private wakeSide = 1;
  private sprayAt = 0;

  private readonly savedCameraPosition = new THREE.Vector3();
  private readonly savedCameraQuaternion = new THREE.Quaternion();
  private savedFov = 50;
  private readonly bladePoint = new THREE.Vector3();
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
    this.phase = "rowing";
    this.time = 0;
    this.endingTime = 0;
    this.ended = false;
    this.stroke = -1;
    this.previousStroke = -1;
    this.strokeAtGrab = -1;
    this.dragging = false;
    this.trim = 0;
    this.trimTarget = 0;
    this.thrust = 0;
    this.driving = false;
    this.strokes = 0;
    this.depth = [0, 0];
    this.wakeAt = 0;
    this.wakeSide = 1;
    this.sprayAt = 0;
    for (const beat of BEATS) beat.done = false;

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
    this.rig = createRowboat();
    this.rig.root.rotation.order = "YXZ";
    group.add(this.rig.root);

    this.snapshot = captureScene(scene);
    scene.background = new THREE.Color("#04060a");
    scene.fog = new THREE.Fog("#06090f", 26, 250);
    for (const entry of this.snapshot.lights) applyNightLight(entry);

    this.poseRig(1, false);
    this.ocean.update(this.time, this.boat.x, this.boat.z);
    this.shore.update(this.lightZ, camera.position.z, this.time);
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
    // The shell leaves the car idling behind every chapter; this one rows.
    this.ctx.audio.setEngine(0, 0, true);
    this.ctx.say("Drag the pointer down to pull both oars through the water. Angle the drag to steer. Drag forward to feather the blades and recover.", 6, true);
  }

  update(dt: number): void {
    const { rig, ocean, shore, splash } = this;
    if (!this.group || !rig || !ocean || !shore || !splash) return;
    this.time += dt;

    // The blades are in the water while the hands are pulling, and again as the
    // oars come back to the catch. Everything else follows the water contact
    // those oars actually make, so a stroke that does not bite cannot pull.
    const rate = this.takeStrokeRate(dt);
    const rowing = this.phase === "rowing" && this.dragging;
    const bladeDown = rowing && ((rate > 0 && this.stroke < STROKE_RELEASE) || this.stroke < STROKE_CATCH);
    this.poseRig(dt, bladeDown);
    this.measureBlades(dt);
    if (this.phase === "rowing") this.updateRowing(dt, rate);
    else this.updateEnding(dt);

    ocean.update(this.time, this.boat.x, this.boat.z);
    shore.update(this.lightZ, this.ctx.camera.position.z, this.time);
    splash.update(dt, this.time);
    this.placeCamera(dt);
    this.updateCounter();
  }

  idle(_dt: number): void {
    /* The Sound is only built while the chapter is live. */
  }

  abandon(): void {
    this.dragging = false;
    this.ctx.engine.domElement.style.cursor = "default";
  }

  expire(): void {
    if (this.phase === "rowing") this.beginEnding();
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
    this.dragging = false;

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

  private updateRowing(dt: number, rate: number): void {
    const depth = Math.max(this.depth[0], this.depth[1]);
    const drawing = this.dragging && rate > 0 && this.stroke < STROKE_RELEASE && depth > 0.015;
    if (drawing && !this.driving) this.strokes += 1;
    this.driving = drawing;
    this.trim += (this.trimTarget - this.trim) * Math.min(1, 6 * dt);
    const power = drawing ? strokePower(rate, depth) : { thrust: 0, effort: 0 };
    this.thrust = power.thrust;

    const before = distanceToLight(this.boat, this.lightZ);
    stepBoat(this.boat, { thrust: power.thrust, effort: power.effort, trim: this.trim }, this.lightZ, dt);
    this.lightZ = retreatLight(this.lightZ, before, dt);
    const distance = distanceToLight(this.boat, this.lightZ);

    this.spawnWake(dt);
    this.updateBeats(distance);
    if (updateProgress(this.tracker, distance, drawing, dt)) this.beginEnding();
  }

  private updateEnding(dt: number): void {
    this.endingTime += dt;
    this.driving = false;
    this.thrust = 0;
    this.trim += (0 - this.trim) * Math.min(1, 2 * dt);
    // The blades come up and the boat goes on without them.
    this.stroke += (-1 - this.stroke) * Math.min(1, 0.5 * dt);
    stepBoat(this.boat, { thrust: 0, effort: 0, trim: 0 }, this.lightZ, dt);
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
    this.dragging = false;
    this.ctx.engine.domElement.style.cursor = "default";
    this.ctx.say("The blades come out of the water and lose it. The green light stays exactly where it has always been.", 6.5, true);
  }

  /** Hands off the oars, and they swing back to the catch of their own accord. */
  private takeStrokeRate(dt: number): number {
    if (this.phase === "rowing" && !this.dragging) this.stroke += (-1 - this.stroke) * Math.min(1, 0.9 * dt);
    const rate = (this.stroke - this.previousStroke) / Math.max(dt, 0.0001);
    this.previousStroke = this.stroke;
    return rate;
  }

  private poseRig(dt: number, bladeDown: boolean): void {
    const rig = this.rig;
    if (!rig) return;
    const attitude = boatAttitude(this.boat, this.time, this.stroke, this.trim);
    rig.root.position.set(this.boat.x, attitude.heave - 0.1, this.boat.z);
    rig.root.rotation.set(attitude.pitch, this.boat.yaw, attitude.roll);
    rig.setStroke(this.stroke, this.trim, bladeDown, dt);
  }

  /** Water contact at each blade: this is what decides whether a stroke bites. */
  private measureBlades(dt: number): void {
    const rig = this.rig;
    const splash = this.splash;
    if (!rig || !splash) return;
    this.sprayAt += dt;
    for (let index = 0; index < 2; index++) {
      const side = index === 0 ? 1 : -1;
      rig.bladePosition(side, this.bladePoint);
      const contact = waveHeight(this.bladePoint.x, this.bladePoint.z, this.time) - this.bladePoint.y;
      const before = this.depth[index];
      this.depth[index] = contact;
      const entering = before <= 0 && contact > 0;
      const leaving = before > 0 && contact <= 0;
      if (!entering && !leaving) continue;
      splash.ripple(this.bladePoint.x, this.bladePoint.z, entering ? 1 : 0.55);
      splash.spray(this.bladePoint.x, this.bladePoint.y + 0.1, this.bladePoint.z, entering ? 1 : 0.5);
    }
    if (this.driving && this.sprayAt > 0.05) {
      this.sprayAt = 0;
      const side = this.wakeSide;
      this.wakeSide = -side;
      if (this.depth[side === 1 ? 0 : 1] > 0.02) {
        rig.bladePosition(side, this.bladePoint);
        splash.spray(this.bladePoint.x, this.bladePoint.y, this.bladePoint.z, 0.8);
        if (Math.random() < 0.4) splash.ripple(this.bladePoint.x, this.bladePoint.z, 0.35);
      }
    }
  }

  private spawnWake(dt: number): void {
    const splash = this.splash;
    if (!splash) return;
    const speed = Math.hypot(this.boat.vx, this.boat.vz);
    this.wakeAt += dt;
    if (this.wakeAt < WAKE_INTERVAL) return;
    this.wakeAt = 0;
    if (speed < 0.5 || this.phase !== "rowing") return;
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
    this.counter.textContent = `GREEN LIGHT ${distance} M · ${this.strokes} STROKES · CURRENT ${currentSpeed(distance).toFixed(1)} M/S`;
  }

  private readonly onPointerDown = (event: PointerEvent): void => {
    if (this.phase !== "rowing" || event.button !== 0) return;
    this.dragging = true;
    this.grabX = event.clientX / Math.max(1, window.innerWidth);
    this.grabY = event.clientY / Math.max(1, window.innerHeight);
    this.strokeAtGrab = this.stroke;
    this.trimTarget = 0;
    this.ctx.engine.domElement.style.cursor = "grabbing";
  };

  private readonly onPointerMove = (event: PointerEvent): void => {
    if (!this.dragging || this.phase !== "rowing") return;
    const x = event.clientX / Math.max(1, window.innerWidth);
    const y = event.clientY / Math.max(1, window.innerHeight);
    this.stroke = THREE.MathUtils.clamp(this.strokeAtGrab + (y - this.grabY) / DRAG_SPAN, -1, 1);
    this.trimTarget = THREE.MathUtils.clamp((x - this.grabX) / TRIM_SPAN, -1, 1);
  };

  private readonly onPointerUp = (): void => {
    if (!this.dragging) return;
    this.dragging = false;
    this.trimTarget = 0;
    if (this.phase === "rowing") this.ctx.engine.domElement.style.cursor = "grab";
  };
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
    entry.light.intensity = 0.22;
    return;
  }
  if (entry.light instanceof THREE.DirectionalLight) {
    entry.light.color.set("#a9c2f0");
    entry.light.intensity = 0.62;
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
