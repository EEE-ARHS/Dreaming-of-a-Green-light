import {
  BackSide, BufferGeometry, DirectionalLight, DoubleSide, FogExp2, Float32BufferAttribute,
  Group, HemisphereLight, Line, LineBasicMaterial, MeshBasicMaterial, Points, PointsMaterial,
  PlaneGeometry, PointLight, Scene, SphereGeometry, Vector3, type Object3D,
} from "three";
import { HavokPhysics, PhysicsAggregate, PhysicsShapeType } from "./physics";
import { ROAD_Z_START, ROAD_Z_END, ROAD_LENGTH, ROAD_CENTER_Z, ROAD_HALF_WIDTH } from "./world-constants";
import {
  worldColor as color, basicMaterial as basic, emissiveBasicMaterial as emissiveBasic,
  standardMaterial as standard, fleckTexture, textTexture,
  addWorldMesh as mesh, addWorldBox as addBox, addWorldCylinder as addCylinder, addWorldSphere as addSphere,
  makeWorldCanvasTexture as makeCanvasTexture,
} from "./world-assets";



export interface World {
  update: (dt: number, carPosition: Vector3) => void;
  addShadowCaster: (object: Object3D) => void;
  dispose: () => void;
}

export function createWorld(scene: Scene, quality: number, physics: HavokPhysics): World {
  scene.background = color("#070a11");
  scene.fog = new FogExp2("#0a0d15", 0.0042);
  scene.add(new HemisphereLight("#8294b2", "#101012", 1.25));
  const moon = new DirectionalLight("#a9bdd8", 2.3);
  moon.position.set(20, 80, 20); moon.castShadow = true;
  moon.shadow.mapSize.set(quality >= 2 ? 2048 : 1024, quality >= 2 ? 2048 : 1024);
  moon.shadow.camera.near = 0.5; moon.shadow.camera.far = 180;
  moon.shadow.camera.left = -70; moon.shadow.camera.right = 70;
  moon.shadow.camera.top = 70; moon.shadow.camera.bottom = -70;
  moon.shadow.bias = -0.0002; moon.shadow.normalBias = 0.025;
  scene.add(moon);

  const skyCanvas = makeCanvasTexture(512, 512, (ctx) => {
    const gradient = ctx.createLinearGradient(0, 0, 0, 512);
    gradient.addColorStop(0, "#04050a"); gradient.addColorStop(0.45, "#080b14");
    gradient.addColorStop(0.72, "#111725"); gradient.addColorStop(1, "#1a2130");
    ctx.fillStyle = gradient; ctx.fillRect(0, 0, 512, 512);
    for (let i = 0; i < 260; i++) {
      ctx.fillStyle = `rgba(214,222,238,${0.15 + Math.random() * 0.55})`;
      ctx.beginPath(); ctx.arc(Math.random() * 512, Math.random() * 300, Math.random() < 0.12 ? 1.4 : 0.8, 0, Math.PI * 2); ctx.fill();
    }
  });
  const sky = mesh(new SphereGeometry(450, 24, 16), new MeshBasicMaterial({ map: skyCanvas, side: BackSide, fog: false }), new Vector3(0, 0, ROAD_CENTER_Z), scene);
  sky.name = "skyDome"; sky.frustumCulled = false; sky.castShadow = false;
  addSphere(scene, "moonDisc", 18, [-170, 155, ROAD_CENTER_Z + 330], basic("#dfe5ef", { fog: false }));

  const shoulder = mesh(new PlaneGeometry(13.4, ROAD_LENGTH), standard("#2a2b30", { map: fleckTexture("#131418", 7000, 256), roughness: 1 }), new Vector3(0, 0.005, ROAD_CENTER_Z), scene);
  shoulder.rotation.x = -Math.PI / 2; shoulder.name = "shoulder";
  const roadTexture = makeCanvasTexture(512, 512, (ctx) => {
    ctx.fillStyle = "#1c1d22"; ctx.fillRect(0, 0, 512, 512);
    for (let i = 0; i < 14000; i++) {
      const g = 20 + Math.floor(Math.random() * 52);
      ctx.fillStyle = `rgba(${g},${g},${g + 4},${0.08 + Math.random() * 0.3})`;
      ctx.fillRect(Math.random() * 512, Math.random() * 512, Math.random() * 2 + 0.4, Math.random() * 2 + 0.4);
    }
    ctx.fillStyle = "rgba(206,187,145,0.72)"; ctx.fillRect(254, 0, 4, 512);
    ctx.fillStyle = "rgba(196,192,180,0.22)"; ctx.fillRect(6, 0, 3, 512); ctx.fillRect(503, 0, 3, 512);
    ctx.strokeStyle = "rgba(8,8,10,0.5)"; ctx.lineWidth = 2;
    for (let i = 0; i < 16; i++) {
      ctx.beginPath(); let x = Math.random() * 512; let y = Math.random() * 512; ctx.moveTo(x, y);
      for (let p = 0; p < 5; p++) { x += (Math.random() - 0.5) * 80; y += Math.random() * 60; ctx.lineTo(x, y); }
      ctx.stroke();
    }
  });
  roadTexture.wrapS = roadTexture.wrapT = 1000; roadTexture.repeat.set(1, 36);
  const road = mesh(new PlaneGeometry(ROAD_HALF_WIDTH * 2, ROAD_LENGTH), standard("#26272c", { map: roadTexture, roughness: 0.95 }), new Vector3(0, 0.02, ROAD_CENTER_Z), scene);
  road.rotation.x = -Math.PI / 2; road.name = "road";
  const ground = mesh(new PlaneGeometry(640, 760), standard("#2b2c31", { map: fleckTexture("#15161a", 9000), roughness: 1 }), new Vector3(0, -0.01, ROAD_CENTER_Z + 30), scene);
  ground.rotation.x = -Math.PI / 2; ground.name = "ashGround";
  const collisionFloor = addBox(scene, "collisionGround", [640, 1, 780], [0, -0.5, 160], new MeshBasicMaterial({ visible: false }));
  collisionFloor.visible = false;
  new PhysicsAggregate(collisionFloor, PhysicsShapeType.BOX, { mass: 0, friction: 0.85, restitution: 0.05 }, physics);

  const heapMat = standard("#2a2b2f");
  for (let i = 0; i < 18; i++) {
    const side = i % 2 === 0 ? -1 : 1;
    const heap = addSphere(scene, "ashHeap" + i, 1, [side * (18 + Math.random() * 55), -0.4, 40 + Math.random() * 280], heapMat, 10);
    const r = 6 + Math.random() * 16; heap.scale.set(r, r * (0.14 + Math.random() * 0.12), r * (0.7 + Math.random() * 0.6));
  }
  const poleMat = standard("#191a1c");
  const poleZs: number[] = [];
  for (let z = ROAD_Z_START + 20; z < ROAD_Z_END; z += 46) poleZs.push(z);
  const poleTops: Vector3[] = [];
  poleZs.forEach((z, i) => {
    addCylinder(scene, "pole" + i, 0.12, 0.12, 7.6, [-9.2, 3.8, z], poleMat, 6);
    addBox(scene, "poleBar" + i, [1.8, 0.09, 0.09], [-9.2, 7.1, z], poleMat);
    poleTops.push(new Vector3(-10, 7.05, z));
  });
  for (let i = 0; i < poleTops.length - 1; i++) {
    const a = poleTops[i], b = poleTops[i + 1], points: Vector3[] = [];
    for (let s = 0; s <= 10; s++) { const t = s / 10; points.push(new Vector3(a.x, a.y - Math.sin(Math.PI * t) * 0.65, a.z + (b.z - a.z) * t)); }
    const wire = new Line(new BufferGeometry().setFromPoints(points), new LineBasicMaterial({ color: "#0d0e10" }));
    wire.name = "wire" + i; scene.add(wire);
  }

  const billboard = new Group(); billboard.name = "eckleburg"; billboard.position.set(-24, 0, 194); billboard.rotation.y = Math.PI + 0.24; scene.add(billboard);
  addBox(billboard, "eckleburgBoard", [17, 7.6, 0.5], [0, 10.2, 0], standard("#26333b", { emissive: "#04070a" }));
  addBox(billboard, "eckleburgTrim", [17.9, 8.4, 0.22], [0, 10.2, -0.18], standard("#4c4a41"));
  for (const px of [-6.2, 6.2]) addBox(billboard, "boardPost", [0.62, 10, 0.62], [px, 4.4, -0.6], poleMat);
  for (const ex of [-3.4, 3.4]) {
    const eye = addSphere(billboard, "eyeWhite", 3.1, [ex, 11.2, 0.38], standard("#b9c2c0", { emissive: "#333c3e" })); eye.scale.set(1.22, 1, 0.55);
    addCylinder(billboard, "iris", 0.75, 0.75, 0.16, [ex, 11.05, 1.02], standard("#1c2a33", { emissive: "#070d12" }), 28).rotation.x = Math.PI / 2;
    addCylinder(billboard, "pupil", 0.33, 0.33, 0.18, [ex, 11.05, 1.1], standard("#101418", { emissive: "#020304" }), 20).rotation.x = Math.PI / 2;
  }
  const sign = mesh(new PlaneGeometry(13.5, 1.5), new MeshBasicMaterial({ map: textTexture("DOCTOR  T. J.  ECKLEBURG", 13.5, 1.5, '66px Georgia, "Times New Roman", serif', "rgba(196,206,200,0.66)"), transparent: true, side: DoubleSide }), new Vector3(0, 7.5, 0.3), billboard); sign.name = "eckleburgText";
  const boardLight = new PointLight("#7f95a8", 8, 26); boardLight.position.set(-24, 12, 187); scene.add(boardLight);

  const garage = new Group(); garage.name = "garage"; garage.position.set(14.4, 0, 150); scene.add(garage);
  const wall = standard("#2d2a25"), roof = standard("#211f1c");
  addBox(garage, "garageBox", [11, 4.6, 9], [0, 2.3, 0], wall); addBox(garage, "garageRoofBox", [12.2, 0.28, 10.2], [0, 4.7, 0], roof);
  const windowMat = basic("#c58b45");
  for (const wz of [-2.6, 0.6]) { const win = mesh(new PlaneGeometry(2, 1.1), windowMat, new Vector3(-5.51, 2.6, wz), garage); win.rotation.y = -Math.PI / 2; }
  const door = mesh(new PlaneGeometry(4.4, 3.1), standard("#171614", { emissive: "#070706", side: DoubleSide }), new Vector3(-5.51, 1.6, 3.2), garage); door.rotation.y = -Math.PI / 2;
  const garageSign = mesh(new PlaneGeometry(5.4, 1), new MeshBasicMaterial({ map: textTexture("WILSON'S  GARAGE", 5.4, 1, '92px Georgia, "Times New Roman", serif', "rgba(214,197,164,0.9)"), transparent: true, side: DoubleSide }), new Vector3(-5.48, 4, -0.4), garage); garageSign.rotation.y = -Math.PI / 2;
  const garageLamp = new PointLight("#e0a253", 18, 23); garageLamp.position.set(8, 4.1, 148.6); scene.add(garageLamp);
  addSphere(scene, "garageBulb", 0.26, [8.2, 4.1, 148.6], emissiveBasic("#ffd9a0", "#ffcf8a"), 10);
  const pumpMat = standard("#5b3a2c");
  for (const z of [145.6, 148]) { addCylinder(scene, "pump", 0.3, 0.3, 1.9, [9.1, 0.95, z], pumpMat, 12); addCylinder(scene, "pumpTop", 0.22, 0.22, 0.5, [9.1, 2.05, z], standard("#c9b98d", { emissive: "#4a3a1c", transparent: true, opacity: 0.85 }), 12); }
  addBox(scene, "canopy", [4.2, 0.18, 6.2], [10, 3.5, 146.8], roof);
  for (const z of [144, 149.6]) addBox(scene, "canopyPost", [0.16, 3.5, 0.16], [8.4, 1.75, z], poleMat);

  const bulbMat = emissiveBasic("#ffe0a0", "#ffe0a0");
  for (const [i, z] of [24, 74, 122, 196, 244, 292].entries()) {
    addCylinder(scene, "lampPost" + i, 0.085, 0.085, 6.4, [-8.6, 3.2, z], standard("#1c1d20"), 8);
    addBox(scene, "lampArm" + i, [2, 0.1, 0.1], [-7.7, 6.3, z], poleMat); addSphere(scene, "lampBulb" + i, 0.42, [-6.8, 6.16, z], bulbMat, 10);
    const lamp = new PointLight("#ffd089", i % 2 === 0 ? 13 : 9, 34);
    lamp.position.set(-6.8, 6, z);
    scene.add(lamp);
  }
  const cityMat = standard("#0b0d12", { emissive: "#080a0f" });
  for (let i = 0; i < 7; i++) { const width = 12 + Math.random() * 20, height = 20 + Math.random() * 45; addBox(scene, "cityBlock" + i, [width, height, 10], [-120 + i * 34 + Math.random() * 8, height / 2, ROAD_Z_END + 150], cityMat); }

  const count = quality >= 1 ? 420 : 140;
  const positions = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) { positions[i * 3] = (Math.random() - 0.5) * 90; positions[i * 3 + 1] = 1 + Math.random() * 12; positions[i * 3 + 2] = (Math.random() - 0.5) * 180; }
  const ashGeometry = new BufferGeometry(); ashGeometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
  const ash = new Points(ashGeometry, new PointsMaterial({ color: "#aaa69d", size: 0.085, transparent: true, opacity: 0.42, sizeAttenuation: true, depthWrite: false })); ash.name = "driftingAsh"; scene.add(ash);

  return {
    addShadowCaster(object) { object.traverse((child) => { child.castShadow = true; }); },
    update(dt, carPosition) {
      moon.position.set(carPosition.x + 18, 78, carPosition.z + 26); ash.position.set(carPosition.x, 0, carPosition.z + 30);
      const attr = ashGeometry.getAttribute("position");
      for (let i = 0; i < attr.count; i++) { attr.setX(i, attr.getX(i) - dt * 0.18); attr.setY(i, Math.max(-2, Math.min(15, attr.getY(i) + dt * 0.08))); attr.setZ(i, attr.getZ(i) - dt * 0.12); }
      attr.needsUpdate = true;
    },
    dispose() { skyCanvas.dispose(); roadTexture.dispose(); ashGeometry.dispose(); },
  };
}
