import * as THREE from "three";
import { buildValleyApproach } from "./valley";

type AddStaticCollider = (object: THREE.Object3D, width: number, height: number, depth: number) => void;

/** Create the Valley approach, West Egg grounds, and distant shoreline scenery. */
export function buildExterior(addStaticCollider: AddStaticCollider): THREE.Group {
  const root = new THREE.Group();
  root.name = "nicks-house-west-egg-exterior";
  buildValleyApproach(root, addStaticCollider);

  const gravel = new THREE.MeshStandardMaterial({ color: "#635c50", roughness: 1 });
  const lawn = new THREE.MeshStandardMaterial({ color: "#34452e", roughness: 1 });
  const lawnDark = new THREE.MeshStandardMaterial({ color: "#263625", roughness: 1 });
  const hedge = new THREE.MeshStandardMaterial({ color: "#243728", roughness: 0.96 });
  const leaves = new THREE.MeshStandardMaterial({ color: "#203428", roughness: 0.92 });
  const leavesLight = new THREE.MeshStandardMaterial({ color: "#334632", roughness: 0.9 });
  const bark = new THREE.MeshStandardMaterial({ color: "#392b20", roughness: 1 });
  const fence = new THREE.MeshStandardMaterial({ color: "#c5b99c", roughness: 0.82 });
  const stone = new THREE.MeshStandardMaterial({ color: "#777365", roughness: 1 });
  const houseWall = new THREE.MeshStandardMaterial({ color: "#a99b7b", roughness: 0.9 });
  const roof = new THREE.MeshStandardMaterial({ color: "#292a28", roughness: 0.95 });
  const windowGlow = new THREE.MeshStandardMaterial({ color: "#c99b55", emissive: "#6e4318", emissiveIntensity: 0.7, roughness: 0.7 });
  const lampGlow = new THREE.MeshStandardMaterial({ color: "#ffe0a1", emissive: "#ffbb69", emissiveIntensity: 1.7 });
  const metal = new THREE.MeshStandardMaterial({ color: "#3b3d3a", metalness: 0.55, roughness: 0.58 });  const boxGeometry = new THREE.BoxGeometry(1, 1, 1);
  const sphereGeometry = new THREE.SphereGeometry(1, 12, 8);
  const cylinderGeometry = new THREE.CylinderGeometry(1, 1, 1, 10);  const add = (geometry: THREE.BufferGeometry, material: THREE.Material, position: [number, number, number], scale: [number, number, number], name: string) => {
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


  // The road leaves the Valley and arrives at the West Egg estate.
  addBox(gravel, [0, -0.055, -25.5], [7.5, 0.1, 48], "west-egg-gravel-drive");
  addBox(lawnDark, [0, -0.24, -29], [52, 0.12, 49], "valley-shoulder");
  addBox(lawn, [0, -0.18, -9], [34, 0.12, 27], "west-egg-lawn");

  // Invisible physics walls keep Nick near the estate while leaving the approach open.
  const boundaryMaterial = new THREE.MeshBasicMaterial({ visible: false });
  const addBoundary = (position: [number, number, number], size: [number, number, number], name: string) => {
    const wall = new THREE.Mesh(new THREE.BoxGeometry(...size), boundaryMaterial);
    wall.name = name;
    wall.position.set(...position);
    wall.visible = false;
    root.add(wall);
    addStaticCollider(wall, ...size);
  };
  addBoundary([-17, 3, -23], [0.5, 6, 52], "west-egg-invisible-west-boundary");
  addBoundary([17, 3, -23], [0.5, 6, 52], "west-egg-invisible-east-boundary");
  addBoundary([0, 3, 2.5], [34.5, 6, 0.5], "west-egg-invisible-south-boundary");
  addBoundary([0, 3, -48.5], [34.5, 6, 0.5], "west-egg-invisible-north-boundary");
    addBox(houseWall, [-2.55, 1.5, -4.16], [2.9, 3, 0.22], "nicks-house-front-left");
    addBox(houseWall, [2.55, 1.5, -4.16], [2.9, 3, 0.22], "nicks-house-front-right");
    addBox(houseWall, [0, 2.58, -4.16], [2.3, 0.84, 0.22], "nicks-house-front-lintel");
    addBox(roof, [0, 3.35, -4.2], [9.2, 0.28, 8.5], "nicks-house-roof-eave");
    for (const side of [-1, 1]) {
      addBox(houseWall, [side * 4.12, 1.5, -0.1], [0.22, 3, 8.1], `nicks-house-exterior-side-${side}`);
      addBox(roof, [side * 3.1, 3.55, -0.1], [3.3, 0.2, 8.5], `nicks-house-roof-slope-${side}`).rotation.z = side * -0.28;
      addBox(houseWall, [side * 1.55, 1.45, -4.38], [0.16, 2.9, 0.22], `nicks-house-porch-post-${side}`);
    }
    addBox(roof, [0, 2.9, -4.42], [3.5, 0.18, 1.1], "nicks-house-porch-roof");
    addBox(stone, [0, 0.08, -5.0], [3.2, 0.16, 2.6], "nicks-house-front-steps");
  const porchLight = new THREE.PointLight("#ffd39a", 9, 12, 2);
  porchLight.position.set(0, 2.4, -4.9);
  root.add(porchLight);
    add(sphereGeometry, lampGlow, [0, 2.4, -4.68], [0.2, 0.28, 0.2], "nicks-house-porch-lamp");  // West Egg's estate entrance: clipped hedges, a pale fence, and warm lamps.
  for (const side of [-1, 1]) {

      addBox(hedge, [side * 5.7, 0.82, -9.2], [0.72, 1.65, 0.72], `gate-pillar-${side}`);
      addBox(stone, [side * 5.7, 1.75, -9.2], [1.05, 0.25, 1.05], `gate-cap-${side}`);
      for (let index = 0; index < 10; index++) {
        const z = -12.5 - index * 1.65;
        addBox(hedge, [side * 5.8, 0.68, z], [0.55, 1.35, 1.35], `west-egg-hedge-${side}-${index}`);
        if (index < 8) {
          addBox(fence, [side * 7.1, 0.62, z], [0.12, 1.15, 0.12], `estate-fence-post-${side}-${index}`);
          addBox(fence, [side * 7.1, 0.38, z - 0.55], [0.12, 0.1, 1.1], `estate-fence-rail-${side}-${index}`);
        }
      }
      for (let index = 0; index < 8; index++) {
        const z = -13 - index * 5.2;
        add(cylinderGeometry, bark, [side * (10.5 + (index % 2) * 1.2), 2.1, z], [0.42, 4.2, 0.42], `west-egg-tree-trunk-${side}-${index}`);
        add(sphereGeometry, index % 2 ? leaves : leavesLight, [side * (10.5 + (index % 2) * 1.2), 4.5, z], [2.5, 3.1, 2.4], `west-egg-tree-crown-${side}-${index}`);
        add(sphereGeometry, leaves, [side * (9.6 + (index % 2) * 1.2), 4.05, z - 0.9], [1.7, 2.1, 1.8], `west-egg-tree-crown-low-${side}-${index}`);
      }
      for (const z of [-14, -23, -32]) {
        add(cylinderGeometry, metal, [side * 4.7, 1.8, z], [0.09, 3.6, 0.09], `west-egg-lamppost-${side}-${z}`);
        add(sphereGeometry, lampGlow, [side * 4.7, 3.68, z], [0.32, 0.42, 0.32], `west-egg-lamp-${side}-${z}`);
        const light = new THREE.PointLight("#ffc987", 3.2, 8, 2);
        light.position.set(side * 4.7, 3.7, z);
        root.add(light);
      }
    }

  // Layer a wooded perimeter around the estate, leaving the drive and front lawn open.
  for (const side of [-1, 1] as const) {
    for (let index = 0; index < 10; index++) {
      const x = side * (9.4 + (index % 3) * 3.3);
      const z = -3.5 - index * 7.1;
      const trunkHeight = 3.4 + (index % 4) * 0.42;
      const canopyY = trunkHeight + 1.6;
      const canopyScale = 2.1 + (index % 3) * 0.28;
      add(cylinderGeometry, bark, [x, trunkHeight / 2, z], [0.3 + (index % 2) * 0.07, trunkHeight, 0.3 + (index % 2) * 0.07], `west-egg-wood-trunk-${side}-${index}`);
      add(sphereGeometry, index % 2 ? leavesLight : leaves, [x, canopyY, z], [canopyScale, 2.8, canopyScale], `west-egg-wood-canopy-${side}-${index}`);
      add(sphereGeometry, leaves, [x - side * 0.9, canopyY - 0.55, z - 0.75], [1.5, 1.7, 1.6], `west-egg-wood-canopy-left-${side}-${index}`);
      add(sphereGeometry, index % 2 ? leaves : leavesLight, [x + side * 0.85, canopyY - 0.35, z + 0.8], [1.6, 1.9, 1.7], `west-egg-wood-canopy-right-${side}-${index}`);

      for (let shrub = 0; shrub < 3; shrub++) {
        const shrubX = x + side * ((shrub - 1) * 1.25);
        const shrubZ = z + (shrub % 2 ? 1.5 : -1.2);
        add(sphereGeometry, shrub % 2 ? hedge : leaves, [shrubX, 0.62 + (shrub % 2) * 0.12, shrubZ], [0.95, 0.85, 1.05], `west-egg-understory-${side}-${index}-${shrub}`);
      }
    }
  }

  // Distant Long Island houses glow through the trees on the approach.
  for (const [index, side] of [-1, 1].entries()) {

      const x = side * 15;
      const z = -23 - index * 9;
      addBox(houseWall, [x, 1.8, z], [7.2, 3.6, 5.2], `west-egg-house-${index}`);
      addBox(roof, [x, 3.9, z], [8.1, 0.55, 5.9], `west-egg-roof-${index}`);
      for (const windowX of [-1.7, 1.7]) addBox(windowGlow, [x + windowX, 2.05, z - 2.64], [0.9, 1.2, 0.06], `west-egg-window-${index}-${windowX}`);
      addBox(houseWall, [x, 0.45, z - 3.2], [2.5, 0.9, 1.8], `west-egg-porch-${index}`);
    }  // Gatsby's enormous house sits farther along the shore, visible above the estate trees.

    addBox(houseWall, [17, 4.3, -42], [15, 8.6, 10], "gatsby-mansion");
    addBox(roof, [17, 9, -42], [17, 1, 12], "gatsby-mansion-roof");
    for (const windowX of [11, 15, 19, 23]) addBox(windowGlow, [windowX, 4.8, -47.1], [1.1, 2.1, 0.08], `gatsby-mansion-window-${windowX}`);
  const bay = new THREE.MeshStandardMaterial({ color: "#111d26", roughness: 0.3, metalness: 0.12 });
  addBox(bay, [0, -0.1, -90], [180, 0.25, 30], "long-island-sound");
  const moon = add(sphereGeometry, new THREE.MeshBasicMaterial({ color: "#d5cbb2" }), [0, 18, -86], [3.5, 3.5, 3.5], "west-egg-moon");
  moon.castShadow = false;

  const starPositions = new Float32Array(360 * 3);
  for (let index = 0; index < 360; index++) {
      starPositions[index * 3] = (Math.random() - 0.5) * 150;
      starPositions[index * 3 + 1] = 18 + Math.random() * 45;
      starPositions[index * 3 + 2] = -82 + Math.random() * 42;
    }
  const starGeometry = new THREE.BufferGeometry();
  starGeometry.setAttribute("position", new THREE.Float32BufferAttribute(starPositions, 3));
  const stars = new THREE.Points(starGeometry, new THREE.PointsMaterial({ color: "#e6dfcb", size: 0.22, sizeAttenuation: true, transparent: true, opacity: 0.72 }));
  stars.name = "west-egg-stars";
  root.add(stars);
  return root;
}
