import * as THREE from "three";
import { SEA } from "./water";

export interface Shore {
  readonly group: THREE.Group;
  /** Light grows in view as the yacht draws nearer; its reflection reaches the camera. */
  update(lightZ: number, cameraZ: number, time: number, distance: number): void;
}

/**
 * The far side of the Sound: West Egg and East Egg as one dark mass on the
 * water, a dock running out of it, and the green light at the end of that dock
 * — the chapter's whole destination. Everything that moves with the light
 * lives in one subgroup so the chapter can simply hand it a new position.
 */
export function createShore(glow: THREE.Texture): Shore {
  const group = new THREE.Group();
  group.name = "chapter15-shore";
  const landmark = new THREE.Group();
  landmark.name = "chapter15-green-light";
  group.add(landmark);

  const massMaterial = new THREE.MeshBasicMaterial({ color: 0x0d131c, fog: false });
  const darkMaterial = new THREE.MeshBasicMaterial({ color: 0x080d13, fog: false });

  const addBlock = (material: THREE.Material, width: number, height: number, depth: number, x: number, y: number, z: number): void => {
    const block = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), material);
    block.position.set(x, y, z);
    landmark.add(block);
  };

  // East Egg's brick Georgian Colonial mansion sits just beyond Daisy's dock.
  addBlock(massMaterial, 360, 9, 26, 0, 4.5, 31);
  addBlock(massMaterial, 26, 13, 16, -118, 12, 28);
  addBlock(massMaterial, 18, 18, 14, -62, 15, 26);
  addBlock(massMaterial, 30, 11, 15, 24, 11, 27);
  addBlock(massMaterial, 22, 16, 14, 84, 14, 26);
  addBlock(massMaterial, 34, 10, 16, 142, 11, 29);
  const brick = new THREE.MeshStandardMaterial({ color: 0x8d3828, roughness: 0.92, metalness: 0.02, fog: false });
  const paleTrim = new THREE.MeshStandardMaterial({ color: 0xd7c7a8, roughness: 0.82, fog: false });
  const roofMaterial = new THREE.MeshStandardMaterial({ color: 0x20252b, roughness: 0.9, fog: false });
  const mansion = new THREE.Group();
  mansion.name = "chapter15-georgian-mansion";
  mansion.position.set(0, 0, 16046);
  landmark.add(mansion);
  const houseBlock = (geometry: THREE.BufferGeometry, material: THREE.Material, x: number, y: number, z: number): THREE.Mesh => {
    const part = new THREE.Mesh(geometry, material);
    part.position.set(x, y, z);
    mansion.add(part);
    return part;
  };
  houseBlock(new THREE.BoxGeometry(38, 13, 14), brick, 0, 8.5, 0);
  houseBlock(new THREE.BoxGeometry(15, 16, 14), brick, 0, 10, 8.5);
  houseBlock(new THREE.BoxGeometry(40, 0.9, 15.5), paleTrim, 0, 15.2, 0);
  houseBlock(new THREE.BoxGeometry(17, 0.9, 15.5), paleTrim, 0, 18.2, 8.5);
  const mainRoof = houseBlock(new THREE.ConeGeometry(21, 4.2, 4), roofMaterial, 0, 17.25, 0);
  mainRoof.scale.z = 0.42;
  mainRoof.rotation.y = Math.PI / 4;
  const centerRoof = houseBlock(new THREE.ConeGeometry(10, 3.2, 4), roofMaterial, 0, 20.25, 8.5);
  centerRoof.scale.z = 0.82;
  centerRoof.rotation.y = Math.PI / 4;
  houseBlock(new THREE.BoxGeometry(7, 4, 5), brick, -11, 18.5, -3);
  houseBlock(new THREE.BoxGeometry(7, 4, 5), brick, 11, 18.5, -3);
  houseBlock(new THREE.BoxGeometry(7.2, 2.1, 1.1), paleTrim, 0, 20.1, 15.7);
  const mansionWindow = new THREE.MeshBasicMaterial({ color: 0xffd79a, fog: false, toneMapped: false });
  for (const z of [-7.12, 7.12]) {
    for (const x of [-15, -9, -3, 3, 9, 15]) {
      houseBlock(new THREE.BoxGeometry(1.7, 2.2, 0.12), mansionWindow, x, 8.6, z);
      houseBlock(new THREE.BoxGeometry(1.7, 2.2, 0.12), mansionWindow, x, 13.1, z);
    }
  }
  for (const x of [-5.2, -2.6, 0, 2.6, 5.2]) houseBlock(new THREE.BoxGeometry(1.35, 2.4, 0.14), mansionWindow, x, 10, -7.62);
  houseBlock(new THREE.BoxGeometry(3, 4.5, 0.5), paleTrim, 0, 5.8, -7.55);
  houseBlock(new THREE.BoxGeometry(5.2, 0.55, 2.5), paleTrim, 0, 3.25, -8.5);
  for (const x of [-2, 2]) {
    const column = houseBlock(new THREE.CylinderGeometry(0.22, 0.3, 5.6, 12), paleTrim, x, 6, -8.15);
    column.position.y = 6;
  }
  for (const x of [-14, -7, 0, 7, 14]) {
    houseBlock(new THREE.BoxGeometry(0.22, 14, 0.35), paleTrim, x, 8.6, -7.2);
  }
  const mansionGlow = new THREE.PointLight(0xffc77b, 32, 90, 1.8);
  mansionGlow.position.set(0, 10, 16058);
  landmark.add(mansionGlow);
  const mansionHalo = new THREE.Sprite(new THREE.SpriteMaterial({
    map: glow, color: 0xffb96c, transparent: true, opacity: 0.24,
    blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
  }));
  mansionHalo.position.set(0, 13, 16057);
  mansionHalo.scale.set(54, 30, 1);
  landmark.add(mansionHalo);

  // Windows across the water: the only warm colour in the chapter.
  for (let i = 0; i < 8; i++) {
    const window = new THREE.Sprite(new THREE.SpriteMaterial({
      map: glow, color: 0xffc98a, transparent: true, opacity: 0.42 + Math.random() * 0.24,
      blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
    }));
    window.position.set(-150 + i * 43 + (Math.random() - 0.5) * 14, 6 + Math.random() * 6, 22);
    window.scale.setScalar(2.2 + Math.random() * 1.6);
    landmark.add(window);
  }

  // The dock, out over the black water, with its pilings.
  addBlock(darkMaterial, 1.7, 0.5, 26, 0, 0.45, 13);
  for (let i = 0; i < 6; i++) {
    addBlock(darkMaterial, 0.24, 1.5, 0.24, -0.92, 0.1, 2.5 + i * 4.4);
    addBlock(darkMaterial, 0.24, 1.5, 0.24, 0.92, 0.1, 2.5 + i * 4.4);
  }
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 2.2, 8), darkMaterial);
  post.position.set(0, 1.1, 0);
  landmark.add(post);
  addBlock(darkMaterial, 0.34, 0.22, 0.34, 0, 2.16, 0);

  const lamp = new THREE.PointLight(0x5cff9e, 15, 150, 1.7);
  lamp.name = "chapter15-lamp";
  lamp.position.set(0, 2.3, 0);
  landmark.add(lamp);
  const coreMaterial = new THREE.MeshBasicMaterial({ color: 0xe8ffee, toneMapped: false, fog: false });
  const core = new THREE.Mesh(new THREE.SphereGeometry(0.11, 10, 8), coreMaterial);
  core.position.set(0, 2.3, 0);
  landmark.add(core);
  const beaconLight = new THREE.PointLight(0x55ff98, 5, 44, 1.6);
  beaconLight.position.set(0, 2.3, 0);
  landmark.add(beaconLight);

  const halo = new THREE.Sprite(new THREE.SpriteMaterial({
    map: glow, color: 0x46ff92, transparent: true, opacity: 0.96,
    blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
  }));
  halo.position.set(0, 2.3, 0);
  halo.scale.setScalar(8.6);
  landmark.add(halo);
  const aura = new THREE.Sprite(new THREE.SpriteMaterial({
    map: glow, color: 0x1f8f52, transparent: true, opacity: 0.34,
    blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
  }));
  aura.position.set(0, 2.3, 0);
  aura.scale.setScalar(30);
  landmark.add(aura);
  const sparkCount = 34;
  const sparkGeometry = new THREE.BufferGeometry();
  const sparkPositions = new Float32Array(sparkCount * 3);
  const sparkPhases = new Float32Array(sparkCount);
  for (let i = 0; i < sparkCount; i++) sparkPhases[i] = Math.random() * Math.PI * 2;
  sparkGeometry.setAttribute("position", new THREE.BufferAttribute(sparkPositions, 3));
  const sparks = new THREE.Points(sparkGeometry, new THREE.PointsMaterial({
    map: glow, color: 0x9dffc3, size: 1.35, sizeAttenuation: true, transparent: true,
    opacity: 0.78, blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
  }));
  sparks.name = "chapter15-green-light-sparks";
  landmark.add(sparks);

  // The light's path on the water, stretched back toward the boat.
  const reflectionGeometry = new THREE.PlaneGeometry(2.8, 52);
  reflectionGeometry.rotateX(-Math.PI / 2);
  const reflection = new THREE.Mesh(reflectionGeometry, new THREE.MeshBasicMaterial({
    map: glow, color: 0x2fe07f, transparent: true, opacity: 0.2,
    blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
  }));
  reflection.name = "chapter15-reflection";
  reflection.renderOrder = 1;
  group.add(reflection);

  return {
    group,
    update(lightZ: number, cameraZ: number, time: number, distance: number): void {
      landmark.position.z = lightZ;
      const reach = THREE.MathUtils.clamp(Math.abs(cameraZ - lightZ), 16, 70);
      reflection.position.set(0, 0.14, lightZ - 5);
      reflection.scale.set(1, 1, reach / 52);
      reflection.material.opacity = 0.15 + Math.abs(Math.sin(time * 0.9)) * 0.08;
      const approach = 1 + (1 - THREE.MathUtils.clamp(distance / SEA.lightZ, 0, 1)) * 1.3;
      const pulse = 0.88 + 0.12 * Math.sin(time * 2.4);
      lamp.intensity = (14 + Math.sin(time * 2.1) * 1.1) * approach;
      beaconLight.intensity = (4.5 + Math.sin(time * 3.2) * 1.4) * approach;
      core.scale.setScalar(0.88 + 0.12 * Math.sin(time * 4.1));
      halo.scale.setScalar((7.2 + Math.sin(time * 1.35) * 0.45) * approach);
      aura.scale.setScalar((25 + Math.sin(time * 1.8) * 2) * approach);
      halo.material.opacity = 0.78 + Math.sin(time * 1.35) * 0.1;
      for (let i = 0; i < sparkCount; i++) {
        const phase = time * (0.42 + (i % 5) * 0.08) + sparkPhases[i];
        const radius = 0.55 + ((i * 17) % 29) / 29 * 2.6;
        sparkPositions[i * 3] = Math.cos(phase) * radius;
        sparkPositions[i * 3 + 1] = 2.3 + Math.sin(phase * 1.7) * (0.6 + (i % 4) * 0.15);
        sparkPositions[i * 3 + 2] = Math.sin(phase) * radius * 0.48;
      }
      sparkGeometry.attributes.position.needsUpdate = true;
      sparks.material.opacity = 0.48 + pulse * 0.34;
    },
  };
}
