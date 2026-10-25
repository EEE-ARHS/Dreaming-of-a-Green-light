import * as THREE from "three";
import gsap from "gsap";
import "./three-compat";
import { HavokPhysics } from "./physics";
import { createWorld, type World } from "./world";
import { Car } from "./car";
import { Myrtle } from "./ragdoll";
import { GameAudio } from "./audio";
import { CHAPTERS, type ChapterDef } from "./chapters/registry";
import type { Chapter, ChapterContext, ChapterOutcome, PointerInput } from "./chapters/types";
import { ENGINE_CONFIG } from "./config";

function el<T extends HTMLElement>(id: string): T {
  const node = document.getElementById(id);
  if (!node) throw new Error(`Missing #${id} in index.html`);
  return node as T;
}
const hud = el("hud");
const speedValue = el("speedValue");
const gearValue = el("gearValue");
const distanceValue = el("distanceValue");
const speedGauge = el("speedGauge");
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
const titleStatus = el("titleStatus");
const resultScreen = el("resultScreen");
const resultStamp = el("resultStamp");
const endingKicker = el("endingKicker");
const endingTitle = el("endingTitle");
const endingBody = el("endingBody");
const endingQuote = el("endingQuote");
const endingCite = el("endingCite");
const timerFill = el("timerFill");
const lowTimePulse = el("lowTimePulse");
const impactFlash = el("impactFlash");
const crateCounter = el("crateCounter");
const audio = new GameAudio();
let loadingWatchdog: number | undefined;
let lastDisplayedSpeed = -1;
let lastDisplayedGear = "";
let previousCarSpeed = 0;
let collisionCooldown = 0;
let impactCue: (strength: number) => void = () => undefined;
const speedTicker = { value: 0 };
const speedTickerTo = gsap.quickTo(speedTicker, "value", {
  duration: 0.24,
  ease: "power2.out",
  onUpdate: () => { speedValue.textContent = String(Math.round(speedTicker.value)); },
});

function uiDuration(seconds: number): number {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0.01 : seconds;
}

let engine: THREE.WebGLRenderer;
let scene: THREE.Scene;
let physics: HavokPhysics;
let world: World;
let car: Car;
let myrtle: Myrtle;
let camera: THREE.PerspectiveCamera;
let cameraXTo: ((value: number) => gsap.core.Tween) | undefined;
let cameraYTo: ((value: number) => gsap.core.Tween) | undefined;
let cameraZTo: ((value: number) => gsap.core.Tween) | undefined;
let cameraFovTo: ((value: number) => gsap.core.Tween) | undefined;
let aimXTo: ((value: number) => gsap.core.Tween) | undefined;
const cameraAim = { x: 0, y: 1.1, z: 8 };
const cameraMotionEnabled = !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
let ctx: ChapterContext;
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

const MENU_RENDER_INTERVAL = ENGINE_CONFIG.ui.menuRenderInterval;
type ShellPhase = "boot" | "menu" | "pickCommand" | "countIn" | "playing" | "result";
let shell: ShellPhase = "boot";
let captionTimer = 0;
const captionQueue: { text: string; hold: number }[] = [];
let currentChapter: Chapter | null = null;
let playingChapter: Chapter | null = null;
let clockRemaining = 0;
let lastDef: ChapterDef | null = null;

