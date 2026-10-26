import * as THREE from "three";
import { disposeObjectTree } from "../../../frontend/src/scene-resources";
export { disposeObjectTree };

export interface ModelAssetSource {
  load(path: string): Promise<THREE.Object3D>;
}

export const GLTF_MODEL_ASSET_SOURCE: ModelAssetSource = {
  load(path) {
    return new Promise((resolve, reject) => {
      void import("three/examples/jsm/loaders/GLTFLoader.js").then(({ GLTFLoader }) => {
        new GLTFLoader().load(path, (gltf) => resolve(gltf.scene), undefined, reject);
      }).catch(reject);
    });
  },
};

export function fitModelToTarget(model: THREE.Object3D, target: THREE.Vector3, alignBottom = false): void {
  let bounds = new THREE.Box3().setFromObject(model);
  const size = bounds.getSize(new THREE.Vector3());
  const ratios = [size.x > 0 ? target.x / size.x : Infinity, size.y > 0 ? target.y / size.y : Infinity, size.z > 0 ? target.z / size.z : Infinity];
  const scale = Math.min(...ratios);
  if (Number.isFinite(scale)) model.scale.setScalar(scale);
  bounds = new THREE.Box3().setFromObject(model);
  const center = bounds.getCenter(new THREE.Vector3());
  model.position.x -= center.x;
  model.position.y -= alignBottom ? bounds.min.y : center.y;
  model.position.z -= center.z;
}

export function disposeChildren(root: THREE.Object3D): void {
  for (const child of [...root.children]) {
    root.remove(child);
    disposeObjectTree(child);
  }
}
