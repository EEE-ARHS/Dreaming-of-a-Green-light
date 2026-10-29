import { BackSide, Mesh, MeshBasicMaterial, MeshStandardMaterial, Quaternion, Scene, Vector3 } from "three";
import { HavokPhysics, PhysicsAggregate, PhysicsConstraint, PhysicsMotionType, PhysicsShapeType, type PhysicsMaterialOptions } from "./physics";
import {
  Y_AXIS, X_AXIS,
  type PartMaterial, type PartDef, type JointDef,
  PART_DEFS, JOINT_DEFS
} from "./ragdoll-constants";
import { createMyrtlePartMesh } from "./myrtle-model";
import { MYRTLE_Z } from "./world-constants";

type Part = {
  def: PartDef;
  mesh: Mesh;
  aggregate: PhysicsAggregate;
  body: PhysicsAggregate["body"];
  outline: Mesh;
  restPos: Vector3;
  restRot: Quaternion;
};

export type MyrtleMode = "idle" | "crossing" | "waving" | "ragdoll";
export class Myrtle {
  readonly parts: Part[] = [];
  readonly joints: PhysicsConstraint[] = [];
  readonly startPosition = new Vector3(8.3, 0, MYRTLE_Z);
  readonly position = new Vector3(8.3, 0, MYRTLE_Z);
  readonly root = new Vector3(8.3, 0, MYRTLE_Z);
  yaw = -Math.PI / 2; mode: MyrtleMode = "idle"; walkPhase = 0; walkBlend = 0; waveBlend = 0;
  private readonly partMap = new Map<string, Part>();
  private readonly materials: Record<PartMaterial, MeshStandardMaterial>;
  constructor(private readonly scene: Scene, private readonly physics: HavokPhysics) {
    const make = (name: string, hex: string, metalness = 0.06, emissive = "#000000") => new MeshStandardMaterial({ name, color: hex, metalness, roughness: 0.62, emissive });
    this.materials = {
      dress: new MeshStandardMaterial({ name: "myrtleDress", color: "#ff8992", emissive: "#ff435e", emissiveIntensity: 1.25, roughness: 0.38, metalness: 0.02 }),
      skin: new MeshStandardMaterial({ name: "myrtleSkin", color: "#ffd0aa", emissive: "#b56b3c", emissiveIntensity: 0.65, roughness: 0.54 }),
      hair: make("myrtleHair", "#483540", 0.06, "#22121a"),
      shoe: make("myrtleShoe", "#34282a", 0.12, "#100a0b"),
      pearl: new MeshStandardMaterial({ name: "myrtlePearl", color: "#ffffff", emissive: "#ffe4a6", emissiveIntensity: 1.35, roughness: 0.28, metalness: 0.08 }),
    };
    for (const def of PART_DEFS) { const part = this.createPart(def); this.parts.push(part); this.partMap.set(def.name, part); }
    for (const def of JOINT_DEFS) this.createJoint(def);
    this.pose(0);
  }
  private createPart(def: PartDef): Part {
    let shape: "box" | "capsule" | "sphere";
    const options: PhysicsMaterialOptions = { mass: def.mass, friction: 0.75, restitution: 0.05 };
    if (def.kind === "box" && def.size) {
      shape = PhysicsShapeType.BOX;
      options.extents = new Vector3(...def.size);
    } else if (def.kind === "capsule" && def.radius && def.length) {
      shape = PhysicsShapeType.CAPSULE;
      const half = def.length / 2 - def.radius;
      options.radius = def.radius;
      options.pointA = new Vector3(0, -half, 0);
      options.pointB = new Vector3(0, half, 0);
    } else {
      const radius = def.radius ?? 0.1;
      shape = PhysicsShapeType.SPHERE;
      options.radius = radius;
    }
    const partMesh = createMyrtlePartMesh(def, this.materials);
    const outline = new Mesh(partMesh.geometry, new MeshBasicMaterial({ color: "#ffffff", side: BackSide }));
    outline.name = `myrtleOutline:${def.name}`;
    outline.scale.setScalar(1.09);
    outline.renderOrder = 2;
    outline.castShadow = false;
    outline.receiveShadow = false;
    partMesh.add(outline);
    this.scene.add(partMesh);
    const aggregate = new PhysicsAggregate(partMesh, shape, options, this.physics);
    return { def, mesh: partMesh, aggregate, body: aggregate.body, outline, restPos: new Vector3(...def.pos), restRot: new Quaternion() };
  }
  private createJoint(def: JointDef): void {
    const parent = this.partMap.get(def.parent), child = this.partMap.get(def.child);
    if (!parent || !child) throw new Error(`Unknown ragdoll joint ${def.parent} -> ${def.child}`);
    const pivot = new Vector3(...def.pivot);
    const constraint = new PhysicsConstraint(this.physics.scene, { pivotA: pivot.clone().sub(parent.restPos), pivotB: pivot.clone().sub(child.restPos) }, def.limits);
    this.physics.addConstraint(parent.body, child.body, constraint);
    this.joints.push(constraint);
  }
  startCrossing(): void { if (this.mode === "idle") this.mode = "crossing"; }
  update(dt: number, _playerZ: number): void {
    if (this.mode === "ragdoll") return;
    this.walkBlend += ((this.mode === "crossing" ? 1 : 0) - this.walkBlend) * Math.min(1, dt * 4);
    this.waveBlend += ((this.mode === "waving" ? 1 : 0) - this.waveBlend) * Math.min(1, dt * 3);
    if (this.mode === "crossing") { this.position.x -= 2.05 * dt; if (this.position.x <= 1.15) { this.position.x = 1.15; this.mode = "waving"; } this.yaw = -Math.PI / 2; }
    else if (this.mode === "waving") this.yaw += (-Math.PI / 2 - 0.25 - this.yaw) * Math.min(1, dt * 2);
    else this.yaw += (-Math.PI / 2 + 0.1 - this.yaw) * Math.min(1, dt * 0.6);
    this.walkPhase += dt * 6.2 * (0.25 + this.walkBlend); this.position.z = MYRTLE_Z; this.pose(this.walkPhase);
  }
  private pose(phase: number): void {
    const origin = this.position, bob = Math.sin(phase * 2) * 0.014 * this.walkBlend + Math.sin(phase * 0.7) * 0.004, lean = 0.06 * this.walkBlend;
    const qYaw = new Quaternion().setFromAxisAngle(Y_AXIS, this.yaw), qLean = new Quaternion().setFromAxisAngle(X_AXIS, lean);
    const local = (x: number, y: number, z: number, q: Quaternion) => new Vector3(x, y, z).applyQuaternion(q);
    const pelvisPos = origin.clone().add(new Vector3(0, 0.98 + bob, 0));
    const torsoRot = qYaw.clone().multiply(qLean), torsoPos = pelvisPos.clone().add(local(0, 0.24, 0, torsoRot));
    const headRot = qYaw.clone().multiply(new Quaternion().setFromAxisAngle(X_AXIS, lean * 0.5)), headPos = torsoPos.clone().add(local(0, 0.28, 0.005, torsoRot));
    this.setPart("pelvis", pelvisPos, qYaw); this.setPart("torso", torsoPos, torsoRot); this.setPart("head", headPos, headRot);
    for (const side of [-1, 1] as const) {
      const suffix = side < 0 ? "L" : "R", shoulder = torsoPos.clone().add(local(side * 0.215, 0.16, 0, torsoRot));
      let swing = Math.sin(phase + (side < 0 ? 0 : Math.PI)) * 0.42 * this.walkBlend;
      if (side > 0 && this.waveBlend > 0.01) swing += (-2.25 + Math.sin(phase * 5) * 0.14) * this.waveBlend;
      const armRot = qYaw.clone().multiply(new Quaternion().setFromAxisAngle(X_AXIS, swing));
      const upperPos = shoulder.clone().add(local(0, -0.15, 0, armRot)), elbow = shoulder.clone().add(local(0, -0.3, 0, armRot));
      const forearmSwing = side > 0 && this.waveBlend > 0.05 ? 0.25 : 0.18 + this.walkBlend * 0.15;
      const forearmRot = qYaw.clone().multiply(new Quaternion().setFromAxisAngle(X_AXIS, swing + forearmSwing));
      const lowerPos = elbow.clone().add(local(0, -0.135, 0, forearmRot));
      this.setPart("armU" + suffix, upperPos, armRot); this.setPart("armF" + suffix, lowerPos, forearmRot);
    }
    for (const side of [-1, 1] as const) {
      const suffix = side < 0 ? "L" : "R", hip = pelvisPos.clone().add(local(side * 0.095, -0.08, 0, qYaw));
      const legPhase = phase + (side < 0 ? 0 : Math.PI), swing = Math.sin(legPhase) * 0.52 * this.walkBlend;
      const kneeBend = -Math.max(0, -Math.cos(legPhase)) * 0.85 * this.walkBlend;
      const thighRot = qYaw.clone().multiply(new Quaternion().setFromAxisAngle(X_AXIS, swing));
      const thighPos = hip.clone().add(local(0, -0.195, 0, thighRot)), knee = hip.clone().add(local(0, -0.39, 0, thighRot));
      const shinRot = qYaw.clone().multiply(new Quaternion().setFromAxisAngle(X_AXIS, swing + kneeBend));
      const shinPos = knee.clone().add(local(0, -0.155, 0, shinRot)), ankle = knee.clone().add(local(0, -0.335, 0, shinRot));
      const footPos = ankle.clone().add(local(0, -0.075, 0.055, qYaw)), footRot = qYaw.clone().multiply(new Quaternion().setFromAxisAngle(X_AXIS, this.walkBlend * 0.18));
      this.setPart("thigh" + suffix, thighPos, thighRot); this.setPart("shin" + suffix, shinPos, shinRot); this.setPart("foot" + suffix, footPos, footRot);
    }
  }
  private setPart(name: string, pos: Vector3, rot: Quaternion): void {
    const part = this.partMap.get(name);
    if (!part) return;
    part.mesh.position.copy(pos);
    part.mesh.quaternion.copy(rot);
    part.mesh.updateMatrixWorld(true);
    if (part.body.motionType === PhysicsMotionType.ANIMATED) part.body.setTransform(pos, rot);
  }
  activate(carVelocity: Vector3): void {
    if (this.mode === "ragdoll") return; this.mode = "ragdoll";
    const impact = new Vector3(this.position.x, 1.1, this.position.z);
    for (const part of this.parts) { part.body.setLinearVelocity(new Vector3()); part.body.setAngularVelocity(new Vector3()); part.body.setMotionType(PhysicsMotionType.DYNAMIC); }
    for (const part of this.parts) {
      const radial = part.mesh.position.clone().sub(impact); radial.y = Math.abs(radial.y) + 0.25; if (radial.lengthSq() > 0.0001) radial.normalize();
      const shove = carVelocity.clone().multiplyScalar(1.25 + Math.random() * 0.25), jitter = new Vector3((Math.random() - 0.5) * 4.5, 2.2 + Math.random() * 3.2, (Math.random() - 0.5) * 4.5);
      part.body.setLinearVelocity(shove.add(jitter).addScaledVector(radial, 4.5 + Math.random() * 2.5));
      part.body.setAngularVelocity(new Vector3((Math.random() - 0.5) * 16, (Math.random() - 0.5) * 16, (Math.random() - 0.5) * 16));
    }
  }
  getHitTestPoints(): Vector3[] { return ["pelvis", "torso", "head", "thighL", "thighR", "shinL", "shinR"].map((name) => this.partMap.get(name)!.mesh.position.clone()); }
  getCenter(): Vector3 { return this.partMap.get("torso")!.mesh.position.clone().add(this.partMap.get("pelvis")!.mesh.position).multiplyScalar(0.5); }
  reset(): void {
    this.mode = "idle"; this.walkPhase = 0; this.walkBlend = 0; this.waveBlend = 0; this.position.copy(this.startPosition); this.yaw = -Math.PI / 2;
    for (const joint of this.joints) joint.dispose();
    this.joints.length = 0;
    for (const part of this.parts) { part.body.setLinearVelocity(new Vector3()); part.body.setAngularVelocity(new Vector3()); part.body.setMotionType(PhysicsMotionType.ANIMATED); }
    this.pose(0);
    for (const def of JOINT_DEFS) this.createJoint(def);
  }
  get bodyCount(): number { return this.parts.length; }
  get jointCount(): number { return this.joints.length; }
}