function showOverlay(element: HTMLElement, duration = 0.85) {
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const content = element.querySelectorAll<HTMLElement>(element.id === "resultScreen" ? ".deco > *" : ".pick-card > *");
  gsap.killTweensOf([element, ...content]);
  gsap.set(element, { visibility: "visible", pointerEvents: "auto" });
  const reveal = gsap.timeline();
  reveal.fromTo(element, { autoAlpha: 0, filter: reducedMotion ? "none" : "blur(8px)", scale: reducedMotion ? 1 : 0.985 }, { autoAlpha: 1, filter: "none", scale: 1, duration: reducedMotion ? 0.01 : duration, ease: "power3.out" });
  if (!reducedMotion && content.length) reveal.fromTo(content, { autoAlpha: 0, y: 18, filter: "blur(5px)" }, { autoAlpha: 1, y: 0, filter: "blur(0px)", duration: 0.65, stagger: 0.055, ease: "power3.out" }, 0.12);
}
function hideOverlay(element: HTMLElement, duration = 0.65) {
  gsap.killTweensOf(element);
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  gsap.to(element, { autoAlpha: 0, filter: reducedMotion ? "none" : "blur(8px)", scale: reducedMotion ? 1 : 1.01, duration: reducedMotion ? 0.01 : duration, ease: "power2.inOut", onComplete: () => gsap.set(element, { visibility: "hidden", pointerEvents: "none" }) });
}
function say(text: string, hold = 4.4, priority = false) {
  if (priority) { captionQueue.length = 0; showCaption(text, hold); return; }
  if (captionTimer > 0) { captionQueue.push({ text, hold }); return; }
  showCaption(text, hold);
}
function showCaption(text: string, hold: number) { const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches; captionTimer = hold; subtitle.textContent = text; gsap.killTweensOf(subtitle); gsap.fromTo(subtitle, { autoAlpha: 0, y: reducedMotion ? 0 : 8, filter: reducedMotion ? "none" : "blur(4px)" }, { autoAlpha: 1, y: 0, filter: "none", duration: uiDuration(0.55), ease: "power2.out" }); }
function feedCaptions(dt: number) {
  if (captionTimer > 0) { captionTimer -= dt; if (captionTimer > 0) return; }
  const next = captionQueue.shift();
  if (next) showCaption(next.text, next.hold);
  else { const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches; captionTimer = 0; gsap.to(subtitle, { autoAlpha: 0, y: reducedMotion ? 0 : -4, filter: reducedMotion ? "none" : "blur(3px)", duration: uiDuration(0.45), ease: "power2.in", onComplete: () => { subtitle.textContent = ""; } }); }
}

