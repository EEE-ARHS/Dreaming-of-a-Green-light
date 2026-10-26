import {
  AdditiveBlending, BoxGeometry, CylinderGeometry, Group, Mesh, MeshBasicMaterial,
  MeshStandardMaterial, PointLight, Scene, SpotLight, TorusGeometry,
} from "three";
import { WHEEL_RADIUS } from "./car-constants";

export interface Wheel { pivot: Group; spinner: Group; front: boolean; }

export interface CarModel {
  root: Group;
  wheels: Wheel[];
  headlights: SpotLight[];
  beams: Mesh[];
  fill: PointLight;
}

function material(name: string, color: string, emissive?: string): MeshStandardMaterial {
  return new MeshStandardMaterial({ name, color, emissive: emissive ?? "#000000", roughness: 0.56, metalness: 0.18 });
}

function add(mesh: Mesh, parent: Group, position: [number, number, number], mat: MeshStandardMaterial | MeshBasicMaterial): Mesh {
  mesh.position.set(...position); mesh.material = mat; mesh.castShadow = true; mesh.receiveShadow = true; parent.add(mesh); return mesh;
}

function buildWheel(root: Group, sx: number, z: number, front: boolean, rubber: MeshStandardMaterial, cream: MeshStandardMaterial, chrome: MeshStandardMaterial): Wheel {
  const pivot = new Group(); pivot.name = "wheelPivot"; pivot.position.set(sx * 0.84, -0.26, z); root.add(pivot);
  const spinner = new Group(); spinner.name = "wheelSpin"; pivot.add(spinner);
  const cylinder = (name: string, d: number, h: number, mat: MeshStandardMaterial, segments: number) => { const m = new Mesh(new CylinderGeometry(d / 2, d / 2, h, segments), mat); m.name = name; m.rotation.z = Math.PI / 2; m.castShadow = true; spinner.add(m); return m; };
  cylinder("tire", WHEEL_RADIUS * 2, 0.24, rubber, 22); cylinder("whitewall", 0.55, 0.25, cream, 20); cylinder("hub", 0.4, 0.27, chrome, 18);
  for (let i = 0; i < 8; i++) { const spoke = new Mesh(new BoxGeometry(0.035, 0.47, 0.04), chrome); spoke.rotation.x = (i / 8) * Math.PI; spinner.add(spoke); }
  cylinder("hubCap", 0.14, 0.29, chrome, 12);
  return { pivot, spinner, front };
}

