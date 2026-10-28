import { PhysicsCharacterController, CharacterSupportedState } from "@babylonjs/core/Physics/v2/characterController";
import { Vector3 as HavokVector3 } from "@babylonjs/core/Maths/math.vector";
import { BoxGeometry, CapsuleGeometry, Group, Mesh, MeshStandardMaterial, Quaternion, Scene, SphereGeometry, Vector3 } from "three";
import { HavokPhysics, PhysicsAggregate, PhysicsConstraint, PhysicsMotionType, PhysicsShapeType } from "./physics";
import { PART_DEFS, Y_AXIS, type PartDef } from "./ragdoll-constants";

type ArmPart = {
  mesh: Mesh;
  aggregate: PhysicsAggregate;
  target: Vector3;
  rotation: Quaternion;
};

/** Capsule character movement with articulated active-ragdoll arms for grabbing. */
export class PlayerController {
  readonly position = new Vector3(0, 0.06, -3.1);
  yaw = Math.PI;
  carrying = false;
  private readonly capsuleMesh: Mesh;
  private readonly capsule: PhysicsAggregate;
  private readonly characterController: PhysicsCharacterController;
  private grounded = true;
  private readonly controllerGravity = new HavokVector3(0, -9.81, 0);
  private readonly supportDirection = new HavokVector3(0, -1, 0);
  private readonly avatarRoot = new Group();
  private readonly avatarMeshes: Mesh[] = [];
  private readonly avatarArmMeshes: Mesh[] = [];
  private readonly pants = new MeshStandardMaterial({ color: "#353943", roughness: 0.84 });
  private readonly shoes = new MeshStandardMaterial({ color: "#201b19", roughness: 0.72 });
  private readonly arms: ArmPart[] = [];
  private readonly joints: PhysicsConstraint[] = [];
  private readonly shirt = new MeshStandardMaterial({ color: "#d6ceb8", roughness: 0.84 });
  private readonly skin = new MeshStandardMaterial({ color: "#bd9275", roughness: 0.78 });
  private readonly forward = new Vector3();
  private readonly right = new Vector3();
  private readonly pivotPosition = new Vector3();
  private grabTarget: Vector3 | null = null;
  private inCutscene = false;
  private torso!: Mesh;
  private head!: Mesh;
  private hips!: Mesh;
  private readonly legs: Mesh[] = [];
  private readonly feet: Mesh[] = [];

  constructor(private readonly scene: Scene, private readonly physics: HavokPhysics) {
    this.capsuleMesh = new Mesh(new CapsuleGeometry(0.32, 0.8, 4, 10), new MeshStandardMaterial({ visible: false }));
    this.capsuleMesh.name = "nick-character-capsule";
    this.capsuleMesh.visible = false;
    scene.add(this.capsuleMesh);
    this.capsule = new PhysicsAggregate(this.capsuleMesh, PhysicsShapeType.CAPSULE, {
      mass: 80, friction: 0.78, restitution: 0, radius: 0.32,
      pointA: new Vector3(0, -0.4, 0), pointB: new Vector3(0, 0.4, 0),
      filterMembershipMask: 2,
      filterCollideMask: 0,
    }, physics);
    this.capsule.body.setMassProperties(80, new Vector3(14, 14, 3.8));
    this.capsule.body.setMotionType(PhysicsMotionType.ANIMATED);
    this.characterController = new PhysicsCharacterController(
      new HavokVector3(this.position.x, this.position.y + 0.72, this.position.z),
      { capsuleHeight: 1.44, capsuleRadius: 0.32 },
      physics.scene,
    );
    this.characterController.shape.filterMembershipMask = 2;
    this.characterController.shape.filterCollideMask = 1 | 4;
    this.characterController.maxSlopeCosine = Math.cos(Math.PI / 3);
    this.characterController.maxStepHeight = 0.18;
    this.createAvatar();
    this.syncCapsule();

    for (const side of [-1, 1] as const) {
      const suffix = side < 0 ? "L" : "R";
      const upper = this.createArm(PART_DEFS.find((part) => part.name === `armU${suffix}`)!, this.shirt);
      const fore = this.createArm(PART_DEFS.find((part) => part.name === `armF${suffix}`)!, this.skin);
      this.arms.push(upper, fore);
      const shoulder = new PhysicsConstraint(physics.scene, {
        pivotA: new Vector3(side * 0.24, 0.62, -0.02), pivotB: this.localPivot(upper, this.shoulder(side)),
      }, { twist: [-1.1, 1.1], pitch: [-1.1, 1.1], roll: [-1.1, 1.1] });
      physics.addConstraint(this.capsule.body, upper.aggregate.body, shoulder);
      this.joints.push(shoulder);
      const elbowPoint = this.shoulder(side).add(new Vector3(0, -0.28, 0));
      const elbow = new PhysicsConstraint(physics.scene, {
        pivotA: this.localPivot(upper, elbowPoint), pivotB: this.localPivot(fore, elbowPoint),
      }, { twist: [-0.6, 0.6], pitch: [-0.15, 2], roll: [-0.6, 0.6] });
      physics.addConstraint(upper.aggregate.body, fore.aggregate.body, elbow);
      this.joints.push(elbow);
    }
    this.updateArms();
  }

