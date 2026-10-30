import { describe, expect, it, beforeEach } from "vitest";
import * as THREE from "three";
import type { ChapterContext } from "./types";
import { NicksHouseChapter } from "../../../chapters/chapter02/index";

type FlowerSpot = { root: THREE.Group; outline: THREE.Object3D; flower: THREE.Group | null };

type Garden = {
  phase: string;
  playerYaw: number;
  playerPitch: number;
  gameRoot: THREE.Group;
  flowers: THREE.Group[];
  spots: FlowerSpot[];
  heldFlower: THREE.Group | null;
  flowerCount: number;
  onMouseDown: (event: MouseEvent) => void;
  onMouseMove: (event: MouseEvent) => void;
  updateFlowerCrosshair: () => void;
};

let scene: THREE.Scene;
let camera: THREE.PerspectiveCamera;
let canvas: HTMLCanvasElement;
let garden: Garden;
let gameRoot: THREE.Group;

function makeGarden(): void {
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(68, 4 / 3, 0.1, 200);
  camera.position.set(0, 1.62, 0);
  canvas = document.createElement("canvas");
  document.body.append(canvas);
  const context = {
    scene,
    camera,
    engine: { domElement: canvas },
    keys: new Set<string>(),
    say: () => {},
    audio: {},
    dom: { hud: document.getElementById("hud"), titleFlash: () => {} },
    onKey: () => () => {},
  } as unknown as ChapterContext;
  garden = new NicksHouseChapter(context) as unknown as Garden;
  gameRoot = new THREE.Group();
  scene.add(gameRoot);
  garden.gameRoot = gameRoot;
  garden.phase = "flowers";
  garden.flowers = [];
  garden.spots = [];
  garden.heldFlower = null;
  garden.flowerCount = 0;
  camera.lookAt(0, 1.62, -5);
}

function addDaisy(index = 0, position = new THREE.Vector3(0, 1.62, -2)): THREE.Group {
  const daisy = new THREE.Group();
  daisy.name = `daisy-to-place-${index + 1}`;
  daisy.userData.daisySourceIndex = index;
  daisy.add(new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.22, 0.22), new THREE.MeshBasicMaterial()));
  daisy.position.copy(position);
  gameRoot.add(daisy);
  garden.flowers.push(daisy);
  return daisy;
}

function addVase(index: number, position: THREE.Vector3): FlowerSpot {
  const root = new THREE.Group();
  root.userData.daisyVaseSpot = index;
  root.position.copy(position);
  root.add(new THREE.Mesh(new THREE.BoxGeometry(0.4, 1, 0.4), new THREE.MeshBasicMaterial()));
  const outline = new THREE.Object3D();
  root.add(outline);
  gameRoot.add(root);
  const spot: FlowerSpot = { root, outline, flower: null };
  garden.spots.push(spot);
  return spot;
}

function click(): void {
  garden.onMouseDown(new MouseEvent("mousedown", { button: 0 }));
}

function crosshair(): HTMLElement {
  const node = document.getElementById("crosshair");
  if (!node) throw new Error("The test DOM is missing #crosshair.");
  return node;
}

beforeEach(() => {
  Object.defineProperty(document, "pointerLockElement", {
    configurable: true,
    get: () => canvas,
  });
  makeGarden();
});

describe("The Visit controls", () => {
  it("turns the camera with mouse movement while the pointer is locked", () => {
    const yaw = garden.playerYaw;
    const pitch = garden.playerPitch;
    garden.onMouseMove(new MouseEvent("mousemove", { movementX: 120, movementY: 40 }));
    expect(garden.playerYaw).toBeLessThan(yaw);
    expect(garden.playerYaw).toBeCloseTo(yaw - 120 * 0.0022, 5);
    expect(garden.playerPitch).toBeLessThan(pitch);
    expect(garden.playerPitch).toBeCloseTo(pitch - 40 * 0.0018, 5);
  });

  it("clamps the pitch so the camera cannot flip over", () => {
    garden.onMouseMove(new MouseEvent("mousemove", { movementX: 0, movementY: -100000 }));
    expect(garden.playerPitch).toBeLessThanOrEqual(0.9);
    garden.onMouseMove(new MouseEvent("mousemove", { movementX: 0, movementY: 100000 }));
    expect(garden.playerPitch).toBeGreaterThanOrEqual(-0.95);
  });

  it("ignores mouse look outside the garden phases", () => {
    garden.phase = "intro";
    const yaw = garden.playerYaw;
    garden.onMouseMove(new MouseEvent("mousemove", { movementX: 200, movementY: 0 }));
    expect(garden.playerYaw).toBe(yaw);
  });

  it("marks the crosshair when a daisy sits under its centre", () => {
    addDaisy();
    garden.updateFlowerCrosshair();
    expect(crosshair().classList.contains("is-interactive")).toBe(true);
  });

  it("leaves the crosshair neutral when nothing is under its centre", () => {
    addDaisy(0, new THREE.Vector3(6, 1.62, -2));
    garden.updateFlowerCrosshair();
    expect(crosshair().classList.contains("is-interactive")).toBe(false);
    expect(crosshair().classList.contains("is-grabbing")).toBe(false);
  });

  it("picks a daisy up with the left mouse button", () => {
    const daisy = addDaisy();
    click();
    expect(garden.heldFlower).toBe(daisy);
    expect(daisy.parent).toBe(camera);
    expect(daisy.position.toArray()).toEqual([0.28, -0.25, -0.82]);
    expect(crosshair().classList.contains("is-grabbing")).toBe(true);
    expect(garden.flowerCount).toBe(0);
  });

  it("plants the held daisy in an outlined vase with the left mouse button", () => {
    addDaisy();
    click();
    const vase = addVase(0, new THREE.Vector3(0, 0.48, -3));
    camera.lookAt(vase.root.position);
    click();
    expect(garden.heldFlower).toBeNull();
    expect(garden.flowerCount).toBe(1);
    expect(garden.spots[0]?.flower).toBeInstanceOf(THREE.Group);
    expect(vase.flower?.parent).toBe(vase.root);
    expect(vase.outline.visible).toBe(false);
    expect(crosshair().classList.contains("is-grabbing")).toBe(false);
  });

  it("does not pick a daisy hidden behind an empty vase", () => {
    addDaisy(0, new THREE.Vector3(0, 1.62, -4));
    addVase(0, new THREE.Vector3(0, 1.62, -2));
    click();
    expect(garden.heldFlower).toBeNull();
    expect(garden.flowers[0]?.parent).toBe(gameRoot);
  });

  it("does not place the held daisy on a vase that is already filled", () => {
    addDaisy();
    click();
    const vase = addVase(0, new THREE.Vector3(0, 0.48, -3));
    vase.flower = new THREE.Group();
    camera.lookAt(vase.root.position);
    click();
    expect(garden.heldFlower).not.toBeNull();
    expect(garden.flowerCount).toBe(0);
  });
});
