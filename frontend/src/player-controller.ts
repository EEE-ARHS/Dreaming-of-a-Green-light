import {
  BoxGeometry, CapsuleGeometry, Mesh, MeshStandardMaterial, Quaternion, Scene,
  SphereGeometry, Vector3,
} from "three";
import { HavokPhysics, PhysicsAggregate, PhysicsConstraint, PhysicsMotionType, PhysicsShapeType } from "./physics";
import { PART_DEFS, JOINT_DEFS, X_AXIS, Y_AXIS, type PartDef } from "./ragdoll-constants";
import { DOOR_HALF, ROOM_HALF } from "../../chapters/chapter02/constants";

interface PlayerPart {
  def: PartDef;
  mesh: Mesh;
  aggregate: PhysicsAggregate;
  restPos: Vector3;
  targetPosition: Vector3;
  targetRotation: Quaternion;
}

/** Stable, articulated, pose-driven dynamic ragdoll used as Nick's controllable player. */
export class PlayerController {
  readonly parts: PlayerPart[] = [];
  readonly position = new Vector3(0, 0, -3.1);
  yaw = Math.PI;
  private readonly partMap = new Map<string, PlayerPart>();
  private readonly joints: PhysicsConstraint[] = [];
  private readonly materials = {
    suit: new MeshStandardMaterial({ color: "#353b43", roughness: 0.78 }),
    shirt: new MeshStandardMaterial({ color: "#d6ceb8", roughness: 0.84 }),
    skin: new MeshStandardMaterial({ color: "#bd9275", roughness: 0.78 }),
    hair: new MeshStandardMaterial({ color: "#34271f", roughness: 0.92 }),
    shoe: new MeshStandardMaterial({ color: "#201b19", roughness: 0.62, metalness: 0.08 }),
    tie: new MeshStandardMaterial({ color: "#783b32", roughness: 0.8 }),
    ivory: new MeshStandardMaterial({ color: "#f0e6d1", roughness: 0.48 }),
    eye: new MeshStandardMaterial({ color: "#39271f", roughness: 0.54 }),
  };
  private walkPhase = 0;
  private walkBlend = 0;
  private readonly driveVelocity = new Vector3();
  private readonly driveAngularVelocity = new Vector3();
  private readonly driveDeltaRotation = new Quaternion();
  private readonly driveAxis = new Vector3();

  constructor(private readonly scene: Scene, private readonly physics: HavokPhysics) {
    for (const def of PART_DEFS) {
      const part = this.createPart(def);
      this.parts.push(part);
      this.partMap.set(def.name, part);
    }
    for (const def of JOINT_DEFS) {
      const parent = this.partMap.get(def.parent)!;
      const child = this.partMap.get(def.child)!;
      const pivot = new Vector3(...def.pivot);
      const joint = new PhysicsConstraint(physics.scene, {
        pivotA: pivot.clone().sub(parent.restPos),
        pivotB: pivot.clone().sub(child.restPos),
      }, def.limits);
      physics.addConstraint(parent.aggregate.body, child.aggregate.body, joint);
      this.joints.push(joint);
    }
    this.addClothingDetails();
    this.pose(0, 0);
    for (const part of this.parts) {
      part.aggregate.body.setMotionType(PhysicsMotionType.DYNAMIC);
      part.aggregate.body.havokBody.setLinearDamping(0.82);
      part.aggregate.body.havokBody.setAngularDamping(3.6);
    }
  }

  private createPart(def: PartDef): PlayerPart {
    let geometry: BoxGeometry | CapsuleGeometry | SphereGeometry;
    let shape: "box" | "capsule" | "sphere";
    const options = { mass: def.mass, friction: 0.78, restitution: 0.02 } as {
      mass: number; friction: number; restitution: number; extents?: Vector3; radius?: number; pointA?: Vector3; pointB?: Vector3;
    };
    if (def.kind === "box" && def.size) {
      geometry = new BoxGeometry(...def.size);
      shape = PhysicsShapeType.BOX;
      options.extents = new Vector3(...def.size);
    } else if (def.kind === "capsule" && def.radius && def.length) {
      geometry = new CapsuleGeometry(def.radius, def.length, 4, 10);
      shape = PhysicsShapeType.CAPSULE;
      const half = def.length / 2 - def.radius;
      options.radius = def.radius;
      options.pointA = new Vector3(0, -half, 0);
      options.pointB = new Vector3(0, half, 0);
    } else {
      const radius = def.radius ?? 0.1;
      geometry = new SphereGeometry(radius, 16, 12);
      shape = PhysicsShapeType.SPHERE;
      options.radius = radius;
    }
    const material = this.materialFor(def.name);
    const mesh = new Mesh(geometry, material);
    mesh.name = `nick:${def.name}`;
    mesh.position.set(...def.pos);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this.scene.add(mesh);
    const aggregate = new PhysicsAggregate(mesh, shape, options, this.physics);
    aggregate.body.setMotionType(PhysicsMotionType.ANIMATED);
    const restPos = new Vector3(...def.pos);
    return { def, mesh, aggregate, restPos, targetPosition: restPos.clone(), targetRotation: new Quaternion() };
  }