  private createAvatar(): void {
    this.avatarRoot.name = "nick-character-avatar";
    this.scene.add(this.avatarRoot);
    const add = (geometry: BoxGeometry | CapsuleGeometry | SphereGeometry, material: MeshStandardMaterial, position: [number, number, number], name: string) => {
      const mesh = new Mesh(geometry, material);
      mesh.name = name;
      mesh.position.set(...position);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.avatarRoot.add(mesh);
      this.avatarMeshes.push(mesh);
      return mesh;
    };
    this.torso = add(new CapsuleGeometry(0.23, 0.1, 4, 10), this.shirt, [0, 1.1, 0], "nick:torso");
    this.head = add(new SphereGeometry(0.125, 12, 10), this.skin, [0, 1.62, 0], "nick:head");
    this.hips = add(new BoxGeometry(0.32, 0.2, 0.24), this.pants, [0, 0.78, 0], "nick:hips");
    for (const side of [-1, 1] as const) {
      const suffix = side < 0 ? "L" : "R";
      const upperDef = PART_DEFS.find((part) => part.name === `armU${suffix}`)!;
      const foreDef = PART_DEFS.find((part) => part.name === `armF${suffix}`)!;
      const upper = add(new CapsuleGeometry(upperDef.radius!, upperDef.length! - upperDef.radius! * 2, 4, 10), this.shirt, [upperDef.pos[0], upperDef.pos[1], upperDef.pos[2]], `nick:armU${suffix}`);
      const fore = add(new CapsuleGeometry(foreDef.radius!, foreDef.length! - foreDef.radius! * 2, 4, 10), this.skin, [foreDef.pos[0], foreDef.pos[1], foreDef.pos[2]], `nick:armF${suffix}`);
      this.avatarArmMeshes.push(upper, fore);
    }
    for (const side of [-1, 1] as const) {
      this.legs.push(add(new BoxGeometry(0.16, 0.62, 0.2), this.pants, [side * 0.1, 0.4, 0], `nick:leg-${side}`));
      this.feet.push(add(new BoxGeometry(0.16, 0.09, 0.29), this.shoes, [side * 0.1, 0.09, 0.045], `nick:shoe-${side}`));
    }
    this.syncAvatar();
  }

  private syncAvatar(): void {
    this.avatarRoot.position.set(this.position.x, this.position.y, this.position.z);
    this.avatarRoot.rotation.y = this.yaw;
    for (let index = 0; index < this.arms.length; index++) {
      const arm = this.arms[index];
      const display = this.avatarArmMeshes[index];
      if (!arm || !display) continue;
      this.scene.updateMatrixWorld(true);
      const worldPosition = arm.mesh.getWorldPosition(new Vector3());
      const worldRotation = arm.mesh.getWorldQuaternion(new Quaternion());
      this.avatarRoot.worldToLocal(worldPosition);
      display.position.copy(worldPosition);
      display.quaternion.copy(this.avatarRoot.quaternion.clone().invert().multiply(worldRotation));
    }
  }

  private shoulder(side: -1 | 1): Vector3 {
    this.pivotPosition.set(side * 0.24, 0.62, -0.02).applyAxisAngle(Y_AXIS, this.yaw);
    return this.position.clone().add(new Vector3(0, 0.72, 0)).add(this.pivotPosition);
  }

