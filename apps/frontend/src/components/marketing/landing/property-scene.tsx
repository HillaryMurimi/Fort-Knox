"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";

export type SceneFocus =
  "portfolio" | "units" | "maintenance" | "moves" | "security";

const cyan = 0x53dce5;
const orange = 0xf0a66c;
const green = 0x78d8a2;
const pale = 0xe8f7f8;

function box(
  parent: THREE.Object3D,
  color: number,
  size: [number, number, number],
  position: [number, number, number],
  emissive = 0x000000,
) {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(...size),
    new THREE.MeshStandardMaterial({
      color,
      metalness: 0.36,
      roughness: 0.47,
      emissive,
      emissiveIntensity: 0.28,
    }),
  );
  mesh.position.set(...position);
  parent.add(mesh);
  return mesh;
}

function sphere(
  parent: THREE.Object3D,
  color: number,
  radius: number,
  position: [number, number, number],
) {
  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(radius, 12, 9),
    new THREE.MeshStandardMaterial({ color, metalness: 0.18, roughness: 0.58 }),
  );
  mesh.position.set(...position);
  parent.add(mesh);
  return mesh;
}

function line(
  parent: THREE.Object3D,
  a: THREE.Vector3,
  b: THREE.Vector3,
  color: number,
  radius: number,
) {
  const direction = new THREE.Vector3().subVectors(b, a);
  const mesh = new THREE.Mesh(
    new THREE.CylinderGeometry(radius, radius, direction.length(), 8),
    new THREE.MeshStandardMaterial({ color, metalness: 0.2, roughness: 0.55 }),
  );
  mesh.position.copy(a).add(b).multiplyScalar(0.5);
  mesh.quaternion.setFromUnitVectors(
    new THREE.Vector3(0, 1, 0),
    direction.normalize(),
  );
  parent.add(mesh);
  return mesh;
}

function building(
  parent: THREE.Object3D,
  x: number,
  z: number,
  width: number,
  floors: number,
  accent: number,
) {
  const group = new THREE.Group();
  group.position.set(x, 0, z);
  parent.add(group);
  const height = floors * 0.83 + 0.65;
  box(group, 0x203844, [width, height, 0.15], [0, height / 2, -1.23]);
  box(group, 0x24414e, [0.16, height, 2.6], [-width / 2, height / 2, 0]);
  box(group, 0x24414e, [0.16, height, 2.6], [width / 2, height / 2, 0]);
  box(group, 0x2d5361, [width + 0.18, 0.14, 2.78], [0, height + 0.04, 0]);
  box(group, 0x162d36, [width + 0.28, 0.13, 2.95], [0, 0.28, 0]);
  box(
    group,
    accent,
    [0.11, height, 0.08],
    [-width / 2 + 0.1, height / 2, 1.35],
    accent,
  );
  box(
    group,
    accent,
    [0.11, height, 0.08],
    [width / 2 - 0.1, height / 2, 1.35],
    accent,
  );
  for (let floor = 0; floor < floors; floor++) {
    const y = 0.72 + floor * 0.83;
    box(group, 0x345765, [width + 0.06, 0.07, 2.7], [0, y + 0.32, 0]);
    box(group, 0x34515b, [width - 0.1, 0.06, 2.46], [0, y - 0.35, 0]);
    box(group, floor % 2 ? 0x24424d : 0x2c5158, [0.08, 0.68, 2.4], [0, y, 0]);
    box(
      group,
      floor % 2 ? 0xd4a570 : 0x6e9a9d,
      [0.76, 0.23, 0.45],
      [-width * 0.24, y - 0.22, -0.45],
    );
    box(group, 0x88aab0, [0.45, 0.18, 0.48], [width * 0.25, y - 0.25, -0.4]);
    for (let col = 0; col < Math.max(2, Math.floor(width / 0.78)); col++) {
      const count = Math.max(2, Math.floor(width / 0.78));
      const wx = -width / 2 + 0.42 + col * ((width - 0.84) / (count - 1));
      const lit = (floor + col) % 4 !== 0;
      const glass = box(
        group,
        lit ? 0x8adce0 : 0x1b3039,
        [0.43, 0.43, 0.045],
        [wx, y, 1.325],
        lit ? accent : 0x000000,
      );
      glass.material.transparent = true;
      glass.material.opacity = lit ? 0.45 : 0.65;
      box(group, 0x11313b, [0.46, 0.025, 0.065], [wx, y + 0.23, 1.36]);
    }
  }
  box(group, 0x0c232d, [0.72, 1.15, 0.09], [0, 0.78, 1.36]);
  box(group, accent, [0.9, 0.09, 0.1], [0, 1.39, 1.4], accent);
  return group;
}

