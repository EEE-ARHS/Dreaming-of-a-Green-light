# Gatsby’s Dissolution

## Premise

A trembling sight frames Gatsby at the pool beneath the West Egg night sky. The player has one shot; after the click, the projectile and the moment unfold in slow motion. The scene favors a cinematic, non-graphic impact at the pool rather than depicting injury.

## Controls

- Move the mouse to aim; a strong, irregular sway keeps the sight unsteady.
- Left-click once to fire.
- The projectile travels slowly toward the aimed point. A hit creates a bright water-and-light burst; a miss ends the moment without impact.
- Escape returns to the chapter menu.

## Implementation

This chapter follows `chapters/template/` and the shared `Chapter` interface. The `assets/manifest.json` supplies selector copy and win/lose flavor. `index.ts` creates a chapter-owned Three.js group, installs pointer listeners only during play, restores the shared camera and scene settings on disposal, and removes its reticle and visual resources. No per-chapter renderer, frame loop, dependency, or persistent physics body is used.

The gun shake combines several sine oscillators with a small random firing offset. The shot follows a raised Bezier-like arc in slow motion. Pooled glowing particles handle muzzle and pool-contact effects.

## Run and verify

Select **GATSBY'S DISSOLUTION** in the chapter menu, move the mouse to aim, and left-click. Replay or abandon the chapter to verify camera, cursor, reticle, and pointer-listener cleanup. Build from the repository root with `npm run build --prefix frontend`.
