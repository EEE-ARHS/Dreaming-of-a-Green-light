import gsap from "gsap";

function el<T extends HTMLElement>(id: string): T {
  const node = document.getElementById(id);
  if (!node) throw new Error(`Missing #${id} in index.html`);
  return node as T;
}

export const hud = el("hud");
export const speedValue = el("speedValue");
export const gearValue = el("gearValue");
export const distanceValue = el("distanceValue");
export const speedGauge = el("speedGauge");
export const physicsMeta = el("physicsMeta");
export const subtitle = el("subtitle");
export const flash = el("flash");
export const letterbox = el("letterbox");
export const menuScreen = el("menuScreen");
export const titleStatus = el("titleStatus");
export const resultScreen = el("resultScreen");
export const resultStamp = el("resultStamp");
export const endingKicker = el("endingKicker");
export const endingTitle = el("endingTitle");
export const endingBody = el("endingBody");
export const endingQuote = el("endingQuote");
export const endingCite = el("endingCite");
export const timerFill = el("timerFill");
export const lowTimePulse = el("lowTimePulse");
export const impactFlash = el("impactFlash");
export const crateCounter = el("crateCounter");

export function uiDuration(seconds: number): number {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0.01 : seconds;
}

export function showOverlay(element: HTMLElement, duration = 0.85) {
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const content = element.querySelectorAll<HTMLElement>(element.id === "resultScreen" ? ".deco > *" : ".pick-card > *");
  gsap.killTweensOf([element, ...content]);
  gsap.set(element, { visibility: "visible", pointerEvents: "auto" });
  const reveal = gsap.timeline();
  reveal.fromTo(element, { autoAlpha: 0, filter: reducedMotion ? "none" : "blur(8px)", scale: reducedMotion ? 1 : 0.985 }, { autoAlpha: 1, filter: "none", scale: 1, duration: reducedMotion ? 0.01 : duration, ease: "power3.out" });
  if (!reducedMotion && content.length) reveal.fromTo(content, { autoAlpha: 0, y: 18, filter: "blur(5px)" }, { autoAlpha: 1, y: 0, filter: "blur(0px)", duration: 0.65, stagger: 0.055, ease: "power3.out" }, 0.12);
}

export function hideOverlay(element: HTMLElement, duration = 0.65) {
  gsap.killTweensOf(element);
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  gsap.to(element, { autoAlpha: 0, filter: reducedMotion ? "none" : "blur(8px)", scale: reducedMotion ? 1 : 1.01, duration: reducedMotion ? 0.01 : duration, ease: "power2.inOut", onComplete: () => gsap.set(element, { visibility: "hidden", pointerEvents: "none" }) });
}

export function showCaption(text: string, hold: number) {
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  void hold;
  subtitle.textContent = text;
  gsap.killTweensOf(subtitle);
  gsap.fromTo(subtitle, { autoAlpha: 0, y: reducedMotion ? 0 : 8, filter: reducedMotion ? "none" : "blur(4px)" }, { autoAlpha: 1, y: 0, filter: "none", duration: uiDuration(0.55), ease: "power2.out" });
}

export function feedCaptions(dt: number, state: { captionTimer: number; captionQueue: { text: string; hold: number }[] }) {
  if (state.captionTimer > 0) {
    state.captionTimer -= dt;
    if (state.captionTimer > 0) return;
  }
  const next = state.captionQueue.shift();
  if (next) {
    showCaption(next.text, next.hold);
    state.captionTimer = next.hold;
  } else {
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    state.captionTimer = 0;
    gsap.to(subtitle, { autoAlpha: 0, y: reducedMotion ? 0 : -4, filter: reducedMotion ? "none" : "blur(3px)", duration: uiDuration(0.45), ease: "power2.in", onComplete: () => { subtitle.textContent = ""; } });
  }
}
