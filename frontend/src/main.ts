import * as THREE from "three";
import "./three-compat";
import { ArcadePhysics, FreeCamera, Mesh, PhysicsAggregate } from "./three-compat";
import { PhysicsShapeType } from "./physics";
import "./style.css";
import "../../title-screen/assets/title-screen.css";
import { createWorld, type World } from "./world";
import { Car } from "./car";
import { Myrtle } from "./ragdoll";
import { GameAudio } from "./audio";
import { MINI_GAMES, type MiniGameDef } from "./games/registry";
import type { MiniGame, MiniGameContext, MiniGameOutcome, PointerInput } from "./games/types";
import { ENGINE_CONFIG } from "./config";

function el<T extends HTMLElement>(id: string): T {
  const node = document.getElementById(id);
  if (!node) throw new Error(`Missing #${id} in index.html`);
  return node as T;
}
const canvas = el<HTMLCanvasElement>("game");
const hud = el("hud");
const speedValue = el("speedValue");
const gearValue = el("gearValue");
const distanceValue = el("distanceValue");
const physicsMeta = el("physicsMeta");
const subtitle = el("subtitle");
const flash = el("flash");
const letterbox = el("letterbox");
const menuScreen = el("menuScreen");
const pickScreen = el("pickScreen");
const pickSlot = el("pickSlot");
const pickBlurb = el("pickBlurb");
const commandWord = el("pickCommand");
const commandCount = el("pickClock");
const commandHow = el("pickHow");
const resultScreen = el("resultScreen");
const resultStamp = el("resultStamp");
const endingKicker = el("endingKicker");
const endingTitle = el("endingTitle");
const endingBody = el("endingBody");
const endingQuote = el("endingQuote");
const endingCite = el("endingCite");
const loadHint = el("loadHint");
const titleStatus = el("titleStatus");
const loadingScreen = el("loadingScreen");
const loaderNote = loadingScreen.querySelector<HTMLElement>(".fineprint");
if (loaderNote) loaderNote.textContent = "Loading Three.js scene…";
const timerFill = el("timerFill");
const audio = new GameAudio();
let loadingWatchdog: number | undefined;
const playButton = el<HTMLButtonElement>("playButton");
playButton.disabled = true;

let engine: THREE.WebGLRenderer;
let scene: THREE.Scene;
let physics: ArcadePhysics;
let world: World;
let car: Car;
let myrtle: Myrtle;
let camera: FreeCamera;
let ctx: MiniGameContext;
const keys = new Set<string>();
const keyListeners = new Set<(key: string) => void>();
function emitKey(key: string) { keys.add(key); for (const handler of keyListeners) handler(key); }

// Mouse-driven steering. Positive steer means game-right. The shell writes
// the current pointer steer plus a constant random oscillation into this each
// frame, so the wheel is always moving a little.
const pointer: PointerInput = { steer: 0 };
let pointerX = 0.5;            // normalized mouse X across the window (0..1)
let pointerInside = false;
let wanderTarget = 0;

const menuGameButtons = Array.from(menuScreen.querySelectorAll<HTMLButtonElement>("[data-game]"));
  const MENU_RENDER_INTERVAL = ENGINE_CONFIG.ui.menuRenderInterval;
type ShellPhase = "boot" | "menu" | "pickCommand" | "countIn" | "playing" | "result";
let shell: ShellPhase = "boot";
let captionTimer = 0;
const captionQueue: { text: string; hold: number }[] = [];
let currentGame: MiniGame | null = null;
let playingGame: MiniGame | null = null;
let clockRemaining = 0;
let lastDef: MiniGameDef | null = null;

function say(text: string, hold = 4.4, priority = false) {
  if (priority) { captionQueue.length = 0; showCaption(text, hold); return; }
  if (captionTimer > 0) { captionQueue.push({ text, hold }); return; }
  showCaption(text, hold);
}
function showCaption(text: string, hold: number) { captionTimer = hold; subtitle.textContent = text; subtitle.classList.add("show"); }
function feedCaptions(dt: number) {
  if (captionTimer > 0) { captionTimer -= dt; if (captionTimer > 0) return; }
  const next = captionQueue.shift();
  if (next) showCaption(next.text, next.hold);
  else { captionTimer = 0; subtitle.classList.remove("show"); subtitle.textContent = ""; }
}

