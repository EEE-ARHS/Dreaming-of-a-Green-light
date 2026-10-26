# Building a Chapter Mini-game

Each playable chapter lives in its own directory under `chapters/`. Start by copying `chapters/template/` to a new folder named for the chapter (for example, `chapters/my-chapter/`). Keep chapter-only gameplay and assets in that folder so chapters can be developed independently.

## Folder layout

```text
chapters/
  my-chapter/
    index.ts             # Chapter class implementing the shared Chapter interface
    assets/
      manifest.json      # Menu metadata, instructions, duration and outcome copy
      ...                # Chapter-specific images, models, audio, etc.
```

## Create the chapter

1. Copy `chapters/template/` to `chapters/<chapter-name>/`.
2. Update `assets/manifest.json`: choose a unique `id`, chapter slot/name, concise blurb, objective, controls, duration, and win/lose flavor.
3. Rename `TemplateChapter` in `index.ts`, update its unique `id`, and implement the gameplay in `start`, `update`, and optionally `idle`.
4. Add meshes to a chapter-owned `THREE.Group`; dispose listeners, meshes, geometries, materials, textures, timers, and other resources in `dispose()`.
5. Use `ChapterContext` for the shared Three.js scene, camera, renderer, Havok world, audio, input, and DOM hooks. R3F owns the canvas/render loop; chapter objects belong in `ctx.scene`, and do not create a second renderer or animation loop. The runtime initializes one shared `ctx.physics` and steps it centrally during active play—do not call `step()` from a chapter.
6. Import `PhysicsAggregate`, `PhysicsConstraint`, and `PhysicsShapeType` from `../../frontend/src/physics` (adjust the relative path when moving the chapter). Bind a mesh with `new PhysicsAggregate(mesh, PhysicsShapeType.BOX, { mass: 1, friction: 0.5, restitution: 0.1 }, ctx.physics)`. Supported shapes are `BOX`, `CAPSULE`, and `SPHERE`; material options include mass, friction, restitution, radius, endpoints, and extents. A zero-mass aggregate is static; positive-mass aggregates are created animated so their first transform is synchronized, then can be switched to dynamic for simulation. Use `aggregate.body.setMotionType("dynamic" | "animated" | "static")` to change how a body is simulated, `setLinearVelocity()` / `setAngularVelocity()` to set velocity, and `setTransform(position, rotation)` to teleport it. For articulated bodies, create a `PhysicsConstraint`, then call `ctx.physics.addConstraint(parentAggregate.body, childAggregate.body, constraint)`; retain and dispose constraints yourself because the shared world does not own chapter constraints.
7. Keep a reference to every aggregate and constraint created by the chapter. Dispose them before disposing their meshes, geometries, or materials; this removes the bodies from the shared Havok world. The template demonstrates tracking aggregates and clearing them on replay and disposal. Subscribe to keys with `ctx.onKey` and call the returned unsubscribe function during cleanup. Use `ctx.say()` for captions.
8. Return `"pending"` until the chapter has a result, then return `"win"` or `"lose"`. Implement `expire()` for the timer and return the appropriate `ChapterFlavor` from `flavor()`. Keep `idle()` safe before a round starts, and make `start()` reset per-round state because the runtime may call it again when gameplay begins.

## Register it in the game

The chapter is not playable just because its folder exists. Add it to the active chapter registry in `frontend/src/chapters/registry.ts`:

- Import the class from `../../../chapters/<chapter-name>`.
- Import the manifest JSON from `../../../chapters/<chapter-name>/assets/manifest.json`.
- Add an unlocked `ChapterDef` using manifest fields and `create: (ctx) => new MyChapter(ctx)`.
- The chapter selector derives its metadata from the active registry; add the matching `ChapterDef` there to make it appear.

Do not import template code in the registry. Keep unimplemented menu entries locked until they have an implementation.

## Verify

From the project root, run:

```sh
npm run build --prefix frontend
```

Check that the chapter can be launched, replayed, expired, abandoned, and returned from without leaving duplicate event listeners, Havok bodies/constraints, or Three.js resources behind. Havok uses WebAssembly SIMD; unsupported browsers/devices (including iOS before 16.4) cannot initialize this physics backend.
