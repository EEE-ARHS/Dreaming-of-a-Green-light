import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader";

class AssetManager {
  private gltfLoader = new GLTFLoader();
  private textureLoader = new THREE.TextureLoader();
  private modelCache = new Map<string, THREE.Object3D>();
  private textureCache = new Map<string, THREE.Texture>();

  /**
   * Loads a GLTF/GLB model. Returns a clone of the model to allow multiple instances.
   */
  async loadModel(path: string, fallbackGeometry?: THREE.Geometry): Promise<THREE.Object3D> {
    if (this.modelCache.has(path)) {
      return this.modelCache.get(path)!.clone();
    }

    try {
      const gltf = await this.gltfLoader.loadAsync(path);
      const model = gltf.scene;
      this.modelCache.set(path, model);
      return model.clone();
    } catch (e) {
      console.warn(`Failed to load model at ${path}, using fallback.`);
      if (fallbackGeometry) {
        return new THREE.Mesh(fallbackGeometry, new THREE.MeshStandardMaterial({ color: 0xaaaaaa }));
      }
      throw e;
    }
  }

  /**
   * Loads a 2D texture.
   */
  async loadTexture(path: string): Promise<THREE.Texture> {
    if (this.textureCache.has(path)) {
      return this.textureCache.get(path)!;
    }

    try {
      const texture = await this.textureLoader.loadAsync(path);
      this.textureCache.set(path, texture);
      return texture;
    } catch (e) {
      console.error(`Failed to load texture at ${path}`);
      throw e;
    }
  }

  clearCache(): void {
    this.modelCache.clear();
    this.textureCache.clear();
  }
}

export const assets = new AssetManager();
