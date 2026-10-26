import * as THREE from "three";

type AddStaticCollider = (object: THREE.Object3D, width: number, height: number, depth: number) => void;

/** Build the Valley of Ashes scenery that lines Nick's approach to West Egg. */
export function buildValleyApproach(root: THREE.Group, addStaticCollider: AddStaticCollider): void {
  const ash = new THREE.MeshStandardMaterial({ color: "#383a3a", roughness: 1 });
  const stone = new THREE.MeshStandardMaterial({ color: "#777365", roughness: 1 });
  const bark = new THREE.MeshStandardMaterial({ color: "#392b20", roughness: 1 });
  const metal = new THREE.MeshStandardMaterial({ color: "#3b3d3a", metalness: 0.55, roughness: 0.58 });
  const windowGlow = new THREE.MeshStandardMaterial({ color: "#c99b55", emissive: "#6e4318", emissiveIntensity: 0.7, roughness: 0.7 });
  const roof = new THREE.MeshStandardMaterial({ color: "#292a28", roughness: 0.95 });
  const boxGeometry = new THREE.BoxGeometry(1, 1, 1);
  const sphereGeometry = new THREE.SphereGeometry(1, 12, 8);
  const cylinderGeometry = new THREE.CylinderGeometry(1, 1, 1, 10);

  const add = (geometry: THREE.BufferGeometry, material: THREE.Material, position: [number, number, number], scale: [number, number, number], name: string) => {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = name;
    mesh.position.set(...position);
    mesh.scale.set(...scale);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    root.add(mesh);
    return mesh;
  };
  const addBox = (material: THREE.Material, position: [number, number, number], size: [number, number, number], name: string) => add(boxGeometry, material, position, size, name);

  addBox(ash, [0, -0.13, -61], [9.2, 0.12, 25], "valley-roadbed");
  addBox(ash, [0, -0.1, -61], [38, 0.1, 25], "ash-field");
  addBox(ash, [-11, -0.06, -54], [26, 0.12, 18], "valley-western-ash-shoulder");
  addBox(ash, [11, -0.06, -54], [26, 0.12, 18], "valley-eastern-ash-shoulder");

  const ground = new THREE.Mesh(new THREE.BoxGeometry(50, 0.12, 70), new THREE.MeshBasicMaterial({ visible: false }));
  ground.name = "west-egg-exterior-collision-ground";
  ground.position.set(0, -0.11, -39);
  root.add(ground);
  addStaticCollider(ground, 50, 0.12, 70);

  // Ash heaps, scrub, and telephone poles mark the road out of the Valley.
  for (let index = 0; index < 16; index++) {
    const side = index % 2 === 0 ? -1 : 1;
    const z = -39 - Math.floor(index / 2) * 4.1;
    const x = side * (7.8 + (index % 3) * 1.8);
    add(sphereGeometry, index % 3 === 0 ? stone : ash, [x, 0.05, z], [2.1 + (index % 3) * 0.7, 0.65 + (index % 2) * 0.2, 2.8], `valley-ash-heap-${index}`);
    for (let sprig = 0; sprig < 2; sprig++) {
      const scrub = add(cylinderGeometry, bark, [x + (sprig ? 0.55 : -0.48), 0.48, z + sprig * 0.35], [0.09, 0.95, 0.09], `ash-scrub-${index}-${sprig}`);
      scrub.rotation.z = (sprig ? -1 : 1) * 0.28;
    }
  }
  for (let index = 0; index < 4; index++) {
    const z = -59 + index * 11;
    add(cylinderGeometry, metal, [-10, 3.4, z], [0.11, 6.8, 0.11], `valley-telephone-pole-${index}`);
    addBox(metal, [-10, 6.55, z], [1.4, 0.1, 0.1], `valley-pole-arm-${index}`);
    if (index < 3) {
      const wire = add(new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(-10, 6.45, z), new THREE.Vector3(-10, 6.1, z + 11),
      ]), new THREE.LineBasicMaterial({ color: "#111211" }), [0, 0, 0], [1, 1, 1], `valley-wire-${index}`);
      wire.castShadow = false;
    }
  }

  // Wilson's garage sign and the watchful eyes above the ash heaps.
  addBox(metal, [-8.4, 0.9, -43], [0.18, 1.8, 0.18], "garage-sign-post");
  addBox(stone, [-8.4, 1.85, -43], [2.8, 0.72, 0.12], "wilson-garage-sign");
  addBox(windowGlow, [-8.4, 1.85, -42.92], [2.35, 0.35, 0.035], "wilson-garage-sign-lettering");
  add(cylinderGeometry, metal, [-16, 4.1, -53], [0.34, 8.2, 0.38], "eckleburg-billboard-post");
  addBox(roof, [-16, 9.2, -53], [12, 5.1, 0.55], "eckleburg-billboard");
  addBox(stone, [-16, 9.2, -52.68], [11.3, 4.4, 0.08], "eckleburg-board-face");
  for (const eyeX of [-18.4, -13.6]) {
    add(sphereGeometry, windowGlow, [eyeX, 9.55, -52.5], [1.55, 0.78, 0.16], "eckleburg-eye");
    add(sphereGeometry, metal, [eyeX, 9.55, -52.3], [0.34, 0.62, 0.11], "eckleburg-pupil");
  }
}
