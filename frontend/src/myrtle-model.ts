import { BoxGeometry, CapsuleGeometry, CylinderGeometry, Mesh, MeshStandardMaterial, SphereGeometry, TorusGeometry } from "three";
import type { PartDef, PartMaterial } from "./ragdoll-constants";

export type MyrtleMaterials = Record<PartMaterial, MeshStandardMaterial>;

export function createMyrtlePartMesh(def: PartDef, materials: MyrtleMaterials): Mesh {
  const geometry = def.kind === "box" && def.size
    ? new BoxGeometry(...def.size)
    : def.kind === "capsule" && def.radius && def.length
      ? new CapsuleGeometry(def.radius, def.length, 4, 10)
      : new SphereGeometry(def.radius ?? 0.1, 16, 12);
  const partMesh = new Mesh(geometry, materials[def.material]);
  partMesh.name = def.name;
  partMesh.position.set(...def.pos);
  partMesh.castShadow = true;
  partMesh.receiveShadow = true;

  const add = (shape: BoxGeometry | SphereGeometry | CylinderGeometry | TorusGeometry, material: MeshStandardMaterial, position: [number, number, number]) => {
    const object = new Mesh(shape, material);
    object.position.set(...position);
    object.castShadow = true;
    partMesh.add(object);
    return object;
  };
  if (def.name === "pelvis") {
    const skirt = add(new CylinderGeometry(0.18, 0.34, 0.62, 18), materials.dress, [0, -0.16, 0]); skirt.name = "myrtleSkirt";
    const hem = add(new TorusGeometry(0.31, 0.0225, 8, 20), materials.dress, [0, -0.47, 0]); hem.name = "myrtleHem";
  }
  if (def.name === "torso") {
    const collar = add(new TorusGeometry(0.1, 0.03, 8, 16), materials.pearl, [0, 0.16, 0]); collar.rotation.x = Math.PI / 2;
    add(new CylinderGeometry(0.05, 0.05, 0.14, 10), materials.skin, [0, 0.22, 0]);
  }
  if (def.name === "head") {
    const hair = add(new SphereGeometry(0.1225, 16, 10), materials.hair, [0, 0.018, -0.012]); hair.scale.set(1.02, 0.92, 1.04);
    add(new CylinderGeometry(0.135, 0.135, 0.018, 20), materials.hair, [0, 0.08, -0.005]);
  }
  if (def.name === "armFL" || def.name === "armFR") add(new SphereGeometry(0.0425, 8, 6), materials.skin, [0, -0.135, 0]);
  if (def.name === "footL" || def.name === "footR") add(new BoxGeometry(0.06, 0.08, 0.06), materials.shoe, [0, -0.05, -0.08]);
  return partMesh;
}
