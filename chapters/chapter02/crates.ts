import * as THREE from "three";

/**
 * A small rigid-body solver for Nick's House.
 *
 * The shared ArcadePhysics solver only moves bodies vertically and has no
 * rotation or body-to-body contact, which makes the crates feel like sliding
 * sprites. This keeps the crate simulation local to the chapter: boxes have
 * mass, an inertia tensor, angular velocity, friction and restitution, and they
 * collide against each other, the room and the furniture.
 */

const GRAVITY = -14;
const FIXED_STEP = 1 / 120;
const MAX_SUBSTEPS = 14;
const MAX_SPEED = 32;
const MAX_SPIN = 22;
const SOLVER_ITERATIONS = 3;

export interface RigidBoxOptions {
  mass: number;
  friction?: number;
  restitution?: number;
}

const CORNER_SIGNS: [number, number, number][] = [
  [-1, -1, -1],
  [1, -1, -1],
  [-1, 1, -1],
  [1, 1, -1],
  [-1, -1, 1],
  [1, -1, 1],
  [-1, 1, 1],
  [1, 1, 1],
];

function boxAxes(box: RigidBox): THREE.Vector3[] {
  return [
    new THREE.Vector3(1, 0, 0).applyQuaternion(box.quaternion),
    new THREE.Vector3(0, 1, 0).applyQuaternion(box.quaternion),
    new THREE.Vector3(0, 0, 1).applyQuaternion(box.quaternion),
  ];
}

function projectedRadius(box: RigidBox, axes: THREE.Vector3[], axis: THREE.Vector3): number {
  return (
    Math.abs(axis.dot(axes[0])) * box.half.x +
    Math.abs(axis.dot(axes[1])) * box.half.y +
    Math.abs(axis.dot(axes[2])) * box.half.z
  );
}

export class RigidBox {
  readonly position = new THREE.Vector3();
  readonly quaternion = new THREE.Quaternion();
  readonly velocity = new THREE.Vector3();
  readonly angularVelocity = new THREE.Vector3();
  readonly half: THREE.Vector3;
  readonly invMass: number;
  readonly friction: number;
  readonly restitution: number;

  private readonly invInertia = new THREE.Vector3();

  constructor(half: THREE.Vector3, options: RigidBoxOptions) {
    this.half = half.clone();
    this.invMass = options.mass > 0 ? 1 / options.mass : 0;
    this.friction = options.friction ?? 0.55;
    this.restitution = options.restitution ?? 0.12;
    const width = half.x * 2;
    const height = half.y * 2;
    const depth = half.z * 2;
    const mass = options.mass > 0 ? options.mass : 1;
    const ix = (mass / 12) * (height * height + depth * depth);
    const iy = (mass / 12) * (width * width + depth * depth);
    const iz = (mass / 12) * (width * width + height * height);
    this.invInertia.set(options.mass > 0 ? 1 / ix : 0, options.mass > 0 ? 1 / iy : 0, options.mass > 0 ? 1 / iz : 0);
  }

  get isStatic(): boolean {
    return this.invMass === 0;
  }

  /** I⁻¹·v in world space, using the box's current orientation. */
  applyInvInertia(vector: THREE.Vector3): THREE.Vector3 {
    if (this.isStatic) return new THREE.Vector3();
    const inverse = this.quaternion.clone().invert();
    const local = vector.clone().applyQuaternion(inverse);
    local.set(local.x * this.invInertia.x, local.y * this.invInertia.y, local.z * this.invInertia.z);
    return local.applyQuaternion(this.quaternion);
  }

  applyImpulseAt(impulse: THREE.Vector3, point: THREE.Vector3): void {
    if (this.isStatic) return;
    this.velocity.addScaledVector(impulse, this.invMass);
    const offset = point.clone().sub(this.position);
    this.angularVelocity.add(this.applyInvInertia(offset.clone().cross(impulse)));
  }

  pointVelocity(point: THREE.Vector3): THREE.Vector3 {
    const offset = point.clone().sub(this.position);
    return this.velocity.clone().add(this.angularVelocity.clone().cross(offset));
  }

