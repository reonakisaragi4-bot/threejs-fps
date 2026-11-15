// Effects: tracers, impact sparks and grenades, all from preallocated pools
// so the hot loop never allocates. A tracer is a stretched box; a spark is a
// small plane with a velocity and a life; a grenade is a ball with gravity
// that bounces once off the floor and explodes on its fuse.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

const TRACERS = 24;
const SPARKS = 48;
const GRENADES = 4;

export function createEffects(scene, colliders) {
  const tracerGeo = new THREE.BoxGeometry(0.02, 0.02, 1);
  const tracerMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.accent), transparent: true, opacity: 0.85, depthWrite: false });
  const sparkGeo = new THREE.PlaneGeometry(0.09, 0.09);
  const sparkMat = new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffd27a'), transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide });
  const grenadeGeo = new THREE.SphereGeometry(0.09, 10, 8);
  const grenadeMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.ember), roughness: 0.4, metalness: 0.5 });
  const blastGeo = new THREE.SphereGeometry(1, 18, 12);
  const blastMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.ember), transparent: true, opacity: 0.7, depthWrite: false });

  const tracers = [];
  for (let i = 0; i < TRACERS; i += 1) {
    const mesh = new THREE.Mesh(tracerGeo, tracerMat);
    mesh.visible = false;
    scene.add(mesh);
    tracers.push({ mesh, life: 0 });
  }
  const sparks = [];
  for (let i = 0; i < SPARKS; i += 1) {
    const mesh = new THREE.Mesh(sparkGeo, sparkMat);
    mesh.visible = false;
    scene.add(mesh);
    sparks.push({ mesh, life: 0, vel: new THREE.Vector3() });
  }
  const grenades = [];
  for (let i = 0; i < GRENADES; i += 1) {
    const mesh = new THREE.Mesh(grenadeGeo, grenadeMat);
    mesh.visible = false;
    scene.add(mesh);
    grenades.push({ mesh, active: false, vel: new THREE.Vector3(), fuse: 0, bounced: false });
  }
  const blast = new THREE.Mesh(blastGeo, blastMat);
  blast.visible = false;
  scene.add(blast);
  const blastLight = new THREE.PointLight(new THREE.Color(PALETTE.ember), 0, 18);
  scene.add(blastLight);

  let tracerCursor = 0;
  let sparkCursor = 0;
  const mid = new THREE.Vector3();
  const look = new THREE.Vector3();

  function tracer(from, to) {
    const slot = tracers[tracerCursor];
    tracerCursor = (tracerCursor + 1) % TRACERS;
    mid.addVectors(from, to).multiplyScalar(0.5);
    slot.mesh.position.copy(mid);
    look.copy(to).sub(from);
    const len = look.length() || 0.001;
    slot.mesh.scale.set(1, 1, len);
    slot.mesh.lookAt(to);
    slot.mesh.visible = true;
    slot.life = 0.07;
  }

  function burst(point, count, random) {
    for (let n = 0; n < count; n += 1) {
      const slot = sparks[sparkCursor];
      sparkCursor = (sparkCursor + 1) % SPARKS;
      slot.mesh.position.copy(point);
      slot.vel.set((random() * 2 - 1) * 3, random() * 3, (random() * 2 - 1) * 3);
      slot.mesh.visible = true;
      slot.life = 0.35 + random() * 0.25;
    }
  }

  function throwGrenade(from, direction, random) {
    for (const slot of grenades) {
      if (slot.active) continue;
      slot.active = true;
      slot.bounced = false;
      slot.fuse = 1.4;
      slot.mesh.position.copy(from);
      slot.vel.copy(direction).multiplyScalar(11);
      slot.vel.y += 3.5;
      slot.mesh.visible = true;
      return true;
    }
    return false;
  }

  function explode(point, onBlast) {
    blast.position.copy(point);
    blast.scale.set(0.5, 0.5, 0.5);
    blast.visible = true;
    blastLight.position.copy(point);
    blastLight.position.y += 0.5;
    blastLight.intensity = 60;
    burst(point, 16, Math.random);
    onBlast(point);
  }

  function step(dt, onBlast) {
    for (const slot of tracers) {
      if (slot.life <= 0) continue;
      slot.life -= dt;
      if (slot.life <= 0) slot.mesh.visible = false;
    }
    for (const slot of sparks) {
      if (slot.life <= 0) continue;
      slot.life -= dt;
      slot.vel.y -= 9 * dt;
      slot.mesh.position.addScaledVector(slot.vel, dt);
      slot.mesh.lookAt(slot.mesh.position.x + slot.vel.x, slot.mesh.position.y + slot.vel.y, slot.mesh.position.z + slot.vel.z);
      if (slot.life <= 0 || slot.mesh.position.y < 0.02) slot.mesh.visible = false;
    }
    if (blast.visible) {
      const s = blast.scale.x + dt * 14;
      blast.scale.set(s, s, s);
      blastMat.opacity = Math.max(0, 0.7 - s * 0.09);
      blastLight.intensity = Math.max(0, blastLight.intensity - dt * 220);
      if (s > 7) blast.visible = false;
    }
    for (const slot of grenades) {
      if (!slot.active) continue;
      slot.fuse -= dt;
      slot.vel.y -= 14 * dt;
      slot.mesh.position.addScaledVector(slot.vel, dt);
      if (slot.mesh.position.y < 0.09) {
        slot.mesh.position.y = 0.09;
        if (!slot.bounced) {
          slot.vel.y = Math.abs(slot.vel.y) * 0.35;
          slot.vel.x *= 0.6;
          slot.vel.z *= 0.6;
          slot.bounced = true;
        } else {
          slot.vel.set(0, 0, 0);
        }
      }
      if (slot.fuse <= 0) {
        slot.active = false;
        slot.mesh.visible = false;
        explode(slot.mesh.position.clone(), onBlast);
      }
    }
  }

  return { tracer, burst, throwGrenade, explode, step };
}