interface PersonRig {
  group: THREE.Group;
  arms: THREE.Group[];
  legs: THREE.Group[];
  kind: string;
}

function person(
  parent: THREE.Object3D,
  x: number,
  z: number,
  kind: "worker" | "tenant" | "mover" | "manager",
  shirt: number,
): PersonRig {
  const group = new THREE.Group();
  group.position.set(x, 0.14, z);
  parent.add(group);
  const charcoal = 0x10232d;
  sphere(group, 0xe7dbc3, 0.15, [0, 1.05, 0]);
  line(
    group,
    new THREE.Vector3(0, 0.9, 0),
    new THREE.Vector3(0, 0.43, 0),
    shirt,
    0.088,
  );
  const arms: THREE.Group[] = [];
  for (const side of [-1, 1]) {
    const arm = new THREE.Group();
    arm.position.set(side * 0.09, 0.83, 0);
    line(
      arm,
      new THREE.Vector3(),
      new THREE.Vector3(side * 0.25, -0.35, 0.03),
      shirt,
      0.048,
    );
    group.add(arm);
    arms.push(arm);
  }
  const legs: THREE.Group[] = [];
  for (const side of [-1, 1]) {
    const leg = new THREE.Group();
    leg.position.set(side * 0.06, 0.43, 0);
    line(
      leg,
      new THREE.Vector3(),
      new THREE.Vector3(side * 0.08, -0.33, 0),
      charcoal,
      0.058,
    );
    group.add(leg);
    legs.push(leg);
  }
  if (kind === "worker" || kind === "mover") {
    const helmet = new THREE.Mesh(
      new THREE.SphereGeometry(0.174, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2),
      new THREE.MeshStandardMaterial({
        color: orange,
        metalness: 0.1,
        roughness: 0.5,
      }),
    );
    helmet.position.y = 1.075;
    group.add(helmet);
    box(group, orange, [0.39, 0.035, 0.21], [0, 1.08, 0.06]);
  }
  if (kind === "manager") {
    box(group, 0xe1eef0, [0.23, 0.32, 0.035], [0.27, 0.66, 0.15]);
    box(group, cyan, [0.13, 0.025, 0.04], [0.27, 0.82, 0.18], cyan);
  }
  if (kind === "tenant") {
    box(group, 0x3bc0c7, [0.21, 0.27, 0.16], [-0.34, 0.21, 0.06]);
    line(
      group,
      new THREE.Vector3(-0.34, 0.37, 0.06),
      new THREE.Vector3(-0.34, 0.51, 0.06),
      pale,
      0.018,
    );
  }
  return { group, arms, legs, kind };
}

function truck(parent: THREE.Object3D, x: number, z: number) {
  const group = new THREE.Group();
  group.position.set(x, 0.2, z);
  parent.add(group);
  box(group, 0xddebed, [1.5, 0.8, 0.9], [-0.22, 0.74, 0]);
  box(group, 0x26b9c4, [0.75, 0.59, 0.89], [0.84, 0.52, 0], cyan);
  box(group, 0x163b47, [0.45, 0.3, 0.03], [1.01, 0.66, 0.46]);
  box(group, 0x102b34, [2.36, 0.16, 1], [0.25, 0.23, 0]);
  for (const wheel of [-0.62, 0.89]) {
    for (const side of [-0.48, 0.48]) {
      const tire = new THREE.Mesh(
        new THREE.CylinderGeometry(0.2, 0.2, 0.1, 12),
        new THREE.MeshStandardMaterial({ color: 0x091923 }),
      );
      tire.rotation.x = Math.PI / 2;
      tire.position.set(wheel, 0.18, side);
      group.add(tire);
    }
  }
  return group;
}

