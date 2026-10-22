import { Vector3, type Object3D } from "three";

export const PhysicsShapeType = { BOX: "box", CAPSULE: "capsule", SPHERE: "sphere" } as const;
export type PhysicsShapeType = (typeof PhysicsShapeType)[keyof typeof PhysicsShapeType];
export const PhysicsMotionType = { ANIMATED: "animated", DYNAMIC: "dynamic" } as const;
export type PhysicsMotionType = (typeof PhysicsMotionType)[keyof typeof PhysicsMotionType];

export interface PhysicsMaterialOptions {
  mass: number;
  friction?: number;
  restitution?: number;
  radius?: number;
  pointA?: Vector3;
  pointB?: Vector3;
  extents?: Vector3;
}

export class PhysicsBody {
  motionType: PhysicsMotionType = "animated";
  linearVelocity = new Vector3();
  angularVelocity = new Vector3();

  constructor(readonly object: Object3D, readonly mass: number) {}

  setMotionType(type: PhysicsMotionType): void {
    this.motionType = type;
    if (type === "dynamic" && this.object.position.y < 0.12) this.object.position.y = 0.12;
  }

  setLinearVelocity(velocity: Vector3): void {
    this.linearVelocity.copy(velocity);
  }

  setAngularVelocity(velocity: Vector3): void {
    this.angularVelocity.copy(velocity);
  }
}

export class PhysicsAggregate {
  readonly body: PhysicsBody;

  constructor(
    object: Object3D,
    _shape: PhysicsShapeType,
    options: PhysicsMaterialOptions,
    private readonly physics: ArcadePhysics
  ) {
    this.body = new PhysicsBody(object, options.mass);
    object.userData.physicsBody = this.body;
    physics.add(this.body);
  }

  dispose(): void {
    this.physics.remove(this.body);
  }
}

/** A deliberately scoped arcade solver for this game's simple ground-and-ragdoll collisions. */
export class ArcadePhysics {
  private readonly bodies = new Set<PhysicsBody>();
  private readonly constraints: Array<{ a: PhysicsBody; b: PhysicsBody; pivotA: Vector3; pivotB: Vector3 }> = [];
  private readonly knownBodies = new Set<PhysicsBody>();
  private readonly pendingConstraints: Array<{ a: PhysicsBody; b: PhysicsBody; pivotA: Vector3; pivotB: Vector3 }> = [];
  private timeStep = 1 / 60;

  setTimeStep(seconds: number): void {
    this.timeStep = Math.max(1 / 240, Math.min(1 / 30, seconds));
  }

  add(body: PhysicsBody): void {
    this.bodies.add(body);
    this.knownBodies.add(body);
    for (let i = this.pendingConstraints.length - 1; i >= 0; i--) {
      const constraint = this.pendingConstraints[i];
      if (this.knownBodies.has(constraint.a) && this.knownBodies.has(constraint.b)) {
        this.constraints.push(constraint);
        this.pendingConstraints.splice(i, 1);
      }
    }
  }

  remove(body: PhysicsBody): void {
    this.bodies.delete(body);
  }

  addConstraint(a: PhysicsBody, b: PhysicsBody, pivotA: Vector3, pivotB: Vector3): void {
    const constraint = { a, b, pivotA: pivotA.clone(), pivotB: pivotB.clone() };
    if (this.knownBodies.has(a) && this.knownBodies.has(b)) this.constraints.push(constraint);
    else this.pendingConstraints.push(constraint);
  }

  step(): void {
    const dt = this.timeStep;
    for (const body of this.bodies) {
      if (body.motionType !== "dynamic") continue;
      body.linearVelocity.y -= 9.81 * dt;
      body.object.position.addScaledVector(body.linearVelocity, dt);
      body.object.rotation.x += body.angularVelocity.x * dt;
      body.object.rotation.y += body.angularVelocity.y * dt;
      body.object.rotation.z += body.angularVelocity.z * dt;
      body.linearVelocity.multiplyScalar(Math.exp(-0.12 * dt));
      body.angularVelocity.multiplyScalar(Math.exp(-0.32 * dt));
      if (body.object.position.y < 0.12) {
        body.object.position.y = 0.12;
        if (body.linearVelocity.y < 0) body.linearVelocity.y *= -0.22;
        body.linearVelocity.x *= 0.78;
        body.linearVelocity.z *= 0.78;
        body.angularVelocity.multiplyScalar(0.82);
      }
    }
    // Keep ragdoll body pivots together while allowing the limbs to tumble.
    for (let iteration = 0; iteration < 2; iteration++) {
      for (const joint of this.constraints) {
        const a = joint.a.object.localToWorld(joint.pivotA.clone());
        const b = joint.b.object.localToWorld(joint.pivotB.clone());
        const correction = a.sub(b).multiplyScalar(0.5);
        if (joint.a.motionType === "dynamic") joint.a.object.position.sub(correction);
        if (joint.b.motionType === "dynamic") joint.b.object.position.add(correction);
      }
    }
  }
}

export class PhysicsConstraint {
  setAxisFriction(_axis: number, _friction: number): void {}
}
