import {
  BoxGeometry, BufferGeometry, CanvasTexture, Color, CylinderGeometry, Mesh, MeshBasicMaterial,
  MeshStandardMaterial, NearestFilter, SphereGeometry, Vector3, type Object3D,
} from "three";

export function worldColor(hex: string): Color { return new Color(hex); }
export function basicMaterial(hex: string, extra: Partial<ConstructorParameters<typeof MeshBasicMaterial>[0]> = {}) {
  return new MeshBasicMaterial({ color: hex, ...extra });
}
export function emissiveBasicMaterial(hex: string, emissive: string, extra: Partial<ConstructorParameters<typeof MeshBasicMaterial>[0]> = {}) {
  const material = new MeshBasicMaterial({ color: hex, ...extra });
  material.color.add(new Color(emissive));
  return material;
}
export function standardMaterial(hex: string, extra: Partial<ConstructorParameters<typeof MeshStandardMaterial>[0]> = {}) {
  return new MeshStandardMaterial({ color: hex, roughness: 0.9, flatShading: true, ...extra });
}

export function makeWorldCanvasTexture(width: number, height: number, paint: (ctx: CanvasRenderingContext2D) => void): CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = width; canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not create a procedural world texture.");
  paint(ctx);
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = "srgb";
  texture.magFilter = NearestFilter;
  texture.minFilter = NearestFilter;
  return texture;
}

export function fleckTexture(base: string, flecks: number, size = 512): CanvasTexture {
  return makeWorldCanvasTexture(size, size, (ctx) => {
    ctx.fillStyle = base; ctx.fillRect(0, 0, size, size);
    for (let i = 0; i < flecks; i++) {
      const g = 18 + Math.floor(Math.random() * 46);
      ctx.fillStyle = `rgba(${g},${g + 2},${g + 6},${0.12 + Math.random() * 0.4})`;
      const s = Math.random() * 2.4 + 0.4;
      ctx.fillRect(Math.random() * size, Math.random() * size, s, s);
    }
  });
}

export function textTexture(text: string, width: number, height: number, font: string, fill: string): CanvasTexture {
  return makeWorldCanvasTexture(512, Math.round(512 * height / width), (ctx) => {
    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    ctx.fillStyle = fill; ctx.font = font; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText(text, ctx.canvas.width / 2, ctx.canvas.height / 2);
  });
}

export function addWorldMesh(geometry: BufferGeometry, material: MeshStandardMaterial | MeshBasicMaterial, position: Vector3, parent: Object3D): Mesh {
  const result = new Mesh(geometry, material);
  result.position.copy(position); result.castShadow = true; result.receiveShadow = true;
  parent.add(result);
  return result;
}
export function addWorldBox(parent: Object3D, name: string, size: [number, number, number], position: [number, number, number], material: MeshStandardMaterial | MeshBasicMaterial): Mesh {
  const result = addWorldMesh(new BoxGeometry(...size), material, new Vector3(...position), parent);
  result.name = name;
  return result;
}
export function addWorldCylinder(parent: Object3D, name: string, top: number, bottom: number, height: number, position: [number, number, number], material: MeshStandardMaterial | MeshBasicMaterial, segments = 16): Mesh {
  const result = addWorldMesh(new CylinderGeometry(top, bottom, height, Math.min(8, segments)), material, new Vector3(...position), parent);
  result.name = name;
  return result;
}
export function addWorldSphere(parent: Object3D, name: string, diameter: number, position: [number, number, number], material: MeshStandardMaterial | MeshBasicMaterial, segments = 18): Mesh {
  const result = addWorldMesh(new SphereGeometry(diameter / 2, Math.min(10, segments), Math.min(6, Math.max(4, Math.floor(segments * 0.4)))), material, new Vector3(...position), parent);
  result.name = name;
  return result;
}