export function PropertyScene({
  focus,
  reducedMotion,
}: {
  focus: SceneFocus;
  reducedMotion: boolean;
}) {
  const host = useRef<HTMLDivElement>(null);
  const focusRef = useRef(focus);
  useEffect(() => {
    focusRef.current = focus;
  }, [focus]);

  useEffect(() => {
    const element = host.current;
    if (!element) return;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: false,
        powerPreference: "low-power",
      });
    } catch {
      element.dataset.fallback = "true";
      return;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.7));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.setClearColor(0x0c1c28, 1);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.6;
    element.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    scene.fog = new THREE.Fog(0x0c1c28, 22, 45);
    const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 90);
    scene.add(new THREE.HemisphereLight(0xb7f9ff, 0x182f38, 2.1));
    const key = new THREE.DirectionalLight(0xffffff, 2.8);
    key.position.set(-6, 12, 10);
    scene.add(key);
    const rim = new THREE.PointLight(cyan, 36, 25);
    rim.position.set(4, 8, -3);
    scene.add(rim);
    const world = new THREE.Group();
    scene.add(world);
    box(world, 0x142b36, [17, 0.3, 13], [0, -0.15, 0]);
    box(world, 0x26444d, [17.4, 0.13, 13.4], [0, -0.24, 0]);
    box(world, 0x263b44, [16, 0.015, 1.3], [0, 0.02, 3.36]);
    for (let x = -7; x <= 7; x += 2)
      box(world, cyan, [0.55, 0.015, 0.026], [x, 0.03, 3.35], cyan);
    building(world, -3.3, -1.9, 3.15, 4, cyan);
    building(world, 0.15, -2.65, 3.4, 5, green);
    building(world, 4, -1.45, 3, 3, orange);
    const trees: [number, number][] = [
      [-6, -4],
      [-5.6, 1.8],
      [6.6, -3.8],
      [6.4, 1.2],
    ];
    for (const [x, z] of trees) {
      line(
        world,
        new THREE.Vector3(x, 0.1, z),
        new THREE.Vector3(x, 1.05, z),
        0x789ba3,
        0.05,
      );
      sphere(world, green, 0.32, [x, 1.32, z]);
    }
    // CCTV cones and lit telemetry points are part of the model, not live feeds.
    const cameras: [number, number, number][] = [
      [-4.7, 3.2, -0.52],
      [1.25, 4.1, -1.25],
      [5.4, 2.3, -0.1],
    ];
    for (const [x, y, z] of cameras) {
      sphere(world, cyan, 0.1, [x, y, z]);
      const beam = new THREE.Mesh(
        new THREE.ConeGeometry(0.7, 2.1, 16, 1, true),
        new THREE.MeshBasicMaterial({
          color: cyan,
          transparent: true,
          opacity: 0.095,
          depthWrite: false,
          side: THREE.DoubleSide,
        }),
      );
      beam.position.set(x, y - 1, z + 0.6);
      beam.rotation.x = -0.35;
      world.add(beam);
    }
    const workers = [
      person(world, -4.1, 2.15, "worker", 0x23bcc8),
      person(world, -3.15, 2.5, "worker", 0x6cc6be),
    ];
    box(world, 0xaec4c9, [1, 0.13, 0.14], [-3.65, 0.8, 2.5]);
    box(world, 0x8ba6ac, [0.8, 0.6, 0.46], [-2.8, 0.3, 1.67]);
    const tenant = person(world, 0.5, 2.65, "tenant", 0x78d8a2);
    const mover = person(world, 3.5, 2.48, "mover", 0xf0a66c);
    box(world, 0xb4825c, [0.38, 0.38, 0.38], [3.2, 0.2, 2.65]);
    const manager = person(world, 4.65, 1.55, "manager", 0x66a4df);
    manager.group.rotation.y = -0.4;
    const client = person(world, 5.2, 1.8, "tenant", 0xd2a77f);
    client.group.rotation.y = 1.5;
    const movingTruck = truck(world, 5.2, 3.95);
    const targets: Record<
      SceneFocus,
      { eye: [number, number, number]; look: [number, number, number] }
    > = {
      portfolio: { eye: [11, 10, 18], look: [0.2, 1.3, -0.5] },
      units: { eye: [1.8, 3.6, 7], look: [0.1, 2.3, -2.4] },
      maintenance: { eye: [1, 6.5, 12], look: [-3.4, 1.2, 0.6] },
      moves: { eye: [10, 6, 13], look: [3, 0.85, 1.4] },
      security: { eye: [8, 11, 12], look: [1, 2, -1.5] },
    };
    const look = new THREE.Vector3();
    const destination = new THREE.Vector3();
    const timer = new THREE.Timer();
    let visible = true;
    let dragging = false;
    let dragOffset = 0;
    let pointerX = 0;
    const resize = () => {
      const width = Math.max(element.clientWidth, 1),
        height = Math.max(element.clientHeight, 1);
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.fov = width < 600 ? 54 : 42;
      camera.updateProjectionMatrix();
      if (reducedMotion) draw();
    };
    const draw = () => {
      const mode = targets[focusRef.current];
      const mobile = element.clientWidth < 600;
      destination.set(...mode.eye).multiplyScalar(mobile ? 1.42 : 1);
      destination.x += dragOffset;
      camera.position.lerp(destination, reducedMotion ? 1 : 0.045);
      look.lerp(new THREE.Vector3(...mode.look), reducedMotion ? 1 : 0.045);
      camera.lookAt(look);
      if (!reducedMotion) {
        timer.update();
        const t = timer.getElapsed();
        world.rotation.y = Math.sin(t * 0.12) * 0.025 + pointerX * 0.045;
        workers.forEach((worker, index) => {
          worker.arms[0]!.rotation.z = Math.sin(t * 5 + index) * 0.4;
          worker.arms[1]!.rotation.z = -Math.sin(t * 5 + index) * 0.4;
          worker.group.position.y = 0.14 + Math.sin(t * 5 + index) * 0.015;
        });
        for (const [index, rig] of [tenant, mover, manager, client].entries()) {
          const stride = Math.sin(t * 2.3 + index * 1.9);
          rig.legs[0]!.rotation.x = stride * 0.3;
          rig.legs[1]!.rotation.x = -stride * 0.3;
          rig.arms[0]!.rotation.x = -stride * 0.18;
          rig.arms[1]!.rotation.x = stride * 0.18;
          rig.group.position.x += index === 0 ? Math.sin(t * 0.5) * 0.0006 : 0;
        }
        movingTruck.position.x = 5.2 + Math.sin(t * 0.32) * 0.7;
      }
      renderer.render(scene, camera);
    };
    const onMove = (event: PointerEvent) => {
      pointerX = (event.clientX / Math.max(window.innerWidth, 1) - 0.5) * 2;
      if (dragging) dragOffset += event.movementX * 0.025;
    };
    const stopDrag = () => {
      dragging = false;
    };
    renderer.domElement.addEventListener("pointerdown", () => {
      dragging = true;
    });
    window.addEventListener("pointerup", stopDrag);
    window.addEventListener("pointermove", onMove);
    const observer = new IntersectionObserver(
      ([entry]) => {
        visible = Boolean(entry?.isIntersecting);
        if (reducedMotion) draw();
      },
      { threshold: 0.01 },
    );
    observer.observe(element);
    const sizeObserver = new ResizeObserver(resize);
    sizeObserver.observe(element);
    resize();
    camera.position.set(...targets.portfolio.eye);
    look.set(...targets.portfolio.look);
    draw();
    if (!reducedMotion)
      renderer.setAnimationLoop(() => {
        if (visible) draw();
      });
    return () => {
      renderer.setAnimationLoop(null);
      observer.disconnect();
      sizeObserver.disconnect();
      window.removeEventListener("pointerup", stopDrag);
      window.removeEventListener("pointermove", onMove);
      scene.traverse((object) => {
        if (object instanceof THREE.Mesh) {
          object.geometry.dispose();
          const materials = Array.isArray(object.material)
            ? object.material
            : [object.material];
          materials.forEach((material) => material.dispose());
        }
      });
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, [reducedMotion]);

  return (
    <div
      ref={host}
      className="property-scene"
      role="img"
      aria-label="Animated digital twin of apartment buildings with maintenance workers, tenants, movers and a moving truck, property staff, and camera coverage"
    />
  );
}
