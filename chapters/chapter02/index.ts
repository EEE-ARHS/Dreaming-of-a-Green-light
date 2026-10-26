import * as THREE from "three";
import type { ChapterContext, ChapterFlavor, ChapterOutcome } from "../../frontend/src/chapters/types";
import { PhysicsAggregate, PhysicsMotionType, PhysicsShapeType, type PhysicsBody } from "../../frontend/src/physics";
import { PlayerController } from "../../frontend/src/player-controller";
import { wallpaperTexture, floorTexture, rugTexture } from "./assets";
import { crateCounter } from "../../frontend/src/ui";
import manifest from "./assets/manifest.json";
import {
  ROOM_HALF, ROOM_HEIGHT, DOOR_HALF, DOOR_HEIGHT, THRESHOLD_Z, CARRY_Y,
  type BelongingSpec, BELONGINGS
} from "./constants";

/** Optional model override paths in assets/manifest.json. Null/empty uses the blockout. */
export const MODEL_OVERRIDES = {
  house: manifest.models?.house ?? null,
  car: manifest.models?.car ?? null,
  belongings: (manifest.models?.belongings ?? {}) as Record<string, string | null>,
} as const;

export interface ModelAssetSource {
  load(path: string): Promise<THREE.Object3D>;
}

const ARRIVAL_START_Z = -72;
const ARRIVAL_PARK_Z = -8.25;
const ARRIVAL_SPEED = 8.4;
const ARRIVAL_CAMERA_BLEND_SECONDS = 2;

const DEFAULT_MODEL_ASSET_SOURCE: ModelAssetSource = {
  load(path) {
    return new Promise((resolve, reject) => {
      void import("three/examples/jsm/loaders/GLTFLoader.js").then(({ GLTFLoader }) => {
        new GLTFLoader().load(path, (gltf) => resolve(gltf.scene), undefined, reject);
      }).catch(reject);
    });
  },
};

export const id = "nicksHouse";
export const name = manifest.name;
export const blurb = manifest.blurb;
export const command = manifest.command;
export const how = manifest.how;
export const duration = manifest.duration as number | null;


interface Crate {
  mesh: THREE.Object3D;
  proxy: THREE.Mesh<THREE.BoxGeometry, THREE.MeshBasicMaterial>;
  body: PhysicsBody;
  size: number;
  spawn: THREE.Vector3;
  destination: THREE.Vector3;
  label: string;
  story: string;
  delivered: boolean;
  storyShown: boolean;
  savedTarget: THREE.Vector3;
}

