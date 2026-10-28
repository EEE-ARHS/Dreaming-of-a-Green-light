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
  const starPhases = new Float32Array(STAR_COUNT);
  const starColors = new Float32Array(STAR_COUNT * 3);
  for (let i = 0; i < STAR_COUNT; i++) {
    starPhases[i] = Math.random() * Math.PI * 2;
    starColors[i * 3] = 1;
    starColors[i * 3 + 1] = 0.79;
    starColors[i * 3 + 2] = 0.48;
  }
  starGeometry.setAttribute("color", new THREE.BufferAttribute(starColors, 3));
  const stars = new THREE.Points(starGeometry, new THREE.PointsMaterial({
    map: glow, color: 0xffffff, size: 2.4, sizeAttenuation: true, transparent: true,
    opacity: 0.88, vertexColors: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
  }));
  stars.name = "chapter15-stars";
  stars.frustumCulled = false;
  group.add(stars);

  const skyHalo = new THREE.Sprite(new THREE.SpriteMaterial({
    map: glow, color: 0xffb84f, transparent: true, opacity: 0.18,
    blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
  }));
  skyHalo.name = "chapter15-golden-sky-halo";
  skyHalo.position.set(-150, 178, 160);
  skyHalo.scale.set(270, 190, 1);
  group.add(skyHalo);

  const moonGlow = new THREE.Sprite(new THREE.SpriteMaterial({
    map: glow, color: 0xffc56e, transparent: true, opacity: 0.52,
    blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
  }));
  moonGlow.name = "chapter15-moon-glow";
  moonGlow.position.set(-150, 175, 165);
  moonGlow.scale.setScalar(118);
  group.add(moonGlow);
  const moon = new THREE.Sprite(new THREE.SpriteMaterial({
    map: glow, color: 0xffe0a0, transparent: true, opacity: 0.5,
    blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
  }));
  moon.name = "chapter15-moon";
  moon.position.copy(moonGlow.position);
  moon.scale.setScalar(31);
  group.add(moon);

  const dustCount = 260;
  const dustPositions = new Float32Array(dustCount * 3);
  const dustPhases = new Float32Array(dustCount);
  for (let i = 0; i < dustCount; i++) {
    dustPositions[i * 3] = (Math.random() - 0.5) * 360;
    dustPositions[i * 3 + 1] = 8 + Math.random() * 145;
    dustPositions[i * 3 + 2] = (Math.random() - 0.5) * 360;
    dustPhases[i] = Math.random() * Math.PI * 2;
  }
  const dustGeometry = new THREE.BufferGeometry();
  dustGeometry.setAttribute("position", new THREE.BufferAttribute(dustPositions, 3));
  const skyDust = new THREE.Points(dustGeometry, new THREE.PointsMaterial({
    map: glow, color: 0xffcf79, size: 4.8, sizeAttenuation: true, transparent: true,
    opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
  }));
  skyDust.name = "chapter15-sky-glow-particles";
  skyDust.frustumCulled = false;
  group.add(skyDust);

  const sample: WaveSample = { height: 0, slopeX: 0, slopeZ: 0 };
  return {
    group,
    update(time: number, boatX: number, boatZ: number): void {
      group.position.set(boatX, 0, boatZ);
      skyHalo.position.set(boatX - 150, 178, boatZ + 160);
      moonGlow.position.set(boatX - 150, 175, boatZ + 165);
      moon.position.copy(moonGlow.position);
      for (let i = 0; i < STAR_COUNT; i++) {
        const twinkle = 0.18 + 0.82 * (0.5 + 0.5 * Math.sin(time * (1.3 + (i % 7) * 0.17) + starPhases[i]));
        starGeometry.attributes.color.setXYZ(i, twinkle, 0.79 * twinkle, 0.48 * twinkle);
      }
      starGeometry.attributes.color.needsUpdate = true;
      for (let i = 0; i < dustCount; i++) {
        dustPositions[i * 3 + 1] += Math.sin(time * 0.65 + dustPhases[i]) * 0.006;
      }
      dustGeometry.attributes.position.needsUpdate = true;
      (skyDust.material as THREE.PointsMaterial).opacity = 0.62 + 0.22 * Math.sin(time * 0.9);
      skyHalo.material.opacity = 0.15 + 0.06 * (0.5 + 0.5 * Math.sin(time * 0.55));
      skyHalo.scale.set(260 + 14 * Math.sin(time * 0.55), 184 + 10 * Math.sin(time * 0.55), 1);
      moonGlow.material.opacity = 0.46 + 0.08 * Math.sin(time * 0.7);
      moon.material.opacity = 0.44 + 0.06 * Math.sin(time * 0.7);
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
