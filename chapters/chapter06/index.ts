import { AdditiveBlending, BufferGeometry, Float32BufferAttribute, Points, PointsMaterial, Vector3 } from "three";
import { PhysicsViewer } from "../../frontend/src/three-compat";
import type { PhysicsBody } from "../../frontend/src/physics";
import type { ChapterContext, ChapterOutcome } from "../../frontend/src/chapters/types";
import { toMph } from "../../frontend/src/chapters/types";
import { showCaption, feedCaptions } from "../../frontend/src/ui";
import { MYRTLE_Z, FINISH_Z, BEATS, type RoundPhase } from "./constants";
import manifest from "./assets/manifest.json";

const randomBetween = (min: number, max: number): number => min + Math.random() * (max - min);

export const id = "crashDrive";
export const name = manifest.name;
export const blurb = manifest.blurb;
export const command = manifest.command;
export const how = manifest.how;
export const duration = manifest.duration;

export class CrashDriveChapter {
  readonly id = id;
  readonly name = name;
  readonly blurb = blurb;
  readonly command = command;
  readonly how = how;
  readonly duration = duration;
  private timeScaleHint = 1;
  get physicsScale(): number { return this.timeScaleHint; }
  private readonly ctx: ChapterContext;
  private phase: RoundPhase = "driving";

  private won = false;
  private expired = false;
  private shake = 0;
  private captionQueue: { text: string; hold: number }[] = [];
  private captionTimer = 0;
  private impactElapsed = 0;
  private impactMph = 0;
  private crossingStarted = false;
  private waveAnnounced = false;
  private hit = false;
  private missed = false;
  private aftermath = false;
  private viewer: PhysicsViewer | null = null;
  private distortion = 0;
  private distortionTarget = 0;
  private distortionEnvelope = 0;
  private nextDistortionAt = 0;
  private nextSlipAt = 0;
  private slipUntil = 0;
  private slipSteer = 0;
  private time = 0;
  private introElapsed = 0;
  private readonly lookAt = new Vector3(0, 1.1, 8);
  private readonly cameraDesired = new Vector3();
  private readonly targetDesired = new Vector3();
  private impactParticles: Points | null = null;
  private impactParticleGeometry: BufferGeometry | null = null;
  private impactParticleMaterial: PointsMaterial | null = null;
  private impactParticleVelocities = new Float32Array(0);
  private impactParticleLife = 0;
  private readonly unsubscribes: (() => void)[] = [];

  constructor(ctx: ChapterContext) {
    this.ctx = ctx;
    this.unsubscribes.push(ctx.onKey((key: string) => {
      if (key === "p") this.toggleColliders();
    }));
  }

  start(): void {
    const { car, myrtle } = this.requireValley();
    this.time = 0;
    this.introElapsed = 0;
    this.disposeImpactParticles();
    car.reset(); myrtle.reset(); this.phase = "driving"; this.won = false; this.expired = false;
    this.timeScaleHint = 1; this.shake = 0; this.captionQueue.length = 0; this.captionTimer = 0;
    this.impactElapsed = 0; this.impactMph = 0; this.crossingStarted = false; this.waveAnnounced = false;
    this.hit = false; this.missed = false; this.aftermath = false; this.distortion = 0; this.distortionTarget = 0; this.distortionEnvelope = 0;
    this.nextDistortionAt = randomBetween(1.8, 4.5); this.nextSlipAt = randomBetween(2.5, 5.5); this.slipUntil = 0; this.slipSteer = 0;
    for (const beat of BEATS) beat.done = false;
    this.ctx.dom.flash.classList.remove("fire");
    this.ctx.dom.hud.classList.add("live"); this.ctx.dom.letterbox.classList.add("on");
    this.snapCamera(); this.say("The engine catches. The ash lifts off the road.", 2.6);
  }

