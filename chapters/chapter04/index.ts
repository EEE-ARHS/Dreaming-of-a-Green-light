import * as THREE from "three";
import type { Chapter, ChapterContext, ChapterFlavor, ChapterOutcome } from "../../frontend/src/chapters/types";
import { PhysicsAggregate, PhysicsConstraint, PhysicsShapeType } from "../../frontend/src/physics";
import { disposeObjectTree } from "../../frontend/src/scene-resources";
import { crateCounter } from "../../frontend/src/ui";
import manifest from "./assets/manifest.json";

export const id = manifest.id;
export const name = manifest.name;
export const blurb = manifest.blurb;
export const command = manifest.command;
export const how = manifest.how;

interface BodyPart {
  name: string;
  mesh: THREE.Mesh;
  rest: THREE.Vector3;
  createAggregate: () => PhysicsAggregate;
  aggregate?: PhysicsAggregate;
}

interface Guest {
  root: THREE.Group;
  parts: BodyPart[];
  joints: PhysicsConstraint[];
  torso: BodyPart;
  grabbed: boolean;
  cleared: boolean;
  thrown: boolean;
  activated: boolean;
  base: THREE.Vector3;
  baseYaw: number;
  phase: number;
}
interface AmbientGuest {
  root: THREE.Group;
  torso: THREE.Mesh;
  arms: THREE.Group[];
  legs: THREE.Group[];
  baseX: number;
  baseY: number;
  baseZ: number;
  yaw: number;
  phase: number;
  gesture: number;
}

const GUEST_COUNT = 9;
// Redford as Gatsby, pictured in the Independent article supplied by the player.
const GATSBY_FACE_URL = new URL("./assets/gatsby-redford.jpg", import.meta.url).href;
const PALETTE = ["#d0aa58", "#783c52", "#426b69", "#5d4b76", "#a76b3a", "#9c3653"];

/** Chapter IV — clear Gatsby's party guests from the aisle to find their host. */
export class CrowdAtGatsbysChapter implements Chapter {
  readonly id = id;
  readonly name = name;
  readonly blurb = blurb;
  readonly command = command;
  readonly how = how;
  readonly physicsScale = 1;
  readonly firstPerson = true;

  private readonly ctx: ChapterContext;
  private readonly group = new THREE.Group();
  private readonly guests: Guest[] = [];
  private readonly ambientGuests: AmbientGuest[] = [];
  private readonly staticBodies: PhysicsAggregate[] = [];
  private readonly raycaster = new THREE.Raycaster();
  private readonly pointer = new THREE.Vector2();
  private readonly dragStart = new THREE.Vector2();
  private readonly dragPoint = new THREE.Vector3();
  private readonly pullVelocity = new THREE.Vector3();
  private readonly centerScratch = new THREE.Vector3();
  private readonly angularScratch = new THREE.Vector3();
  private animationAccumulator = 0;
  private readonly savedCameraPosition = new THREE.Vector3();
  private readonly savedCameraQuaternion = new THREE.Quaternion();
  private savedFov = 50;
  private savedBackground: THREE.Scene["background"] = null;
  private savedFog: THREE.Scene["fog"] = null;
  private phase: "opening" | "playing" | "ending" = "opening";
  private result: ChapterOutcome = "pending";
  private endElapsed = 0;
  private openingElapsed = 0;
  private openingBeat = 0;
  private readonly host = new THREE.Group();
  private readonly openingJordan = new THREE.Group();
  private readonly faceMaterial = new THREE.MeshBasicMaterial({ color: "#d1aa88" });
  private readonly faceCanvas = document.createElement("canvas");
  private readonly faceTexture = new THREE.CanvasTexture(this.faceCanvas);
  private readonly faceImage = new Image();
  private faceReveal: THREE.Mesh | null = null;
  private remainingGuests = GUEST_COUNT;
  private dragging: Guest | null = null;
  private pointerDown = false;
  private yaw = 0;
  private pitch = 0;
  private cameraFocus = new THREE.Vector3();
  private readonly playerPosition = new THREE.Vector3(0, 0, -13.2);
  private readonly movementScratch = new THREE.Vector3();
  private readonly candidatePosition = new THREE.Vector3();
  private readonly pushDirection = new THREE.Vector3();
  private pushWasDown = false;

  constructor(ctx: ChapterContext) {
    this.ctx = ctx;
  }

  start(): void {
    if (this.guests.length || this.group.parent) this.disposeScene();
    const { scene, camera, engine } = this.ctx;
    this.savedCameraPosition.copy(camera.position);
    this.savedCameraQuaternion.copy(camera.quaternion);
    this.savedFov = camera.fov;
    this.savedBackground = scene.background;
    this.savedFog = scene.fog;
    this.phase = "opening";
    this.result = "pending";
    this.endElapsed = 0;
    this.openingElapsed = 0;
    this.openingBeat = 0;
    this.animationAccumulator = 0;
    this.remainingGuests = GUEST_COUNT;
    this.dragging = null;
    this.pointerDown = false;
    this.pushWasDown = false;
    this.yaw = Math.PI;
    this.pitch = 0;
    this.playerPosition.set(0, 0, -13.2);
    this.cameraFocus.set(0, 1.2, 0);
    this.group.name = "chapter04-party";
    scene.add(this.group);
    scene.background = new THREE.Color("#120c15");
    scene.fog = new THREE.Fog("#1b101b", 11, 48);
    this.buildRoom();
    this.buildBackdropCrowd();
    for (let index = 0; index < GUEST_COUNT; index++) this.guests.push(this.createGuest(index));
    this.group.traverse((object) => {
      if (object instanceof THREE.Mesh) {
        object.castShadow = false;
        object.receiveShadow = false;
      }
    });
    this.placeCamera(true);
    const canvas = engine.domElement;
    canvas.addEventListener("pointerdown", this.pointerDownHandler);
    canvas.addEventListener("pointermove", this.pointerMoveHandler);
    canvas.addEventListener("contextmenu", this.contextMenuHandler);
    window.addEventListener("pointerup", this.pointerUpHandler);
    window.addEventListener("blur", this.blurHandler);
    canvas.style.cursor = "grab";
    crateCounter.classList.add("show");
    crateCounter.textContent = `GUESTS ${GUEST_COUNT} / ${GUEST_COUNT} · CLEAR THE AISLE`;
    this.ctx.dom.hud.classList.add("live");
    this.ctx.dom.letterbox.classList.remove("on");
    this.ctx.say("Jordan: You’re a bad driver, Nick.", 2.2, true);
    this.animateBackdropCrowd(0);
  }

  update(dt: number): void {
    const step = Math.min(dt, 1 / 30);
    this.animationAccumulator += step;
    if (this.animationAccumulator >= 1 / 30) {
      const animationStep = this.animationAccumulator;
      this.animationAccumulator = 0;
      this.animateBackdropCrowd(animationStep);
      this.animateIdleGuests(animationStep);
    }

    if (this.phase === "opening") {
      this.openingElapsed += step;
      if (this.openingBeat === 0 && this.openingElapsed >= 2.2) {
        this.ctx.say("Nick: I’m careful.", 1.9, true);
        this.openingBeat = 1;
      } else if (this.openingBeat === 1 && this.openingElapsed >= 4.25) {
        this.ctx.say("Jordan: No, you’re not. Let’s find Gatsby.", 2.4, true);
        this.openingBeat = 2;
      } else if (this.openingBeat === 2 && this.openingElapsed >= 6.8) {
        this.ctx.say("You are Nick, lost among Gatsby's guests. Walk forward, find your way through, and drag a guest aside when the crowd blocks you.", 5.2, true);
        this.openingBeat = 3;
        this.cameraFocus.set(0, 1.2, 0);
        this.openingJordan.visible = false;
        this.phase = "playing";
      }
      this.placeCamera(false);
    } else if (this.phase === "playing") {
      this.moveNick(step);
      const pushDown = this.ctx.keys.has("f");
      if (pushDown && !this.pushWasDown) this.pushNearbyGuest();
      this.pushWasDown = pushDown;
      if (this.dragging) this.pullGuest(this.dragging);
      for (const guest of this.guests) {
        if (guest.cleared || !guest.thrown) continue;
        const center = this.guestCenter(guest, this.centerScratch);
        if (Math.abs(center.x) > 2.85 || center.z > 19 || center.y < -2) {
          guest.cleared = true;
          guest.root.visible = false;
          this.disposeGuestPhysics(guest);
          this.remainingGuests--;
          crateCounter.textContent = this.remainingGuests === 0 ? "THE AISLE IS CLEAR · GATSBY AWAITS" : `GUESTS ${this.remainingGuests} / ${GUEST_COUNT} · CLEAR THE AISLE`;
        }
      }
      if (this.remainingGuests === 0) {
        this.phase = "ending";
        this.endElapsed = 0;
        this.ctx.say("The aisle is clear. Gatsby waits beneath the green light.", 4.5, true);
      }
      this.placeCamera(false);
    } else if (this.phase === "ending") {
      this.endElapsed += step;
      this.placeCamera(false);
      if (this.endElapsed > 3.2) this.result = "win";
    }
  }

