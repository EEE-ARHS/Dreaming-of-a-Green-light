/* Temporary harness: plays chapter XV without a browser. Delete when done. */
import "./stub";
import { document, elementById, listenerLog, window as windowStub } from "./stub";
import * as THREE from "three";
import { BoatsAgainstTheCurrentChapter } from "../../chapters/chapter15";
import { DRAG_SPAN } from "../../chapters/chapter15/constants";
import { waveHeight } from "../../chapters/chapter15/water";
import type { ChapterContext, ChapterDom } from "../src/chapters/types";

const failures: string[] = [];
const check = (label: string, ok: boolean, detail = ""): void => {
  console.log(`${ok ? "  ok  " : " FAIL "} ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures.push(label);
};

const scene = new THREE.Scene();
scene.background = new THREE.Color("#11100d");
scene.fog = new THREE.Fog("#17120e", 18, 50);
const hemi = new THREE.HemisphereLight("#d8c7a4", "#241c17", 1.4);
const key = new THREE.DirectionalLight("#ffe0ac", 2.2);
key.position.set(-3, 8, 6);
key.castShadow = true;
scene.add(hemi, key);
const camera = new THREE.PerspectiveCamera(52.7, 16 / 9, 0.18, 1200);
scene.add(camera);

const canvas = document.createElement("canvas") as unknown as HTMLCanvasElement & EventTarget;
const engine = { domElement: canvas } as unknown as ChapterContext["engine"];
const dom: ChapterDom = {
  hud: elementById("hud") as unknown as HTMLElement,
  speedValue: elementById("speedValue") as unknown as HTMLElement,
  gearValue: elementById("gearValue") as unknown as HTMLElement,
  distanceValue: elementById("distanceValue") as unknown as HTMLElement,
  subtitle: elementById("subtitle") as unknown as HTMLElement,
  flash: elementById("flash") as unknown as HTMLElement,
  letterbox: elementById("letterbox") as unknown as HTMLElement,
  titleFlash: (text) => captions.push(text),
};
const captions: string[] = [];
const ctx = {
  scene, engine, camera, dom,
  audio: { setEngine: () => undefined },
  keys: new Set<string>(),
  pointer: { steer: 0 },
  onKey: () => () => undefined,
  say: (text: string) => void captions.push(text),
} as unknown as ChapterContext;

const baselineChildren = scene.children.length;
const baselineFog = scene.fog;
const baselineBackground = scene.background;
const baselineIntensity = hemi.intensity;
const baselineColor = key.color.getHex();

const listenersBefore = { ...listenerLog };
const chapter = new BoatsAgainstTheCurrentChapter(ctx);
chapter.start();
const internals = chapter as unknown as {
  boat: { x: number; z: number; vx: number; vz: number };
  tracker: { best: number; time: number; wall: number };
  lightZ: number;
  phase: string;
  pull: number;
  depth: number[];
  stroke: number;
  previousStroke: number;
  dragging: boolean;
  driving: boolean;
  time: number;
  rig: { root: THREE.Object3D; bladePosition(side: number, out: THREE.Vector3): THREE.Vector3 };
};
const probe = new THREE.Vector3();

check("start adds the chapter to the scene", scene.children.length > baselineChildren, `${baselineChildren} → ${scene.children.length}`);
check("start repaints the scene as night", hemi.intensity < 0.3 && scene.fog !== baselineFog);
check("outcome starts pending", chapter.outcome() === "pending");

const pointer = (type: "pointerdown" | "pointermove" | "pointerup", y: number): void => {
  const target = type === "pointerdown" ? canvas : (windowStub as unknown as EventTarget);
  const event = Object.assign(new Event(type), { button: 0, clientX: 640, clientY: y, pointerId: 1 });
  target.dispatchEvent(event);
};

// A rower: quarter of a second to drag the oars down, then the same again to
// bring the handles forward and recover, then straight into the next stroke.
const dt = 1 / 60;
// A full stroke is two drag spans: from the catch (-1) to the finish (1).
const CATCH_Y = 90;
const DRAG_PIXELS = 720 * DRAG_SPAN * 2;
const driveFrames = 18;
const recoverFrames = 18;
const restFrames = 6;
const cycle = driveFrames + recoverFrames + restFrames;
let nearest = Infinity;
let frames = 0;
const started = Date.now();
while (chapter.outcome() === "pending" && frames < 60 * 140) {
  const step = frames % cycle;
  if (step === 0) pointer("pointerdown", CATCH_Y);
  else if (step < driveFrames) pointer("pointermove", CATCH_Y + DRAG_PIXELS * (step / driveFrames));
  else if (step < driveFrames + recoverFrames) {
    pointer("pointermove", CATCH_Y + DRAG_PIXELS * (1 - (step - driveFrames) / recoverFrames));
  } else if (step === driveFrames + recoverFrames) pointer("pointerup", CATCH_Y);
  chapter.update(dt);
  if (frames < 20) {
    internals.rig.bladePosition(1, probe);
    const root = internals.rig.root;
    console.log(`   f${String(frames).padStart(2)} stroke=${internals.stroke.toFixed(3)} drag=${internals.dragging} drive=${internals.driving} depth=${internals.depth.map((d) => d.toFixed(3)).join("/")} pull=${internals.pull.toFixed(3)} vz=${internals.boat.vz.toFixed(2)} rootY=${root.position.y.toFixed(3)} rot=${root.rotation.x.toFixed(2)}/${root.rotation.y.toFixed(2)}/${root.rotation.z.toFixed(3)} bladeY=${probe.y.toFixed(3)} wave=${waveHeight(probe.x, probe.z, internals.time).toFixed(3)}`);
  }
  const gap = Math.hypot(internals.lightZ - internals.boat.z, -internals.boat.x);
  nearest = Math.min(nearest, gap);
  frames += 1;
}
const seconds = frames / 60;
console.log(`  simulated ${seconds.toFixed(1)}s of rowing in ${((Date.now() - started) / 1000).toFixed(1)}s wall clock`);
console.log(`  nearest approach ${nearest.toFixed(1)}m · best ${internals.tracker.best.toFixed(1)}m · strokes ${internals.tracker.time.toFixed(1)}s`);

check("the green light is never reached", nearest > 26, `nearest ${nearest.toFixed(1)}m`);
check("the boat makes real progress first", internals.tracker.best < 70, `best ${internals.tracker.best.toFixed(1)}m`);
check("the chapter ends on its own", chapter.outcome() === "lose", `after ${seconds.toFixed(1)}s`);
check("the ending stops taking strokes", internals.phase === "ending" && internals.pull < 0.05, `pull ${internals.pull.toFixed(3)}`);
check("the boat is carried back", internals.boat.vz < 0.2, `vz ${internals.boat.vz.toFixed(2)}`);
check("captions were shown", captions.length > 3, `${captions.length} captions`);

const flavor = chapter.flavor("lose");
check("the ending carries the closest approach", flavor.body.includes(`${Math.round(internals.tracker.best)} metres`));
check("the ending quotes the novel", flavor.quote.startsWith("So we beat on"), flavor.quote.slice(0, 24));
check("the stamp replaces OOPS!", flavor.stamp === "BORNE BACK", String(flavor.stamp));
const counter = elementById("crateCounter").textContent;
check("the HUD counter reports the ending", counter === "THE LIGHT DOES NOT DRAW NEARER", counter);

chapter.dispose();
check("dispose leaves the scene as it was", scene.children.length === baselineChildren, `${scene.children.length}`);
check("dispose restores fog and sky", scene.fog === baselineFog && scene.background === baselineBackground);
check("dispose restores the lights", hemi.intensity === baselineIntensity && key.color.getHex() === baselineColor && key.castShadow);
check("dispose removes every listener", listenerLog.add - listenersBefore.add === listenerLog.remove - listenersBefore.remove,
  `added ${listenerLog.add - listenersBefore.add}, removed ${listenerLog.remove - listenersBefore.remove}`);

console.log(failures.length ? `\n${failures.length} FAILED: ${failures.join("; ")}` : "\nall checks passed");
process.exit(failures.length ? 1 : 0);