  private materialFor(name: string): MeshStandardMaterial {
    if (name === "pelvis" || name.startsWith("thigh") || name.startsWith("shin")) return this.materials.suit;
    if (name === "torso" || name.startsWith("armU")) return this.materials.shirt;
    if (name === "head" || name.startsWith("armF")) return this.materials.skin;
    if (name.startsWith("foot")) return this.materials.shoe;
    return this.materials.skin;
  }

  private addClothingDetails(): void {
    const add = (parentName: string, geometry: BoxGeometry | SphereGeometry, material: MeshStandardMaterial, position: [number, number, number], scale?: [number, number, number]) => {
      const parent = this.partMap.get(parentName)?.mesh;
      if (!parent) return;
      const detail = new Mesh(geometry, material);
      detail.position.set(...position);
      if (scale) detail.scale.set(...scale);
      detail.castShadow = true;
      parent.add(detail);
    };
    add("torso", new BoxGeometry(0.055, 0.25, 0.025), this.materials.tie, [0, -0.015, 0.122]);
    add("torso", new BoxGeometry(0.34, 0.035, 0.025), this.materials.suit, [0, -0.16, 0.12]);
    const lapel = new BoxGeometry(0.075, 0.2, 0.035);
    const leftLapel = new Mesh(lapel, this.materials.suit);
    leftLapel.position.set(-0.105, 0.015, 0.135);
    leftLapel.rotation.z = -0.3;
    leftLapel.castShadow = true;
    this.partMap.get("torso")!.mesh.add(leftLapel);
    const rightLapel = leftLapel.clone();
    rightLapel.position.x = 0.105;
    rightLapel.rotation.z = 0.3;
    this.partMap.get("torso")!.mesh.add(rightLapel);
    add("torso", new SphereGeometry(0.014, 8, 6), this.materials.ivory, [0.095, -0.08, 0.143]);
    add("torso", new BoxGeometry(0.09, 0.045, 0.025), this.materials.suit, [-0.105, -0.105, 0.13]);
    add("head", new SphereGeometry(0.12, 16, 10), this.materials.hair, [0, 0.055, -0.008], [1.02, 0.62, 1.02]);
    add("head", new SphereGeometry(0.026, 10, 8), this.materials.skin, [0, 0.005, 0.11], [0.82, 0.8, 1.2]);
    for (const side of [-1, 1]) {
      add("head", new SphereGeometry(0.025, 10, 8), this.materials.skin, [side * 0.11, -0.005, 0]);
      add("head", new SphereGeometry(0.014, 10, 8), this.materials.ivory, [side * 0.042, 0.022, 0.104]);
      add("head", new SphereGeometry(0.007, 8, 6), this.materials.eye, [side * 0.042, 0.022, 0.114]);
    }
  }

  /** Keep the torso heading aligned with the camera's horizontal view direction. */
  faceCameraDirection(direction: Vector3): void {
    if (direction.x * direction.x + direction.z * direction.z < 1e-5) return;
    this.yaw = Math.atan2(-direction.x, -direction.z);
  }

  /** Move in camera-relative WASD direction, keeping the character inside the chapter bounds. */
  move(forwardInput: number, sideInput: number, dt: number): number {
    const forward = new Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    const right = new Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    const direction = forward.multiplyScalar(forwardInput).addScaledVector(right, sideInput);
    if (direction.lengthSq() > 1) direction.normalize();
    const speed = 4.2;
    const previousZ = this.position.z;
    let nextX = THREEClamp(this.position.x + direction.x * speed * dt, -24, 24);
    let nextZ = THREEClamp(this.position.z + direction.z * speed * dt, -77, 5.2);
    if (previousZ > -ROOM_HALF + 0.65) nextX = THREEClamp(nextX, -ROOM_HALF + 0.45, ROOM_HALF - 0.45);
    if (Math.abs(nextX) > DOOR_HALF - 0.2) {
      if (previousZ >= -ROOM_HALF + 0.65 && nextZ < -ROOM_HALF + 0.65) nextZ = -ROOM_HALF + 0.65;
      else if (previousZ <= -ROOM_HALF - 0.65 && nextZ > -ROOM_HALF - 0.65) nextZ = -ROOM_HALF - 0.65;
    }
    this.position.set(nextX, 0, nextZ);
    return direction.length() * speed;
  }

  update(_dt: number, speed: number): void {
    const blend = Math.min(1, _dt * 8);
    this.walkBlend += ((speed > 0.05 ? 1 : 0) - this.walkBlend) * blend;
    this.walkPhase += _dt * 7.5 * Math.max(0.3, speed / 3.1);
    this.pose(this.walkPhase, speed);
    this.drivePhysicalPose();
  }

