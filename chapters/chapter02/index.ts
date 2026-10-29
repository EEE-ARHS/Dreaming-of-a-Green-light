import * as THREE from "three";
import gatsbyFaceUrl from "./assets/gatsby-indiewire-face.jpg";
import type { ChapterContext, ChapterFlavor, ChapterOutcome } from "../../frontend/src/chapters/types";
import { PhysicsAggregate, PhysicsShapeType, type HavokPhysics } from "../../frontend/src/physics";
import { PlayerController } from "../../frontend/src/player-controller";
import { crateCounter } from "../../frontend/src/ui";
import manifest from "./assets/manifest.json";
import { disposeObjectTree } from "./assets/model-loader";
import { buildExterior } from "./exterior";

const FIELD_SIZE = 8;
const FIELD_CELLS = 16;
const FIELD_MIN_X = -FIELD_SIZE / 2;
const FIELD_MIN_Z = 6.5;
const CELL_SIZE = FIELD_SIZE / FIELD_CELLS;
const MOWING_BOUNDS = { minX: FIELD_MIN_X, maxX: FIELD_MIN_X + FIELD_SIZE, minZ: FIELD_MIN_Z - 1.5, maxZ: FIELD_MIN_Z + FIELD_SIZE + 0.5 };
const WALKING_BOUNDS = { minX: -6.1, maxX: 6.1, minZ: 4.8, maxZ: 17.2 };
const FLOWER_SPOTS: [number, number][] = [
  [-5.3, 6], [5.3, 6],
  [-5.3, 10.5], [5.3, 10.5],
  [-5.3, 15], [5.3, 15],
];
const TOP_CAMERA = new THREE.Vector3(8, 82, -26);
const TOP_LOOK = new THREE.Vector3(8, 0, -26);
const CONVERSATION_CAMERA = new THREE.Vector3(0, 5.8, -4.8);
const CONVERSATION_LOOK = new THREE.Vector3(0.5, 1.4, -8.1);
const INTRO_SECONDS = 15.5;
const ENDING_SECONDS = 3.2;

export const id = "nicksHouse";
export const name = manifest.name;
export const blurb = manifest.blurb;
export const command = manifest.command;
export const how = manifest.how;
export const slot = manifest.slot;

type Phase = "intro" | "mowing" | "flowers" | "complete";
type FlowerSpot = { root: THREE.Group; outline: THREE.LineSegments; flower: THREE.Group | null };

export class NicksHouseChapter {
  readonly id = id;
  readonly name = name;
  readonly blurb = blurb;
  readonly command = command;
  readonly how = how;
  readonly physicsScale = 1;
  readonly firstPerson = true;
  readonly slot = slot;

  private readonly ctx: ChapterContext;
  private readonly raycaster = new THREE.Raycaster();
  private readonly pointer = new THREE.Vector2();
  private readonly forward = new THREE.Vector3();
  private readonly playerPosition = new THREE.Vector3();
  private readonly physicsAggregates: PhysicsAggregate[] = [];
  private phase: Phase = "intro";
  private elapsed = 0;
  private endingElapsed = 0;
  private endingStarted = false;
  private endingTitleShown = false;
  private farewellCuePlayed = false;
  private porchRevealCuePlayed = false;
  private modelLoadToken = { cancelled: false };
  private player: PlayerController | null = null;
  private exterior: THREE.Group | null = null;
  private gameRoot: THREE.Group | null = null;
  private gatsby: THREE.Group | null = null;
  private mower: THREE.Group | null = null;
  private fieldTiles: THREE.Mesh[] = [];
  private mowed = new Uint8Array(FIELD_CELLS * FIELD_CELLS);
  private mowedCount = 0;
  private flowers: THREE.Group[] = [];
  private spots: FlowerSpot[] = [];
  private heldFlower: THREE.Group | null = null;
  private flowerCount = 0;
  private playerYaw = 0;
  private playerPitch = 0;
  private playerSpeed = 0;
  private savedCameraPosition = new THREE.Vector3();
  private savedCameraQuaternion = new THREE.Quaternion();
  private savedFov = 50;
  private savedFog: THREE.Scene["fog"] = null;
  private counter: HTMLElement | null = null;
  private progressLabel: HTMLElement | null = null;
  private progressFill: HTMLElement | null = null;

  constructor(ctx: ChapterContext) {
    this.ctx = ctx;
  }

