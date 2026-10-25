import {
  AdditiveBlending, BoxGeometry, CylinderGeometry, Euler, Group, Mesh, MeshBasicMaterial,
  MeshStandardMaterial, PointLight, Quaternion, Scene, SpotLight, TorusGeometry, Vector3,
} from "three";
import { HavokPhysics, PhysicsAggregate, PhysicsMotionType, PhysicsShapeType } from "./physics";

export interface CarInput { throttle: number; brake: number; steer: number; handbrake: boolean; }
export interface Wheel { pivot: Group; spinner: Group; front: boolean; }
const MAX_SPEED = 31;
const WHEEL_RADIUS = 0.36;
function material(name: string, color: string, emissive?: string): MeshStandardMaterial {
  return new MeshStandardMaterial({ name, color, emissive: emissive ?? "#000000", roughness: 0.56, metalness: 0.18 });
}
function add(mesh: Mesh, parent: Group, position: [number, number, number], mat: MeshStandardMaterial | MeshBasicMaterial): Mesh {
  mesh.position.set(...position); mesh.material = mat; mesh.castShadow = true; mesh.receiveShadow = true; parent.add(mesh); return mesh;
}
export class Car {
  readonly root: Group;
  readonly body: PhysicsAggregate;
  readonly wheels: Wheel[] = [];
  readonly headlights: SpotLight[] = [];
  readonly beams: Mesh[] = [];
  speed = 0; yaw = 0; steer = 0; wheelSpin = 0; crashed = false;
  private readonly fill: PointLight;
  constructor(scene: Scene, physics: HavokPhysics) {
    this.root = new Group(); this.root.name = "carRoot"; this.root.position.set(0, 0.62, 0); scene.add(this.root);
    const paint = material("gatsbyYellow", "#d8ae2f", "#171002"), paintDark = material("gatsbyYellowDark", "#a9821f", "#100b02");
    const chrome = material("chrome", "#b9bdc2"); chrome.metalness = 0.82; chrome.roughness = 0.22;
    const leather = material("leather", "#2a1b12"), rubber = material("rubber", "#0e0e10"), cream = material("whitewall", "#cfc6b2");
    const box = (name: string, size: [number, number, number], pos: [number, number, number], mat: MeshStandardMaterial) => add(new Mesh(new BoxGeometry(...size), mat), this.root, pos, mat).name = name;
    box("boatTail", [1.62, 0.42, 4], [0, -0.04, -0.1], paint);
    box("beltline", [1.72, 0.2, 3.4], [0, 0.17, -0.3], paintDark);
    box("bonnet", [1.02, 0.4, 1.7], [0, 0.2, 1.18], paint);
    box("bonnetTop", [0.86, 0.1, 1.62], [0, 0.41, 1.2], paintDark);
    box("cowl", [1.5, 0.34, 0.3], [0, 0.25, 0.42], paintDark);
    box("radiator", [0.94, 0.6, 0.16], [0, 0.2, 2.02], chrome);
    for (let i = 0; i < 7; i++) box("grilleSlat" + i, [0.82, 0.025, 0.04], [0, -0.02 + i * 0.075, 2.11], chrome);
    add(new Mesh(new CylinderGeometry(0.05, 0.05, 0.15, 8), cream), this.root, [0, 0.53, 2], cream).name = "hoodOrnament";
    box("cockpit", [1.42, 0.52, 1.5], [0, 0.28, -0.55], paintDark);
    box("cabinFloor", [1.2, 0.2, 1.2], [0, 0.42, -0.5], leather);
    box("seatBase", [1.16, 0.16, 0.5], [0, 0.53, -0.5], leather);
    box("seatBack", [1.16, 0.44, 0.14], [0, 0.7, -0.8], leather);
    box("dash", [1.34, 0.16, 0.22], [0, 0.6, 0.16], chrome);
    const steering = add(new Mesh(new TorusGeometry(0.16, 0.0175, 8, 20), leather), this.root, [-0.34, 0.68, 0.1], leather); steering.rotation.x = 1.15;
    const column = add(new Mesh(new CylinderGeometry(0.0225, 0.0225, 0.32, 8), chrome), this.root, [-0.34, 0.6, 0.18], chrome); column.rotation.x = 1.15;
    const glass = new MeshStandardMaterial({ color: "#6d8798", emissive: "#0a1116", roughness: 0.16, metalness: 0.3, transparent: true, opacity: 0.22, side: 2 });
    const windshield = add(new Mesh(new BoxGeometry(1.3, 0.42, 0.02), glass), this.root, [0, 0.79, 0.3], glass); windshield.rotation.x = -0.13;
    const frame = add(new Mesh(new BoxGeometry(1.36, 0.035, 0.045), chrome), this.root, [0, 1, 0.33], chrome); frame.rotation.x = -0.13;
    for (const sx of [-1, 1]) {
      const post = add(new Mesh(new BoxGeometry(0.035, 0.46, 0.04), chrome), this.root, [sx * 0.66, 0.79, 0.3], chrome); post.rotation.x = -0.13;
      box("frontFender", [0.3, 0.13, 1.3], [sx * 0.86, 0.02, 1.3], paintDark);
      box("rearFender", [0.3, 0.16, 1.3], [sx * 0.86, 0.04, -1.35], paintDark);
      box("runningBoard", [0.34, 0.07, 1.9], [sx * 0.91, -0.2, 0], chrome);
      box("headlampBracket", [0.06, 0.3, 0.06], [sx * 0.56, 0.24, 1.82], chrome);
    }
    const lensMat = new MeshBasicMaterial({ color: "#fff3d0" });
    for (let i = 0; i < 2; i++) {
      const sx = i === 0 ? -1 : 1;
      const can = add(new Mesh(new CylinderGeometry(0.14, 0.14, 0.24, 16), chrome), this.root, [sx * 0.56, 0.44, 1.98], chrome); can.rotation.x = Math.PI / 2;
      const lens = add(new Mesh(new CylinderGeometry(0.115, 0.115, 0.03, 16), lensMat), this.root, [sx * 0.56, 0.44, 2.11], lensMat); lens.rotation.x = Math.PI / 2;
    }
    const tailMat = new MeshBasicMaterial({ color: "#a8130c" });
    for (const sx of [-0.58, 0.58]) box("tailLamp", [0.12, 0.1, 0.05], [sx, 0.08, -2.02], tailMat as unknown as MeshStandardMaterial);
    const exhaust = add(new Mesh(new CylinderGeometry(0.0375, 0.0375, 0.7, 10), chrome), this.root, [0.5, -0.22, -1.96], chrome); exhaust.rotation.x = Math.PI / 2;
    const spare = add(new Mesh(new CylinderGeometry(0.34, 0.34, 0.24, 20), rubber), this.root, [-0.9, 0.18, -0.35], rubber); spare.rotation.z = Math.PI / 2;
    const spareHub = add(new Mesh(new CylinderGeometry(0.21, 0.21, 0.26, 18), chrome), this.root, [-0.9, 0.18, -0.35], chrome); spareHub.rotation.z = Math.PI / 2;
    for (const [sx, front] of [[-1, true], [1, true], [-1, false], [1, false]] as const) this.wheels.push(this.buildWheel(scene, sx, front ? 1.38 : -1.42, front, rubber, cream, chrome));
    this.fill = new PointLight("#ffd9a1", 0.5, 9); this.fill.position.set(0, 2.4, -0.8); this.root.add(this.fill);
    const beamMat = new MeshBasicMaterial({ color: "#ffe6b4", transparent: true, opacity: 0.05, blending: AdditiveBlending, depthWrite: false, side: 2 });
    for (let i = 0; i < 2; i++) {
      const spot = new SpotLight("#ffe8bd", 2.6, 58, Math.PI / 3.3, 0.5, 2); spot.position.set(-0.56, 0.5, 2.1); spot.target.position.set(0, 0.38, 3.1); this.root.add(spot, spot.target); this.headlights.push(spot);
      const beam = new Mesh(new CylinderGeometry(0.25, 3.75, 24, 18), beamMat); beam.position.set((i === 0 ? -1 : 1) * 0.56, 0.44, 14); beam.rotation.x = -Math.PI / 2; beam.renderOrder = 1; beam.name = "headlightBeam" + i; this.root.add(beam); this.beams.push(beam);
    }
    this.body = new PhysicsAggregate(this.root, PhysicsShapeType.BOX, { mass: 1250, friction: 0.5, restitution: 0.05, extents: new Vector3(1.95, 1.15, 4.5) }, physics);
    this.body.body.setMotionType(PhysicsMotionType.ANIMATED);
    this.applyTransform();
  }
  private buildWheel(scene: Scene, sx: number, z: number, front: boolean, rubber: MeshStandardMaterial, cream: MeshStandardMaterial, chrome: MeshStandardMaterial): Wheel {
    const pivot = new Group(); pivot.name = "wheelPivot"; pivot.position.set(sx * 0.84, -0.26, z); this.root.add(pivot);
    const spinner = new Group(); spinner.name = "wheelSpin"; pivot.add(spinner);
    const cylinder = (name: string, d: number, h: number, mat: MeshStandardMaterial, segments: number) => { const m = new Mesh(new CylinderGeometry(d / 2, d / 2, h, segments), mat); m.name = name; m.rotation.z = Math.PI / 2; m.castShadow = true; spinner.add(m); return m; };
    cylinder("tire", WHEEL_RADIUS * 2, 0.24, rubber, 22); cylinder("whitewall", 0.55, 0.25, cream, 20); cylinder("hub", 0.4, 0.27, chrome, 18);
    for (let i = 0; i < 8; i++) { const spoke = new Mesh(new BoxGeometry(0.035, 0.47, 0.04), chrome); spoke.rotation.x = (i / 8) * Math.PI; spinner.add(spoke); }
    cylinder("hubCap", 0.14, 0.29, chrome, 12);
    void scene;
    return { pivot, spinner, front };
  }
  get forward(): Vector3 { return new Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw)); }
  get speedMph(): number { return Math.abs(this.speed) * 2.236936; }
  update(dt: number, input: CarInput, controlEnabled: boolean): void {
    if (controlEnabled && !this.crashed) {
      if (input.throttle > 0) { const headroom = Math.max(0, 1 - this.speed / MAX_SPEED); this.speed += input.throttle * 13 * headroom * dt; }
      else this.speed -= this.speed * (0.42 + Math.abs(this.speed) * 0.05) * dt;
      if (input.brake > 0) this.speed -= input.brake * (this.speed > 0 ? 18 : 0) * dt;
      if (input.handbrake) this.speed -= Math.sign(this.speed) * Math.min(Math.abs(this.speed), 9 * dt);
      if (Math.abs(this.speed) < 0.12 && input.throttle === 0) this.speed = 0;
      this.speed = Math.max(-7, Math.min(MAX_SPEED, this.speed));
      this.steer += (input.steer - this.steer) * Math.min(1, dt * 7);
      if (Math.abs(this.speed) > 0.35) this.yaw += this.steer * 1.32 * Math.min(1, Math.abs(this.speed) / 7) * (input.handbrake ? 1.55 : 1) * dt * Math.sign(this.speed);
    } else { this.speed *= Math.max(0, 1 - dt * 0.55); this.steer *= Math.max(0, 1 - dt * 3); }
    if (Math.abs(this.root.position.x) > 5.2) this.speed -= this.speed * 0.7 * dt;
    const fwd = this.forward; this.root.position.x = Math.max(-38, Math.min(38, this.root.position.x + fwd.x * this.speed * dt));
    this.root.position.z = Math.max(-50, Math.min(340, this.root.position.z + fwd.z * this.speed * dt));
    const t = performance.now() * 0.001, bob = Math.sin(t * 9 + this.wheelSpin * 0.15) * 0.004 * Math.min(1, Math.abs(this.speed) / 8);
    this.root.position.y = 0.62 + bob;
    this.root.rotation.set(-this.steer * Math.min(1, Math.abs(this.speed) / MAX_SPEED) * 0.028 + Math.sin(t * 6.3) * 0.002, this.yaw, this.steer * Math.min(1, Math.abs(this.speed) / MAX_SPEED) * 0.035, "YXZ");
    this.wheelSpin += this.speed / WHEEL_RADIUS * dt;
    for (const wheel of this.wheels) { wheel.pivot.rotation.y = wheel.front ? this.steer * 0.5 : 0; wheel.spinner.rotation.x = this.wheelSpin; }
    this.applyTransform(); this.updateLights();
  }
  private applyTransform(): void {
    this.root.updateMatrixWorld(true);
    this.body.body.setTransform(this.root.position, new Quaternion().setFromEuler(new Euler(this.root.rotation.x, this.root.rotation.y, this.root.rotation.z, "YXZ")));
  }
  updateLights(): void {
    const fwd = this.forward, right = new Vector3(fwd.z, 0, -fwd.x), base = this.root.position.clone().addScaledVector(fwd, 2);
    for (let i = 0; i < this.headlights.length; i++) { const side = i === 0 ? -1 : 1; this.headlights[i].position.copy(base).addScaledVector(right, 0.56 * side).add(new Vector3(0, 0.5, 0)); this.headlights[i].target.position.copy(this.headlights[i].position).add(new Vector3(fwd.x, -0.1, fwd.z)); }
  }
  isPointInside(x: number, z: number, padding = 0): boolean {
    const dx = x - this.root.position.x, dz = z - this.root.position.z, cos = Math.cos(this.yaw), sin = Math.sin(this.yaw);
    const localX = dx * cos - dz * sin, localZ = dx * sin + dz * cos;
    return Math.abs(localX) < 1.05 + padding && localZ > -2.35 - padding && localZ < 2.35 + padding;
  }
  reset(): void {
    this.speed = 0; this.yaw = 0; this.steer = 0; this.wheelSpin = 0; this.crashed = false;
    this.root.position.set(0, 0.62, 0); this.root.rotation.set(0, 0, 0);
    for (const wheel of this.wheels) { wheel.pivot.rotation.set(0, 0, 0); wheel.spinner.rotation.set(0, 0, 0); }
    this.applyTransform(); this.updateLights();
  }
}
