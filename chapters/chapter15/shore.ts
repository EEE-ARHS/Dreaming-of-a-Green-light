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

  // The island itself, then the roofs standing along it.
  addBlock(massMaterial, 360, 9, 26, 0, 4.5, 31);
  addBlock(massMaterial, 26, 13, 16, -118, 12, 28);
  addBlock(massMaterial, 18, 18, 14, -62, 15, 26);
  addBlock(massMaterial, 30, 11, 15, 24, 11, 27);
  addBlock(massMaterial, 22, 16, 14, 84, 14, 26);
  addBlock(massMaterial, 34, 10, 16, 142, 11, 29);

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

  const lamp = new THREE.PointLight(0x5cff9e, 24, 180, 1.7);
  lamp.name = "chapter15-lamp";
  lamp.position.set(0, 2.3, 0);
  landmark.add(lamp);
  const core = new THREE.Mesh(new THREE.SphereGeometry(0.11, 10, 8), new THREE.MeshBasicMaterial({ color: 0xe8ffee, toneMapped: false, fog: false }));
  core.position.set(0, 2.3, 0);
  landmark.add(core);

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
      const approach = 1 + (1 - THREE.MathUtils.clamp(distance / SEA.lightZ, 0, 1)) * 2.2;
      lamp.intensity = (22 + Math.sin(time * 2.1) * 1.2) * approach;
      halo.scale.setScalar((8.6 + Math.sin(time * 1.35) * 0.4) * approach);
      aura.scale.setScalar(30 * approach);
      halo.material.opacity = 0.92 + Math.sin(time * 1.35) * 0.06;
    },
  };
}
