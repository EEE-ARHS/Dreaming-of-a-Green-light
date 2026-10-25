import * as THREE from "three";
import type { ChapterContext, ChapterFlavor, ChapterOutcome } from "../../frontend/src/chapters/types";
import { RigidBox, simulate } from "./crates";
import manifest from "./assets/manifest.json";

export const id = "nicksHouse";
export const name = manifest.name;
export const blurb = manifest.blurb;
export const command = manifest.command;
export const how = manifest.how;
export const duration = manifest.duration;

/** Half the footprint of the little house, in metres. The front is open to the camera. */
const ROOM_HALF = 4;
const ROOM_HEIGHT = 3;
const DOOR_HALF = 1.15;
const DOOR_HEIGHT = 2.3;
const THRESHOLD_Z = -ROOM_HALF - 0.45;
const CARRY_Y = 0.9;

const CRATE_SPECS: { size: number; x: number; z: number }[] = [
  { size: 1.05, x: 1.7, z: 2.6 },
  { size: 1.0, x: -2.6, z: 2.2 },
  { size: 0.95, x: -2.5, z: 0.1 },
  { size: 0.85, x: -1.2, z: 2.9 },
  { size: 0.8, x: 2.7, z: 1.4 },
  { size: 0.75, x: 0.2, z: 2.4 },
  { size: 0.7, x: -0.3, z: 1.0 },
];

interface Crate {
  mesh: THREE.Mesh<THREE.BoxGeometry, THREE.MeshStandardMaterial>;
  body: RigidBox;
  size: number;
  spawn: THREE.Vector3;
}

function makeTexture(paint: (ctx: CanvasRenderingContext2D, size: number) => void): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("2D canvas unavailable for Nick's House textures");
  paint(ctx, 256);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.anisotropy = 4;
  return texture;
}