async function boot(): Promise<void> {
  loadHint.textContent = "Preparing the Three.js engine…";
  loadingWatchdog = window.setTimeout(() => { titleStatus.textContent = "The 3D scene is taking longer than usual. Start will unlock when initialization finishes."; }, 10000);
  loadingScreen.classList.remove("is-open");
  engine = new THREE.WebGLRenderer({
    canvas,
    antialias: ENGINE_CONFIG.rendering.antialias,
    stencil: false,
    preserveDrawingBuffer: false,
    powerPreference: ENGINE_CONFIG.rendering.powerPreference
  });
  engine.setPixelRatio(Math.min(window.devicePixelRatio || 1, ENGINE_CONFIG.rendering.pixelRatioLimit));
  engine.setSize(window.innerWidth, window.innerHeight, false);
  engine.shadowMap.enabled = true;
  engine.shadowMap.type = THREE.PCFSoftShadowMap;
  engine.outputColorSpace = THREE.SRGBColorSpace;
  engine.toneMapping = THREE.ACESFilmicToneMapping;
  engine.toneMappingExposure = ENGINE_CONFIG.rendering.toneMappingExposure;

  scene = new THREE.Scene();
  physics = new ArcadePhysics();
  world = createWorld(scene, 1, physics);
  new PhysicsAggregate(new Mesh(new THREE.BoxGeometry(640, 1, 780)), PhysicsShapeType.BOX, { mass: 0, friction: 0.85, restitution: 0.05 }, physics);
  car = new Car(scene, physics);
  world.addShadowCaster(car.root);
  myrtle = new Myrtle(scene, physics);
  for (const part of myrtle.parts) world.addShadowCaster(part.mesh);
  physicsMeta.textContent = `THREE.JS · ${myrtle.bodyCount} P1 RAGDOLL PARTS · ${myrtle.jointCount} JOINTS · ${MINI_GAMES.length} MICROGAMES`;
  camera = new FreeCamera("driver", new THREE.Vector3(ENGINE_CONFIG.camera.driverPos.x, ENGINE_CONFIG.camera.driverPos.y, ENGINE_CONFIG.camera.driverPos.z), scene);
  camera.fov = ENGINE_CONFIG.camera.defaultFov;
  camera.setTarget(new THREE.Vector3(ENGINE_CONFIG.camera.driverTarget.x, ENGINE_CONFIG.camera.driverTarget.y, ENGINE_CONFIG.camera.driverTarget.z));
  ctx = {
    scene, engine, camera, physics, audio, world, car, myrtle, keys, pointer,
    dom: { hud, speedValue, gearValue, distanceValue, subtitle, flash, letterbox, titleFlash: (text) => say(text, 1.4, true) },
    onKey: (handler) => { keyListeners.add(handler); return () => { keyListeners.delete(handler); }; },
    say,
  };

  // Mouse position drives steering. Moving the pointer across the window left
  // to right steers the car left to right, with a constant random oscillation
  // superimposed on the wheel.
  window.addEventListener("mousemove", (event) => {
    pointerX = event.clientX / window.innerWidth;
    pointerInside = true;
  }, { passive: true });
  window.addEventListener("mouseenter", () => { pointerInside = true; });
  window.addEventListener("mouseleave", () => { pointerInside = false; });
  window.addEventListener("resize", () => {
    engine.setSize(window.innerWidth, window.innerHeight, false);
    camera.aspect = window.innerWidth / window.innerHeight; camera.updateProjectionMatrix();
  });
  if (loadingWatchdog !== undefined) window.clearTimeout(loadingWatchdog);
  window.addEventListener("keydown", (event) => {
    const key = event.key.toLowerCase();
    if ((key === "enter" || key === " ") && shell === "menu" && !playButton.disabled) { event.preventDefault(); const firstGame = MINI_GAMES.find((def) => !def.locked && def.create); if (firstGame) startPick(firstGame); }
    if (["arrowup", "arrowdown", "arrowleft", "arrowright", " "].includes(key)) event.preventDefault();
    if (event.repeat) { keys.add(key); return; }
    keys.add(key); emitKey(key);
    if (key === "m") { const muted = audio.toggleMuted(); say(muted ? "Sound off." : "Sound on.", 1.3, true); }
    if (key === "escape") {
      if (shell === "playing") { abandonGame(); goMenu(); }
      else if (shell === "pickCommand" || shell === "countIn" || shell === "result") goMenu();
    }
    if (key === "r" && shell === "playing") playAgain();
  });
  window.addEventListener("keyup", (event) => { keys.delete(event.key.toLowerCase()); });
  window.addEventListener("blur", () => keys.clear());
  for (const button of menuGameButtons) {
    const def = MINI_GAMES.find((item) => item.id === button.dataset.game);
    if (def && !def.locked && def.create) button.addEventListener("click", () => startPick(def));
  }
  resultScreen.querySelector<HTMLButtonElement>("#againButton")?.addEventListener("click", () => { if (lastDef) returnMainOrReplay(lastDef.id, true); });
  resultScreen.querySelector<HTMLButtonElement>("#menuButton")?.addEventListener("click", goMenu);
  engine.setAnimationLoop(render);
  goMenu();
  loadingScreen.classList.remove("is-open");
  window.setTimeout(() => loadingScreen.remove(), 1200);
  titleStatus.textContent = "Game ready. Steer with your mouse across the screen — the wheel never sits still.";
}

