import {
  AdditiveBlending,
  BoxGeometry,
  BufferGeometry,
  CapsuleGeometry,
  Float32BufferAttribute,
  Group,
  Mesh,
  MeshStandardMaterial,
  Points,
  PointsMaterial,
  Scene,
  SphereGeometry,
  Vector3,
} from "three";
import { crateCounter } from "../../frontend/src/ui";
import { MYRTLE_Z } from "../../frontend/src/world-constants";

const randomBetween = (min: number, max: number): number => min + Math.random() * (max - min);

interface WilsonFigure {
  root: Group;
  pelvis: Mesh;
  torso: Mesh;
  head: Mesh;
  arms: [Mesh, Mesh];
  legs: [Mesh, Mesh];
}

/** Owns the visual and HUD elements that play after Myrtle is struck. */
export class MyrtleAftermath {
  private readonly trailCapacity = 180;
  private readonly trailLifetime = 1.25;
  private trail: Points | null = null;
  private trailGeometry: BufferGeometry | null = null;
  private trailMaterial: PointsMaterial | null = null;
  private trailVelocities = new Float32Array(0);
  private trailAges = new Float32Array(0);
  private trailCursor = 0;
  private emitAccumulator = 0;
  private readonly lastCenter = new Vector3();
  private hasLastCenter = false;
  private flightDistance = 0;
  private wilson: WilsonFigure | null = null;
  private readonly wilsonStart = new Vector3();
  private readonly wilsonDestination = new Vector3();
  private wilsonArrived = false;
  private griefCaptionShown = false;

  constructor(
    private readonly scene: Scene,
    private readonly say: (text: string, hold?: number, priority?: boolean) => void,
  ) {}

  start(center: Vector3): void {
    this.disposeTrail();
    this.disposeWilson();
    this.flightDistance = 0;
    this.emitAccumulator = 0;
    this.createTrail();
    this.lastCenter.copy(center);
    this.hasLastCenter = true;
    this.createWilson(center);
    crateCounter.classList.add("myrtle-flight-counter");
    crateCounter.setAttribute("aria-live", "off");
    crateCounter.textContent = "MYRTLE AIRBORNE · 0.0 M";
    crateCounter.style.opacity = "1";
  }

  update(dt: number, elapsed: number, time: number, center: Vector3): void {
    this.updateTrail(dt, elapsed, center);
    this.updateWilson(elapsed, time, center);
  }

  dispose(): void {
    this.disposeTrail();
    this.disposeWilson();
    crateCounter.classList.remove("myrtle-flight-counter");
    crateCounter.textContent = "";
    crateCounter.setAttribute("aria-live", "polite");
    crateCounter.style.opacity = "";
  }

  private createTrail(): void {
    const positions = new Float32Array(this.trailCapacity * 3);
    const colors = new Float32Array(this.trailCapacity * 3);
    this.trailVelocities = new Float32Array(this.trailCapacity * 3);
    this.trailAges = new Float32Array(this.trailCapacity);
    this.trailAges.fill(this.trailLifetime);

    this.trailGeometry = new BufferGeometry();
    this.trailGeometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
    this.trailGeometry.setAttribute("color", new Float32BufferAttribute(colors, 3));
    this.trailMaterial = new PointsMaterial({
      color: "#ffffff",
      size: 0.15,
      transparent: true,
      opacity: 0.9,
      vertexColors: true,
      blending: AdditiveBlending,
      depthWrite: false,
      sizeAttenuation: true,
    });
    this.trail = new Points(this.trailGeometry, this.trailMaterial);
    this.trail.name = "myrtleFlightTrail";
    this.trail.renderOrder = 3;
    this.trail.frustumCulled = false;
    this.scene.add(this.trail);
    this.trailCursor = 0;
    this.hasLastCenter = false;
  }

