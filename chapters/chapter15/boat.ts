import * as THREE from "three";

export interface LuxuryYachtRig {
  readonly root: THREE.Group;
  animate(steering: number, time: number): void;
}

/**
 * Gatsby's elegant, deep-hulled motor yacht with brass trim and a raised salon.
 */
export function createLuxuryYacht(): LuxuryYachtRig {
  const root = new THREE.Group();
  root.name = "chapter15-boat";
  root.scale.setScalar(2.55);

  const warmBoatLight = new THREE.PointLight(0xffe5bd, 2.3, 13, 2);
  warmBoatLight.position.set(-0.65, 2.25, 0.15);
  root.add(warmBoatLight);
  const coolBoatFill = new THREE.PointLight(0xfff4df, 1.7, 15, 2);
  coolBoatFill.position.set(0.7, 2.2, -0.35);
  root.add(coolBoatFill);

  const hullMaterial = new THREE.MeshStandardMaterial({ color: 0xfaf9f4, roughness: 0.2, metalness: 0.22, side: THREE.DoubleSide, emissive: 0x4a463d, emissiveIntensity: 0.14 });
  const trimMaterial = new THREE.MeshStandardMaterial({ color: 0xe9e3d2, roughness: 0.3, metalness: 0.48, emissive: 0x302916, emissiveIntensity: 0.16 });
  const goldMaterial = new THREE.MeshStandardMaterial({ color: 0xe0c27a, roughness: 0.3, metalness: 0.78, emissive: 0x4c310b, emissiveIntensity: 0.55 });
  const fittingMaterial = new THREE.MeshStandardMaterial({ color: 0xb4b5b2, roughness: 0.38, metalness: 0.72, emissive: 0x242321, emissiveIntensity: 0.2 });

  const hull = new THREE.Mesh(taperedHull(), hullMaterial);
  hull.name = "chapter15-hull";
  hull.scale.set(2.45, 1.8, 2.8);
  root.add(hull);
  const upperHull = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.32, 6.2), goldMaterial);
  upperHull.position.set(0, 0.43, -0.05);
  upperHull.name = "chapter15-gold-gunwale";
  root.add(upperHull);
  const deck = new THREE.Mesh(new THREE.BoxGeometry(1.95, 0.12, 5.35), trimMaterial);
  deck.position.set(0, 0.58, -0.24);
  root.add(deck);
  const floor = new THREE.Mesh(new THREE.BoxGeometry(1.82, 0.08, 5.8), hullMaterial);
  floor.position.set(0, 0.45, 0);
  root.add(floor);
  const salon = new THREE.Mesh(new THREE.BoxGeometry(1.38, 1.02, 1.88), hullMaterial);
  salon.position.set(0, 1.03, -0.82);
  root.add(salon);
  const cabinWindow = new THREE.Mesh(new THREE.BoxGeometry(1.14, 0.42, 0.055), new THREE.MeshStandardMaterial({ color: 0x6cb6cb, roughness: 0.16, metalness: 0.52, emissive: 0x2d90ab, emissiveIntensity: 0.9 }));
  cabinWindow.position.set(0, 1.14, 0.15);
  root.add(cabinWindow);
  const cabinRoof = new THREE.Mesh(new THREE.BoxGeometry(1.82, 0.16, 2.32), trimMaterial);
  cabinRoof.position.set(0, 1.58, -0.82);
  root.add(cabinRoof);
  for (const side of [-1, 1]) {
    const sideWindow = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.38, 1.28), cabinWindow.material);
    sideWindow.position.set(side * 0.7, 1.16, -0.82);
    root.add(sideWindow);
  }
  const aftCockpit = new THREE.Mesh(new THREE.BoxGeometry(1.78, 0.42, 1.38), hullMaterial);
  aftCockpit.position.set(0, 0.96, -2.06);
  root.add(aftCockpit);
  const bowPulpit = new THREE.Mesh(new THREE.TorusGeometry(0.7, 0.035, 8, 28, Math.PI), new THREE.MeshStandardMaterial({ color: 0xfff8e8, roughness: 0.22, metalness: 0.72 }));
  bowPulpit.rotation.z = Math.PI / 2;
  bowPulpit.position.set(0, 0.96, 2.25);
  root.add(bowPulpit);
  const upholstery = new THREE.MeshStandardMaterial({ color: 0x263a43, roughness: 0.86, metalness: 0.04 });
  for (const side of [-1, 1]) {
    const seat = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.18, 1.22), upholstery);
    seat.position.set(side * 0.5, 0.95, -2.05);
    root.add(seat);
    const back = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.55, 0.14), upholstery);
    back.position.set(side * 0.5, 1.2, -2.62);
    root.add(back);
  }
  const foredeck = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.16, 1.35), trimMaterial);
  foredeck.position.set(0, 0.76, 1.35);
  root.add(foredeck);
  const aftDeck = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.15, 1.25), trimMaterial);
  aftDeck.position.set(0, 0.76, -1.7);
  root.add(aftDeck);

  const flybridge = new THREE.Mesh(new THREE.BoxGeometry(1.78, 0.55, 1.5), hullMaterial);
  flybridge.position.set(0, 1.95, -0.72);
  root.add(flybridge);
  const flybridgeGlass = new THREE.Mesh(new THREE.BoxGeometry(1.42, 0.27, 0.055), cabinWindow.material);
  flybridgeGlass.position.set(0, 2.02, -0.025);
  root.add(flybridgeGlass);
  const flybridgeRoof = new THREE.Mesh(new THREE.BoxGeometry(2, 0.14, 1.68), trimMaterial);
  flybridgeRoof.position.set(0, 2.28, -0.72);
  root.add(flybridgeRoof);
  for (const side of [-1, 1]) {
    const funnel = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.2, 0.82, 12), trimMaterial);
    funnel.position.set(side * 0.48, 2.05, -1.48);
    root.add(funnel);
    const funnelCap = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.1, 12), fittingMaterial);
    funnelCap.position.set(side * 0.48, 2.49, -1.48);
    root.add(funnelCap);
  }
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.05, 1.2, 8), fittingMaterial);
  mast.position.set(0, 2.92, -0.65);
  root.add(mast);
  const pennant = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial({ color: 0x941f26, side: THREE.DoubleSide }));
  pennant.geometry.setAttribute("position", new THREE.Float32BufferAttribute([0, 0, 0, 0.72, -0.08, 0, 0.08, -0.36, 0], 3));
  pennant.geometry.computeVertexNormals();
  pennant.position.set(0, 3.48, -0.65);
  root.add(pennant);
  const helm = new THREE.Mesh(new THREE.TorusGeometry(0.32, 0.045, 10, 24), fittingMaterial);
  helm.position.set(0, 1.1, -2.15);
  root.add(helm);

  const railMaterial = new THREE.MeshStandardMaterial({ color: 0xfff8e8, roughness: 0.22, metalness: 0.72 });
  for (const side of [-1, 1]) {
    const rail = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 5.2, 8), railMaterial);
    rail.rotation.x = Math.PI / 2;
    rail.position.set(side * 0.92, 1.08, -0.02);
    root.add(rail);
    for (const z of [-2.15, -0.9, 0.35, 1.6, 2.1]) {
      const stanchion = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.58, 8), railMaterial);
      stanchion.position.set(side * 0.92, 0.83, z);
      root.add(stanchion);
    }
  }
  for (const side of [-1, 1]) {
    const portlight = new THREE.Mesh(new THREE.CircleGeometry(0.12, 16), new THREE.MeshBasicMaterial({ color: 0xffd18a, toneMapped: false }));
    portlight.position.set(side * 0.965, 1.2, -1.15);
    portlight.rotation.y = side * Math.PI / 2;
    root.add(portlight);
    const bollard = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.12, 0.3, 10), trimMaterial);
    bollard.position.set(side * 0.72, 0.86, 2.12);
    root.add(bollard);
  }
  const mastLight = new THREE.PointLight(0xffd49a, 4.2, 14, 2);
  mastLight.position.set(-0.75, 3.4, 0.35);
  root.add(mastLight);
  const moonFill = new THREE.PointLight(0xc7ddff, 3, 13, 2);
  moonFill.position.set(0.85, 2.4, -0.5);
  root.add(moonFill);
  return {
    root,
    animate(steering: number, time: number): void {
      root.rotation.z = Math.sin(time * 1.8) * 0.012 - steering * 0.018;
      root.position.y += Math.sin(time * 2.2) * 0.035;
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
