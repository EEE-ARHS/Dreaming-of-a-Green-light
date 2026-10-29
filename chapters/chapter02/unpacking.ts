import * as THREE from "three";
import gatsbyFaceUrl from "./assets/gatsby-indiewire-face.jpg";
import type { ChapterContext, ChapterFlavor, ChapterOutcome } from "../../frontend/src/chapters/types";
import { PhysicsAggregate, PhysicsMotionType, PhysicsShapeType, type HavokPhysics, type PhysicsBody } from "../../frontend/src/physics";
import { PlayerController } from "../../frontend/src/player-controller";
import { crateCounter } from "../../frontend/src/ui";
import manifest from "./assets/unpacking-manifest.json";
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
const CAR_COLLISION_MASK = 4;
const CARGO_COLLISION_MASK = 8;
const TRUNK_COLLISION_MASK = 16;
const BELONGING_COLLISION_MASK = WORLD_COLLISION_MASK | PLAYER_COLLISION_MASK | TRUNK_COLLISION_MASK | CARGO_COLLISION_MASK;
const ARRIVAL_START_Z = -104;
const ARRIVAL_PARK_Z = -8.25;
const ARRIVAL_SPEED = 6.4;
const ARRIVAL_CAMERA_BLEND_SECONDS = 2.6;
const ARRIVAL_FAST_FORWARD_MULTIPLIER = 3;
const ENDING_CUTSCENE_SECONDS = 6.2;
const ECKLEBURG_SIGN_FOCUS = new THREE.Vector3(-15, 9.5, -52.8);

export const id = "nicksHouseUnpacking";
export const name = manifest.name;
export const blurb = manifest.blurb;
export const command = manifest.command;
export const how = manifest.how;
export const slot = manifest.slot;


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

export class NicksUnpackingChapter {
  readonly id = id;
  readonly name = name;
  readonly blurb = blurb;
  readonly command = command;
  readonly how = how;
  readonly physicsScale = 1;
  readonly firstPerson = true;
  readonly slot = slot;
  private readonly ctx: ChapterContext;
  private readonly modelAssetSource: ModelAssetSource;
  private readonly walkDirection = new THREE.Vector3();
  private readonly moveForward = new THREE.Vector3();
  private readonly playerFocus = new THREE.Vector3();
  private readonly lookAt = new THREE.Vector3();
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
  private showedSignBeat = false;
  private showedEggBeat = false;
  private readonly trunkPosition = new THREE.Vector3();
  private readonly trunkHinge = new THREE.Group();
  private tailgate: THREE.Group | null = null;
  private room: THREE.Group | null = null;
  private crates: Crate[] = [];
  private readonly cratesToRelease = new Set<Crate>();
  private readonly cratesReadyToRelease = new Set<Crate>();
  private physicsAggregates: PhysicsAggregate[] = [];
  private dragged: Crate | null = null;
  private won = false;
  private endingElapsed = 0;
  private endingStarted = false;
  private endingTitleShown = false;
  private farewellCuePlayed = false;
  private porchRevealCuePlayed = false;
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
    this.endingElapsed = 0;
    this.endingStarted = false;
    this.endingTitleShown = false;
    this.farewellCuePlayed = false;
    this.porchRevealCuePlayed = false;
    this.dragged = null;
    this.crates = [];
    this.cratesToRelease.clear();
    this.cratesReadyToRelease.clear();
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
    this.player.setAvatarVisible(false);
    this.buildExterior();
    this.buildCarAndBelongings();
    this.player.setCutscenePosition(new THREE.Vector3(-0.34, 0.24, ARRIVAL_START_Z - 0.55), Math.PI);
    this.syncMeshes();

