import * as THREE from "three";
import {
  AdditiveBlending, BoxGeometry, BufferGeometry, CanvasTexture, CapsuleGeometry, Color, DoubleSide, Euler,
  FrontSide, Group, HemisphereLight as ThreeHemisphereLight, Line, LineBasicMaterial, MeshBasicMaterial,
  MeshStandardMaterial, PerspectiveCamera as ThreePerspectiveCamera, PlaneGeometry, Scene as ThreeScene,
  SphereGeometry, SpotLight as ThreeSpotLight, TorusGeometry, Vector3 as ThreeVector3,
  WebGLRenderer, Quaternion as ThreeQuaternion, CylinderGeometry,
} from "three";
import { ArcadePhysics, PhysicsAggregate, PhysicsBody, type PhysicsMaterialOptions } from "./physics";

declare module "three" {
  interface Vector3 { copyFrom(value: Vector3): this; addInPlace(value: Vector3): this; scale(factor: number): this; }
  interface PerspectiveCamera { setTarget(target: Vector3): void; }
}

export { ArcadePhysics, PhysicsAggregate, PhysicsBody };
export type { PhysicsMaterialOptions };
export type Vector3 = ThreeVector3;
export const Vector3 = Object.assign(ThreeVector3, {
  Zero: () => new ThreeVector3(), Up: () => new ThreeVector3(0, 1, 0),
  Right: () => new ThreeVector3(1, 0, 0),
  Lerp: (a: ThreeVector3, b: ThreeVector3, alpha: number) => a.clone().lerp(b, alpha),
});
ThreeVector3.prototype.copyFrom = function (value) { return this.copy(value); };
ThreeVector3.prototype.addInPlace = function (value) { return this.add(value); };
ThreeVector3.prototype.scale = function (factor) { return this.multiplyScalar(factor); };
ThreePerspectiveCamera.prototype.setTarget = function (target) { this.lookAt(target); };

export type Quaternion = ThreeQuaternion;
export const Quaternion = Object.assign(ThreeQuaternion, {
  Identity: () => new ThreeQuaternion(),
  FromEulerAngles: (x: number, y: number, z: number) => new ThreeQuaternion().setFromEuler(new Euler(x, y, z)),
  RotationAxis: (axis: ThreeVector3, angle: number) => new ThreeQuaternion().setFromAxisAngle(axis, angle),
});
export type Scene = ThreeScene;
export const Scene = ThreeScene;
export type Engine = WebGLRenderer;
export type PhysicsAggregateParameters = PhysicsMaterialOptions;
export type TransformNode = Group;
export const Color3 = {
  FromHexString: (hex: string) => new Color(hex), Black: () => new Color(0x000000),
};
export type Color3 = Color;
export class Color4 extends Color { constructor(r: number, g: number, b: number, public a = 1) { super(r, g, b); } }
export const Constants = { ALPHA_ADD: AdditiveBlending };
export { PhysicsMotionType, PhysicsShapeType } from "./physics";
export const PhysicsConstraintAxis = { LINEAR_X: 0, LINEAR_Y: 1, LINEAR_Z: 2, ANGULAR_X: 3, ANGULAR_Y: 4, ANGULAR_Z: 5 } as const;