  idle(_dt: number): void {}

  outcome(): ChapterOutcome {
    return this.result;
  }

  flavor(outcome: "win" | "lose"): ChapterFlavor {
    return manifest.flavor[outcome];
  }

  abandon(): void {
    this.releaseGuest();
  }

  dispose(): void {
    this.releaseGuest();
    const canvas = this.ctx.engine.domElement;
    canvas.removeEventListener("pointerdown", this.pointerDownHandler);
    canvas.removeEventListener("pointermove", this.pointerMoveHandler);
    canvas.removeEventListener("contextmenu", this.contextMenuHandler);
    if (document.pointerLockElement === canvas) document.exitPointerLock();
    window.removeEventListener("pointerup", this.pointerUpHandler);
    window.removeEventListener("blur", this.blurHandler);
    canvas.style.cursor = "default";
    this.disposeScene();
    const { camera, scene, dom } = this.ctx;
    camera.position.copy(this.savedCameraPosition);
    camera.quaternion.copy(this.savedCameraQuaternion);
    camera.fov = this.savedFov;
    camera.updateProjectionMatrix();
    scene.background = this.savedBackground;
    scene.fog = this.savedFog;
    dom.hud.classList.remove("live");
    crateCounter.classList.remove("show");
    crateCounter.textContent = "";
    dom.distanceValue.textContent = "148";
  }

  private disposeScene(): void {
    this.faceImage.onload = null;
    this.faceReveal = null;
    this.faceMaterial.map = null;
    this.faceCanvas.width = 512;
    this.faceCanvas.height = 512;
    this.faceTexture.image = this.faceCanvas;
    this.faceTexture.needsUpdate = true;
    for (const guest of this.guests.splice(0)) {
      this.disposeGuestPhysics(guest);
      guest.root.removeFromParent();
      disposeObjectTree(guest.root);
    }
    for (const aggregate of this.staticBodies.splice(0)) aggregate.dispose();
    this.ambientGuests.length = 0;
    this.group.removeFromParent();
    disposeObjectTree(this.group);
    this.group.clear();
    this.host.clear();
    this.openingJordan.clear();
  }

