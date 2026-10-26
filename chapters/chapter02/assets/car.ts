import * as THREE from "three";

export function createNickCarModel(root: THREE.Group, trunkHinge: THREE.Group): THREE.Group {
  const paint = new THREE.MeshStandardMaterial({ color: "#26313a", metalness: 0.62, roughness: 0.34 });
  const trim = new THREE.MeshStandardMaterial({ color: "#9c927d", metalness: 0.78, roughness: 0.24 });
  const rubber = new THREE.MeshStandardMaterial({ color: "#151515", roughness: 0.92 });
  const glass = new THREE.MeshStandardMaterial({ color: "#8ea6ae", roughness: 0.2, metalness: 0.25, transparent: true, opacity: 0.28 });
  const box = (name: string, dimensions: [number, number, number], position: [number, number, number], material: THREE.Material) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(...dimensions), material);
    mesh.name = name;
    mesh.position.set(...position);
    mesh.castShadow = mesh.receiveShadow = true;
    root.add(mesh);
    return mesh;
  };
  box("nick-car-body", [2.05, 0.72, 4.3], [0, 0.72, 0], paint);
  box("nick-car-hood", [1.9, 0.42, 1.6], [0, 1.12, 1.3], paint);
  box("nick-car-cabin", [1.68, 0.78, 1.75], [0, 1.28, 1.1], glass);
  box("nick-car-roof", [1.72, 0.16, 1.7], [0, 1.7, 1.05], paint);
  box("nick-car-trunk-floor", [1.72, 0.12, 1.65], [0, 0.48, 1.53], paint);
  box("nick-car-trunk-left", [0.13, 0.54, 1.6], [-0.86, 0.78, 1.53], paint);
  box("nick-car-trunk-right", [0.13, 0.54, 1.6], [0.86, 0.78, 1.53], paint);
  trunkHinge.clear();
  trunkHinge.rotation.set(0, 0, 0);
  trunkHinge.name = "nick-car-openable-tailgate";
  trunkHinge.position.set(0, 0.59, 2.32);
  root.add(trunkHinge);
  const tailgatePanel = new THREE.Mesh(new THREE.BoxGeometry(1.74, 0.12, 0.75), trim);
  tailgatePanel.name = "nick-car-tailgate-panel";
  tailgatePanel.position.set(0, 0, 0.375);
  tailgatePanel.castShadow = tailgatePanel.receiveShadow = true;
  trunkHinge.add(tailgatePanel);
  box("nick-car-bumper", [2.15, 0.15, 0.18], [0, 0.42, 2.39], trim);
  for (const x of [-0.92, 0.92]) {
    const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.38, 0.18, 20), rubber);
    wheel.name = "nick-car-wheel";
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(x, 0.4, -0.7);
    wheel.castShadow = true;
    root.add(wheel);
    const rearWheel = wheel.clone(); rearWheel.position.z = 1.2; root.add(rearWheel);
  }
  return trunkHinge;
}