    this.arrivalPhase = "driving";
    this.arrivalElapsed = 0;
    this.showedValleyBeat = false;
    this.showedSignBeat = false;
    this.showedEggBeat = false;
    camera.position.set(-0.34, 1.86, ARRIVAL_START_Z - 0.55);
    camera.lookAt(-16, 9.55, -53.5);
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.fov = 54;
    camera.updateProjectionMatrix();
    this.ctx.say("The city fell away behind Nick. Ahead lay the grey Valley of Ashes, then the green shore of West Egg. Hold Shift to hurry the drive.", 5.2, true);
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
    if (this.won) {
      this.updateEndingCutscene(dt);
      this.player?.updatePresentation();
      return;
    }
    const simulationDt = Math.min(dt, 1 / 30);
    if (this.arrivalPhase !== "done") {
      this.player?.updatePresentation();
      this.updateArrivalCutscene(simulationDt);
      return;
    }
    dt = simulationDt;
    this.updateLook(dt);
    this.updateWalk(dt);
    this.player?.update(dt, this.playerSpeed);
    this.updateTrunk(dt);
    this.updateHeldObject();
    this.updatePlayerCamera(dt);
    this.syncMeshes();
    this.respawnStragglers();
    this.checkThreshold();
    this.updateStory();
    this.simulateCrates(dt);
  }

  idle(_dt: number): void {
    /* The room is only built while a round is live. */
  }

  abandon(): void {
    this.dispose();
  }

  outcome(): ChapterOutcome {
    if (this.won && this.endingElapsed >= ENDING_CUTSCENE_SECONDS) return "win";
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
    const signLight = this.exterior?.getObjectByName("eckleburg-sign-light");
    if (signLight instanceof THREE.SpotLight) signLight.intensity = 0;
    for (const child of this.exterior?.children ?? []) {
      if (child.name.startsWith("gatsby-mansion-") || child.name.startsWith("gatsby-ballroom-") || child.name.startsWith("gatsby-dock-") || child.name.startsWith("gatsby-terrace-guest")) child.visible = true;
    }
    this.resetTailgatePose();
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
    this.player?.setWaving(false);
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
      void this.ctx.engine.domElement.requestPointerLock?.();
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
    // Interaction follows the fixed first-person reticle, not the system cursor.
    this.mouseNdc.set(0, 0);
  }

  private interactionHit(): THREE.Intersection | undefined {
    this.raycaster.setFromCamera(this.mouseNdc, this.ctx.camera);
    const targets: THREE.Object3D[] = [];
    for (const crate of this.crates) {
      if (!crate.delivered) targets.push(crate.proxy);
    }
    if (this.tailgate) targets.push(this.tailgate);
    if (this.carRoot) targets.push(...this.carRoot.children.filter((child) => child.name.startsWith("nick-car-openable-door-")));
    return this.raycaster.intersectObjects(targets, true)[0];
  }

  private updateCrosshairTarget(): void {
    const crosshair = document.getElementById("crosshair");
    if (!crosshair) return;
    const hit = this.interactionHit();
    const target = hit?.object;
    const door = target ? this.findCarDoor(target) : null;
    const tailgate = target ? this.findTailgate(target) : null;
    const crate = target ? this.crates.find((item) => !item.delivered && item.proxy.getObjectById(target.id)) : undefined;
    const nearbyCrate = !hit || hit.distance > 7
      ? this.crates.find((item) => !item.delivered && item.proxy.position.distanceTo(this.playerFocus) <= 2.2)
      : undefined;
    const crateInRange = Boolean(crate && hit && hit.distance <= 7);
    crosshair.classList.toggle("is-interactive", Boolean(crateInRange || nearbyCrate || (hit && hit.distance <= 7 && (door || tailgate))));
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

    if (!hit || hit.distance > 7) return;
    const crate = this.crates.find((item) => !item.delivered && item.proxy.getObjectById(hit.object.id));
    if (!crate || (this.dragged && this.dragged !== crate)) return;
    this.grabbedCrate = crate;
    this.grabDistance = Math.max(0.1, crate.proxy.position.clone().sub(this.raycaster.ray.origin).dot(this.raycaster.ray.direction));
    this.prepareCrateForCarry(crate, hit.point);
    this.updateHeldObject();
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
        const closedAngle = -Math.PI / 2;
        const openAngle = -Math.PI;
        this.grabbedDoor.rotation.x = THREE.MathUtils.clamp(Number(this.grabbedDoor.userData.dragInitialRotation) - delta, closedAngle, openAngle);
        this.trunkOpen = this.grabbedDoor.rotation.x > closedAngle + 0.2;
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
      this.grabbedCrate = null;
      if (this.dragged === crate) this.dragged = null;
      this.queueCrateRelease(crate);
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

  private updateEndingCutscene(dt: number): void {
    if (!this.endingStarted) {
      this.endingStarted = true;
      this.endingElapsed = 0;
      this.player?.setCutscenePosition(new THREE.Vector3(0, 0.06, -3.1), 0, false);
      this.player?.setAvatarVisible(true);
      this.player?.setWaving(true);
      this.ctx.say("Nick's little house is home. Across the bay, Gatsby waits alone on his porch.", ENDING_CUTSCENE_SECONDS, true);
      this.farewellCuePlayed = false;
      this.porchRevealCuePlayed = false;
    }
    this.endingElapsed += Math.min(dt, 0.1);
    const camera = this.ctx.camera;
    const pullbackProgress = THREE.MathUtils.smoothstep(this.endingElapsed, 0, 2.1);
    const waveHold = THREE.MathUtils.smoothstep(this.endingElapsed, 0.2, 0.55) * (1 - THREE.MathUtils.smoothstep(this.endingElapsed, 2.2, 3.05));
    const panProgress = THREE.MathUtils.smoothstep(this.endingElapsed, 1.8, 5.6);
    const nickPosition = this.player?.position ?? new THREE.Vector3(0, 0.06, -3.1);
    const gatsbyPorch = new THREE.Vector3(16.2, 4.05, -41.3);
    const closeCamera = new THREE.Vector3(0, 2.25, -6.7);
    const wideCamera = new THREE.Vector3(0, 3.1, -13.2);
    const pullbackCamera = closeCamera.lerp(wideCamera, pullbackProgress);
    const panCamera = new THREE.Vector3(11.3, 5.1, -36.5);
    const cameraPosition = pullbackCamera.lerp(panCamera, panProgress);
    const nickLookTarget = new THREE.Vector3(nickPosition.x, 1.34, nickPosition.z);
    const wideLookTarget = new THREE.Vector3(0, 1.5, -2.5);
    const lookTarget = nickLookTarget.lerp(wideLookTarget, pullbackProgress).lerp(gatsbyPorch, panProgress);
    if (!this.farewellCuePlayed && waveHold > 0.05) {
      this.farewellCuePlayed = true;
      this.ctx.audio.playFarewell();
    }
    if (!this.porchRevealCuePlayed && panProgress > 0.12) {
      this.porchRevealCuePlayed = true;
      this.ctx.audio.playPorchReveal();
    }
    if (this.exterior) {
      const mansion = this.exterior.getObjectByName("gatsby-mansion");
      const porch = this.exterior.getObjectByName("gatsby-mansion-porch");
      const porchStep = this.exterior.getObjectByName("gatsby-mansion-porch-step");
      const columns = this.exterior.children.filter((object) => object.name.startsWith("gatsby-mansion-porch-column-"));
      const showMansion = panProgress > 0.06;
      if (mansion) mansion.visible = showMansion;
      if (porch) porch.visible = showMansion;
      if (porchStep) porchStep.visible = showMansion;
      for (const object of this.exterior.children) {
        if (object.name.startsWith("gatsby-mansion-") || object.name.startsWith("gatsby-ballroom-") || object.name.startsWith("gatsby-dock-") || object.name.startsWith("gatsby-terrace-guest")) object.visible = showMansion;
      }
      columns.forEach((column) => { column.visible = showMansion; });
      let gatsby = this.exterior.getObjectByName("gatsby-on-porch") as THREE.Group | null;
      if (!gatsby && showMansion) {
        gatsby = this.createPorchGatsby();
        this.exterior.add(gatsby);
      }
      if (gatsby) {
        gatsby.visible = showMansion;
        gatsby.rotation.y = THREE.MathUtils.lerp(-0.5, -0.8, panProgress);
        this.animatePorchGatsby(gatsby, dt);
      }
    }
    this.player?.setWaving(waveHold > 0.05);
    this.updatePorchGatsbyFace();
    camera.position.copy(cameraPosition);
    camera.lookAt(lookTarget);
    camera.fov = THREE.MathUtils.lerp(61, 48, panProgress);
    camera.updateProjectionMatrix();
    if (!this.endingTitleShown && this.endingElapsed >= ENDING_CUTSCENE_SECONDS) {
      this.endingTitleShown = true;
      this.ctx.dom.titleFlash("GATSBY'S WEST EGG · ACROSS THE BAY");
    }
  }

  private animatePorchGatsby(gatsby: THREE.Group, dt: number): void {
    const phase = (Number(gatsby.userData.breathPhase) || 0) + dt * 1.25;
    gatsby.userData.breathPhase = phase % (Math.PI * 2);
    const breath = Math.sin(phase);
    const jacket = gatsby.getObjectByName("gatsby-jacket");
    if (jacket instanceof THREE.Mesh) jacket.scale.y = 1 + breath * 0.008;
    const head = gatsby.getObjectByName("gatsby-face");
    if (head instanceof THREE.Mesh) {
      head.position.y = 1.62 + breath * 0.006;
      head.rotation.x = Math.sin(phase * 0.48) * 0.025;
      head.rotation.z = Math.sin(phase * 0.31) * 0.018;
    }
    const faceImage = gatsby.getObjectByName("gatsby-face-image");
    if (faceImage instanceof THREE.Mesh) {
      faceImage.position.y = 1.62 + breath * 0.006;
      faceImage.rotation.x = Math.sin(phase * 0.48) * 0.025;
      faceImage.rotation.z = Math.sin(phase * 0.31) * 0.018;
    }
    const leftHand = gatsby.getObjectByName("gatsby-hand--1");
    if (leftHand instanceof THREE.Mesh) leftHand.position.y = 1.17 + Math.sin(phase * 0.52 + 0.6) * 0.008;
    const lantern = gatsby.getObjectByName("gatsby-porch-lantern-light");
    if (lantern instanceof THREE.PointLight) lantern.intensity = 2.1 + Math.sin(phase * 3.7) * 0.12;
  }

  private updatePorchGatsbyFace(): void {
    const exterior = this.exterior;
    const gatsby = exterior?.getObjectByName("gatsby-on-porch");
    if (!(gatsby instanceof THREE.Group) || gatsby.userData.faceTextureReady) return;
    gatsby.userData.faceTextureReady = true;
    gatsby.userData.faceTexturePending = true;
    const token = this.modelLoadToken;
    const loader = new THREE.TextureLoader();
    loader.load(gatsbyFaceUrl, (texture) => {
      if (token.cancelled || this.exterior !== exterior || gatsby.parent !== exterior) {
        texture.dispose();
        return;
      }
      const face = gatsby.getObjectByName("gatsby-face-image") as THREE.Mesh | null;
      const faceMaterial = face?.material;
      const faceImage = texture.image as HTMLImageElement;
      if (!(faceMaterial instanceof THREE.MeshBasicMaterial) || !faceImage?.naturalWidth) {
        texture.dispose();
        gatsby.userData.faceTexturePending = false;
        return;
      }
      const crop = document.createElement("canvas");
      crop.width = 256;
      crop.height = 320;
      const cropContext = crop.getContext("2d");
      if (!cropContext) {
        texture.dispose();
        gatsby.userData.faceTexturePending = false;
        return;
      }
      cropContext.drawImage(faceImage, 535, 25, 320, 400, 0, 0, crop.width, crop.height);
      texture.dispose();
      const croppedTexture = new THREE.CanvasTexture(crop);
      croppedTexture.colorSpace = THREE.SRGBColorSpace;
      croppedTexture.anisotropy = Math.min(8, this.ctx.engine.capabilities.getMaxAnisotropy());
      faceMaterial.map = croppedTexture;
      faceMaterial.color.set("#ffffff");
      faceMaterial.needsUpdate = true;
      gatsby.userData.faceTexturePending = false;
    }, undefined, (error) => {
      gatsby.userData.faceTexturePending = false;
      console.error("Unable to load Gatsby's face image:", error);
    });
  }

  private createPorchGatsby(): THREE.Group {
    const gatsby = new THREE.Group();
    gatsby.name = "gatsby-on-porch";
    gatsby.position.set(16.2, 2.36, -41.6);
    gatsby.rotation.y = 0;
    gatsby.scale.setScalar(1.3);
    const suit = new THREE.MeshStandardMaterial({ color: "#17191e", roughness: 0.68 });
    const waistcoat = new THREE.MeshStandardMaterial({ color: "#272a31", roughness: 0.72 });
    const shirt = new THREE.MeshStandardMaterial({ color: "#eee8dc", roughness: 0.68 });
    const tie = new THREE.MeshStandardMaterial({ color: "#141519", roughness: 0.58 });
    const skin = new THREE.MeshStandardMaterial({ color: "#c39b7b", roughness: 0.82 });
    const hair = new THREE.MeshStandardMaterial({ color: "#9b805c", roughness: 0.88 });
    const dark = new THREE.MeshStandardMaterial({ color: "#302b27", roughness: 0.8 });
    const brass = new THREE.MeshStandardMaterial({ color: "#b38a4b", metalness: 0.58, roughness: 0.36 });
    const chair = new THREE.MeshStandardMaterial({ color: "#4c3428", roughness: 0.82 });
    const add = (geometry: THREE.BufferGeometry, material: THREE.Material, position: [number, number, number], name = "") => {
      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.set(...position);
      mesh.name = name;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      gatsby.add(mesh);
      return mesh;
    };
    const sphere = new THREE.SphereGeometry(1, 14, 10);
    const box = new THREE.BoxGeometry(1, 1, 1);
    const cylinder = new THREE.CylinderGeometry(1, 1, 1, 10);
    const tapered = new THREE.CylinderGeometry(0.045, 0.07, 0.5, 8);

    // Carved armchair, upholstered seat and turned legs.
    add(box, chair, [0, 0.96, 0.12], "gatsby-chair-seat").scale.set(0.76, 0.13, 0.76);
    add(box, chair, [0, 1.34, 0.46], "gatsby-chair-back").scale.set(0.76, 0.84, 0.12);
    add(box, new THREE.MeshStandardMaterial({ color: "#735640", roughness: 0.94 }), [0, 1.04, 0.02], "gatsby-chair-cushion").scale.set(0.59, 0.12, 0.57);
    for (const side of [-1, 1]) {
      for (const z of [-0.16, 0.4]) {
        const chairLeg = add(cylinder, chair, [side * 0.28, 0.47, z], `gatsby-chair-leg-${side}-${z}`);
        chairLeg.scale.set(0.045, 0.94, 0.045);
        chairLeg.rotation.z = side * 0.06;
      }
      add(cylinder, chair, [side * 0.39, 1.28, 0.1], `gatsby-chair-arm-${side}`).scale.set(0.06, 0.48, 0.59);
      add(sphere, brass, [side * 0.36, 1.58, 0.17], `gatsby-chair-stud-${side}`).scale.setScalar(0.035);
    }

    // Three-piece evening suit with a crisp shirt front, waistcoat and pocket detail.
    const body = add(new THREE.CapsuleGeometry(0.23, 0.42, 5, 12), suit, [0, 1.2, 0], "gatsby-jacket");
    body.rotation.x = -0.32;
    add(new THREE.CapsuleGeometry(0.15, 0.32, 4, 10), waistcoat, [0, 1.24, -0.11], "gatsby-waistcoat");
    add(new THREE.BoxGeometry(0.12, 0.31, 0.035), shirt, [0, 1.36, -0.235], "gatsby-shirt-front");
    add(new THREE.ConeGeometry(0.045, 0.18, 4), tie, [0, 1.31, -0.27], "gatsby-tie");
    add(box, suit, [-0.14, 1.39, -0.22], "gatsby-left-lapel").scale.set(0.09, 0.29, 0.035);
    add(box, suit, [0.14, 1.39, -0.22], "gatsby-right-lapel").scale.set(0.09, 0.29, 0.035);
    for (const buttonY of [1.19, 1.32, 1.44]) add(sphere, brass, [0.075, buttonY, -0.267], `gatsby-button-${buttonY}`).scale.setScalar(0.018);
    add(box, shirt, [-0.14, 1.12, -0.226], "gatsby-pocket-square").scale.set(0.1, 0.045, 0.018);
    const neck = add(cylinder, skin, [0, 1.43, 0], "gatsby-neck");
    neck.scale.set(0.085, 0.17, 0.085);
    const face = add(new THREE.SphereGeometry(1, 18, 14), skin, [0, 1.62, -0.04], "gatsby-face");
    face.scale.set(0.15, 0.18, 0.14);
    const facePlane = new THREE.Mesh(
      new THREE.PlaneGeometry(0.235, 0.292),
      new THREE.MeshBasicMaterial({ color: "#ffffff", side: THREE.DoubleSide, toneMapped: false }),
    );
    facePlane.name = "gatsby-face-image";
    facePlane.position.set(0, 1.62, -0.19);
    gatsby.add(facePlane);
    const hairCap = add(new THREE.SphereGeometry(0.16, 18, 12, 0, Math.PI * 2, 0, Math.PI / 2), hair, [0, 1.68, -0.035], "gatsby-combed-hair");
    hairCap.scale.set(1.02, 0.82, 0.96);
    add(sphere, skin, [-0.145, 1.59, -0.04], "gatsby-ear-left").scale.set(0.035, 0.055, 0.035);
    add(sphere, skin, [0.145, 1.59, -0.04], "gatsby-ear-right").scale.set(0.035, 0.055, 0.035);

    // Seated human proportions: a distinct waist, jointed knees, calves, shoes and relaxed hands.
    add(box, waistcoat, [0, 0.91, 0.08], "gatsby-waist").scale.set(0.3, 0.25, 0.25);
    for (const side of [-1, 1]) {
      const thigh = add(new THREE.CapsuleGeometry(0.085, 0.34, 5, 10), suit, [side * 0.12, 0.69, 0.18], `gatsby-trouser-thigh-${side}`);
      thigh.rotation.x = Math.PI / 2;
      const calf = add(new THREE.CapsuleGeometry(0.065, 0.3, 5, 10), suit, [side * 0.12, 0.51, 0.4], `gatsby-trouser-calf-${side}`);
      calf.rotation.x = Math.PI / 2;
      add(box, dark, [side * 0.12, 0.46, 0.57], `gatsby-shoe-${side}`).scale.set(0.15, 0.07, 0.27);
      const hand = add(sphere, skin, [side * 0.37, 1.17, -0.05], `gatsby-hand-${side}`);
      hand.scale.set(0.09, 0.065, 0.13);
      const sleeve = add(tapered, suit, [side * 0.26, 1.29, 0.04], `gatsby-sleeve-${side}`);
      sleeve.rotation.z = side * 0.58;
      for (let finger = 0; finger < 4; finger++) {
        const digit = add(cylinder, skin, [side * (0.32 + finger * 0.035), 1.12, -0.12], `gatsby-finger-${side}-${finger}`);
        digit.scale.set(0.014, 0.1, 0.014);
        digit.rotation.x = 0.55;
      }
    }
    add(box, brass, [0.09, 1.12, -0.242], "gatsby-watch-chain").scale.set(0.11, 0.018, 0.012);
    const lanternBase = add(cylinder, dark, [-0.83, 0.94, 0.19], "gatsby-lantern-base");
    lanternBase.scale.set(0.17, 0.08, 0.17);
    const lanternFrame = add(cylinder, brass, [-0.83, 1.26, 0.19], "gatsby-lantern-frame");
    lanternFrame.scale.set(0.11, 0.55, 0.11);
    add(sphere, new THREE.MeshBasicMaterial({ color: "#ffdc91" }), [-0.83, 1.27, 0.19], "gatsby-lantern-flame").scale.set(0.07, 0.19, 0.07);
    for (const angle of [0, Math.PI / 2, Math.PI, Math.PI * 1.5]) {
      const bar = add(box, brass, [-0.83, 1.27, 0.19], `gatsby-lantern-bar-${angle}`);
      bar.scale.set(0.018, 0.6, 0.018);
      bar.rotation.y = angle;
    }
    const lantern = new THREE.PointLight("#ffc976", 2.1, 7, 2);
    lantern.name = "gatsby-porch-lantern-light";
    lantern.position.set(-0.83, 1.48, 0.19);
    gatsby.add(lantern);
    return gatsby;
  }

  private updateArrivalCutscene(dt: number): void {
    const camera = this.ctx.camera;
    const cutsceneDt = dt * (this.ctx.keys.has("shift") ? ARRIVAL_FAST_FORWARD_MULTIPLIER : 1);
    this.arrivalElapsed += cutsceneDt;
    if (this.arrivalPhase === "driving") {
      const carRoot = this.carRoot;
      if (!carRoot) return;
      const previousZ = carRoot.position.z;
      const signSlowdownIn = THREE.MathUtils.smoothstep(previousZ, -85, -74);
      const signSlowdownOut = 1 - THREE.MathUtils.smoothstep(previousZ, -55, -44);
      const signSlowdown = signSlowdownIn * signSlowdownOut;
      const cinematicSpeed = THREE.MathUtils.lerp(ARRIVAL_SPEED, 3.6, signSlowdown);
      carRoot.position.z = Math.min(ARRIVAL_PARK_Z, previousZ + cinematicSpeed * cutsceneDt);
      const traveled = carRoot.position.z - previousZ;
      for (const crate of this.crates) {
        crate.proxy.position.z += traveled;
        crate.spawn.z += traveled;
        crate.body.setMotionType(PhysicsMotionType.ANIMATED);
        crate.body.setTransform(crate.proxy.position, crate.proxy.quaternion);
        crate.body.setLinearVelocity(new THREE.Vector3());
        crate.body.setAngularVelocity(new THREE.Vector3());
      }
      this.syncMeshes();

      if (!this.showedSignBeat && carRoot.position.z > -79) {
        this.showedSignBeat = true;
        this.ctx.say("Above the ash heaps, Doctor T. J. Eckleburg's eyes watched the road.", 3.8, true);
      }
      if (!this.showedValleyBeat && carRoot.position.z > -39) {
        this.showedValleyBeat = true;
        this.ctx.say("The road climbed out of the Valley. Grey ash gave way to hedges and the first lights of West Egg.", 4.2, true);
      }
      if (!this.showedEggBeat && carRoot.position.z > -19) {
        this.showedEggBeat = true;
        this.ctx.say("Nick Carraway had crossed the Valley at last. His new home stood just beyond the gate.", 4.2, true);
      }

      const carZ = carRoot.position.z;
      const inCarPosition = new THREE.Vector3(-0.34, 0.24, carZ - 0.55);
      this.player?.setCutscenePosition(inCarPosition, Math.PI);
      camera.position.set(inCarPosition.x, inCarPosition.y + 1.62, inCarPosition.z);
      const signReveal = THREE.MathUtils.smoothstep(carZ, -94, -79);
      const signHold = 1 - THREE.MathUtils.smoothstep(carZ, -55, -46);
      const signFocus = signReveal * signHold;
      const mansionReveal = THREE.MathUtils.smoothstep(carZ, -59, -43) * (1 - signFocus);
      const mansionLook = new THREE.Vector3(16, 6.2, -48);
      const forwardFocus = camera.position.clone().add(new THREE.Vector3(0, 0.25, 15));
      const signLight = this.exterior?.getObjectByName("eckleburg-sign-light");
      if (signLight instanceof THREE.SpotLight) {
        const targetIntensity = Number(signLight.userData.targetIntensity) || 65;
        signLight.intensity += (targetIntensity * signFocus - signLight.intensity) * (1 - Math.exp(-2.2 * cutsceneDt));
      }
      this.lookAt.copy(forwardFocus).lerp(ECKLEBURG_SIGN_FOCUS, signFocus);
      this.lookAt.lerp(mansionLook, mansionReveal * 0.2);
      camera.lookAt(this.lookAt);
      camera.fov = THREE.MathUtils.lerp(62, 49, signFocus);
      camera.updateProjectionMatrix();

      if (carRoot.position.z >= ARRIVAL_PARK_Z) {
        carRoot.position.z = ARRIVAL_PARK_Z;
        this.arrivalPhase = "entering";
        this.arrivalElapsed = 0;
        this.player?.setCutscenePosition(new THREE.Vector3(-0.34, 0.24, carRoot.position.z - 0.55), Math.PI);
        for (const crate of this.crates) {
          crate.proxy.position.y = Math.max(crate.proxy.position.y, 0.66 + crate.size / 2);
          crate.body.setMotionType(PhysicsMotionType.ANIMATED);
          crate.body.setTransform(crate.proxy.position, crate.proxy.quaternion);
          this.setBelongingCollision(crate, BELONGING_COLLISION_MASK);
          crate.body.setLinearVelocity(new THREE.Vector3());
          crate.body.setAngularVelocity(new THREE.Vector3());
          this.cratesToRelease.add(crate);
        }
      }
      return;
    }
    const progress = THREE.MathUtils.clamp(this.arrivalElapsed / ARRIVAL_CAMERA_BLEND_SECONDS, 0, 1);
    const eased = progress * progress * (3 - 2 * progress);
    const exitProgress = THREE.MathUtils.smoothstep(progress, 0.18, 0.82);
    const parkedCarZ = this.carRoot?.position.z ?? ARRIVAL_PARK_Z;
    const cutscenePlayerPosition = new THREE.Vector3(-0.34, 0.24, parkedCarZ - 0.55).lerp(new THREE.Vector3(0, 0.06, -3.1), exitProgress);
    const cutsceneYaw = THREE.MathUtils.lerp(Math.PI, 0, exitProgress);
    this.player?.setCutscenePosition(cutscenePlayerPosition, cutsceneYaw);
    camera.position.set(cutscenePlayerPosition.x, cutscenePlayerPosition.y + 1.62, cutscenePlayerPosition.z);
    camera.rotation.order = "YXZ";
    camera.rotation.set(0, cutsceneYaw, 0);
    camera.fov = THREE.MathUtils.lerp(62, 68, eased);
    camera.updateProjectionMatrix();
    if (progress >= 1) {
      this.arrivalPhase = "done";
      const signLight = this.exterior?.getObjectByName("eckleburg-sign-light");
      if (signLight instanceof THREE.SpotLight) signLight.intensity = 0;
      this.player?.resumeWalking(new THREE.Vector3(0, 0.06, -3.1), 0);
      this.player?.setAvatarVisible(false);
      camera.position.set(0, 1.68, -3.1);
      this.yaw = 0;
      this.pitch = 0;
      this.trunkOpen = false;
      this.resetTailgatePose();
      this.syncMeshes();
      this.updateCounter();
      this.updateCamera();
      this.ctx.say("WASD / arrows walk · IJKL look · E grabs the item under your crosshair or opens the trunk · press E again to set an item down · click and drag items with the crosshair.", 4.3, true);
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
    const colliderRoot = new THREE.Group();
    colliderRoot.name = "nick-car-physics-colliders";
    group.add(colliderRoot);
    this.loadOptionalModel(CAR_MODEL_OVERRIDE.path, (model) => {
      if (this.carRoot !== group) return false;
      for (const child of [...group.children]) {
        if (child === colliderRoot || child === this.trunkHinge) continue;
        group.remove(child);
        disposeObjectTree(child);
      }
      fitModelToTarget(model, new THREE.Vector3(...CAR_MODEL_OVERRIDE.fit.targetSize), CAR_MODEL_OVERRIDE.fit.alignBottom);
      group.add(model);
      this.resetTailgatePose();
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
      { name: "trunk-floor", position: [0, 0.59, -1.625], extents: [2.05, 0.12, 2.25] },
      { name: "trunk-left-wall", position: [-1.03, 0.83, -1.625], extents: [0.13, 0.54, 2.25] },
      { name: "trunk-right-wall", position: [1.03, 0.83, -1.625], extents: [0.13, 0.54, 2.25] },
      { name: "trunk-front-wall", position: [0, 0.83, -0.48], extents: [1.8, 0.54, 0.13] },
    ];
    const carBodyColliders: { name: string; position: [number, number, number]; extents: [number, number, number] }[] = [
      { name: "lower-body", position: [0, 0.68, 0.78], extents: [1.62, 0.42, 2.24] },
      { name: "hood", position: [0, 0.92, 1.18], extents: [1.02, 0.4, 1.7] },
      { name: "front-bumper", position: [0, 0.62, 2.13], extents: [1.82, 0.2, 0.18] },
      { name: "rear-bumper", position: [0, 0.62, -2.16], extents: [1.82, 0.2, 0.18] },
      { name: "left-side", position: [-0.86, 0.84, 0.78], extents: [0.18, 0.72, 2.24] },
      { name: "right-side", position: [0.86, 0.84, 0.78], extents: [0.18, 0.72, 2.24] },
    ];
    for (const { name, position, extents } of carBodyColliders) {
      const collider = new THREE.Mesh(new THREE.BoxGeometry(...extents), new THREE.MeshBasicMaterial({ visible: false }));
      collider.name = `physics:car-body-${name}`;
      collider.position.set(...position);
      collider.visible = false;
      colliderRoot.add(collider);
      const aggregate = new PhysicsAggregate(collider, PhysicsShapeType.BOX, {
        mass: 0,
        friction: 0.72,
        restitution: 0.02,
        extents: new THREE.Vector3(...extents),
        filterMembershipMask: CAR_COLLISION_MASK,
        filterCollideMask: WORLD_COLLISION_MASK | PLAYER_COLLISION_MASK,
      }, this.requirePhysics());
      aggregate.body.setMotionType(PhysicsMotionType.ANIMATED);
      this.physicsAggregates.push(aggregate);
    }
    for (const { name, position, extents } of trunkColliders) {
      const collider = new THREE.Mesh(new THREE.BoxGeometry(...extents), new THREE.MeshBasicMaterial({ visible: false }));
      collider.name = `physics:car-${name}`;
      collider.position.set(...position);
      collider.visible = false;
      colliderRoot.add(collider);
      const aggregate = new PhysicsAggregate(collider, PhysicsShapeType.BOX, {
        mass: 0,
        friction: 0.72,
        restitution: 0.02,
        extents: new THREE.Vector3(...extents),
        filterMembershipMask: TRUNK_COLLISION_MASK,
        filterCollideMask: CARGO_COLLISION_MASK,
      }, this.requirePhysics());
      aggregate.body.setMotionType(PhysicsMotionType.ANIMATED);
      this.physicsAggregates.push(aggregate);
    }
    // Procedural fallback keeps the trunk and belongings visible if an override is absent or fails.
    this.tailgate = createNickCarModel(group, this.trunkHinge);
    this.resetTailgatePose();
    const trunkSlots: [number, number][] = [
      [-0.52, -1.0], [0.52, -1.0],
      [-0.62, -1.78], [0, -1.78], [0.62, -1.78],
      [-0.3, -2.45], [0.3, -2.45],
    ];
    BELONGINGS.forEach((spec, index) => {
      const [slotX, slotZ] = trunkSlots[index] ?? [0, -1.5];
      const housePosition = new THREE.Vector3(...spec.housePosition);
      const spawn = new THREE.Vector3(slotX, 0.66 + spec.size / 2, group.position.z + slotZ);
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
    mesh.updateMatrixWorld(true);
    const visualBounds = new THREE.Box3().setFromObject(mesh);
    const visualSize = visualBounds.getSize(new THREE.Vector3());
    const visualMaxSize = Math.max(visualSize.x, visualSize.y, visualSize.z);
    if (visualMaxSize > 0) mesh.scale.setScalar(size / visualMaxSize);
    if (belongingModelPath && this.modelRoot) {
      this.loadOptionalModel(belongingModelPath, (model) => {
        if (mesh.parent !== this.modelRoot) return false;
        mesh.scale.setScalar(1);
        disposeChildren(mesh);
        mesh.add(model);
        return true;
      }, size, belongingModel.fit.alignBottom);
    }

    const spawn = new THREE.Vector3(x, y, z);
    proxy.position.copy(spawn);
    proxy.quaternion.identity();
    const mass = spec.kind === "books" ? 8 : 5 + size * 4;
    const aggregate = new PhysicsAggregate(proxy, PhysicsShapeType.BOX, {
      mass,
      friction: 0.92,
      restitution: 0.01,
      extents: new THREE.Vector3(size, size, size),
      filterMembershipMask: CARGO_COLLISION_MASK,
      filterCollideMask: BELONGING_COLLISION_MASK,
    }, this.requirePhysics());

    aggregate.body.setMotionType(PhysicsMotionType.ANIMATED);
    aggregate.body.havokBody.setLinearDamping(1.8);
    aggregate.body.havokBody.setAngularDamping(4.5);
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
    if (this.grabbedCrate) {
      this.pointerHeld = false;
      this.releaseMouseGrab();
      return;
    }
    if (this.dragged && !this.grabbedCrate) {
      const crate = this.dragged;
      this.updateHeldObject();
      this.dragged = null;
      this.queueCrateRelease(crate);
      this.player.setCarrying(false);
      this.ctx.say(`${crate.label} set down. Press E to carry it again.`, 2.2, true);
      return;
    }
    if (this.grabFromCrosshair()) return;

    const trunkDistance = this.trunkDistance();
    if (this.trunkOpen && trunkDistance <= 3.8) {
      const nearest = this.crates
        .filter((crate) => !crate.delivered && crate.proxy.position.distanceTo(this.carRoot!.position) < 4.2)
        .map((crate) => ({ crate, distance: crate.proxy.position.distanceTo(this.player!.position) }))
        .filter(({ distance }) => distance <= 4.2)
        .sort((a, b) => a.distance - b.distance)[0]?.crate;
      if (nearest) {
        this.prepareCrateForCarry(nearest);
        this.updateHeldObject();
        this.ctx.say(`${nearest.label} in hand. Press E again to set it down.`, 3.2, true);
        return;
      }
    }

    const nearest = this.crates
      .filter((crate) => !crate.delivered && crate.proxy.position.distanceTo(this.player!.position) <= 2.2)
      .sort((a, b) => a.proxy.position.distanceTo(this.player!.position) - b.proxy.position.distanceTo(this.player!.position))[0];
    if (nearest) {
      this.prepareCrateForCarry(nearest);
      this.updateHeldObject();
      this.ctx.say(`${nearest.label} in hand. Press E again to set it down.`, 3.2, true);
      return;
    }

    if (trunkDistance <= 3.2) {
      this.trunkOpen = !this.trunkOpen;
      this.updateCounter();
      this.ctx.say(this.trunkOpen ? "The trunk is open. Press E beside a belonging to carry it." : "The trunk is closed.", 2.8, true);
      return;
    }

    this.ctx.say("Move close to a belonging or the back of Nick's car, then press E.", 2.5, true);
  }

  private grabFromCrosshair(): boolean {
    const hit = this.interactionHit();
    if (this.dragged) return false;
    if (!hit || hit.distance > 7) return false;
    const crate = this.crates.find((item) => !item.delivered && item.proxy.getObjectById(hit.object.id));
    if (!crate) return false;

    this.grabbedCrate = crate;
    this.grabDistance = Math.max(0.1, crate.proxy.position.clone().sub(this.raycaster.ray.origin).dot(this.raycaster.ray.direction));
    this.prepareCrateForCarry(crate, hit.point);
    this.updateHeldObject();
    this.ctx.say(`${crate.label} in hand. Press E again to set it down.`, 2.8, true);
    return true;
  }

  private prepareCrateForCarry(crate: Crate, handTarget?: THREE.Vector3): void {
    this.cratesToRelease.delete(crate);
    this.cratesReadyToRelease.delete(crate);
    this.dragged = crate;
    crate.body.setMotionType(PhysicsMotionType.ANIMATED);
    this.setBelongingCollision(crate, 0);
    crate.body.setLinearVelocity(new THREE.Vector3());
    crate.body.setAngularVelocity(new THREE.Vector3());
    this.player?.setCarrying(true, handTarget ?? null);
  }

  private setBelongingCollision(crate: Crate, mask: number): void {
    const shape = crate.body.havokBody.shape;
    if (!shape) return;
    shape.filterMembershipMask = mask === 0 ? 0 : CARGO_COLLISION_MASK;
    shape.filterCollideMask = mask;
  }

  private queueCrateRelease(crate: Crate): void {
    crate.body.setMotionType(PhysicsMotionType.ANIMATED);
    crate.body.setTransform(crate.proxy.position, crate.proxy.quaternion);
    this.setBelongingCollision(crate, BELONGING_COLLISION_MASK);
    crate.body.setLinearVelocity(new THREE.Vector3());
    crate.body.setAngularVelocity(new THREE.Vector3());
    this.cratesToRelease.delete(crate);
    this.cratesReadyToRelease.delete(crate);
    this.cratesToRelease.add(crate);
  }

  private resetTailgatePose(): void {
    if (this.tailgate) this.tailgate.rotation.set(-Math.PI / 2, Math.PI, 0);
  }

  private updateTrunk(dt: number): void {
    if (!this.tailgate) return;
    const closedAngle = -Math.PI / 2;
    const openAngle = -Math.PI;
    const target = this.trunkOpen ? openAngle : closedAngle;
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
    } else {
      this.moveForward.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
      this.mouseGrabTarget.copy(player.position).addScaledVector(this.moveForward, 0.9).add(new THREE.Vector3(0, 0.95, 0));
    }
    this.mouseGrabTarget.y = Math.max(crate.size / 2 + 0.08, this.mouseGrabTarget.y);
    const carried = this.dragged === crate && crate.body.motionType === PhysicsMotionType.ANIMATED;
    if (carried) {
      crate.proxy.position.copy(this.mouseGrabTarget);
      crate.body.setTransform(crate.proxy.position, crate.proxy.quaternion);
    } else {
      this.grabVelocity.copy(this.mouseGrabTarget).sub(crate.proxy.position).multiplyScalar(18);
      if (this.grabVelocity.length() > 12) this.grabVelocity.setLength(12);
      crate.body.setLinearVelocity(this.grabVelocity);
    }
    crate.body.setAngularVelocity(new THREE.Vector3());
    player.setCarrying(true, this.mouseGrabTarget);
  }

  private simulateCrates(_dt: number): void {
    for (const crate of this.cratesToRelease) this.cratesReadyToRelease.add(crate);
    this.cratesToRelease.clear();
    for (const crate of this.cratesReadyToRelease) {
      crate.body.setMotionType(PhysicsMotionType.DYNAMIC);
    }
    this.cratesReadyToRelease.clear();
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
      const rearLimit = Math.min(-ROOM_HALF - 5, crate.spawn.z - ROOM_HALF - 1);
      const lost = position.y < -4 || Math.abs(position.x) > ROOM_HALF + 4 || position.z > ROOM_HALF + 5 || position.z < rearLimit;
      if (!lost) continue;
      crate.proxy.position.copy(crate.spawn);
      crate.proxy.quaternion.identity();
      if (this.dragged === crate) {
        this.dragged = null;
        this.grabbedCrate = null;
        this.cratesToRelease.delete(crate);
        this.cratesReadyToRelease.delete(crate);
        this.player?.setCarrying(false);
        document.getElementById("crosshair")?.classList.remove("is-grabbing");
      }
      this.queueCrateRelease(crate);
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
      }
      if (this.dragged === crate) this.dragged = null;
      this.grabbedCrate = null;
      this.player?.setCarrying(false);
      document.getElementById("crosshair")?.classList.remove("is-grabbing");
      crate.savedTarget.copy(crate.destination);
      crate.destination.copy(crate.proxy.position);
      this.cratesToRelease.delete(crate);
      this.cratesReadyToRelease.delete(crate);
      crate.proxy.position.copy(crate.savedTarget);
      crate.body.setMotionType(PhysicsMotionType.ANIMATED);
      crate.body.setTransform(crate.savedTarget, crate.proxy.quaternion);
      this.setBelongingCollision(crate, 0);
      crate.body.setLinearVelocity(new THREE.Vector3());
      crate.body.setAngularVelocity(new THREE.Vector3());
      this.updateCounter();
      if (this.crates.every((item) => item.delivered)) {
        this.won = true;
        this.endingElapsed = 0;
        this.endingStarted = false;
        this.endingTitleShown = false;
        this.ctx.say("The last belonging is safely home. Nick's lamp glows against the evening; across the bay, Gatsby's lights begin to wake.", 6, true);
        for (const object of this.exterior?.children ?? []) {
          if (object.name.startsWith("gatsby-mansion-") || object.name.startsWith("gatsby-ballroom-") || object.name.startsWith("gatsby-dock-") || object.name.startsWith("gatsby-terrace-guest")) object.visible = false;
        }
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
