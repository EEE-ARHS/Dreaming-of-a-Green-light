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

const WORLD_COLLISION_MASK = 1;
const PLAYER_COLLISION_MASK = 2;
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
  private readonly raycaster = new THREE.Raycaster();
  private readonly mouseNdc = new THREE.Vector2();
  private readonly mouseGrabTarget = new THREE.Vector3();
  private readonly grabVelocity = new THREE.Vector3();
  private lastMouseX = 0;
  private lastMouseY = 0;
  private grabbedCrate: Crate | null = null;
  private grabbedDoor: THREE.Group | null = null;
  private pointerHeld = false;
  private grabDistance = 2;
  private yaw = 0;
  private pitch = 0;
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
  private savedFog: THREE.Scene["fog"] = null;
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
    this.savedFog = this.ctx.scene.fog;
    this.ctx.scene.fog = new THREE.Fog("#17120e", 3.5, 16);
    this.won = false;
    this.expired = false;
    this.dragged = null;
    this.crates = [];
    this.physicsAggregates = [];
    this.modelLoadToken = { cancelled: false };
    this.storyIndex = 0;
    this.yaw = 0;
    this.pitch = 0;

    const room = this.buildRoom();
    this.room = room;
    this.houseRoot = room;
    this.ctx.scene.add(room);
    this.trunkOpen = false;
    this.playerSpeed = 0;
    this.player = new PlayerController(this.ctx.scene, this.requirePhysics());
    this.player.setAvatarVisible(true);
    this.buildExterior();
    this.buildCarAndBelongings();
    this.player.setCutscenePosition(new THREE.Vector3(-0.34, 0.06, ARRIVAL_START_Z - 0.55), Math.PI);
    this.syncMeshes();

    this.arrivalPhase = "driving";
    this.arrivalElapsed = 0;
    this.showedValleyBeat = false;
    this.showedEggBeat = false;
    camera.position.set(7.5, 2.8, ARRIVAL_START_Z - 7.5);
    camera.lookAt(0, 1.15, ARRIVAL_START_Z + 1.8);
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.fov = 54;
    camera.updateProjectionMatrix();
    this.ctx.say("The city fell away behind Nick. Ahead lay the grey Valley of Ashes, then the green shore of West Egg.", 4.5, true);
    this.counter = crateCounter;
    this.counter?.classList.add("show");
    this.updateCounter();

    const canvas = this.ctx.engine.domElement;
    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("blur", this.onWindowBlur);
    canvas.addEventListener("mousedown", this.onMouseDown);
    window.addEventListener("mouseup", this.onMouseUp);
    window.addEventListener("mousemove", this.onMouseMove);
    document.addEventListener("pointerlockchange", this.onPointerLockChange);
    canvas.addEventListener("contextmenu", this.onContextMenu);
    canvas.style.cursor = "default";

    dom.hud.classList.add("live");
    dom.letterbox.classList.remove("on");
  }

  update(dt: number): void {
    if (!this.room) return;
    if (this.arrivalPhase !== "done") {
      this.player?.updatePresentation();
      this.updateArrivalCutscene(dt);
      return;
    }
    this.updateLook(dt);
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
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("blur", this.onWindowBlur);
    const canvas = this.ctx.engine.domElement;
    canvas.removeEventListener("mousedown", this.onMouseDown);
    window.removeEventListener("mouseup", this.onMouseUp);
    window.removeEventListener("mousemove", this.onMouseMove);
    document.removeEventListener("pointerlockchange", this.onPointerLockChange);
    canvas.removeEventListener("contextmenu", this.onContextMenu);
    if (document.pointerLockElement === canvas) document.exitPointerLock();
    this.releaseMouseGrab();
    this.dragged = null;
    this.player?.setCarrying(false);
    this.player?.dispose();
    this.player = null;
    this.trunkOpen = false;
    this.tailgate = null;
    canvas.style.cursor = "default";
    document.getElementById("crosshair")?.classList.remove("is-grabbing", "is-interactive");
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
    this.ctx.scene.fog = this.savedFog;
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

  private updatePlayerCamera(_dt: number): void {
    const player = this.player;
    if (!player) return;
    const camera = this.ctx.camera;
    camera.position.set(player.position.x, 1.62, player.position.z);
    this.updateCamera();
    this.moveForward.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    this.playerFocus.copy(player.position).addScaledVector(this.moveForward, 0.9);
    this.updateMouseNdc();
    this.updateCrosshairTarget();
    if (this.pointerHeld) this.updatePointerGrab();
  }

  private readonly onWindowBlur = (): void => {
    this.walkDirection.set(0, 0, 0);
    this.playerSpeed = 0;
    this.ctx.keys.clear();
    this.pointerHeld = false;
    this.releaseMouseGrab();
  };

  private readonly onPointerLockChange = (): void => {
    if (document.pointerLockElement !== this.ctx.engine.domElement && !this.pointerHeld) return;
    this.lastMouseX = window.innerWidth / 2;
    this.lastMouseY = window.innerHeight / 2;
    if (this.grabbedDoor) {
      this.grabbedDoor.userData.dragStartX = this.lastMouseX;
      this.grabbedDoor.userData.dragStartY = this.lastMouseY;
    }
  };

  private readonly onMouseDown = (event: MouseEvent): void => {
    if (this.arrivalPhase !== "done") return;
    if (event.button === 0) {
      this.pointerHeld = true;
      this.lastMouseX = event.clientX;
      this.lastMouseY = event.clientY;
      this.updateMouseNdc();
      this.updateCrosshairTarget();
      this.beginPointerGrab();
      if (!this.grabbedCrate) void this.ctx.engine.domElement.requestPointerLock?.();
    } else if (event.button === 2 && document.pointerLockElement === this.ctx.engine.domElement) {
      document.exitPointerLock();
    }
  };

  private readonly onMouseUp = (event: MouseEvent): void => {
    if (event.button !== 0) return;
    this.pointerHeld = false;
    this.releaseMouseGrab();
  };

  private readonly onMouseMove = (event: MouseEvent): void => {
    if (document.pointerLockElement === this.ctx.engine.domElement && this.arrivalPhase === "done") {
      this.lastMouseX += event.movementX;
      this.lastMouseY += event.movementY;
      this.yaw -= event.movementX * 0.0022;
      this.pitch = THREE.MathUtils.clamp(this.pitch - event.movementY * 0.0018, -0.95, 0.9);
      this.updatePlayerCamera(0);
      return;
    }
    this.lastMouseX = event.clientX;
    this.lastMouseY = event.clientY;
    this.updateMouseNdc();
  };

  private readonly onContextMenu = (event: MouseEvent): void => event.preventDefault();

  private updateMouseNdc(): void {
    if (document.pointerLockElement === this.ctx.engine.domElement) {
      this.mouseNdc.set(0, 0);
      return;
    }
    const rect = this.ctx.engine.domElement.getBoundingClientRect();
    this.mouseNdc.set(
      ((this.lastMouseX - rect.left) / Math.max(1, rect.width)) * 2 - 1,
      1 - ((this.lastMouseY - rect.top) / Math.max(1, rect.height)) * 2,
    );
  }

  private interactionHit(): THREE.Intersection | undefined {
    this.raycaster.setFromCamera(this.mouseNdc, this.ctx.camera);
    const targets: THREE.Object3D[] = [];
    for (const crate of this.crates) {
      if (!crate.delivered) targets.push(crate.mesh);
    }
    if (this.tailgate) targets.push(this.tailgate);
    if (this.carRoot) targets.push(...this.carRoot.children.filter((child) => child.name.startsWith("nick-car-openable-door-")));
    return this.raycaster.intersectObjects(targets, true)[0];
  }

  private crateNearCrosshair(): { crate: Crate; distance: number; point: THREE.Vector3 } | undefined {
    this.raycaster.setFromCamera(this.mouseNdc, this.ctx.camera);
    let nearest: { crate: Crate; distance: number; point: THREE.Vector3; offset: number } | undefined;
    for (const crate of this.crates) {
      if (crate.delivered) continue;
      const toCenter = crate.proxy.position.clone().sub(this.raycaster.ray.origin);
      const distance = toCenter.dot(this.raycaster.ray.direction);
      if (distance < 0 || distance > 7) continue;
      const point = this.raycaster.ray.at(distance, new THREE.Vector3());
      const offset = point.distanceTo(crate.proxy.position);
      const forgivingRadius = Math.max(1.1, crate.size * 1.65);
      if (offset > forgivingRadius || (nearest && offset >= nearest.offset)) continue;
      nearest = { crate, distance, point, offset };
    }
    return nearest;
  }

  private updateCrosshairTarget(): void {
    const crosshair = document.getElementById("crosshair");
    if (!crosshair) return;
    const hit = this.interactionHit();
    const target = hit?.object;
    const door = target ? this.findCarDoor(target) : null;
    const tailgate = target ? this.findTailgate(target) : null;
    const exactCrate = target ? this.crates.find((item) => !item.delivered && item.mesh.getObjectById(target.id)) : undefined;
    const crate = exactCrate ?? this.crateNearCrosshair()?.crate;
    const crateInRange = Boolean(crate && (exactCrate ? hit!.distance <= 7 : crate.proxy.position.distanceTo(this.ctx.camera.position) <= 7));
    crosshair.classList.toggle("is-interactive", Boolean(crateInRange || (hit && hit.distance <= 7 && (door || tailgate))));
  }

  private beginPointerGrab(): void {
    if (this.grabbedCrate || this.grabbedDoor) return;
    const hit = this.interactionHit();
    if (hit && hit.distance <= 7) {
      const door = this.findCarDoor(hit.object);
      if (door) {
        this.grabbedDoor = door;
        door.userData.dragStartX = this.lastMouseX;
        door.userData.dragInitialRotation = door.rotation.y;
        document.getElementById("crosshair")?.classList.add("is-grabbing");
        return;
      }
      const tailgate = this.findTailgate(hit.object);
      if (tailgate) {
        this.grabbedDoor = tailgate;
        tailgate.userData.dragStartY = this.lastMouseY;
        tailgate.userData.dragInitialRotation = tailgate.rotation.x;
        document.getElementById("crosshair")?.classList.add("is-grabbing");
        return;
      }
    }

    const exactCrate = hit && hit.distance <= 7
      ? this.crates.find((item) => !item.delivered && item.mesh.getObjectById(hit.object.id))
      : undefined;
    const forgivingHit = exactCrate ? undefined : this.crateNearCrosshair();
    const crate = exactCrate ?? forgivingHit?.crate;
    const grabDistance = exactCrate ? hit!.distance : forgivingHit?.distance ?? 0;
    const grabPoint = exactCrate ? hit!.point : forgivingHit?.point;
    if (!crate || grabDistance > 7 || (this.dragged && this.dragged !== crate)) return;
    this.grabbedCrate = crate;
    this.dragged = crate;
    this.grabDistance = THREE.MathUtils.clamp(grabDistance, 0.7, 4.5);
    crate.body.setMotionType(PhysicsMotionType.DYNAMIC);
    crate.body.setLinearVelocity(new THREE.Vector3());
    crate.body.setAngularVelocity(new THREE.Vector3());
    this.player?.setCarrying(true, grabPoint ?? crate.proxy.position);
    document.getElementById("crosshair")?.classList.add("is-grabbing");
  }

  private updatePointerGrab(): void {
    if (this.grabbedDoor) {
      if (this.grabbedDoor.name.startsWith("nick-car-openable-door-")) {
        const side = this.grabbedDoor.name.endsWith("left") ? -1 : 1;
        const delta = (this.lastMouseX - Number(this.grabbedDoor.userData.dragStartX)) * 0.003;
        this.grabbedDoor.rotation.y = THREE.MathUtils.clamp(Number(this.grabbedDoor.userData.dragInitialRotation) + delta * side, 0, 1.15);
      } else if (this.grabbedDoor === this.tailgate) {
        const delta = (this.lastMouseY - Number(this.grabbedDoor.userData.dragStartY)) * 0.004;
        this.grabbedDoor.rotation.x = THREE.MathUtils.clamp(Number(this.grabbedDoor.userData.dragInitialRotation) - delta, -Math.PI / 2, 0);
        this.trunkOpen = this.grabbedDoor.rotation.x < -0.2;
        this.updateCounter();
      }
      return;
    }
    if (!this.grabbedCrate) return;
    this.updateHeldObject();
  }

  private findCarDoor(object: THREE.Object3D): THREE.Group | null {
    let node: THREE.Object3D | null = object;
    while (node && !node.name.startsWith("nick-car-openable-door-")) node = node.parent;
    return node instanceof THREE.Group ? node : null;
  }

  private findTailgate(object: THREE.Object3D): THREE.Group | null {
    let node: THREE.Object3D | null = object;
    while (node && node !== this.tailgate) node = node.parent;
    return node === this.tailgate ? this.tailgate : null;
  }

  private releaseMouseGrab(): void {
    if (this.grabbedCrate) {
      const crate = this.grabbedCrate;
      this.updateHeldObject();
      crate.body.setMotionType(PhysicsMotionType.DYNAMIC);
      crate.body.setLinearVelocity(new THREE.Vector3());
      crate.body.setAngularVelocity(new THREE.Vector3());
      if (this.dragged === crate) this.dragged = null;
      this.player?.setCarrying(false);
      this.ctx.say(`${crate.label} released. Carry it to the house.`, 2, true);
    }
    this.grabbedCrate = null;
    this.grabbedDoor = null;
    this.grabVelocity.set(0, 0, 0);
    document.getElementById("crosshair")?.classList.remove("is-grabbing");
  };

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    const key = event.key.toLowerCase();
    if (["w", "a", "s", "d", "e", "i", "j", "k", "l", "arrowup", "arrowdown", "arrowleft", "arrowright", " "].includes(key)) event.preventDefault();
    if (event.repeat || this.arrivalPhase !== "done") return;
    if (key === "e") this.interactWithTrunkOrBelonging();
  };

  private updateLook(dt: number): void {
    const { keys } = this.ctx;
    const lookSpeed = 1.8 * dt;
    this.yaw += (Number(keys.has("l")) - Number(keys.has("j"))) * lookSpeed;
    this.pitch = THREE.MathUtils.clamp(
      this.pitch + (Number(keys.has("i")) - Number(keys.has("k"))) * lookSpeed,
      -0.95,
      0.9,
    );
  }

  private updateWalk(dt: number): void {
    const player = this.player;
    if (!player) return;
    const { keys } = this.ctx;
    const forwardInput = Number(keys.has("w") || keys.has("arrowup")) - Number(keys.has("s") || keys.has("arrowdown"));
    const sideInput = Number(keys.has("d") || keys.has("arrowright")) - Number(keys.has("a") || keys.has("arrowleft"));
    this.moveForward.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    this.walkDirection.set(
      this.moveForward.x * forwardInput - this.moveForward.z * sideInput,
      0,
      this.moveForward.z * forwardInput + this.moveForward.x * sideInput,
    );
    if (this.walkDirection.lengthSq() > 1) this.walkDirection.normalize();
    player.yaw = this.yaw;
    this.playerSpeed = player.move(forwardInput, sideInput, dt, keys.has(" "));
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
        crate.body.setMotionType(PhysicsMotionType.ANIMATED);
        crate.body.setTransform(crate.proxy.position, crate.proxy.quaternion);
        crate.body.setLinearVelocity(new THREE.Vector3());
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
      const inCarPosition = new THREE.Vector3(-0.34, 0.06, carZ - 0.55);
      this.player?.setCutscenePosition(inCarPosition, Math.PI);
      camera.position.set(7.5, 2.8, carZ - 7.5);
      camera.lookAt(0, 1.15, carZ + 1.8);
      camera.fov = 54;
      camera.updateProjectionMatrix();

      if (carRoot.position.z >= ARRIVAL_PARK_Z) {
        carRoot.position.z = ARRIVAL_PARK_Z;
        this.arrivalPhase = "entering";
        this.arrivalElapsed = 0;
        this.player?.setCutscenePosition(new THREE.Vector3(-0.34, 0.06, carRoot.position.z - 0.55), Math.PI);
        for (const crate of this.crates) {
          crate.body.setMotionType(PhysicsMotionType.DYNAMIC);
          crate.body.setTransform(crate.proxy.position, crate.proxy.quaternion);
          crate.body.setLinearVelocity(new THREE.Vector3());
        }
      }
      return;
    }
    const progress = THREE.MathUtils.clamp(this.arrivalElapsed / ARRIVAL_CAMERA_BLEND_SECONDS, 0, 1);
    const eased = progress * progress * (3 - 2 * progress);
    const exitProgress = THREE.MathUtils.smoothstep(progress, 0.18, 0.82);
    const parkedCarZ = this.carRoot?.position.z ?? ARRIVAL_PARK_Z;
    const cutscenePlayerPosition = new THREE.Vector3(-0.34, 0.06, parkedCarZ - 0.55).lerp(new THREE.Vector3(0, 0.06, parkedCarZ - 3.4), exitProgress);
    this.player?.setCutscenePosition(cutscenePlayerPosition, THREE.MathUtils.lerp(Math.PI, 0, exitProgress));
    camera.position.lerpVectors(
      this.cameraDesired.set(7.5, 2.8, ARRIVAL_PARK_Z - 7.5),
      new THREE.Vector3(0, 1.62, -3.1),
      eased,
    );
    this.lookAt.lerpVectors(
      this.targetDesired.set(0, 1.15, ARRIVAL_PARK_Z + 1.8),
      new THREE.Vector3(0, 1.62, -11.1),
      eased,
    );
    camera.lookAt(this.lookAt);
    camera.fov = THREE.MathUtils.lerp(54, 68, eased);
    camera.updateProjectionMatrix();
    if (progress >= 1) {
      this.arrivalPhase = "done";
      this.player?.resumeWalking(new THREE.Vector3(0, 0.06, -3.1), 0);
      this.player?.setAvatarVisible(false);
      camera.position.set(0, 1.68, -3.1);
      this.yaw = 0;
      this.pitch = 0;
      this.trunkOpen = false;
      if (this.tailgate) this.tailgate.rotation.x = 0;
      this.syncMeshes();
      this.updateCounter();
      this.updateCamera();
      this.ctx.say("WASD / arrows walk · IJKL look · E opens the trunk and carries / sets down items · hold left mouse on any item to drag it.", 4.3, true);
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
    // Give loose cargo a physical floor and sides while the car is moving and parked.
    const trunkColliders: { name: string; position: [number, number, number]; extents: [number, number, number] }[] = [
      { name: "trunk-floor", position: [0, 0.59, -1.4], extents: [2.05, 0.12, 1.8] },
      { name: "trunk-left-wall", position: [-1.03, 0.83, -1.4], extents: [0.13, 0.54, 1.8] },
      { name: "trunk-right-wall", position: [1.03, 0.83, -1.4], extents: [0.13, 0.54, 1.8] },
      { name: "trunk-front-wall", position: [0, 0.83, -0.48], extents: [1.8, 0.54, 0.13] },
    ];
    for (const { name, position, extents } of trunkColliders) {
      const collider = new THREE.Mesh(new THREE.BoxGeometry(...extents), new THREE.MeshBasicMaterial({ visible: false }));
      collider.name = `physics:car-${name}`;
      collider.position.set(...position);
      collider.visible = false;
      group.add(collider);
      const aggregate = new PhysicsAggregate(collider, PhysicsShapeType.BOX, {
        mass: 0,
        friction: 0.72,
        restitution: 0.02,
        extents: new THREE.Vector3(...extents),
        filterMembershipMask: WORLD_COLLISION_MASK,
        filterCollideMask: WORLD_COLLISION_MASK | PLAYER_COLLISION_MASK,
      }, this.requirePhysics());
      aggregate.body.setMotionType(PhysicsMotionType.ANIMATED);
      this.physicsAggregates.push(aggregate);
    }
    // Procedural fallback keeps the trunk and belongings visible if an override is absent or fails.
    this.tailgate = createNickCarModel(group, this.trunkHinge);
    const trunkSlots: [number, number, number][] = [
      [-0.42, 0.75, -1.8], [0.42, 0.75, -1.8], [-0.42, 0.75, -1.18], [0.42, 0.75, -1.18],
      [0, 1.3, -1.8], [-0.28, 1.3, -1.18], [0.28, 1.3, -1.18],
    ];
    BELONGINGS.forEach((spec, index) => {
      const [slotX, slotY, slotZ] = trunkSlots[index] ?? [0, 0.75, -1.5];
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
      friction: 0.82,
      restitution: 0,
      extents: new THREE.Vector3(size, size, size),
      filterMembershipMask: WORLD_COLLISION_MASK,
      filterCollideMask: WORLD_COLLISION_MASK | PLAYER_COLLISION_MASK,
    }, this.requirePhysics());
    aggregate.body.setMotionType(PhysicsMotionType.DYNAMIC);
    aggregate.body.havokBody.setLinearDamping(2.5);
    aggregate.body.havokBody.setAngularDamping(5);
    this.physicsAggregates.push(aggregate);
    const body = aggregate.body;
    mesh.position.copy(spawn);
    mesh.quaternion.copy(proxy.quaternion);
    this.crates.push({ mesh, proxy, body, size, spawn, destination: new THREE.Vector3(...spec.housePosition), label: spec.name, story: spec.story, delivered: false, storyShown: false, savedTarget: new THREE.Vector3(...spec.housePosition) });
  }

  private trunkDistance(): number {
    if (!this.player || !this.carRoot) return Infinity;
    this.trunkPosition.set(0, 0, -2.72).applyQuaternion(this.carRoot.quaternion).add(this.carRoot.position);
    this.trunkPosition.z = this.carRoot.position.z - 2.72;
    return Math.hypot(this.player.position.x - this.trunkPosition.x, this.player.position.z - this.trunkPosition.z);
  }

  private interactWithTrunkOrBelonging(): void {
    if (!this.player) return;
    if (this.dragged && !this.grabbedCrate) {
      const crate = this.dragged;
      this.updateHeldObject();
      this.dragged = null;
      crate.body.setMotionType(PhysicsMotionType.DYNAMIC);
      crate.body.setTransform(crate.proxy.position, crate.proxy.quaternion);
      crate.body.setLinearVelocity(new THREE.Vector3());
      crate.body.setAngularVelocity(new THREE.Vector3());
      this.player.setCarrying(false);
      this.ctx.say(crate.proxy.position.z >= THRESHOLD_Z ? `${crate.label} made it inside.` : `${crate.label} set down. Press E to carry it again.`, 2.2, true);
      return;
    }
    const trunkDistance = this.trunkDistance();
    if (this.trunkOpen && trunkDistance <= 3.8) {
      const nearest = this.crates
        .filter((crate) => !crate.delivered && crate.proxy.position.distanceTo(this.carRoot!.position) < 4.2)
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
      if (this.tailgate) this.tailgate.rotation.x = this.trunkOpen ? -Math.PI / 2 : 0;
      this.updateCounter();
      this.ctx.say(this.trunkOpen ? "The trunk is open. Press E beside a belonging to carry it." : "The trunk is closed.", 2.8, true);
      return;
    }

    const nearest = this.crates
      .filter((crate) => !crate.delivered && crate.proxy.position.distanceTo(this.player!.position) <= 2.2)
      .sort((a, b) => a.proxy.position.distanceTo(this.player!.position) - b.proxy.position.distanceTo(this.player!.position))[0];
    if (nearest) {
      this.dragged = nearest;
      nearest.body.setMotionType(PhysicsMotionType.DYNAMIC);
      nearest.body.setLinearVelocity(new THREE.Vector3());
      this.player.setCarrying(true);
      this.ctx.say(`${nearest.label} in hand. Carry it through the doorway and press E to set it down.`, 3.2, true);
      return;
    }
    this.ctx.say("Move close to a belonging or the back of Nick's car, then press E.", 2.5, true);
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
    if (this.grabbedCrate) {
      this.raycaster.setFromCamera(this.mouseNdc, this.ctx.camera);
      this.mouseGrabTarget.copy(this.raycaster.ray.origin).addScaledVector(this.raycaster.ray.direction, this.grabDistance);
      this.mouseGrabTarget.y = Math.max(crate.size / 2 + 0.08, this.mouseGrabTarget.y);
      this.grabVelocity.copy(this.mouseGrabTarget).sub(crate.proxy.position).multiplyScalar(20);
      if (this.grabVelocity.length() > 12) this.grabVelocity.setLength(12);
      crate.body.setLinearVelocity(this.grabVelocity);
      crate.body.setAngularVelocity(new THREE.Vector3());
    } else {
      this.moveForward.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
      this.mouseGrabTarget.copy(player.position).addScaledVector(this.moveForward, 0.9).add(new THREE.Vector3(0, 0.72, 0));
      this.mouseGrabTarget.y = Math.max(crate.size / 2 + 0.08, this.mouseGrabTarget.y);
      if (crate.body.motionType !== PhysicsMotionType.DYNAMIC) crate.body.setMotionType(PhysicsMotionType.DYNAMIC);
      const carryVelocity = this.mouseGrabTarget.clone().sub(crate.proxy.position).multiplyScalar(18);
      if (carryVelocity.length() > 10) carryVelocity.setLength(10);
      crate.body.setLinearVelocity(carryVelocity);
      crate.body.setAngularVelocity(new THREE.Vector3());
    }
    player.setCarrying(true, this.mouseGrabTarget);
  }

  private simulateCrates(_dt: number): void {
    if (this.dragged && this.dragged.body.motionType !== PhysicsMotionType.DYNAMIC) {
      this.dragged.body.setMotionType(PhysicsMotionType.DYNAMIC);
    }
  }

  private syncMeshes(): void {
    for (const crate of this.crates) {
      crate.mesh.position.copy(crate.proxy.position);
      crate.mesh.quaternion.copy(crate.proxy.quaternion);
    }
  }

  private respawnStragglers(): void {
    for (const crate of this.crates) {
      const { position } = crate.proxy;
      if (crate.delivered) continue;
      const lost = position.y < -4 || Math.abs(position.x) > ROOM_HALF + 4 || Math.abs(position.z) > ROOM_HALF + 5;
      if (!lost) continue;
      crate.proxy.position.copy(crate.spawn);
      crate.proxy.quaternion.identity();
      crate.body.setMotionType(PhysicsMotionType.DYNAMIC);
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
      if (this.grabbedCrate === crate) {
        this.grabbedCrate = null;
        this.pointerHeld = false;
        this.grabVelocity.set(0, 0, 0);
        document.getElementById("crosshair")?.classList.remove("is-grabbing");
      }
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
