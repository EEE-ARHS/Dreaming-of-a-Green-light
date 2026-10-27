import * as THREE from "three";

const OARLOCK_X = 0.63;
const OARLOCK_Y = 0.44;
const OARLOCK_Z = 0.05;
const INBOARD = 0.85;
const OUTBOARD = 2;
const BLADE_CENTRE = 1.88;
/** Blade sweep, in radians from the catch (blades forward) to the finish (blades aft). */
const SWEEP_CATCH = -0.95;
const SWEEP_FINISH = 0.58;
/** The oar rolls the blade down into the water, and feathers it clear again. */
const DIP = -0.3;
const RISE = 0.22;
const LIFT_RATE = 18;
/** The rower slides with the stroke, from the catch to the finish. */
const SEAT_CATCH = -0.55;
const SEAT_FINISH = -0.2;

export interface RowboatRig {
  readonly root: THREE.Group;
  /**
   * `stroke` runs -1 (catch) to 1 (finish); `trim` favours one oar when
   * steering; `bladeDown` says whether the blades are in the water or feathered
   * clear of it.
   */
  setStroke(stroke: number, trim: number, bladeDown: boolean, dt: number): void;
  /** World position of a blade, for splash rings and water contact. */
  bladePosition(side: number, out: THREE.Vector3): THREE.Vector3;
}

/**
 * A clinker rowboat built from scratch: a tapered hull, two oars that sweep and
 * dip, and a dark figure sliding between them. The oars are the only moving
 * parts the player ever touches, so they get the detail.
 */