  private createArm(def: PartDef, material: MeshStandardMaterial): ArmPart {
    const radius = def.radius ?? 0.05;
    const length = def.length ?? 0.3;
    const mesh = new Mesh(new CapsuleGeometry(radius, Math.max(0.02, length - radius * 2), 4, 10), material);
    mesh.name = `nick:${def.name}`;
    mesh.castShadow = true;
    mesh.position.set(this.position.x, this.position.y, this.position.z)
      .add(new Vector3(def.pos[0], def.pos[1], def.pos[2] - 0.12).applyAxisAngle(Y_AXIS, this.yaw));
    mesh.quaternion.setFromAxisAngle(Y_AXIS, this.yaw);
    this.scene.add(mesh);
    const aggregate = new PhysicsAggregate(mesh, PhysicsShapeType.CAPSULE, {
      mass: def.mass, friction: 0.72, restitution: 0.02, radius,
      pointA: new Vector3(0, -(length / 2 - radius), 0),
      pointB: new Vector3(0, length / 2 - radius, 0),
      filterMembershipMask: 2,
      filterCollideMask: 2,
    }, this.physics);
    aggregate.body.setMotionType(PhysicsMotionType.DYNAMIC);
    aggregate.body.setMassProperties(def.mass, new Vector3(0.025, 0.025, 0.012));
    aggregate.body.havokBody.setLinearDamping(0.8);
    aggregate.body.havokBody.setAngularDamping(3.2);
    return { mesh, aggregate, target: mesh.position.clone(), rotation: mesh.quaternion.clone() };
  }

  private localPivot(arm: ArmPart, worldPoint: Vector3): Vector3 {
    return worldPoint.clone().sub(arm.mesh.position).applyQuaternion(arm.mesh.quaternion.clone().invert());
  }

  setAvatarVisible(visible: boolean): void {
    this.avatarRoot.visible = visible;
    for (const arm of this.arms) arm.mesh.visible = false;
  }

  updatePresentation(): void {
    this.syncAvatar();
  }

  setCarrying(carrying: boolean, target: Vector3 | null = null): void {
    this.carrying = carrying;
    this.grabTarget = target?.clone() ?? null;
  }

