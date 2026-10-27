import * as THREE from "three";

export interface SailingYachtRig {
  readonly root: THREE.Group;
  setSail(steering: number, wind: number, dt: number): void;
}

/**
 * A moonlit sailing yacht with a swept triangular sail, cabin and helm.
 */
export function createSailingYacht(): SailingYachtRig {
  const root = new THREE.Group();
  root.name = "chapter15-boat";

  const warmBoatLight = new THREE.PointLight(0xffd29a, 1.8, 6, 2);
  warmBoatLight.position.set(-0.65, 2.25, 0.15);
  root.add(warmBoatLight);
  const coolBoatFill = new THREE.PointLight(0xbdd7ff, 1.2, 7, 2);
  coolBoatFill.position.set(0.7, 2.2, -0.35);
  root.add(coolBoatFill);

  const hullMaterial = new THREE.MeshStandardMaterial({ color: 0x9b8060, roughness: 0.42, metalness: 0.16, side: THREE.DoubleSide, emissive: 0x302315, emissiveIntensity: 0.8 });
  const trimMaterial = new THREE.MeshStandardMaterial({ color: 0xc1a77e, roughness: 0.46, metalness: 0.2, emissive: 0x25190d, emissiveIntensity: 0.45 });
  const sailMaterial = new THREE.MeshStandardMaterial({ color: 0xf4f1e8, roughness: 1, metalness: 0, side: THREE.DoubleSide, emissive: 0x9aabc9, emissiveIntensity: 0.5 });
  const fittingMaterial = new THREE.MeshStandardMaterial({ color: 0x8998a2, roughness: 0.38, metalness: 0.72, emissive: 0x19232b, emissiveIntensity: 0.35 });
  const figureMaterial = new THREE.MeshStandardMaterial({ color: 0x9eacc0, roughness: 0.78, metalness: 0.05, emissive: 0x2d3b52, emissiveIntensity: 0.65 });

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

  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.075, 3.45, 10), fittingMaterial);
  mast.position.set(0, 1.82, -0.12);
  root.add(mast);
  const sail = new THREE.Group();
  sail.name = "chapter15-main-sail";
  sail.position.set(0, 0.18, -0.1);
  root.add(sail);
  const sailGeometry = new THREE.BufferGeometry();
  sailGeometry.setAttribute("position", new THREE.Float32BufferAttribute([
    0, 0.28, 0.04, 0, 3.35, 0.04, 1.9, 0.42, 0.04,
    0, 0.28, 0.04, 1.9, 0.42, 0.04, 1.25, 0.08, 0.04,
  ], 3));
  sailGeometry.computeVertexNormals();
  const mainsail = new THREE.Mesh(sailGeometry, sailMaterial);
  mainsail.name = "chapter15-luminous-sail";
  sail.add(mainsail);
  const boom = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 1.9, 8), fittingMaterial);
  boom.rotation.z = Math.PI / 2;
  boom.position.set(0.95, 0.3, 0.04);
  sail.add(boom);
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(0.78, 0.48, 1.12), trimMaterial);
  cabin.position.set(0, 0.43, -0.82);
  root.add(cabin);
  const cabinWindowMaterial = new THREE.MeshStandardMaterial({ color: 0x91bfd0, roughness: 0.2, metalness: 0.38, emissive: 0x36637a, emissiveIntensity: 1.1 });
  const cabinWindow = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.2, 0.035), cabinWindowMaterial);
  cabinWindow.position.set(0, 0.55, -0.245);
  root.add(cabinWindow);
  const helm = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.025, 8, 20), fittingMaterial);
  helm.position.set(0, 0.77, -1.28);
  root.add(helm);

  const skipper = new THREE.Group();
  skipper.name = "chapter15-skipper";
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.14, 0.28, 4, 10), figureMaterial);
  torso.position.set(0, 0.62, -1.05);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.1, 12, 10), figureMaterial);
  head.position.set(0, 0.92, -1.05);
  skipper.add(torso, head);
  root.add(skipper);

  const mastLight = new THREE.PointLight(0xffd49a, 2.8, 8, 2);
  mastLight.position.set(-0.45, 2.5, 0.15);
  root.add(mastLight);
  const moonFill = new THREE.PointLight(0xc7ddff, 2, 8, 2);
  moonFill.position.set(0.75, 1.8, -0.15);
  root.add(moonFill);
  return {
    root,
    setSail(steering: number, wind: number, dt: number): void {
      sail.rotation.y += (steering * 0.38 - sail.rotation.y) * Math.min(1, 4 * Math.max(0, dt));
      sail.rotation.z = Math.sin(wind) * 0.035;
      mainsail.scale.x = 0.96 + Math.sin(wind * 0.7) * 0.05;
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