async function boot(initialChapterId: string, onReady: () => void): Promise<void> {
  loadingWatchdog = window.setTimeout(() => { titleStatus.textContent = "The 3D scene is taking longer than usual. It will continue initializing."; }, 10000);
  engine.outputColorSpace = THREE.SRGBColorSpace;
  engine.toneMapping = THREE.ACESFilmicToneMapping;
  engine.toneMappingExposure = ENGINE_CONFIG.rendering.toneMappingExposure;
  physics = await HavokPhysics.create();
  world = createWorld(scene, 1, physics);
  car = new Car(scene, physics);
  world.addShadowCaster(car.root);
  myrtle = new Myrtle(scene, physics);
  for (const part of myrtle.parts) world.addShadowCaster(part.mesh);
  physicsMeta.textContent = `THREE.JS · ${myrtle.bodyCount} P1 RAGDOLL PARTS · ${myrtle.jointCount} JOINTS · ${CHAPTERS.length} CHAPTERS`;
  if (!(camera instanceof THREE.PerspectiveCamera)) throw new Error("The R3F canvas requires a perspective camera.");
  camera.position.set(ENGINE_CONFIG.camera.driverPos.x, ENGINE_CONFIG.camera.driverPos.y, ENGINE_CONFIG.camera.driverPos.z);
  camera.fov = ENGINE_CONFIG.camera.defaultFov;
  camera.lookAt(ENGINE_CONFIG.camera.driverTarget.x, ENGINE_CONFIG.camera.driverTarget.y, ENGINE_CONFIG.camera.driverTarget.z);
  camera.updateProjectionMatrix();
  if (cameraMotionEnabled) {
    const cameraTween = { duration: 0.55, ease: "power2.out" as const, overwrite: true };
    cameraXTo = gsap.quickTo(camera.position, "x", cameraTween);
    cameraYTo = gsap.quickTo(camera.position, "y", cameraTween);
    cameraZTo = gsap.quickTo(camera.position, "z", cameraTween);
    cameraFovTo = gsap.quickTo(camera, "fov", { ...cameraTween, onUpdate: () => camera.updateProjectionMatrix() });
    aimXTo = gsap.quickTo(cameraAim, "x", cameraTween);
  }
  ctx = {
    scene, engine, camera, physics, audio, keys, pointer,
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
    camera.aspect = window.innerWidth / window.innerHeight; camera.updateProjectionMatrix();
  });
  if (loadingWatchdog !== undefined) window.clearTimeout(loadingWatchdog);
  window.addEventListener("keydown", (event) => {
    const key = event.key.toLowerCase();
    if (["arrowup", "arrowdown", "arrowleft", "arrowright", " "].includes(key)) event.preventDefault();
    if (event.repeat) { keys.add(key); return; }
    keys.add(key); emitKey(key);
    if (key === "m") { const muted = audio.toggleMuted(); say(muted ? "Sound off." : "Sound on.", 1.3, true); }
    if (key === "escape") {
      if (shell === "playing") { abandonChapter(); goMenu(); }
      else if (shell === "pickCommand" || shell === "countIn" || shell === "result") goMenu();
    }
    if (key === "r" && shell === "playing") playAgain();
  });
  window.addEventListener("keyup", (event) => { keys.delete(event.key.toLowerCase()); });
  window.addEventListener("blur", () => keys.clear());
  impactCue = playImpactFeedback;
  flash.addEventListener("gatsby:flash", () => impactCue(0.8));
  resultScreen.querySelector<HTMLButtonElement>("#againButton")?.addEventListener("click", () => { if (lastDef) returnMainOrReplay(lastDef.id, true); });
  resultScreen.querySelector<HTMLButtonElement>("#menuButton")?.addEventListener("click", () => window.dispatchEvent(new Event("gatsby:return-to-chapter-select")));
  const initialChapter = CHAPTERS.find((def) => def.id === initialChapterId);
  if (!initialChapter?.create) throw new Error(`Unknown or locked chapter: ${initialChapterId}`);
  lastDef = initialChapter;
  startPick(initialChapter);
  if (loadingWatchdog !== undefined) window.clearTimeout(loadingWatchdog);
  onReady();
}
function goMenu() {
  shell = "menu"; showOverlay(menuScreen); hideOverlay(pickScreen); hideOverlay(resultScreen);
  car?.reset(); myrtle?.reset();
  lastDisplayedSpeed = -1; lastDisplayedGear = ""; previousCarSpeed = 0; speedTicker.value = 0; speedValue.textContent = "0"; gearValue.textContent = "N";
  gsap.killTweensOf(speedTicker);
  gsap.to(hud, { autoAlpha: 0, y: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 12, duration: uiDuration(0.45), ease: "power2.inOut" }); gsap.to(letterbox.querySelectorAll("div"), { height: 0, duration: uiDuration(0.7), ease: "power2.inOut" }); gsap.to(subtitle, { autoAlpha: 0, duration: uiDuration(0.2), onComplete: () => { subtitle.textContent = ""; } });
  gsap.killTweensOf(crateCounter); gsap.to(crateCounter, { autoAlpha: 0, duration: uiDuration(0.2) });
  gsap.killTweensOf([flash, impactFlash, lowTimePulse, timerFill]);
  gsap.to(flash, { autoAlpha: 0, duration: uiDuration(0.12) }); gsap.to(impactFlash, { autoAlpha: 0, duration: uiDuration(0.12) });
  gsap.set([timerFill, lowTimePulse], { scaleX: 0, scale: 1, autoAlpha: 0, clearProps: "filter" }); captionQueue.length = 0; captionTimer = 0;
  currentChapter?.dispose(); currentChapter = null; playingChapter?.dispose(); playingChapter = null;
  window.dispatchEvent(new Event("gatsby:return-to-chapter-select"));
}
function startPick(def: ChapterDef) {
  if (def.locked || !def.create) return;
  lastDef = def; hideOverlay(menuScreen); hideOverlay(pickScreen); hideOverlay(resultScreen);
  pickSlot.textContent = def.slot; pickBlurb.textContent = def.blurb; commandWord.textContent = def.command;
  commandHow.textContent = def.how; commandCount.textContent = "STARTING IN 5s"; gsap.set(commandHow, { autoAlpha: 1 });
  lastDisplayedSpeed = -1;
  lastDisplayedGear = "";
  previousCarSpeed = 0;
  speedTicker.value = 0;
  speedValue.textContent = "0";
  gearValue.textContent = "N";
  gsap.set([speedValue, gearValue, distanceValue, speedGauge], { clearProps: "transform,filter" });
  showOverlay(pickScreen); commandPhaseAt = 0; countdownDigit = 5; commandWord.textContent = "5"; shell = "countIn";
  captionTimer = 0; gsap.to(subtitle, { autoAlpha: 0, duration: uiDuration(0.2) });
  const hudReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const hudItems = [hud.querySelector(".brand"), hud.querySelector(".gauges"), timerFill, hud.querySelector("footer")].filter((item): item is Element => item instanceof Element);
  gsap.killTweensOf([hud, ...hudItems]);
  gsap.fromTo(hud, { autoAlpha: 0, y: hudReducedMotion ? 0 : 10 }, { autoAlpha: 1, y: 0, duration: uiDuration(0.65), ease: "power2.out" });
  if (!hudReducedMotion) gsap.fromTo(hudItems, { autoAlpha: 0, y: 12 }, { autoAlpha: 1, y: 0, duration: 0.5, stagger: 0.08, ease: "power3.out" });
  gsap.to(letterbox.querySelectorAll("div"), { height: "8vh", duration: uiDuration(0.9), ease: "power3.out" });
  gsap.to(crateCounter, { autoAlpha: 0.82, duration: uiDuration(0.3) });
  gsap.killTweensOf([timerFill, lowTimePulse]); gsap.set(timerFill, { scaleX: 1, clearProps: "filter" }); gsap.set(lowTimePulse, { autoAlpha: 0, scale: 1 });
  clockRemaining = def.duration;
  playingChapter?.dispose(); currentChapter?.dispose();
  currentChapter = def.create(ctx); playingChapter = currentChapter; currentChapter.start();
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
      const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      gsap.fromTo(commandWord, { scale: reducedMotion ? 1 : 1.3, filter: reducedMotion ? "none" : "blur(3px)" }, { scale: 1, filter: "none", duration: uiDuration(0.3), ease: "power3.out" });
    } else {
      hideOverlay(pickScreen, 0.4); startChapter(lastDef.id);
    }
  }
}
function startChapter(chapterId: string) {
  if (!lastDef || lastDef.id !== chapterId || !playingChapter) { goMenu(); return; }
  playingChapter.start();
  clockRemaining = lastDef.duration; shell = "playing";
  const hudReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const hudItems = [hud.querySelector(".brand"), hud.querySelector(".gauges"), timerFill, hud.querySelector("footer")].filter((item): item is Element => item instanceof Element);
  gsap.killTweensOf([hud, ...hudItems]);
  gsap.fromTo(hud, { autoAlpha: 0, y: hudReducedMotion ? 0 : 10 }, { autoAlpha: 1, y: 0, duration: uiDuration(0.55), ease: "power2.out" });
  if (!hudReducedMotion) gsap.fromTo(hudItems, { autoAlpha: 0, y: 12 }, { autoAlpha: 1, y: 0, duration: 0.5, stagger: 0.08, ease: "power3.out" });
  gsap.to(letterbox.querySelectorAll("div"), { height: "8vh", duration: uiDuration(0.9), ease: "power3.out" });
  gsap.to(subtitle, { autoAlpha: 0, duration: uiDuration(0.2) });  gsap.set(timerFill, { scaleX: 1 });
}
function playAgain() {
  if (!lastDef) return;
  playingChapter?.dispose(); playingChapter = null; currentChapter = null;
  startPick(lastDef);
}
function abandonChapter() { if (playingChapter?.abandon) playingChapter.abandon(); playingChapter = null; }
function endGame(outcome: ChapterOutcome) {
  playingChapter?.dispose(); playingChapter = null;
  const chapter = currentChapter;
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (!chapter) { gsap.to(hud, { autoAlpha: 0, y: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 12, duration: uiDuration(0.4) }); gsap.to(letterbox.querySelectorAll("div"), { height: 0, duration: uiDuration(0.7), ease: "power2.inOut" }); gsap.set(timerFill, { scaleX: 0 }); shell = "result"; showOverlay(resultScreen); return; }
  const flavor = chapter.flavor(outcome === "win" ? "win" : "lose");
  endingKicker.textContent = flavor.kicker; endingTitle.textContent = flavor.title; endingBody.innerHTML = flavor.body;
  endingQuote.textContent = flavor.quote; endingCite.textContent = flavor.cite;
  resultStamp.textContent = outcome === "win" ? "NICE!" : "OOPS!";
  gsap.fromTo(resultStamp, { scale: reducedMotion ? 1 : 0.6, autoAlpha: reducedMotion ? 1 : 0, rotation: reducedMotion ? 0 : -3 }, { scale: 1, autoAlpha: 1, rotation: 0, textShadow: outcome === "win" ? "0 0 30px rgba(255,238,214,.4)" : "0 0 30px rgba(255,107,97,.4)", duration: uiDuration(0.75), ease: reducedMotion ? "none" : "back.out(1.6)" });
  const resultContent = resultScreen.querySelectorAll<HTMLElement>(".deco > *");
  if (!reducedMotion) gsap.fromTo(resultContent, { autoAlpha: 0, y: 18, filter: "blur(5px)" }, { autoAlpha: 1, y: 0, filter: "blur(0px)", duration: 0.65, stagger: 0.055, ease: "power3.out" });
  gsap.killTweensOf([timerFill, lowTimePulse]); gsap.set(lowTimePulse, { autoAlpha: 0, scale: 1 });
  gsap.to(hud, { autoAlpha: 0, y: reducedMotion ? 0 : 12, duration: uiDuration(0.45), ease: "power2.inOut" }); gsap.to(letterbox.querySelectorAll("div"), { height: 0, duration: uiDuration(0.7), ease: "power2.inOut" }); gsap.set(timerFill, { scaleX: 0 });
  showOverlay(resultScreen, 0.9); shell = "result";
}
function updateHudTelemetry(dt: number): void {
  if (!car || shell !== "playing") return;
  const mph = car.speedMph;
  const displayedSpeed = Math.round(mph);
  if (displayedSpeed !== lastDisplayedSpeed) {
    lastDisplayedSpeed = displayedSpeed;
    speedTickerTo(displayedSpeed);
    if (Math.abs(displayedSpeed - speedTicker.value) > 10) {
      gsap.fromTo(speedGauge, { scale: 1.12, filter: "brightness(1.5)" }, { scale: 1, filter: "brightness(1)", duration: uiDuration(0.4), ease: "back.out(2)", overwrite: true });
    }
  }
  const gear = car.speed < -0.3 ? "R" : mph < 0.4 ? "N" : mph > 42 ? "III" : mph > 18 ? "II" : "I";
  if (gear !== lastDisplayedGear) {
    lastDisplayedGear = gear;
    gearValue.textContent = gear;
    gsap.fromTo(gearValue, { scale: 1.35, y: -3, autoAlpha: 0.55 }, { scale: 1, y: 0, autoAlpha: 1, duration: uiDuration(0.32), ease: "back.out(2)", overwrite: true });
  }
  collisionCooldown = Math.max(0, collisionCooldown - dt);
  const deceleration = (previousCarSpeed - car.speed) / Math.max(dt, 0.001);
  if (collisionCooldown === 0 && previousCarSpeed > 4 && deceleration > 22) {
    collisionCooldown = 0.65;
    playImpactFeedback(Math.min(1, deceleration / 42));
  }
  previousCarSpeed = car.speed;
}

