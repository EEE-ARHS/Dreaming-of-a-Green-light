import * as THREE from "three";
import { RIPPLE_COUNT, RIPPLE_LIFE, SPRAY_COUNT } from "./constants";
import { waveHeight } from "./water";

/** A soft radial blob: the halo of the green light, the stars, and every drop of spray. */
export function createGlowTexture(size = 128): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext("2d");
  if (context) {
    const half = size / 2;
    const gradient = context.createRadialGradient(half, half, 0, half, half, half);
    gradient.addColorStop(0, "rgba(255,255,255,1)");
    gradient.addColorStop(0.24, "rgba(255,255,255,.7)");
    gradient.addColorStop(0.58, "rgba(255,255,255,.15)");
    gradient.addColorStop(1, "rgba(255,255,255,0)");
    context.fillStyle = gradient;
    context.fillRect(0, 0, size, size);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

interface Ripple {
  mesh: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>;
  x: number;
  z: number;
  age: number;
  strength: number;
  live: boolean;
}

interface Drop {
  vx: number;
  vy: number;
  vz: number;
  life: number;
}

const DEAD_Y = -400;

/**
 * The boat's handwriting in the water: expanding rings where a blade bites or
 * the bow pushes, and short-lived drops thrown clear of the oars. Both are
 * pooled so a stroke never allocates.
 */
export class SplashField {
  readonly group = new THREE.Group();
  private readonly ripples: Ripple[] = [];
  private readonly drops: Drop[] = [];
  private readonly ringGeometry = new THREE.RingGeometry(0.34, 0.5, 22);
  private readonly points: THREE.Points<THREE.BufferGeometry, THREE.PointsMaterial>;
  private readonly positions: Float32Array;
  private cursor = 0;

  constructor(glow: THREE.Texture) {
    this.group.name = "chapter15-splash";
    for (let i = 0; i < RIPPLE_COUNT; i++) {
      const material = new THREE.MeshBasicMaterial({
        color: 0x8fd6c4, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false,
      });
      const mesh = new THREE.Mesh(this.ringGeometry, material);
      mesh.rotation.x = -Math.PI / 2;
      mesh.visible = false;
      this.group.add(mesh);
      this.ripples.push({ mesh, x: 0, z: 0, age: 0, strength: 0, live: false });
    }
    this.positions = new Float32Array(SPRAY_COUNT * 3);
    for (let i = 0; i < SPRAY_COUNT; i++) {
      this.positions[i * 3 + 1] = DEAD_Y;
      this.drops.push({ vx: 0, vy: 0, vz: 0, life: 0 });
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(this.positions, 3));
    const material = new THREE.PointsMaterial({
      map: glow, color: 0xbdeee0, size: 0.3, sizeAttenuation: true, transparent: true,
      opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false,
    });
    this.points = new THREE.Points(geometry, material);
    this.points.name = "chapter15-spray";
    this.points.frustumCulled = false;
    this.group.add(this.points);
  }

  /** A ring on the surface, for a blade going in or the bow shouldering water aside. */
  ripple(x: number, z: number, strength: number): void {
    let oldest = this.ripples[0];
    for (const ripple of this.ripples) {
      if (!ripple.live) { oldest = ripple; break; }
      if (ripple.age > oldest.age) oldest = ripple;
    }
    oldest.x = x;
    oldest.z = z;
    oldest.age = 0;
    oldest.strength = strength;
    oldest.live = true;
    oldest.mesh.visible = true;
  }

  /** Drops thrown clear of the blades, or off the bow when it lifts. */
  spray(x: number, y: number, z: number, strength: number): void {
    const drop = this.drops[this.cursor];
    const index = this.cursor * 3;
    this.cursor = (this.cursor + 1) % SPRAY_COUNT;
    this.positions[index] = x;
    this.positions[index + 1] = y;
    this.positions[index + 2] = z;
    drop.vx = (Math.random() - 0.5) * 1.8 * strength;
    drop.vy = (0.7 + Math.random() * 1.5) * strength;
    drop.vz = (Math.random() - 0.5) * 1.8 * strength;
    drop.life = 0.45 + Math.random() * 0.6;
    this.points.geometry.attributes.position.needsUpdate = true;
  }

  update(dt: number, time: number): void {
    for (const ripple of this.ripples) {
      if (!ripple.live) continue;
      ripple.age += dt;
      const progress = ripple.age / RIPPLE_LIFE;
      if (progress >= 1) {
        ripple.live = false;
        ripple.mesh.visible = false;
        continue;
      }
      const scale = 0.5 + progress * 2.9;
      ripple.mesh.position.set(ripple.x, waveHeight(ripple.x, ripple.z, time) + 0.055, ripple.z);
      ripple.mesh.scale.setScalar(scale);
      ripple.mesh.material.opacity = ripple.strength * 0.5 * (1 - progress) ** 1.6;
    }
    let moved = false;
    for (let i = 0; i < SPRAY_COUNT; i++) {
      const drop = this.drops[i];
      if (drop.life <= 0) continue;
      const index = i * 3;
      drop.life -= dt;
      if (drop.life <= 0) {
        this.positions[index + 1] = DEAD_Y;
        moved = true;
        continue;
      }
      drop.vy -= 7.2 * dt;
      this.positions[index] += drop.vx * dt;
      this.positions[index + 1] += drop.vy * dt;
      this.positions[index + 2] += drop.vz * dt;
      moved = true;
    }
    if (moved) this.points.geometry.attributes.position.needsUpdate = true;
  }
}