  dispose(): void {
    for (const off of this.unsubscribes) off(); this.unsubscribes.length = 0;
    this.viewer?.dispose(); this.viewer = null;
    this.disposeImpactParticles();
  }

  outcome(): ChapterOutcome {
    if (this.phase === "impact") return "pending";
    if (this.expired || this.missed) return "lose";
    return this.hit && this.won && this.phase === "complete" ? "win" : "pending";
  }
  expire(): void {
    if (this.expired || this.phase === "complete") return;
    this.expired = true; this.phase = "complete"; this.say("The hour grew late. The crossing went unwatched.", 4, true);
  }
  abandon(): void { this.phase = "complete"; this.expired = true; }

  flavor(outcome: "win" | "lose"): { kicker: string; title: string; body: string; quote: string; cite: string } {
    const { car } = this.requireValley();
    const speedLine = this.hit ? `You struck at <b>${this.impactMph} mph</b>.` : `The clock ran out at <b>${Math.round(toMph(car.speed))} mph</b>.`;
    const flavorText = manifest.flavor[outcome];
    return {
      kicker: flavorText.kicker,
      title: flavorText.title,
      body: flavorText.body.replace("{speedLine}", speedLine),
      quote: flavorText.quote,
      cite: flavorText.cite,
    };
  }
  private requireValley() {
    const { scene, car, myrtle, world, audio } = this.ctx;
    if (!car || !myrtle || !world) throw new Error("The Valley chapter requires the road scene.");
    return { scene, car, myrtle, world, audio };
  }

  private showCaption(text: string, hold: number): void {
    showCaption(text, hold);
    this.captionTimer = hold;
  }
  private say(text: string, hold = 4.4, priority = false): void {
    if (priority) {
      this.captionQueue.length = 0;
      this.showCaption(text, hold);
      return;
    }
    if (this.captionTimer > 0) {
      this.captionQueue.push({ text, hold });
      return;
    }
    this.showCaption(text, hold);
  }

