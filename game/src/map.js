// Ember Yard: an original dusk-lit industrial yard, 40 m wide and 30 m deep.
// Three lanes run south to north between the attacker spawn and the two bomb
// sites: the west container lane, the open mid courtyard around a silo, and the
// east gantry lane with a raised walkway. Every box is a collider for bodies
// and a surface a bullet stops on; the waypoint graph is what the bots walk.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

export const SITES = {
  A: { x: -14, z: -11, radius: 3.4, name: 'A — Container Stack' },
  B: { x: 14, z: -11, radius: 3.4, name: 'B — Gantry' },
};

// Waypoint graph: nodes the bots walk, and the routes attackers take to each
// site. Defender holds are positions near the sites, not routes.
export const WAYPOINTS = [
  // 0-2 attacker spawn (south)
  { x: -6, z: 12 }, { x: 0, z: 12 }, { x: 6, z: 12 },
  // 3-6 west lane
  { x: -16, z: 8 }, { x: -16, z: 2 }, { x: -16, z: -4 }, { x: -14, z: -9 },
  // 7-10 mid courtyard
  { x: 0, z: 7 }, { x: 0, z: 1 }, { x: 0, z: -5 }, { x: -4, z: -9 },
  // 11-14 east lane
  { x: 16, z: 8 }, { x: 16, z: 2 }, { x: 16, z: -4 }, { x: 14, z: -9 },
  // 15-17 site A approach / site B approach
  { x: -10, z: -11 }, { x: 10, z: -11 }, { x: 0, z: -11 },
  // 18-23 defender holds
  { x: -12, z: -7 }, { x: -16, z: -12 }, { x: -9, z: -13 },
  { x: 12, z: -7 }, { x: 16, z: -12 }, { x: 9, z: -13 },
  // 24-25 mid holds
  { x: -6, z: -5 }, { x: 6, z: -5 },
];
export const ROUTE_A = [0, 3, 4, 5, 6, 15];
export const ROUTE_A_MID = [1, 7, 8, 9, 10, 15];
export const ROUTE_B = [2, 11, 12, 13, 14, 16];
export const ROUTE_B_MID = [1, 7, 8, 9, 17, 16];
export const DEFENDER_HOLDS = [18, 19, 20, 21, 22, 23, 24, 25];
export const ATTACKER_SPAWNS = [
  { x: -6, z: 12, yaw: 0 },
  { x: -2, z: 13, yaw: 0 },
  { x: 2, z: 13, yaw: 0 },
  { x: 6, z: 12, yaw: 0 },
];
export const DEFENDER_SPAWNS = [
  { x: -12, z: -8, yaw: Math.PI },
  { x: 0, z: -11, yaw: Math.PI },
  { x: 12, z: -8, yaw: Math.PI },
  { x: -4, z: -6, yaw: Math.PI },
];