export class FreeCamera extends ThreePerspectiveCamera {
  inputs = { clear() {} };
  constructor(name: string, position: ThreeVector3, scene: ThreeScene) {
    super(52.7, 1, 0.18, 1200); this.name = name; this.position.copy(position); scene.add(this);
  }
}
export class Mesh extends THREE.Mesh {
  constructor(nameOrGeometry?: string | BufferGeometry, sceneOrMaterial?: ThreeScene | THREE.Material | THREE.Material[]) {
    if (typeof nameOrGeometry === "string") {
      super(new BufferGeometry(), new MeshBasicMaterial({ visible: false }));
      this.name = nameOrGeometry; (sceneOrMaterial as ThreeScene | undefined)?.add(this);
    } else super(nameOrGeometry ?? new BufferGeometry(), sceneOrMaterial as THREE.Material | THREE.Material[] | undefined);
  }
  get scaling(): ThreeVector3 { return this.scale; }
  set rotationQuaternion(value: ThreeQuaternion | null) { if (value) this.quaternion.copy(value); }
  get rotationQuaternion(): ThreeQuaternion { return this.quaternion; }
  get isPickable(): boolean { return this.userData.isPickable !== false; }
  set isPickable(value: boolean) { this.userData.isPickable = value; }
  get isVisible(): boolean { return this.visible; } set isVisible(value: boolean) { this.visible = value; }
  get renderingGroupId(): number { return this.renderOrder; } set renderingGroupId(value: number) { this.renderOrder = value; }
  get physicsBody(): PhysicsBody | undefined { return this.userData.physicsBody as PhysicsBody | undefined; }
  computeWorldMatrix(_force = false): THREE.Matrix4 { this.updateMatrixWorld(true); return this.matrixWorld; }
  getChildMeshes(directDescendantsOnly = false): THREE.Mesh[] {
    const result: THREE.Mesh[] = []; this.traverse((node) => { if (node !== this && node instanceof THREE.Mesh) result.push(node); });
    return directDescendantsOnly ? result.filter((node) => node.parent === this) : result;
  }
}
export class StandardMaterial extends MeshStandardMaterial {
  constructor(name: string, _scene?: ThreeScene) { super({ color: 0xffffff, roughness: 0.8 }); this.name = name; }
  get diffuseColor(): Color { return this.color; } set diffuseColor(value: Color) { this.color.copy(value); }
  get emissiveColor(): Color { return this.emissive; } set emissiveColor(value: Color) { this.emissive.copy(value); }
  get specularColor(): Color { return this.color; } set specularColor(value: Color) { this.metalness = Math.max(value.r, value.g, value.b) * 0.25; }
  get specularPower(): number { return (1 - this.roughness) * 128; } set specularPower(value: number) { this.roughness = Math.max(0.04, 1 - value / 128); }
  get alpha(): number { return this.opacity; } set alpha(value: number) { this.opacity = value; this.transparent = value < 1; }
  get backFaceCulling(): boolean { return this.side !== DoubleSide; } set backFaceCulling(value: boolean) { this.side = value ? FrontSide : DoubleSide; }
  get diffuseTexture(): THREE.Texture | null { return this.map; } set diffuseTexture(value: THREE.Texture | null) { this.map = value; }
  set emissiveTexture(value: THREE.Texture | null) { this.emissiveMap = value; }
  set disableDepthWrite(value: boolean) { this.depthWrite = !value; }
  set alphaMode(value: THREE.Blending) { this.blending = value; this.transparent = true; }
  set disableLighting(_value: boolean) {} set maxSimultaneousLights(_value: number) {} set fogEnabled(_value: boolean) {}
  set useAlphaFromDiffuseTexture(_value: boolean) {}
}
export class DynamicTexture extends CanvasTexture {
  readonly canvasElement: HTMLCanvasElement;
  hasAlpha = false;
  constructor(name: string, size: { width: number; height: number }, _scene?: ThreeScene, _mips = false) {
    const canvas = document.createElement("canvas"); canvas.width = size.width; canvas.height = size.height;
    super(canvas); this.canvasElement = canvas; this.name = name; this.colorSpace = THREE.SRGBColorSpace;
  }
  getContext(): CanvasRenderingContext2D { const c = this.canvasElement.getContext("2d"); if (!c) throw new Error("Canvas context unavailable"); return c; }
  update(_invertY = false): void { this.needsUpdate = true; }
  get uScale(): number { return this.repeat.x; } set uScale(value: number) { this.repeat.x = value; }
  get vScale(): number { return this.repeat.y; } set vScale(value: number) { this.repeat.y = value; }
  get wrapU(): THREE.Wrapping { return this.wrapS; } set wrapU(value: THREE.Wrapping) { this.wrapS = value; }
  get wrapV(): THREE.Wrapping { return this.wrapT; } set wrapV(value: THREE.Wrapping) { this.wrapT = value; }
}
export class MeshBuilder {
  static CreateBox(name: string, o: { width?: number; height?: number; depth?: number }, scene: ThreeScene): Mesh { return this.add(new BoxGeometry(o.width ?? 1, o.height ?? 1, o.depth ?? 1), name, scene); }
  static CreateSphere(name: string, o: { diameter?: number; segments?: number }, scene: ThreeScene): Mesh { const r = (o.diameter ?? 1) / 2, s = o.segments ?? 16; return this.add(new SphereGeometry(r, s, Math.max(8, Math.floor(s * 0.65))), name, scene); }
  static CreateCylinder(name: string, o: { diameter?: number; diameterTop?: number; diameterBottom?: number; height?: number; tessellation?: number }, scene: ThreeScene): Mesh { const d = o.diameter ?? 1; return this.add(new CylinderGeometry((o.diameterTop ?? d) / 2, (o.diameterBottom ?? d) / 2, o.height ?? 1, o.tessellation ?? 16), name, scene); }
  static CreateCapsule(name: string, o: { radius?: number; height?: number; tessellation?: number }, scene: ThreeScene): Mesh { return this.add(new CapsuleGeometry(o.radius ?? 0.5, o.height ?? 1, 4, o.tessellation ?? 10), name, scene); }
  static CreatePlane(name: string, o: { width?: number; height?: number }, scene: ThreeScene): Mesh { return this.add(new PlaneGeometry(o.width ?? 1, o.height ?? 1), name, scene); }
  static CreateGround(name: string, o: { width?: number; height?: number }, scene: ThreeScene): Mesh { const m = this.CreatePlane(name, o, scene); m.rotation.x = -Math.PI / 2; return m; }
  static CreateTorus(name: string, o: { diameter?: number; thickness?: number; tessellation?: number }, scene: ThreeScene): Mesh { return this.add(new TorusGeometry((o.diameter ?? 1) / 2, o.thickness ?? 0.1, 8, o.tessellation ?? 16), name, scene); }
  static CreateLines(name: string, o: { points: ThreeVector3[] }, scene: ThreeScene): Line { const l = new Line(new BufferGeometry().setFromPoints(o.points), new LineBasicMaterial()); l.name = name; scene.add(l); return l; }
  private static add(g: BufferGeometry, name: string, scene: ThreeScene): Mesh { const m = new Mesh(g, new StandardMaterial(name)); m.name = name; scene.add(m); return m; }
}
export class HemisphericLight extends ThreeHemisphereLight {
  groundColor = new Color(0x000000);
  constructor(name: string, direction: ThreeVector3, scene: ThreeScene) { super(0xffffff, 0x101012, 1); this.name = name; this.position.copy(direction); scene.add(this); }
}
export class DirectionalLight extends THREE.DirectionalLight {
  shadowMinZ = 0.1; shadowMaxZ = 100; autoCalcShadowZBounds = false;
  constructor(name: string, direction: ThreeVector3, scene: ThreeScene) { super(0xffffff, 1); this.name = name; this.position.copy(direction); scene.add(this); }
}
export class PointLight extends THREE.PointLight {
  range = 0;
  constructor(name: string, position: ThreeVector3, scene: ThreeScene) { super(0xffffff, 1, 0); this.name = name; this.position.copy(position); scene.add(this); }
}
export class SpotLight extends ThreeSpotLight {
  range = 0;
  constructor(name: string, position: ThreeVector3, direction: ThreeVector3, angle: number, _exponent: number, scene: ThreeScene) { super(0xffffff, 1, 0, angle, 0.5, 2); this.name = name; this.position.copy(position); this.target.position.copy(position).add(direction); scene.add(this, this.target); }
}
export class GlowLayer { intensity = 0; constructor(_name: string, _scene: ThreeScene, _opts?: unknown) {} }
export class ShadowGenerator {
  useBlurExponentialShadowMap = false; blurKernel = 0; darkness = 0; bias = 0; normalBias = 0;
  constructor(_size: number, private readonly light: THREE.DirectionalLight) {}
  addShadowCaster(object: THREE.Object3D, _descendants = false): void { object.traverse((o) => { o.castShadow = true; }); this.light.castShadow = true; }
}
export class Physics6DoFConstraint {
  constructor(options: { pivotA: ThreeVector3; pivotB: ThreeVector3 }, _limits: unknown, _scene?: ThreeScene) { this.options = options; }
  readonly options: { pivotA: ThreeVector3; pivotB: ThreeVector3 };
  setAxisFriction(_axis: number, _friction: number): void {}
}
export class PhysicsViewer {
  private readonly helpers: THREE.Mesh[] = [];
  constructor(private readonly scene: ThreeScene) {}
  showBody(body: PhysicsBody): void {
    const source = body.object as THREE.Mesh;
    if (!source.geometry) return;
    const helper = new THREE.Mesh(source.geometry, new MeshBasicMaterial({ color: "#55ddff", wireframe: true, transparent: true, opacity: 0.5 }));
    helper.position.copy(source.position); helper.quaternion.copy(source.quaternion); helper.scale.copy(source.scale); helper.renderOrder = 2;
    source.parent?.add(helper); this.helpers.push(helper);
  }
  dispose(): void { for (const helper of this.helpers) { helper.removeFromParent(); if (!Array.isArray(helper.material)) helper.material.dispose(); } this.helpers.length = 0; void this.scene; }
}
export const Effect = { ShadersStore: {} as Record<string, string> };
export class PostProcess {
  onApply?: (effect: { setFloat: (name: string, value: number) => void }) => void;
  constructor(_name: string, _shader: string, _uniforms: string[], _samplers: unknown, _ratio: number, _camera: THREE.Camera) {}
  dispose(): void {}
}
