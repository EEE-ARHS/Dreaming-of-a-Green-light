import { Vector3 } from "three";

export const Y_AXIS = new Vector3(0, 1, 0);
export const X_AXIS = new Vector3(1, 0, 0);
export const ZERO_LIMITS: [number, number] = [0, 0];

export type ShapeKind = "box" | "capsule" | "sphere";
export type PartMaterial = "dress" | "skin" | "hair" | "shoe" | "pearl";

export interface PartDef {
  name: string;
  kind: ShapeKind;
  pos: [number, number, number];
  size?: [number, number, number];
  radius?: number;
  length?: number;
  mass: number;
  material: PartMaterial;
}

export interface JointDef {
  parent: string;
  child: string;
  pivot: [number, number, number];
  limits: {
    twist: [number, number];
    pitch: [number, number];
    roll: [number, number];
  };
}

export const PART_DEFS: PartDef[] = [
  { name: "pelvis", kind: "box", pos: [0, 0.98, 0], size: [0.3, 0.2, 0.22], mass: 9, material: "dress" },
  { name: "torso", kind: "box", pos: [0, 1.22, 0], size: [0.36, 0.4, 0.23], mass: 13, material: "dress" },
  { name: "head", kind: "sphere", pos: [0, 1.5, 0.005], radius: 0.115, mass: 4, material: "skin" },
  { name: "armUL", kind: "capsule", pos: [-0.245, 1.235, 0], radius: 0.052, length: 0.3, mass: 2.4, material: "dress" },
  { name: "armFL", kind: "capsule", pos: [-0.245, 0.955, 0], radius: 0.045, length: 0.27, mass: 1.8, material: "skin" },
  { name: "armUR", kind: "capsule", pos: [0.245, 1.235, 0], radius: 0.052, length: 0.3, mass: 2.4, material: "dress" },
  { name: "armFR", kind: "capsule", pos: [0.245, 0.955, 0], radius: 0.045, length: 0.27, mass: 1.8, material: "skin" },
  { name: "thighL", kind: "capsule", pos: [-0.095, 0.705, 0], radius: 0.075, length: 0.4, mass: 6, material: "skin" },
  { name: "shinL", kind: "capsule", pos: [-0.095, 0.355, 0], radius: 0.058, length: 0.36, mass: 4, material: "skin" },
  { name: "footL", kind: "box", pos: [-0.095, 0.1, 0.055], size: [0.11, 0.1, 0.24], mass: 1.2, material: "shoe" },
  { name: "thighR", kind: "capsule", pos: [0.095, 0.705, 0], radius: 0.075, length: 0.4, mass: 6, material: "skin" },
  { name: "shinR", kind: "capsule", pos: [0.095, 0.355, 0], radius: 0.058, length: 0.36, mass: 4, material: "skin" },
  { name: "footR", kind: "box", pos: [0.095, 0.1, 0.055], size: [0.11, 0.1, 0.24], mass: 1.2, material: "shoe" },
];

export const JOINT_DEFS: JointDef[] = [
  { parent: "pelvis", child: "torso", pivot: [0, 1.045, 0], limits: { twist: [-0.32, 0.32], pitch: [-0.28, 0.32], roll: [-0.26, 0.26] } },
  { parent: "torso", child: "head", pivot: [0, 1.4, 0], limits: { twist: [-0.5, 0.5], pitch: [-0.5, 0.5], roll: [-0.5, 0.5] } },
  { parent: "torso", child: "armUL", pivot: [-0.215, 1.38, 0], limits: { twist: [-1.2, 1.2], pitch: [-1.35, 1.35], roll: [-1.2, 1.2] } },
  { parent: "armUL", child: "armFL", pivot: [-0.245, 1.085, 0], limits: { twist: ZERO_LIMITS, pitch: [0.02, 2.1], roll: ZERO_LIMITS } },
  { parent: "torso", child: "armUR", pivot: [0.215, 1.38, 0], limits: { twist: [-1.2, 1.2], pitch: [-1.35, 1.35], roll: [-1.2, 1.2] } },
  { parent: "armUR", child: "armFR", pivot: [0.245, 1.085, 0], limits: { twist: ZERO_LIMITS, pitch: [0.02, 2.1], roll: ZERO_LIMITS } },
  { parent: "pelvis", child: "thighL", pivot: [-0.095, 0.9, 0], limits: { twist: [-0.3, 0.3], pitch: [-1.2, 0.55], roll: [-0.34, 0.34] } },
  { parent: "thighL", child: "shinL", pivot: [-0.095, 0.51, 0], limits: { twist: ZERO_LIMITS, pitch: [-2.2, 0.03], roll: ZERO_LIMITS } },
  { parent: "shinL", child: "footL", pivot: [-0.095, 0.175, 0], limits: { twist: ZERO_LIMITS, pitch: [-0.45, 0.5], roll: ZERO_LIMITS } },
  { parent: "pelvis", child: "thighR", pivot: [0.095, 0.9, 0], limits: { twist: [-0.3, 0.3], pitch: [-1.2, 0.55], roll: [-0.34, 0.34] } },
  { parent: "thighR", child: "shinR", pivot: [0.095, 0.51, 0], limits: { twist: ZERO_LIMITS, pitch: [-2.2, 0.03], roll: ZERO_LIMITS } },
  { parent: "shinR", child: "footR", pivot: [0.095, 0.175, 0], limits: { twist: ZERO_LIMITS, pitch: [-0.45, 0.5], roll: ZERO_LIMITS } },
];
