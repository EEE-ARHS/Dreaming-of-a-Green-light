import { chromium } from "playwright-core";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";

const CHROME = process.env.CHROME_PATH ?? "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const PORT = process.env.E2E_PORT ?? "5199";
const APP_URL = process.env.E2E_URL ?? `http://localhost:${PORT}/?visitTest`;
const server = spawn(process.execPath, ["node_modules/vite/bin/vite.js", "--port", PORT, "--strictPort"], {
  cwd: new URL("..", import.meta.url),
  stdio: "ignore",
});
let browser;

try {
  let ready = false;
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const response = await fetch(APP_URL);
      if (response.ok) { ready = true; break; }
    } catch { /* wait for Vite to start */ }
    await delay(500);
  }
  assert.equal(ready, true, `Vite should start on port ${PORT}`);

  browser = await chromium.launch({
    executablePath: CHROME,
    headless: true,
    args: ["--enable-gpu", "--use-angle=d3d11", "--ignore-gpu-blocklist"],
  });

  const page = await browser.newPage({ viewport: { width: 960, height: 600 } });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const sleep = (ms) => page.waitForTimeout(ms);
  const hud = () => page.evaluate(() => document.querySelector(".chapter01-progress-label")?.textContent ?? "");
  const click = () => page.evaluate(() => {
    document.querySelector("canvas")?.dispatchEvent(new MouseEvent("mousedown", { button: 0, bubbles: true }));
  });
  const hold = async (key, ms) => {
    await page.keyboard.down(key);
    await sleep(ms);
    await page.keyboard.up(key);
    await sleep(140);
  };
  const crosshair = () => page.evaluate(() => ({
    target: document.getElementById("crosshair")?.classList.contains("is-interactive") ?? false,
    holding: document.getElementById("crosshair")?.classList.contains("is-grabbing") ?? false,
    locked: document.getElementById("crosshair")?.classList.contains("is-locked") ?? false,
  }));

  await page.goto(APP_URL, { waitUntil: "load" });
  await page.locator("#playButton").click({ timeout: 90000 });
  const cards = page.locator(".chapter-card");
  assert.equal(await cards.count(), 6, "The chapter selector should show the six playable stories");
  const storyOrder = [];
  for (let i = 0; i < await cards.count(); i += 1) {
    storyOrder.push((await cards.nth(i).locator(".chapter-card-top").textContent())?.match(/CHAPTER [IVX]+/)?.[0]);
  }
  assert.deepEqual(storyOrder, ["CHAPTER I", "CHAPTER IV", "CHAPTER VI", "CHAPTER VII", "CHAPTER XV", "CHAPTER XVI"], "Playable chapters should follow their places in the story");
  const visitCard = cards.filter({ hasText: "THE VISIT" });
  assert.equal(await visitCard.count(), 1, "The Visit should be available from chapter select");
  await visitCard.click();
  await page.locator(".chapter-enter-button").click();
  await page.mouse.move(480, 300);
  await page.waitForFunction(
    () => (document.querySelector(".chapter01-progress-label")?.textContent ?? "").startsWith("MOW THE LAWN"),
    null,
    { timeout: 180000 },
  );

  await page.mouse.click(480, 300);
  await page.waitForFunction(() => document.pointerLockElement?.tagName === "CANVAS", null, { timeout: 5000 });
  await page.waitForFunction(() => document.getElementById("crosshair")?.classList.contains("is-locked"), null, { timeout: 5000 });
  assert.equal((await crosshair()).locked, true, "The crosshair should show pointer lock after the first click");    const yawBefore = await page.evaluate(() => window.__visit.playerYaw);
  await page.evaluate(() => window.dispatchEvent(new MouseEvent("mousemove", { movementX: 90, movementY: 24, bubbles: true })));
  await page.waitForFunction((yaw) => window.__visit.playerYaw !== yaw, yawBefore, { timeout: 5000 });
  assert.notEqual(await page.evaluate(() => window.__visit.playerYaw), yawBefore, "Mouse movement should steer the camera while locked");

  // Mow the backyard with overlapping rows; The Visit requires a complete cut before daisies.
  await page.evaluate(() => { window.__visit.playerYaw = 0; window.__visit.playerPitch = 0; });
  await hold("w", 900);
  await page.evaluate(() => { window.__visit.playerYaw = -Math.PI / 2; });
  await hold("w", 1200);
  for (let lane = 0; lane < 9 && (await hud()).startsWith("MOW THE LAWN"); lane += 1) {
    const heading = lane % 2 === 0 ? Math.PI / 2 : -Math.PI / 2;
    await page.evaluate((yaw) => { window.__visit.playerYaw = yaw; }, heading);
    await hold("w", 2700);
    if ((await hud()).startsWith("MOW THE LAWN") && lane < 8) await hold(lane % 2 === 0 ? "a" : "d", 240);
  }
  assert.match(await hud(), /^DAISIES · 0\/6$/, "Walking the rows should finish the mowing phase");

  await page.evaluate(() => {
    const game = window.__visit;
    game.player.resumeWalking({ x: 3.8, y: 0.06, z: 11.8 }, 0);
    game.playerYaw = 0;
    game.playerPitch = 0;
    game.updatePlayerCamera();
  });

  const inspect = () => page.evaluate(() => {
    const game = window.__visit;
    return {
      player: game.player.position.toArray(),
      flowers: game.flowers.flatMap((flower, index) => flower.parent === game.gameRoot
        ? [{ index, point: [flower.position.x, flower.position.y + 0.48, flower.position.z] }]
        : []),
      spots: game.spots.flatMap((spot, index) => !spot.flower
        ? [{ index, point: [spot.root.position.x, 0.55, spot.root.position.z] }]
        : []),
    };
  });
  const aimAt = async (point, kind, index) => page.evaluate(({ point: targetPoint, expectedKind, expectedIndex }) => {
    const game = window.__visit;
    const dx = targetPoint[0] - game.player.position.x;
    const dz = targetPoint[2] - game.player.position.z;
    const bearing = Math.atan2(-dx, -dz);
    const targetPitch = Math.atan2(targetPoint[1] - (game.player.position.y + 1.62), Math.hypot(dx, dz));
    for (let pitch = targetPitch - 0.06; pitch <= targetPitch + 0.06; pitch += 0.004) {
      for (let yaw = bearing - 0.3; yaw <= bearing + 0.3; yaw += 0.003) {
        game.playerYaw = yaw;
        game.playerPitch = pitch;
        game.updatePlayerCamera();
        game.ctx.scene.updateMatrixWorld(true);
        game.ctx.camera.updateMatrixWorld(true);
        const target = game.raycastFlowerTarget();
        const kind = target?.flower ? "flower" : target?.spot ? "spot" : null;
        const index = target?.flower ? target.flower.userData.daisySourceIndex : target?.spot ? game.spots.indexOf(target.spot) : -1;
        if (kind === expectedKind && index === expectedIndex) {
          game.updateFlowerCrosshair();
          return true;
        }
      }
    }
    return false;
  }, { point, expectedKind: kind, expectedIndex: index });

  for (let index = 0; index < 6; index += 1) {
    const flower = (await inspect()).flowers[0];
    assert.ok(flower, `Daisy ${index + 1} should still be available`);
    assert.equal(await aimAt(flower.point, "flower", flower.index), true, `Reticle should target daisy ${index + 1}`);
    await click();
    await sleep(100);
    assert.equal((await crosshair()).holding, true, "Left click should pick up the targeted daisy");

    let placed = false;
    for (const spot of (await inspect()).spots) {
      if (!await aimAt(spot.point, "spot", spot.index)) continue;
      await click();
      await sleep(140);
      const label = await hud();
      if (label === (index === 5 ? "THE GARDEN" : `DAISIES · ${index + 1}/6`)) {
        placed = true;
        break;
      }
    }
    assert.equal(placed, true, `Left click should place daisy ${index + 1} in an outlined vase`);
    assert.equal((await crosshair()).holding, false, "Successful placement should release the daisy");
  }

  assert.equal(await hud(), "THE GARDEN", "All daisies should be placed and complete the chapter");
  assert.equal((await crosshair()).locked, false, "Completing the chapter should release pointer lock");
  assert.deepEqual(errors, [], "The browser run should not emit uncaught JavaScript errors");
  console.log("PASS The Visit browser playthrough: mouse pointer lock, mow 100%, pick up and place all 6 daisies");
} finally {
  await browser?.close();
  server.kill();
}
