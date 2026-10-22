import * as THREE from "three";
import { Vector3, Raycaster } from "three";
import type { MiniGameContext, MiniGameOutcome, MiniGameFlavor } from "../../frontend/src/games/types";
import manifest from "./assets/manifest.json";

export const id = "nicksHouse";
export const name = manifest.name;
export const blurb = manifest.blurb;
export const command = manifest.command;
export const how = manifest.how;
export const duration = manifest.duration;

export class NicksHouseGame {
  readonly id = id;
  readonly name = name;
  readonly blurb = blurb;
  readonly command = command;
  readonly how = how;
  readonly duration = duration;
  get physicsScale(): number { return 1; }

  private readonly ctx: MiniGameContext;
  private items: THREE.Mesh[] = [];
  private draggingItem: THREE.Mesh | null = null;
  private dragOffset = new Vector3();
  private won = false;
  private expired = false;
  private room: THREE.Group;

  constructor(ctx: MiniGameContext) {
    this.ctx = ctx;
    // Setup mouse interaction for dragging
    window.addEventListener("mousedown", this.onMouseDown);
    window.addEventListener("mousemove", this.onMouseMove);
    window.addEventListener("mouseup", this.onMouseUp);
  }

  start(): void {
    this.won = false;
    this.expired = false;
    this.items = [];

    // Create a simple room scene
    this.room = new THREE.Group();

    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(20, 20),
      new THREE.MeshStandardMaterial({ color: 0x888888 })
    );
    floor.rotation.x = -Math.PI / 2;
    this.room.add(floor);

    const wall1 = new THREE.Mesh(
      new THREE.PlaneGeometry(20, 10),
      new THREE.MeshStandardMaterial({ color: 0xaaaaaa })
    );
    wall1.position.set(0, 5, -10);
    this.room.add(wall1);

    this.ctx.scene.add(this.room);
    this.ctx.camera.position.set(0, 5, 10);
    this.ctx.camera.lookAt(0, 0, 0);

    // Spawn items to clear
    const itemColors = [0xbc8f8f, 0xdeb887, 0xd2b48c, 0xf5f5dc];
    for (let i = 0; i < 6; i++) {
      const size = 0.5 + Math.random();
      const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(size, size, size),
        new THREE.MeshStandardMaterial({ color: itemColors[i % itemColors.length] })
      );
      mesh.position.set(
        (Math.random() - 0.5) * 8,
        size / 2,
        (Math.random() - 0.5) * 8
      );
      mesh.userData.isItem = true;
      this.items.push(mesh);
      this.room.add(mesh);
    }
  }

  private onMouseDown = (event: MouseEvent) => {
    const mouse = new Vector3(
      (event.clientX / window.innerWidth) * 2 - 1,
      -(event.clientY / window.innerHeight) * 2 + 1,
      0.5
    );
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(mouse, this.ctx.camera);
    const intersects = raycaster.intersectObjects(this.items);

    if (intersects.length > 0) {
      this.draggingItem = intersects[0].object as THREE.Mesh;
      const intersectPoint = intersects[0].point;
      this.dragOffset.copy(this.draggingItem.position).sub(intersectPoint);
    }
  };

  private onMouseMove = (event: MouseEvent) => {
    if (!this.draggingItem) return;

    const mouse = new Vector3(
      (event.clientX / window.innerWidth) * 2 - 1,
      -(event.clientY / window.innerHeight) * 2 + 1,
      0.5
    );
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(mouse, this.ctx.camera);

    // Project movement onto the floor plane (y=0)
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    const targetPoint = new THREE.Vector3();
    raycaster.ray.intersectPlane(plane, targetPoint);

    if (targetPoint) {
      this.draggingItem.position.copy(targetPoint.add(this.dragOffset));

      // Check if item is dragged to the edge of the screen (simplification: boundary check)
      if (Math.abs(this.draggingItem.position.x) > 9 || Math.abs(this.draggingItem.position.z) > 9) {
        this.removeItem(this.draggingItem);
      }
    }
  };

  private onMouseUp = () => {
    this.draggingItem = null;
  };

  private removeItem(item: THREE.Mesh) {
    this.room.remove(item);
    this.items = this.items.filter(i => i !== item);
    if (this.items.length === 0) {
      this.won = true;
    }
  }

  update(dt: number): void {
    // No per-frame animation needed for simple dragging
  }

  idle(dt: number): void {
    // Menu state animation
  }

  abandon(): void {
    this.dispose();
  }

  expire(): void {
    this.expired = true;
  }

  outcome(): MiniGameOutcome {
    if (this.won) return "win";
    if (this.expired) return "lose";
    return "pending";
  }

  flavor(outcome: "win" | "lose"): MiniGameFlavor {
    const flavorText = manifest.flavor[outcome];
    return {
      kicker: flavorText.kicker,
      title: flavorText.title,
      body: flavorText.body,
      quote: flavorText.quote,
      cite: flavorText.cite,
    };
  }

  dispose(): void {
    window.removeEventListener("mousedown", this.onMouseDown);
    window.removeEventListener("mousemove", this.onMouseMove);
    window.removeEventListener("mouseup", this.onMouseUp);
    if (this.room) this.ctx.scene.remove(this.room);
  }
}
