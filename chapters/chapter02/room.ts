import * as THREE from "three";
import { wallpaperTexture, floorTexture, rugTexture } from "./assets";
import { ROOM_HALF, ROOM_HEIGHT, DOOR_HALF, DOOR_HEIGHT } from "./constants";

type AddStaticCollider = (object: THREE.Object3D, width: number, height: number, depth: number) => void;

/** Create Nick's furnished parlor and register its solid surfaces with physics. */
export function buildRoom(addStaticCollider: AddStaticCollider): THREE.Group {
  const room = new THREE.Group();
  room.name = "nicksHouseRoom";

    const wallpaper = wallpaperTexture();
    const floorMap = floorTexture();
    const rugMap = rugTexture();
    const wallMaterial = new THREE.MeshStandardMaterial({ map: wallpaper, roughness: 0.94 });
    const trimMaterial = new THREE.MeshStandardMaterial({ color: "#d8cdb2", roughness: 0.8 });
    const floorMaterial = new THREE.MeshStandardMaterial({ map: floorMap, roughness: 0.9 });
    const ceilingMaterial = new THREE.MeshStandardMaterial({ color: "#cdc3ab", roughness: 1 });
    const woodMaterial = new THREE.MeshStandardMaterial({ color: "#4a3121", roughness: 0.72 });
    const rugMaterial = new THREE.MeshStandardMaterial({ map: rugMap, roughness: 1 });
    const glassMaterial = new THREE.MeshStandardMaterial({
      color: "#26313d",
      emissive: "#b9cede",
      emissiveIntensity: 0.42,
      roughness: 0.35,
      metalness: 0.15,
    });

    const box = (
      width: number,
      height: number,
      depth: number,
      material: THREE.Material,
      x: number,
      y: number,
      z: number
    ): THREE.Mesh => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), material);
      mesh.position.set(x, y, z);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      room.add(mesh);
      return mesh;
    };

    const solid = (
      width: number,
      height: number,
      depth: number,
      material: THREE.Material,
      x: number,
      y: number,
      z: number
    ): THREE.Mesh => {
      const mesh = box(width, height, depth, material, x, y, z);
      addStaticCollider(mesh, width, height, depth);
      return mesh;
    };

    // Floor, ceiling and the three standing walls; the fourth side stays open to the camera.
    solid(ROOM_HALF * 2, 0.12, ROOM_HALF * 2, floorMaterial, 0, 0, 0).receiveShadow = true;
    solid(ROOM_HALF * 2, 0.1, ROOM_HALF * 2, ceilingMaterial, 0, ROOM_HEIGHT, 0);

    const backWidth = ROOM_HALF - DOOR_HALF;
    solid(backWidth, ROOM_HEIGHT, 0.14, wallMaterial, -(DOOR_HALF + backWidth / 2), ROOM_HEIGHT / 2, -ROOM_HALF);
    solid(backWidth, ROOM_HEIGHT, 0.14, wallMaterial, DOOR_HALF + backWidth / 2, ROOM_HEIGHT / 2, -ROOM_HALF);
    solid(DOOR_HALF * 2, ROOM_HEIGHT - DOOR_HEIGHT, 0.14, wallMaterial, 0, (ROOM_HEIGHT + DOOR_HEIGHT) / 2, -ROOM_HALF);
    solid(0.14, ROOM_HEIGHT, ROOM_HALF * 2, wallMaterial, -ROOM_HALF, ROOM_HEIGHT / 2, 0);
    solid(0.14, ROOM_HEIGHT, ROOM_HALF * 2, wallMaterial, ROOM_HALF, ROOM_HEIGHT / 2, 0);

    // Dado rail and skirting, so the parlor reads as 1930s rather than a grey test room.
    for (const wallX of [-ROOM_HALF + 0.1, ROOM_HALF - 0.1]) {
      box(0.06, 0.09, ROOM_HALF * 2, trimMaterial, wallX, 0.98, 0);
      box(0.06, 0.16, ROOM_HALF * 2, trimMaterial, wallX, 0.08, 0);
    }
    for (const segmentX of [-(DOOR_HALF + backWidth / 2), DOOR_HALF + backWidth / 2]) {
      box(backWidth, 0.09, 0.06, trimMaterial, segmentX, 0.98, -ROOM_HALF + 0.1);
      box(backWidth, 0.16, 0.06, trimMaterial, segmentX, 0.08, -ROOM_HALF + 0.1);
    }

    // Door casing and a glimpse of the porch beyond it.
    solid(0.1, DOOR_HEIGHT, 0.16, trimMaterial, -DOOR_HALF, DOOR_HEIGHT / 2, -ROOM_HALF);
    solid(0.1, DOOR_HEIGHT, 0.16, trimMaterial, DOOR_HALF, DOOR_HEIGHT / 2, -ROOM_HALF);
    solid(DOOR_HALF * 2 + 0.1, 0.12, 0.16, trimMaterial, 0, DOOR_HEIGHT, -ROOM_HALF);
    solid(2.6, 0.1, 2.6, floorMaterial, 0, -0.02, -ROOM_HALF - 1.4);

    // Sash window on the right-hand wall.
    box(0.06, 1.15, 1.35, glassMaterial, ROOM_HALF - 0.08, 1.75, 0.2);
    box(0.08, 0.08, 1.5, trimMaterial, ROOM_HALF - 0.1, 2.35, 0.2);
    box(0.08, 0.08, 1.5, trimMaterial, ROOM_HALF - 0.1, 1.18, 0.2);
    box(0.08, 1.2, 0.08, trimMaterial, ROOM_HALF - 0.1, 1.76, -0.55);
    box(0.08, 1.2, 0.08, trimMaterial, ROOM_HALF - 0.1, 1.76, 0.95);
    box(0.08, 1.2, 0.05, trimMaterial, ROOM_HALF - 0.1, 1.76, 0.2);

    // Rug.
    const rug = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 2.6), rugMaterial);
    rug.rotation.x = -Math.PI / 2;
    rug.position.set(0, 0.075, 0.6);
    rug.receiveShadow = true;
    room.add(rug);

    // Table, chair and lamp. Every piece is also a static collider.
    const tableX = -2.4;
    const tableZ = -2.9;
    solid(1.6, 0.09, 0.95, woodMaterial, tableX, 0.78, tableZ);
    for (const [dx, dz] of [[-0.66, -0.36], [0.66, -0.36], [-0.66, 0.36], [0.66, 0.36]] as const) {
      solid(0.09, 0.74, 0.09, woodMaterial, tableX + dx, 0.37, tableZ + dz);
    }
    solid(0.4, 0.3, 0.3, new THREE.MeshStandardMaterial({ color: "#8c7a5b", roughness: 0.9 }), tableX + 0.35, 0.97, tableZ);

    solid(0.55, 0.08, 0.55, woodMaterial, 2.2, 0.46, -3.0);
    solid(0.55, 0.62, 0.07, woodMaterial, 2.2, 0.76, -3.24);
    for (const [dx, dz] of [[-0.22, -0.22], [0.22, -0.22], [-0.22, 0.22], [0.22, 0.22]] as const) {
      solid(0.06, 0.44, 0.06, woodMaterial, 2.2 + dx, 0.22, -3.0 + dz);
    }

    const lampX = 3.05;
    const lampZ = -0.2;
    solid(0.42, 0.1, 0.42, woodMaterial, lampX, 0.1, lampZ);
    solid(0.07, 1.35, 0.07, woodMaterial, lampX, 0.78, lampZ);
    const shadeMaterial = new THREE.MeshStandardMaterial({
      color: "#e4c48d",
      emissive: "#ffbf72",
      emissiveIntensity: 0.9,
      roughness: 0.8,
      side: THREE.DoubleSide,
    });
    const shade = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.4, 0.36, 20, 1, true), shadeMaterial);
    shade.position.set(lampX, 1.5, lampZ);
    room.add(shade);

    // Two small frames and a mirror on the back wall.
    const frameMaterial = new THREE.MeshStandardMaterial({ color: "#3d2a1b", roughness: 0.6 });
    const canvasMaterial = new THREE.MeshStandardMaterial({ color: "#b7a27a", roughness: 0.95 });
    box(0.66, 0.86, 0.05, frameMaterial, -3.0, 1.8, -ROOM_HALF + 0.1);
    box(0.54, 0.74, 0.03, canvasMaterial, -3.0, 1.8, -ROOM_HALF + 0.14);
    box(0.6, 0.5, 0.05, frameMaterial, 2.9, 1.85, -ROOM_HALF + 0.1);
    box(0.48, 0.38, 0.03, canvasMaterial, 2.9, 1.85, -ROOM_HALF + 0.14);

    // A narrow bookcase and writing desk give the parlor a sense of a life just begun.
    const bookcaseWood = new THREE.MeshStandardMaterial({ color: "#39271b", roughness: 0.68 });
    const bookSpines = ["#6b392d", "#344b46", "#9a7448", "#4c3d63", "#a54e36"]
      .map((color) => new THREE.MeshStandardMaterial({ color, roughness: 0.86 }));
    solid(0.52, 2.2, 1.85, bookcaseWood, -3.58, 1.14, 0.35);
    for (const shelfY of [0.46, 0.96, 1.46, 1.96]) {
      solid(0.58, 0.07, 1.92, woodMaterial, -3.55, shelfY, 0.35);
      for (let book = 0; book < 5; book++) {
        const spine = bookSpines[(book + Math.round(shelfY * 2)) % bookSpines.length]!;
        const height = 0.29 + (book % 3) * 0.045;
        box(0.2, height, 0.11, spine, -3.47, shelfY + 0.07 + height / 2, -0.34 + book * 0.34);
      }
    }
    solid(1.25, 0.09, 0.65, woodMaterial, 0.15, 0.78, 1.95);
    for (const [dx, dz] of [[-0.52, -0.24], [0.52, -0.24], [-0.52, 0.24], [0.52, 0.24]] as const) {
      solid(0.07, 0.72, 0.07, woodMaterial, 0.15 + dx, 0.37, 1.95 + dz);
    }
    box(0.72, 0.035, 0.48, new THREE.MeshStandardMaterial({ color: "#eee3c8", roughness: 0.95 }), 0.1, 0.85, 1.95);
    box(0.34, 0.035, 0.25, new THREE.MeshStandardMaterial({ color: "#b7a27a", roughness: 0.84 }), 0.15, 0.89, 1.95);

    // Warm tungsten light in the parlor plus a dim lamp over the porch.
    const lampLight = new THREE.PointLight("#ffc98a", 16, 16, 2);
    lampLight.position.set(lampX - 0.2, 1.7, lampZ);
    room.add(lampLight);
    const doorLight = new THREE.PointLight("#ffd7a4", 7, 10, 2);
    doorLight.position.set(0, 2.2, -ROOM_HALF - 0.6);
    room.add(doorLight);
    const fillLight = new THREE.PointLight("#9fb0c4", 3.2, 14, 2);
    fillLight.position.set(0, 2.4, 5.6);
    room.add(fillLight);
    const deskLight = new THREE.PointLight("#ffcf8a", 4.5, 7, 2);
    deskLight.position.set(0.15, 1.2, 1.95);
    room.add(deskLight);

  return room;
}