function playImpactFeedback(strength: number): void {
  gsap.killTweensOf([flash, impactFlash]);
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const impact = gsap.timeline();
  impact.fromTo(flash, { autoAlpha: reducedMotion ? 0.2 : 0.36 + strength * 0.34 }, { autoAlpha: 0, duration: uiDuration(0.42), ease: "power2.out" }, 0);
  if (!reducedMotion) {
    impact.fromTo(impactFlash, { autoAlpha: 0.35 + strength * 0.3, scale: 0.4 }, { autoAlpha: 0, scale: 1.35 + strength * 0.25, duration: 0.55, ease: "power2.out" }, 0);
    gsap.fromTo(hud, { x: -2 - strength * 2, y: 1 + strength }, { x: 0, y: 0, duration: 0.3, ease: "elastic.out(1,0.45)", overwrite: true });
    gsap.fromTo(speedGauge, { scale: 1.12 }, { scale: 1, duration: 0.4, ease: "back.out(2)", overwrite: true });
  }
}

function returnMainOrReplay(chapterId: string, replay: boolean) {
  if (replay) { const def = CHAPTERS.find((item) => item.id === chapterId); if (def?.create) { startPick(def); return; } }
  goMenu();
}
let lastMenuRender = 0;
function render(now: number, delta: number) {
  if (!engine || !scene || !camera) return;
  if (shell === "menu" && now - lastMenuRender < MENU_RENDER_INTERVAL) return;
  if (shell === "menu") lastMenuRender = now;
  const realDt = Math.min(delta, 0.05);
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

  if (cameraMotionEnabled && shell === "playing") {
    const speedRatio = Math.min(Math.abs(car?.speed ?? 0) / 31, 1);
    cameraXTo?.(ENGINE_CONFIG.camera.driverPos.x + pointer.steer * 0.22);
    cameraYTo?.(ENGINE_CONFIG.camera.driverPos.y + speedRatio * 0.07);
    cameraZTo?.(ENGINE_CONFIG.camera.driverPos.z - speedRatio * 0.28);
    cameraFovTo?.(ENGINE_CONFIG.camera.defaultFov + speedRatio * 2.2);
    aimXTo?.(ENGINE_CONFIG.camera.driverTarget.x + pointer.steer * 0.35);
    camera.lookAt(cameraAim.x, cameraAim.y, cameraAim.z);
  } else if (cameraMotionEnabled && shell !== "playing") {
    cameraXTo?.(ENGINE_CONFIG.camera.driverPos.x);
    cameraYTo?.(ENGINE_CONFIG.camera.driverPos.y);
    cameraZTo?.(ENGINE_CONFIG.camera.driverPos.z);
    cameraFovTo?.(ENGINE_CONFIG.camera.defaultFov);
    aimXTo?.(ENGINE_CONFIG.camera.driverTarget.x);
    camera.lookAt(cameraAim.x, cameraAim.y, cameraAim.z);
  }

  updateHudTelemetry(realDt);

  if (shell === "menu") {
    currentChapter?.idle(realDt);
  } else if (shell === "countIn") {
    tickCommandPhase(realDt); if (playingChapter) playingChapter.idle(realDt);
  } else if (shell === "playing") {
    clockRemaining -= realDt;
    if (clockRemaining <= 0) { clockRemaining = 0; playingChapter?.expire?.(); endGame("lose"); }
    else {
      const timeRatio = Math.max(0, clockRemaining / (lastDef?.duration ?? 1));
      gsap.set(timerFill, { scaleX: timeRatio });
      if (timeRatio <= 0.2 && !gsap.isTweening(lowTimePulse)) {
        gsap.to(lowTimePulse, { autoAlpha: 0.72, scale: 1.04, duration: uiDuration(0.48), yoyo: true, repeat: -1, ease: "sine.inOut" });
        gsap.to(timerFill, { filter: "brightness(1.8)", duration: uiDuration(0.4), yoyo: true, repeat: -1, ease: "sine.inOut" });
      } else if (timeRatio > 0.2 && gsap.isTweening(lowTimePulse)) {
        gsap.killTweensOf([lowTimePulse, timerFill]);
        gsap.set([lowTimePulse, timerFill], { clearProps: "filter,opacity,transform" });
      }
      const dt = Math.min(realDt, 1 / 30); physics.setTimeStep(dt);
      playingChapter?.update(dt);
      if (playingChapter && playingChapter.outcome() !== "pending") endGame(playingChapter.outcome());
      physics.step(); feedCaptions(realDt);
    }
  }
}

function handleStartupError(error: unknown): void {
  if (loadingWatchdog !== undefined) window.clearTimeout(loadingWatchdog);
  console.error(error);
  const detail = error instanceof Error ? error.message : String(error);
  titleStatus.textContent = `The driving scene could not start: ${detail}. Refresh to retry.`;
  showOverlay(menuScreen, 1.2);
}

export function startRuntime(state: { gl: THREE.WebGLRenderer; scene: THREE.Scene; camera: THREE.Camera }, initialChapterId: string, onReady: () => void): (now: number, delta: number) => void {
  engine = state.gl;
  scene = state.scene;
  if (!(state.camera instanceof THREE.PerspectiveCamera)) throw new Error("The R3F canvas requires a perspective camera.");
  camera = state.camera;
  window.addEventListener("error", (event) => handleStartupError(event.error ?? event.message), { once: true });
  void boot(initialChapterId, onReady).catch(handleStartupError);
  return render;
}