function goMenu() {
  shell = "menu"; menuScreen.classList.add("is-open"); pickScreen.classList.remove("is-open"); resultScreen.classList.remove("is-open");
  car?.reset(); myrtle?.reset();
  hud.classList.remove("live"); letterbox.classList.remove("on"); subtitle.classList.remove("show"); subtitle.textContent = "";
  flash.classList.remove("fire"); timerFill.style.width = "0%"; captionQueue.length = 0; captionTimer = 0;
  currentGame?.dispose(); currentGame = null; playingGame?.dispose(); playingGame = null;
}
function startPick(def: MiniGameDef) {
  if (def.locked || !def.create) return;
  lastDef = def; menuScreen.classList.remove("is-open"); pickScreen.classList.remove("is-open"); resultScreen.classList.remove("is-open");
  pickSlot.textContent = def.slot; pickBlurb.textContent = def.blurb; commandWord.textContent = def.command;
  commandHow.textContent = def.how; commandCount.textContent = "STARTING IN 5s"; commandHow.style.opacity = "1";
  pickScreen.classList.add("is-open"); commandPhaseAt = 0; countdownDigit = 5; commandWord.textContent = "5"; shell = "countIn";
  captionTimer = 0; subtitle.classList.remove("show");
}
let commandPhaseAt = 0;
let countdownDigit = 5;
function tickCommandPhase(dt: number) {
  if (shell !== "countIn" || !lastDef) return;
  commandPhaseAt += dt;
  if (commandPhaseAt >= 1) {
    commandPhaseAt -= 1;
    if (countdownDigit > 1) {
      countdownDigit--;
      commandWord.textContent = String(countdownDigit);
      commandCount.textContent = `STARTING IN ${countdownDigit}s`;
      commandWord.animate([{ transform: "scale(1.3)" }, { transform: "scale(1)" }], { duration: 180, easing: "ease-out" });
    } else {
      pickScreen.classList.remove("is-open"); startPlaying(lastDef.id);
    }
  }
}
function startPlaying(gameId: string) {
  const def = MINI_GAMES.find((item) => item.id === gameId);
  if (!def?.create || !lastDef) { goMenu(); return; }
  playingGame?.dispose(); currentGame?.dispose();
  const game = def.create(ctx); currentGame = game; playingGame = game; game.start();
  clockRemaining = def.duration; shell = "playing"; hud.classList.add("live"); letterbox.classList.add("on");
  subtitle.classList.remove("show"); timerFill.style.width = "100%"; timerFill.style.transition = "width 0.1s linear";
}
function playAgain() {
  if (!lastDef) return;
  playingGame?.dispose(); playingGame = null; currentGame = null;
  startPick(lastDef);
}
function abandonGame() { if (playingGame?.abandon) playingGame.abandon(); playingGame = null; }
function endGame(outcome: MiniGameOutcome) {
  playingGame?.dispose(); playingGame = null;
  const game = currentGame;
  if (!game) { hud.classList.remove("live"); letterbox.classList.remove("on"); timerFill.style.width = "0%"; shell = "result"; resultScreen.classList.add("is-open"); return; }
  const flavor = game.flavor(outcome === "win" ? "win" : "lose");
  endingKicker.textContent = flavor.kicker; endingTitle.textContent = flavor.title; endingBody.innerHTML = flavor.body;
  endingQuote.textContent = flavor.quote; endingCite.textContent = flavor.cite;
  resultStamp.textContent = outcome === "win" ? "NICE!" : "OOPS!"; resultStamp.className = "result-stamp " + (outcome === "win" ? "nice" : "oops");
  resultStamp.animate([{ transform: "scale(0.6)" }, { transform: "scale(1.15)" }, { transform: "scale(1)" }], { duration: 560, easing: "ease-out" });
  hud.classList.remove("live"); letterbox.classList.remove("on"); timerFill.style.width = "0%";
  window.setTimeout(() => { resultScreen.classList.add("is-open"); shell = "result"; }, 180);
}
function returnMainOrReplay(gameId: string, replay: boolean) {
  if (replay) { const def = MINI_GAMES.find((item) => item.id === gameId); if (def?.create) { startPick(def); return; } }
  goMenu();
}
let lastRender = performance.now();
let lastMenuRender = 0;
function render(now: number) {
  if (!engine || !scene || !camera) return;
  if (shell === "menu" && now - lastMenuRender < MENU_RENDER_INTERVAL) return;
  if (shell === "menu") lastMenuRender = now;
  const realDt = Math.min((now - lastRender) / 1000, 0.05); lastRender = now;
  if (realDt < 0.0005) return;

  // Update the pointer steer for this frame: mouse position sets the target,
  // a constant random oscillation is added on top, and steer eases toward the
  // result so the wheel is always jittering even when the mouse is still.
  if (shell === "playing") {
    const rawTarget = pointerInside ? (pointerX * 2 - 1) : 0;
    const wanderAmplitude = 0.14;
    wanderTarget += (Math.random() - 0.5) * 1.6 * realDt;
    wanderTarget = Math.max(-1, Math.min(1, wanderTarget));
    const wanderSteer = wanderTarget * wanderAmplitude;
    const targetSteer = Math.max(-1, Math.min(1, rawTarget + wanderSteer));
    const blend = 1 - Math.exp(-realDt * 18);
    pointer.steer += (targetSteer - pointer.steer) * blend;
  } else {
    pointer.steer = 0;
  }

  if (shell === "menu") {
    currentGame?.idle(realDt);
  } else if (shell === "countIn") {
    tickCommandPhase(realDt); if (playingGame) playingGame.idle(realDt);
  } else if (shell === "playing") {
    clockRemaining -= realDt;
    if (clockRemaining <= 0) { clockRemaining = 0; playingGame?.expire?.(); endGame("lose"); }
    else {
      timerFill.style.width = `${Math.max(0, clockRemaining / (lastDef?.duration ?? 1) * 100)}%`;
      const dt = Math.min(realDt, 1 / 12); physics.setTimeStep(dt);
      playingGame?.update(dt);
      if (playingGame && playingGame.outcome() !== "pending") endGame(playingGame.outcome());
      physics.step(); feedCaptions(realDt);
    }
  }
  engine.render(scene, camera);
}

boot().catch((error: unknown) => {
  if (loadingWatchdog !== undefined) window.clearTimeout(loadingWatchdog);
  console.error(error);
  const detail = error instanceof Error ? error.message : String(error);
  titleStatus.textContent = `The driving scene could not start: ${detail}. Refresh to retry.`;
  playButton.disabled = true; loadingScreen.classList.remove("is-open"); loadingScreen.remove(); menuScreen.classList.add("is-open");
});