function wallpaperTexture(): THREE.CanvasTexture {
  const texture = makeTexture((ctx, size) => {
    ctx.fillStyle = "#7b7157";
    ctx.fillRect(0, 0, size, size);
    for (let y = 0; y < size; y += 4) {
      ctx.fillStyle = `rgba(52,48,36,${0.03 + (y % 8 === 0 ? 0.03 : 0)})`;
      ctx.fillRect(0, y, size, 1);
    }
    const step = 64;
    for (let gy = 0; gy < size; gy += step) {
      for (let gx = 0; gx < size; gx += step) {
        const cx = gx + step / 2;
        const cy = gy + step / 2;
        ctx.fillStyle = "rgba(104,94,68,0.55)";
        ctx.beginPath();
        ctx.moveTo(cx, cy - 20);
        ctx.lineTo(cx + 14, cy);
        ctx.lineTo(cx, cy + 20);
        ctx.lineTo(cx - 14, cy);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = "rgba(186,168,126,0.35)";
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.fillStyle = "rgba(196,178,134,0.5)";
        for (const angle of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
          ctx.beginPath();
          ctx.ellipse(cx + Math.cos(angle) * 22, cy + Math.sin(angle) * 22, 4, 2.2, angle, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.fillStyle = "rgba(64,56,40,0.5)";
        ctx.fillRect(cx - 1.5, cy - 1.5, 3, 3);
      }
    }
  });
  texture.repeat.set(2, 1);
  return texture;
}

function floorTexture(): THREE.CanvasTexture {
  const texture = makeTexture((ctx, size) => {
    ctx.fillStyle = "#5b4028";
    ctx.fillRect(0, 0, size, size);
    for (let x = 0; x < size; x += 42) {
      ctx.fillStyle = "rgba(26,17,10,0.55)";
      ctx.fillRect(x, 0, 2, size);
      for (let i = 0; i < 22; i++) {
        ctx.fillStyle = `rgba(${60 + Math.random() * 40},${40 + Math.random() * 26},${22 + Math.random() * 16},0.35)`;
        const y = Math.random() * size;
        ctx.fillRect(x + 3, y, 34 + Math.random() * 5, 1);
      }
    }
    for (let i = 0; i < 260; i++) {
      ctx.fillStyle = `rgba(28,18,10,${0.08 + Math.random() * 0.18})`;
      ctx.fillRect(Math.random() * size, Math.random() * size, 1 + Math.random() * 2, 1);
    }
  });
  texture.repeat.set(2.5, 2.5);
  return texture;
}

function rugTexture(): THREE.CanvasTexture {
  const texture = makeTexture((ctx, size) => {
    ctx.fillStyle = "#5f2c2f";
    ctx.fillRect(0, 0, size, size);
    ctx.strokeStyle = "#a8885a";
    ctx.lineWidth = 6;
    ctx.strokeRect(12, 12, size - 24, size - 24);
    ctx.strokeStyle = "rgba(168,136,90,0.55)";
    ctx.lineWidth = 2;
    ctx.strokeRect(26, 26, size - 52, size - 52);
    ctx.fillStyle = "rgba(196,168,116,0.6)";
    for (let i = 0; i < 4; i++) {
      const cx = size / 2 + (i % 2 === 0 ? -44 : 44);
      const cy = size / 2 + (i < 2 ? -40 : 40);
      ctx.beginPath();
      ctx.moveTo(cx, cy - 22);
      ctx.lineTo(cx + 18, cy);
      ctx.lineTo(cx, cy + 22);
      ctx.lineTo(cx - 18, cy);
      ctx.closePath();
      ctx.fill();
    }
    ctx.fillStyle = "rgba(90,40,42,0.85)";
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, 16, 0, Math.PI * 2);
    ctx.fill();
  });
  texture.repeat.set(1, 1);
  return texture;
}

function crateTexture(): THREE.CanvasTexture {
  const texture = makeTexture((ctx, size) => {
    ctx.fillStyle = "#8a6437";
    ctx.fillRect(0, 0, size, size);
    for (let x = 0; x < size; x += 52) {
      ctx.fillStyle = "rgba(46,28,13,0.5)";
      ctx.fillRect(x, 0, 3, size);
      for (let i = 0; i < 18; i++) {
        ctx.fillStyle = `rgba(${120 + Math.random() * 40},${88 + Math.random() * 30},${52 + Math.random() * 20},0.35)`;
        ctx.fillRect(x + 5, Math.random() * size, 44, 1.5);
      }
    }
    ctx.fillStyle = "rgba(40,26,14,0.8)";
    ctx.fillRect(0, 0, size, 6);
    ctx.fillRect(0, size - 6, size, 6);
    ctx.fillRect(0, 0, 6, size);
    ctx.fillRect(size - 6, 0, 6, size);
    ctx.fillStyle = "rgba(52,36,20,0.85)";
    for (const [x, y] of [[16, 16], [size - 22, 16], [16, size - 22], [size - 22, size - 22]] as const) {
      ctx.beginPath();
      ctx.arc(x, y, 3.5, 0, Math.PI * 2);
      ctx.fill();
    }
  });
  texture.repeat.set(1, 1);
  return texture;
}

export class NicksHouseChapter {
  readonly id = id;
  readonly name = name;
  readonly blurb = blurb;
  readonly command = command;
  readonly how = how;
  readonly duration = duration;
  readonly physicsScale = 1;

  private readonly ctx: ChapterContext;
  private readonly raycaster = new THREE.Raycaster();
  private readonly pointerNdc = new THREE.Vector2();
  private readonly dragPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -CARRY_Y);
  private readonly dragOffset = new THREE.Vector3();
  private readonly dragPoint = new THREE.Vector3();
  private readonly dragTarget = new THREE.Vector3();
  private readonly previousTarget = new THREE.Vector3();
  private readonly dragVelocity = new THREE.Vector3();
  private readonly savedCameraPosition = new THREE.Vector3();
  private readonly savedCameraQuaternion = new THREE.Quaternion();

  private room: THREE.Group | null = null;
  private crates: Crate[] = [];
  private statics: RigidBox[] = [];
  private dragged: Crate | null = null;
  private hovered: Crate | null = null;
  private hasDragTarget = false;
  private cleared = 0;
  private won = false;
  private expired = false;
  private savedFov = 50;
  private savedCarVisible = true;
  private gauges: HTMLElement | null = null;
  private savedGaugeDisplay = "";
  private counter: HTMLElement | null = null;

  constructor(ctx: ChapterContext) {
    this.ctx = ctx;
  }

  start(): void {
    const { camera, car, dom } = this.ctx;
    this.savedCameraPosition.copy(camera.position);
    this.savedCameraQuaternion.copy(camera.quaternion);
    this.savedFov = camera.fov;
    this.savedCarVisible = car.root.visible;
    car.root.visible = false;

    this.cleared = 0;
    this.won = false;
    this.expired = false;
    this.dragged = null;
    this.hovered = null;
    this.hasDragTarget = false;
    this.crates = [];
    this.statics = [];
    this.dragVelocity.set(0, 0, 0);

    const room = this.buildRoom();
    this.room = room;
    this.ctx.scene.add(room);
    for (const spec of CRATE_SPECS) this.spawnCrate(spec.size, spec.x, spec.z);

    camera.position.set(0, 2.6, 7.5);
    camera.lookAt(new THREE.Vector3(0, 0.95, -0.7));
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.fov = 48;
    camera.updateProjectionMatrix();

    this.gauges = document.querySelector<HTMLElement>(".gauges");
    if (this.gauges) {
      this.savedGaugeDisplay = this.gauges.style.display;
      this.gauges.style.display = "none";
    }
    this.counter = document.getElementById("crateCounter");
    this.counter?.classList.add("show");
    this.updateCounter();

    const canvas = this.ctx.engine.domElement;
    canvas.addEventListener("pointerdown", this.onPointerDown);
    window.addEventListener("pointermove", this.onPointerMove);
    window.addEventListener("pointerup", this.onPointerUp);
    canvas.style.cursor = "default";

    dom.hud.classList.add("live");
    dom.letterbox.classList.add("on");
    this.ctx.say("Seven crates in a very small house. Drag them out — or throw them.", 4.2, true);
  }

  update(dt: number): void {
    if (!this.room) return;
    this.updateDrag(dt);
    this.simulateCrates(dt);
    this.syncMeshes();
    this.respawnStragglers();
    this.checkThreshold();
    if (this.hovered && !this.dragged) this.ctx.engine.domElement.style.cursor = "grab";
  }

  idle(_dt: number): void {
    /* The room is only built while a round is live. */
  }

  abandon(): void {
    this.dispose();
  }

  expire(): void {
    if (this.won) return;
    this.expired = true;
    this.ctx.say("The clock runs out. The crates stay stacked in the parlor.", 3.4, true);
  }

  outcome(): ChapterOutcome {
    if (this.won) return "win";
    if (this.expired) return "lose";
    return "pending";
  }

  flavor(outcome: "win" | "lose"): ChapterFlavor {
    const text = manifest.flavor[outcome];
    return {
      kicker: text.kicker,
      title: text.title,
      body: text.body.replace("{count}", String(CRATE_SPECS.length)),
      quote: text.quote,
      cite: text.cite,
    };
  }

  dispose(): void {
    const canvas = this.ctx.engine.domElement;
    canvas.removeEventListener("pointerdown", this.onPointerDown);
    window.removeEventListener("pointermove", this.onPointerMove);
    window.removeEventListener("pointerup", this.onPointerUp);
    canvas.style.cursor = "default";
    this.dragged = null;
    this.hovered = null;

    for (const crate of this.crates) {
      crate.mesh.geometry.dispose();
      crate.mesh.material.map?.dispose();
      crate.mesh.material.dispose();
    }
    this.crates = [];
    this.statics = [];

    if (this.room) {
      this.ctx.scene.remove(this.room);
      this.room.traverse((object) => {
        if (!(object instanceof THREE.Mesh)) return;
        object.geometry.dispose();
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        for (const material of materials) {
          if (material instanceof THREE.MeshStandardMaterial) material.map?.dispose();
          material.dispose();
        }
      });
      this.room = null;
    }

    const { camera, car, dom } = this.ctx;
    camera.position.copy(this.savedCameraPosition);
    camera.quaternion.copy(this.savedCameraQuaternion);
    camera.fov = this.savedFov;
    camera.updateProjectionMatrix();
    car.root.visible = this.savedCarVisible;
    dom.letterbox.classList.remove("on");
    dom.hud.classList.remove("live");

    if (this.gauges) {
      this.gauges.style.display = this.savedGaugeDisplay;
      this.gauges = null;
    }
    if (this.counter) {
      this.counter.classList.remove("show");
      this.counter.textContent = "";
      this.counter = null;
    }
  }

  private buildRoom(): THREE.Group {
    const room = new THREE.Group();
    room.name = "nicksHouseRoom";

    const wallpaper = wallpaperTexture();
    const floorMap = floorTexture();
    const rugMap = rugTexture();
    const wallMaterial = new THREE.MeshStandardMaterial({ map: wallpaper, roughness: 0.94 });
    const trimMaterial = new THREE.MeshStandardMaterial({ color: "#d8cdb2", roughness: 0.8 });
    const floorMaterial = new THREE.MeshStandardMaterial({ map: floorMap, roughness: 0.9 });
    const ceilingMaterial = new THREE.MeshStandardMaterial({ color: "#cdc3ab", roughness: 1 });
    const woodMaterial = new THREE.MeshStandardMaterial({ color: "#4a3121", roughness: 0.72 });
    const rugMaterial = new THREE.MeshStandardMaterial({ map: rugMap, roughness: 1 });
    const glassMaterial = new THREE.MeshStandardMaterial({
      color: "#26313d",
      emissive: "#b9cede",
      emissiveIntensity: 0.42,
      roughness: 0.35,
      metalness: 0.15,
    });

    const box = (
      width: number,
      height: number,
      depth: number,
      material: THREE.Material,
      x: number,
      y: number,
      z: number
    ): THREE.Mesh => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), material);
      mesh.position.set(x, y, z);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      room.add(mesh);
      return mesh;
    };

    const solid = (
      width: number,
      height: number,
      depth: number,
      material: THREE.Material,
      x: number,
      y: number,
      z: number
    ): THREE.Mesh => {
      const collider = new RigidBox(
        new THREE.Vector3(width / 2, height / 2, depth / 2),
        { mass: 0, friction: 0.65, restitution: 0.08 }
      );
      collider.position.set(x, y, z);
      this.statics.push(collider);
      return box(width, height, depth, material, x, y, z);
    };

    // Floor, ceiling and the three standing walls; the fourth side stays open to the camera.
    solid(ROOM_HALF * 2, 0.12, ROOM_HALF * 2, floorMaterial, 0, 0, 0).receiveShadow = true;
    solid(ROOM_HALF * 2, 0.1, ROOM_HALF * 2, ceilingMaterial, 0, ROOM_HEIGHT, 0);

    const backWidth = ROOM_HALF - DOOR_HALF;
    solid(backWidth, ROOM_HEIGHT, 0.14, wallMaterial, -(DOOR_HALF + backWidth / 2), ROOM_HEIGHT / 2, -ROOM_HALF);
    solid(backWidth, ROOM_HEIGHT, 0.14, wallMaterial, DOOR_HALF + backWidth / 2, ROOM_HEIGHT / 2, -ROOM_HALF);
    solid(DOOR_HALF * 2, ROOM_HEIGHT - DOOR_HEIGHT, 0.14, wallMaterial, 0, (ROOM_HEIGHT + DOOR_HEIGHT) / 2, -ROOM_HALF);
    solid(0.14, ROOM_HEIGHT, ROOM_HALF * 2, wallMaterial, -ROOM_HALF, ROOM_HEIGHT / 2, 0);
    solid(0.14, ROOM_HEIGHT, ROOM_HALF * 2, wallMaterial, ROOM_HALF, ROOM_HEIGHT / 2, 0);

    // Dado rail and skirting, so the parlor reads as 1930s rather than a grey test room.
    for (const wallX of [-ROOM_HALF + 0.1, ROOM_HALF - 0.1]) {
      box(0.06, 0.09, ROOM_HALF * 2, trimMaterial, wallX, 0.98, 0);
      box(0.06, 0.16, ROOM_HALF * 2, trimMaterial, wallX, 0.08, 0);
    }
    for (const segmentX of [-(DOOR_HALF + backWidth / 2), DOOR_HALF + backWidth / 2]) {
      box(backWidth, 0.09, 0.06, trimMaterial, segmentX, 0.98, -ROOM_HALF + 0.1);
      box(backWidth, 0.16, 0.06, trimMaterial, segmentX, 0.08, -ROOM_HALF + 0.1);
    }

    // Door casing and a glimpse of the porch beyond it.
    solid(0.1, DOOR_HEIGHT, 0.16, trimMaterial, -DOOR_HALF, DOOR_HEIGHT / 2, -ROOM_HALF);
    solid(0.1, DOOR_HEIGHT, 0.16, trimMaterial, DOOR_HALF, DOOR_HEIGHT / 2, -ROOM_HALF);
    solid(DOOR_HALF * 2 + 0.1, 0.12, 0.16, trimMaterial, 0, DOOR_HEIGHT, -ROOM_HALF);
    box(2.6, 0.1, 2.6, floorMaterial, 0, -0.02, -ROOM_HALF - 1.4);
    box(6, 4, 0.12, new THREE.MeshStandardMaterial({ color: "#0c0f14", roughness: 1 }), 0, 1.6, -ROOM_HALF - 2.6);

    // Sash window on the right-hand wall.
    box(0.06, 1.15, 1.35, glassMaterial, ROOM_HALF - 0.08, 1.75, 0.2);
    box(0.08, 0.08, 1.5, trimMaterial, ROOM_HALF - 0.1, 2.35, 0.2);
    box(0.08, 0.08, 1.5, trimMaterial, ROOM_HALF - 0.1, 1.18, 0.2);
    box(0.08, 1.2, 0.08, trimMaterial, ROOM_HALF - 0.1, 1.76, -0.55);
    box(0.08, 1.2, 0.08, trimMaterial, ROOM_HALF - 0.1, 1.76, 0.95);
    box(0.08, 1.2, 0.05, trimMaterial, ROOM_HALF - 0.1, 1.76, 0.2);

    // Rug.
    const rug = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 2.6), rugMaterial);
    rug.rotation.x = -Math.PI / 2;
    rug.position.set(0, 0.075, 0.6);
    rug.receiveShadow = true;
    room.add(rug);

    // Table, chair and lamp. Every piece is also a static collider.
    const tableX = -2.4;
    const tableZ = -2.9;
    solid(1.6, 0.09, 0.95, woodMaterial, tableX, 0.78, tableZ);
    for (const [dx, dz] of [[-0.66, -0.36], [0.66, -0.36], [-0.66, 0.36], [0.66, 0.36]] as const) {
      solid(0.09, 0.74, 0.09, woodMaterial, tableX + dx, 0.37, tableZ + dz);
    }
    solid(0.4, 0.3, 0.3, new THREE.MeshStandardMaterial({ color: "#8c7a5b", roughness: 0.9 }), tableX + 0.35, 0.97, tableZ);

    solid(0.55, 0.08, 0.55, woodMaterial, 2.2, 0.46, -3.0);
    solid(0.55, 0.62, 0.07, woodMaterial, 2.2, 0.76, -3.24);
    for (const [dx, dz] of [[-0.22, -0.22], [0.22, -0.22], [-0.22, 0.22], [0.22, 0.22]] as const) {
      solid(0.06, 0.44, 0.06, woodMaterial, 2.2 + dx, 0.22, -3.0 + dz);
    }

    const lampX = 3.05;
    const lampZ = -0.2;
    solid(0.42, 0.1, 0.42, woodMaterial, lampX, 0.1, lampZ);
    solid(0.07, 1.35, 0.07, woodMaterial, lampX, 0.78, lampZ);
    const shadeMaterial = new THREE.MeshStandardMaterial({
      color: "#e4c48d",
      emissive: "#ffbf72",
      emissiveIntensity: 0.9,
      roughness: 0.8,
      side: THREE.DoubleSide,
    });
    const shade = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.4, 0.36, 20, 1, true), shadeMaterial);
    shade.position.set(lampX, 1.5, lampZ);
    room.add(shade);

    // Two small frames and a mirror on the back wall.
    const frameMaterial = new THREE.MeshStandardMaterial({ color: "#3d2a1b", roughness: 0.6 });
    const canvasMaterial = new THREE.MeshStandardMaterial({ color: "#b7a27a", roughness: 0.95 });
    box(0.66, 0.86, 0.05, frameMaterial, -3.0, 1.8, -ROOM_HALF + 0.1);
    box(0.54, 0.74, 0.03, canvasMaterial, -3.0, 1.8, -ROOM_HALF + 0.14);
    box(0.6, 0.5, 0.05, frameMaterial, 2.9, 1.85, -ROOM_HALF + 0.1);
    box(0.48, 0.38, 0.03, canvasMaterial, 2.9, 1.85, -ROOM_HALF + 0.14);

    // Warm tungsten light in the parlor plus a dim lamp over the porch.
    const lampLight = new THREE.PointLight("#ffc98a", 16, 16, 2);
    lampLight.position.set(lampX - 0.2, 1.7, lampZ);
    room.add(lampLight);
    const doorLight = new THREE.PointLight("#ffd7a4", 7, 10, 2);
    doorLight.position.set(0, 2.2, -ROOM_HALF - 0.6);
    room.add(doorLight);
    const fillLight = new THREE.PointLight("#9fb0c4", 3.2, 14, 2);
    fillLight.position.set(0, 2.4, 5.6);
    room.add(fillLight);

    return room;
  }

  private spawnCrate(size: number, x: number, z: number): void {
    if (!this.room) return;
    const geometry = new THREE.BoxGeometry(size, size, size);
    const material = new THREE.MeshStandardMaterial({
      map: crateTexture(),
      color: new THREE.Color().setHSL(0.09 + Math.random() * 0.03, 0.32, 0.6 + Math.random() * 0.12),
      roughness: 0.88,
    });
    const mesh = new THREE.Mesh<THREE.BoxGeometry, THREE.MeshStandardMaterial>(geometry, material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.name = "nickCrate";
    this.room.add(mesh);

    const body = new RigidBox(new THREE.Vector3(size / 2, size / 2, size / 2), {
      mass: 5 + size * 4,
      friction: 0.62,
      restitution: 0.16,
    });
    const spawn = new THREE.Vector3(x, size / 2 + 0.08, z);
    body.position.copy(spawn);
    body.quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), (Math.random() - 0.5) * 0.6);
    mesh.position.copy(body.position);
    mesh.quaternion.copy(body.quaternion);
    this.crates.push({ mesh, body, size, spawn });
  }

  private readonly onPointerDown = (event: PointerEvent): void => {
    if (event.button !== 0 || !this.room) return;
    this.trackPointer(event);
    this.raycaster.setFromCamera(this.pointerNdc, this.ctx.camera);
    const hit = this.raycaster.intersectObjects(this.crates.map((crate) => crate.mesh), false)[0];
    if (!hit) return;
    const crate = this.crates.find((entry) => entry.mesh === hit.object);
    if (!crate) return;

    this.dragged = crate;
    this.hasDragTarget = false;
    this.dragVelocity.set(0, 0, 0);
    this.raycaster.ray.intersectPlane(this.dragPlane, this.dragPoint);
    this.dragOffset.set(
      crate.body.position.x - this.dragPoint.x,
      0,
      crate.body.position.z - this.dragPoint.z
    );
    this.dragTarget.copy(crate.body.position);
    this.previousTarget.copy(crate.body.position);
    this.ctx.engine.domElement.style.cursor = "grabbing";
  };

  private readonly onPointerMove = (event: PointerEvent): void => {
    if (!this.room) return;
    this.trackPointer(event);
    if (this.dragged) return;
    this.raycaster.setFromCamera(this.pointerNdc, this.ctx.camera);
    const hit = this.raycaster.intersectObjects(this.crates.map((crate) => crate.mesh), false)[0];
    const crate = hit ? this.crates.find((entry) => entry.mesh === hit.object) ?? null : null;
    this.hovered = crate;
    this.ctx.engine.domElement.style.cursor = crate ? "grab" : "default";
  };

  private readonly onPointerUp = (): void => {
    const crate = this.dragged;
    if (!crate) return;
    this.dragged = null;
    this.hasDragTarget = false;

    // Let go with the speed the crate was already swinging at plus the flick
    // of the pointer, so a quick drag-and-release throws it across the room.
    const throwSpeed = Math.min(this.dragVelocity.length(), 18);
    crate.body.velocity.addScaledVector(this.dragVelocity, 0.6);
    if (throwSpeed > 0.6) crate.body.velocity.y += 1.2 + throwSpeed * 0.12;
    if (crate.body.velocity.length() > 24) crate.body.velocity.setLength(24);
    if (throwSpeed > 1.2) {
      const spin = 1.2 + throwSpeed * 0.5;
      crate.body.angularVelocity.set(
        (Math.random() - 0.5) * spin,
        (Math.random() - 0.5) * spin,
        (Math.random() - 0.5) * spin
      );
    }
    this.ctx.engine.domElement.style.cursor = "default";
  };

  private trackPointer(event: PointerEvent): void {
    const rect = this.ctx.engine.domElement.getBoundingClientRect();
    const width = rect.width || window.innerWidth;
    const height = rect.height || window.innerHeight;
    this.pointerNdc.set(
      ((event.clientX - rect.left) / width) * 2 - 1,
      -((event.clientY - rect.top) / height) * 2 + 1
    );
  }

  private updateDrag(dt: number): void {
    const crate = this.dragged;
    if (!crate) return;
    this.raycaster.setFromCamera(this.pointerNdc, this.ctx.camera);
    if (!this.raycaster.ray.intersectPlane(this.dragPlane, this.dragPoint)) {
      // Near the horizon the ray runs parallel to the carry plane, so keep
      // pulling along the ray instead of letting the crate freeze mid-drag.
      this.raycaster.ray.at(24, this.dragPoint);
    }

    let x = this.dragPoint.x + this.dragOffset.x;
    let z = this.dragPoint.z + this.dragOffset.z;
    const edge = ROOM_HALF - 0.5;
    x = Math.max(-edge, Math.min(edge, x));
    if (z < -edge && Math.abs(x) < DOOR_HALF - 0.2) {
      z = Math.max(THRESHOLD_Z - 0.4, z);
    } else {
      z = Math.max(-edge, Math.min(edge, z));
    }

    this.dragTarget.set(x, CARRY_Y, z);
    if (!this.hasDragTarget) {
      this.hasDragTarget = true;
      this.previousTarget.copy(this.dragTarget);
      return;
    }

    const instant = this.dragTarget.clone().sub(this.previousTarget).divideScalar(Math.max(dt, 1 / 240));
    if (instant.lengthSq() > 40 * 40) instant.setLength(40);
    this.dragVelocity.lerp(instant, 0.5);
    this.previousTarget.copy(this.dragTarget);
  }

  private simulateCrates(dt: number): void {
    const bodies = this.crates.map((crate) => crate.body);
    simulate(bodies, this.statics, dt, (body, step) => {
      const crate = this.dragged;
      if (!crate || crate.body !== body) return;
      // A damped spring carries the crate; collision still applies, so it
      // scrapes along walls and shoves the other boxes instead of teleporting.
      const pull = this.dragTarget.clone().sub(body.position).multiplyScalar(150);
      pull.addScaledVector(body.velocity, -17);
      const limit = 420;
      if (pull.lengthSq() > limit * limit) pull.setLength(limit);
      body.velocity.addScaledVector(pull, step);
      body.angularVelocity.multiplyScalar(0.985);
    });
  }

  private syncMeshes(): void {
    for (const crate of this.crates) {
      crate.mesh.position.copy(crate.body.position);
      crate.mesh.quaternion.copy(crate.body.quaternion);
    }
  }

  private respawnStragglers(): void {
    for (const crate of this.crates) {
      const { position } = crate.body;
      const lost = position.y < -4 || Math.abs(position.x) > ROOM_HALF + 4 || Math.abs(position.z) > ROOM_HALF + 5;
      if (!lost) continue;
      crate.body.position.copy(crate.spawn);
      crate.body.velocity.set(0, 0, 0);
      crate.body.angularVelocity.set(0, 0, 0);
      crate.body.quaternion.identity();
      if (this.dragged === crate) this.dragged = null;
    }
  }

  private checkThreshold(): void {
    for (const crate of [...this.crates]) {
      const { x, z } = crate.body.position;
      if (z < THRESHOLD_Z && Math.abs(x) < DOOR_HALF) this.clearCrate(crate);
    }
  }

  private clearCrate(crate: Crate): void {
    if (this.dragged === crate) {
      this.dragged = null;
      this.ctx.engine.domElement.style.cursor = "default";
    }
    this.crates = this.crates.filter((entry) => entry !== crate);
    this.room?.remove(crate.mesh);
    crate.mesh.geometry.dispose();
    crate.mesh.material.map?.dispose();
    crate.mesh.material.dispose();
    this.cleared += 1;
    this.updateCounter();

    if (this.crates.length === 0) {
      this.won = true;
      this.ctx.say("Every crate is on the porch. The little house is bare.", 3.6, true);
    } else {
      this.ctx.say(`${this.crates.length} crate${this.crates.length === 1 ? "" : "s"} left.`, 1.5);
    }
  }

  private updateCounter(): void {
    if (!this.counter) return;
    const left = this.crates.length;
    this.counter.textContent = left === 0 ? "House cleared" : `${left} crate${left === 1 ? "" : "s"} left`;
  }
}
