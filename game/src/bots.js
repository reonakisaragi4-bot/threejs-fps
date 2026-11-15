// Bots: the other soldiers. One system drives both teams. Attackers walk a
// route to a bomb site, defenders hold near a site and scan. A bot that sees
// an enemy (range, view cone, line of sight) reacts after a short delay, then
// fires in bursts with spread that grows with distance; a bot that hears a
// shot investigates it. The bomb carrier plants when the site is quiet, a
// defender defuses when the bomb is planted and the site is quiet.
import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { createBody, integrate } from './physics.js';
import {
  WAYPOINTS, ROUTE_A, ROUTE_A_MID, ROUTE_B, ROUTE_B_MID,
  DEFENDER_HOLDS, ATTACKER_SPAWNS, DEFENDER_SPAWNS, SITES,
} from './map.js';
import { range } from './rng.js';

const BOT_HEALTH = 100;
const WALK_SPEED = 3.4;
const VISION_RANGE = 30;
const VISION_HALF_ANGLE = 1.3;
const HEAR_RANGE = 26;
const REACT_MIN = 0.35;
const REACT_MAX = 0.7;
const BURST_MIN = 3;
const BURST_MAX = 5;
const SHOT_GAP = 0.11;
const PLANT_TIME = 3.5;
const DEFUSE_TIME = 5;

const NAMES_ATK = ['Ash', 'Bram', 'Kestrel'];
const NAMES_DEF = ['Voss', 'Ilya', 'Maren', 'Dusk'];