  private updateTrail(dt: number, elapsed: number, center: Vector3): void {
    if (!this.trailGeometry || !this.trailMaterial) return;
    const positions = this.trailGeometry.getAttribute("position") as Float32BufferAttribute;
    const colors = this.trailGeometry.getAttribute("color") as Float32BufferAttribute;
    const displacement = this.hasLastCenter ? center.distanceTo(this.lastCenter) : 0;
    const velocity = this.hasLastCenter && dt > 0
      ? center.clone().sub(this.lastCenter).multiplyScalar(1 / dt)
      : new Vector3();
    velocity.y = 0;
    if (velocity.length() > 48) velocity.setLength(48);
    this.lastCenter.copy(center);
    this.hasLastCenter = true;

    for (let index = 0; index < positions.count; index++) {
      const offset = index * 3;
      if (this.trailAges[index] >= this.trailLifetime) {
        colors.setXYZ(index, 0, 0, 0);
        continue;
      }
      this.trailAges[index] += dt;
      positions.array[offset] += this.trailVelocities[offset] * dt;
      positions.array[offset + 1] += this.trailVelocities[offset + 1] * dt;
      positions.array[offset + 2] += this.trailVelocities[offset + 2] * dt;
      this.trailVelocities[offset + 1] += 0.12 * dt;
      const fade = Math.max(0, 1 - this.trailAges[index] / this.trailLifetime);
      colors.setXYZ(index, fade, fade * (0.55 + (index % 4) * 0.08), fade * 0.22);
    }

    if (elapsed < 4.2 && velocity.length() > 0.65) {
      this.emitAccumulator += dt;
      while (this.emitAccumulator >= 0.035) {
        this.emitAccumulator -= 0.035;
        this.emitParticle(positions, colors, velocity, center);
      }
    }

    positions.needsUpdate = true;
    colors.needsUpdate = true;
    this.flightDistance += displacement;
    crateCounter.textContent = `MYRTLE AIRBORNE · ${this.flightDistance.toFixed(1)} M`;
  }

  private emitParticle(
    positions: Float32BufferAttribute,
    colors: Float32BufferAttribute,
    velocity: Vector3,
    center: Vector3,
  ): void {
    const index = this.trailCursor;
    this.trailCursor = (this.trailCursor + 1) % positions.count;
    const offset = index * 3;
    const direction = velocity.clone().normalize();
    const spread = new Vector3(
      (Math.random() - 0.5) * 0.48,
      randomBetween(-0.05, 0.28),
      (Math.random() - 0.5) * 0.48,
    );
    positions.setXYZ(
      index,
      center.x - direction.x * 0.22 + spread.x,
      center.y + spread.y,
      center.z - direction.z * 0.22 + spread.z,
    );
    colors.setXYZ(index, 1, 0.7, 0.22);
    this.trailVelocities[offset] = -direction.x * randomBetween(0.45, 1.6) + randomBetween(-0.35, 0.35);
    this.trailVelocities[offset + 1] = randomBetween(0.25, 0.95);
    this.trailVelocities[offset + 2] = -direction.z * randomBetween(0.45, 1.6) + randomBetween(-0.35, 0.35);
    this.trailAges[index] = 0;
  }

  private disposeTrail(): void {
    this.trail?.removeFromParent();
    this.trailGeometry?.dispose();
    this.trailMaterial?.dispose();
    this.trail = null;
    this.trailGeometry = null;
    this.trailMaterial = null;
    this.trailVelocities = new Float32Array(0);
    this.trailAges = new Float32Array(0);
    this.trailCursor = 0;
    this.emitAccumulator = 0;
    this.hasLastCenter = false;
  }

