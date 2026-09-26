"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";

type Walker = { group: THREE.Group; legs: THREE.Group[]; path: THREE.Vector3[]; offset: number };

function box(parent: THREE.Object3D, color: number, size: [number, number, number], position: [number, number, number]) {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(...size),
    new THREE.MeshStandardMaterial({ color, roughness: 0.78 }),
  );
  mesh.position.set(...position);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

function person(parent: THREE.Object3D, color: number, path: [number, number][], offset: number): Walker {
  const group = new THREE.Group();
  parent.add(group);
  const material = new THREE.MeshStandardMaterial({ color, roughness: 0.75 });
  const skin = new THREE.MeshStandardMaterial({ color: 0xd9ae8d, roughness: 0.9 });
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.12, 12, 10), skin);
  head.position.y = 0.7;
  group.add(head);
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.13, 0.34, 9), material);
  body.position.y = 0.42;
  group.add(body);
  const legs = [-1, 1].map((side) => {
    const pivot = new THREE.Group();
    pivot.position.set(side * 0.055, 0.28, 0);
    const limb = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.04, 0.26, 7), new THREE.MeshStandardMaterial({ color: 0x3f5362 }));
    limb.position.y = -0.12;
    pivot.add(limb);
    group.add(pivot);
    return pivot;
  });
  for (const side of [-1, 1]) {
    const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.035, 0.3, 7), material);
    arm.position.set(side * 0.14, 0.42, 0);
    arm.rotation.z = side * 0.32;
    group.add(arm);
  }
  return { group, legs, path: path.map(([x, z]) => new THREE.Vector3(x, 0, z)), offset };
}

