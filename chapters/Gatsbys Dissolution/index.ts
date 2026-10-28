import * as THREE from "three";
import type { Chapter, ChapterContext, ChapterFlavor, ChapterOutcome } from "../../frontend/src/chapters/types";
import { disposeObjectTree } from "../../frontend/src/scene-resources";
import manifest from "./assets/manifest.json";

export class GatsbysDissolutionChapter implements Chapter {
  readonly id = "gatsbysDissolution";
  readonly name = manifest.name;
  readonly blurb = manifest.blurb;
  readonly command = manifest.command;
  readonly how = manifest.how;
  readonly physicsScale = 1;

  private readonly ctx: ChapterContext;
  private readonly group = new THREE.Group();
  private readonly raycaster = new THREE.Raycaster();
  private readonly aim = new THREE.Vector2();
  private readonly muzzle = new THREE.Vector3();
  private readonly shotStart = new THREE.Vector3();
  private readonly shotEnd = new THREE.Vector3();
  private readonly shotCurve = new THREE.Vector3();
  private readonly bullet = new THREE.Mesh(new THREE.SphereGeometry(0.045, 10, 8), new THREE.MeshBasicMaterial({ color: 0xffefbd, toneMapped: false }));
  private readonly particles: THREE.Mesh[] = [];
  private readonly particleGeometry = new THREE.SphereGeometry(0.035, 6, 5);
  private readonly particleMaterial = new THREE.MeshBasicMaterial({ color: 0xffc36a, toneMapped: false });
  private readonly impactMaterial = new THREE.MeshBasicMaterial({ color: 0x8bffe0, toneMapped: false });
  private readonly flash = new THREE.PointLight(0xffc16a, 0, 8, 2);
  private readonly removeKeyHandler: () => void;
  private readonly savedPosition = new THREE.Vector3();
  private readonly savedQuaternion = new THREE.Quaternion();
  private savedFov = 50;
  private savedBackground: THREE.Scene["background"] = null;
  private savedFog: THREE.Scene["fog"] = null;
  private reticle: HTMLDivElement | null = null;
  private head: THREE.Mesh | null = null;
  private gun: THREE.Group | null = null;
  private phase: "aiming" | "bullet" | "impact" | "done" = "aiming";
  private result: ChapterOutcome = "pending";
  private bulletElapsed = 0;
  private impactElapsed = 0;
  private bulletHit = false;
  private shot = false;
  private time = 0;

  constructor(ctx: ChapterContext) {
    this.ctx = ctx;
    this.removeKeyHandler = ctx.onKey((key) => {
      if (key === "escape") this.abandon();
    });
  }

  start(): void {
    this.clearScene();
    const { camera, scene, engine } = this.ctx;
    this.savedPosition.copy(camera.position);
    this.savedQuaternion.copy(camera.quaternion);
    this.savedFov = camera.fov;
    this.savedBackground = scene.background;
    this.savedFog = scene.fog;
    scene.background = new THREE.Color("#070b13");
    scene.fog = new THREE.Fog("#111722", 13, 42);
    camera.position.set(0, 1.72, 7.8);
    camera.lookAt(0, 1.55, -2.7);
    camera.fov = 48;
    camera.updateProjectionMatrix();

    this.phase = "aiming";
    this.result = "pending";
    this.bulletElapsed = 0;
    this.impactElapsed = 0;
    this.bulletHit = false;
    this.shot = false;
    this.time = 0;
    this.aim.set(0, 0);
    this.group.name = "gatsbys-dissolution";
    scene.add(this.group);
    this.buildPoolScene();
    this.buildGatsby();
    this.buildGun();
    this.buildParticles();
    this.group.add(this.bullet, this.flash);
    this.bullet.visible = false;
    engine.domElement.style.cursor = "none";
    this.createReticle();
    engine.domElement.addEventListener("pointermove", this.onPointerMove);
    engine.domElement.addEventListener("pointerdown", this.onPointerDown);
    window.addEventListener("blur", this.onBlur);
    this.ctx.say("The pool is still. Gatsby faces the water. Hold the trembling sight on him, then left-click once.", 5.5, true);
  }