export function createCarModel(scene: Scene): CarModel {
  const root = new Group(); root.name = "carRoot"; scene.add(root);
  const wheels: Wheel[] = [], headlights: SpotLight[] = [], beams: Mesh[] = [];
  const paint = material("gatsbyYellow", "#d8ae2f", "#171002"), paintDark = material("gatsbyYellowDark", "#a9821f", "#100b02");
  const chrome = material("chrome", "#b9bdc2"); chrome.metalness = 0.82; chrome.roughness = 0.22;
  const leather = material("leather", "#2a1b12"), rubber = material("rubber", "#0e0e10"), cream = material("whitewall", "#cfc6b2");
  const box = (name: string, size: [number, number, number], pos: [number, number, number], mat: MeshStandardMaterial) => add(new Mesh(new BoxGeometry(...size), mat), root, pos, mat).name = name;
  box("boatTail", [1.62, 0.42, 4], [0, -0.04, -0.1], paint);
  box("beltline", [1.72, 0.2, 3.4], [0, 0.17, -0.3], paintDark);
  box("bonnet", [1.02, 0.4, 1.7], [0, 0.2, 1.18], paint);
  box("bonnetTop", [0.86, 0.1, 1.62], [0, 0.41, 1.2], paintDark);
  box("cowl", [1.5, 0.34, 0.3], [0, 0.25, 0.42], paintDark);
  box("radiator", [0.94, 0.6, 0.16], [0, 0.2, 2.02], chrome);
  for (let i = 0; i < 7; i++) box("grilleSlat" + i, [0.82, 0.025, 0.04], [0, -0.02 + i * 0.075, 2.11], chrome);
  add(new Mesh(new CylinderGeometry(0.05, 0.05, 0.15, 8), cream), root, [0, 0.53, 2], cream).name = "hoodOrnament";
  box("cockpit", [1.42, 0.52, 1.5], [0, 0.28, -0.55], paintDark);
  box("cabinFloor", [1.2, 0.2, 1.2], [0, 0.42, -0.5], leather);
  box("seatBase", [1.16, 0.16, 0.5], [0, 0.53, -0.5], leather);
  box("seatBack", [1.16, 0.44, 0.14], [0, 0.7, -0.8], leather);
  box("dash", [1.34, 0.16, 0.22], [0, 0.6, 0.16], chrome);
  const steering = add(new Mesh(new TorusGeometry(0.16, 0.0175, 8, 20), leather), root, [-0.34, 0.68, 0.1], leather); steering.rotation.x = 1.15;
  const column = add(new Mesh(new CylinderGeometry(0.0225, 0.0225, 0.32, 8), chrome), root, [-0.34, 0.6, 0.18], chrome); column.rotation.x = 1.15;
  const glass = new MeshStandardMaterial({ color: "#6d8798", emissive: "#0a1116", roughness: 0.16, metalness: 0.3, transparent: true, opacity: 0.22, side: 2 });
  const windshield = add(new Mesh(new BoxGeometry(1.3, 0.42, 0.02), glass), root, [0, 0.79, 0.3], glass); windshield.rotation.x = -0.13;
  const frame = add(new Mesh(new BoxGeometry(1.36, 0.035, 0.045), chrome), root, [0, 1, 0.33], chrome); frame.rotation.x = -0.13;
  for (const sx of [-1, 1]) {
    const post = add(new Mesh(new BoxGeometry(0.035, 0.46, 0.04), chrome), root, [sx * 0.66, 0.79, 0.3], chrome); post.rotation.x = -0.13;
    box("frontFender", [0.3, 0.13, 1.3], [sx * 0.86, 0.02, 1.3], paintDark);
    box("rearFender", [0.3, 0.16, 1.3], [sx * 0.86, 0.04, -1.35], paintDark);
    box("runningBoard", [0.34, 0.07, 1.9], [sx * 0.91, -0.2, 0], chrome);
    box("headlampBracket", [0.06, 0.3, 0.06], [sx * 0.56, 0.24, 1.82], chrome);
  }
  const lensMat = new MeshBasicMaterial({ color: "#fff3d0" });
  for (let i = 0; i < 2; i++) {
    const sx = i === 0 ? -1 : 1;
    const can = add(new Mesh(new CylinderGeometry(0.14, 0.14, 0.24, 16), chrome), root, [sx * 0.56, 0.44, 1.98], chrome); can.rotation.x = Math.PI / 2;
    const lens = add(new Mesh(new CylinderGeometry(0.115, 0.115, 0.03, 16), lensMat), root, [sx * 0.56, 0.44, 2.11], lensMat); lens.rotation.x = Math.PI / 2;
  }
  const tailMat = new MeshBasicMaterial({ color: "#a8130c" });
  for (const sx of [-0.58, 0.58]) box("tailLamp", [0.12, 0.1, 0.05], [sx, 0.08, -2.02], tailMat as unknown as MeshStandardMaterial);
  const exhaust = add(new Mesh(new CylinderGeometry(0.0375, 0.0375, 0.7, 10), chrome), root, [0.5, -0.22, -1.96], chrome); exhaust.rotation.x = Math.PI / 2;
  const spare = add(new Mesh(new CylinderGeometry(0.34, 0.34, 0.24, 20), rubber), root, [-0.9, 0.18, -0.35], rubber); spare.rotation.z = Math.PI / 2;
  const spareHub = add(new Mesh(new CylinderGeometry(0.21, 0.21, 0.26, 18), chrome), root, [-0.9, 0.18, -0.35], chrome); spareHub.rotation.z = Math.PI / 2;
  for (const [sx, front] of [[-1, true], [1, true], [-1, false], [1, false]] as const) wheels.push(buildWheel(root, sx, front ? 1.38 : -1.42, front, rubber, cream, chrome));
  const fill = new PointLight("#ffd9a1", 0.5, 9); fill.position.set(0, 2.4, -0.8); root.add(fill);
  const beamMat = new MeshBasicMaterial({ color: "#ffe6b4", transparent: true, opacity: 0.05, blending: AdditiveBlending, depthWrite: false, side: 2 });
  for (let i = 0; i < 2; i++) {
    const spot = new SpotLight("#ffe8bd", 2.6, 58, Math.PI / 3.3, 0.5, 2); spot.position.set(-0.56, 0.5, 2.1); spot.target.position.set(0, 0.38, 3.1); root.add(spot, spot.target); headlights.push(spot);
    const beam = new Mesh(new CylinderGeometry(0.25, 3.75, 24, 18), beamMat); beam.position.set((i === 0 ? -1 : 1) * 0.56, 0.44, 14); beam.rotation.x = -Math.PI / 2; beam.renderOrder = 1; beam.name = "headlightBeam" + i; root.add(beam); beams.push(beam);
  }
  return { root, wheels, headlights, beams, fill };
}
