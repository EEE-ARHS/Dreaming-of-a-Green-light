import HavokWasmFactory from "@babylonjs/havok";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Quaternion as HavokQuaternion, Vector3 as HavokVector3 } from "@babylonjs/core/Maths/math.vector";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { PhysicsConstraintAxis, PhysicsMotionType as HavokMotionType, PhysicsPrestepType, PhysicsShapeType as HavokShapeType } from "@babylonjs/core/Physics/v2/IPhysicsEnginePlugin";
import { HavokPlugin } from "@babylonjs/core/Physics/v2/Plugins/havokPlugin";
import { PhysicsAggregate as HavokAggregate } from "@babylonjs/core/Physics/v2/physicsAggregate";
import { PhysicsShapeCapsule, PhysicsShapeSphere } from "@babylonjs/core/Physics/v2/physicsShape";
import { PhysicsBody as HavokBody } from "@babylonjs/core/Physics/v2/physicsBody";
import { Physics6DoFConstraint as Havok6DoFConstraint } from "@babylonjs/core/Physics/v2/physicsConstraint";
import { Scene as HavokScene } from "@babylonjs/core/scene";
import "@babylonjs/core/Physics/joinedPhysicsEngineComponent";
import "@babylonjs/core/Physics/v2/physicsEngineComponent";
import { Object3D, Quaternion as ThreeQuaternion, Vector3 } from "three";

export const PhysicsShapeType = { BOX: "box", CAPSULE: "capsule", SPHERE: "sphere" } as const;
export type PhysicsShapeType = (typeof PhysicsShapeType)[keyof typeof PhysicsShapeType];
export const PhysicsMotionType = { STATIC: "static", ANIMATED: "animated", DYNAMIC: "dynamic" } as const;
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

export interface PhysicsJointLimits {
  twist: [number, number];
  pitch: [number, number];
  roll: [number, number];
}

/** Thin Three.js-facing adapter around a real Babylon/Havok rigid body. */
export class PhysicsBody {
  motionType: PhysicsMotionType = "animated";

  constructor(
    readonly object: Object3D,
    readonly mass: number,
    readonly node: TransformNode,
    readonly havokBody: HavokBody,
  ) {}

  setMotionType(type: PhysicsMotionType): void {
    this.motionType = type;
    const motionType = type === "dynamic" ? HavokMotionType.DYNAMIC : type === "static" ? HavokMotionType.STATIC : HavokMotionType.ANIMATED;
    this.havokBody.setMotionType(motionType);
    this.havokBody.setPrestepType(type === "animated" ? PhysicsPrestepType.TELEPORT : PhysicsPrestepType.DISABLED);
  }

  setLinearVelocity(velocity: Vector3): void {
    this.havokBody.setLinearVelocity(toHavokVector(velocity));
  }

  setTransform(position: Vector3, rotation: ThreeQuaternion): void {
    this.node.position.set(position.x, position.y, position.z);
    this.node.rotationQuaternion!.copyFromFloats(rotation.x, rotation.y, rotation.z, rotation.w);
    this.node.computeWorldMatrix(true);
    syncHavokToThree(this.node, this.object);
  }

  setAngularVelocity(velocity: Vector3): void {
    this.havokBody.setAngularVelocity(toHavokVector(velocity));
  }
}

export class PhysicsAggregate {
  readonly body: PhysicsBody;
  private readonly aggregate: HavokAggregate;

