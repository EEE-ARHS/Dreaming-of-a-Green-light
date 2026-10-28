import * as THREE from "three";
import type { Chapter, ChapterContext, ChapterFlavor, ChapterOutcome } from "../../frontend/src/chapters/types";
import { PhysicsAggregate } from "../../frontend/src/physics";
import manifest from "./assets/manifest.json";

/** Copy this directory, rename the class and id, then implement the chapter gameplay. */
export class TemplateChapter implements Chapter {
  readonly id = "templateChapter";
  readonly name = manifest.name;
  readonly blurb = manifest.blurb;
  readonly command = manifest.command;
  readonly how = manifest.how;
  readonly physicsScale = 1;

  private readonly ctx: ChapterContext;
  private outcomeState: ChapterOutcome = "pending";
  private readonly group = new THREE.Group();
  private readonly physicsAggregates: PhysicsAggregate[] = [];
  private readonly removeKeyHandler: () => void;

  constructor(ctx: ChapterContext) {
    this.ctx = ctx;
    this.removeKeyHandler = ctx.onKey((key) => this.handleKey(key));
  }

  start(): void {
    this.outcomeState = "pending";
    this.clearPhysics();
    this.clearVisuals();
    this.group.clear();
    this.ctx.scene.add(this.group);
    // Build this chapter's Three.js objects and prepare its gameplay here.
    // Example rigid body (track every aggregate so replay and disposal stay clean):
    // import { PhysicsAggregate, PhysicsShapeType } from "../../frontend/src/physics";
    // const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial());
    // mesh.position.set(0, 2, 0);
    // this.group.add(mesh);
    // this.physicsAggregates.push(new PhysicsAggregate(mesh, PhysicsShapeType.BOX,
    //   { mass: 1, friction: 0.5, restitution: 0.1 }, this.ctx.physics));
    this.ctx.say("Chapter started.", 2, true);
  }

  update(_dt: number): void {
    if (this.outcomeState !== "pending") return;
    // Run active-game simulation and update visuals using the frame delta.
  }

  idle(_dt: number): void {
    // Optional: gentle scene motion while the chapter is on the title menu.
  }

  abandon(): void {
    this.outcomeState = "pending";
  }

  outcome(): ChapterOutcome {
    return this.outcomeState;
  }

  flavor(outcome: "win" | "lose"): ChapterFlavor {
    return manifest.flavor[outcome];
  }

  dispose(): void {
    this.removeKeyHandler();
    this.clearPhysics();
    this.ctx.scene.remove(this.group);
    this.clearVisuals();
    this.group.clear();
  }

  private clearVisuals(): void {
    const textures = new Set<THREE.Texture>();
    this.group.traverse((object) => {
      const mesh = object as THREE.Mesh;
      mesh.geometry?.dispose();
      const materials = Array.isArray(mesh.material) ? mesh.material : mesh.material ? [mesh.material] : [];
      for (const material of materials) {
        for (const value of Object.values(material)) {
          if (value instanceof THREE.Texture) textures.add(value);
        }
        material.dispose();
      }
    });
    for (const texture of textures) texture.dispose();
  }

  private clearPhysics(): void {
    for (const aggregate of this.physicsAggregates.splice(0)) aggregate.dispose();
  }

  private handleKey(key: string): void {
    // Handle this chapter's key presses; do not leave global listeners installed.
    if (key === "escape") this.abandon();
  }
}