  private feedCaptions(dt: number): void {
    const state = { captionTimer: this.captionTimer, captionQueue: this.captionQueue };
    feedCaptions(dt, state);
    this.captionTimer = state.captionTimer;
  }
  private toggleColliders(): void {
    const { scene, myrtle } = this.requireValley();
    if (this.viewer) { this.viewer.dispose(); this.viewer = null; this.say("COLLIDERS OFF", 1.2); return; }
    this.viewer = new PhysicsViewer(scene);
    for (const part of myrtle.parts) this.viewer.showBody(part.body);
    const carBody = scene.getObjectByName("carRoot")?.userData.physicsBody;
    if (carBody) this.viewer.showBody(carBody as PhysicsBody);
    this.say("COLLIDERS ON", 1.2);
  }
  private snapCamera(): void { this.placeCamera(0, true); }
  private placeCamera(dt: number, snap = false): void {
    const { camera, car, myrtle } = { ...this.ctx, ...this.requireValley() };
    const fwd = car.forward;
    const carPos = car.root.position;
    const speedRatio = Math.min(1, Math.abs(car.speed) / 31);
    let rate = 6.5;

    if (this.aftermath) {
      const center = myrtle.getCenter();
      this.cameraDesired.copy(center).add(new Vector3(4.6, 1.9, -4.2));
      this.targetDesired.copy(center).add(new Vector3(0, 0.15, 0));
      camera.fov = 46;
      rate = 3.4;
    } else {
      const chasePosition = carPos.clone().addScaledVector(fwd, -7.4 - speedRatio * 1.2).add(new Vector3(0, 2.9, 0));
      const chaseTarget = carPos.clone().addScaledVector(fwd, 10).add(new Vector3(0, 1.05, 0));
      if (this.introElapsed < 2.4) {
        const myrtleCenter = myrtle.getCenter();
        const introPosition = myrtleCenter.clone().add(new Vector3(4.6, 2.8, -6.5));
        const introTarget = myrtleCenter.clone().add(new Vector3(0, 0.7, 0));
        const progress = Math.max(0, Math.min(1, this.introElapsed / 2.4));
        const eased = progress * progress * (3 - 2 * progress);
        this.cameraDesired.copy(introPosition).lerp(chasePosition, eased);
        this.targetDesired.copy(introTarget).lerp(chaseTarget, eased);
        camera.fov = 48 + (52 + speedRatio * 6 - 48) * eased;
        rate = eased < 0.92 ? 3.4 : 6.5;
      } else {
        this.cameraDesired.copy(chasePosition);
        this.targetDesired.copy(chaseTarget);
        camera.fov = 52 + speedRatio * 6;
      }
    }

    if (!this.aftermath && this.distortion > 0.01) {
      rate *= Math.max(0.45, 1 - 0.5 * this.distortion);
      camera.fov += this.distortion * (19.5 + 5.7 * Math.sin(this.time * 2.4 + this.distortionEnvelope));
    }
    const blend = snap ? 1 : 1 - Math.exp(-rate * dt);
    camera.position.lerp(this.cameraDesired, blend);
    this.lookAt.lerp(this.targetDesired, snap ? 1 : 1 - Math.exp(-(rate + 3) * dt));
    if (this.aftermath && myrtle.mode === "ragdoll") {
      this.lookAt.copy(this.targetDesired);
      this.cameraDesired.copy(this.targetDesired).add(new Vector3(4.6, 1.9, -4.2));
      camera.position.lerp(this.cameraDesired, 1 - Math.exp(-dt * 3.4));
    }
    const amount = this.shake * 0.28;
    if (amount > 0.001) camera.position.add(new Vector3((Math.random() - 0.5) * amount, (Math.random() - 0.5) * amount, (Math.random() - 0.5) * amount));
    camera.lookAt(this.lookAt);
    if (!this.aftermath && this.distortion > 0.01) camera.rotation.z += Math.sin(this.time * 3.1) * 0.14 * this.distortion + Math.sin(this.time * 7.7) * 0.035 * this.distortion;
  }
  private checkStory(): void {
    const { car, myrtle } = this.requireValley();
    for (const beat of BEATS) if (!beat.done && car.root.position.z > beat.z) { beat.done = true; this.say(beat.text, beat.hold); }
    const remaining = MYRTLE_Z - car.root.position.z, triggerAt = Math.min(122, Math.max(46, Math.abs(car.speed) * 3.4 + 16));
    if (!this.crossingStarted && remaining > 0 && remaining < triggerAt) { this.crossingStarted = true; myrtle.startCrossing(); this.say("Myrtle steps into the road. Hit her before she crosses!", 4, true); }
    if (!this.waveAnnounced && myrtle.mode === "waving") { this.waveAnnounced = true; this.say("Myrtle waves in the middle of the road. Keep your speed up!", 4.4, true); }
  }
  private checkHit(): void {
    const { car, myrtle } = this.requireValley();
    if (this.hit || myrtle.mode === "ragdoll" || Math.abs(car.speed) < 1.4 || Math.abs(car.root.position.z - MYRTLE_Z) > 8) return;
    for (const point of myrtle.getHitTestPoints()) if (car.isPointInside(point.x, point.z, 0.7)) { this.triggerImpact(); return; }
  }
  private triggerImpact(): void {
    const { car, myrtle, audio } = this.requireValley();
    this.hit = true; this.aftermath = true; this.phase = "impact"; this.impactElapsed = 0;
    this.impactMph = Math.round(toMph(car.speed)); this.timeScaleHint = 0.34; this.won = true;
    this.spawnImpactParticles(myrtle.getCenter());
    myrtle.activate(car.forward.multiplyScalar(Math.max(5, Math.abs(car.speed)))); car.crashed = true;
    audio.impact(); this.ctx.dom.flash.classList.add("fire");
    window.setTimeout(() => this.ctx.dom.flash.classList.remove("fire"), 120);
    this.shake = 1.15; this.captionQueue.length = 0; this.captionTimer = 0;
    this.ctx.dom.subtitle.classList.remove("show"); this.ctx.dom.subtitle.textContent = "";
  }
  idle(dt: number): void {
    const { car, myrtle, world, audio } = this.requireValley(); this.time += dt;
    car.update(dt, { throttle: 0, brake: 0, steer: 0, handbrake: false }, false);
    myrtle.update(dt, car.root.position.z); world.update(dt, car.root.position); this.feedCaptions(dt); audio.setEngine(0, 0, false);
    this.captionQueue.length = 0; this.captionTimer = 0; this.ctx.dom.subtitle.classList.remove("show"); this.ctx.dom.subtitle.textContent = "";
    const angle = this.time * 0.16, radius = 9.5, center = car.root.position;
    this.ctx.camera.position.set(center.x + Math.sin(angle) * radius, 4.4, center.z - Math.cos(angle) * radius);
    this.ctx.camera.lookAt(new Vector3(center.x, 1, center.z + 2)); this.ctx.camera.fov = 52;
  }
  update(dt: number): void {
    const { car, myrtle, world, audio } = this.requireValley();
    const { keys } = this.ctx;
    this.time += dt;
    this.introElapsed += dt;
    const scaled = dt * this.timeScaleHint, controlEnabled = this.phase === "driving";
    const steer = Number(keys.has("arrowright")) - Number(keys.has("arrowleft")) + Number(keys.has("a")) - Number(keys.has("d"));
    const throttle = Number(keys.has("w") || keys.has("arrowup"));
    const brake = Number(keys.has("s") || keys.has("arrowdown"));
    const input = { throttle, brake, steer, handbrake: keys.has(" ") };
    car.update(scaled, controlEnabled ? input : { throttle: 0, brake: 0, steer: 0, handbrake: false }, controlEnabled);
    myrtle.update(scaled, car.root.position.z); world.update(scaled, car.root.position);
    if (this.phase === "driving") this.checkStory();
    if (this.phase === "driving" || this.phase === "impact") this.checkHit();
    if (this.phase === "driving") {
      if (this.time >= this.nextDistortionAt) {
        this.distortionEnvelope = randomBetween(0.35, 1);
        this.distortionTarget = randomBetween(0.3, 0.9);
        this.nextDistortionAt = this.time + randomBetween(2.2, 6.4);
      }
      if (this.time >= this.nextSlipAt) {
        const severity = randomBetween(0.12, 0.82);
        this.slipUntil = this.time + randomBetween(0.28, 1.05);
        this.slipSteer = randomBetween(-1, 1) * severity;
        this.nextSlipAt = this.slipUntil + randomBetween(1.6, 6.5);
      }
    }
    const slipping = this.phase === "driving" && this.time < this.slipUntil;
    if (slipping) {
      car.steer += (this.slipSteer - car.steer) * Math.min(1, scaled * 2.4);
      car.yaw += this.slipSteer * Math.min(1, Math.abs(car.speed) / 10) * scaled * 0.5;
    }
    if (this.aftermath) this.distortionTarget = this.impactElapsed < 1.4 ? 1 : 0.45;
    else if (this.phase !== "driving") this.distortionTarget = 0;
    this.distortion += (this.distortionTarget - this.distortion) * Math.min(1, scaled * randomBetween(1.6, 3.4));
    if (this.phase === "impact") {
      this.impactElapsed += scaled;
      this.updateImpactParticles(dt);
      if (this.impactElapsed > 0.45) this.timeScaleHint += (1 - this.timeScaleHint) * Math.min(1, scaled * 0.85);
      this.shake *= Math.max(0, 1 - scaled * 2.2);
      if (this.impactElapsed > 3.1) this.phase = "complete";
    } else { this.timeScaleHint = 1; this.shake *= Math.max(0, 1 - scaled * 3.4); }
    if (this.phase === "driving" && !this.hit && !this.missed && (car.root.position.z > FINISH_Z || (this.crossingStarted && myrtle.position.x < -2))) {
      this.missed = true; this.won = false; this.phase = "complete";
      this.say("Myrtle made it across. The yellow car missed its chance.", 3.4, true);
    }
    this.feedCaptions(scaled); this.updateHud(); this.placeCamera(scaled); audio.setEngine(car.speed, input.throttle, car.crashed);
  }
  private spawnImpactParticles(center: Vector3): void {
    this.disposeImpactParticles();
    const count = 72;
    const positions = new Float32Array(count * 3);
    this.impactParticleVelocities = new Float32Array(count * 3);
    for (let index = 0; index < count; index++) {
      const offset = index * 3;
      positions[offset] = center.x; positions[offset + 1] = center.y; positions[offset + 2] = center.z;
      const angle = Math.random() * Math.PI * 2;
      const speed = randomBetween(1.8, 5.4);
      this.impactParticleVelocities[offset] = Math.cos(angle) * speed;
      this.impactParticleVelocities[offset + 1] = randomBetween(1.2, 5.8);
      this.impactParticleVelocities[offset + 2] = Math.sin(angle) * speed;
    }
    this.impactParticleGeometry = new BufferGeometry();
    this.impactParticleGeometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
    this.impactParticleMaterial = new PointsMaterial({ color: "#fff6df", size: 0.19, transparent: true, opacity: 1, blending: AdditiveBlending, depthWrite: false, sizeAttenuation: true });
    this.impactParticles = new Points(this.impactParticleGeometry, this.impactParticleMaterial);
    this.impactParticles.name = "myrtleImpactParticles";
    this.impactParticles.renderOrder = 3;
    this.impactParticles.frustumCulled = false;
    this.ctx.scene.add(this.impactParticles);
    this.impactParticleLife = 1.35;
  }
  private updateImpactParticles(dt: number): void {
    if (!this.impactParticles || !this.impactParticleGeometry || !this.impactParticleMaterial) return;
    this.impactParticleLife = Math.max(0, this.impactParticleLife - dt);
    const positions = this.impactParticleGeometry.getAttribute("position") as Float32BufferAttribute;
    for (let index = 0; index < positions.count; index++) {
      const offset = index * 3;
      positions.array[offset] += this.impactParticleVelocities[offset] * dt;
      positions.array[offset + 1] += this.impactParticleVelocities[offset + 1] * dt;
      positions.array[offset + 2] += this.impactParticleVelocities[offset + 2] * dt;
      this.impactParticleVelocities[offset + 1] -= 5.8 * dt;
    }
    positions.needsUpdate = true;
    this.impactParticleMaterial.opacity = Math.min(1, this.impactParticleLife / 0.45);
    if (this.impactParticleLife === 0) this.disposeImpactParticles();
  }
  private disposeImpactParticles(): void {
    this.impactParticles?.removeFromParent();
    this.impactParticleGeometry?.dispose();
    this.impactParticleMaterial?.dispose();
    this.impactParticles = null; this.impactParticleGeometry = null; this.impactParticleMaterial = null;
    this.impactParticleVelocities = new Float32Array(0); this.impactParticleLife = 0;
  }
  private updateHud(): void {
    const { car } = this.requireValley();
    this.ctx.dom.speedValue.textContent = String(Math.round(toMph(car.speed)));
    this.ctx.dom.gearValue.textContent = car.speed < -0.3 ? "R" : Math.abs(car.speed) < 0.4 ? "N" : toMph(car.speed) > 42 ? "III" : toMph(car.speed) > 18 ? "II" : "I";
    this.ctx.dom.distanceValue.textContent = String(Math.max(0, Math.round(MYRTLE_Z - car.root.position.z)));
  }
}