export function HouseScene({ reducedMotion }: { reducedMotion: boolean }) {
  const host = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const element = host.current;
    if (!element) return;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "low-power" });
    } catch {
      element.dataset.fallback = "true";
      return;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.6));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.setClearColor(0xe9e9e5);
    element.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(36, 1, 0.1, 80);
    scene.add(new THREE.HemisphereLight(0xffffff, 0xa7afb0, 2.3));
    const sunlight = new THREE.DirectionalLight(0xffffff, 2.1);
    sunlight.position.set(-3, 10, 7);
    sunlight.castShadow = true;
    sunlight.shadow.mapSize.set(1024, 1024);
    sunlight.shadow.camera.left = -7;
    sunlight.shadow.camera.right = 7;
    sunlight.shadow.camera.top = 7;
    sunlight.shadow.camera.bottom = -7;
    scene.add(sunlight);
    const home = new THREE.Group();
    scene.add(home);

    box(home, 0xced3cf, [7.6, 0.18, 5.8], [0, -0.17, 0]);
    box(home, 0x9a765c, [7.2, 0.07, 5.4], [0, -0.035, 0]);
    const wall = 0xf4f1eb;
    box(home, wall, [7.4, 0.94, 0.13], [0, 0.47, -2.77]);
    box(home, wall, [0.13, 0.94, 5.5], [-3.67, 0.47, 0]);
    box(home, wall, [0.13, 0.94, 5.5], [3.67, 0.47, 0]);
    box(home, wall, [2.15, 0.94, 0.12], [-2.6, 0.47, 2.76]);
    box(home, wall, [1.45, 0.94, 0.12], [2.97, 0.47, 2.76]);
    // Open front edge and low internal partitions preserve the dollhouse view.
    box(home, wall, [0.12, 0.76, 3], [-0.9, 0.38, -1.25]);
    box(home, wall, [2.75, 0.76, 0.12], [-2.28, 0.38, 0.25]);
    box(home, wall, [0.12, 0.76, 2.65], [1.35, 0.38, -1.39]);
    box(home, wall, [2.3, 0.76, 0.12], [2.48, 0.38, -0.25]);
    box(home, wall, [0.12, 0.76, 1.35], [0.05, 0.38, 2.13]);

    // Bedroom: bed, pillows, wardrobe and side table.
    box(home, 0x765e50, [1.55, 0.14, 1.5], [-2.35, 0.13, -1.69]);
    box(home, 0xe8e7df, [1.42, 0.16, 1.25], [-2.35, 0.25, -1.71]);
    box(home, 0xbac9c4, [1.42, 0.045, 0.6], [-2.35, 0.355, -1.32]);
    for (const x of [-2.75, -1.95]) box(home, 0xf7f4ef, [0.48, 0.06, 0.3], [x, 0.39, -2.16]);
    box(home, 0x9a795e, [0.42, 0.58, 1.15], [-3.31, 0.3, -1.23]);
    box(home, 0xd4baa0, [0.39, 0.28, 0.38], [-1.2, 0.14, -2.31]);

    // Living room: sectional seating, rug, coffee table and media wall.
    box(home, 0xd7ddd9, [2.0, 0.035, 1.58], [0.05, 0.045, 1.27]);
    box(home, 0xe4e8e4, [1.25, 0.26, 0.48], [-0.26, 0.19, 2.02]);
    box(home, 0xd1d8d3, [0.48, 0.25, 1.2], [0.68, 0.19, 1.28]);
    box(home, 0xf1f1ed, [0.68, 0.13, 0.46], [-0.23, 0.16, 1.17]);
    box(home, 0x45555c, [1.06, 0.47, 0.06], [0.18, 0.5, -0.31]);
    box(home, 0x927760, [1.23, 0.11, 0.34], [0.18, 0.16, -0.18]);

    // Kitchen, table and laundry alcove.
    box(home, 0xe6e0d8, [1.95, 0.43, 0.55], [2.48, 0.22, -2.39]);
    box(home, 0x747c78, [1.98, 0.06, 0.61], [2.48, 0.47, -2.39]);
    box(home, 0xe5ded5, [0.55, 0.82, 0.55], [3.2, 0.41, -1.25]);
    const table = new THREE.Mesh(new THREE.CylinderGeometry(0.57, 0.57, 0.09, 18), new THREE.MeshStandardMaterial({ color: 0xc9a781 }));
    table.position.set(2.5, 0.35, 1.14);
    home.add(table);
    for (const [x, z] of [[1.62, 1.14], [3.33, 1.14], [2.5, 0.35], [2.5, 1.92]] as [number, number][]) {
      box(home, 0x9daaa5, [0.35, 0.3, 0.35], [x, 0.15, z]);
    }
    box(home, 0x7d9e81, [0.28, 0.5, 0.28], [-3.2, 0.25, 1.88]);
    box(home, 0xc9b199, [0.36, 0.24, 0.36], [-3.2, 0.13, 1.88]);

    const walkers = [
      person(home, 0x428f91, [[-1.3, 1.4], [0.1, 0.56], [0.55, 1.38], [-0.45, 2.18]], 0),
      person(home, 0xc77359, [[2.18, 0.22], [2.96, 0.44], [3.07, 1.78], [1.63, 1.8]], 1.2),
      person(home, 0x6f789b, [[-2.5, 1.11], [-1.38, 0.71], [-1.31, 1.87], [-2.34, 2.25]], 2.1),
    ];

    const clock = new THREE.Timer();
    let visible = true;
    const render = () => {
      if (!reducedMotion) {
        clock.update();
        const t = clock.getElapsed();
        for (const walker of walkers) {
          const progress = (t * 0.17 + walker.offset) % walker.path.length;
          const index = Math.floor(progress);
          const from = walker.path[index]!;
          const to = walker.path[(index + 1) % walker.path.length]!;
          walker.group.position.lerpVectors(from, to, progress - index);
          walker.group.rotation.y = Math.atan2(to.x - from.x, to.z - from.z);
          walker.legs[0]!.rotation.x = Math.sin(t * 5 + walker.offset) * 0.3;
          walker.legs[1]!.rotation.x = -walker.legs[0]!.rotation.x;
        }
      } else {
        for (const walker of walkers) walker.group.position.copy(walker.path[0]!);
      }
      renderer.render(scene, camera);
    };
    const resize = () => {
      const width = Math.max(1, element.clientWidth);
      const height = Math.max(1, element.clientHeight);
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.position.set(width < 620 ? 6.3 : 4.8, width < 620 ? 8.4 : 6.5, width < 620 ? 10.8 : 8.0);
      camera.lookAt(0, 0, 0);
      camera.updateProjectionMatrix();
      render();
    };
    const observer = new IntersectionObserver(([entry]) => { visible = Boolean(entry?.isIntersecting); });
    observer.observe(element);
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(element);
    resize();
    if (!reducedMotion) renderer.setAnimationLoop(() => { if (visible) render(); });
    return () => {
      renderer.setAnimationLoop(null);
      observer.disconnect();
      resizeObserver.disconnect();
      scene.traverse((object) => {
        if (object instanceof THREE.Mesh) {
          object.geometry.dispose();
          const materials = Array.isArray(object.material) ? object.material : [object.material];
          materials.forEach((material) => material.dispose());
        }
      });
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, [reducedMotion]);

  return <div ref={host} className="h-full w-full" role="img" aria-label="Animated roof-open home with furnished rooms and residents walking inside" />;
}
