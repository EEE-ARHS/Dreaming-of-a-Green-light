import * as THREE from "three";
import { PhysicsAggregate, PhysicsMotionType, PhysicsShapeType, type HavokPhysics } from "../../frontend/src/physics";

export function addStaticCollider(
  physics: HavokPhysics,
  aggregates: PhysicsAggregate[],
  object: THREE.Object3D,
  width: number,
  height: number,
  depth: number,
): void {
  const aggregate = new PhysicsAggregate(object, PhysicsShapeType.BOX, {
    mass: 0,
    friction: 0.72,
    restitution: 0.04,
    extents: new THREE.Vector3(width, height, depth),
  }, physics);
  aggregate.body.setMotionType(PhysicsMotionType.STATIC);
  aggregates.push(aggregate);
}