  constructor(object: Object3D, shape: PhysicsShapeType, options: PhysicsMaterialOptions, private readonly physics: HavokPhysics) {
    const node = physics.createNode(object);
    const extents = options.extents ?? (shape === "box" ? getGeometryExtents(object) : undefined);
    const params = {
      mass: options.mass,
      friction: options.friction,
      restitution: options.restitution,
      radius: options.radius,
      pointA: options.pointA ? toHavokVector(options.pointA) : undefined,
      pointB: options.pointB ? toHavokVector(options.pointB) : undefined,
      extents: extents ? toHavokVector(extents) : undefined,
    };
    const havokShape = shape === "capsule"
      ? new PhysicsShapeCapsule(params.pointA ?? new HavokVector3(0, -0.25, 0), params.pointB ?? new HavokVector3(0, 0.25, 0), params.radius ?? 0.1, physics.scene)
      : shape === "sphere"
        ? new PhysicsShapeSphere(new HavokVector3(0, 0, 0), params.radius ?? 0.1, physics.scene)
        : undefined;
    this.aggregate = new HavokAggregate(node, havokShape ?? toHavokShape(shape), params, physics.scene);
    this.body = new PhysicsBody(object, options.mass, node, this.aggregate.body);
    this.body.motionType = options.mass === 0 ? "static" : "dynamic";
    this.body.havokBody.setMotionType(options.mass === 0 ? HavokMotionType.STATIC : HavokMotionType.DYNAMIC);
    object.userData.physicsBody = this.body;
    physics.add(this);
  }

  dispose(): void {
    this.physics.remove(this);
    this.aggregate.dispose();
    this.body.node.dispose(false, false);
    if (this.body.object.userData.physicsBody === this.body) delete this.body.object.userData.physicsBody;
  }
}

export class PhysicsConstraint {
  private readonly constraint: Havok6DoFConstraint;

  constructor(scene: HavokScene, options: { pivotA: Vector3; pivotB: Vector3 }, limits: PhysicsJointLimits) {
    this.constraint = new Havok6DoFConstraint({
      pivotA: toHavokVector(options.pivotA),
      pivotB: toHavokVector(options.pivotB),
      axisA: new HavokVector3(1, 0, 0),
      perpAxisA: new HavokVector3(0, 1, 0),
      axisB: new HavokVector3(1, 0, 0),
      perpAxisB: new HavokVector3(0, 1, 0),
    }, [
      { axis: PhysicsConstraintAxis.LINEAR_X, minLimit: 0, maxLimit: 0 },
      { axis: PhysicsConstraintAxis.LINEAR_Y, minLimit: 0, maxLimit: 0 },
      { axis: PhysicsConstraintAxis.LINEAR_Z, minLimit: 0, maxLimit: 0 },
      { axis: PhysicsConstraintAxis.ANGULAR_X, minLimit: limits.twist[0], maxLimit: limits.twist[1] },
      { axis: PhysicsConstraintAxis.ANGULAR_Y, minLimit: limits.pitch[0], maxLimit: limits.pitch[1] },
      { axis: PhysicsConstraintAxis.ANGULAR_Z, minLimit: limits.roll[0], maxLimit: limits.roll[1] },
    ], scene);
  }

  attach(parent: PhysicsBody, child: PhysicsBody): void {
    parent.havokBody.addConstraint(child.havokBody, this.constraint);
  }

  dispose(): void {
    this.constraint.dispose();
  }
}

/** One shared Havok world and lifecycle for all chapters rendered by React Three Fiber. */
export class HavokPhysics {
  readonly scene: HavokScene;
  private readonly aggregates = new Set<PhysicsAggregate>();

  private constructor(private readonly backend: NullEngine, scene: HavokScene) {
    this.scene = scene;
    this.scene.getPhysicsEngine()!.setTimeStep(1 / 60);
  }

  static async create(): Promise<HavokPhysics> {
    const backend = new NullEngine({ renderWidth: 1, renderHeight: 1, textureSize: 1, lockstepMaxSteps: 1, deterministicLockstep: false });
    const scene = new HavokScene(backend);
    try {
      const havok = await HavokWasmFactory();
      if (!scene.enablePhysics(new HavokVector3(0, -9.81, 0), new HavokPlugin(true, havok))) {
        throw new Error("Havok physics could not be initialized.");
      }
      return new HavokPhysics(backend, scene);
    } catch (error) {
      scene.dispose();
      backend.dispose();
      throw error;
    }
  }