  start(): void {
    const { camera } = this.ctx;
    this.savedCameraPosition.copy(camera.position);
    this.savedCameraQuaternion.copy(camera.quaternion);
    this.savedFov = camera.fov;
    this.savedFog = this.ctx.scene.fog;
    this.ctx.scene.fog = new THREE.Fog("#17120e", 88, 280);
    this.phase = "intro";
    this.elapsed = 0;
    this.endingElapsed = 0;
    this.endingStarted = false;
    this.endingTitleShown = false;
    this.farewellCuePlayed = false;
    this.porchRevealCuePlayed = false;
    this.modelLoadToken = { cancelled: false };
    this.flowerCount = 0;
    this.mowedCount = 0;
    this.mowed = new Uint8Array(FIELD_CELLS * FIELD_CELLS);
    this.flowers = [];
    this.spots = [];
    this.heldFlower = null;
    if (document.pointerLockElement === this.ctx.engine.domElement) document.exitPointerLock();

    this.exterior = buildExterior((object, width, height, depth) => this.addStaticCollider(object, width, height, depth));
    this.ctx.scene.add(this.exterior);
    this.player = new PlayerController(this.ctx.scene, this.requirePhysics());
    this.playerYaw = 0;
    this.playerPitch = 0;
    this.player.setCutscenePosition(new THREE.Vector3(0, 0.06, -6.1), 0, false);
    this.player.setAvatarVisible(true);
    this.gatsby = this.createGatsby();
    this.gatsby.rotation.y = Math.PI;
    this.ctx.scene.add(this.gatsby);
    this.buildGameObjects();
    this.buildMower();

    camera.position.copy(TOP_CAMERA);
    camera.lookAt(TOP_LOOK);
    camera.fov = 58;
    camera.updateProjectionMatrix();
    this.ctx.say("Across the lawn, Gatsby's great house stood beside Nick's modest home.", 4.1, true);

    this.counter = crateCounter;
    this.counter.replaceChildren();
    this.counter.classList.add("show");
    this.counter.style.opacity = "1";
    this.updateProgressHud();
    const canvas = this.ctx.engine.domElement;
    canvas.addEventListener("mousedown", this.onMouseDown);
    window.addEventListener("mousemove", this.onMouseMove);
    canvas.addEventListener("contextmenu", this.onContextMenu);
    canvas.style.cursor = "crosshair";
    this.ctx.dom.hud.classList.add("first-person-hud");
    document.body.classList.add("chapter01-active");
  }

  update(dt: number): void {
    if (!this.player) return;
    if (this.phase === "intro") {
      this.updateIntro(dt);
      this.player.updatePresentation();
      return;
    }
    if (this.phase === "complete") {
      this.updateEndingCutscene(dt);
      this.player.updatePresentation();
      return;
    }
    dt = Math.min(dt, 1 / 30);

    this.updateLook(dt);
    this.updateWalk(dt);
    this.player.update(dt, this.playerSpeed);
    this.updatePlayerCamera();
    if (this.phase === "mowing") this.updateMowing();
    if (this.phase === "flowers") this.updateFlowerCrosshair();
    else document.getElementById("crosshair")?.classList.remove("is-interactive", "is-grabbing");
    this.updateProgressHud();
  }

  idle(_dt: number): void { /* The garden is built only while the chapter is live. */ }

  abandon(): void { this.dispose(); }

  outcome(): ChapterOutcome {
    return this.phase === "complete" && this.endingElapsed >= ENDING_SECONDS ? "win" : "pending";
  }

  flavor(outcome: "win" | "lose"): ChapterFlavor {
    const text = manifest.flavor[outcome];
    return { kicker: text.kicker, title: text.title, body: text.body, quote: text.quote, cite: text.cite };
  }

  dispose(): void {
    const canvas = this.ctx.engine.domElement;
    canvas.removeEventListener("mousedown", this.onMouseDown);
    window.removeEventListener("mousemove", this.onMouseMove);
    canvas.removeEventListener("contextmenu", this.onContextMenu);
    if (document.pointerLockElement === canvas) document.exitPointerLock();
    canvas.style.cursor = "default";
    document.getElementById("crosshair")?.classList.remove("is-interactive", "is-grabbing");
    document.body.classList.remove("chapter01-active");
    this.heldFlower = null;
    if (this.mower) {
      this.ctx.camera.remove(this.mower);
      disposeObjectTree(this.mower);
      this.mower = null;
    }
    if (this.player) {
      this.player.setWaving(false);
      this.player.dispose();
      this.player = null;
    }
    for (const aggregate of this.physicsAggregates) aggregate.dispose();
    this.physicsAggregates.length = 0;
    for (const object of [this.gatsby, this.gameRoot, this.exterior]) {
      if (!object) continue;
      this.ctx.scene.remove(object);
      disposeObjectTree(object);
    }
    this.gatsby = null;
    this.gameRoot = null;
    this.exterior = null;
    this.fieldTiles = [];
    this.flowers = [];
    this.spots = [];
    if (this.counter) {
      this.counter.classList.remove("show");
      this.counter.style.opacity = "0";
      this.counter.replaceChildren();
      this.counter = null;
    }
    const { camera, dom } = this.ctx;
    camera.position.copy(this.savedCameraPosition);
    camera.quaternion.copy(this.savedCameraQuaternion);
    camera.fov = this.savedFov;
    camera.updateProjectionMatrix();
    this.ctx.scene.fog = this.savedFog;
    dom.hud.classList.remove("first-person-hud");
  }