export function createMap(scene) {
  const group = new THREE.Group();
  scene.add(group);
  const materials = {};
  for (const name of ['floor', 'wall', 'steel', 'rust', 'crate', 'accent', 'ember']) {
    materials[name] = new THREE.MeshStandardMaterial({
      color: new THREE.Color(PALETTE[name]),
      roughness: name === 'steel' ? 0.45 : 0.92,
      metalness: name === 'steel' ? 0.55 : 0.04,
    });
  }
  const colliders = [];
  const shootables = [];
  const boxes = [];

  function box(w, h, d, x, y, z, material, collide = true) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), materials[material]);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    const bounds = new THREE.Box3().setFromObject(mesh);
    if (collide) colliders.push(bounds);
    shootables.push(mesh);
    boxes.push(mesh);
    return mesh;
  }

  function cylinder(radius, height, x, z, material) {
    const mesh = new THREE.Mesh(
      new THREE.CylinderGeometry(radius, radius, height, 20),
      materials[material],
    );
    mesh.position.set(x, height / 2, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    // A cylinder collides as its bounding box; close enough for a silo.
    colliders.push(new THREE.Box3().setFromObject(mesh));
    shootables.push(mesh);
    return mesh;
  }

  // Ground and the outer wall ring, 5 m high, open to a dusk sky.
  box(40.4, 0.4, 30.4, 0, -0.2, 0, 'floor');
  box(0.4, 5, 30.4, -20.2, 2.5, 0, 'wall');
  box(0.4, 5, 30.4, 20.2, 2.5, 0, 'wall');
  box(40.4, 5, 0.4, 0, 2.5, -15.2, 'wall');
  box(40.4, 5, 0.4, 0, 2.5, 15.2, 'wall');

  // Site A: a rusted container stack, two high, with a crate beside it.
  box(6, 2.6, 2.6, -14, 1.3, -12.6, 'rust');
  box(6, 2.6, 2.6, -14, 3.9, -12.6, 'rust');
  box(2.4, 2.6, 2.6, -17.4, 1.3, -12.6, 'steel');
  box(1.2, 1.1, 1.2, -10.4, 0.55, -9.4, 'crate');
  box(1.2, 1.1, 1.2, -11.6, 0.55, -8.2, 'crate');

  // Site B: a steel gantry with a raised walkway and stepped access.
  box(7, 0.5, 3, 14, 2.4, -12.4, 'steel');
  box(0.5, 2.4, 0.5, 11, 1.2, -13.6, 'steel');
  box(0.5, 2.4, 0.5, 17, 1.2, -13.6, 'steel');
  box(0.5, 2.4, 0.5, 11, 1.2, -11.2, 'steel');
  box(0.5, 2.4, 0.5, 17, 1.2, -11.2, 'steel');
  box(1.6, 0.6, 1.2, 10.4, 0.3, -9.4, 'crate');
  box(1.6, 1.2, 1.2, 10.4, 0.9, -9.4, 'crate');
  box(1.6, 1.8, 1.2, 10.4, 1.5, -9.4, 'crate');
  box(1.2, 1.1, 1.2, 17.6, 0.55, -9.2, 'crate');

  // Mid courtyard: a silo, a crane base and low cover to duck behind.
  cylinder(1.9, 7, 0, -2, 'steel');
  box(2.2, 1.1, 2.2, -5, 0.55, 3, 'crate');
  box(2.2, 1.1, 2.2, 5, 0.55, 3, 'crate');
  box(1.2, 1.1, 1.2, -3, 0.55, -6, 'crate');
  box(1.2, 1.1, 1.2, 3, 0.55, -6, 'crate');
  box(3.4, 0.9, 1.1, 0, 0.45, -8.6, 'crate');

  // West lane: container walls that make the lane a corridor with corners.
  box(1.2, 2.6, 6, -18.4, 1.3, 4, 'rust');
  box(1.2, 2.6, 6, -12.4, 1.3, -2, 'rust');
  box(1.2, 1.1, 1.2, -16, 0.55, -6.4, 'crate');
  box(1.2, 1.1, 1.2, -13.6, 0.55, 5.6, 'crate');

  // East lane: pillar row and a low wall for the gantry approach.
  box(1, 3.4, 1, 12.6, 1.7, 4, 'wall');
  box(1, 3.4, 1, 12.6, 1.7, -2, 'wall');
  box(1.2, 1.1, 3.4, 18.4, 0.55, 4, 'crate');
  box(1.2, 1.1, 1.2, 16, 0.55, -6.4, 'crate');

  // South spawn cover: two crates and a barrel cluster.
  box(2.4, 1.1, 1.2, -4, 0.55, 9.4, 'crate');
  box(2.4, 1.1, 1.2, 4, 0.55, 9.4, 'crate');
  cylinder(0.55, 1.1, -8, 10.5, 'rust');
  cylinder(0.55, 1.1, 8, 10.5, 'rust');

  // Amber lane markings on the floor: thin, non-colliding strips.
  box(0.3, 0.02, 8, -16, 0.01, 2, 'accent', false);
  box(0.3, 0.02, 8, 16, 0.01, 2, 'accent', false);
  box(0.3, 0.02, 6, 0, 0.01, -6, 'ember', false);

  // Site markers: a low glowing frame on the floor of each site.
  for (const site of [SITES.A, SITES.B]) {
    const marker = new THREE.Mesh(
      new THREE.RingGeometry(site.radius - 0.25, site.radius, 40),
      new THREE.MeshBasicMaterial({
        color: new THREE.Color(PALETTE.accent), transparent: true, opacity: 0.55, side: THREE.DoubleSide,
      }),
    );
    marker.rotation.x = -Math.PI / 2;
    marker.position.set(site.x, 0.03, site.z);
    group.add(marker);
  }

  // Light: a low amber sun from the west, a cool blue-grey sky, and two warm
  // strip lights over the sites so the objectives read at a glance.
  const sky = new THREE.HemisphereLight(new THREE.Color('#5a6a80'), new THREE.Color(PALETTE.canvas), 1.1);
  scene.add(sky);
  const sun = new THREE.DirectionalLight(new THREE.Color('#ffb45e'), 2.6);
  sun.position.set(-18, 10, 8);
  sun.target.position.set(4, 0, -6);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -24;
  sun.shadow.camera.right = 24;
  sun.shadow.camera.top = 20;
  sun.shadow.camera.bottom = -20;
  sun.shadow.camera.far = 60;
  sun.shadow.bias = -0.0006;
  scene.add(sun, sun.target);
  const fill = new THREE.DirectionalLight(new THREE.Color('#7d8ea8'), 0.5);
  fill.position.set(14, 12, 12);
  scene.add(fill);
  for (const site of [SITES.A, SITES.B]) {
    const lamp = new THREE.PointLight(new THREE.Color(PALETTE.accent), 12, 14);
    lamp.position.set(site.x, 4.6, site.z);
    scene.add(lamp);
  }

  return { colliders, shootables, group };
}
