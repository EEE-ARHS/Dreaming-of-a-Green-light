import { lazy, Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { createRoot } from "react-dom/client";
import "./style.css";
import "../../title-screen/assets/title-screen.css";

const RuntimeCanvas = lazy(() => import("./runtime-canvas").then(({ RuntimeCanvas }) => ({ default: RuntimeCanvas })));
const TitleScene = lazy(() => import("./title-scene").then(({ TitleScene }) => ({ default: TitleScene })));
gsap.registerPlugin(useGSAP);
const OPENING_CREDITS = ["GITHUB", "FREEBUFF", "COMPANY THREE", "COMPANY FOUR", "COMPANY FIVE"];
const CHAPTER_OPTIONS = [
  { id: "nicksHouse", slot: "CHAPTER 01", name: "NICK'S HOUSE", description: "Unpack Nick's car and bring his belongings inside his West Egg home.", locked: false },
  { id: "chapter02", slot: "CHAPTER 02", name: "????????", description: "A new chapter is taking shape.", locked: true },
  { id: "chapter03", slot: "CHAPTER 03", name: "????????", description: "A new chapter is taking shape.", locked: true },
  { id: "chapter04", slot: "CHAPTER 04", name: "????????", description: "A new chapter is taking shape.", locked: true },
  { id: "chapter05", slot: "CHAPTER 05", name: "????????", description: "A new chapter is taking shape.", locked: true },
  { id: "crashDrive", slot: "CHAPTER 06", name: "THE VALLEY OF ASHES", description: "The road from New York runs black through the Valley. Steer the yellow car through the crossing.", locked: false },
  { id: "chapter07", slot: "CHAPTER 07", name: "????????", description: "A new chapter is taking shape.", locked: true },
  { id: "chapter08", slot: "CHAPTER 08", name: "????????", description: "A new chapter is taking shape.", locked: true },
  { id: "chapter09", slot: "CHAPTER 09", name: "????????", description: "A new chapter is taking shape.", locked: true },
  { id: "chapter10", slot: "CHAPTER 10", name: "????????", description: "A new chapter is taking shape.", locked: true },
];

function App() {
  const rootRef = useRef<HTMLDivElement>(null);
  const [titleVisible, setTitleVisible] = useState(false);
  const [splashVisible, setSplashVisible] = useState(true);
  const [chapterSelectOpen, setChapterSelectOpen] = useState(false);
  const [chapterIndex, setChapterIndex] = useState(0);
  const [selectedChapter, setSelectedChapter] = useState<string | null>(null);
  const [isLoadingChapter, setIsLoadingChapter] = useState(false);
  const [chapterError, setChapterError] = useState("");
  const [chapterTransition, setChapterTransition] = useState<"idle" | "covering-game" | "covering-menu" | "revealing-game" | "revealing-menu">("idle");
  const pendingChapter = useRef<string | null>(null);

  useGSAP(() => {
    const root = rootRef.current;
    const grain = root?.querySelector<HTMLElement>("#grain");
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const credits = root?.querySelector<HTMLElement>("#creditsScreen");
    const creditsFade = root?.querySelector<HTMLElement>(".credits-fade-to-black");
    const ambientBlobs = root ? gsap.utils.toArray<HTMLElement>(".ambient-blob", root) : [];
    const ambientAnimations: gsap.core.Tween[] = [];
    let splashTimeline: gsap.core.Timeline | undefined;
    if (!reducedMotion && grain) ambientAnimations.push(gsap.to(grain, { x: "2%", y: "-2%", duration: 0.7, ease: "steps(3)", repeat: -1, yoyo: true }));
    if (reducedMotion || !credits || !creditsFade) {
      if (credits) gsap.set(credits, { autoAlpha: 0, visibility: "hidden", pointerEvents: "none" });
      setSplashVisible(false);
      setTitleVisible(true);
    } else {
      gsap.set(credits, { autoAlpha: 1, visibility: "visible", pointerEvents: "auto" });
      gsap.set(creditsFade, { autoAlpha: 0 });
      splashTimeline = gsap.timeline({ onComplete: () => {
        gsap.set(credits, { autoAlpha: 0, visibility: "hidden", pointerEvents: "none" });
        setSplashVisible(false);
        setTitleVisible(true);
      } });
      splashTimeline.to(creditsFade, { autoAlpha: 1, duration: 0.8, ease: "power2.inOut" }, 3);
    }
    if (root && !reducedMotion) {
      const drift = [
        { x: ["-7%", "16%"], y: ["-3%", "17%"], scale: [0.92, 1.14], duration: 19 },
        { x: ["9%", "-17%"], y: ["-4%", "15%"], scale: [1.08, 0.9], duration: 23 },
        { x: ["-8%", "13%"], y: ["4%", "-13%"], scale: [0.96, 1.12], duration: 27 },
      ];
      ambientBlobs.forEach((blob, index) => {
        const animation = drift[index];
        if (animation) ambientAnimations.push(gsap.fromTo(blob, { x: animation.x[0], y: animation.y[0], scale: animation.scale[0] }, { x: animation.x[1], y: animation.y[1], scale: animation.scale[1], duration: animation.duration, ease: "sine.inOut", repeat: -1, yoyo: true }));
      });
    }

    return () => {
      splashTimeline?.kill();
      ambientAnimations.forEach((animation) => animation.kill());
    };
  }, { scope: rootRef });

  useGSAP(() => {
    const root = rootRef.current;
    if (!root) return;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const motion = (seconds: number) => reducedMotion ? 0.01 : seconds;
    const title = root.querySelector<HTMLElement>("#menuScreen");
    const titleCopy = root.querySelector<HTMLElement>(".title-copy");
    const titleScene = root.querySelector<HTMLElement>(".title-scene-background");
    const chapterSelect = root.querySelector<HTMLElement>(".chapter-select");
    const heading = root.querySelector<HTMLElement>(".chapter-select-heading");
    const dotGrid = root.querySelector<HTMLElement>(".chapter-dot-grid");
    const close = root.querySelector<HTMLElement>(".chapter-select-close");
    const dots = gsap.utils.toArray<HTMLElement>(".chapter-dot", root);

    gsap.set(root.querySelectorAll(".chapter-dot"), { autoAlpha: 1 });

    if (title) {
      gsap.killTweensOf([title, titleCopy, titleScene]);
      if (titleVisible && !chapterSelectOpen && !selectedChapter) {
        gsap.set(title, { visibility: "visible", pointerEvents: "auto" });
        if (reducedMotion) {
          gsap.set([title, titleCopy, titleScene].filter(Boolean), { autoAlpha: 1, filter: "none", scale: 1, x: 0, y: 0 });
        } else {
          const intro = gsap.timeline();
          intro.fromTo(title, { autoAlpha: 0, filter: "blur(8px)" }, { autoAlpha: 1, filter: "blur(0px)", duration: motion(2.4), ease: "power2.inOut" });
          if (titleCopy) intro.fromTo(titleCopy, { autoAlpha: 0, filter: "blur(12px)", y: 18, scale: 0.84 }, { autoAlpha: 1, filter: "blur(0px)", y: 0, scale: 1, duration: motion(2.6), ease: "power3.out" }, 0.12);
          if (titleScene) intro.fromTo(titleScene, { autoAlpha: 0, scale: 1 }, { autoAlpha: 1, scale: 1.12, duration: motion(8), ease: "power2.out" }, 0);
        }
      } else if (titleVisible && (chapterSelectOpen || selectedChapter)) {
        gsap.set(title, { visibility: "visible", pointerEvents: "none" });
        if (reducedMotion) gsap.set([title, titleCopy, titleScene].filter(Boolean), { autoAlpha: 0, filter: "none", scale: 1, x: 0, y: 0, visibility: "hidden" });
        else gsap.to(title, { autoAlpha: 0, filter: "blur(6px)", duration: motion(0.75), ease: "power2.inOut", onComplete: () => gsap.set(title, { visibility: "hidden" }) });
      } else {
        gsap.set(title, { autoAlpha: 0, visibility: "hidden", pointerEvents: "none" });
      }
    }

    if (chapterSelect) {
      gsap.killTweensOf([chapterSelect, heading, dotGrid, ...dots]);
      if (chapterSelectOpen) {
        gsap.set(chapterSelect, { visibility: "visible", pointerEvents: "auto" });
        if (reducedMotion) {
          gsap.set(chapterSelect, { autoAlpha: 1, filter: "none", scale: 1 });
          gsap.set(heading, { autoAlpha: 1, filter: "none", y: 0 });
          gsap.set(dots, { autoAlpha: 1, filter: "none", y: 0, scale: 1 });
          gsap.set(dots.map((dot) => dot.querySelector("span")).filter(Boolean), { scale: 1, backgroundColor: "rgba(255,255,255,.28)" });
        } else {
          const reveal = gsap.timeline();
          reveal.fromTo(chapterSelect, { autoAlpha: 0, filter: "blur(8px)", scale: 1.015 }, { autoAlpha: 1, filter: "blur(0px)", scale: 1, duration: motion(1.15), ease: "power3.out" });
          if (heading) reveal.fromTo(heading, { autoAlpha: 0, filter: "blur(6px)", y: 12 }, { autoAlpha: 1, filter: "blur(0px)", y: 0, duration: motion(0.9), ease: "power3.out" }, 0.18);
          if (dotGrid) reveal.fromTo(dotGrid, { autoAlpha: 0, filter: "blur(6px)", y: 12 }, { autoAlpha: 1, filter: "blur(0px)", y: 0, duration: motion(0.95), ease: "power3.out" }, 0.3);
          if (dots.length) reveal.fromTo(dots, { scale: 0.72 }, { scale: 1, duration: motion(0.75), stagger: 0.055, ease: "back.out(1.5)" }, 0.42);
        }
      } else {
        gsap.set(chapterSelect, { visibility: "visible", pointerEvents: "none" });
        if (reducedMotion) gsap.set(chapterSelect, { autoAlpha: 0, filter: "none", scale: 1, visibility: "hidden" });
        else gsap.to(chapterSelect, { autoAlpha: 0, filter: "blur(8px)", scale: 1.015, duration: motion(0.7), ease: "power2.inOut", onComplete: () => gsap.set(chapterSelect, { visibility: "hidden" }) });
      }
    }
    if (chapterSelectOpen && close) {
      gsap.set(close, { visibility: "visible", pointerEvents: "auto" });
      gsap.fromTo(close, { autoAlpha: 0, scale: reducedMotion ? 1 : 0.82 }, { autoAlpha: 1, scale: 1, duration: reducedMotion ? 0.01 : 0.6, ease: "power3.out" });
    } else if (close) {
      gsap.set(close, { autoAlpha: 0, scale: 1 });
      gsap.set(close, { visibility: "hidden", pointerEvents: "none" });
    }
  }, { dependencies: [titleVisible, chapterSelectOpen, selectedChapter], scope: rootRef });

  useGSAP(() => {
    if (!chapterSelectOpen) return;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const dots = gsap.utils.toArray<HTMLElement>(".chapter-dot span", rootRef.current);
    const selectedDot = dots[chapterIndex];
    gsap.to(dots, {
      scale: 1,
      backgroundColor: "rgba(255,255,255,.28)",
      duration: reducedMotion ? 0.01 : 0.35,
      ease: "power2.out",
    });
    if (selectedDot) {
      gsap.fromTo(
        selectedDot,
        { scale: 0.75, backgroundColor: "rgba(255,255,255,.45)" },
        {
          scale: 1.45,
          backgroundColor: "rgba(255,255,255,.95)",
          duration: reducedMotion ? 0.01 : 0.55,
          ease: reducedMotion ? "none" : "back.out(2)",
        },
      );
    }
  }, { dependencies: [chapterIndex, chapterSelectOpen], scope: rootRef });

  const { contextSafe } = useGSAP({ scope: rootRef });
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const applyButtonVisualState = contextSafe((target: HTMLButtonElement) => {
      const disabled = target.disabled;
      const hovered = !disabled && target.matches(":hover");
      const focused = !disabled && target === document.activeElement;
      const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      if (target.matches(".chapter-dot, .chapter-select-close")) {
        gsap.set(target, { cursor: disabled ? "not-allowed" : "pointer", outline: "none", boxShadow: "none" });
        return;
      }
      gsap.set(target, { cursor: disabled ? "not-allowed" : "pointer", outlineStyle: focused ? "solid" : "none" });
      gsap.to(target, {
        autoAlpha: disabled ? 0.52 : 1,
        scale: hovered ? 1.025 : 1,
        borderColor: hovered ? "rgba(255,255,255,.72)" : "",
        backgroundColor: hovered && target.id !== "playButton" ? "rgba(215,185,112,.15)" : "",
        filter: hovered ? "brightness(1.15)" : "none",
        boxShadow: hovered ? "0 0 40px rgba(215,185,112,.18)" : "none",
        outlineColor: focused ? "rgba(242,231,207,.9)" : "transparent",
        duration: reducedMotion ? 0.01 : 0.3,
        ease: "power2.out",
        overwrite: true,
      });
    });
    const onPointerOver = contextSafe((event: PointerEvent) => {
      const target = event.target instanceof Element ? event.target.closest<HTMLButtonElement>("button") : null;
      if (!target || (event.relatedTarget instanceof Node && target.contains(event.relatedTarget))) return;
      applyButtonVisualState(target);
    });
    const onPointerOut = contextSafe((event: PointerEvent) => {
      const target = event.target instanceof Element ? event.target.closest<HTMLButtonElement>("button") : null;
      if (!target || (event.relatedTarget instanceof Node && target.contains(event.relatedTarget))) return;
      applyButtonVisualState(target);
    });
    const onFocusChange = contextSafe((event: FocusEvent) => {
      const target = event.target instanceof HTMLButtonElement ? event.target : null;
      if (target) applyButtonVisualState(target);
    });
    const disabledObserver = new MutationObserver(contextSafe((mutations: MutationRecord[]) => {
      for (const mutation of mutations) {
        if (mutation.target instanceof HTMLButtonElement) applyButtonVisualState(mutation.target);
      }
    }));
    const proximityGrid = root.querySelector<HTMLElement>(".chapter-dot-grid");
    const dots = proximityGrid ? gsap.utils.toArray<HTMLElement>(".chapter-dot span", proximityGrid) : [];
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const radius = 120;
    const scaleFactor = 1.8;
    const scales = dots.map((dot) => gsap.quickTo(dot, "scale", { duration: reducedMotion ? 0.01 : 0.35, ease: "power3.out" }));
    const onProximityMove = contextSafe((event: PointerEvent) => {
      if (!proximityGrid || reducedMotion || event.pointerType === "touch") return;
      const { clientX, clientY } = event;
      dots.forEach((dot, index) => {
        const bounds = dot.getBoundingClientRect();
        const distance = Math.hypot(clientX - (bounds.left + bounds.width / 2), clientY - (bounds.top + bounds.height / 2));
        const influence = gsap.utils.clamp(0, 1, 1 - distance / radius);
        scales[index]?.(1 + influence * (scaleFactor - 1));
      });
    });
    const resetProximity = contextSafe(() => scales.forEach((scale) => scale(1)));
    root.querySelectorAll<HTMLButtonElement>("button").forEach(applyButtonVisualState);
    disabledObserver.observe(root, { subtree: true, attributes: true, attributeFilter: ["disabled"] });
    root.addEventListener("pointerover", onPointerOver);
    root.addEventListener("pointerout", onPointerOut);
    root.addEventListener("focusin", onFocusChange);
    root.addEventListener("focusout", onFocusChange);
    proximityGrid?.addEventListener("pointermove", onProximityMove);
    proximityGrid?.addEventListener("pointerleave", resetProximity);
    return () => {
      disabledObserver.disconnect();
      root.removeEventListener("pointerover", onPointerOver);
      root.removeEventListener("pointerout", onPointerOut);
      root.removeEventListener("focusin", onFocusChange);
      root.removeEventListener("focusout", onFocusChange);
      proximityGrid?.removeEventListener("pointermove", onProximityMove);
      proximityGrid?.removeEventListener("pointerleave", resetProximity);
      scales.forEach((scale) => scale.tween.kill());
    };
  }, [contextSafe]);

  const returnToChapterSelect = useCallback(() => {
    setChapterTransition("covering-menu");
  }, []);
  useEffect(() => {
    window.addEventListener("gatsby:return-to-chapter-select", returnToChapterSelect);
    return () => window.removeEventListener("gatsby:return-to-chapter-select", returnToChapterSelect);
  }, [returnToChapterSelect]);

  const runtimeReady = useCallback(() => {
    setIsLoadingChapter(false);
    setChapterError("");
    setChapterSelectOpen(false);
    setChapterTransition("revealing-game");
  }, []);
  const runtimeFailed = useCallback((message: string) => {
    setIsLoadingChapter(false);
    setSelectedChapter(null);
    setChapterSelectOpen(true);
    setChapterError(`The 3D scene could not start: ${message}. Select a chapter to retry.`);
    setChapterTransition("revealing-menu");
  }, []);

  const chooseChapter = (chapterId: string) => {
    if (isLoadingChapter || chapterTransition !== "idle") return;
    setChapterError("");
    pendingChapter.current = chapterId;
    setChapterTransition("covering-game");
  };
  useGSAP(() => {
    const curtain = rootRef.current?.querySelector<HTMLElement>(".chapter-transition-curtain");
    if (!curtain || chapterTransition === "idle") return;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (chapterTransition === "covering-game" || chapterTransition === "covering-menu") {
      gsap.set(curtain, { autoAlpha: 0, visibility: "visible" });
      gsap.to(curtain, {
        autoAlpha: 1,
        duration: reducedMotion ? 0.01 : 0.55,
        ease: "power2.inOut",
        onComplete: () => {
          if (chapterTransition === "covering-game") {
            const chapterId = pendingChapter.current;
            if (!chapterId) { setChapterTransition("idle"); return; }
            setIsLoadingChapter(true);
            setSelectedChapter(chapterId);
          } else {
            setSelectedChapter(null);
            setIsLoadingChapter(false);
            setChapterSelectOpen(true);
            setChapterTransition("revealing-menu");
          }
        },
      });
      return;
    }
    gsap.set(curtain, { autoAlpha: 1, visibility: "visible" });
    gsap.to(curtain, {
      autoAlpha: 0,
      duration: reducedMotion ? 0.01 : 0.7,
      ease: "power2.inOut",
      onComplete: () => {
        gsap.set(curtain, { visibility: "hidden" });
        setChapterTransition("idle");
        pendingChapter.current = null;
      },
    });
  }, { dependencies: [chapterTransition], scope: rootRef });
  useGSAP(() => {
    const loading = rootRef.current?.querySelector<HTMLElement>('[data-transition-key="scene-loading"]');
    if (!loading) return;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    gsap.fromTo(loading, { autoAlpha: 0, y: reducedMotion ? 0 : 8 }, { autoAlpha: 1, y: 0, duration: reducedMotion ? 0.01 : 0.35, ease: "power2.out" });
    return () => {
      gsap.to(loading, { autoAlpha: 0, duration: reducedMotion ? 0.01 : 0.12 });
    };
  }, { dependencies: [isLoadingChapter], scope: rootRef, revertOnUpdate: true });

  useGSAP(() => {
    const status = rootRef.current?.querySelector<HTMLElement>('[data-transition-key="chapter-status"]');
    if (!status) return;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    gsap.fromTo(status, { autoAlpha: 0, y: reducedMotion ? 0 : 8 }, { autoAlpha: 1, y: 0, duration: reducedMotion ? 0.01 : 0.35, ease: "power2.out" });
  }, { dependencies: [chapterError], scope: rootRef, revertOnUpdate: true });

  const activeChapter = CHAPTER_OPTIONS[chapterIndex];
  const moveChapter = (direction: number) => {
    setChapterIndex((index) => Math.max(0, Math.min(CHAPTER_OPTIONS.length - 1, index + direction)));
  };

  return <div id="ui-root" ref={rootRef}>
    {selectedChapter && <Suspense fallback={null}><RuntimeCanvas key={selectedChapter} initialChapterId={selectedChapter} onReady={runtimeReady} onError={runtimeFailed} /></Suspense>}
    <div className="chapter-transition-curtain" aria-hidden="true" />
    <div id="grain" aria-hidden="true" />
    <div id="vignette" aria-hidden="true" />
    <div id="flash" aria-hidden="true" />
    <div id="impactFlash" aria-hidden="true" />
    <div id="letterbox" aria-hidden="true"><div /><div /></div>

    <main id="hud" className={selectedChapter === "nicksHouse" ? "first-person-hud" : ""}>
      <header>
        <div className="brand"><span className="brand-title">{selectedChapter === "nicksHouse" ? "NICK'S HOUSE" : "CHAPTERS"}</span><span className="brand-sub">{selectedChapter === "nicksHouse" ? "WEST EGG · 1922" : "THE VALLEY OF ASHES"}</span></div>
        <div className="gauges">
          <div className="speedo" id="speedGauge"><span id="speedValue">0</span><span className="unit">MPH</span></div>
          <div className="gauge-meta">
            <div><span id="gearValue">N</span><span className="dot">·</span><span id="distanceValue">148</span> m to Wilson's</div>
            <div id="physicsMeta" className="physics-meta">THREE.JS · 13 BODIES · 12 JOINTS · 7 CHAPTERS</div>
          </div>
        </div>
      </header>
      <div id="subtitle" role="status" aria-live="polite" />
      <div id="timerWrap"><div id="timerFill" /></div>
      <div id="lowTimePulse" aria-hidden="true" />
      <div id="crateCounter" className="crate-counter" role="status" aria-live="polite" />
      <div id="crosshair" aria-hidden="true" />
      <footer>
        <div className="chapter"><span className="chapter-no">CHAPTERS</span><span className="chapter-note">Silver-screen stories · Three.js</span></div>
        <div className="keys">{selectedChapter === "nicksHouse" ? <><span><b>WASD</b> walk</span><span><b>MOUSE</b> look</span><span><b>CLICK + DRAG</b> unpack</span><span><b>ESC</b> chapters</span></> : <><span><b>W / ↑</b> throttle</span><span><b>S / ↓</b> brake</span><span><b>A</b> right</span><span><b>D</b> left</span><span><b>SPACE</b> skid</span><span><b>C</b> view</span><span><b>R</b> replay</span><span><b>P</b> colliders</span><span><b>M</b> mute</span><span><b>ESC</b> menu</span></>}</div>
      </footer>
    </main>

    {splashVisible && <section id="creditsScreen" className="credits-screen" aria-hidden={!splashVisible} aria-label="Opening credits">
      <div className="credits-content">
        <div className="credits-grid">
          {OPENING_CREDITS.map((company) => <span className="credits-company" key={company}>{company}</span>)}
        </div>
      </div>
    </section>}

    {splashVisible && <section id="creditsScreen" className="credits-screen" aria-hidden={!splashVisible} aria-label="Opening credits">
      <div className="credits-grid">
        {OPENING_CREDITS.map((company) => <span className="credits-company" key={company}>{company}</span>)}
      </div>
      <div className="credits-fade-to-black" aria-hidden="true" />
    </section>}

    <section id="menuScreen" className="overlay title-screen" aria-hidden={!titleVisible || chapterSelectOpen || Boolean(selectedChapter)}>
      <div className="title-scene-background" aria-hidden="true">{titleVisible && !selectedChapter && <Suspense fallback={null}><TitleScene /></Suspense>}</div>
      <div className="title-layout"><div className="title-copy">
        <h1>THE GREAT GATSBY</h1><p className="title-subtitle">PLACEHOLDER</p>
        <button type="button" id="playButton" onClick={() => setChapterSelectOpen(true)}>START</button>
        <p id="titleStatus" className="fineprint" role="status" aria-live="polite">Select a chapter to begin.</p>
      </div></div>
    </section>

    <section className="chapter-select" aria-label="Chapter select" aria-hidden={!chapterSelectOpen} onKeyDown={(event) => {
      if (event.key === "ArrowLeft") { event.preventDefault(); moveChapter(-1); }
      if (event.key === "ArrowRight") { event.preventDefault(); moveChapter(1); }
      if (event.key === "ArrowUp") { event.preventDefault(); moveChapter(-4); }
      if (event.key === "ArrowDown") { event.preventDefault(); moveChapter(4); }
      if (event.key === "Escape") setChapterSelectOpen(false);
      if (event.key === "Enter" && !activeChapter.locked && !isLoadingChapter) chooseChapter(activeChapter.id);
    }}>
      <button type="button" className="chapter-select-close" aria-label="Back to title" onClick={() => setChapterSelectOpen(false)}>×</button>
      <header className="chapter-select-heading">
        <h2>CHAPTER SELECT</h2>
      </header>
      <div className="chapter-select-layout">
        <div className="chapter-dot-grid" role="group" aria-label="Choose a chapter. Use arrow keys to browse.">
          {CHAPTER_OPTIONS.map((chapter, index) => {
            const active = index === chapterIndex;
            return <button
              type="button"
              key={chapter.id}
              className={`chapter-dot${active ? " is-selected" : ""}${chapter.locked ? " is-locked" : " is-available"}`}
              style={{ "--dot-index": index } as React.CSSProperties}
              aria-pressed={active}
              aria-label={`${chapter.slot}: ${chapter.name}${chapter.locked ? ", coming soon" : ", available"}`}
              onClick={() => setChapterIndex(index)}
            ><span aria-hidden="true" /></button>;
          })}
        </div>
        <div className="chapter-dot-detail" aria-live="polite">
          <p className="chapter-dot-meta"><span>{activeChapter.slot}</span><i /><span>{activeChapter.locked ? "COMING SOON" : "AVAILABLE"}</span></p>
          <h3>{activeChapter.name}</h3>
          <p className="chapter-dot-description">{activeChapter.description}</p>
          <button type="button" className="chapter-dot-action" disabled={activeChapter.locked || isLoadingChapter} onClick={() => chooseChapter(activeChapter.id)}>
            {activeChapter.locked ? "COMING SOON" : isLoadingChapter ? "PREPARING…" : "ENTER CHAPTER"} <b aria-hidden="true">→</b>
          </button>
        </div>
      </div>
      {(chapterError || isLoadingChapter) && <p className="chapter-select-status" role={chapterError ? "alert" : "status"} data-transition-key="chapter-status">{chapterError || "Preparing the scene…"}</p>}
    </section>

    {isLoadingChapter && <div className="scene-loading" role="status" data-transition-key="scene-loading">Preparing your chapter…</div>}

    <section id="resultScreen" className="overlay" aria-live="polite">
      <div className="deco"><p id="endingKicker" className="kicker">THE VALLEY OF ASHES</p><h2 id="endingTitle">THE YELLOW CAR</h2><div className="deco-rule"><i /><span>✦</span><i /></div><p id="endingBody" className="copy" /><blockquote id="endingQuote" /><cite id="endingCite" /><div className="result-stamp" id="resultStamp">OOPS!</div><div className="ending-actions"><button type="button" id="againButton">PLAY AGAIN</button><button type="button" id="menuButton" className="ghost">ALL CHAPTERS</button></div></div>
    </section>
  </div>;
}

const rootElement = document.getElementById("root");
if (!rootElement) throw new Error("Missing #root mount point in index.html");
createRoot(rootElement).render(<App />);
