import * as THREE from "three";
import type { ChapterContext, ChapterFlavor, ChapterOutcome } from "../../frontend/src/chapters/types";
import { PhysicsAggregate, PhysicsMotionType, PhysicsShapeType, type HavokPhysics, type PhysicsBody } from "../../frontend/src/physics";
import { PlayerController } from "../../frontend/src/player-controller";
import { crateCounter } from "../../frontend/src/ui";
import manifest from "./assets/manifest.json";
import { createProceduralBelonging } from "./assets/belongings";
import { createNickCarModel } from "./assets/car";
import { disposeChildren, disposeObjectTree, fitModelToTarget, GLTF_MODEL_ASSET_SOURCE, type ModelAssetSource } from "./assets/model-loader";
import { BELONGING_MODEL_OVERRIDES, CAR_MODEL_OVERRIDE, HOUSE_MODEL_OVERRIDE } from "./assets/models";
import { buildExterior } from "./exterior";
import { buildRoom } from "./room";
import { addStaticCollider as createStaticCollider } from "./physics";
import {
  ROOM_HALF, DOOR_HALF, DOOR_HEIGHT, THRESHOLD_Z,
  type BelongingSpec, BELONGINGS
} from "./constants";

const ARRIVAL_START_Z = -72;
const ARRIVAL_PARK_Z = -8.25;
const ARRIVAL_SPEED = 8.4;
const ARRIVAL_CAMERA_BLEND_SECONDS = 2;

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
  private readonly walkDirection = new THREE.Vector3();
  private readonly moveForward = new THREE.Vector3();
  private readonly playerFocus = new THREE.Vector3();
  private readonly lookAt = new THREE.Vector3();
  private readonly cameraDesired = new THREE.Vector3();
  private readonly targetDesired = new THREE.Vector3();
  private yaw = 0;
  private pitch = 0;
  private pointerLocked = false;
  private playerSpeed = 0;
  private trunkOpen = false;
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
  private readonly dragTarget = new THREE.Vector3();
  private readonly trunkPosition = new THREE.Vector3();
  private readonly trunkHinge = new THREE.Group();
  private tailgate: THREE.Group | null = null;
  private room: THREE.Group | null = null;
  private crates: Crate[] = [];
  private physicsAggregates: PhysicsAggregate[] = [];
  private dragged: Crate | null = null;
  private won = false;
  private expired = false;
  private readonly savedCameraPosition = new THREE.Vector3();
  private readonly savedCameraQuaternion = new THREE.Quaternion();
  private savedFov = 50;
  private counter: HTMLElement | null = null;

  constructor(ctx: ChapterContext, modelAssetSource: ModelAssetSource = GLTF_MODEL_ASSET_SOURCE) {
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
    this.crates = [];
    this.physicsAggregates = [];
    this.modelLoadToken = { cancelled: false };
    this.storyIndex = 0;
    this.yaw = Math.PI;
    this.pitch = 0;

    const room = this.buildRoom();
    this.room = room;
    this.houseRoot = room;
    this.ctx.scene.add(room);
    this.trunkOpen = false;
    this.playerSpeed = 0;
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
    canvas.addEventListener("pointerdown", this.onCanvasPointerDown);
    window.addEventListener("mousemove", this.onMouseLook);
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
    this.updateTrunk(dt);
    this.updateHeldObject();
    this.updatePlayerCamera(dt);
    this.simulateCrates(dt);
    this.syncMeshes();
    this.respawnStragglers();
    this.checkThreshold();
    this.updateStory();
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
    canvas.removeEventListener("pointerdown", this.onCanvasPointerDown);
    window.removeEventListener("mousemove", this.onMouseLook);
    window.removeEventListener("keydown", this.onKeyDown);
    document.removeEventListener("pointerlockchange", this.onPointerLockChange);
    window.removeEventListener("blur", this.onWindowBlur);
    if (document.pointerLockElement === canvas) document.exitPointerLock();
    canvas.style.cursor = "default";
    if (this.dragged) this.dragged.body.setMotionType(PhysicsMotionType.DYNAMIC);
    this.dragged = null;
    this.player?.setCarrying(false);
    this.player?.dispose();
    this.player = null;
    this.trunkOpen = false;
    this.tailgate = null;
    this.trunkHinge.clear();
    for (const aggregate of this.physicsAggregates) aggregate.dispose();
    this.physicsAggregates = [];
    for (const crate of this.crates) {
      crate.mesh.removeFromParent();
      crate.proxy.removeFromParent();
      disposeObjectTree(crate.mesh);
      disposeObjectTree(crate.proxy);
    }
    this.crates = [];

    if (this.room) {
      this.ctx.scene.remove(this.room);
      disposeObjectTree(this.room);
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
      disposeObjectTree(this.modelRoot);
      this.modelRoot = null;
      this.carRoot = null;
    }
    if (this.exterior) {
      this.ctx.scene.remove(this.exterior);
      disposeObjectTree(this.exterior);
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
    this.moveForward.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    this.playerFocus.copy(player.position).addScaledVector(this.moveForward, -0.9);
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

  private readonly onCanvasPointerDown = (): void => {
    if (this.pointerLocked || this.arrivalPhase !== "done") return;
    void this.ctx.engine.domElement.requestPointerLock().catch(() => {
      this.pointerLocked = true;
      this.ctx.engine.domElement.style.cursor = "default";
      this.ctx.say("WASD to walk · move the mouse to look · E opens the trunk and carries belongings.", 3.2, true);
    });
  };

  private readonly onPointerLockChange = (): void => {
    this.pointerLocked = document.pointerLockElement === this.ctx.engine.domElement;
    this.ctx.engine.domElement.style.cursor = this.pointerLocked ? "none" : "default";
    if (this.pointerLocked) this.ctx.say("WASD to walk · mouse to look · E opens the trunk and carries belongings.", 3.2, true);
  };

  private readonly onWindowBlur = (): void => {
    this.walkDirection.set(0, 0, 0);
    this.playerSpeed = 0;
    this.ctx.keys.clear();
  };

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    const key = event.key.toLowerCase();
    if (["w", "a", "s", "d", "e", "arrowup", "arrowdown", "arrowleft", "arrowright", " "].includes(key)) event.preventDefault();
    if (event.repeat || this.arrivalPhase !== "done") return;
    if (key === "e") this.interactWithTrunkOrBelonging();
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
    this.moveForward.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    this.walkDirection.set(
      this.moveForward.x * forwardInput - this.moveForward.z * sideInput,
      0,
      this.moveForward.z * forwardInput + this.moveForward.x * sideInput,
    );
    if (this.walkDirection.lengthSq() > 1) this.walkDirection.normalize();
    player.faceCameraDirection(this.moveForward);
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
        crate.body.setTransform(crate.proxy.position, crate.proxy.quaternion);
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
          crate.body.setMotionType(PhysicsMotionType.ANIMATED);
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
      this.trunkOpen = false;
      if (this.tailgate) this.tailgate.rotation.x = 0;
      this.syncMeshes();
      this.updateCounter();
      this.updateCamera();
      this.ctx.say("The porch lamp was lit. WASD to walk · E opens the trunk, then picks up or sets down belongings.", 4.3, true);
    }
  }

  private buildExterior(): void {
    const root = buildExterior((object, width, height, depth) => this.addStaticCollider(object, width, height, depth));
    this.exterior = root;
    this.ctx.scene.add(root);
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
    this.loadOptionalModel(CAR_MODEL_OVERRIDE.path, (model) => {
      if (this.carRoot !== group) return false;
      disposeChildren(group);
      fitModelToTarget(model, new THREE.Vector3(...CAR_MODEL_OVERRIDE.fit.targetSize), CAR_MODEL_OVERRIDE.fit.alignBottom);
      group.add(model);
      return true;
    });
    if (HOUSE_MODEL_OVERRIDE.path) this.loadOptionalModel(HOUSE_MODEL_OVERRIDE.path, (model) => {
      if (!this.houseRoot || !this.room) return false;
      fitModelToTarget(model, new THREE.Vector3(...HOUSE_MODEL_OVERRIDE.fit.targetSize), HOUSE_MODEL_OVERRIDE.fit.alignBottom);
      disposeChildren(this.room);
      this.room.add(model);
      this.room.name = "nicksHouseCustomModel";
      return true;
    });
    // Procedural fallback keeps the trunk and belongings visible if an override is absent or fails.
    this.tailgate = createNickCarModel(group, this.trunkHinge);
    const trunkSlots: [number, number, number][] = [
      [-0.42, 0.48, 0.9], [0.42, 0.48, 0.9], [-0.42, 0.48, 1.78], [0.42, 0.48, 1.78],
      [-0.42, 1.35, 0.9], [0, 1.35, 1.35], [0.42, 1.35, 0.9],
    ];
    BELONGINGS.forEach((spec, index) => {
      const [slotX, slotY, slotZ] = trunkSlots[index] ?? [0, 0.48, 1.3];
      const housePosition = new THREE.Vector3(...spec.housePosition);
      const spawn = new THREE.Vector3(slotX, slotY + spec.size / 2, group.position.z + slotZ);
      const target = new THREE.Vector3(housePosition.x, spec.size / 2 + housePosition.y, housePosition.z);
      this.spawnCrate(spec, spawn.x, spawn.y, spawn.z);
      const crate = this.crates[index];
      crate.destination.copy(target);
    });
  }

  private loadOptionalModel(path: string | null | undefined, attach: (model: THREE.Object3D) => boolean, targetSize?: number, alignBottom = false): void {
    if (!path) return;
    void this.modelAssetSource.load(path).then((model) => {
      if (this.modelLoadToken.cancelled) {
        disposeObjectTree(model);
        return;
      }
      if (targetSize !== undefined) fitModelToTarget(model, new THREE.Vector3(targetSize, targetSize, targetSize), alignBottom);
      model.traverse((object) => { object.castShadow = true; object.receiveShadow = true; });
      if (!attach(model)) disposeObjectTree(model);
    }).catch((error: unknown) => console.error(`Unable to load Nick's House model "${path}":`, error));
  }

  private requirePhysics(): HavokPhysics {
    const physics = this.ctx.physics;
    if (!physics) throw new Error("Nick's House requires Havok physics.");
    return physics;
  }

  private addStaticCollider(object: THREE.Object3D, width: number, height: number, depth: number): void {
    createStaticCollider(this.requirePhysics(), this.physicsAggregates, object, width, height, depth);
  }

  private buildRoom(): THREE.Group {
    return buildRoom((object, width, height, depth) => this.addStaticCollider(object, width, height, depth));
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
    const belongingModel = BELONGING_MODEL_OVERRIDES[spec.id];
    const belongingModelPath = belongingModel?.path;
    mesh.position.set(x, y, z);
    createProceduralBelonging(mesh, spec.kind);
    if (belongingModelPath && this.modelRoot) {
      this.loadOptionalModel(belongingModelPath, (model) => {
        if (mesh.parent !== this.modelRoot) return false;
        disposeChildren(mesh);
        mesh.add(model);
        return true;
      }, size, belongingModel.fit.alignBottom);
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

  private trunkDistance(): number {
    if (!this.player || !this.carRoot) return Infinity;
    this.trunkPosition.set(0, 0, 2.72).applyQuaternion(this.carRoot.quaternion).add(this.carRoot.position);
    this.trunkPosition.z = this.carRoot.position.z + 2.72;
    return Math.hypot(this.player.position.x - this.trunkPosition.x, this.player.position.z - this.trunkPosition.z);
  }

  private interactWithTrunkOrBelonging(): void {
    if (!this.player) return;
    if (this.dragged) {
      const crate = this.dragged;
      this.updateHeldObject();
      this.dragged = null;
      crate.body.setMotionType(PhysicsMotionType.DYNAMIC);
      crate.body.setTransform(crate.proxy.position, crate.proxy.quaternion);
      crate.body.setLinearVelocity(this.walkDirection.clone().multiplyScalar(0.7));
      crate.body.setAngularVelocity(new THREE.Vector3());
      this.player.setCarrying(false);
      this.ctx.say(crate.proxy.position.z <= THRESHOLD_Z ? `${crate.label} made it inside.` : `${crate.label} set down. Press E to carry it again.`, 2.2, true);
      return;
    }

    const trunkDistance = this.trunkDistance();
    if (this.trunkOpen && trunkDistance <= 3.8) {
      const nearest = this.crates
        .filter((crate) => !crate.delivered && crate.proxy.position.z > THRESHOLD_Z)
        .map((crate) => ({ crate, distance: crate.proxy.position.distanceTo(this.playerFocus.copy(this.player!.position).add(new THREE.Vector3(0, 0.8, 0))) }))
        .filter(({ distance }) => distance <= 2.35)
        .sort((a, b) => a.distance - b.distance)[0]?.crate;
      if (nearest) {
        this.dragged = nearest;
        nearest.body.setTransform(nearest.proxy.position, nearest.proxy.quaternion);
        nearest.body.setMotionType(PhysicsMotionType.DYNAMIC);
        nearest.body.setLinearVelocity(new THREE.Vector3());
        nearest.body.setAngularVelocity(new THREE.Vector3());
        this.player.setCarrying(true);
        this.ctx.say(`${nearest.label} in hand. Carry it through the doorway and press E to set it down.`, 3.2, true);
        return;
      }
    }

    if (trunkDistance <= 3.2) {
      this.trunkOpen = !this.trunkOpen;
      this.updateCounter();
      this.ctx.say(this.trunkOpen ? "The trunk is open. Press E beside a belonging to pick it up." : "The trunk is closed.", 2.8, true);
      return;
    }

    this.ctx.say("Go to the back of Nick's car and press E to open the trunk.", 2.5, true);
  }

  private updateTrunk(dt: number): void {
    if (!this.tailgate) return;
    const target = this.trunkOpen ? -Math.PI / 2 : 0;
    const change = target - this.tailgate.rotation.x;
    this.tailgate.rotation.x += THREE.MathUtils.clamp(change, -3.2 * dt, 3.2 * dt);
  }

  private updateHeldObject(): void {
    const crate = this.dragged;
    const player = this.player;
    if (!crate || !player) return;
    const forward = this.moveForward.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    this.dragTarget.copy(player.position).addScaledVector(forward, 0.9);
    this.dragTarget.y = crate.size / 2 + 0.12;
    crate.body.setLinearVelocity(this.dragTarget.clone().sub(crate.proxy.position).multiplyScalar(15));
    crate.body.setAngularVelocity(new THREE.Vector3());
  }

  private simulateCrates(_dt: number): void {
    if (this.dragged && this.dragged.body.motionType !== PhysicsMotionType.DYNAMIC) {
      this.dragged.body.setMotionType(PhysicsMotionType.DYNAMIC);
    }
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
      crate.body.setMotionType(PhysicsMotionType.ANIMATED);
      crate.body.setTransform(crate.proxy.position, crate.proxy.quaternion);
      crate.body.setLinearVelocity(new THREE.Vector3());
      crate.body.setAngularVelocity(new THREE.Vector3());
      if (this.dragged === crate) {
        this.dragged = null;
        this.player?.setCarrying(false);
      }
    }
  }

  private checkThreshold(): void {
    for (const crate of this.crates) {
      if (crate.delivered || crate.proxy.position.z < THRESHOLD_Z) continue;
      if (Math.abs(crate.proxy.position.x) > DOOR_HALF || crate.proxy.position.y > DOOR_HEIGHT) continue;
      crate.delivered = true;
      if (this.dragged === crate) {
        this.dragged = null;
        this.player?.setCarrying(false);
      }
      crate.savedTarget.copy(crate.destination);
      crate.destination.copy(crate.proxy.position);
      crate.body.setMotionType(PhysicsMotionType.ANIMATED);
      crate.body.setLinearVelocity(new THREE.Vector3());
      crate.body.setAngularVelocity(new THREE.Vector3());
      crate.proxy.position.copy(crate.savedTarget);
      crate.body.setTransform(crate.savedTarget, crate.proxy.quaternion);
      this.updateCounter();
      if (this.crates.every((item) => item.delivered)) {
        this.won = true;
        this.ctx.say("The last belonging is safely home. Nick's lamp glows against the evening; across the bay, Gatsby's lights begin to wake.", 6, true);
      }
    }
  }

  private updateCounter(): void {
    if (!this.counter) return;
    const delivered = this.crates.filter((crate) => crate.delivered).length;
    this.counter.textContent = delivered === BELONGINGS.length
      ? "HOME, AT LAST"
      : `${delivered} / ${BELONGINGS.length} BELONGINGS HOME · ${this.trunkOpen ? "TRUNK OPEN" : "PRESS E AT TRUNK"}`;
  }
}
