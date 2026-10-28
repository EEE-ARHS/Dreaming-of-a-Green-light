import * as THREE from "three";

export function createNickCarModel(root: THREE.Group, trunkHinge: THREE.Group): THREE.Group {
  const paint = new THREE.MeshStandardMaterial({ color: "#285d8f", emissive: "#06111c", metalness: 0.18, roughness: 0.56 });
  const paintDark = new THREE.MeshStandardMaterial({ color: "#173b61", emissive: "#040b13", metalness: 0.18, roughness: 0.56 });
  const trim = new THREE.MeshStandardMaterial({ color: "#b9bdc2", metalness: 0.82, roughness: 0.22 });
  const rubber = new THREE.MeshStandardMaterial({ color: "#0e0e10", roughness: 0.92 });
  const whitewall = new THREE.MeshStandardMaterial({ color: "#cfc6b2", roughness: 0.7 });
  const glass = new THREE.MeshStandardMaterial({ color: "#6d8798", emissive: "#0a1116", roughness: 0.16, metalness: 0.3, transparent: true, opacity: 0.22, side: THREE.DoubleSide });
  const leather = new THREE.MeshStandardMaterial({ color: "#2a1b12", roughness: 0.82 });
  const headlamp = new THREE.MeshBasicMaterial({ color: "#fff3d0" });
  const tailLamp = new THREE.MeshBasicMaterial({ color: "#a8130c" });
  const cylinder = (name: string, radius: number, length: number, position: [number, number, number], material: THREE.Material, segments = 16) => {
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, length, segments), material);
    mesh.name = name;
    mesh.position.set(...position);
    mesh.castShadow = mesh.receiveShadow = true;
    root.add(mesh);
    return mesh;
  };
  const box = (name: string, dimensions: [number, number, number], position: [number, number, number], material: THREE.Material) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(...dimensions), material);
    mesh.name = name;
    mesh.position.set(...position);
    mesh.castShadow = mesh.receiveShadow = true;
    root.add(mesh);
    return mesh;
  };
  box("nick-car-body", [1.62, 0.42, 4], [0, 0.68, -0.1], paint);
  box("nick-car-beltline", [1.72, 0.2, 3.4], [0, 0.89, -0.3], paintDark);
  box("nick-car-hood", [1.02, 0.4, 1.7], [0, 0.92, 1.18], paint);
  box("nick-car-hood-top", [0.86, 0.1, 1.62], [0, 1.13, 1.2], paintDark);
  box("nick-car-cowl", [1.5, 0.34, 0.3], [0, 0.97, 0.42], paintDark);
  box("nick-car-trunk-floor", [2.05, 0.12, 1.8], [0, 0.59, -1.4], paint);
  box("nick-car-trunk-left", [0.13, 0.54, 1.8], [-1.03, 0.83, -1.4], paint);
  box("nick-car-trunk-right", [0.13, 0.54, 1.8], [1.03, 0.83, -1.4], paint);
  box("nick-car-cockpit", [1.42, 0.52, 1.5], [0, 1, -0.55], paintDark);
  box("nick-car-cabin-floor", [1.2, 0.2, 1.2], [0, 0.86, -0.5], leather);
  box("nick-car-driver-seat", [0.46, 0.16, 0.5], [-0.34, 0.99, -0.5], leather);
  box("nick-car-passenger-seat", [0.46, 0.16, 0.5], [0.34, 0.99, -0.5], leather);
  box("nick-car-driver-seat-back", [0.46, 0.44, 0.14], [-0.34, 1.18, -0.8], leather);
  box("nick-car-passenger-seat-back", [0.46, 0.44, 0.14], [0.34, 1.18, -0.8], leather);
  box("nick-car-dash", [1.34, 0.16, 0.22], [0, 1.06, -0.16], trim);
  trunkHinge.clear();
  trunkHinge.rotation.set(0, 0, 0);
  trunkHinge.name = "nick-car-openable-tailgate";
  trunkHinge.position.set(0, 0.59, -2.32);
  root.add(trunkHinge);
  const tailgatePanel = new THREE.Mesh(new THREE.BoxGeometry(1.54, 0.12, 0.75), paintDark);
  tailgatePanel.name = "nick-car-tailgate-panel";
  tailgatePanel.position.set(0, 0, -0.375);
  tailgatePanel.castShadow = tailgatePanel.receiveShadow = true;
  trunkHinge.add(tailgatePanel);
  for (const side of [-1, 1] as const) {
    const hinge = new THREE.Group();
    hinge.name = `nick-car-openable-door-${side < 0 ? "left" : "right"}`;
    hinge.position.set(side * 0.96, 0.82, 0.12);
    const panel = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.58, 1.22), paint);
    panel.name = `nick-car-door-panel-${side < 0 ? "left" : "right"}`;
    panel.position.set(side * 0.045, 0, 0);
    panel.castShadow = panel.receiveShadow = true;
    hinge.add(panel);
    const window = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.42, 1.05), glass);
    window.name = `nick-car-door-window-${side < 0 ? "left" : "right"}`;
    window.position.set(side * 0.045, 0.49, -0.02);
    hinge.add(window);
    root.add(hinge);
  }
  box("nick-car-windshield", [1.3, 0.42, 0.02], [0, 1.51, 0.3], glass).rotation.x = -0.13;
  box("nick-car-windshield-frame", [1.36, 0.035, 0.045], [0, 1.72, 0.33], trim).rotation.x = -0.13;
  for (const side of [-1, 1] as const) {
    box("nick-car-windshield-post", [0.035, 0.46, 0.04], [side * 0.66, 1.51, 0.3], trim).rotation.x = -0.13;
    box("nick-car-front-fender", [0.3, 0.13, 1.3], [side * 0.86, 0.7, 1.3], paintDark);
    box("nick-car-rear-fender", [0.3, 0.16, 1.3], [side * 0.86, 0.72, -1.35], paintDark);
    box("nick-car-running-board", [0.34, 0.07, 1.9], [side * 0.91, 0.48, 0], trim);
    box("nick-car-headlamp-bracket", [0.06, 0.3, 0.06], [side * 0.56, 0.92, 1.82], trim);
  }
  for (const side of [-1, 1] as const) {
    cylinder("nick-car-headlamp-can", 0.14, 0.24, [side * 0.56, 1.12, 2.02], trim).rotation.x = Math.PI / 2;
    cylinder("nick-car-headlamp-lens", 0.115, 0.03, [side * 0.56, 1.12, 2.15], headlamp).rotation.x = Math.PI / 2;
    box("nick-car-taillamp", [0.12, 0.1, 0.05], [side * 0.58, 0.76, -2.02], tailLamp);
  }
  box("nick-car-radiator", [0.94, 0.6, 0.16], [0, 0.88, 2.02], trim);
  for (let i = 0; i < 7; i++) box("nick-car-grille-slat", [0.82, 0.025, 0.04], [0, 0.66 + i * 0.075, 2.11], paintDark);
  cylinder("nick-car-hood-ornament", 0.05, 0.15, [0, 1.41, 2], whitewall, 8);
  const steering = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.0175, 8, 20), leather);
  steering.name = "nick-car-steering-wheel";
  steering.position.set(-0.34, 1.14, 0.1);
  steering.rotation.x = 1.15;
  root.add(steering);
  for (const side of [-1, 1] as const) {
    for (const z of [1.38, -1.42]) {
      cylinder("nick-car-wheel", 0.37, 0.24, [side * 0.84, 0.46, z], rubber, 22).rotation.z = Math.PI / 2;
      cylinder("nick-car-whitewall", 0.275, 0.25, [side * 0.84, 0.46, z], whitewall, 20).rotation.z = Math.PI / 2;
      cylinder("nick-car-hub", 0.2, 0.27, [side * 0.84, 0.46, z], trim, 18).rotation.z = Math.PI / 2;
      cylinder("nick-car-hub-cap", 0.07, 0.29, [side * 0.84, 0.46, z], trim, 12).rotation.z = Math.PI / 2;
    }
  }
  cylinder("nick-car-exhaust", 0.0375, 0.7, [0.5, 0.5, -1.96], trim, 10).rotation.x = Math.PI / 2;
  cylinder("nick-car-spare-tire", 0.34, 0.24, [-0.9, 0.9, -0.35], rubber, 20).rotation.z = Math.PI / 2;
  cylinder("nick-car-spare-hub", 0.21, 0.26, [-0.9, 0.9, -0.35], trim, 18).rotation.z = Math.PI / 2;
  return trunkHinge;
}
