import { Euler, Group, Mesh, PointLight, Quaternion, Scene, SpotLight, Vector3 } from "three";
import { HavokPhysics, PhysicsAggregate, PhysicsMotionType, PhysicsShapeType } from "./physics";
import { MAX_SPEED, WHEEL_RADIUS, CAR_ROOT_Y, CAR_BODY_EXTENTS, CAR_MASS } from "./car-constants";
import { createCarModel, type Wheel } from "./car-model";

export interface CarInput { throttle: number; brake: number; steer: number; handbrake: boolean; }
export type { Wheel } from "./car-model";

export class Car {
  readonly root: Group;
  readonly body: PhysicsAggregate;
  readonly wheels: Wheel[];
  readonly headlights: SpotLight[];
  readonly beams: Mesh[];
  speed = 0; yaw = 0; steer = 0; wheelSpin = 0; crashed = false;
  private readonly fill: PointLight;
  constructor(scene: Scene, physics: HavokPhysics) {
    const model = createCarModel(scene);
    this.root = model.root;
    this.wheels = model.wheels;
    this.headlights = model.headlights;
    this.beams = model.beams;
    this.fill = model.fill;
    this.root.position.set(0, CAR_ROOT_Y, 0);
    this.body = new PhysicsAggregate(this.root, PhysicsShapeType.BOX, { mass: CAR_MASS, friction: 0.5, restitution: 0.05, extents: CAR_BODY_EXTENTS }, physics);
    this.body.body.setMotionType(PhysicsMotionType.ANIMATED);
    this.applyTransform();
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
    this.root.position.y = CAR_ROOT_Y + bob;
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
    this.fill.position.set(0, 2.4, -0.8);
    for (let i = 0; i < this.headlights.length; i++) { const side = i === 0 ? -1 : 1; this.headlights[i].position.copy(base).addScaledVector(right, 0.56 * side).add(new Vector3(0, 0.5, 0)); this.headlights[i].target.position.copy(this.headlights[i].position).add(new Vector3(fwd.x, -0.1, fwd.z)); }
  }
  isPointInside(x: number, z: number, padding = 0): boolean {
    const dx = x - this.root.position.x, dz = z - this.root.position.z, cos = Math.cos(this.yaw), sin = Math.sin(this.yaw);
    const localX = dx * cos - dz * sin, localZ = dx * sin + dz * cos;
    return Math.abs(localX) < 1.05 + padding && localZ > -2.35 - padding && localZ < 2.35 + padding;
  }
  reset(): void {
    this.speed = 0; this.yaw = 0; this.steer = 0; this.wheelSpin = 0; this.crashed = false;
    this.root.position.set(0, CAR_ROOT_Y, 0); this.root.rotation.set(0, 0, 0);
    for (const wheel of this.wheels) { wheel.pivot.rotation.set(0, 0, 0); wheel.spinner.rotation.set(0, 0, 0); }
    this.applyTransform(); this.updateLights();
  }
}