  move(forwardInput: number, sideInput: number, dt: number, jump = false): number {
    this.forward.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    this.right.set(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    const direction = this.forward.clone().multiplyScalar(forwardInput).addScaledVector(this.right, sideInput);
    if (direction.lengthSq() > 1) direction.normalize();
    if (dt <= 0 || this.inCutscene) return 0;

    const step = Math.min(dt, 1 / 30);
    const support = this.characterController.checkSupport(step, this.supportDirection);
    this.grounded = support.supportedState === CharacterSupportedState.SUPPORTED;
    const speed = 4.2;
    const velocity = this.characterController.getVelocity().clone();
    velocity.x = direction.x * speed;
    velocity.z = direction.z * speed;

    if (jump && this.grounded) {
      velocity.y = 5.2;
      this.grounded = false;
    } else if (this.grounded) {
      velocity.y = Math.max(0, velocity.y);
    } else {
      velocity.y -= 9.81 * step;
    }
    this.characterController.setVelocity(velocity);
    this.characterController.integrate(step, support, this.controllerGravity);
    this.syncFromCharacterController();
    this.syncCapsule();
    this.syncAvatar();
    this.updateArms();
    return direction.length() * speed;
  }

  update(_dt: number, _speed: number): void {
    if (this.inCutscene) return;
    this.syncFromCharacterController();
    this.syncCapsule();
    this.syncAvatar();
    this.updateArms();
  }

  private syncFromCharacterController(): void {
    const position = this.characterController.getPosition();
    this.position.set(position.x, position.y - 0.72, position.z);
  }

  setCutscenePosition(position: Vector3, yaw = this.yaw): void {
    this.inCutscene = true;
    this.setSeatedPose(true);
    this.capsule.body.setMotionType(PhysicsMotionType.ANIMATED);
    for (const arm of this.arms) arm.aggregate.body.setMotionType(PhysicsMotionType.ANIMATED);
    this.position.copy(position);
    this.yaw = yaw;
    this.characterController.setPosition(new HavokVector3(position.x, position.y + 0.72, position.z));
    this.characterController.setVelocity(HavokVector3.Zero());
    this.syncCapsule();
    this.updateArms();
    this.syncAvatar();
  }

  resumeWalking(position = new Vector3(0, 0.06, -3.1), yaw = Math.PI): void {
    this.inCutscene = false;
    this.setSeatedPose(false);
    this.position.copy(position);
    this.yaw = yaw;
    this.grounded = true;
    this.characterController.setPosition(new HavokVector3(position.x, position.y + 0.72, position.z));
    this.characterController.setVelocity(HavokVector3.Zero());
    this.syncCapsule();
    this.capsule.body.setMotionType(PhysicsMotionType.ANIMATED);
    for (const arm of this.arms) arm.aggregate.body.setMotionType(PhysicsMotionType.DYNAMIC);
    this.updateArms();
    this.syncAvatar();
  }

  private setSeatedPose(seated: boolean): void {
    this.torso.position.y = seated ? 1.32 : 1.1;
    this.head.position.y = seated ? 1.75 : 1.62;
    this.hips.position.y = seated ? 0.98 : 0.78;
    for (const [index, side] of [-1, 1].entries()) {
      const leg = this.legs[index];
      const foot = this.feet[index];
      if (!leg || !foot) continue;
      leg.position.set(side * 0.1, seated ? 0.56 : 0.4, seated ? -0.11 : 0);
      leg.rotation.x = seated ? -0.98 : 0;
      foot.position.set(side * 0.1, seated ? 0.3 : 0.09, seated ? -0.38 : 0.045);
      foot.rotation.x = seated ? 0.18 : 0;
    }
  }

  private syncCapsule(): void {
    this.capsuleMesh.position.set(this.position.x, this.position.y + 0.72, this.position.z);
    this.capsuleMesh.quaternion.setFromAxisAngle(Y_AXIS, this.yaw);
    this.capsule.body.setTransform(this.capsuleMesh.position, this.capsuleMesh.quaternion);
  }

  private updateArms(): void {
    this.forward.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    this.right.set(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    const handBase = this.grabTarget ?? this.position.clone().addScaledVector(this.forward, 0.44).add(new Vector3(0, 1.24, 0));
    for (const side of [-1, 1] as const) {
      const index = side < 0 ? 0 : 2;
      const shoulder = this.shoulder(side);
      const hand = handBase.clone().addScaledVector(this.right, side * (this.grabTarget ? 0.1 : 0.12));
      const toHand = hand.clone().sub(shoulder);
      if (toHand.length() > 0.58) hand.copy(shoulder).addScaledVector(toHand.normalize(), 0.58);
      const elbow = shoulder.clone().lerp(hand, 0.52).addScaledVector(this.right, side * 0.07);
      this.driveArm(this.arms[index], shoulder.clone().lerp(elbow, 0.5), shoulder, elbow);
      this.driveArm(this.arms[index + 1], elbow.clone().lerp(hand, 0.5), elbow, hand);
    }
  }

  private driveArm(arm: ArmPart | undefined, target: Vector3, start: Vector3, end: Vector3): void {
    if (!arm) return;
    const direction = end.clone().sub(start).normalize();
    arm.target.copy(target);
    arm.rotation.setFromUnitVectors(Y_AXIS, direction);
    if (this.inCutscene) {
      arm.mesh.position.copy(target);
      arm.mesh.quaternion.copy(arm.rotation);
      arm.aggregate.body.setTransform(arm.mesh.position, arm.mesh.quaternion);
      return;
    }
    const velocity = target.clone().sub(arm.mesh.position).multiplyScalar(18);
    if (velocity.length() > 4.5) velocity.setLength(4.5);
    arm.aggregate.body.setLinearVelocity(velocity);
    const angular = arm.rotation.clone().multiply(arm.mesh.quaternion.clone().invert()).normalize();
    if (angular.w < 0) angular.set(-angular.x, -angular.y, -angular.z, -angular.w);
    const angle = 2 * Math.acos(Math.max(-1, Math.min(1, angular.w)));
    const angularVelocity = angle > 0.001
      ? new Vector3(angular.x, angular.y, angular.z).normalize().multiplyScalar(Math.min(10, angle * 12))
      : new Vector3();
    arm.aggregate.body.setAngularVelocity(angularVelocity);
  }

  dispose(): void {
    for (const joint of this.joints) joint.dispose();
    this.characterController.dispose();
    this.capsule.dispose();
    this.capsuleMesh.removeFromParent();
    this.capsuleMesh.geometry.dispose();
    (this.capsuleMesh.material as MeshStandardMaterial).dispose();
    this.avatarRoot.removeFromParent();
    for (const mesh of this.avatarMeshes) mesh.geometry.dispose();
    this.avatarMeshes.length = 0;
    this.avatarArmMeshes.length = 0;
    for (const arm of this.arms) {
      arm.aggregate.dispose();
      arm.mesh.removeFromParent();
      arm.mesh.geometry.dispose();
    }
    this.shirt.dispose();
    this.skin.dispose();
    this.pants.dispose();
    this.shoes.dispose();
    this.arms.length = 0;
  }
}