export function createBots(scene, colliders, shootables, random) {
  const raycaster = new THREE.Raycaster();
  raycaster.far = 60;
  const eyePos = new THREE.Vector3();
  const toTarget = new THREE.Vector3();
  const dir = new THREE.Vector3();
  const tmp = new THREE.Vector3();

  const atkMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.attacker), roughness: 0.6, metalness: 0.1 });
  const defMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.defender), roughness: 0.6, metalness: 0.1 });
  const skinMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.ink), roughness: 0.55 });
  const gunMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.steel), roughness: 0.5, metalness: 0.5 });
  const torsoGeo = new THREE.BoxGeometry(0.52, 0.78, 0.3);
  const headGeo = new THREE.SphereGeometry(0.16, 14, 10);
  const gunGeo = new THREE.BoxGeometry(0.07, 0.09, 0.5);
  const flashGeo = new THREE.PlaneGeometry(0.2, 0.2);
  const flashMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.accent), transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide });

  const bots = [];

  function buildMesh(team) {
    const group = new THREE.Group();
    const torso = new THREE.Mesh(torsoGeo, team === 'atk' ? atkMat : defMat);
    torso.position.y = 1.0;
    const head = new THREE.Mesh(headGeo, skinMat);
    head.position.y = 1.55;
    const gun = new THREE.Mesh(gunGeo, gunMat);
    gun.position.set(0.2, 1.05, -0.3);
    const flash = new THREE.Mesh(flashGeo, flashMat);
    flash.position.set(0.2, 1.05, -0.62);
    flash.visible = false;
    group.add(torso, head, gun, flash);
    group.traverse((mesh) => {
      if (mesh.isMesh) {
        mesh.castShadow = true;
        mesh.receiveShadow = true;
      }
    });
    scene.add(group);
    return { group, torso, head, gun, flash };
  }

  function makeBot(team, name, spawn, route, holdNode) {
    const body = createBody(colliders, spawn.x, spawn.z);
    body.yaw = spawn.yaw;
    const mesh = buildMesh(team);
    const bot = {
      team, name, body, mesh,
      health: BOT_HEALTH, alive: true,
      state: team === 'atk' ? 'route' : 'hold',
      route, routeIndex: 0, holdNode,
      scanBase: spawn.yaw, scanPhase: random() * 6,
      target: null, lastSeen: null, lastSeenAt: -99,
      reactAt: 0, burstLeft: 0, nextShotAt: 0, strafeDir: 1, strafeAt: 0,
      hasBomb: false, channel: 0, channelKind: null,
      visionSlot: Math.floor(random() * 6),
      flashLeft: 0, fall: 0,
    };
    mesh.torso.userData.bot = bot;
    mesh.head.userData.bot = bot;
    mesh.torso.userData.part = 'torso';
    mesh.head.userData.part = 'head';
    bots.push(bot);
    return bot;
  }

  for (let i = 0; i < 3; i += 1) {
    const route = [ROUTE_A, ROUTE_A_MID, ROUTE_B, ROUTE_B_MID][i % 4];
    makeBot('atk', NAMES_ATK[i], ATTACKER_SPAWNS[i + 1], route, -1);
  }
  for (let i = 0; i < 4; i += 1) {
    makeBot('def', NAMES_DEF[i], DEFENDER_SPAWNS[i], [], DEFENDER_HOLDS[i * 2]);
  }

  function allHitMeshes() {
    const list = [];
    for (const bot of bots) {
      if (bot.alive) list.push(bot.mesh.torso, bot.mesh.head);
    }
    return list;
  }

  function canSee(bot, pos, crouching) {
    eyePos.set(bot.body.position.x, bot.body.position.y + bot.body.eye, bot.body.position.z);
    toTarget.copy(pos).sub(eyePos);
    const dist = toTarget.length();
    if (dist > VISION_RANGE) return false;
    dir.copy(toTarget).normalize();
    const forward = tmp.set(-Math.sin(bot.body.yaw), 0, -Math.cos(bot.body.yaw));
    if (dir.x * forward.x + dir.z * forward.z < Math.cos(VISION_HALF_ANGLE)) return false;
    raycaster.set(eyePos, dir);
    const hit = raycaster.intersectObjects(shootables, false)[0];
    if (hit && hit.distance < dist - 0.6) return false;
    return true;
  }

  function nearestVisibleEnemy(bot, world, time) {
    // The player first, then enemy bots; the closest visible one wins.
    let best = null;
    let bestDist = Infinity;
    if (world.playerAlive) {
      const pp = world.playerBody.position;
      tmp.set(pp.x, pp.y + (world.playerCrouching ? 1.02 : 1.6), pp.z);
      const dist = Math.hypot(pp.x - bot.body.position.x, pp.z - bot.body.position.z);
      if (dist < bestDist && canSee(bot, tmp, world.playerCrouching)) {
        best = { kind: 'player', dist };
        bestDist = dist;
      }
    }
    for (const other of bots) {
      if (other === bot || !other.alive || other.team === bot.team) continue;
      const op = other.body.position;
      tmp.set(op.x, op.y + 1.3, op.z);
      const dist = Math.hypot(op.x - bot.body.position.x, op.z - bot.body.position.z);
      if (dist < bestDist && canSee(bot, tmp, false)) {
        best = { kind: 'bot', bot: other, dist };
        bestDist = dist;
      }
    }
    if (best) {
      bot.lastSeen = best.kind === 'player'
        ? new THREE.Vector3(world.playerBody.position.x, world.playerBody.position.y, world.playerBody.position.z)
        : new THREE.Vector3(best.bot.body.position.x, best.bot.body.position.y, best.bot.body.position.z);
      bot.lastSeenAt = time;
    }
    return best;
  }

  function fireAt(bot, world, time) {
    if (bot.burstLeft <= 0) {
      if (time < bot.nextShotAt) return;
      bot.burstLeft = BURST_MIN + Math.floor(random() * (BURST_MAX - BURST_MIN + 1));
      bot.nextShotAt = time + SHOT_GAP;
    }
    if (time < bot.nextShotAt) return;
    bot.nextShotAt = time + SHOT_GAP;
    bot.burstLeft -= 1;
    bot.flashLeft = 0.06;
    const target = bot.target;
    if (!target) return;
    const dist = target.dist;
    // Accuracy falls with distance; a head hit is a lucky 12%.
    const hitChance = Math.max(0.18, 0.62 - dist * 0.012);
    if (random() > hitChance) return;
    const head = random() < 0.12;
    const damage = head ? 28 : 14;
    if (target.kind === 'player') {
      world.onDamagePlayer(damage, bot.body.position);
    } else if (target.bot.alive) {
      damageBot(target.bot, damage, bot, world);
    }
  }

  function damageBot(bot, amount, killer, world) {
    if (!bot.alive) return;
    bot.health -= amount;
    if (bot.health > 0) return;
    bot.health = 0;
    bot.alive = false;
    bot.state = 'dead';
    bot.fall = 0;
    if (bot.hasBomb) {
      bot.hasBomb = false;
      world.onBombDropped(new THREE.Vector3(bot.body.position.x, 0, bot.body.position.z));
    }
    world.onKillFeed(`${killer ? killer.name : '???'} ▸ ${bot.name}`);
  }

  function moveToward(bot, x, z, dt, speed) {
    const dx = x - bot.body.position.x;
    const dz = z - bot.body.position.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 0.05) return true;
    bot.body.velocity.x = (dx / dist) * speed;
    bot.body.velocity.z = (dz / dist) * speed;
    bot.body.yaw = Math.atan2(-dx, -dz);
    integrate(bot.body, colliders, dt);
    return dist < 0.6;
  }

  function stepBot(bot, dt, time, world) {
    if (!bot.alive) {
      bot.fall = Math.min(1, bot.fall + dt / 0.4);
      bot.mesh.group.rotation.x = -bot.fall * 1.45;
      return;
    }
    bot.flashLeft = Math.max(0, bot.flashLeft - dt);
    bot.mesh.flash.visible = bot.flashLeft > 0;
    bot.body.velocity.x = 0;
    bot.body.velocity.z = 0;

    // Vision runs on a staggered 10 Hz slot so seven bots never raycast at once.
    const tick = Math.floor(time * 10);
    if (tick % 6 === bot.visionSlot) {
      const seen = nearestVisibleEnemy(bot, world, time);
      if (seen) {
        if (bot.state !== 'engage') bot.reactAt = time + range(random, REACT_MIN, REACT_MAX);
        bot.target = seen;
        bot.state = 'engage';
        bot.channel = 0;
        bot.channelKind = null;
      } else if (bot.state === 'engage' && time - bot.lastSeenAt > 2) {
        bot.target = null;
        bot.state = bot.team === 'atk' ? 'investigate' : 'hold';
      }
    }

    if (bot.state === 'engage') {
      const target = bot.target;
      if (target && time >= bot.reactAt) {
        const tp = target.kind === 'player'
          ? world.playerBody.position
          : target.bot.body.position;
        bot.body.yaw = Math.atan2(-(tp.x - bot.body.position.x), -(tp.z - bot.body.position.z));
        const dist = Math.hypot(tp.x - bot.body.position.x, tp.z - bot.body.position.z);
        if (time > bot.strafeAt) {
          bot.strafeDir = random() < 0.5 ? -1 : 1;
          bot.strafeAt = time + range(random, 0.8, 1.5);
        }
        if (dist > 20) moveToward(bot, tp.x, tp.z, dt, WALK_SPEED);
        else if (dist < 6) moveToward(bot, bot.body.position.x * 2 - tp.x, bot.body.position.z * 2 - tp.z, dt, WALK_SPEED * 0.6);
        else {
          const sx = Math.cos(bot.body.yaw) * bot.strafeDir;
          const sz = -Math.sin(bot.body.yaw) * bot.strafeDir;
          moveToward(bot, bot.body.position.x + sx, bot.body.position.z + sz, dt, WALK_SPEED * 0.5);
        }
        fireAt(bot, world, time);
      }
      return;
    }

    // Not engaging: follow the route, hold a position, or investigate a sound.
    if (bot.state === 'route') {
      const node = WAYPOINTS[bot.route[bot.routeIndex]];
      if (moveToward(bot, node.x, node.z, dt, WALK_SPEED)) {
        bot.routeIndex += 1;
        if (bot.routeIndex >= bot.route.length) {
          bot.state = 'hold';
          bot.scanBase = bot.body.yaw;
        }
      }
    } else if (bot.state === 'investigate') {
      if (bot.lastSeen && moveToward(bot, bot.lastSeen.x, bot.lastSeen.z, dt, WALK_SPEED)) {
        bot.state = bot.team === 'atk' ? 'route' : 'hold';
        if (bot.state === 'route' && bot.routeIndex >= bot.route.length) bot.state = 'hold';
      }
    } else if (bot.state === 'hold') {
      bot.body.yaw = bot.scanBase + Math.sin(time * 0.5 + bot.scanPhase) * 0.9;
      // The bomb carrier plants when the site is quiet; a defender defuses
      // when the bomb is planted and the site is quiet.
      if (bot.team === 'atk' && bot.hasBomb && world.bomb.state === 'carried') {
        for (const key of ['A', 'B']) {
          const site = SITES[key];
          // Bots stop a little short of the site marker, so they plant from
          // just outside its painted ring.
          if (Math.hypot(bot.body.position.x - site.x, bot.body.position.z - site.z) < site.radius + 1.5) {
            bot.channel += dt;
            bot.channelKind = 'plant';
            if (bot.channel >= PLANT_TIME) {
              bot.channel = 0;
              bot.channelKind = null;
              world.onPlant(key);
            }
            return;
          }
        }
      }
      if (bot.team === 'def' && world.bomb.state === 'planted') {
        const site = SITES[world.bomb.site];
        if (Math.hypot(bot.body.position.x - site.x, bot.body.position.z - site.z) < 3) {
          bot.channel += dt;
          bot.channelKind = 'defuse';
          if (bot.channel >= DEFUSE_TIME) {
            bot.channel = 0;
            bot.channelKind = null;
            world.onDefuse();
          }
          return;
        }
        moveToward(bot, site.x, site.z, dt, WALK_SPEED);
        return;
      }
      bot.channel = 0;
      bot.channelKind = null;
    }

    // Pick up a dropped bomb by walking over it.
    if (bot.team === 'atk' && world.bomb.state === 'dropped') {
      const bp = world.bomb.pos;
      if (Math.hypot(bot.body.position.x - bp.x, bot.body.position.z - bp.z) < 1.2) {
        bot.hasBomb = true;
        world.onBombPickup(bot);
      }
    }
  }

  function syncMesh(bot) {
    const mesh = bot.mesh.group;
    mesh.position.set(bot.body.position.x, bot.body.position.y, bot.body.position.z);
    mesh.rotation.y = bot.body.yaw;
    if (bot.alive) mesh.rotation.x = 0;
  }

  return {
    list: bots,
    hitMeshes: allHitMeshes,
    spawnRound() {
      for (let i = 0; i < bots.length; i += 1) {
        const bot = bots[i];
        const spawn = bot.team === 'atk' ? ATTACKER_SPAWNS[i + 1] : DEFENDER_SPAWNS[i - 3];
        bot.body.position.set(spawn.x, 0, spawn.z);
        bot.body.velocity.set(0, 0, 0);
        bot.body.yaw = spawn.yaw;
        bot.body.pitch = 0;
        bot.health = BOT_HEALTH;
        bot.alive = true;
        bot.state = bot.team === 'atk' ? 'route' : 'hold';
        bot.routeIndex = 0;
        bot.target = null;
        bot.lastSeen = null;
        bot.burstLeft = 0;
        bot.hasBomb = false;
        bot.channel = 0;
        bot.channelKind = null;
        bot.fall = 0;
        bot.mesh.group.rotation.set(0, bot.body.yaw, 0);
        syncMesh(bot);
      }
      // No bot carries the bomb at round start: the player does. A bot only
      // picks it up if the player drops it mid-round.
    },
    hearShot(pos, team) {
      for (const bot of bots) {
        if (!bot.alive || bot.team === team || bot.state === 'engage') continue;
        const dist = Math.hypot(bot.body.position.x - pos.x, bot.body.position.z - pos.z);
        if (dist < HEAR_RANGE) {
          bot.lastSeen = pos.clone();
          bot.lastSeenAt = 0;
          bot.state = 'investigate';
        }
      }
    },
    damage(mesh, amount, killer, world) {
      const bot = mesh.userData.bot;
      if (bot) damageBot(bot, amount, killer, world);
      return bot && !bot.alive;
    },
    step(dt, time, world) {
      for (const bot of bots) stepBot(bot, dt, time, world);
      for (const bot of bots) syncMesh(bot);
    },
    aliveCount(team) {
      let n = 0;
      for (const bot of bots) if (bot.alive && bot.team === team) n += 1;
      return n;
    },
  };
}
