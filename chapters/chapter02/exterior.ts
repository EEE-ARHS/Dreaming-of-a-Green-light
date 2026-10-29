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
  const metal = new THREE.MeshStandardMaterial({ color: "#3b3d3a", metalness: 0.55, roughness: 0.58 });
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

  // The road leaves the Valley and arrives at the West Egg estate.
  addBox(gravel, [0, -0.055, -25.5], [7.5, 0.1, 48], "west-egg-gravel-drive");
  addBox(lawnDark, [0, -0.24, -29], [52, 0.12, 49], "valley-shoulder");
  addBox(lawn, [0, -0.18, -9], [34, 0.12, 27], "west-egg-lawn");

  const trim = new THREE.MeshStandardMaterial({ color: "#d8cdb2", roughness: 0.8 });

  // A low stone wall, gate pillars, and garden beds distinguish Nick's modest plot.
  for (const side of [-1, 1]) {
    addBox(stone, [side * 7.8, 0.38, -4.8], [0.34, 0.72, 8.5], `nicks-house-garden-wall-${side}`);
    addBox(stone, [side * 1.95, 0.28, -10.2], [1.1, 0.55, 0.9], `nicks-house-gate-pier-${side}`);
    for (let shrub = 0; shrub < 4; shrub++) {
      const z = -7.8 - shrub * 1.75;
      add(sphereGeometry, shrub % 2 ? leaves : hedge, [side * 6.2, 0.54, z], [0.8, 0.65, 1.05], `nicks-house-foundation-shrub-${side}-${shrub}`);
    }
    for (const z of [-2.2, -6.3]) {
      addBox(fence, [side * 5.9, 0.8, z], [0.11, 1.35, 0.11], `nicks-house-picket-post-${side}-${z}`);
      addBox(fence, [side * 5.9, 0.54, z + 0.9], [0.1, 0.08, 1.8], `nicks-house-picket-rail-${side}-${z}`);
    }
  }
  for (const side of [-1, 1]) {
    addBox(houseWall, [side * 1.15, 1.72, -4.02], [0.78, 1.35, 0.06], `nicks-house-front-window-${side}`);
    addBox(trim, [side * 1.15, 1.72, -3.97], [0.08, 1.48, 0.08], `nicks-house-window-frame-v-${side}`);
    addBox(trim, [side * 1.15, 1.72, -3.97], [0.88, 0.08, 0.08], `nicks-house-window-frame-h-${side}`);
    addBox(trim, [side * 1.15, 1.72, -3.93], [0.06, 1.32, 0.04], `nicks-house-window-muntin-${side}`);
  }
  addBox(roof, [0, 3.58, -0.2], [0.22, 0.28, 7.7], "nicks-house-ridge-cap");
  for (const x of [-3.2, 3.2]) {
    addBox(trim, [x, 2.28, -4.3], [0.12, 0.42, 0.08], `nicks-house-front-corner-trim-${x}`);
  }
  for (let step = 0; step < 3; step++) {
    addBox(stone, [0, 0.14 + step * 0.12, -5.8 + step * 0.42], [1.8 - step * 0.18, 0.18, 0.58], `nicks-house-entry-step-${step}`);
  }

  const houseSconceMaterial = new THREE.MeshStandardMaterial({ color: "#ffe2a6", emissive: "#ffb454", emissiveIntensity: 1.8 });
  for (const side of [-1, 1]) {
    addBox(metal, [side * 3.25, 2.25, -4.48], [0.12, 0.34, 0.12], `nicks-house-front-sconce-${side}`);
    add(sphereGeometry, houseSconceMaterial, [side * 3.25, 2.38, -4.56], [0.16, 0.22, 0.16], `nicks-house-front-sconce-glow-${side}`);
    const sconceLight = new THREE.PointLight("#ffc987", 2.4, 5, 2);
    sconceLight.position.set(side * 3.25, 2.4, -4.8);
    root.add(sconceLight);
  }

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
    }

  // Gatsby's mansion rises beyond the trees, with a terrace and warm party-lit windows.
  const mansionWall = new THREE.MeshStandardMaterial({ color: "#c2b18f", roughness: 0.8 });
  const mansionTrim = new THREE.MeshStandardMaterial({ color: "#e0d1af", roughness: 0.66 });
  const partyWindow = new THREE.MeshStandardMaterial({ color: "#f4bc62", emissive: "#ff9d32", emissiveIntensity: 2.7, roughness: 0.35 });
  const mansionX = 16.2;
  const mansionZ = -49;
  addBox(lawnDark, [mansionX, 0.1, mansionZ + 4], [21, 0.2, 17], "gatsby-mansion-terrace");
  const dockWood = new THREE.MeshStandardMaterial({ color: "#554839", roughness: 0.92 });
  addBox(dockWood, [mansionX, 0.04, mansionZ - 17], [5.2, 0.24, 26], "gatsby-dock-walkway");
  for (let plank = 0; plank < 18; plank++) {
    addBox(dockWood, [mansionX, 0.18, mansionZ - 4 - plank * 1.45], [5.45, 0.12, 0.11], `gatsby-dock-plank-${plank}`);
  }
  for (const side of [-1, 1]) {
    for (let pier = 0; pier < 7; pier++) {
      const z = mansionZ - 4 - pier * 4;
      add(cylinderGeometry, dockWood, [mansionX + side * 2.35, -0.62, z], [0.2, 1.45, 0.2], `gatsby-dock-pile-${side}-${pier}`);
    }
    addBox(mansionTrim, [mansionX + side * 2.35, 0.7, mansionZ - 17], [0.12, 0.12, 26], `gatsby-dock-rail-${side}`);
  }
  addBox(mansionWall, [mansionX, 5.2, mansionZ], [15, 10.4, 9], "gatsby-mansion");
  addBox(mansionWall, [mansionX, 2.9, mansionZ + 5.8], [19, 5.8, 4], "gatsby-mansion-ballroom-wing");
  addBox(roof, [mansionX, 10.65, mansionZ], [17, 0.65, 11], "gatsby-mansion-roof");
  addBox(mansionWall, [mansionX, 2.2, mansionZ + 6.75], [8.2, 0.32, 2.1], "gatsby-mansion-porch");
  addBox(mansionTrim, [mansionX, 2.08, mansionZ + 6.7], [8.4, 0.12, 2.25], "gatsby-mansion-porch-step");
  for (const side of [-1, 1]) {
    add(cylinderGeometry, mansionTrim, [mansionX + side * 3.5, 3.75, mansionZ + 5.5], [0.16, 3.1, 0.16], `gatsby-mansion-porch-column-${side}`);
  }
  addBox(roof, [mansionX, 6, mansionZ + 5.8], [20, 0.5, 4.8], "gatsby-ballroom-roof");
  addBox(mansionTrim, [mansionX, 10.98, mansionZ], [13, 0.12, 0.16], "gatsby-mansion-roofline");
  for (const floorY of [2.7, 5.1, 7.7]) {
    for (const windowX of [10.4, 13.3, 16.2, 19.1, 22]) {
      addBox(partyWindow, [windowX, floorY, mansionZ - 4.56], [1.15, 1.75, 0.08], `gatsby-mansion-window-${floorY}-${windowX}`);
      addBox(mansionTrim, [windowX, floorY, mansionZ - 4.62], [0.08, 1.92, 0.1], `gatsby-mansion-window-frame-${floorY}-${windowX}`);
    }
  }
  for (const x of [11.2, 14.6, 17.8, 21.2]) {
    addBox(partyWindow, [x, 3.05, mansionZ + 3.72], [2.25, 1.6, 0.08], `gatsby-ballroom-window-${x}`);
  }
  addBox(mansionWall, [mansionX, 6.25, mansionZ - 4.8], [2.1, 2.1, 0.55], "gatsby-mansion-entry-portico");
  for (const side of [-1, 1]) {
    add(cylinderGeometry, mansionTrim, [mansionX + side * 1.35, 3.15, mansionZ - 5.15], [0.22, 4.8, 0.22], `gatsby-portico-column-${side}`);
  }
  for (const x of [11, 16, 21]) {
    const partyLamp = new THREE.PointLight("#ffb45b", 4.2, 9, 2);
    partyLamp.position.set(x, 3.3, mansionZ - 2.5);
    root.add(partyLamp);
  }
  const partyLight = new THREE.PointLight("#ffc36e", 11, 32, 2);
  partyLight.position.set(mansionX, 5.8, mansionZ + 1);
  root.add(partyLight);
  const ballroomGlow = new THREE.MeshBasicMaterial({ color: "#ffcc76", transparent: true, opacity: 0.22, side: THREE.DoubleSide, depthWrite: false });
  const ballroomLightShaft = new THREE.Mesh(new THREE.PlaneGeometry(9, 3.2), ballroomGlow);
  ballroomLightShaft.name = "gatsby-ballroom-light-spill";
  ballroomLightShaft.position.set(mansionX, 4.2, mansionZ + 7.05);
  ballroomLightShaft.rotation.x = -0.16;
  root.add(ballroomLightShaft);
  for (let index = 0; index < 8; index++) {
    const dancerX = mansionX - 3.2 + index * 0.9;
    const dancerZ = mansionZ + 5.2 + (index % 3) * 0.75;
    const dancer = add(sphereGeometry, index % 2 ? mansionTrim : partyWindow, [dancerX, 0.12, dancerZ], [0.22, 0.65, 0.22], `gatsby-terrace-guest-${index}`);
    dancer.castShadow = false;
    add(cylinderGeometry, index % 2 ? mansionTrim : partyWindow, [dancerX, 0.72, dancerZ], [0.16, 0.25, 0.16], `gatsby-terrace-guest-head-${index}`);
  }
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
