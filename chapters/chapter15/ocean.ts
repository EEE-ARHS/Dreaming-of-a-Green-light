import * as THREE from "three";
import { STAR_COUNT, STAR_RADIUS, WATER_LENGTH, WATER_SEGMENTS_X, WATER_SEGMENTS_Z, WATER_WIDTH } from "./constants";
import { sampleWave, type WaveSample } from "./water";

export interface Ocean {
  readonly group: THREE.Group;
  /** Rides with the boat and re-shapes the swell around it. */
  update(time: number, boatX: number, boatZ: number): void;
}

/**
 * The Sound at night: one long height-field of dark water, lit only by a low
 * moon, with the swells shared with `water.ts` so the boat sits exactly on the
 * surface it is drawn against.
 */
export function createOcean(glow: THREE.Texture): Ocean {
  const group = new THREE.Group();
  group.name = "chapter15-sea";
  const geometry = new THREE.PlaneGeometry(WATER_WIDTH, WATER_LENGTH, WATER_SEGMENTS_X, WATER_SEGMENTS_Z);
  geometry.rotateX(-Math.PI / 2);
  const position = geometry.attributes.position as THREE.BufferAttribute;
  const normal = geometry.attributes.normal as THREE.BufferAttribute;
  const count = position.count;
  const localX = new Float32Array(count);
  const localZ = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    localX[i] = position.getX(i);
    localZ[i] = position.getZ(i);
  }
  const water = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({
    color: 0x0a1420, roughness: 0.3, metalness: 0.55,
  }));
  water.name = "chapter15-water";
  water.frustumCulled = false;
  group.add(water);

  const starPositions = new Float32Array(STAR_COUNT * 3);
  for (let i = 0; i < STAR_COUNT; i++) {
    const azimuth = Math.random() * Math.PI * 2;
    const elevation = 0.04 + Math.random() ** 1.6 * 1.15;
    const radius = STAR_RADIUS * (0.85 + Math.random() * 0.3);
    starPositions[i * 3] = Math.cos(elevation) * Math.sin(azimuth) * radius;
    starPositions[i * 3 + 1] = Math.sin(elevation) * radius;
    starPositions[i * 3 + 2] = Math.cos(elevation) * Math.cos(azimuth) * radius;
  }
  const starGeometry = new THREE.BufferGeometry();
  starGeometry.setAttribute("position", new THREE.BufferAttribute(starPositions, 3));
  const stars = new THREE.Points(starGeometry, new THREE.PointsMaterial({
    map: glow, color: 0xcfe0ff, size: 2.4, sizeAttenuation: true, transparent: true,
    opacity: 0.72, blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
  }));
  stars.name = "chapter15-stars";
  stars.frustumCulled = false;
  group.add(stars);

  const moon = new THREE.Sprite(new THREE.SpriteMaterial({
    map: glow, color: 0x9fb8e8, transparent: true, opacity: 0.3,
    blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
  }));
  moon.name = "chapter15-moon";
  moon.position.set(-150, 175, 165);
  moon.scale.setScalar(46);
  group.add(moon);

  const sample: WaveSample = { height: 0, slopeX: 0, slopeZ: 0 };
  return {
    group,
    update(time: number, boatX: number, boatZ: number): void {
      group.position.set(boatX, 0, boatZ);
      for (let i = 0; i < count; i++) {
        sampleWave(localX[i] + boatX, localZ[i] + boatZ, time, sample);
        position.setY(i, sample.height);
        const inverse = 1 / Math.sqrt(sample.slopeX * sample.slopeX + 1 + sample.slopeZ * sample.slopeZ);
        normal.setXYZ(i, -sample.slopeX * inverse, inverse, -sample.slopeZ * inverse);
      }
      position.needsUpdate = true;
      normal.needsUpdate = true;
    },
  };
}