export class NicksHouseChapter {
  readonly id = id;
  readonly name = name;
  readonly blurb = blurb;
  readonly command = command;
  readonly how = how;
  readonly duration: number | null = duration;
  readonly physicsScale = 1;
  private readonly ctx: ChapterContext;
  private readonly modelAssetSource: ModelAssetSource;
  private readonly raycaster = new THREE.Raycaster();
  private readonly pointerNdc = new THREE.Vector2();
  private readonly dragPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -CARRY_Y);
  private readonly walkDirection = new THREE.Vector3();
  private readonly lookAt = new THREE.Vector3();
  private readonly cameraDesired = new THREE.Vector3();
  private readonly targetDesired = new THREE.Vector3();
  private yaw = 0;
  private pitch = 0;
  private pointerLocked = false;
  private playerSpeed = 0;
  private player: PlayerController | null = null;
  private storyIndex = 0;
  private modelRoot: THREE.Group | null = null;
  private carRoot: THREE.Group | null = null;
  private houseRoot: THREE.Group | null = null;
  private modelLoadToken = { cancelled: false };
  private exterior: THREE.Group | null = null;
  private arrivalPhase: "driving" | "entering" | "done" = "done";
  private arrivalElapsed = 0;
  private showedValleyBeat = false;
  private showedEggBeat = false;
  private readonly dragOffset = new THREE.Vector3();
  private readonly dragPoint = new THREE.Vector3();
  private readonly dragTarget = new THREE.Vector3();
  private readonly previousTarget = new THREE.Vector3();
  private readonly dragVelocity = new THREE.Vector3();
  private room: THREE.Group | null = null;
  private crates: Crate[] = [];
  private physicsAggregates: PhysicsAggregate[] = [];
  private dragged: Crate | null = null;
  private hovered: Crate | null = null;
  private hasDragTarget = false;
  private won = false;
  private expired = false;
  private readonly savedCameraPosition = new THREE.Vector3();
  private readonly savedCameraQuaternion = new THREE.Quaternion();
  private savedFov = 50;
  private counter: HTMLElement | null = null;

  constructor(ctx: ChapterContext, modelAssetSource: ModelAssetSource = DEFAULT_MODEL_ASSET_SOURCE) {
    this.ctx = ctx;
    this.modelAssetSource = modelAssetSource;
  }

  start(): void {
    if (this.room) this.dispose();
    const { camera, dom } = this.ctx;
    this.savedCameraPosition.copy(camera.position);
    this.savedCameraQuaternion.copy(camera.quaternion);
    this.savedFov = camera.fov;
    this.won = false;
    this.expired = false;
    this.dragged = null;
    this.hovered = null;
    this.hasDragTarget = false;
    this.crates = [];
    this.physicsAggregates = [];
    this.modelLoadToken = { cancelled: false };
    this.dragVelocity.set(0, 0, 0);
    this.storyIndex = 0;
    this.yaw = Math.PI;
    this.pitch = 0;

    const room = this.buildRoom();
    this.room = room;
    this.houseRoot = room;
    this.ctx.scene.add(room);
    this.player = new PlayerController(this.ctx.scene, this.requirePhysics());
    this.buildExterior();
    this.buildCarAndBelongings();
    this.syncMeshes();

    this.arrivalPhase = "driving";
    this.arrivalElapsed = 0;
    this.showedValleyBeat = false;
    this.showedEggBeat = false;
    camera.position.set(9, 3.8, ARRIVAL_START_Z - 8);
    camera.lookAt(0, 1.1, ARRIVAL_START_Z + 1.5);
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.fov = 54;
    camera.updateProjectionMatrix();
    this.ctx.say("The city fell away behind Nick. Ahead lay the grey Valley of Ashes, then the green shore of West Egg.", 4.5, true);
    this.counter = crateCounter;
    this.counter?.classList.add("show");
    this.updateCounter();

    const canvas = this.ctx.engine.domElement;
    canvas.addEventListener("pointerdown", this.onPointerDown);
    window.addEventListener("mousemove", this.onMouseLook);
    window.addEventListener("pointermove", this.onPointerMove);
    window.addEventListener("pointerup", this.onPointerUp);
    window.addEventListener("keydown", this.onKeyDown);
    document.addEventListener("pointerlockchange", this.onPointerLockChange);
    window.addEventListener("blur", this.onWindowBlur);
    canvas.style.cursor = "default";

    dom.hud.classList.add("live");
    dom.letterbox.classList.remove("on");
  }

  update(dt: number): void {
    if (!this.room) return;
    if (this.arrivalPhase !== "done") {
      this.player?.update(dt, 0);
      this.updateArrivalCutscene(dt);
      return;
    }
    if (!this.pointerLocked && this.ctx.engine.domElement.style.cursor === "none") {
      this.ctx.engine.domElement.style.cursor = "default";
    }
    this.updateWalk(dt);
    this.player?.update(dt, this.playerSpeed);
    this.updatePlayerCamera(dt);
    this.updateDrag(dt);
    this.simulateCrates(dt);
    this.syncMeshes();
    this.respawnStragglers();
    this.checkThreshold();
    this.updateStory();
    if (this.hovered && !this.dragged) this.ctx.engine.domElement.style.cursor = "grab";
  }

  idle(_dt: number): void {
    /* The room is only built while a round is live. */
  }

  abandon(): void {
    this.dispose();
  }

  expire(): void {
    // This chapter is intentionally untimed; completion follows the story objective.
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
      body: text.body.replace("{count}", String(BELONGINGS.length)),
      quote: text.quote,
      cite: text.cite,
    };
  }

  dispose(): void {
    this.modelLoadToken.cancelled = true;
    this.arrivalPhase = "done";
    const canvas = this.ctx.engine.domElement;
    canvas.removeEventListener("pointerdown", this.onPointerDown);
    window.removeEventListener("mousemove", this.onMouseLook);
    window.removeEventListener("pointermove", this.onPointerMove);
    window.removeEventListener("pointerup", this.onPointerUp);
    window.removeEventListener("keydown", this.onKeyDown);
    document.removeEventListener("pointerlockchange", this.onPointerLockChange);
    window.removeEventListener("blur", this.onWindowBlur);
    if (document.pointerLockElement === canvas) document.exitPointerLock();
    canvas.style.cursor = "default";
    this.dragged = null;
    this.hovered = null;
    this.player?.dispose();
    this.player = null;
    for (const aggregate of this.physicsAggregates) aggregate.dispose();
    this.physicsAggregates = [];
    for (const crate of this.crates) {
      crate.mesh.removeFromParent();
      crate.proxy.removeFromParent();
      this.disposeObjectTree(crate.mesh);
      this.disposeObjectTree(crate.proxy);
    }
    this.crates = [];

    if (this.room) {
      this.ctx.scene.remove(this.room);
      this.disposeObjectTree(this.room);
      this.room = null;
      this.houseRoot = null;
    }

    const { camera, dom } = this.ctx;
    camera.position.copy(this.savedCameraPosition);
    camera.quaternion.copy(this.savedCameraQuaternion);
    camera.fov = this.savedFov;
    camera.updateProjectionMatrix();
    dom.letterbox.classList.remove("on");
    dom.hud.classList.remove("live");

    if (this.modelRoot) {
      this.ctx.scene.remove(this.modelRoot);
      this.disposeObjectTree(this.modelRoot);
      this.modelRoot = null;
      this.carRoot = null;
    }
    if (this.exterior) {
      this.ctx.scene.remove(this.exterior);
      this.disposeObjectTree(this.exterior);
      this.exterior = null;
    }
    if (this.counter) {
      this.counter.classList.remove("show");
      this.counter.textContent = "";
      this.counter = null;
    }
  }

  private updateCamera(): void {
    this.ctx.camera.rotation.order = "YXZ";
    this.ctx.camera.rotation.set(this.pitch, this.yaw, 0);
  }

  private updatePlayerCamera(dt: number): void {
    const player = this.player;
    if (!player) return;
    const camera = this.ctx.camera;
    const behind = 3.4;
    const cameraHeight = THREE.MathUtils.clamp(1.72 + this.pitch * 1.2, 0.62, 3.05);
    this.cameraDesired.set(
      player.position.x + Math.sin(this.yaw) * behind,
      cameraHeight,
      player.position.z + Math.cos(this.yaw) * behind,
    );
    this.targetDesired.set(
      player.position.x - Math.sin(this.yaw) * 0.55,
      1.18 + THREE.MathUtils.clamp(this.pitch * 0.8, -0.7, 0.7),
      player.position.z - Math.cos(this.yaw) * 0.55,
    );
    const blend = 1 - Math.exp(-8 * Math.max(0, dt));
    camera.position.lerp(this.cameraDesired, blend);
    this.lookAt.lerp(this.targetDesired, blend);
    camera.lookAt(this.lookAt);
  }

  private readonly onPointerLockChange = (): void => {
    this.pointerLocked = document.pointerLockElement === this.ctx.engine.domElement;
    this.ctx.engine.domElement.style.cursor = this.pointerLocked ? "none" : "default";
    if (this.pointerLocked) this.ctx.say("WASD to walk · mouse to look · click and drag belongings into the house.", 3.2, true);
  };

  private readonly onWindowBlur = (): void => {
    this.walkDirection.set(0, 0, 0);
    this.playerSpeed = 0;
    this.ctx.keys.clear();
  };

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    if (["w", "a", "s", "d", "arrowup", "arrowdown", "arrowleft", "arrowright", " "].includes(event.key.toLowerCase())) event.preventDefault();
  };

  private updateWalk(dt: number): void {
    const player = this.player;
    if (!player) return;
    const { keys } = this.ctx;
    const forwardInput = this.pointerLocked
      ? Number(keys.has("w") || keys.has("arrowup")) - Number(keys.has("s") || keys.has("arrowdown"))
      : 0;
    const sideInput = this.pointerLocked
      ? Number(keys.has("d") || keys.has("arrowright")) - Number(keys.has("a") || keys.has("arrowleft"))
      : 0;
    this.walkDirection.set(
      -Math.sin(this.yaw) * forwardInput + Math.cos(this.yaw) * sideInput,
      0,
      -Math.cos(this.yaw) * forwardInput - Math.sin(this.yaw) * sideInput,
    );
    if (this.walkDirection.lengthSq() > 1) this.walkDirection.normalize();
    player.yaw = this.yaw;
    this.playerSpeed = player.move(forwardInput, sideInput, dt);
  }

  private updateStory(): void {
    const delivered = this.crates.filter((crate) => crate.delivered).length;
    if (delivered > this.storyIndex) {
      this.storyIndex = delivered;
      const newest = this.crates.find((crate) => crate.delivered && !crate.storyShown);
      if (newest) {
        newest.storyShown = true;
        this.ctx.say(newest.story, 3.8, true);
      }
    }
  }

  private updateArrivalCutscene(dt: number): void {
    const camera = this.ctx.camera;
    this.arrivalElapsed += dt;
    if (this.arrivalPhase === "driving") {
      const carRoot = this.carRoot;
      if (!carRoot) return;
      const previousZ = carRoot.position.z;
      carRoot.position.z = Math.min(ARRIVAL_PARK_Z, previousZ + ARRIVAL_SPEED * dt);
      const traveled = carRoot.position.z - previousZ;
      for (const crate of this.crates) {
        crate.proxy.position.z += traveled;
        crate.spawn.z += traveled;
      }
      this.syncMeshes();

      if (!this.showedValleyBeat && carRoot.position.z > -39) {
        this.showedValleyBeat = true;
        this.ctx.say("The road climbed out of the Valley. Grey ash gave way to hedges and the first lights of West Egg.", 4.2, true);
      }
      if (!this.showedEggBeat && carRoot.position.z > -19) {
        this.showedEggBeat = true;
        this.ctx.say("Nick Carraway had crossed the Valley at last. His new home stood just beyond the gate.", 4.2, true);
      }

      const carZ = carRoot.position.z;
      if (this.arrivalElapsed < 2.7) {
        this.cameraDesired.set(9, 3.8, carZ - 8);
        this.targetDesired.set(0, 1.1, carZ + 1.5);
      } else {
        this.cameraDesired.set(7.5, 2.8, carZ - 7.5);
        this.targetDesired.set(0, 1.15, carZ + 1.8);
      }
      const blend = 1 - Math.exp(-3.2 * dt);
      camera.position.lerp(this.cameraDesired, blend);
      this.lookAt.lerp(this.targetDesired, blend);
      camera.lookAt(this.lookAt);
      camera.fov = 54;
      camera.updateProjectionMatrix();

      if (carRoot.position.z >= ARRIVAL_PARK_Z) {
        carRoot.position.z = ARRIVAL_PARK_Z;
        this.arrivalPhase = "entering";
        this.arrivalElapsed = 0;
        for (const crate of this.crates) {
          crate.body.setTransform(crate.proxy.position, crate.proxy.quaternion);
          crate.body.setMotionType(PhysicsMotionType.DYNAMIC);
          crate.body.setLinearVelocity(new THREE.Vector3());
        }
        this.lookAt.copy(this.targetDesired);
      }
      return;
    }
    const progress = THREE.MathUtils.clamp(this.arrivalElapsed / ARRIVAL_CAMERA_BLEND_SECONDS, 0, 1);
    const eased = progress * progress * (3 - 2 * progress);
    const from = this.cameraDesired.set(7.5, 2.8, ARRIVAL_PARK_Z - 7.5);
    const to = this.targetDesired.set(0, 1.68, -3.1);
    camera.position.lerpVectors(from, to, eased);
    const fromLook = new THREE.Vector3(0, 1.2, -5.5);
    const toLook = new THREE.Vector3(0, 1.68, 8);
    this.lookAt.lerpVectors(fromLook, toLook, eased);
    camera.lookAt(this.lookAt);
    camera.fov = THREE.MathUtils.lerp(54, 68, eased);
    camera.updateProjectionMatrix();
    if (progress >= 1) {
      this.arrivalPhase = "done";
      camera.position.set(0, 1.68, -3.1);
      this.yaw = Math.PI;
      this.pitch = 0;
      this.updateCamera();
      this.ctx.say("The porch lamp was lit. Nick had reached West Egg. WASD to walk · mouse to look · click and drag to unpack.", 4.3, true);
    }
  }

  private buildExterior(): void {
    const root = new THREE.Group();
    root.name = "nicks-house-west-egg-exterior";
    this.exterior = root;
    this.ctx.scene.add(root);

    const gravel = new THREE.MeshStandardMaterial({ color: "#635c50", roughness: 1 });
    const ash = new THREE.MeshStandardMaterial({ color: "#383a3a", roughness: 1 });
    const lawn = new THREE.MeshStandardMaterial({ color: "#34452e", roughness: 1 });
    const lawnDark = new THREE.MeshStandardMaterial({ color: "#263625", roughness: 1 });
    const hedge = new THREE.MeshStandardMaterial({ color: "#243728", roughness: 0.96 });
    const leaves = new THREE.MeshStandardMaterial({ color: "#203428", roughness: 0.92 });
    const leavesLight = new THREE.MeshStandardMaterial({ color: "#334632", roughness: 0.9 });
    const bark = new THREE.MeshStandardMaterial({ color: "#392b20", roughness: 1 });
    const fence = new THREE.MeshStandardMaterial({ color: "#c5b99c", roughness: 0.82 });
    const stone = new THREE.MeshStandardMaterial({ color: "#777365", roughness: 1 });
    const houseWall = new THREE.MeshStandardMaterial({ color: "#a99b7b", roughness: 0.9 });
    const roof = new THREE.MeshStandardMaterial({ color: "#292a28", roughness: 0.95 });
    const windowGlow = new THREE.MeshStandardMaterial({ color: "#c99b55", emissive: "#6e4318", emissiveIntensity: 0.7, roughness: 0.7 });
    const lampGlow = new THREE.MeshStandardMaterial({ color: "#ffe0a1", emissive: "#ffbb69", emissiveIntensity: 1.7 });
    const metal = new THREE.MeshStandardMaterial({ color: "#3b3d3a", metalness: 0.55, roughness: 0.58 });
    const boxGeometry = new THREE.BoxGeometry(1, 1, 1);
    const sphereGeometry = new THREE.SphereGeometry(1, 12, 8);
    const cylinderGeometry = new THREE.CylinderGeometry(1, 1, 1, 10);

    const add = (geometry: THREE.BufferGeometry, material: THREE.Material, position: [number, number, number], scale: [number, number, number], name: string) => {
      const mesh = new THREE.Mesh(geometry, material);
      mesh.name = name;
      mesh.position.set(...position);
      mesh.scale.set(...scale);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      root.add(mesh);
      return mesh;
    };
    const addBox = (material: THREE.Material, position: [number, number, number], size: [number, number, number], name: string) => add(boxGeometry, material, position, size, name);

    // The long drive starts in the grey Valley and becomes a gravel estate lane.
    addBox(ash, [0, -0.13, -61], [9.2, 0.12, 25], "valley-roadbed");
    addBox(gravel, [0, -0.055, -25.5], [7.5, 0.1, 48], "west-egg-gravel-drive");
    addBox(lawnDark, [0, -0.24, -29], [52, 0.12, 49], "valley-shoulder");
    addBox(lawn, [0, -0.18, -9], [34, 0.12, 27], "west-egg-lawn");
    addBox(houseWall, [-2.55, 1.5, -4.16], [2.9, 3, 0.22], "nicks-house-front-left");
    addBox(houseWall, [2.55, 1.5, -4.16], [2.9, 3, 0.22], "nicks-house-front-right");
    addBox(houseWall, [0, 2.58, -4.16], [2.3, 0.84, 0.22], "nicks-house-front-lintel");
    addBox(roof, [0, 3.35, -4.2], [9.2, 0.28, 8.5], "nicks-house-roof-eave");
    for (const side of [-1, 1]) {
      addBox(houseWall, [side * 4.12, 1.5, -0.1], [0.22, 3, 8.1], `nicks-house-exterior-side-${side}`);
      addBox(roof, [side * 3.1, 3.55, -0.1], [3.3, 0.2, 8.5], `nicks-house-roof-slope-${side}`).rotation.z = side * -0.28;
      addBox(houseWall, [side * 1.55, 1.45, -4.38], [0.16, 2.9, 0.22], `nicks-house-porch-post-${side}`);
    }
    addBox(roof, [0, 2.9, -4.42], [3.5, 0.18, 1.1], "nicks-house-porch-roof");
    addBox(stone, [0, 0.08, -5.0], [3.2, 0.16, 2.6], "nicks-house-front-steps");
    const porchLight = new THREE.PointLight("#ffd39a", 9, 12, 2);
    porchLight.position.set(0, 2.4, -4.9);
    root.add(porchLight);
    add(sphereGeometry, lampGlow, [0, 2.4, -4.68], [0.2, 0.28, 0.2], "nicks-house-porch-lamp");
    addBox(ash, [0, -0.1, -61], [38, 0.1, 25], "ash-field");
    const exteriorGround = new THREE.Mesh(
      new THREE.BoxGeometry(50, 0.12, 70),
      new THREE.MeshBasicMaterial({ visible: false })
    );
    exteriorGround.name = "west-egg-exterior-collision-ground";
    exteriorGround.position.set(0, -0.11, -39);
    root.add(exteriorGround);
    this.addStaticCollider(exteriorGround, 50, 0.12, 70);
    addBox(ash, [-11, -0.06, -54], [26, 0.12, 18], "valley-western-ash-shoulder");
    addBox(ash, [11, -0.06, -54], [26, 0.12, 18], "valley-eastern-ash-shoulder");

    // Ash heaps, scrub, and the bare utility poles along the road out of the Valley.
    for (let index = 0; index < 16; index++) {
      const side = index % 2 === 0 ? -1 : 1;
      const z = -39 - Math.floor(index / 2) * 4.1;
      const x = side * (7.8 + (index % 3) * 1.8);
      add(sphereGeometry, index % 3 === 0 ? stone : ash, [x, 0.05, z], [2.1 + (index % 3) * 0.7, 0.65 + (index % 2) * 0.2, 2.8], `valley-ash-heap-${index}`);
      for (let sprig = 0; sprig < 2; sprig++) {
        const scrub = add(cylinderGeometry, bark, [x + (sprig ? 0.55 : -0.48), 0.48, z + sprig * 0.35], [0.09, 0.95, 0.09], `ash-scrub-${index}-${sprig}`);
        scrub.rotation.z = (sprig ? -1 : 1) * 0.28;
      }
    }
    for (let index = 0; index < 4; index++) {
      const z = -59 + index * 11;
      add(cylinderGeometry, metal, [-10, 3.4, z], [0.11, 6.8, 0.11], `valley-telephone-pole-${index}`);
      addBox(metal, [-10, 6.55, z], [1.4, 0.1, 0.1], `valley-pole-arm-${index}`);
      if (index < 3) {
        const wire = add(new THREE.BufferGeometry().setFromPoints([
          new THREE.Vector3(-10, 6.45, z), new THREE.Vector3(-10, 6.1, z + 11),
        ]), new THREE.LineBasicMaterial({ color: "#111211" }), [0, 0, 0], [1, 1, 1], `valley-wire-${index}`);
        wire.castShadow = false;
      }
    }

    // A weathered roadside sign and the watchful eyes above the ash heaps.
    addBox(metal, [-8.4, 0.9, -43], [0.18, 1.8, 0.18], "garage-sign-post");
    addBox(stone, [-8.4, 1.85, -43], [2.8, 0.72, 0.12], "wilson-garage-sign");
    addBox(windowGlow, [-8.4, 1.85, -42.92], [2.35, 0.35, 0.035], "wilson-garage-sign-lettering");
    add(cylinderGeometry, metal, [-16, 4.1, -53], [0.34, 8.2, 0.38], "eckleburg-billboard-post");
    addBox(roof, [-16, 9.2, -53], [12, 5.1, 0.55], "eckleburg-billboard");
    addBox(stone, [-16, 9.2, -52.68], [11.3, 4.4, 0.08], "eckleburg-board-face");
    for (const eyeX of [-18.4, -13.6]) {
      add(sphereGeometry, windowGlow, [eyeX, 9.55, -52.5], [1.55, 0.78, 0.16], "eckleburg-eye");
      add(sphereGeometry, metal, [eyeX, 9.55, -52.3], [0.34, 0.62, 0.11], "eckleburg-pupil");
    }

    // West Egg's estate entrance: clipped hedges, a pale fence, and warm lamps.
    for (const side of [-1, 1]) {
      addBox(hedge, [side * 5.7, 0.82, -9.2], [0.72, 1.65, 0.72], `gate-pillar-${side}`);
      addBox(stone, [side * 5.7, 1.75, -9.2], [1.05, 0.25, 1.05], `gate-cap-${side}`);
      for (let index = 0; index < 10; index++) {
        const z = -12.5 - index * 1.65;
        addBox(hedge, [side * 5.8, 0.68, z], [0.55, 1.35, 1.35], `west-egg-hedge-${side}-${index}`);
        if (index < 8) {
          addBox(fence, [side * 7.1, 0.62, z], [0.12, 1.15, 0.12], `estate-fence-post-${side}-${index}`);
          addBox(fence, [side * 7.1, 0.38, z - 0.55], [0.12, 0.1, 1.1], `estate-fence-rail-${side}-${index}`);
        }
      }
      for (let index = 0; index < 8; index++) {
        const z = -13 - index * 5.2;
        add(cylinderGeometry, bark, [side * (10.5 + (index % 2) * 1.2), 2.1, z], [0.42, 4.2, 0.42], `west-egg-tree-trunk-${side}-${index}`);
        add(sphereGeometry, index % 2 ? leaves : leavesLight, [side * (10.5 + (index % 2) * 1.2), 4.5, z], [2.5, 3.1, 2.4], `west-egg-tree-crown-${side}-${index}`);
        add(sphereGeometry, leaves, [side * (9.6 + (index % 2) * 1.2), 4.05, z - 0.9], [1.7, 2.1, 1.8], `west-egg-tree-crown-low-${side}-${index}`);
      }
      for (const z of [-14, -23, -32]) {
        add(cylinderGeometry, metal, [side * 4.7, 1.8, z], [0.09, 3.6, 0.09], `west-egg-lamppost-${side}-${z}`);
        add(sphereGeometry, lampGlow, [side * 4.7, 3.68, z], [0.32, 0.42, 0.32], `west-egg-lamp-${side}-${z}`);
        const light = new THREE.PointLight("#ffc987", 3.2, 8, 2);
        light.position.set(side * 4.7, 3.7, z);
        root.add(light);
      }
    }

    // Distant Long Island houses glow through the trees on the approach.
    for (const [index, side] of [-1, 1].entries()) {
      const x = side * 15;
      const z = -23 - index * 9;
      addBox(houseWall, [x, 1.8, z], [7.2, 3.6, 5.2], `west-egg-house-${index}`);
      addBox(roof, [x, 3.9, z], [8.1, 0.55, 5.9], `west-egg-roof-${index}`);
      for (const windowX of [-1.7, 1.7]) addBox(windowGlow, [x + windowX, 2.05, z - 2.64], [0.9, 1.2, 0.06], `west-egg-window-${index}-${windowX}`);
      addBox(houseWall, [x, 0.45, z - 3.2], [2.5, 0.9, 1.8], `west-egg-porch-${index}`);
    }

    // Gatsby's enormous house sits farther along the shore, visible above the estate trees.
    addBox(houseWall, [17, 4.3, -42], [15, 8.6, 10], "gatsby-mansion");
    addBox(roof, [17, 9, -42], [17, 1, 12], "gatsby-mansion-roof");
    for (const windowX of [11, 15, 19, 23]) addBox(windowGlow, [windowX, 4.8, -47.1], [1.1, 2.1, 0.08], `gatsby-mansion-window-${windowX}`);
    const bay = new THREE.MeshStandardMaterial({ color: "#111d26", roughness: 0.3, metalness: 0.12 });
    addBox(bay, [0, -0.1, -90], [180, 0.25, 30], "long-island-sound");
    const moon = add(sphereGeometry, new THREE.MeshBasicMaterial({ color: "#d5cbb2" }), [0, 18, -86], [3.5, 3.5, 3.5], "west-egg-moon");
    moon.castShadow = false;

    const starPositions = new Float32Array(360 * 3);
    for (let index = 0; index < 360; index++) {
      starPositions[index * 3] = (Math.random() - 0.5) * 150;
      starPositions[index * 3 + 1] = 18 + Math.random() * 45;
      starPositions[index * 3 + 2] = -82 + Math.random() * 42;
    }
    const starGeometry = new THREE.BufferGeometry();
    starGeometry.setAttribute("position", new THREE.Float32BufferAttribute(starPositions, 3));
    const stars = new THREE.Points(starGeometry, new THREE.PointsMaterial({ color: "#e6dfcb", size: 0.22, sizeAttenuation: true, transparent: true, opacity: 0.72 }));
    stars.name = "west-egg-stars";
    root.add(stars);
  }

  private buildCarAndBelongings(): void {
    this.modelRoot = new THREE.Group();
    this.modelRoot.name = "nicks-house-models";
    this.ctx.scene.add(this.modelRoot);
    const group = new THREE.Group();
    group.name = "nicks-car-model-slot";
    group.position.set(0, 0, ARRIVAL_START_Z);
    this.carRoot = group;
    this.modelRoot.add(group);
    this.loadOptionalModel(MODEL_OVERRIDES.car, (model) => {
      if (this.carRoot !== group) return false;
      this.disposeChildren(group);
      this.fitModel(model, new THREE.Vector3(2.1, 1.9, 4.6), true);
      group.add(model);
      return true;
    });
    if (MODEL_OVERRIDES.house) this.loadOptionalModel(MODEL_OVERRIDES.house, (model) => {
      if (!this.houseRoot || !this.room) return false;
      this.fitModel(model, new THREE.Vector3(ROOM_HALF * 2, ROOM_HEIGHT, ROOM_HALF * 2), true);
      this.disposeChildren(this.room);
      this.room.add(model);
      this.room.name = "nicksHouseCustomModel";
      return true;
    });
    const paint = new THREE.MeshStandardMaterial({ color: "#26313a", metalness: 0.62, roughness: 0.34 });
    const trim = new THREE.MeshStandardMaterial({ color: "#9c927d", metalness: 0.78, roughness: 0.24 });
    const rubber = new THREE.MeshStandardMaterial({ color: "#151515", roughness: 0.92 });
    const glass = new THREE.MeshStandardMaterial({ color: "#8ea6ae", roughness: 0.2, metalness: 0.25, transparent: true, opacity: 0.28 });
    const box = (name: string, dimensions: [number, number, number], position: [number, number, number], material: THREE.Material) => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(...dimensions), material);
      mesh.name = name;
      mesh.position.set(...position);
      mesh.castShadow = mesh.receiveShadow = true;
      group.add(mesh);
      return mesh;
    };
    // Replace only the car visual group; belongings keep independent physics proxies.
    box("nick-car-body", [2.05, 0.72, 4.3], [0, 0.72, 0], paint);
    box("nick-car-hood", [1.9, 0.42, 1.6], [0, 1.12, 1.3], paint);
    box("nick-car-cabin", [1.68, 0.78, 1.75], [0, 1.28, 1.1], glass);
    box("nick-car-roof", [1.72, 0.16, 1.7], [0, 1.7, 1.05], paint);
    box("nick-car-trunk-floor", [1.72, 0.12, 1.65], [0, 0.48, 1.53], paint);
    box("nick-car-trunk-left", [0.13, 0.54, 1.6], [-0.86, 0.78, 1.53], paint);
    box("nick-car-trunk-right", [0.13, 0.54, 1.6], [0.86, 0.78, 1.53], paint);
    box("nick-car-tailgate", [1.74, 0.12, 0.75], [0, 0.59, 2.33], trim);
    box("nick-car-bumper", [2.15, 0.15, 0.18], [0, 0.42, 2.39], trim);
    for (const x of [-0.92, 0.92]) {
      const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.38, 0.18, 20), rubber);
      wheel.name = "nick-car-wheel";
      wheel.rotation.z = Math.PI / 2;
      wheel.position.set(x, 0.4, -0.7);
      wheel.castShadow = true;
      group.add(wheel);
      const rearWheel = wheel.clone(); rearWheel.position.z = 1.2; group.add(rearWheel);
    }
    BELONGINGS.forEach((spec, index) => {
      const carPosition = new THREE.Vector3(...spec.carPosition);
      const housePosition = new THREE.Vector3(...spec.housePosition);
      const spawn = new THREE.Vector3(carPosition.x, spec.size / 2 + Math.max(0, carPosition.y), group.position.z + carPosition.z);
      const target = new THREE.Vector3(housePosition.x, spec.size / 2 + housePosition.y, housePosition.z);
      this.spawnCrate(spec, spawn.x, spawn.y, spawn.z);
      const crate = this.crates[index];
      crate.destination.copy(target);
    });
  }

  private fitModel(model: THREE.Object3D, target: THREE.Vector3, alignBottom = false): void {
    let bounds = new THREE.Box3().setFromObject(model);
    const size = bounds.getSize(new THREE.Vector3());
    const ratios = [size.x > 0 ? target.x / size.x : Infinity, size.y > 0 ? target.y / size.y : Infinity, size.z > 0 ? target.z / size.z : Infinity];
    const scale = Math.min(...ratios);
    if (Number.isFinite(scale)) model.scale.setScalar(scale);
    bounds = new THREE.Box3().setFromObject(model);
    const center = bounds.getCenter(new THREE.Vector3());
    model.position.x -= center.x;
    model.position.y -= alignBottom ? bounds.min.y : center.y;
    model.position.z -= center.z;
  }

  private loadOptionalModel(path: string | null | undefined, attach: (model: THREE.Object3D) => boolean, targetSize?: number): void {
    if (!path) return;
    void this.modelAssetSource.load(path).then((model) => {
      if (this.modelLoadToken.cancelled) {
        this.disposeObjectTree(model);
        return;
      }
      if (targetSize !== undefined) {
        this.fitModel(model, new THREE.Vector3(targetSize, targetSize, targetSize));
      }
      model.traverse((object) => { object.castShadow = true; object.receiveShadow = true; });
      if (!attach(model)) this.disposeObjectTree(model);
    }).catch((error: unknown) => console.error(`Unable to load Nick's House model "${path}":`, error));
  }

  private disposeChildren(root: THREE.Object3D): void {
    const children = [...root.children];
    for (const child of children) {
      root.remove(child);
      this.disposeObjectTree(child);
    }
  }

  private disposeObjectTree(root: THREE.Object3D): void {
    const geometries = new Set<THREE.BufferGeometry>();
    const materials = new Set<THREE.Material>();
    const textures = new Set<THREE.Texture>();
    root.traverse((object) => {
      const mesh = object as THREE.Mesh;
      if (mesh.geometry) geometries.add(mesh.geometry);
      const list = Array.isArray(mesh.material) ? mesh.material : mesh.material ? [mesh.material] : [];
      for (const material of list) {
        materials.add(material);
        for (const value of Object.values(material)) if (value instanceof THREE.Texture) textures.add(value);
      }
    });
    geometries.forEach((geometry) => geometry.dispose());
    materials.forEach((material) => material.dispose());
    textures.forEach((texture) => texture.dispose());
  }

  private addProceduralBelonging(parent: THREE.Object3D, kind: BelongingSpec["kind"]): void {
    const wood = new THREE.MeshStandardMaterial({ color: "#947044", roughness: 0.86 });
    const dark = new THREE.MeshStandardMaterial({ color: "#4a3322", roughness: 0.82 });
    const brass = new THREE.MeshStandardMaterial({ color: "#b08b4d", metalness: 0.72, roughness: 0.3 });
    const fabric = new THREE.MeshStandardMaterial({ color: "#66534a", roughness: 0.94 });
    const detail = (geometry: THREE.BufferGeometry, material: THREE.Material, position: [number, number, number], scale?: [number, number, number]) => {
      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.set(...position);
      if (scale) mesh.scale.set(...scale);
      mesh.castShadow = true;
      parent.add(mesh);
    };
    switch (kind) {
      case "suitcase":
        detail(new THREE.BoxGeometry(0.82, 0.58, 0.18), fabric, [0, 0, 0]);
        detail(new THREE.TorusGeometry(0.12, 0.018, 6, 14, Math.PI), brass, [0, 0.33, 0]);
        detail(new THREE.BoxGeometry(0.18, 0.07, 0.04), brass, [0, 0.05, 0.11]);
        break;
      case "lamp":
        detail(new THREE.CylinderGeometry(0.06, 0.09, 0.12, 10), brass, [0, -0.15, 0]);
        detail(new THREE.CylinderGeometry(0.025, 0.035, 0.3, 8), brass, [0, 0.02, 0]);
        detail(new THREE.CylinderGeometry(0.1, 0.19, 0.16, 12, 1, true), fabric, [0, 0.22, 0]);
        break;
      case "books":
        for (let index = 0; index < 3; index++) {
          const book = new THREE.Mesh(new THREE.BoxGeometry(0.68, 0.12, 0.42), index % 2 ? dark : wood);
          book.position.set(0, -0.17 + index * 0.13, (index % 2) * 0.04);
          book.rotation.y = (index - 1) * 0.12;
          book.castShadow = true;
          parent.add(book);
        }
        break;
      case "hatbox":
        detail(new THREE.CylinderGeometry(0.34, 0.34, 0.58, 18), wood, [0, 0, 0]);
        detail(new THREE.CylinderGeometry(0.35, 0.35, 0.04, 18), brass, [0, 0.3, 0]);
        break;
      default:
        detail(new THREE.BoxGeometry(0.86, 0.78, 0.86), wood, [0, 0, 0]);
        detail(new THREE.BoxGeometry(0.9, 0.05, 0.9), dark, [0, 0.05, 0]);
        for (const offset of [-0.22, 0.22]) detail(new THREE.BoxGeometry(0.08, 0.8, 0.88), dark, [offset, 0, 0]);
        break;
    }
  }

  private requirePhysics() {
    const physics = this.ctx.physics;
    if (!physics) throw new Error("Nick's House requires Havok physics.");
    return physics;
  }

  private addStaticCollider(object: THREE.Object3D, width: number, height: number, depth: number): void {
    const aggregate = new PhysicsAggregate(object, PhysicsShapeType.BOX, {
      mass: 0,
      friction: 0.72,
      restitution: 0.04,
      extents: new THREE.Vector3(width, height, depth),
    }, this.requirePhysics());
    aggregate.body.setMotionType(PhysicsMotionType.STATIC);
    this.physicsAggregates.push(aggregate);
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
      const mesh = box(width, height, depth, material, x, y, z);
      this.addStaticCollider(mesh, width, height, depth);
      return mesh;
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
    solid(2.6, 0.1, 2.6, floorMaterial, 0, -0.02, -ROOM_HALF - 1.4);

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

  private spawnCrate(spec: BelongingSpec, x: number, y: number, z: number): void {
    if (!this.room) return;
    const size = spec.size;
    const proxy = new THREE.Mesh(
      new THREE.BoxGeometry(size, size, size),
      new THREE.MeshBasicMaterial({ visible: false })
    );
    proxy.name = `physics-proxy:${spec.id}`;
    proxy.userData.belongingId = spec.id;
    this.modelRoot?.add(proxy);
    const mesh = new THREE.Group();
    mesh.name = `belonging:${spec.id}`;
    mesh.userData.belongingId = spec.id;
    this.modelRoot?.add(mesh);
    const belongingModelPath = MODEL_OVERRIDES.belongings[spec.id];
    mesh.position.set(x, y, z);
    this.addProceduralBelonging(mesh, spec.kind);
    if (belongingModelPath && this.modelRoot) {
      this.loadOptionalModel(belongingModelPath, (model) => {
        if (mesh.parent !== this.modelRoot) return false;
        this.disposeChildren(mesh);
        mesh.add(model);
        return true;
      }, size);
    }

    const spawn = new THREE.Vector3(x, y, z);
    proxy.position.copy(spawn);
    proxy.quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), (Math.random() - 0.5) * 0.6);
    const mass = spec.kind === "books" ? 8 : 5 + size * 4;
    const aggregate = new PhysicsAggregate(proxy, PhysicsShapeType.BOX, {
      mass,
      friction: 0.62,
      restitution: 0.12,
      extents: new THREE.Vector3(size, size, size),
    }, this.requirePhysics());
    aggregate.body.setMotionType(PhysicsMotionType.ANIMATED);
    this.physicsAggregates.push(aggregate);
    const body = aggregate.body;
    mesh.position.copy(spawn);
    mesh.quaternion.copy(proxy.quaternion);
    this.crates.push({ mesh, proxy, body, size, spawn, destination: new THREE.Vector3(...spec.housePosition), label: spec.name, story: spec.story, delivered: false, storyShown: false, savedTarget: new THREE.Vector3(...spec.housePosition) });
  }

  private readonly onMouseLook = (event: MouseEvent): void => {
    if (!this.pointerLocked || this.arrivalPhase !== "done") return;
    this.yaw -= event.movementX * 0.0022;
    this.pitch = THREE.MathUtils.clamp(this.pitch - event.movementY * 0.0018, -1.2, 1.1);
    this.updateCamera();
  };

  private readonly onPointerDown = (event: PointerEvent): void => {
    if (event.button !== 0 || !this.room || this.arrivalPhase !== "done") return;
    if (!this.pointerLocked) {
      void this.ctx.engine.domElement.requestPointerLock().catch(() => {
        // Pointer lock is unavailable in some embedded contexts. Keep the same
        // mouse-look controls and WASD movement available as a graceful fallback.
        this.pointerLocked = true;
        this.ctx.engine.domElement.style.cursor = "default";
        this.ctx.say("WASD to walk · move the mouse to look · click and drag belongings into the house.", 3.2, true);
      });
      return;
    }
    this.trackPointer(event);
    this.raycaster.setFromCamera(this.pointerNdc, this.ctx.camera);
    const hit = this.raycaster.intersectObjects(this.crates.filter((crate) => !crate.delivered).map((crate) => crate.proxy), false)[0];
    if (!hit) return;
    const crate = this.crates.find((entry) => entry.proxy === hit.object);
    if (!crate) return;

    this.dragged = crate;
    this.hasDragTarget = false;
    this.dragVelocity.set(0, 0, 0);
    this.raycaster.ray.intersectPlane(this.dragPlane, this.dragPoint);
    this.dragOffset.set(
      crate.proxy.position.x - this.dragPoint.x,
      0,
      crate.proxy.position.z - this.dragPoint.z
    );
    this.dragTarget.copy(crate.proxy.position);
    this.previousTarget.copy(crate.proxy.position);
    crate.body.setTransform(crate.proxy.position, crate.proxy.quaternion);
    this.ctx.engine.domElement.style.cursor = "grabbing";
  };

  private readonly onPointerMove = (event: PointerEvent): void => {
    if (!this.room || this.arrivalPhase !== "done") return;
    this.trackPointer(event);
    if (this.dragged) return;
    this.raycaster.setFromCamera(this.pointerNdc, this.ctx.camera);
    const hit = this.raycaster.intersectObjects(this.crates.filter((crate) => !crate.delivered).map((crate) => crate.proxy), false)[0];
    const crate = hit ? this.crates.find((entry) => entry.proxy === hit.object) ?? null : null;
    this.hovered = crate;
    this.ctx.engine.domElement.style.cursor = crate ? "grab" : "default";
  };

  private readonly onPointerUp = (): void => {
    if (this.arrivalPhase !== "done") return;
    const crate = this.dragged;
    if (!crate) return;
    this.dragged = null;
    this.hasDragTarget = false;

    const throwVelocity = this.dragVelocity.clone().multiplyScalar(0.6);
    if (throwVelocity.lengthSq() > 24 * 24) throwVelocity.setLength(24);
    if (throwVelocity.length() > 0.6) throwVelocity.y += 1.2 + throwVelocity.length() * 0.12;
    crate.body.setMotionType(PhysicsMotionType.DYNAMIC);
    crate.body.setLinearVelocity(throwVelocity);
    crate.body.setAngularVelocity(new THREE.Vector3(
      (Math.random() - 0.5) * 4,
      (Math.random() - 0.5) * 4,
      (Math.random() - 0.5) * 4
    ));
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
    z = Math.max(-ROOM_HALF - 3.5, Math.min(ROOM_HALF - 0.5, z));

    if (z < -edge && Math.abs(x) < DOOR_HALF - 0.2) {
      z = Math.max(THRESHOLD_Z - 0.4, z);
    } else {
      z = Math.max(-edge, Math.min(ROOM_HALF + 4, z));
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

  private simulateCrates(_dt: number): void {
    const crate = this.dragged;
    if (!crate) return;
    // Keep the held body aligned with the carry target; Havok still resolves
    // collisions between it and the static room or other dynamic belongings.
    crate.body.setTransform(this.dragTarget, crate.proxy.quaternion);
    crate.proxy.position.copy(this.dragTarget);
  }

  private syncMeshes(): void {
    for (const crate of this.crates) {
      if (crate.delivered) {
        crate.mesh.position.copy(crate.savedTarget);
        crate.proxy.position.copy(crate.savedTarget);
        continue;
      }
      crate.mesh.position.copy(crate.proxy.position);
      crate.mesh.quaternion.copy(crate.proxy.quaternion);
    }
  }

  private respawnStragglers(): void {
    for (const crate of this.crates) {
      const { position } = crate.proxy;
      const lost = position.y < -4 || Math.abs(position.x) > ROOM_HALF + 4 || Math.abs(position.z) > ROOM_HALF + 5;
      if (!lost) continue;
      crate.proxy.position.copy(crate.spawn);
      crate.proxy.quaternion.identity();
      crate.body.setTransform(crate.proxy.position, crate.proxy.quaternion);
      crate.body.setLinearVelocity(new THREE.Vector3());
      crate.body.setAngularVelocity(new THREE.Vector3());
      if (this.dragged === crate) this.dragged = null;
    }
  }

  private checkThreshold(): void {
    for (const crate of this.crates) {
      if (crate.delivered || crate.proxy.position.z > THRESHOLD_Z) continue;
      if (Math.abs(crate.proxy.position.x) > DOOR_HALF || crate.proxy.position.y > DOOR_HEIGHT) continue;
      crate.delivered = true;
      crate.savedTarget.copy(crate.destination);
      crate.destination.copy(crate.proxy.position);
      crate.body.setMotionType(PhysicsMotionType.ANIMATED);
      crate.body.setLinearVelocity(new THREE.Vector3());
      crate.body.setAngularVelocity(new THREE.Vector3());
      crate.body.setTransform(crate.savedTarget, crate.proxy.quaternion);
      crate.proxy.position.copy(crate.savedTarget);
      this.updateCounter();
      if (this.crates.every((item) => item.delivered)) {
        this.won = true;
        this.ctx.say("The last box settles inside. Nick's lamp glows against the evening; across the bay, Gatsby's lights begin to wake.", 6, true);
      }
    }
  }

  private updateCounter(): void {
    if (!this.counter) return;
    const delivered = this.crates.filter((crate) => crate.delivered).length;
    this.counter.textContent = delivered === BELONGINGS.length ? "HOME, AT LAST" : `${delivered} / ${BELONGINGS.length} BELONGINGS SETTLED IN`;
  }
}