  worldCorner(index: number, out = new THREE.Vector3()): THREE.Vector3 {
    const signs = CORNER_SIGNS[index];
    out.set(signs[0] * this.half.x, signs[1] * this.half.y, signs[2] * this.half.z);
    return out.applyQuaternion(this.quaternion).add(this.position);
  }

  integrate(step: number): void {
    if (this.isStatic) return;
    this.velocity.y += GRAVITY * step;
    this.velocity.multiplyScalar(Math.exp(-0.45 * step));
    this.angularVelocity.multiplyScalar(Math.exp(-1.1 * step));
    if (this.velocity.lengthSq() > MAX_SPEED * MAX_SPEED) this.velocity.setLength(MAX_SPEED);
    if (this.angularVelocity.lengthSq() > MAX_SPIN * MAX_SPIN) this.angularVelocity.setLength(MAX_SPIN);

    this.position.addScaledVector(this.velocity, step);

    const spin = new THREE.Quaternion(
      this.angularVelocity.x,
      this.angularVelocity.y,
      this.angularVelocity.z,
      0
    ).multiply(this.quaternion);
    this.quaternion.set(
      this.quaternion.x + 0.5 * spin.x * step,
      this.quaternion.y + 0.5 * spin.y * step,
      this.quaternion.z + 0.5 * spin.z * step,
      this.quaternion.w + 0.5 * spin.w * step
    ).normalize();
  }
}

interface Contact {
  normal: THREE.Vector3;
  point: THREE.Vector3;
  depth: number;
}

function satContact(a: RigidBox, b: RigidBox): Contact | null {
  const axesA = boxAxes(a);
  const axesB = boxAxes(b);
  const candidates = [...axesA, ...axesB];
  for (const axisA of axesA) {
    for (const axisB of axesB) {
      const cross = new THREE.Vector3().crossVectors(axisA, axisB);
      if (cross.lengthSq() > 1e-6) candidates.push(cross.normalize());
    }
  }

  const delta = new THREE.Vector3().subVectors(a.position, b.position);
  let bestDepth = Infinity;
  let bestAxis: THREE.Vector3 | null = null;
  for (const axis of candidates) {
    const overlap =
      projectedRadius(a, axesA, axis) + projectedRadius(b, axesB, axis) - Math.abs(delta.dot(axis));
    if (overlap <= 0) return null;
    if (overlap < bestDepth) {
      bestDepth = overlap;
      bestAxis = delta.dot(axis) < 0 ? axis.clone().negate() : axis.clone();
    }
  }
  if (!bestAxis) return null;

  // Contact point: the deepest corner of either box that lies inside the other.
  const inverseB = b.quaternion.clone().invert();
  const inverseA = a.quaternion.clone().invert();
  let point: THREE.Vector3 | null = null;
  let depth = 0;
  for (let i = 0; i < 8; i++) {
    const corner = a.worldCorner(i);
    const local = corner.clone().sub(b.position).applyQuaternion(inverseB);
    const dx = b.half.x - Math.abs(local.x);
    const dy = b.half.y - Math.abs(local.y);
    const dz = b.half.z - Math.abs(local.z);
    if (dx <= 0 || dy <= 0 || dz <= 0) continue;
    const cornerDepth = Math.min(dx, dy, dz);
    if (cornerDepth > depth) {
      depth = cornerDepth;
      point = corner;
    }
  }
  for (let i = 0; i < 8; i++) {
    const corner = b.worldCorner(i);
    const local = corner.clone().sub(a.position).applyQuaternion(inverseA);
    const dx = a.half.x - Math.abs(local.x);
    const dy = a.half.y - Math.abs(local.y);
    const dz = a.half.z - Math.abs(local.z);
    if (dx <= 0 || dy <= 0 || dz <= 0) continue;
    const cornerDepth = Math.min(dx, dy, dz);
    if (cornerDepth > depth) {
      depth = cornerDepth;
      point = corner;
    }
  }

  const contactPoint = point ?? a.position.clone().add(b.position).multiplyScalar(0.5);
  return { normal: bestAxis, point: contactPoint, depth: Math.max(bestDepth * 0.5, depth) };
}