  private updateIntro(dt: number): void {
    this.elapsed += dt;
    const camera = this.ctx.camera;
    const zoom = THREE.MathUtils.smoothstep(this.elapsed, 0, 5.2);
    const captionAt = (time: number, text: string, hold: number): void => {
      if (this.elapsed >= time && this.elapsed < time + dt) this.ctx.say(text, hold, true);
    };
    camera.position.copy(TOP_CAMERA).lerp(CONVERSATION_CAMERA, zoom);
    this.playerPosition.copy(TOP_LOOK).lerp(CONVERSATION_LOOK, zoom);
    camera.lookAt(this.playerPosition);
    if (this.gatsby && zoom > 0.96) this.gatsby.rotation.y = THREE.MathUtils.lerp(Math.PI, 0.25, THREE.MathUtils.smoothstep(zoom, 0.96, 1));
    camera.fov = THREE.MathUtils.lerp(58, 48, zoom);
    camera.updateProjectionMatrix();
    captionAt(3.4, "Nick, Daisy may come by tomorrow. I need your house looking its best.", 4.1);
    captionAt(7.6, "Mow the whole backyard, then fill the vases with daisies. She loves them.", 4.2);
    captionAt(11.4, "I'll pay you under the table—cash, no questions. Do this for me, old sport.", 4.1);
    if (this.elapsed >= INTRO_SECONDS) {
      this.phase = "mowing";
      if (this.mower) this.mower.visible = true;
      this.playerYaw = 0;
      this.playerPitch = 0;
      this.player?.resumeWalking(new THREE.Vector3(0, 0.06, 10.5), 0);
      this.player?.setAvatarVisible(false);
      camera.fov = 68;
      camera.updateProjectionMatrix();
      this.updatePlayerCamera();
      this.ctx.say("Walk every row of the marked backyard to mow it all. Then click a daisy and an outlined vase.", 5, true);
    }
  }

  private updateLook(dt: number): void {
    const keys = this.ctx.keys;
    const rate = 1.8 * dt;
    this.playerYaw += (Number(keys.has("l")) - Number(keys.has("j"))) * rate;
    this.playerPitch = THREE.MathUtils.clamp(this.playerPitch + (Number(keys.has("i")) - Number(keys.has("k"))) * rate, -0.95, 0.9);
  }

  private updateWalk(dt: number): void {
    const player = this.player;
    if (!player) return;
    const keys = this.ctx.keys;
    const forwardInput = Number(keys.has("w") || keys.has("arrowup")) - Number(keys.has("s") || keys.has("arrowdown"));
    const sideInput = Number(keys.has("d") || keys.has("arrowright")) - Number(keys.has("a") || keys.has("arrowleft"));
    player.yaw = this.playerYaw;
    this.playerSpeed = player.move(forwardInput, sideInput, dt, keys.has(" "));
    const bounds = this.phase === "mowing" ? MOWING_BOUNDS : WALKING_BOUNDS;
    const x = THREE.MathUtils.clamp(player.position.x, bounds.minX, bounds.maxX);
    const z = THREE.MathUtils.clamp(player.position.z, bounds.minZ, bounds.maxZ);
    if (x !== player.position.x || z !== player.position.z) {
      player.resumeWalking(new THREE.Vector3(x, Math.max(0.06, player.position.y), z), this.playerYaw);
    }
  }

