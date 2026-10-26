import * as THREE from "three";
import type { BelongingSpec } from "../constants";

export function createProceduralBelonging(parent: THREE.Object3D, kind: BelongingSpec["kind"]): void {
  const wood = new THREE.MeshStandardMaterial({ color: "#947044", roughness: 0.86 });
  const dark = new THREE.MeshStandardMaterial({ color: "#4a3322", roughness: 0.82 });
  const brass = new THREE.MeshStandardMaterial({ color: "#b08b4d", metalness: 0.72, roughness: 0.3 });
  const fabric = new THREE.MeshStandardMaterial({ color: "#66534a", roughness: 0.94 });
  const detail = (geometry: THREE.BufferGeometry, material: THREE.Material, position: [number, number, number], scale?: [number, number, number]) => {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(...position);
    if (scale) mesh.scale.set(...scale);
    mesh.castShadow = true;
    parent.add(mesh);
  };
  switch (kind) {
    case "suitcase":
      detail(new THREE.BoxGeometry(0.82, 0.58, 0.18), fabric, [0, 0, 0]);
      detail(new THREE.TorusGeometry(0.12, 0.018, 6, 14, Math.PI), brass, [0, 0.33, 0]);
      detail(new THREE.BoxGeometry(0.18, 0.07, 0.04), brass, [0, 0.05, 0.11]);
      break;
    case "lamp":
      detail(new THREE.CylinderGeometry(0.06, 0.09, 0.12, 10), brass, [0, -0.15, 0]);
      detail(new THREE.CylinderGeometry(0.025, 0.035, 0.3, 8), brass, [0, 0.02, 0]);
      detail(new THREE.CylinderGeometry(0.1, 0.19, 0.16, 12, 1, true), fabric, [0, 0.22, 0]);
      break;
    case "books":
      for (let index = 0; index < 3; index++) {
        const book = new THREE.Mesh(new THREE.BoxGeometry(0.68, 0.12, 0.42), index % 2 ? dark : wood);
        book.position.set(0, -0.17 + index * 0.13, (index % 2) * 0.04);
        book.rotation.y = (index - 1) * 0.12;
        book.castShadow = true;
        parent.add(book);
      }
      break;
    case "hatbox":
      detail(new THREE.CylinderGeometry(0.34, 0.34, 0.58, 18), wood, [0, 0, 0]);
      detail(new THREE.CylinderGeometry(0.35, 0.35, 0.04, 18), brass, [0, 0.3, 0]);
      break;
    default:
      detail(new THREE.BoxGeometry(0.86, 0.78, 0.86), wood, [0, 0, 0]);
      detail(new THREE.BoxGeometry(0.9, 0.05, 0.9), dark, [0, 0.05, 0]);
      for (const offset of [-0.22, 0.22]) detail(new THREE.BoxGeometry(0.08, 0.8, 0.88), dark, [offset, 0, 0]);
      break;
  }
}