  update(dt: number): void {
    if (this.phase === "done") return;
    this.time += dt;
    if (this.phase === "aiming") {
      this.updateGunShake();
      return;
    }
    if (this.phase === "impact") {
      this.impactElapsed += dt;
      this.updateParticles(dt);
      this.flash.intensity = Math.max(0, this.flash.intensity - dt * 120);
      if (this.impactElapsed >= 0.85) this.finish(this.bulletHit);
      return;
    }
    // Let the bullet and impact play out at 18% speed while the rest of the
    // world appears to hang in the same suspended moment.
    const slowDt = dt * 0.18;
    this.bulletElapsed += slowDt;
    const progress = THREE.MathUtils.clamp(this.bulletElapsed / 1.25, 0, 1);
    const firstHalf = Math.min(progress * 2, 1);
    const secondHalf = Math.max((progress - 0.5) * 2, 0);
    this.bullet.position.copy(this.shotStart).lerp(this.shotCurve, firstHalf);
    if (progress > 0.5) this.bullet.position.lerpVectors(this.shotCurve, this.shotEnd, secondHalf);
    this.updateParticles(slowDt);
    this.flash.intensity = Math.max(0, this.flash.intensity - dt * 120);
    if (progress >= 1) {
      this.burst(this.shotEnd, this.bulletHit ? 1.7 : 0.9, "impact");
      this.phase = "impact";
      this.impactElapsed = 0;
    }
  }

  idle(_dt: number): void {}

  abandon(): void {
    this.phase = "done";
    this.result = "pending";
    this.ctx.engine.domElement.removeEventListener("pointermove", this.onPointerMove);
    this.ctx.engine.domElement.removeEventListener("pointerdown", this.onPointerDown);
    window.removeEventListener("blur", this.onBlur);
    this.ctx.engine.domElement.style.cursor = "default";
  }

  outcome(): ChapterOutcome {
    return this.result;
  }

  flavor(outcome: "win" | "lose"): ChapterFlavor {
    return manifest.flavor[outcome];
  }

  dispose(): void {
    const canvas = this.ctx.engine.domElement;
    canvas.removeEventListener("pointermove", this.onPointerMove);
    canvas.removeEventListener("pointerdown", this.onPointerDown);
    window.removeEventListener("blur", this.onBlur);
    canvas.style.cursor = "default";
    this.reticle?.remove();
    this.reticle = null;
    this.ctx.scene.remove(this.group);
    if (this.gun) {
      this.ctx.camera.remove(this.gun);
      disposeObjectTree(this.gun);
    }
    this.ctx.camera.position.copy(this.savedPosition);
    this.ctx.camera.quaternion.copy(this.savedQuaternion);
    this.ctx.camera.fov = this.savedFov;
    this.ctx.camera.updateProjectionMatrix();
    this.ctx.scene.background = this.savedBackground;
    this.ctx.scene.fog = this.savedFog;
    disposeObjectTree(this.group);
    this.impactMaterial.dispose();
    this.group.clear();
    this.head = null;
    this.gun = null;
    this.particles.length = 0;
    this.removeKeyHandler();
  }