  private updateEndingCutscene(dt: number): void {
    if (!this.endingStarted) {
      this.endingStarted = true;
      this.endingElapsed = 0;
      this.player?.setCutscenePosition(new THREE.Vector3(0, 0.06, -3.1), 0, false);
      this.player?.setAvatarVisible(true);
      this.player?.setWaving(true);
      this.ctx.say("Nick's little house is home. Across the bay, Gatsby waits alone on his porch.", 6.2, true);
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
    const cameraPosition = closeCamera.lerp(wideCamera, pullbackProgress).lerp(new THREE.Vector3(11.3, 5.1, -36.5), panProgress);
    const lookTarget = new THREE.Vector3(nickPosition.x, 1.34, nickPosition.z)
      .lerp(new THREE.Vector3(0, 1.5, -2.5), pullbackProgress)
      .lerp(gatsbyPorch, panProgress);
    if (!this.farewellCuePlayed && waveHold > 0.05) {
      this.farewellCuePlayed = true;
      this.ctx.audio.playFarewell();
    }
    if (!this.porchRevealCuePlayed && panProgress > 0.12) {
      this.porchRevealCuePlayed = true;
      this.ctx.audio.playPorchReveal();
    }
    if (this.exterior) {
      const showMansion = panProgress > 0.06;
      for (const object of this.exterior.children) {
        if (object.name.startsWith("gatsby-mansion-") || object.name.startsWith("gatsby-ballroom-") || object.name.startsWith("gatsby-dock-") || object.name.startsWith("gatsby-terrace-guest")) object.visible = showMansion;
      }
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
    if (!this.endingTitleShown && this.endingElapsed >= 3.2) {
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
    const token = this.modelLoadToken;
    new THREE.TextureLoader().load(gatsbyFaceUrl, (texture) => {
      if (token.cancelled || this.exterior !== exterior || gatsby.parent !== exterior) {
        texture.dispose();
        return;
      }
      const face = gatsby.getObjectByName("gatsby-face-image") as THREE.Mesh | null;
      const material = face?.material;
      const image = texture.image as HTMLImageElement;
      if (!(material instanceof THREE.MeshBasicMaterial) || !image?.naturalWidth) {
        texture.dispose();
        return;
      }
      const crop = document.createElement("canvas");
      crop.width = 256;
      crop.height = 320;
      const context = crop.getContext("2d");
      if (!context) {
        texture.dispose();
        return;
      }
      context.drawImage(image, 535, 25, 320, 400, 0, 0, crop.width, crop.height);
      texture.dispose();
      const croppedTexture = new THREE.CanvasTexture(crop);
      croppedTexture.colorSpace = THREE.SRGBColorSpace;
      croppedTexture.anisotropy = Math.min(8, this.ctx.engine.capabilities.getMaxAnisotropy());
      material.map = croppedTexture;
      material.color.set("#ffffff");
      material.needsUpdate = true;
    }, undefined, (error) => console.error("Unable to load Gatsby's face image:", error));
  }

  private createPorchGatsby(): THREE.Group {
    const gatsby = new THREE.Group();
    gatsby.name = "gatsby-on-porch";
    gatsby.position.set(16.2, 2.36, -41.6);
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
    add(box, chair, [0, 0.96, 0.12], "gatsby-chair-seat").scale.set(0.76, 0.13, 0.76);
    add(box, chair, [0, 1.34, 0.46], "gatsby-chair-back").scale.set(0.76, 0.84, 0.12);
    add(box, chair, [0, 1.04, 0.02], "gatsby-chair-cushion").scale.set(0.59, 0.12, 0.57);
    for (const side of [-1, 1]) {
      for (const z of [-0.16, 0.4]) {
        const chairLeg = add(cylinder, chair, [side * 0.28, 0.47, z], `gatsby-chair-leg-${side}-${z}`);
        chairLeg.scale.set(0.045, 0.94, 0.045);
        chairLeg.rotation.z = side * 0.06;
      }
      add(cylinder, chair, [side * 0.39, 1.28, 0.1], `gatsby-chair-arm-${side}`).scale.set(0.06, 0.48, 0.59);
      add(sphere, brass, [side * 0.36, 1.58, 0.17], `gatsby-chair-stud-${side}`).scale.setScalar(0.035);
    }
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
    const facePlane = new THREE.Mesh(new THREE.PlaneGeometry(0.235, 0.292), new THREE.MeshBasicMaterial({ color: "#ffffff", side: THREE.DoubleSide, toneMapped: false }));
    facePlane.name = "gatsby-face-image";
    facePlane.position.set(0, 1.62, -0.19);
    gatsby.add(facePlane);
    const hairCap = add(new THREE.SphereGeometry(0.16, 18, 12, 0, Math.PI * 2, 0, Math.PI / 2), hair, [0, 1.68, -0.035], "gatsby-combed-hair");
    hairCap.scale.set(1.02, 0.82, 0.96);
    add(sphere, skin, [-0.145, 1.59, -0.04], "gatsby-ear-left").scale.set(0.035, 0.055, 0.035);
    add(sphere, skin, [0.145, 1.59, -0.04], "gatsby-ear-right").scale.set(0.035, 0.055, 0.035);
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

  private updatePlayerCamera(): void {
    const player = this.player;
    if (!player) return;
    const camera = this.ctx.camera;
    camera.position.set(player.position.x, player.position.y + 1.62, player.position.z);
    camera.rotation.order = "YXZ";
    camera.rotation.set(this.playerPitch, this.playerYaw, 0);
    camera.updateMatrixWorld();
    this.forward.set(-Math.sin(this.playerYaw), 0, -Math.cos(this.playerYaw));
  }

  private updateMowing(): void {
    const player = this.player;
    if (!player) return;
    const centerX = player.position.x + this.forward.x * 0.8;
    const centerZ = player.position.z + this.forward.z * 0.8;
    const rightX = Math.cos(this.playerYaw);
    const rightZ = -Math.sin(this.playerYaw);
    for (let index = 0; index < this.fieldTiles.length; index++) {
      if (this.mowed[index]) continue;
      const row = Math.floor(index / FIELD_CELLS);
      const column = index % FIELD_CELLS;
      const x = FIELD_MIN_X + (column + 0.5) * CELL_SIZE;
      const z = FIELD_MIN_Z + (row + 0.5) * CELL_SIZE;
      const dx = x - centerX;
      const dz = z - centerZ;
      const lengthwise = dx * this.forward.x + dz * this.forward.z;
      const crosswise = dx * rightX + dz * rightZ;
      if (Math.abs(lengthwise) <= 0.48 && Math.abs(crosswise) <= 0.62) {
        this.mowed[index] = 1;
        this.fieldTiles[index]!.material = this.cutGrassMaterial;
        this.mowedCount++;
      }
    }
    if (this.mowedCount >= this.mowed.length) {
      this.phase = "flowers";
      if (this.mower) this.mower.visible = false;
      this.ctx.say("Every row is cut. Now make Nick's house ready for Daisy—aim at a daisy and click to pick it up, then aim at an outlined vase and click to place it.", 5.5, true);
      this.updatePlayerCamera();
      this.updateFlowerCrosshair();
      this.updateProgressHud();
    }
  }

  private updateProgressHud(): void {
    if (!this.counter) {
      this.counter = crateCounter;
      this.counter.replaceChildren();
      const panel = document.createElement("div");
      panel.className = "chapter01-progress";
      const label = document.createElement("span");
      label.className = "chapter01-progress-label";
      const track = document.createElement("span");
      track.className = "chapter01-progress-track";
      const fill = document.createElement("span");
      fill.className = "chapter01-progress-fill";
      track.append(fill);
      panel.append(label, track);
      this.counter.append(panel);
      this.counter.classList.add("show");
      this.counter.style.opacity = "1";
      this.progressLabel = label;
      this.progressFill = fill;
    }      const percent = this.phase === "mowing"
      ? Math.floor((this.mowedCount / this.mowed.length) * 100)
      : Math.floor((this.flowerCount / FLOWER_SPOTS.length) * 100);
    if (this.progressLabel) {
      this.progressLabel.textContent = this.phase === "mowing"
        ? `MOW THE LAWN · ${percent}%`
        : this.phase === "flowers" ? `DAISIES · ${this.flowerCount}/${FLOWER_SPOTS.length}` : "THE GARDEN";
    }
    if (this.progressFill) this.progressFill.style.width = `${percent}%`;
  }

  private buildGameObjects(): void {
    this.gameRoot = new THREE.Group();
    this.gameRoot.name = "chapter01-lawn-and-daisies";
    this.ctx.scene.add(this.gameRoot);

    const backyard = new THREE.Mesh(
      new THREE.BoxGeometry(32, 0.14, 30),
      new THREE.MeshStandardMaterial({ color: "#34452e", roughness: 1 }),
    );
    backyard.name = "nicks-backyard-lawn";
    backyard.position.set(0, -0.18, 10);
    backyard.receiveShadow = true;
    this.gameRoot.add(backyard);
    this.addStaticCollider(backyard, 32, 0.14, 30);
    this.createNeighboringGatsbyHouse();

    const uncutMaterial = new THREE.MeshStandardMaterial({ color: "#31482d", roughness: 1 });
    const tileGeometry = new THREE.BoxGeometry(CELL_SIZE - 0.012, 0.024, CELL_SIZE - 0.012);
    for (let row = 0; row < FIELD_CELLS; row++) {
      for (let column = 0; column < FIELD_CELLS; column++) {
        const tile = new THREE.Mesh(tileGeometry, uncutMaterial);
        tile.position.set(FIELD_MIN_X + (column + 0.5) * CELL_SIZE, -0.098, FIELD_MIN_Z + (row + 0.5) * CELL_SIZE);
        tile.name = `mowable-grass-${row}-${column}`;
        tile.receiveShadow = true;
        this.gameRoot.add(tile);
        this.fieldTiles.push(tile);
      }
    }
    const edgeMaterial = new THREE.LineBasicMaterial({ color: "#d7b970", transparent: true, opacity: 0.72 });
    const edgeGeometry = new THREE.EdgesGeometry(new THREE.BoxGeometry(FIELD_SIZE, 0.03, FIELD_SIZE));
    const fieldOutline = new THREE.LineSegments(edgeGeometry, edgeMaterial);
    fieldOutline.name = "mowing-field-outline";
    fieldOutline.position.set(0, -0.02, FIELD_MIN_Z + FIELD_SIZE / 2);
    this.gameRoot.add(fieldOutline);

    this.createFlowerStation();
    FLOWER_SPOTS.forEach(([x, z], index) => this.createVaseSpot(x, z, index));
  }

  private readonly cutGrassMaterial = new THREE.MeshStandardMaterial({ color: "#476b3b", roughness: 1 });

  private createNeighboringGatsbyHouse(): void {
    if (!this.gameRoot) return;
    const mansionWall = new THREE.MeshStandardMaterial({ color: "#b9a985", roughness: 0.78 });
    const mansionTrim = new THREE.MeshStandardMaterial({ color: "#eadfc3", roughness: 0.68 });
    const mansionRoof = new THREE.MeshStandardMaterial({ color: "#34302a", roughness: 0.9 });
    const window = new THREE.MeshStandardMaterial({ color: "#e9b565", emissive: "#b97828", emissiveIntensity: 0.55, roughness: 0.38 });
    const add = (geometry: THREE.BufferGeometry, material: THREE.Material, x: number, y: number, z: number, sx: number, sy: number, sz: number, name: string) => {
      const mesh = new THREE.Mesh(geometry, material);
      mesh.name = name;
      mesh.position.set(x, y, z);
      mesh.scale.set(sx, sy, sz);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.gameRoot!.add(mesh);
      return mesh;
    };
    const x = 12.2;
    const z = -5.2;
    add(new THREE.BoxGeometry(1, 1, 1), mansionWall, x, 2.4, z, 7.2, 4.8, 7.8, "gatsby-house-next-door");
    add(new THREE.ConeGeometry(1, 1, 4), mansionRoof, x, 5.25, z, 4.4, 1.4, 4.8, "gatsby-house-roof").rotation.y = Math.PI / 4;
    add(new THREE.BoxGeometry(1, 1, 1), mansionTrim, x, 0.22, z + 4.2, 9.2, 0.44, 2.3, "gatsby-house-terrace");
    for (const floorY of [1.65, 3.15]) {
      for (const windowX of [x - 2.25, x, x + 2.25]) {
        add(new THREE.BoxGeometry(1, 1, 1), window, windowX, floorY, z - 3.95, 1.05, 1.15, 0.08, `gatsby-house-window-${floorY}-${windowX}`);
        for (const offset of [-0.56, 0.56]) {
          add(new THREE.BoxGeometry(1, 1, 1), mansionTrim, windowX + offset, floorY, z - 4.01, 0.08, 1.3, 0.1, `gatsby-house-window-frame-${floorY}-${windowX}-${offset}`);
        }
      }
    }
    for (const side of [-1, 1]) {
      const column = add(new THREE.CylinderGeometry(0.11, 0.14, 3.3, 10), mansionTrim, x + side * 2.3, 1.9, z + 3.65, 1, 1, 1, `gatsby-house-porch-column-${side}`);
      column.castShadow = true;
    }
  }

  private createFlowerStation(): void {
    if (!this.gameRoot) return;
    const wood = new THREE.MeshStandardMaterial({ color: "#5a3c27", roughness: 0.82 });
    const basket = new THREE.MeshStandardMaterial({ color: "#7a5937", roughness: 0.94 });
    const top = new THREE.Mesh(new THREE.BoxGeometry(1.55, 0.12, 0.8), wood);
    top.position.set(2.5, 0.66, 10.5);
    top.name = "daisy-worktable";
    this.gameRoot.add(top);
    for (const [x, z] of [[1.85, 10.22], [3.15, 10.22], [1.85, 10.78], [3.15, 10.78]] as const) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.66, 0.11), wood);
      leg.position.set(x, 0.32, z);
      this.gameRoot.add(leg);
    }
    const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.48, 0.39, 0.32, 12, 1, true), basket);
    bowl.position.set(2.5, 0.88, 10.5);
    this.gameRoot.add(bowl);
    for (let index = 0; index < FLOWER_SPOTS.length; index++) {
      const angle = (index / FLOWER_SPOTS.length) * Math.PI * 2;
      const flower = this.createDaisy();
      flower.name = `daisy-to-place-${index + 1}`;
      flower.userData.daisySourceIndex = index;
      flower.position.set(2.5 + Math.cos(angle) * 0.28, 0.99, 10.5 + Math.sin(angle) * 0.22);
      flower.rotation.z = (index - 2.5) * 0.045;
      this.gameRoot.add(flower);
      this.flowers.push(flower);
    }
  }

  private createVaseSpot(x: number, z: number, index: number): void {
    if (!this.gameRoot) return;
    const root = new THREE.Group();
    root.name = `daisy-vase-spot-${index + 1}`;
    root.position.set(x, 0, z);
    root.userData.daisyVaseSpot = index;
    const porcelain = new THREE.MeshStandardMaterial({ color: "#d0c7b0", roughness: 0.34, metalness: 0.06 });
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.23, 0.29, 0.48, 14), porcelain);
    base.position.y = 0.24;
    root.add(base);
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.18, 0.22, 12), porcelain);
    neck.position.y = 0.57;
    root.add(neck);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.135, 0.035, 8, 16), porcelain);
    rim.rotation.x = Math.PI / 2;
    rim.position.y = 0.69;
    root.add(rim);
    const outlineMaterial = new THREE.LineBasicMaterial({ color: "#9dffc2", transparent: true, opacity: 0.82 });
    const outlineGeometry = new THREE.EdgesGeometry(new THREE.BoxGeometry(0.78, 1.08, 0.78));
    const outline = new THREE.LineSegments(outlineGeometry, outlineMaterial);
    outline.name = `daisy-placement-outline-${index + 1}`;
    outline.position.y = 0.55;
    root.add(outline);
    this.gameRoot.add(root);
    this.spots.push({ root, outline, flower: null });
  }

  private createDaisy(): THREE.Group {
    const flower = new THREE.Group();
    const stemMaterial = new THREE.MeshStandardMaterial({ color: "#4c7440", roughness: 0.86 });
    const petalMaterial = new THREE.MeshStandardMaterial({ color: "#f4eedc", roughness: 0.72, emissive: "#18321b", emissiveIntensity: 0.12 });
    const centerMaterial = new THREE.MeshStandardMaterial({ color: "#d8ad45", roughness: 0.64 });
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.027, 0.48, 7), stemMaterial);
    stem.position.y = 0.22;
    flower.add(stem);
    const leafGeometry = new THREE.SphereGeometry(1, 9, 7);
    for (const side of [-1, 1]) {
      const leaf = new THREE.Mesh(leafGeometry, stemMaterial);
      leaf.scale.set(0.12, 0.045, 0.055);
      leaf.position.set(side * 0.075, 0.2, 0.015);
      leaf.rotation.z = side * -0.42;
      flower.add(leaf);
    }
    const petalGeometry = new THREE.SphereGeometry(1, 10, 7);
    for (let index = 0; index < 10; index++) {
      const angle = (index / 10) * Math.PI * 2;
      const petal = new THREE.Mesh(petalGeometry, petalMaterial);
      petal.scale.set(0.105, 0.066, 0.045);
      petal.position.set(Math.cos(angle) * 0.145, 0.48 + Math.sin(angle) * 0.145, 0);
      petal.rotation.z = angle;
      flower.add(petal);
    }
    const center = new THREE.Mesh(new THREE.SphereGeometry(0.085, 12, 9), centerMaterial);
    center.position.y = 0.48;
    flower.add(center);
    const aura = new THREE.Mesh(
      new THREE.SphereGeometry(0.29, 14, 10),
      new THREE.MeshBasicMaterial({ color: "#55ff8a", transparent: true, opacity: 0.045, blending: THREE.AdditiveBlending, depthWrite: false }),
    );
    aura.position.y = 0.48;
    flower.add(aura);
    const glow = new THREE.PointLight("#5eff91", 0.11, 1.2, 2);
    glow.position.y = 0.5;
    flower.add(glow);
    return flower;
  }

  private buildMower(): void {
    const mower = new THREE.Group();
    mower.name = "first-person-lawn-mower";
    const deckMaterial = new THREE.MeshStandardMaterial({ color: "#9e2823", roughness: 0.54, metalness: 0.18 });
    const darkMetal = new THREE.MeshStandardMaterial({ color: "#242522", roughness: 0.72, metalness: 0.3 });
    const tireMaterial = new THREE.MeshStandardMaterial({ color: "#171817", roughness: 0.96 });
    const deck = new THREE.Mesh(new THREE.BoxGeometry(0.68, 0.2, 0.58), deckMaterial);
    deck.position.set(0, -0.47, -0.92);
    mower.add(deck);
    const engine = new THREE.Mesh(new THREE.BoxGeometry(0.31, 0.2, 0.3), darkMetal);
    engine.position.set(0, -0.28, -0.96);
    mower.add(engine);
    for (const side of [-1, 1]) {
      for (const z of [-0.7, -1.16]) {
        const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.09, 12), tireMaterial);
        wheel.rotation.z = Math.PI / 2;
        wheel.position.set(side * 0.35, -0.48, z);
        mower.add(wheel);
      }
      const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.74, 8), darkMetal);
      handle.position.set(side * 0.2, -0.14, -0.59);
      handle.rotation.x = -0.47;
      handle.rotation.z = side * 0.1;
      mower.add(handle);
    }
    const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.48, 8), darkMetal);
    grip.rotation.z = Math.PI / 2;
    grip.position.set(0, 0.12, -0.4);
    mower.add(grip);
    mower.visible = false;
    this.ctx.camera.add(mower);
    this.mower = mower;
  }

  private createGatsby(): THREE.Group {
    const gatsby = new THREE.Group();
    gatsby.name = "gatsby-talking-to-nick";
    gatsby.position.set(0.8, 0.06, -8.55);
    gatsby.rotation.y = 0;
    const suit = new THREE.MeshStandardMaterial({ color: "#d8d0b7", roughness: 0.78 });
    const shirt = new THREE.MeshStandardMaterial({ color: "#f1eadb", roughness: 0.68 });
    const skin = new THREE.MeshStandardMaterial({ color: "#c39b7b", roughness: 0.8 });
    const hair = new THREE.MeshStandardMaterial({ color: "#9a7954", roughness: 0.9 });
    const add = (geometry: THREE.BufferGeometry, material: THREE.Material, name: string, x: number, y: number, z: number) => {
      const mesh = new THREE.Mesh(geometry, material);
      mesh.name = name;
      mesh.position.set(x, y, z);
      mesh.castShadow = true;
      gatsby.add(mesh);
      return mesh;
    };
    add(new THREE.CapsuleGeometry(0.27, 0.5, 4, 10), suit, "gatsby-pale-suit", 0, 1.16, 0);
    add(new THREE.BoxGeometry(0.13, 0.4, 0.045), shirt, "gatsby-shirt", 0, 1.25, -0.245);
    add(new THREE.ConeGeometry(0.045, 0.22, 4), new THREE.MeshStandardMaterial({ color: "#713f37", roughness: 0.58 }), "gatsby-tie", 0, 1.2, -0.28);
    add(new THREE.SphereGeometry(0.18, 14, 11), skin, "gatsby-head", 0, 1.72, 0);
    const hairCap = add(new THREE.SphereGeometry(0.18, 14, 8), hair, "gatsby-hair", 0, 1.83, 0);
    hairCap.scale.set(1, 0.55, 1);
    for (const side of [-1, 1]) {
      const arm = add(new THREE.CapsuleGeometry(0.075, 0.46, 3, 8), suit, `gatsby-arm-${side}`, side * 0.35, 1.23, -0.02);
      arm.rotation.z = side * -0.14;
      const leg = add(new THREE.CapsuleGeometry(0.09, 0.55, 3, 8), suit, `gatsby-leg-${side}`, side * 0.13, 0.42, 0.02);
      leg.rotation.x = -0.04;
    }
    return gatsby;
  }

  private readonly onMouseDown = (event: MouseEvent): void => {
    if (event.button !== 0 || (this.phase !== "mowing" && this.phase !== "flowers")) return;
    event.preventDefault();
    if (this.phase === "flowers") {
      const target = this.raycastFlowerTarget();
      if (target?.spot && this.heldFlower) {
        const flower = this.heldFlower;
        this.ctx.camera.updateMatrixWorld(true);
        flower.updateMatrixWorld(true);
        this.ctx.scene.attach(flower);
        flower.position.set(0, 0.18, 0);
        flower.scale.setScalar(1);
        target.spot.root.add(flower);
        target.spot.flower = flower;
        target.spot.outline.visible = false;
        this.heldFlower = null;
        this.flowerCount++;
        if (this.flowerCount === FLOWER_SPOTS.length) {
          this.phase = "complete";
          this.endingElapsed = 0;
          this.ctx.say("Nick's garden is ready for Daisy. Gatsby's promised envelope is waiting on the table.", 4.5, true);
          this.ctx.dom.titleFlash("A GARDEN FOR DAISY");
          if (document.pointerLockElement === this.ctx.engine.domElement) document.exitPointerLock();
        }
        this.updateFlowerCrosshair();
        this.updateProgressHud();
      } else if (target?.flower && !this.heldFlower) {
        const flower = target.flower;
        flower.updateMatrixWorld(true);
        this.ctx.scene.attach(flower);
        this.ctx.camera.add(flower);
        flower.position.set(0.28, -0.25, -0.82);
        flower.rotation.set(0, 0, 0);
        flower.scale.setScalar(0.62);
        this.heldFlower = flower;
        this.updateFlowerCrosshair();
      }
    }
    if ((this.phase === "mowing" || this.phase === "flowers") && document.pointerLockElement !== this.ctx.engine.domElement) {
      void this.ctx.engine.domElement.requestPointerLock?.();
    }
  };

  private readonly onMouseMove = (event: MouseEvent): void => {
    const canvas = this.ctx.engine.domElement;
    if ((this.phase !== "mowing" && this.phase !== "flowers") || (document.pointerLockElement !== canvas && event.target !== canvas)) return;
    this.playerYaw -= event.movementX * 0.0022;
    this.playerPitch = THREE.MathUtils.clamp(this.playerPitch - event.movementY * 0.0018, -0.95, 0.9);
  };

  private readonly onContextMenu = (event: MouseEvent): void => event.preventDefault();

  private raycastFlowerTarget(): { flower?: THREE.Group; spot?: FlowerSpot } | null {
    const camera = this.ctx.camera;
    this.ctx.scene.updateMatrixWorld(true);
    camera.updateMatrixWorld(true);
    this.pointer.set(0, 0);
    this.raycaster.setFromCamera(this.pointer, camera);
    if (this.heldFlower) {
      const targets = this.spots.filter((spot) => !spot.flower).map((spot) => spot.root);
      for (const hit of this.raycaster.intersectObjects(targets, true)) {
        if (hit.distance > 24) break;
        const spotIndex = this.findAncestorData<number>(hit.object, "daisyVaseSpot");
        const spot = spotIndex === null ? undefined : this.spots[spotIndex];
        if (spot && !spot.flower) return { spot };
      }
      return null;
    }
    const available = this.flowers.filter((flower) => flower.parent === this.gameRoot);
    const vases = this.spots.filter((spot) => !spot.flower).map((spot) => spot.root);
    const hits = [
      ...this.raycaster.intersectObjects(available, true).map((hit) => ({ hit, kind: "flower" as const })),
      ...this.raycaster.intersectObjects(vases, true).map((hit) => ({ hit, kind: "spot" as const })),
    ].sort((a, b) => a.hit.distance - b.hit.distance);
    for (const { hit, kind } of hits) {
      if (hit.distance > 24) break;
      if (kind === "spot") return null;
      const flowerIndex = this.findAncestorData<number>(hit.object, "daisySourceIndex");
      const flower = flowerIndex === null ? undefined : this.flowers[flowerIndex];
      if (flower && flower.parent === this.gameRoot) return { flower };
    }
    return null;
  }

  private updateFlowerCrosshair(): void {
    const crosshair = document.getElementById("crosshair");
    if (!crosshair) return;
    const target = this.raycastFlowerTarget();
    crosshair.classList.toggle("is-interactive", target !== null);
    crosshair.classList.toggle("is-grabbing", this.heldFlower !== null);
  }

  private findAncestorData<T>(object: THREE.Object3D, key: string): T | null {
    let current: THREE.Object3D | null = object;
    while (current) {
      if (current.userData[key] !== undefined) return current.userData[key] as T;
      current = current.parent;
    }
    return null;
  }

  private addStaticCollider(object: THREE.Object3D, width: number, height: number, depth: number): void {
    if (object.name.startsWith("west-egg-invisible")) return;
    const aggregate = new PhysicsAggregate(object, PhysicsShapeType.BOX, {
      mass: 0,
      friction: 0.76,
      restitution: 0.02,
      extents: new THREE.Vector3(width, height, depth),
    }, this.requirePhysics());
    this.physicsAggregates.push(aggregate);
  }

  private requirePhysics(): HavokPhysics {
    if (!this.ctx.physics) throw new Error("Nick's House requires Havok physics.");
    return this.ctx.physics;
  }
}