function resolveContact(a: RigidBox, b: RigidBox, contact: Contact): void {
  const { normal, point } = contact;
  const offsetA = point.clone().sub(a.position);
  const offsetB = point.clone().sub(b.position);
  const relative = a.pointVelocity(point).sub(b.pointVelocity(point));
  const normalSpeed = relative.dot(normal);

  if (normalSpeed < 0) {
    const inertiaA = a.applyInvInertia(offsetA.clone().cross(normal)).cross(offsetA).dot(normal);
    const inertiaB = b.applyInvInertia(offsetB.clone().cross(normal)).cross(offsetB).dot(normal);
    const mass = a.invMass + b.invMass + inertiaA + inertiaB;
    if (mass > 0) {
      const restitution = Math.abs(normalSpeed) > 1.1 ? Math.min(a.restitution, b.restitution) : 0;
      const impulseMagnitude = (-(1 + restitution) * normalSpeed) / mass;
      const impulse = normal.clone().multiplyScalar(impulseMagnitude);
      a.applyImpulseAt(impulse, point);
      b.applyImpulseAt(impulse.clone().negate(), point);

      const tangent = relative.clone().addScaledVector(normal, -normalSpeed);
      const tangentLength = tangent.length();
      if (tangentLength > 1e-5) {
        const direction = tangent.multiplyScalar(1 / tangentLength);
        const tangentInertiaA = a
          .applyInvInertia(offsetA.clone().cross(direction))
          .cross(offsetA)
          .dot(direction);
        const tangentInertiaB = b
          .applyInvInertia(offsetB.clone().cross(direction))
          .cross(offsetB)
          .dot(direction);
        const tangentMass = a.invMass + b.invMass + tangentInertiaA + tangentInertiaB;
        if (tangentMass > 0) {
          const frictionLimit = impulseMagnitude * Math.sqrt(a.friction * b.friction);
          const frictionMagnitude = Math.max(-frictionLimit, Math.min(frictionLimit, -tangentLength / tangentMass));
          const friction = direction.clone().multiplyScalar(frictionMagnitude);
          a.applyImpulseAt(friction, point);
          b.applyImpulseAt(friction.clone().negate(), point);
        }
      }
    }
  }

  const inverseMass = a.invMass + b.invMass;
  if (inverseMass > 0) {
    const correction = contact.normal
      .clone()
      .multiplyScalar((Math.min(contact.depth, 0.25) * 0.55) / inverseMass);
    a.position.addScaledVector(correction, a.invMass);
    b.position.addScaledVector(correction, -b.invMass);
  }
}

function collide(a: RigidBox, b: RigidBox): void {
  const contact = satContact(a, b);
  if (contact) resolveContact(a, b, contact);
}

/** Advance the crates by `dt` seconds in fixed substeps. */
export function simulate(
  bodies: RigidBox[],
  statics: RigidBox[],
  dt: number,
  applyForces?: (body: RigidBox, step: number) => void
): void {
  let remaining = Math.min(dt, 0.12);
  let steps = 0;
  while (remaining > 1e-5 && steps < MAX_SUBSTEPS) {
    const step = Math.min(FIXED_STEP, remaining);
    remaining -= step;
    steps += 1;

    for (const body of bodies) {
      if (body.isStatic) continue;
      applyForces?.(body, step);
      body.integrate(step);
    }

    for (let iteration = 0; iteration < SOLVER_ITERATIONS; iteration++) {
      for (const body of bodies) {
        for (const solid of statics) collide(body, solid);
        for (const other of bodies) {
          if (other === body) continue;
          if (other.isStatic) continue;
          if (bodies.indexOf(other) < bodies.indexOf(body)) continue;
          collide(body, other);
        }
      }
    }
  }
}