export function createRowboat(): RowboatRig {
  const root = new THREE.Group();
  root.name = "chapter15-boat";

  const hullMaterial = new THREE.MeshStandardMaterial({ color: 0x5a4632, roughness: 0.58, metalness: 0.1, side: THREE.DoubleSide, emissive: 0x1a1008, emissiveIntensity: 0.55 });
  const trimMaterial = new THREE.MeshStandardMaterial({ color: 0x6a5638, roughness: 0.55, metalness: 0.12 });
  const oarMaterial = new THREE.MeshStandardMaterial({ color: 0x7a5d3a, roughness: 0.45, metalness: 0.08, side: THREE.DoubleSide, emissive: 0x241608, emissiveIntensity: 0.4 });
  const fittingMaterial = new THREE.MeshStandardMaterial({ color: 0x526068, roughness: 0.45, metalness: 0.6 });
  const figureMaterial = new THREE.MeshStandardMaterial({ color: 0x363e48, roughness: 0.9, metalness: 0.05 });

  const hull = new THREE.Mesh(taperedHull(), hullMaterial);
  hull.name = "chapter15-hull";
  root.add(hull);

  const floor = new THREE.Mesh(new THREE.BoxGeometry(0.74, 0.03, 2.5), trimMaterial);
  floor.position.set(0, 0.1, 0);
  root.add(floor);
  for (const z of [0.42, -0.72]) {
    const thwart = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.05, 0.28), trimMaterial);
    thwart.position.set(0, 0.37, z);
    root.add(thwart);
  }
  const deck = new THREE.Mesh(new THREE.BoxGeometry(0.66, 0.04, 0.5), trimMaterial);
  deck.position.set(0, 0.42, -1.28);
  root.add(deck);

  const oarlockGeometry = new THREE.CylinderGeometry(0.045, 0.055, 0.17, 8);
  const oarShaftGeometry = new THREE.CylinderGeometry(0.028, 0.032, INBOARD + OUTBOARD, 8);
  const oarHandleGeometry = new THREE.CylinderGeometry(0.034, 0.034, 0.3, 8);
  const bladeGeometry = new THREE.BoxGeometry(0.82, 0.34, 0.04);

  const bladeMaterial = new THREE.MeshStandardMaterial({ color: 0x8a663e, roughness: 0.5, metalness: 0.06, side: THREE.DoubleSide, emissive: 0x442410, emissiveIntensity: 0.7 });
  const collarGeometry = new THREE.CylinderGeometry(0.05, 0.05, 0.12, 8);

  const rower = new THREE.Group();
  rower.name = "chapter15-rower";
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.17, 0.36, 4, 10), figureMaterial);
  torso.position.set(0, 0.72, 0);
  const shoulders = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.14, 0.2), figureMaterial);
  shoulders.position.set(0, 0.9, 0);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.11, 12, 10), figureMaterial);
  head.position.set(0, 1.05, 0);
  rower.add(torso, shoulders, head);
  root.add(rower);

  const oars: { pivot: THREE.Group; lift: THREE.Group; blade: THREE.Mesh; side: number }[] = [];
  for (const side of [1, -1]) {
    const pivot = new THREE.Group();
    pivot.position.set(side * OARLOCK_X, OARLOCK_Y, OARLOCK_Z);
    const lift = new THREE.Group();
    pivot.add(lift);
    const shaft = new THREE.Mesh(oarShaftGeometry, oarMaterial);
    shaft.rotation.z = (-side * Math.PI) / 2;
    shaft.position.x = (side * (OUTBOARD - INBOARD)) / 2;
    const handle = new THREE.Mesh(oarHandleGeometry, oarMaterial);
    handle.rotation.z = (-side * Math.PI) / 2;
    handle.position.x = side * -(INBOARD - 0.15);
    const collar = new THREE.Mesh(collarGeometry, fittingMaterial);
    collar.rotation.z = (-side * Math.PI) / 2;
    const blade = new THREE.Mesh(bladeGeometry, bladeMaterial);
    blade.position.x = side * BLADE_CENTRE;
    lift.add(shaft, handle, collar, blade);
    root.add(pivot);
    const oarlock = new THREE.Mesh(oarlockGeometry, fittingMaterial);
    oarlock.position.set(side * OARLOCK_X, OARLOCK_Y - 0.06, OARLOCK_Z);
    root.add(oarlock);
    oars.push({ pivot, lift, blade, side });
  }

  let currentLift = RISE;
  return {
    root,
    setStroke(stroke: number, trim: number, bladeDown: boolean, dt: number): void {
      const t = THREE.MathUtils.clamp((stroke + 1) / 2, 0, 1);
      const sweep = THREE.MathUtils.lerp(SWEEP_CATCH, SWEEP_FINISH, t);
      const target = bladeDown ? DIP : RISE;
      currentLift += (target - currentLift) * Math.min(1, LIFT_RATE * Math.max(0, dt));
      for (const oar of oars) {
        oar.pivot.rotation.y = oar.side * (sweep + trim * 0.12);
        oar.lift.rotation.z = oar.side * currentLift;
      }
      rower.position.z = THREE.MathUtils.lerp(SEAT_CATCH, SEAT_FINISH, t) + trim * 0.04;
      rower.rotation.x = 0.1 * t;
    },
    bladePosition(side: number, target: THREE.Vector3): THREE.Vector3 {
      const oar = oars.find((item) => item.side === side) ?? oars[0];
      return oar.blade.getWorldPosition(target);
    },
  };
}

/** A lathe hull, pinched to a bow and squared off at the transom. */
function taperedHull(): THREE.BufferGeometry {
  const profile = [
    new THREE.Vector2(0.02, -0.02),
    new THREE.Vector2(0.24, 0),
    new THREE.Vector2(0.38, 0.12),
    new THREE.Vector2(0.47, 0.3),
    new THREE.Vector2(0.5, 0.48),
  ];
  const geometry = new THREE.LatheGeometry(profile, 28);
  geometry.scale(0.86, 1, 3);
  const position = geometry.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < position.count; i++) {
    const z = position.getZ(i);
    if (z > 0.55) {
      const t = smoothstep((z - 0.55) / 1.4);
      position.setX(i, position.getX(i) * (1 - 0.66 * t));
      position.setY(i, position.getY(i) * (1 - 0.22 * t) + 0.1 * t);
    } else if (z < -1.3) {
      const t = smoothstep((-z - 1.3) / 0.5);
      position.setX(i, position.getX(i) * (1 - 0.44 * t));
      position.setY(i, position.getY(i) * (1 - 0.08 * t));
    }
  }
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

function smoothstep(value: number): number {
  const t = THREE.MathUtils.clamp(value, 0, 1);
  return t * t * (3 - 2 * t);
}
