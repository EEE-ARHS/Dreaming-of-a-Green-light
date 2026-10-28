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

  addBox(ash, [0, -0.13, -77], [9.2, 0.12, 57], "valley-roadbed");
  addBox(ash, [0, -0.1, -77], [38, 0.1, 57], "ash-field");
  addBox(ash, [-11, -0.06, -67], [26, 0.12, 37], "valley-western-ash-shoulder");
  addBox(ash, [11, -0.06, -67], [26, 0.12, 37], "valley-eastern-ash-shoulder");

  const ground = new THREE.Mesh(new THREE.BoxGeometry(50, 0.12, 100), new THREE.MeshBasicMaterial({ visible: false }));
  ground.name = "west-egg-exterior-collision-ground";
  ground.position.set(0, -0.11, -50);
  root.add(ground);
  addStaticCollider(ground, 50, 0.12, 100);

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
  const billboard = new THREE.Group();
  billboard.name = "eckleburg-billboard-group";
  billboard.position.set(-14, 4.1, -53);
  billboard.rotation.y = -Math.PI / 2;
  root.add(billboard);
  const boardPost = new THREE.Mesh(cylinderGeometry, metal);
  boardPost.name = "eckleburg-billboard-post";
  boardPost.position.set(0, 0, 0);
  boardPost.scale.set(0.34, 8.2, 0.38);
  boardPost.castShadow = boardPost.receiveShadow = true;
  billboard.add(boardPost);
  const board = new THREE.Mesh(boxGeometry, roof);
  board.name = "eckleburg-billboard";
  board.position.set(0, 5.1, 0);
  board.scale.set(14, 5.1, 0.55);
  board.castShadow = board.receiveShadow = true;
  billboard.add(board);
  const boardFace = new THREE.Mesh(boxGeometry, stone);
  boardFace.name = "eckleburg-board-face";
  boardFace.position.set(0, 5.1, 0.33);
  boardFace.castShadow = boardFace.receiveShadow = true;
  boardFace.scale.set(13.3, 4.4, 0.08);
  billboard.add(boardFace);
  for (const eyeX of [-2.8, 2.8]) {
    const eye = new THREE.Mesh(sphereGeometry, windowGlow);
    eye.name = "eckleburg-eye";
    eye.position.set(eyeX, 5.65, 0.44);
    eye.scale.set(1.75, 0.88, 0.16);
    billboard.add(eye);
    const pupil = new THREE.Mesh(sphereGeometry, metal);
    pupil.name = "eckleburg-pupil";
    pupil.position.set(eyeX, 5.65, 0.64);
    pupil.scale.set(0.38, 0.68, 0.11);
    billboard.add(pupil);
  }
  const signCanvas = document.createElement("canvas");
  signCanvas.width = 1024;
  signCanvas.height = 128;
  const signContext = signCanvas.getContext("2d");
  if (signContext) {
    signContext.fillStyle = "#777365";
    signContext.fillRect(0, 0, signCanvas.width, signCanvas.height);
    signContext.fillStyle = "#211f1a";
    signContext.font = 'bold 64px Georgia, "Times New Roman", serif';
    signContext.textAlign = "center";
    signContext.textBaseline = "middle";
    signContext.fillText("DOCTOR T. J. ECKLEBURG", signCanvas.width / 2, signCanvas.height / 2);
  }
  const signTexture = new THREE.CanvasTexture(signCanvas);
  signTexture.colorSpace = THREE.SRGBColorSpace;
  const signNameMaterial = new THREE.MeshStandardMaterial({
    map: signTexture,
    color: "#fff0c9",
    emissive: "#ffcc79",
    emissiveMap: signTexture,
    emissiveIntensity: 1.4,
    roughness: 0.9,
    side: THREE.DoubleSide,
  });
  const signName = new THREE.Mesh(new THREE.PlaneGeometry(11.2, 1.35), signNameMaterial);
  signName.name = "eckleburg-sign-name";
  signName.position.set(0, 3.15, 0.42);
  signName.scale.x = -1;
  signName.castShadow = false;
  billboard.add(signName);
  const signLight = new THREE.SpotLight("#ffe4a8", 24, 34, Math.PI / 3, 0.65, 2);
  signLight.name = "eckleburg-sign-light";
  signLight.position.set(-14, 11.1, -46);
  signLight.target.position.set(-14, 9.2, -53);
  signLight.userData.targetIntensity = 48;
  root.add(signLight, signLight.target);
  const signHalo = new THREE.Mesh(
    new THREE.PlaneGeometry(13, 3.4),
    new THREE.MeshBasicMaterial({
      color: "#ffd98a",
      transparent: true,
      opacity: 0.12,
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
  );
  signHalo.name = "eckleburg-sign-halo";
  signHalo.position.set(0, 5.25, 0.58);
  billboard.add(signHalo);
}
