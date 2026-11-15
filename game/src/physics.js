// Shared movement physics: one body (a vertical capsule approximated as a box)
// resolved against the map's axis-aligned colliders one axis at a time, so a wall
// never swallows a body and standing on the floor is never read as a collision.
// Both the player and the bots move through this one function.
import * as THREE from 'three';

export const STAND_HEIGHT = 1.72;
export const CROUCH_HEIGHT = 1.12;
export const STAND_EYE = 1.6;
export const CROUCH_EYE = 1.02;
const RADIUS = 0.34;
const GRAVITY = 20;

export function createBody(colliders, x, z) {
  return {
    position: new THREE.Vector3(x, 0, z),
    velocity: new THREE.Vector3(),
    yaw: 0,
    pitch: 0,
    eye: STAND_EYE,
    height: STAND_HEIGHT,
    onGround: true,
    crouching: false,
  };
}

const probe = new THREE.Box3();

function overlaps(colliders, x, y, z, height, lift) {
  probe.min.set(x - RADIUS, y + lift, z - RADIUS);
  probe.max.set(x + RADIUS, y + height - lift, z + RADIUS);
  for (let i = 0; i < colliders.length; i += 1) {
    if (probe.intersectsBox(colliders[i])) return colliders[i];
  }
  return null;
}

export function setCrouch(body, colliders, wantCrouch) {
  if (wantCrouch && !body.crouching) {
    body.crouching = true;
    body.height = CROUCH_HEIGHT;
  } else if (!wantCrouch && body.crouching) {
    if (!overlaps(colliders, body.position.x, body.position.y, body.position.z, STAND_HEIGHT, 0.02)) {
      body.crouching = false;
      body.height = STAND_HEIGHT;
    }
  }
  const target = body.crouching ? CROUCH_EYE : STAND_EYE;
  return target;
}

export function integrate(body, colliders, dt) {
  // Horizontal axes, one at a time, so sliding along a wall keeps working.
  const nextX = body.position.x + body.velocity.x * dt;
  if (!overlaps(colliders, nextX, body.position.y, body.position.z, body.height, 0.04)) {
    body.position.x = nextX;
  } else {
    body.velocity.x = 0;
  }
  const nextZ = body.position.z + body.velocity.z * dt;
  if (!overlaps(colliders, body.position.x, body.position.y, nextZ, body.height, 0.04)) {
    body.position.z = nextZ;
  } else {
    body.velocity.z = 0;
  }
  // Vertical axis: gravity, then resolve against the floor or a ceiling.
  body.velocity.y -= GRAVITY * dt;
  body.position.y += body.velocity.y * dt;
  body.onGround = false;
  const hit = overlaps(colliders, body.position.x, body.position.y, body.position.z, body.height, 0);
  if (hit && body.velocity.y <= 0) {
    body.position.y = hit.max.y;
    body.velocity.y = 0;
    body.onGround = true;
  } else if (hit) {
    body.position.y = hit.min.y - body.height;
    body.velocity.y = 0;
  }
  if (body.position.y < 0) {
    body.position.y = 0;
    body.velocity.y = 0;
    body.onGround = true;
  }
  if (body.velocity.y < -30) body.velocity.y = -30;
}

export function groundSpeed(body) {
  return Math.hypot(body.velocity.x, body.velocity.z);
}
