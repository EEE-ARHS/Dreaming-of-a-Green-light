import { SEA, createBoat, createProgressTracker, distanceToLight, strokePower, stepBoat, retreatLight, updateProgress } from "./water.ts";

/**
 * Tunnel the rowing rig through a full chapter with a deterministic rhythm so
 * the chapter's single promise — the light is never reached — can be checked
 * headlessly, repeatably, and without a renderer.
 */
function run(rate, cadence, secs) {
  const state = createBoat();
  const tracker = createProgressTracker(130);
  let stroke = 0;
  let lightZ = 130;
  let lz = 130;
  for (let t = 0; t < secs; t += 1 / 60) {
    const dt = 1 / 60;
    const scale = 0.6 * Math.min(rate, SEA.strokeRateCap) / SEA.strokeRateCap;
    const pull = Math.random() < cadence;
    const power = pull ? strokePower(scale, SEA.bladeDepth) : { thrust: 0, effort: 0 };
    const input = { thrust: power.thrust, effort: power.effort, trim: (Math.random() - 0.5) * 0.2 };
    stepBoat(state, input, lz, dt);
    lightZ = retreatLight(lz, distanceToLight(state, lz), dt);
    const d = distanceToLight(state, lightZ);
    const done = updateProgress(tracker, d, pull, dt);
    if (pull) stroke += dt;
    if (done) break;
  }
  return {
    time: tracker.time,
    best: tracker.best,
    finalDistance: distanceToLight(state, lightZ),
    stroke: stroke,
    maxSpeed: Math.max(0, state.vz),
    lightZ,
  };
}

for (const label of ["typical", "superhuman", "half-hearted", "idle"]) {
  const rate = label === "superhuman" ? 5 : label === "half-hearted" ? 1.3 : label === "idle" ? 0 : 3;
  const cadence = label === "idle" ? 0 : label === "superhuman" ? 1 : label === "half-hearted" ? 0.4 : 0.75;
  const trace = run(rate, cadence, 200);
  console.log(label, JSON.stringify(trace));
}