  private drivePhysicalPose(): void {
    for (const part of this.parts) {
      this.driveVelocity.copy(part.targetPosition).sub(part.mesh.position).multiplyScalar(15);
      if (this.driveVelocity.length() > 5.2) this.driveVelocity.setLength(5.2);
      part.aggregate.body.setLinearVelocity(this.driveVelocity);

      this.driveDeltaRotation.copy(part.targetRotation).multiply(part.mesh.quaternion.clone().invert()).normalize();
      if (this.driveDeltaRotation.w < 0) {
        this.driveDeltaRotation.set(-this.driveDeltaRotation.x, -this.driveDeltaRotation.y, -this.driveDeltaRotation.z, -this.driveDeltaRotation.w);
      }
      const angle = 2 * Math.acos(Math.max(-1, Math.min(1, this.driveDeltaRotation.w)));
      if (angle < 0.001) this.driveAngularVelocity.set(0, 0, 0);
      else {
        this.driveAxis.set(this.driveDeltaRotation.x, this.driveDeltaRotation.y, this.driveDeltaRotation.z).normalize();
        this.driveAngularVelocity.copy(this.driveAxis).multiplyScalar(Math.min(9, angle * 11));
      }
      part.aggregate.body.setAngularVelocity(this.driveAngularVelocity);
    }
  }

  private pose(phase: number, _speed: number): void {
    const bob = Math.sin(phase * 2) * 0.024 * this.walkBlend;
    const yawQ = new Quaternion().setFromAxisAngle(Y_AXIS, this.yaw + Math.PI);
    const torsoQ = yawQ.clone().multiply(new Quaternion().setFromAxisAngle(X_AXIS, 0.055 * this.walkBlend));
    const local = (x: number, y: number, z: number, q: Quaternion) => new Vector3(x, y, z).applyQuaternion(q);
    const pelvis = this.position.clone().add(new Vector3(0, 0.98 + bob, 0));
    const torso = pelvis.clone().add(local(0, 0.24, 0, torsoQ));
    const head = torso.clone().add(local(0, 0.28, 0.005, torsoQ));
    this.setPart("pelvis", pelvis, yawQ);
    this.setPart("torso", torso, torsoQ);
    this.setPart("head", head, torsoQ);
    for (const side of [-1, 1] as const) {
      const suffix = side < 0 ? "L" : "R";
      const shoulder = torso.clone().add(local(side * 0.215, 0.16, 0, torsoQ));
      const swing = Math.sin(phase + (side < 0 ? 0 : Math.PI)) * 0.56 * this.walkBlend;
      const upperQ = yawQ.clone().multiply(new Quaternion().setFromAxisAngle(X_AXIS, swing));
      const elbow = shoulder.clone().add(local(0, -0.3, 0, upperQ));
      const upper = shoulder.clone().add(local(0, -0.15, 0, upperQ));
      const foreQ = yawQ.clone().multiply(new Quaternion().setFromAxisAngle(X_AXIS, swing + 0.2));
      const fore = elbow.clone().add(local(0, -0.135, 0, foreQ));
      this.setPart(`armU${suffix}`, upper, upperQ);
      this.setPart(`armF${suffix}`, fore, foreQ);

      const hip = pelvis.clone().add(local(side * 0.095, -0.08, 0, yawQ));
      const legPhase = phase + (side < 0 ? 0 : Math.PI);
      const legSwing = Math.sin(legPhase) * 0.62 * this.walkBlend;
      const kneeBend = -Math.max(0, -Math.cos(legPhase)) * 0.95 * this.walkBlend;
      const thighQ = yawQ.clone().multiply(new Quaternion().setFromAxisAngle(X_AXIS, legSwing));
      const knee = hip.clone().add(local(0, -0.39, 0, thighQ));
      const thigh = hip.clone().add(local(0, -0.195, 0, thighQ));
      const shinQ = yawQ.clone().multiply(new Quaternion().setFromAxisAngle(X_AXIS, legSwing + kneeBend));
      const ankle = knee.clone().add(local(0, -0.335, 0, shinQ));
      const shin = knee.clone().add(local(0, -0.155, 0, shinQ));
      const foot = ankle.clone().add(local(0, -0.075, 0.055, yawQ));
      this.setPart(`thigh${suffix}`, thigh, thighQ);
      this.setPart(`shin${suffix}`, shin, shinQ);
      this.setPart(`foot${suffix}`, foot, yawQ);
    }
  }

  private setPart(name: string, position: Vector3, rotation: Quaternion): void {
    const part = this.partMap.get(name);
    if (!part) return;
    part.targetPosition.copy(position);
    part.targetRotation.copy(rotation);
    if (part.aggregate.body.motionType === PhysicsMotionType.ANIMATED) {
      part.mesh.position.copy(position);
      part.mesh.quaternion.copy(rotation);
      part.mesh.updateMatrixWorld(true);
      part.aggregate.body.setTransform(position, rotation);
    }
  }

  dispose(): void {
    for (const joint of this.joints) joint.dispose();
    for (const part of this.parts) {
      part.aggregate.dispose();
      part.mesh.removeFromParent();
      part.mesh.traverse((object) => {
        if (object instanceof Mesh) {
          object.geometry.dispose();
        }
      });
    }
    for (const material of Object.values(this.materials)) material.dispose();
    this.parts.length = 0;
    this.partMap.clear();
  }
}

function THREEClamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