  private createWilson(center: Vector3): void {
    const root = new Group();
    root.name = "wilsonGrieving";
    this.wilsonStart.set(8.6, 0, MYRTLE_Z + 3.2);
    root.position.copy(this.wilsonStart);
    const makeMesh = (
      name: string,
      geometry: BoxGeometry | CapsuleGeometry | SphereGeometry,
      color: string,
    ): Mesh => {
      const mesh = new Mesh(geometry, new MeshStandardMaterial({ color, roughness: 0.94 }));
      mesh.name = `wilson:${name}`;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      root.add(mesh);
      return mesh;
    };

    const pelvis = makeMesh("pelvis", new BoxGeometry(0.42, 0.24, 0.3), "#302c2a");
    const torso = makeMesh("coat", new CapsuleGeometry(0.24, 0.47, 4, 8), "#393735");
    const head = makeMesh("head", new SphereGeometry(0.17, 12, 10), "#bd8a69");
    const arms: [Mesh, Mesh] = [
      makeMesh("leftArm", new CapsuleGeometry(0.075, 0.35, 3, 7), "#45413b"),
      makeMesh("rightArm", new CapsuleGeometry(0.075, 0.35, 3, 7), "#45413b"),
    ];
    const legs: [Mesh, Mesh] = [
      makeMesh("leftLeg", new CapsuleGeometry(0.105, 0.43, 3, 8), "#282827"),
      makeMesh("rightLeg", new CapsuleGeometry(0.105, 0.43, 3, 8), "#282827"),
    ];
    this.wilson = { root, pelvis, torso, head, arms, legs };
    this.wilsonDestination.set(center.x + 1.2, 0, center.z + 0.45);
    this.wilsonArrived = false;
    this.griefCaptionShown = false;
    this.scene.add(root);
    this.updateWilsonPose(0, 0);
  }

  private updateWilson(elapsed: number, time: number, center: Vector3): void {
    const wilson = this.wilson;
    if (!wilson) return;
    const progress = Math.max(0, Math.min(1, (elapsed - 0.65) / 3.45));
    const eased = progress * progress * (3 - 2 * progress);
    wilson.root.position.lerpVectors(this.wilsonStart, this.wilsonDestination, eased);
    const towardMyrtle = center.clone().sub(wilson.root.position);
    wilson.root.rotation.y = Math.atan2(towardMyrtle.x, towardMyrtle.z);

    if (progress >= 1 && !this.wilsonArrived) {
      this.wilsonArrived = true;
      this.say("“Oh, my God!” uttered over and over in a gasping moan.", 4.2, true);
    }
    const grief = Math.max(0, Math.min(1, (elapsed - 4.05) / 1.35));
    const walk = (1 - grief) * Math.sin(time * 7) * 0.28;
    this.updateWilsonPose(walk, grief);
    if (grief >= 1 && !this.griefCaptionShown) {
      this.griefCaptionShown = true;
      this.say("“God knows what you’ve been doing, everything you’ve been doing.”", 3.8, true);
    }
  }

  private updateWilsonPose(walk: number, grief: number): void {
    const wilson = this.wilson;
    if (!wilson) return;
    wilson.pelvis.position.set(0, 0.86 - grief * 0.33, 0);
    wilson.torso.position.set(0, 1.23 - grief * 0.38, 0);
    wilson.torso.rotation.x = grief * 0.5;
    wilson.head.position.set(0, 1.77 - grief * 0.55, 0.02 + grief * 0.1);
    wilson.head.rotation.x = grief * 0.35;
    wilson.arms[0].position.set(-0.3, 1.03 - grief * 0.36, 0.02 + grief * 0.22);
    wilson.arms[1].position.set(0.3, 1.03 - grief * 0.36, 0.02 + grief * 0.14);
    wilson.arms[0].rotation.set(-grief * 0.75, 0, walk + grief * 0.12);
    wilson.arms[1].rotation.set(-grief * 0.38, 0, -walk - grief * 0.12);
    wilson.legs[0].position.set(-0.13, 0.4 - grief * 0.19, 0.02 + grief * 0.16);
    wilson.legs[1].position.set(0.13, 0.4 - grief * 0.2, -0.04);
    wilson.legs[0].rotation.set(grief * 1.15, 0, walk * 0.45);
    wilson.legs[1].rotation.set(-grief * 0.42, 0, -walk * 0.4);
  }

  private disposeWilson(): void {
    const root = this.wilson?.root;
    if (!root) {
      this.wilson = null;
      return;
    }
    root.removeFromParent();
    root.traverse((object) => {
      if (!(object instanceof Mesh)) return;
      object.geometry.dispose();
      if (Array.isArray(object.material)) object.material.forEach((material) => material.dispose());
      else object.material.dispose();
    });
    this.wilson = null;
    this.wilsonArrived = false;
    this.griefCaptionShown = false;
  }
}