  private buildRoom(): void {
    const roomLight = new THREE.HemisphereLight("#e0c6c8", "#21131d", 1.65);
    this.group.add(roomLight);
    const chandelier = new THREE.PointLight("#ffd89a", 45, 26, 1.7);
    chandelier.position.set(0, 5.8, -1);
    this.group.add(chandelier);
    const green = new THREE.PointLight("#69c88a", 42, 36, 1.8);
    green.position.set(0, 2.6, 23);
    this.group.add(green);
    const floorMat = new THREE.MeshStandardMaterial({ color: "#30252b", roughness: 0.32, metalness: 0.22 });
    const wallMat = new THREE.MeshStandardMaterial({ color: "#211820", roughness: 0.78 });
    const trimMat = new THREE.MeshStandardMaterial({ color: "#b68b49", metalness: 0.66, roughness: 0.28, emissive: "#493115", emissiveIntensity: 0.35 });
    const addBox = (name: string, size: THREE.Vector3, position: THREE.Vector3, material: THREE.Material, mass = 0) => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(size.x, size.y, size.z), material);
      mesh.name = name;
      mesh.position.copy(position);
      mesh.castShadow = false;
      mesh.receiveShadow = false;
      this.group.add(mesh);
      if (mass === 0 && name.startsWith("physics:")) {
        this.staticBodies.push(new PhysicsAggregate(mesh, PhysicsShapeType.BOX, { mass: 0, friction: 0.78, restitution: 0.05, extents: size.clone() }, this.requirePhysics()));
      }
      return mesh;
    };
    addBox("physics:ballroom-floor", new THREE.Vector3(15, 0.5, 44), new THREE.Vector3(0, -0.25, 5), floorMat);
    addBox("physics:ballroom-back-wall", new THREE.Vector3(15, 8, 0.5), new THREE.Vector3(0, 4, -17), wallMat);
    addBox("ballroom-left-wall", new THREE.Vector3(0.35, 8, 40), new THREE.Vector3(-7.3, 4, 4), wallMat);
    addBox("ballroom-right-wall", new THREE.Vector3(0.35, 8, 40), new THREE.Vector3(7.3, 4, 4), wallMat);
    this.addRoomFinishing(trimMat);
    this.buildOpeningJordan();
    this.addPartyProps();
    this.addPartyAtmosphere();
    for (const z of [-10, -4, 2, 8, 14, 20]) {
      addBox(`physics:balcony-${z}`, new THREE.Vector3(0.17, 2.1, 0.2), new THREE.Vector3(-5.9, 3.1, z), trimMat);
      addBox(`physics:balcony-right-${z}`, new THREE.Vector3(0.17, 2.1, 0.2), new THREE.Vector3(5.9, 3.1, z), trimMat);
    }
    const rug = new THREE.Mesh(new THREE.BoxGeometry(4.5, 0.025, 33), new THREE.MeshStandardMaterial({ color: "#633746", roughness: 0.65, metalness: 0.12 }));
    rug.position.set(0, 0.015, 3);
    this.group.add(rug);
    this.host.name = "gatsby-at-the-green-light";
    this.host.position.set(0, 0, 24);
    this.host.rotation.y = Math.PI;
    this.group.add(this.host);
    const suit = new THREE.MeshStandardMaterial({ color: "#d6ccae", roughness: 0.46, metalness: 0.18 });
    const silhouette = new THREE.Mesh(new THREE.CapsuleGeometry(0.26, 0.58, 5, 12), suit);
    silhouette.position.y = 1.03;
    this.host.add(silhouette);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.16, 14, 12), this.faceMaterial);
    head.position.y = 1.58;
    this.host.add(head);
    this.faceReveal = new THREE.Mesh(new THREE.PlaneGeometry(0.22, 0.28), new THREE.MeshBasicMaterial({ map: this.faceTexture, transparent: true, side: THREE.DoubleSide, depthWrite: false }));
    this.faceReveal.name = "gatsby-independent-photo-reveal";
    this.faceReveal.position.set(0, 1.58, -0.17);
    this.faceReveal.visible = false;
    this.host.add(this.faceReveal);
    this.faceCanvas.width = 512;
    this.faceCanvas.height = 512;
    this.faceTexture.colorSpace = THREE.SRGBColorSpace;
    this.faceImage.crossOrigin = "anonymous";
    this.faceImage.onload = () => {
      this.drawGatsbyFace();
    };
    this.faceImage.src = GATSBY_FACE_URL;

    const halo = new THREE.Mesh(new THREE.SphereGeometry(0.4, 16, 12), new THREE.MeshBasicMaterial({ color: "#92e1a5", transparent: true, opacity: 0.19 }));
    halo.position.set(0, 1.35, 0.15);
    this.host.add(halo);
    const greenBeam = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.75, 4, 12, 1, true), new THREE.MeshBasicMaterial({ color: "#79d69b", transparent: true, opacity: 0.09, side: THREE.DoubleSide }));
    greenBeam.position.set(0, 3.5, 23);
    this.group.add(greenBeam);
    const source = new THREE.Mesh(new THREE.SphereGeometry(0.32, 14, 12), new THREE.MeshBasicMaterial({ color: "#a2e8ae" }));
    source.position.set(0, 5.5, 23);
    this.group.add(source);
  }

  private addRoomFinishing(trimMat: THREE.MeshStandardMaterial): void {
    const panel = new THREE.MeshStandardMaterial({ color: "#49303a", roughness: 0.62, metalness: 0.08 });
    const darkGold = new THREE.MeshStandardMaterial({ color: "#8d6232", metalness: 0.72, roughness: 0.28, emissive: "#38200d", emissiveIntensity: 0.28 });
    const add = (geometry: THREE.BufferGeometry, material: THREE.Material, position: THREE.Vector3, rotation?: THREE.Euler) => {
      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.copy(position);
      if (rotation) mesh.rotation.copy(rotation);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.group.add(mesh);
      return mesh;
    };
    for (const side of [-1, 1]) {
      for (const z of [-12, -5, 2, 9, 16]) {
        const x = side * 7.05;
        const pilaster = add(new THREE.BoxGeometry(0.12, 6.8, 0.34), trimMat, new THREE.Vector3(x, 3.5, z));
        pilaster.castShadow = false;
        add(new THREE.BoxGeometry(0.2, 0.12, 0.54), darkGold, new THREE.Vector3(x, 6.85, z));
        add(new THREE.BoxGeometry(0.17, 0.12, 0.5), darkGold, new THREE.Vector3(x, 0.22, z));
        add(new THREE.BoxGeometry(0.025, 4.7, 2.8), panel, new THREE.Vector3(side * 7.08, 3.8, z + 3.2));
        add(new THREE.BoxGeometry(0.035, 0.07, 2.5), darkGold, new THREE.Vector3(side * 7.04, 5.95, z + 3.2));
      }
      const drape = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.42, 6.2, 10, 1, true), new THREE.MeshStandardMaterial({ color: side < 0 ? "#54273c" : "#382b54", roughness: 0.88, side: THREE.DoubleSide }));
      drape.position.set(side * 6.84, 3.8, -14.7);
      drape.scale.z = 5;
      this.group.add(drape);
      add(new THREE.TorusGeometry(0.34, 0.045, 8, 20), darkGold, new THREE.Vector3(side * 6.78, 6.85, -14.65), new THREE.Euler(Math.PI / 2, 0, 0));
    }
    const ring = add(new THREE.TorusGeometry(1.65, 0.055, 8, 48), darkGold, new THREE.Vector3(0, 6.45, -1), new THREE.Euler(Math.PI / 2, 0, 0));
    ring.castShadow = false;
    for (let index = 0; index < 8; index++) {
      const angle = (index / 8) * Math.PI * 2;
      const arm = add(new THREE.CylinderGeometry(0.035, 0.055, 1.4, 8), trimMat, new THREE.Vector3(Math.cos(angle) * 0.78, 6.42, -1 + Math.sin(angle) * 0.78));
      arm.rotation.z = Math.cos(angle) * 0.72;
      arm.rotation.x = Math.sin(angle) * 0.72;
      const candle = add(new THREE.CylinderGeometry(0.055, 0.07, 0.32, 8), darkGold, new THREE.Vector3(Math.cos(angle) * 1.42, 6.12, -1 + Math.sin(angle) * 1.42));
      candle.castShadow = false;
      const flame = add(new THREE.SphereGeometry(0.07, 8, 6), new THREE.MeshBasicMaterial({ color: index % 2 ? "#ffda91" : "#fff0c3" }), new THREE.Vector3(Math.cos(angle) * 1.42, 5.91, -1 + Math.sin(angle) * 1.42));
      flame.scale.set(0.75, 1.6, 0.75);
    }
    const wire = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 12.2, 5), darkGold);
    wire.position.set(0, 5.15, -13.1);
    wire.rotation.z = Math.PI / 2;
    this.group.add(wire);
    const bulbColors = ["#ffd58a", "#ff7c89", "#88dfb1", "#bb9cff"];
    for (let index = 0; index < 11; index++) {
      const t = index / 10;
      const x = -6 + t * 12;
      const y = 5.4 - Math.sin(t * Math.PI) * 1.1;
      add(new THREE.SphereGeometry(0.11, 8, 6), new THREE.MeshBasicMaterial({ color: bulbColors[index % bulbColors.length]!, toneMapped: false }), new THREE.Vector3(x, y, -13.1));
    }
    for (const side of [-1, 1]) {
      for (let index = 0; index < 4; index++) {
        const x = side * (4.9 + index * 0.14);
        const z = -5 + index * 7.2;
        const stem = add(new THREE.CylinderGeometry(0.012, 0.018, 0.7, 6), darkGold, new THREE.Vector3(x, 1.65, z));
        stem.rotation.z = (index % 2 ? 1 : -1) * 0.12;
        for (let petal = 0; petal < 5; petal++) {
          const angle = petal * Math.PI * 0.4;
          add(new THREE.SphereGeometry(0.1, 8, 6), new THREE.MeshStandardMaterial({ color: petal % 2 ? "#e9d3af" : "#df9ab0", roughness: 0.8 }), new THREE.Vector3(x + Math.cos(angle) * 0.12, 2.05 + Math.sin(petal) * 0.035, z + Math.sin(angle) * 0.12));
        }
        add(new THREE.SphereGeometry(0.06, 8, 6), new THREE.MeshStandardMaterial({ color: "#c99445", metalness: 0.5, roughness: 0.3 }), new THREE.Vector3(x, 2.05, z));
      }
    }
    for (let index = 0; index < 11; index++) {
      const t = index / 10;
      const x = -6 + t * 12;
      const y = 5.4 - Math.sin(t * Math.PI) * 1.1;
      add(new THREE.SphereGeometry(0.11, 8, 6), new THREE.MeshBasicMaterial({ color: ["#ffd38a", "#ff7c89", "#8fe0ae", "#b39aff"][index % 4]!, toneMapped: false }), new THREE.Vector3(x, y, -13.1));
    }
  }

  private addPartyAtmosphere(): void {
    const balloonColors = ["#c54562", "#d9ad55", "#477f78", "#79629a", "#d77a4e"];
    const stringMaterial = new THREE.MeshStandardMaterial({ color: "#c8ab78", roughness: 0.72 });
    const partyColors = ["#d7b765", "#ba5270", "#71aa93", "#9a80bc", "#e58a60"];
    for (const side of [-1, 1]) {
      for (const z of [-12, -1, 10, 19]) {
        const cluster = new THREE.Group();
        cluster.position.set(side * 5.85, 0, z);
        cluster.rotation.y = side * -0.18;
        this.group.add(cluster);
        for (let index = 0; index < 4; index++) {
          const angle = (index / 4) * Math.PI * 2;
          const x = Math.cos(angle) * 0.27;
          const y = 3.05 + (index % 2) * 0.32;
          const zOffset = Math.sin(angle) * 0.22;
          const balloon = new THREE.Mesh(
            new THREE.SphereGeometry(0.24, 12, 10),
            new THREE.MeshStandardMaterial({ color: balloonColors[(index + Math.round(z)) % balloonColors.length]!, roughness: 0.23, metalness: 0.12, emissive: balloonColors[(index + Math.round(z)) % balloonColors.length]!, emissiveIntensity: 0.14 }),
          );
          balloon.position.set(x, y, zOffset);
          balloon.scale.set(0.84, 1.17, 0.84);
          cluster.add(balloon);
          const knot = new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.085, 6), balloon.material);
          knot.position.set(x, y - 0.28, zOffset);
          knot.rotation.x = Math.PI;
          cluster.add(knot);
          const string = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, y - 0.65, 4), stringMaterial);
          string.position.set(x * 0.45, (y - 0.28) / 2 + 0.08, zOffset * 0.45);
          string.rotation.z = -x * 0.35;
          string.rotation.x = zOffset * 0.35;
          cluster.add(string);
        }
      }
    }

    // Jewel-toned pennants and scattered confetti make the room feel dressed for a full house.
    const pennantColors = ["#b74b67", "#d0a24e", "#568c7d", "#75619a"];
    for (const side of [-1, 1]) {
      for (let index = 0; index < 7; index++) {
        const z = -12 + index * 4.7;
        const pennant = new THREE.Mesh(
          new THREE.ConeGeometry(0.19, 0.42, 3),
          new THREE.MeshStandardMaterial({ color: pennantColors[index % pennantColors.length]!, roughness: 0.68, side: THREE.DoubleSide }),
        );
        pennant.position.set(side * 6.86, 5.45 - (index % 2) * 0.22, z);
        pennant.rotation.z = Math.PI;
        pennant.rotation.y = side * Math.PI / 2;
        this.group.add(pennant);
      }
    }
    for (let index = 0; index < 76; index++) {
      const angle = index * 2.399963;
      const radius = 0.035 + (index % 7) * 0.012;
      const confetti = new THREE.Mesh(
        new THREE.BoxGeometry(0.045 + (index % 3) * 0.018, 0.012, 0.075),
        new THREE.MeshStandardMaterial({ color: partyColors[index % partyColors.length]!, metalness: 0.22, roughness: 0.4, emissive: partyColors[index % partyColors.length]!, emissiveIntensity: 0.08 }),
      );
      confetti.position.set(Math.cos(angle) * (1.1 + (index % 6) * 0.78), 0.035 + (index % 3) * 0.002, -12 + ((index * 17) % 330) / 10);
      confetti.rotation.set(0, angle, (index % 2 ? 1 : -1) * radius);
      this.group.add(confetti);
    }
  }

  private addPartyProps(): void {
    const brass = new THREE.MeshStandardMaterial({ color: "#bc8c49", metalness: 0.76, roughness: 0.24 });
    const glass = new THREE.MeshPhysicalMaterial({ color: "#d8e1dc", metalness: 0.12, roughness: 0.12, transparent: true, opacity: 0.72, transmission: 0.22 });
    const champagne = new THREE.MeshStandardMaterial({ color: "#cda747", metalness: 0.48, roughness: 0.24 });
    const linen = new THREE.MeshStandardMaterial({ color: "#e5d3b0", roughness: 0.92 });
    const bottleGlass = new THREE.MeshStandardMaterial({ color: "#294e3c", roughness: 0.24, metalness: 0.25 });
    for (const side of [-1, 1]) {
      for (const z of [-7, 2, 11, 18]) {
        const x = side * 5.05;
        const table = new THREE.Group();
        table.position.set(x, 0, z);
        this.group.add(table);
        const top = new THREE.Mesh(new THREE.CylinderGeometry(0.83, 0.87, 0.12, 20), brass);
        top.position.y = 1.03;
        table.add(top);
        const cloth = new THREE.Mesh(new THREE.CylinderGeometry(0.88, 0.96, 0.65, 20, 1, true), linen);
        cloth.position.y = 0.72;
        table.add(cloth);
        const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.22, 0.95, 12), brass);
        stem.position.y = 0.48;
        table.add(stem);
        const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.46, 0.48, 0.09, 16), brass);
        foot.position.y = 0.07;
        table.add(foot);
        const bottle = new THREE.Mesh(new THREE.CylinderGeometry(0.105, 0.13, 0.5, 10), bottleGlass);
        bottle.position.set(-0.25, 1.34, -0.12);
        bottle.rotation.z = -0.08;
        table.add(bottle);
        const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.07, 0.2, 8), bottleGlass);
        neck.position.set(-0.25, 1.68, -0.12);
        table.add(neck);
        const label = new THREE.Mesh(new THREE.BoxGeometry(0.19, 0.13, 0.018), linen);
        label.position.set(-0.25, 1.34, -0.24);
        table.add(label);
        for (const [glassX, glassZ] of [[0.17, -0.18], [0.44, 0.14], [-0.02, 0.28]] as const) {
          const coupe = new THREE.Group();
          coupe.position.set(glassX, 1.1, glassZ);
          table.add(coupe);
          const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.025, 0.12, 12, 1, true), glass);
          bowl.position.y = 0.1;
          coupe.add(bowl);
          const liquid = new THREE.Mesh(new THREE.CylinderGeometry(0.095, 0.02, 0.035, 10), champagne);
          liquid.position.y = 0.14;
          coupe.add(liquid);
          const stemGlass = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.16, 6), glass);
          stemGlass.position.y = -0.03;
          coupe.add(stemGlass);
          const baseGlass = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.015, 10), glass);
          baseGlass.position.y = -0.12;
          coupe.add(baseGlass);
        }
      }
    }
  }

  private buildBackdropCrowd(): void {
    const jacketColors = ["#654052", "#344c4b", "#655239", "#463c62", "#813f44", "#3e5268", "#80633e"];
    const jackets = jacketColors.map((color) => new THREE.MeshStandardMaterial({ color, roughness: 0.58, metalness: 0.08 }));
    const skins = ["#c58d72", "#e0b092", "#a96e57", "#e4c1a0"].map((color) => new THREE.MeshStandardMaterial({ color, roughness: 0.7 }));
    const hair = ["#241b20", "#56392b", "#a58554"].map((color) => new THREE.MeshStandardMaterial({ color, roughness: 0.84 }));
    const gold = new THREE.MeshStandardMaterial({ color: "#c89a52", metalness: 0.76, roughness: 0.24 });
    const positions: { x: number; z: number; yaw: number; gesture: number }[] = [];
    for (const side of [-1, 1]) {
      for (let index = 0; index < 8; index++) {
        positions.push({ x: side * (4.15 + (index % 2) * 0.42), z: -9 + index * 3.85, yaw: side < 0 ? -0.3 : Math.PI + 0.3, gesture: index % 3 === 0 ? 1 : index % 3 === 1 ? 0.55 : 0.2 });
      }
    }
    for (let index = 0; index < 5; index++) {
      positions.push({ x: [-4.6, -2.45, 0, 2.45, 4.6][index]!, z: 20 + (index % 2) * 0.45, yaw: Math.PI + (index - 2) * 0.12, gesture: index % 2 ? 0.65 : 0.25 });
    }
    positions.forEach((position, index) => {
      const root = new THREE.Group();
      root.name = `party-background-guest-${String(index + 1).padStart(2, "0")}`;
      root.position.set(position.x, 0, position.z);
      root.rotation.y = position.yaw;
      this.group.add(root);
      const outfit = jackets[index % jackets.length]!;
      const skin = skins[index % skins.length]!;
      const add = (geometry: THREE.BufferGeometry, material: THREE.Material, parent: THREE.Object3D, p: [number, number, number], scale?: [number, number, number]) => {
        const mesh = new THREE.Mesh(geometry, material);
        mesh.position.set(p[0], p[1], p[2]);
        if (scale) mesh.scale.set(scale[0], scale[1], scale[2]);
        mesh.castShadow = false;
        mesh.receiveShadow = false;
        parent.add(mesh);
        return mesh;
      };
      const torso = add(new THREE.CapsuleGeometry(0.2, 0.38, 4, 9), outfit, root, [0, 1.17, 0]);
      torso.rotation.z = (index % 2 ? 0.045 : -0.045);
      add(new THREE.SphereGeometry(0.15, 12, 10), skin, root, [0, 1.68, 0]);
      add(new THREE.SphereGeometry(0.16, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), hair[index % hair.length]!, root, [0, 1.76, 0]);
      add(new THREE.BoxGeometry(0.25, 0.09, 0.055), gold, root, [0, 1.38, -0.17]);
      add(new THREE.SphereGeometry(0.035, 8, 6), gold, root, [0, 1.29, -0.19]);
      for (const buttonY of [1.19, 1.08, 0.97]) add(new THREE.SphereGeometry(0.018, 6, 5), gold, root, [0, buttonY, -0.19]);
      const arms: THREE.Group[] = [];
      for (const side of [-1, 1]) {
        const shoulder = new THREE.Group();
        shoulder.position.set(side * 0.19, 1.34, 0);
        root.add(shoulder);
        add(new THREE.CapsuleGeometry(0.067, 0.31, 4, 8), outfit, shoulder, [side * 0.015, -0.17, 0]);
        const cuff = add(new THREE.TorusGeometry(0.066, 0.012, 5, 10), gold, shoulder, [side * 0.02, -0.32, 0]);
        cuff.rotation.x = Math.PI / 2;
        const hand = add(new THREE.SphereGeometry(0.058, 8, 6), skin, shoulder, [side * 0.025, -0.36, -0.015]);
        if (side === 1 && position.gesture > 0.5 && index % 4 === 0) {
          const glass = add(new THREE.CylinderGeometry(0.045, 0.01, 0.09, 8), new THREE.MeshStandardMaterial({ color: "#f0d58c", emissive: "#6a4b1c", emissiveIntensity: 0.35 }), shoulder, [0.025, -0.42, 0]);
          glass.rotation.z = -0.2;
          hand.material = skin;
        }
        arms.push(shoulder);
      }
      const legs: THREE.Group[] = [];
      for (const side of [-1, 1]) {
        const hip = new THREE.Group();
        hip.position.set(side * 0.11, 0.88, 0);
        root.add(hip);
        add(new THREE.CapsuleGeometry(0.078, 0.36, 4, 8), outfit, hip, [0, -0.22, 0]);
        add(new THREE.BoxGeometry(0.13, 0.07, 0.23), hair[0]!, hip, [0, -0.43, -0.035]);
        legs.push(hip);
      }
      if (index % 3 === 0) {
        const hat = add(new THREE.CylinderGeometry(0.2, 0.21, 0.055, 12), gold, root, [0, 1.81, 0]);
        hat.rotation.x = (index % 2 ? 0.08 : -0.08);
      }
      root.userData.crowdTorso = torso;
      this.ambientGuests.push({ root, torso, arms, legs, baseX: position.x, baseY: 0, baseZ: position.z, yaw: position.yaw, phase: index * 1.71, gesture: position.gesture });
    });
  }

  private animateBackdropCrowd(dt: number): void {
    for (const guest of this.ambientGuests) {
      guest.phase += dt * (1.15 + guest.gesture * 0.45);
      guest.root.position.set(
        guest.baseX + Math.sin(guest.phase * 0.45) * 0.055,
        guest.baseY + Math.abs(Math.sin(guest.phase * 2)) * 0.025,
        guest.baseZ + Math.cos(guest.phase * 0.36) * 0.045,
      );
      guest.root.rotation.y = guest.yaw + Math.sin(guest.phase * 0.7) * 0.09;
      guest.torso.rotation.z = Math.sin(guest.phase * 1.35) * (0.045 + guest.gesture * 0.035);
      guest.torso.rotation.x = Math.sin(guest.phase * 0.8) * 0.045;
      guest.arms.forEach((arm, index) => {
        const highGesture = guest.gesture > 0.8 && index === 1 ? Math.PI * 0.72 : 0;
        arm.rotation.z = highGesture + Math.sin(guest.phase + index * Math.PI) * (0.2 + guest.gesture * 0.24);
        arm.rotation.x = Math.sin(guest.phase * 0.8 + index) * 0.12;
      });
      guest.legs.forEach((leg, index) => {
        leg.rotation.z = Math.sin(guest.phase * 1.6 + index * Math.PI) * (0.045 + guest.gesture * 0.07);
        leg.rotation.x = Math.max(0, Math.sin(guest.phase * 1.6 + index * Math.PI)) * 0.08;
      });
    }
  }

  private createGuest(index: number): Guest {
    const root = new THREE.Group();
    root.name = `party-guest-${String(index + 1).padStart(2, "0")}`;
    const column = index % 3;
    const row = Math.floor(index / 3);
    const base = new THREE.Vector3((column - 1) * 1.1, 0, -9 + row * 5.1);
    const yaw = (Math.random() - 0.5) * 0.35;
    root.position.copy(base);
    root.rotation.y = yaw;
    this.group.add(root);
    const suit = new THREE.MeshStandardMaterial({ color: PALETTE[index % PALETTE.length]!, roughness: 0.5, metalness: 0.12, emissive: PALETTE[index % PALETTE.length]!, emissiveIntensity: 0.08 });
    const skin = new THREE.MeshStandardMaterial({ color: index % 2 ? "#d7ad8e" : "#e5bb9a", roughness: 0.66 });
    const partDefs = [
      { name: "pelvis", shape: "box" as const, pos: [0, 0.92, 0], size: [0.36, 0.24, 0.25], mass: 2.2, material: suit },
      { name: "torso", shape: "capsule" as const, pos: [0, 1.22, 0], radius: 0.19, length: 0.48, mass: 2.8, material: suit },
      { name: "head", shape: "sphere" as const, pos: [0, 1.68, 0], radius: 0.15, mass: 0.8, material: skin },
      { name: "armL", shape: "capsule" as const, pos: [-0.29, 1.22, 0], radius: 0.075, length: 0.42, mass: 0.65, material: suit },
      { name: "armR", shape: "capsule" as const, pos: [0.29, 1.22, 0], radius: 0.075, length: 0.42, mass: 0.65, material: suit },
      { name: "legL", shape: "capsule" as const, pos: [-0.12, 0.48, 0], radius: 0.085, length: 0.48, mass: 0.9, material: suit },
      { name: "legR", shape: "capsule" as const, pos: [0.12, 0.48, 0], radius: 0.085, length: 0.48, mass: 0.9, material: suit },
    ];
    const parts: BodyPart[] = [];
    const byName = new Map<string, BodyPart>();
    for (const def of partDefs) {
      let geometry: THREE.BufferGeometry;
      let shape: typeof PhysicsShapeType[keyof typeof PhysicsShapeType];
      const options: { mass: number; friction: number; restitution: number; radius?: number; pointA?: THREE.Vector3; pointB?: THREE.Vector3; extents?: THREE.Vector3 } = { mass: def.mass, friction: 0.62, restitution: 0.08 };
      if (def.shape === "box") {
        geometry = new THREE.BoxGeometry(def.size![0], def.size![1], def.size![2]);
        shape = PhysicsShapeType.BOX;
        options.extents = new THREE.Vector3(...def.size!);
      } else if (def.shape === "capsule") {
        geometry = new THREE.CapsuleGeometry(def.radius!, def.length! - def.radius! * 2, 4, 10);
        shape = PhysicsShapeType.CAPSULE;
        const half = def.length! / 2 - def.radius!;
        options.radius = def.radius;
        options.pointA = new THREE.Vector3(0, -half, 0);
        options.pointB = new THREE.Vector3(0, half, 0);
      } else {
        geometry = new THREE.SphereGeometry(def.radius!, 14, 12);
        shape = PhysicsShapeType.SPHERE;
        options.radius = def.radius;
      }
      const mesh = new THREE.Mesh(geometry, def.material);
      mesh.name = `${root.name}:${def.name}`;
      mesh.position.set(def.pos[0], def.pos[1], def.pos[2]);
      mesh.castShadow = false;
      mesh.receiveShadow = false;
      root.add(mesh);
      const part: BodyPart = {
        name: def.name,
        mesh,
        rest: new THREE.Vector3(def.pos[0], def.pos[1], def.pos[2]),
        createAggregate: () => {
          const aggregate = new PhysicsAggregate(mesh, shape, options, this.requirePhysics());
          aggregate.body.havokBody.setLinearDamping(1.2);
          aggregate.body.havokBody.setAngularDamping(2.8);
          return aggregate;
        },
      };
      parts.push(part);
      byName.set(def.name, part);
    }
    const torso = byName.get("torso")!;
    this.addGuestDetails(root, index, suit, skin, byName);
    return { root, parts, joints: [], torso, grabbed: false, cleared: false, thrown: false, activated: false, base, baseYaw: yaw, phase: Math.random() * Math.PI * 2 };
  }

  private addGuestDetails(root: THREE.Group, index: number, suit: THREE.MeshStandardMaterial, skin: THREE.MeshStandardMaterial, parts: Map<string, BodyPart>): void {
    const gold = new THREE.MeshStandardMaterial({ color: index % 2 ? "#d7b565" : "#b88747", metalness: 0.72, roughness: 0.26, emissive: "#654118", emissiveIntensity: 0.12 });
    const shirt = new THREE.MeshStandardMaterial({ color: index % 2 ? "#f0e1c8" : "#d8e6df", roughness: 0.82 });
    const accent = new THREE.MeshStandardMaterial({ color: ["#e0b75d", "#e2a6a2", "#9fc7bd", "#e4d5bf", "#b9a3d8"][index % 5]!, roughness: 0.5, metalness: 0.1 });
    const hair = new THREE.MeshStandardMaterial({ color: ["#2a2021", "#64432d", "#b39761", "#3b3c48"][index % 4]!, roughness: 0.88 });
    const add = (parent: THREE.Object3D, geometry: THREE.BufferGeometry, material: THREE.Material, position: [number, number, number], rotation?: [number, number, number]) => {
      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.set(...position);
      if (rotation) mesh.rotation.set(...rotation);
      mesh.castShadow = false;
      mesh.receiveShadow = false;
      parent.add(mesh);
      return mesh;
    };
    const torso = parts.get("torso")!.mesh;
    const head = parts.get("head")!.mesh;
    const pelvis = parts.get("pelvis")!.mesh;

    // Crisp shirt front, contrasting lapels, and a jeweled tie travel with the ragdoll torso.
    add(torso, new THREE.BoxGeometry(0.18, 0.38, 0.024), shirt, [0, 0.015, -0.183]);
    const lapelShape = new THREE.Shape();
    lapelShape.moveTo(0, 0.13);
    lapelShape.lineTo(0.095, 0.205);
    lapelShape.lineTo(0.165, -0.06);
    lapelShape.lineTo(0.075, -0.025);
    lapelShape.closePath();
    const lapelGeometry = new THREE.ShapeGeometry(lapelShape);
    const leftLapel = add(torso, lapelGeometry, suit, [-0.09, 0.015, -0.202]);
    leftLapel.rotation.y = Math.PI;
    add(torso, lapelGeometry.clone(), suit, [0.09, 0.015, -0.202]);
    const tieShape = new THREE.Shape();
    tieShape.moveTo(-0.035, 0.17);
    tieShape.lineTo(0.035, 0.17);
    tieShape.lineTo(0.05, -0.13);
    tieShape.lineTo(0, -0.19);
    tieShape.lineTo(-0.05, -0.13);
    tieShape.closePath();
    add(torso, new THREE.ShapeGeometry(tieShape), accent, [0, -0.01, -0.219]);
    for (const y of [0.08, -0.02, -0.12]) add(torso, new THREE.SphereGeometry(0.016, 7, 6), gold, [0.075, y, -0.22]);
    add(torso, new THREE.BoxGeometry(0.09, 0.07, 0.018), accent, [-0.12, -0.11, -0.197]);
    add(torso, new THREE.BoxGeometry(0.025, 0.09, 0.022), shirt, [-0.135, -0.11, -0.207]);

    // A coiffed silhouette, expressive face, and optional party hat give each guest a read at a glance.
    add(head, new THREE.SphereGeometry(0.155, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), hair, [0, 0.045, 0]);
    for (const side of [-1, 1]) {
      add(head, new THREE.SphereGeometry(0.019, 7, 6), shirt, [side * 0.052, 0.012, -0.138]);
      add(head, new THREE.SphereGeometry(0.009, 6, 5), hair, [side * 0.052, 0.012, -0.153]);
    }
    add(head, new THREE.SphereGeometry(0.022, 7, 6), skin, [0, -0.025, -0.151]);
    add(head, new THREE.TorusGeometry(0.035, 0.006, 5, 12, Math.PI), hair, [0, -0.075, -0.143], [0, 0, Math.PI]);
    if (index % 3 === 0) {
      add(head, new THREE.CylinderGeometry(0.17, 0.18, 0.045, 12), gold, [0, 0.16, 0]);
      add(head, new THREE.CylinderGeometry(0.12, 0.14, 0.16, 12), accent, [0, 0.25, 0]);
      add(head, new THREE.BoxGeometry(0.27, 0.018, 0.27), gold, [0, 0.18, 0]);
    } else if (index % 3 === 1) {
      add(head, new THREE.TorusGeometry(0.057, 0.009, 5, 12), gold, [0.052, 0.018, -0.145]);
      add(head, new THREE.CylinderGeometry(0.008, 0.008, 0.11, 5), gold, [0.052, -0.052, -0.14]);
    }

    // Cuff links and polished shoes complete the suit without adding more physics bodies.
    for (const name of ["armL", "armR"]) {
      const arm = parts.get(name)!.mesh;
      add(arm, new THREE.TorusGeometry(0.066, 0.011, 5, 10), shirt, [0, -0.16, 0]);
      add(arm, new THREE.SphereGeometry(0.018, 6, 5), gold, [0, -0.17, -0.064]);
    }
    for (const name of ["legL", "legR"]) {
      const leg = parts.get(name)!.mesh;
      add(leg, new THREE.BoxGeometry(0.15, 0.11, 0.25), new THREE.MeshStandardMaterial({ color: "#241e25", roughness: 0.32, metalness: 0.18 }), [0, -0.27, -0.035]);
    }
    add(pelvis, new THREE.BoxGeometry(0.31, 0.035, 0.025), gold, [0, 0, -0.138]);
    add(pelvis, new THREE.BoxGeometry(0.055, 0.065, 0.03), accent, [0, 0, -0.16]);
    root.userData.partyOutfit = index;
  }

  private animateIdleGuests(dt: number): void {
    for (const guest of this.guests) {
      if (guest.activated || guest.cleared) continue;
      guest.phase += dt * 1.8;
      const sway = Math.sin(guest.phase);
      guest.root.position.set(guest.base.x, Math.abs(Math.sin(guest.phase * 1.7)) * 0.018, guest.base.z);
      guest.root.rotation.set(0, guest.baseYaw + sway * 0.035, 0);
      for (const part of guest.parts) {
        part.mesh.position.copy(part.rest);
        part.mesh.rotation.set(0, 0, 0);
        if (part.name === "torso") part.mesh.rotation.z = sway * 0.018;
        else if (part.name === "head") part.mesh.rotation.z = sway * 0.035;
        else if (part.name.startsWith("arm")) part.mesh.rotation.z = sway * (part.name === "armL" ? -0.06 : 0.06);
        else if (part.name.startsWith("leg")) part.mesh.rotation.z = sway * (part.name === "legL" ? 0.025 : -0.025);
      }
    }
  }

  private activateRagdoll(guest: Guest): void {
    if (guest.activated) return;
    guest.activated = true;
    guest.root.position.set(guest.base.x, 0, guest.base.z);
    guest.root.rotation.set(0, guest.baseYaw, 0);
    for (const part of guest.parts) {
      part.mesh.position.copy(part.rest);
      part.mesh.rotation.set(0, 0, 0);
    }
    guest.root.updateMatrixWorld(true);
    const byName = new Map(guest.parts.map((part) => [part.name, part]));
    for (const part of guest.parts) {
      part.aggregate = part.createAggregate();
      part.aggregate.body.setLinearVelocity(new THREE.Vector3());
      part.aggregate.body.setAngularVelocity(new THREE.Vector3());
    }
    const link = (parentName: string, childName: string, pivot: THREE.Vector3, range: number) => {
      const parent = byName.get(parentName)!;
      const child = byName.get(childName)!;
      const constraint = new PhysicsConstraint(this.requirePhysics().scene, {
        pivotA: pivot.clone().sub(parent.rest),
        pivotB: pivot.clone().sub(child.rest),
      }, { twist: [-range, range], pitch: [-range, range], roll: [-range, range] });
      this.requirePhysics().addConstraint(parent.aggregate!.body, child.aggregate!.body, constraint);
      guest.joints.push(constraint);
    };
    link("pelvis", "torso", new THREE.Vector3(0, 1.045, 0), 0.45);
    link("torso", "head", new THREE.Vector3(0, 1.49, 0), 0.5);
    link("torso", "armL", new THREE.Vector3(-0.2, 1.39, 0), 1.05);
    link("torso", "armR", new THREE.Vector3(0.2, 1.39, 0), 1.05);
    link("pelvis", "legL", new THREE.Vector3(-0.12, 0.81, 0), 0.72);
    link("pelvis", "legR", new THREE.Vector3(0.12, 0.81, 0), 0.72);
  }

  private disposeGuestPhysics(guest: Guest): void {
    for (const joint of guest.joints.splice(0)) joint.dispose();
    for (const part of guest.parts) {
      part.aggregate?.dispose();
      part.aggregate = undefined;
    }
  }

  private pullGuest(guest: Guest): void {
    this.raycaster.setFromCamera(this.pointer, this.ctx.camera);
    const direction = this.raycaster.ray.direction;
    const center = this.guestCenter(guest, this.centerScratch);
    const depth = Math.max(2, Math.min(13, center.dot(direction) - this.raycaster.ray.origin.dot(direction)));
    this.dragPoint.copy(this.raycaster.ray.origin).addScaledVector(direction, depth);
    this.dragPoint.x = THREE.MathUtils.clamp(this.dragPoint.x, -5.7, 5.7);
    this.dragPoint.y = Math.max(1.2, this.dragPoint.y);
    this.dragPoint.z = Math.min(18, this.dragPoint.z);
    this.pullVelocity.copy(this.dragPoint).sub(center).multiplyScalar(10.5);
    if (this.pullVelocity.length() > 14) this.pullVelocity.setLength(14);
    for (const part of guest.parts) part.aggregate!.body.setLinearVelocity(this.pullVelocity);
  }

  private moveNick(dt: number): void {
    const keys = this.ctx.keys;
    const forward = Number(keys.has("w") || keys.has("arrowup")) - Number(keys.has("s") || keys.has("arrowdown"));
    const strafe = Number(keys.has("d") || keys.has("arrowright")) - Number(keys.has("a") || keys.has("arrowleft"));
    if (forward === 0 && strafe === 0) return;
    this.movementScratch.set(-Math.sin(this.yaw) * forward + Math.cos(this.yaw) * strafe, 0, -Math.cos(this.yaw) * forward - Math.sin(this.yaw) * strafe).normalize().multiplyScalar(Math.min(dt, 1 / 30) * 1.8);
    const canStandAt = (x: number, z: number): boolean => {
      if (x < -6.45 || x > 6.45 || z < -15.7 || z > 17.2) return false;
      for (const guest of this.guests) {
        if (guest.cleared || guest.thrown) continue;
        const dx = x - guest.root.position.x;
        const dz = z - guest.root.position.z;
        if (dx * dx + dz * dz < 0.62 * 0.62) return false;
      }
      return true;
    };
    this.candidatePosition.copy(this.playerPosition);
    this.candidatePosition.x += this.movementScratch.x;
    if (canStandAt(this.candidatePosition.x, this.candidatePosition.z)) this.playerPosition.x = this.candidatePosition.x;
    this.candidatePosition.copy(this.playerPosition);
    this.candidatePosition.z += this.movementScratch.z;
    if (canStandAt(this.candidatePosition.x, this.candidatePosition.z)) this.playerPosition.z = this.candidatePosition.z;
  }

  private pushNearbyGuest(): void {
    if (this.phase !== "playing" || this.dragging) return;
    this.pushDirection.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    let candidate: Guest | null = null;
    let nearest = 2.35;
    for (const guest of this.guests) {
      if (guest.cleared) continue;
      this.guestCenter(guest, this.centerScratch);
      const dx = this.centerScratch.x - this.playerPosition.x;
      const dz = this.centerScratch.z - this.playerPosition.z;
      const distance = Math.hypot(dx, dz);
      if (distance >= nearest || distance < 0.001) continue;
      const alignment = (dx * this.pushDirection.x + dz * this.pushDirection.z) / distance;
      if (alignment < 0.35) continue;
      candidate = guest;
      nearest = distance;
    }
    if (!candidate) return;
    this.activateRagdoll(candidate);
    candidate.thrown = true;
    const pushStrength = 5.5 + (2.35 - nearest) * 2;
    this.pullVelocity.copy(this.pushDirection).multiplyScalar(pushStrength);
    this.pullVelocity.y = 2.8;
    for (const part of candidate.parts) {
      part.aggregate!.body.setLinearVelocity(this.pullVelocity);
      part.aggregate!.body.setAngularVelocity(this.angularScratch.set((Math.random() - 0.5) * 7, (Math.random() - 0.5) * 9, (Math.random() - 0.5) * 7));
    }
  }

  private placeCamera(_snap: boolean): void {
    const camera = this.ctx.camera;
    if (this.phase === "opening") {
      const progress = THREE.MathUtils.smoothstep(this.openingElapsed, 1.15, 5.4);
      const startPosition = new THREE.Vector3(0, 1.78, 10.5);
      const nickPosition = new THREE.Vector3(this.playerPosition.x, 1.62, this.playerPosition.z);
      const startTarget = new THREE.Vector3(0, 1.55, this.host.position.z);
      const jordanTarget = this.openingJordan.position.clone().add(new THREE.Vector3(0, 1.08, 0));
      camera.position.copy(startPosition.lerp(nickPosition, progress));
      camera.lookAt(startTarget.lerp(jordanTarget, progress));
      camera.fov = THREE.MathUtils.lerp(54, 62, progress);
      camera.updateProjectionMatrix();
      return;
    }
    if (this.phase === "ending") {
      const turnProgress = THREE.MathUtils.smoothstep(this.endElapsed, 2.25, 3.25);
      const revealProgress = THREE.MathUtils.smoothstep(this.endElapsed, 1.15, 2.45);
      this.host.rotation.y = Math.PI * (1 - turnProgress);
      if (this.faceReveal) this.faceReveal.visible = this.faceImage.complete && this.faceImage.naturalWidth > 0 && revealProgress > 0.9;
      camera.position.set(
        THREE.MathUtils.lerp(this.playerPosition.x, this.host.position.x, revealProgress),
        THREE.MathUtils.lerp(1.62, 1.6, revealProgress),
        THREE.MathUtils.lerp(this.playerPosition.z, this.host.position.z - 1.6, revealProgress),
      );
      camera.lookAt(this.host.position.x, 1.58, this.host.position.z);
      camera.fov = THREE.MathUtils.lerp(68, 26, revealProgress);
      camera.updateProjectionMatrix();
      return;
    }
    this.host.rotation.y = Math.PI;
    if (this.faceReveal) this.faceReveal.visible = false;
    camera.position.set(this.playerPosition.x, 1.62, this.playerPosition.z);
    camera.rotation.order = "YXZ";
    camera.rotation.set(this.pitch, this.yaw, 0);
    camera.fov = 68;
    camera.updateProjectionMatrix();
  }

  private buildOpeningJordan(): void {
    this.openingJordan.name = "opening-jordan-baker";
    this.openingJordan.position.set(1.25, 0, -10.8);
    this.openingJordan.rotation.y = 0;
    this.group.add(this.openingJordan);
    const dress = new THREE.MeshStandardMaterial({ color: "#d8c2a2", roughness: 0.84 });
    const skin = new THREE.MeshStandardMaterial({ color: "#d1a486", roughness: 0.78 });
    const hair = new THREE.MeshStandardMaterial({ color: "#75553b", roughness: 0.88 });
    const add = (geometry: THREE.BufferGeometry, material: THREE.Material, position: [number, number, number]) => {
      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.set(...position);
      mesh.castShadow = false;
      mesh.receiveShadow = false;
      this.openingJordan.add(mesh);
      return mesh;
    };
    add(new THREE.CapsuleGeometry(0.21, 0.48, 4, 10), dress, [0, 1.05, 0]);
    add(new THREE.SphereGeometry(0.14, 12, 10), skin, [0, 1.66, 0]);
    add(new THREE.SphereGeometry(0.155, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), hair, [0, 1.73, 0.01]);
    for (const side of [-1, 1]) {
      const arm = add(new THREE.CapsuleGeometry(0.055, 0.34, 4, 8), dress, [side * 0.25, 1.12, 0]);
      arm.rotation.z = side * -0.08;
      const leg = add(new THREE.CapsuleGeometry(0.07, 0.42, 4, 8), dress, [side * 0.11, 0.39, 0]);
      leg.rotation.z = side * 0.025;
    }
  }

  private drawGatsbyFace(): void {
    const context = this.faceCanvas.getContext("2d");
    if (!context || !this.faceImage.complete || this.faceImage.naturalWidth === 0) return;
    context.clearRect(0, 0, this.faceCanvas.width, this.faceCanvas.height);
    context.save();
    context.beginPath();
    context.ellipse(256, 256, 220, 248, 0, 0, Math.PI * 2);
    context.clip();
    context.drawImage(this.faceImage, 280, 8, 112, 132, 36, 8, 440, 504);
    context.restore();
    this.faceTexture.needsUpdate = true;
  }

  private guestCenter(guest: Guest, target: THREE.Vector3): THREE.Vector3 {
    return guest.torso.mesh.getWorldPosition(target);
  }

  private raycastGuest(event: PointerEvent): Guest | null {
    const canvas = this.ctx.engine.domElement;
    if (document.pointerLockElement === canvas) this.pointer.set(0, 0);
    else {
      const bounds = canvas.getBoundingClientRect();
      this.pointer.set((event.clientX - bounds.left) / bounds.width * 2 - 1, -((event.clientY - bounds.top) / bounds.height * 2 - 1));
    }
    this.raycaster.setFromCamera(this.pointer, this.ctx.camera);
    const objects = this.guests.filter((guest) => !guest.cleared).flatMap((guest) => guest.parts.map((part) => part.mesh));
    const hit = this.raycaster.intersectObjects(objects, false)[0];
    if (!hit) return null;
    return this.guests.find((guest) => guest.parts.some((part) => part.mesh === hit.object)) ?? null;
  }

  private readonly contextMenuHandler = (event: MouseEvent): void => event.preventDefault();

  private readonly pointerDownHandler = (event: PointerEvent): void => {
    if (event.button === 2) {
      if (document.pointerLockElement === this.ctx.engine.domElement) document.exitPointerLock();
      return;
    }
    if (event.button !== 0 || this.phase !== "playing" || this.dragging) return;
    const guest = this.raycastGuest(event);
    if (!guest) {
      void this.ctx.engine.domElement.requestPointerLock?.();
      return;
    }
    event.preventDefault();
    this.pointerDown = true;
    this.dragStart.copy(this.pointer);
    this.dragging = guest;
    guest.grabbed = true;
    guest.thrown = false;
    this.activateRagdoll(guest);
    this.ctx.engine.domElement.style.cursor = "grabbing";
    void this.ctx.engine.domElement.requestPointerLock?.();
  };

  private readonly pointerMoveHandler = (event: PointerEvent): void => {
    const canvas = this.ctx.engine.domElement;
    if (document.pointerLockElement === canvas) {
      if (this.pointerDown && this.dragging) {
        const bounds = canvas.getBoundingClientRect();
        this.pointer.x = THREE.MathUtils.clamp(this.pointer.x + event.movementX * 2 / bounds.width, -1, 1);
        this.pointer.y = THREE.MathUtils.clamp(this.pointer.y - event.movementY * 2 / bounds.height, -1, 1);
      } else {
        this.yaw -= event.movementX * 0.0022;
        this.pitch = THREE.MathUtils.clamp(this.pitch - event.movementY * 0.0018, -0.8, 0.8);
      }
      return;
    }
    if (!this.pointerDown || !this.dragging) return;
    const bounds = canvas.getBoundingClientRect();
    this.pointer.set((event.clientX - bounds.left) / bounds.width * 2 - 1, -((event.clientY - bounds.top) / bounds.height * 2 - 1));
  };

  private readonly pointerUpHandler = (): void => {
    this.pointerDown = false;
    if (!this.dragging) return;
    const guest = this.dragging;
    this.dragging = null;
    guest.grabbed = false;
    this.ctx.engine.domElement.style.cursor = "grab";
    this.guestCenter(guest, this.centerScratch);
    const swipeX = this.pointer.x - this.dragStart.x;
    const swipeY = this.pointer.y - this.dragStart.y;
    const throwDirection = this.ctx.camera.getWorldDirection(this.dragPoint);
    throwDirection.y = THREE.MathUtils.clamp(throwDirection.y, -0.12, 0.48);
    throwDirection.normalize();
    const cameraRight = this.angularScratch.set(throwDirection.z, 0, -throwDirection.x).normalize();
    const throwPower = 12 + Math.min(8, Math.hypot(swipeX, swipeY) * 15);
    const force = this.pullVelocity.copy(throwDirection).multiplyScalar(throwPower)
      .addScaledVector(cameraRight, THREE.MathUtils.clamp(swipeX * 24, -18, 18));
    force.y += 4.5 + Math.abs(swipeY) * 4 + Math.max(0, swipeY) * 7;
    guest.thrown = true;
    for (const part of guest.parts) {
      part.aggregate!.body.setLinearVelocity(force);
      part.aggregate!.body.setAngularVelocity(this.angularScratch.set((Math.random() - 0.5) * 8, (Math.random() - 0.5) * 8, (Math.random() - 0.5) * 8));
    }
  };

  private readonly blurHandler = (): void => {
    this.pointerDown = false;
    this.releaseGuest();
  };

  private releaseGuest(): void {
    if (this.dragging) {
      const guest = this.dragging;
      guest.grabbed = false;
      if (guest.activated && !guest.thrown) {
        this.disposeGuestPhysics(guest);
        guest.activated = false;
        guest.root.position.set(guest.base.x, 0, guest.base.z);
        guest.root.rotation.set(0, guest.baseYaw, 0);
        for (const part of guest.parts) {
          part.mesh.position.copy(part.rest);
          part.mesh.rotation.set(0, 0, 0);
        }
      }
    }
    this.dragging = null;
    this.pointerDown = false;
    if (this.ctx.engine?.domElement) this.ctx.engine.domElement.style.cursor = "grab";
  }

  private requirePhysics() {
    if (!this.ctx.physics) throw new Error("The Guests chapter requires Havok physics.");
    return this.ctx.physics;
  }
}
