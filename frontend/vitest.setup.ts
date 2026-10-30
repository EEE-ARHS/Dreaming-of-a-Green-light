// The chapter modules look these HUD nodes up as soon as they are imported,
// so the test DOM has to exist before any chapter module is loaded.
const ids = [
  "hud", "speedValue", "gearValue", "distanceValue", "speedGauge", "physicsMeta",
  "subtitle", "flash", "letterbox", "menuScreen", "titleStatus", "resultScreen",
  "resultStamp", "endingKicker", "endingTitle", "endingBody", "endingQuote",
  "endingCite", "impactFlash", "crateCounter", "crosshair",
];

for (const id of ids) {
  const node = document.createElement("div");
  node.id = id;
  document.body.append(node);
}

if (!window.matchMedia) {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }),
  });
}
