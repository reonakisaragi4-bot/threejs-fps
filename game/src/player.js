// The player: acceleration, friction, gravity, crouch and jump, built on the
// shared body physics. Health, armor and the money the buy menu spends live
// here too, because they are the player's own state.
import * as THREE from 'three';
import { createBody, setCrouch, integrate, groundSpeed } from './physics.js';

const WALK_SPEED = 5.2;
const CROUCH_SPEED = 2.4;
const GROUND_ACCEL = 42;
const AIR_ACCEL = 9;
const FRICTION = 9;
const JUMP_SPEED = 6.2;
const MAX_HEALTH = 100;

export function createPlayer(colliders, spawn) {
  const body = createBody(colliders, spawn.x, spawn.z);
  body.yaw = spawn.yaw;
  const player = {
    body,
    health: MAX_HEALTH,
    armor: 0,
    money: 800,
    alive: true,
    hasBomb: true,
    grenades: 1,
  };
  const wish = new THREE.Vector3();

  function look(dx, dy, sensitivity = 0.0022) {
    body.yaw -= dx * sensitivity;
    body.pitch = Math.max(-1.45, Math.min(1.45, body.pitch - dy * sensitivity));
  }

  function recoil(pitchKick, yawKick) {
    body.pitch = Math.min(1.45, body.pitch + pitchKick);
    body.yaw += yawKick;
  }

  function step(dt, keys) {
    if (!player.alive) return;
    const eyeTarget = setCrouch(body, colliders, keys.has('ControlLeft') || keys.has('ControlRight') || keys.has('KeyC'));
    body.eye += (eyeTarget - body.eye) * Math.min(1, dt * 12);

    const forward = (keys.has('KeyW') ? 1 : 0) - (keys.has('KeyS') ? 1 : 0);
    const strafe = (keys.has('KeyD') ? 1 : 0) - (keys.has('KeyA') ? 1 : 0);
    wish.set(0, 0, 0);
    if (forward || strafe) {
      const sin = Math.sin(body.yaw);
      const cos = Math.cos(body.yaw);
      wish.set(-sin * forward + cos * strafe, 0, -cos * forward - sin * strafe).normalize();
    }
    const speed = body.crouching ? CROUCH_SPEED : WALK_SPEED;
    const blend = Math.min(1, (body.onGround ? GROUND_ACCEL : AIR_ACCEL) * dt / speed);
    body.velocity.x += (wish.x * speed - body.velocity.x) * blend;
    body.velocity.z += (wish.z * speed - body.velocity.z) * blend;
    if (body.onGround && wish.lengthSq() === 0) {
      const damp = Math.max(0, 1 - FRICTION * dt);
      body.velocity.x *= damp;
      body.velocity.z *= damp;
    }
    if (keys.has('Space') && body.onGround) {
      body.velocity.y = JUMP_SPEED;
      body.onGround = false;
    }
    integrate(body, colliders, dt);
  }

  function damage(amount) {
    if (!player.alive) return false;
    let rest = amount;
    if (player.armor > 0) {
      const absorbed = Math.min(player.armor, rest * 0.5);
      player.armor -= absorbed;
      rest -= absorbed;
    }
    player.health -= rest;
    if (player.health <= 0) {
      player.health = 0;
      player.alive = false;
      return true;
    }
    return false;
  }

  function reset(spawnPoint) {
    body.position.set(spawnPoint.x, 0, spawnPoint.z);
    body.velocity.set(0, 0, 0);
    body.yaw = spawnPoint.yaw;
    body.pitch = 0;
    body.eye = 1.6;
    body.height = 1.72;
    body.crouching = false;
    player.health = MAX_HEALTH;
    player.alive = true;
    player.hasBomb = true;
  }

  return {
    state: player,
    body,
    step,
    look,
    recoil,
    damage,
    reset,
    speed() {
      return groundSpeed(body);
    },
  };
}