  createNode(object: Object3D): TransformNode {
    const node = new TransformNode(`physics:${object.name || "body"}`, this.scene);
    syncThreeToHavok(object, node);
    return node;
  }

  setTimeStep(seconds: number): void {
    this.scene.getPhysicsEngine()!.setTimeStep(Math.max(1 / 240, Math.min(1 / 30, seconds)));
  }

  add(aggregate: PhysicsAggregate): void {
    this.aggregates.add(aggregate);
  }

  remove(aggregate: PhysicsAggregate): void {
    this.aggregates.delete(aggregate);
  }

  addConstraint(parent: PhysicsBody, child: PhysicsBody, constraint: PhysicsConstraint): void {
    constraint.attach(parent, child);
  }

  step(): void {
    for (const aggregate of this.aggregates) {
      if (aggregate.body.motionType === "animated") syncThreeToHavok(aggregate.body.object, aggregate.body.node);
    }
    const engine = this.scene.getPhysicsEngine();
    if (!engine) throw new Error("Havok physics engine is not available.");
    this.scene._advancePhysicsEngineStep(engine.getTimeStep() * 1000);
    for (const aggregate of this.aggregates) {
      if (aggregate.body.motionType === "dynamic") syncHavokToThree(aggregate.body.node, aggregate.body.object);
    }
  }

  dispose(): void {
    for (const aggregate of [...this.aggregates]) aggregate.dispose();
    this.scene.dispose();
    this.backend.dispose();
  }
}

function toHavokShape(shape: PhysicsShapeType): HavokShapeType {
  if (shape === "box") return HavokShapeType.BOX;
  if (shape === "capsule") return HavokShapeType.CAPSULE;
  return HavokShapeType.SPHERE;
}

function toHavokVector(vector: Vector3): HavokVector3 {
  return new HavokVector3(vector.x, vector.y, vector.z);
}

function getGeometryExtents(object: Object3D): Vector3 | undefined {
  const geometry = (object as Object3D & { geometry?: { boundingBox: import("three").Box3 | null; computeBoundingBox: () => void } }).geometry;
  if (!geometry) return undefined;
  geometry.computeBoundingBox();
  if (!geometry.boundingBox) return undefined;
  return geometry.boundingBox.getSize(new Vector3()).multiply(object.scale);
}

function syncThreeToHavok(object: Object3D, node: TransformNode): void {
  const position = object.getWorldPosition(new Vector3());
  const rotation = object.getWorldQuaternion(new ThreeQuaternion());
  const scale = object.getWorldScale(new Vector3());    node.position.set(position.x, position.y, position.z);
    if (!node.rotationQuaternion) node.rotationQuaternion = new HavokQuaternion();
    node.rotationQuaternion.copyFromFloats(rotation.x, rotation.y, rotation.z, rotation.w);
  node.scaling.set(scale.x, scale.y, scale.z);
  node.computeWorldMatrix(true);
}

function syncHavokToThree(node: TransformNode, object: Object3D): void {
  const worldPosition = new Vector3(node.position.x, node.position.y, node.position.z);
  const worldRotation = node.rotationQuaternion!;
  if (object.parent) {
    object.position.copy(object.parent.worldToLocal(worldPosition));
    const parentRotation = object.parent.getWorldQuaternion(new ThreeQuaternion()).invert();
    object.quaternion.set(parentRotation.x, parentRotation.y, parentRotation.z, parentRotation.w)
      .multiply(new ThreeQuaternion(worldRotation.x, worldRotation.y, worldRotation.z, worldRotation.w));
  } else {
    object.position.copy(worldPosition);
    object.quaternion.set(worldRotation.x, worldRotation.y, worldRotation.z, worldRotation.w);
  }
  object.updateMatrixWorld(true);
}