  private buildPoolScene(): void {
    const poolFrame = new THREE.Mesh(new THREE.BoxGeometry(8.6, 0.3, 5.5), new THREE.MeshStandardMaterial({ color: "#39414b", roughness: 0.34, metalness: 0.45 }));
    poolFrame.position.set(0, 0.08, -7.2);
    this.group.add(poolFrame);
    const water = new THREE.Mesh(new THREE.PlaneGeometry(8, 4.9, 24, 16), new THREE.MeshStandardMaterial({ color: "#12384a", roughness: 0.16, metalness: 0.55, emissive: "#071a23", emissiveIntensity: 0.5, side: THREE.DoubleSide }));
    water.rotation.x = -Math.PI / 2;
    water.position.set(0, 0.26, -7.2);
    this.group.add(water);
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(90, 90), new THREE.MeshStandardMaterial({ color: "#151923", roughness: 0.9 }));
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(0, -0.1, -12);
    this.group.add(ground);
    const moon = new THREE.Mesh(new THREE.SphereGeometry(1.6, 24, 18), new THREE.MeshBasicMaterial({ color: "#e7e4d7", toneMapped: false }));
    moon.position.set(-9, 10, -21);
    this.group.add(moon);
    const moonlight = new THREE.DirectionalLight("#b9cceb", 2.4);
    moonlight.position.set(-8, 12, 5);
    this.group.add(moonlight);
    this.group.add(new THREE.HemisphereLight("#9ab5d8", "#10121a", 0.85));
    const lamps = [
      [-8, 4.8, -8, "#ffd09a"], [7, 5.2, -11, "#ffb768"],
      [-5, 3.2, -17, "#8dffc9"], [5, 3.8, -20, "#c1d8ff"],
    ] as const;
    for (const [x, y, z, color] of lamps) {
      const orb = new THREE.Mesh(new THREE.SphereGeometry(0.13, 8, 8), new THREE.MeshBasicMaterial({ color, toneMapped: false }));
      orb.position.set(x, y, z);
      this.group.add(orb);
      const lamp = new THREE.PointLight(color, 18, 16, 2);
      lamp.position.copy(orb.position);
      this.group.add(lamp);
    }
  }

  private buildGatsby(): void {
    const suit = new THREE.MeshStandardMaterial({ color: "#242b36", roughness: 0.74, metalness: 0.1 });
    const shirt = new THREE.MeshStandardMaterial({ color: "#c8c3b2", roughness: 0.8 });
    const hair = new THREE.MeshStandardMaterial({ color: "#40342e", roughness: 0.92 });
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.34, 0.72, 5, 12), suit);
    body.position.set(0, 1.05, -4.1);
    this.group.add(body);
    const shoulders = new THREE.Mesh(new THREE.BoxGeometry(0.96, 0.28, 0.43), suit);
    shoulders.position.set(0, 1.55, -4.1);
    this.group.add(shoulders);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.205, 18, 14), shirt);
    head.name = "gatsbys-head";
    head.position.set(0, 1.88, -4.12);
    this.group.add(head);
    const hairCap = new THREE.Mesh(new THREE.SphereGeometry(0.214, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.52), hair);
    hairCap.position.copy(head.position);
    hairCap.rotation.x = Math.PI;
    this.group.add(hairCap);
    this.head = head;
    for (const side of [-1, 1]) {
      const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.115, 0.66, 4, 8), suit);
      arm.position.set(side * 0.55, 1.11, -4.06);
      arm.rotation.z = side * -0.16;
      this.group.add(arm);
      const leg = new THREE.Mesh(new THREE.CapsuleGeometry(0.15, 0.68, 4, 8), suit);
      leg.position.set(side * 0.18, 0.38, -3.98);
      this.group.add(leg);
    }
    const poolLamp = new THREE.PointLight("#71e6b0", 20, 12, 2);
    poolLamp.position.set(0, 2.8, -7.5);
    this.group.add(poolLamp);
  }

  private buildGun(): void {
    const camera = this.ctx.camera;
    const gun = new THREE.Group();
    gun.name = "shaking-gun-sight";
    const steel = new THREE.MeshStandardMaterial({ color: "#3b414a", metalness: 0.82, roughness: 0.28 });
    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.27, 0.15), new THREE.MeshStandardMaterial({ color: "#3c2c21", roughness: 0.8 }));
    grip.position.set(0, -0.13, 0.06);
    grip.rotation.x = -0.18;
    const slide = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.12, 0.47), steel);
    slide.position.set(0, 0.035, -0.12);
    const muzzle = new THREE.Mesh(new THREE.CylinderGeometry(0.036, 0.036, 0.3, 10), steel);
    muzzle.rotation.x = Math.PI / 2;
    muzzle.position.set(0, 0.04, -0.42);
    gun.add(grip, slide, muzzle);
    gun.position.set(0.42, -0.32, -0.74);
    camera.add(gun);
    this.gun = gun;
  }

  private buildParticles(): void {
    for (let index = 0; index < 36; index += 1) {
      const particle = new THREE.Mesh(this.particleGeometry, this.particleMaterial);
      particle.visible = false;
      particle.userData.life = 0;
      this.group.add(particle);
      this.particles.push(particle);
    }
  }

  private updateGunShake(): void {
    if (!this.gun) return;
    const t = this.time;
    this.gun.position.set(0.42 + Math.sin(t * 19) * 0.026 + Math.sin(t * 37) * 0.012, -0.32 + Math.cos(t * 16) * 0.025, -0.74);
    this.gun.rotation.set(Math.sin(t * 23) * 0.035, Math.sin(t * 17) * 0.042, Math.sin(t * 29) * 0.05);
    if (this.reticle) {
      const rect = this.ctx.engine.domElement.getBoundingClientRect();
      const x = ((this.aim.x + 1) / 2) * rect.width;
      const y = ((1 - this.aim.y) / 2) * rect.height;
      this.reticle.style.left = `${x}px`;
      this.reticle.style.top = `${y}px`;
      this.reticle.style.transform = `translate(-50%, -50%) rotate(${Math.sin(t * 27) * 8}deg)`;
    }
  }

  private shoot(): void {
    if (this.phase !== "aiming" || this.shot || !this.head) return;
    this.shot = true;
    this.phase = "bullet";
    this.ctx.engine.domElement.style.cursor = "default";
    if (this.reticle) this.reticle.style.opacity = "0";
    this.ctx.say("The shot hangs in the summer air.", 3, true);

    const camera = this.ctx.camera;
    const spread = 0.007;
    const wobbleX = Math.sin(this.time * 23) * 0.006 + (Math.random() - 0.5) * spread;
    const wobbleY = Math.cos(this.time * 19) * 0.006 + (Math.random() - 0.5) * spread;
    this.raycaster.setFromCamera(new THREE.Vector2(this.aim.x + wobbleX, this.aim.y + wobbleY), camera);
    const hit = this.raycaster.intersectObject(this.head, false)[0];
    this.bulletHit = Boolean(hit);
    camera.updateMatrixWorld(true);
    this.muzzle.set(0, 0.04, -0.57);
    this.gun!.localToWorld(this.muzzle);
    this.shotStart.copy(this.muzzle);
    if (hit) this.shotEnd.copy(hit.point);
    else this.shotEnd.copy(this.raycaster.ray.origin).addScaledVector(this.raycaster.ray.direction, 30);
    this.shotCurve.copy(this.shotStart).lerp(this.shotEnd, 0.5).add(new THREE.Vector3(0, 0.42, 0));
    this.bullet.position.copy(this.shotStart);
    this.bullet.visible = true;
    this.flash.position.copy(this.shotStart);
    this.flash.intensity = 75;
    this.burst(this.shotStart, 1.3);
  }

  private burst(origin: THREE.Vector3, strength: number, effect: "muzzle" | "impact" = "muzzle"): void {
    let emitted = 0;
    for (const particle of this.particles) {
      if (particle.visible && Number(particle.userData.life) > 0) continue;
      particle.visible = true;
      particle.material = effect === "impact" ? this.impactMaterial : this.particleMaterial;
      particle.position.copy(origin);
      particle.userData.life = 0.34 + Math.random() * 0.6;
      particle.userData.vx = (Math.random() - 0.5) * (effect === "impact" ? 3.2 : 5) * strength;
      particle.userData.vy = (Math.random() * (effect === "impact" ? 2.2 : 3.8) + 0.5) * strength;
      particle.userData.vz = (Math.random() - 0.5) * (effect === "impact" ? 3.2 : 5) * strength;
      particle.scale.setScalar(0.6 + Math.random() * strength);
      if (++emitted >= 18) break;
    }
  }

  private updateParticles(dt: number): void {
    for (const particle of this.particles) {
      const life = Number(particle.userData.life);
      if (!particle.visible || life <= 0) continue;
      const nextLife = life - dt;
      particle.userData.life = nextLife;
      if (nextLife <= 0) {
        particle.visible = false;
        continue;
      }
      particle.position.x += Number(particle.userData.vx) * dt;
      particle.position.y += Number(particle.userData.vy) * dt;
      particle.position.z += Number(particle.userData.vz) * dt;
      particle.userData.vy = Number(particle.userData.vy) - 5 * dt;
      particle.scale.multiplyScalar(Math.max(0.92, 1 - dt * 1.6));
    }
  }

  private finish(hit: boolean): void {
    this.phase = "done";
    this.result = hit ? "win" : "lose";
    this.ctx.engine.domElement.removeEventListener("pointermove", this.onPointerMove);
    this.ctx.engine.domElement.removeEventListener("pointerdown", this.onPointerDown);
    window.removeEventListener("blur", this.onBlur);
    if (this.reticle) this.reticle.style.opacity = "0";
    this.ctx.engine.domElement.style.cursor = "default";
    this.ctx.say(hit ? "A bright splash scatters the pool's reflection. The last light goes quiet." : "The round passes into the dark water. The moment is gone.", 5, true);
  }

  private createReticle(): void {
    const reticle = document.createElement("div");
    reticle.setAttribute("aria-hidden", "true");
    reticle.style.cssText = "position:fixed;left:50%;top:50%;width:26px;height:26px;border:1px solid rgba(255,225,177,.9);border-radius:50%;box-shadow:0 0 12px rgba(255,194,112,.85),inset 0 0 8px rgba(255,194,112,.45);pointer-events:none;z-index:80;";
    const center = document.createElement("i");
    center.style.cssText = "position:absolute;left:50%;top:50%;width:3px;height:3px;background:#fff3d3;border-radius:50%;transform:translate(-50%,-50%);";
    reticle.append(center);
    this.ctx.engine.domElement.parentElement?.append(reticle);
    this.reticle = reticle;
  }

  private readonly onPointerMove = (event: PointerEvent): void => {
    const rect = this.ctx.engine.domElement.getBoundingClientRect();
    this.aim.set(
      THREE.MathUtils.clamp(((event.clientX - rect.left) / Math.max(1, rect.width)) * 2 - 1, -1, 1),
      THREE.MathUtils.clamp(1 - ((event.clientY - rect.top) / Math.max(1, rect.height)) * 2, -1, 1),
    );
    this.updateGunShake();
  };

  private readonly onPointerDown = (event: PointerEvent): void => {
    if (event.button !== 0 || this.phase !== "aiming") return;
    event.preventDefault();
    this.shoot();
  };

  private readonly onBlur = (): void => {
    this.aim.set(0, 0);
  };

  private clearScene(): void {
    this.ctx.scene.remove(this.group);
    if (this.gun) this.ctx.camera.remove(this.gun);
    this.group.clear();
    this.particles.length = 0;
    this.head = null;
    this.gun = null;
  }
}
