// Ember Yard: boot and the one loop. A fixed 60 Hz simulation feeds rendering
// at the display's rate; all state lives in one `game` object. The round flow,
// shooting, bomb, buy menu and bot wiring meet here.
// ?shot=cover|play|end with &seed=N stages a deterministic frame for a
// capture, renders it twice, then freezes it and sets window.__shotReady.
import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { mulberry32 } from './rng.js';
import { createMap, SITES, ATTACKER_SPAWNS } from './map.js';
import { createInput } from './input.js';
import { createPlayer } from './player.js';
import { createWeapons, WEAPONS } from './weapons.js';
import { createBots } from './bots.js';
import { createBomb } from './bomb.js';
import { createRounds, BUY_SECONDS, ROUND_SECONDS, AWARDS, PRICES } from './rounds.js';
import { createEffects } from './effects.js';
import { createAudio } from './audio.js';
import { createHud } from './hud.js';

const FIXED_STEP = 1 / 60;
const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seed = Number.parseInt(params.get('seed') ?? '1', 10) || 1;
const random = mulberry32(shot ? seed : (Date.now() % 2147483647));
const YOU = { name: 'You' };

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.getElementById('game').appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(PALETTE.canvas);
scene.fog = new THREE.Fog(new THREE.Color(PALETTE.canvas), 24, 60);
const camera = new THREE.PerspectiveCamera(74, window.innerWidth / window.innerHeight, 0.05, 160);
scene.add(camera);

const map = createMap(scene);
const effects = createEffects(scene, map.colliders);
const audio = createAudio();
const hud = createHud();
const bots = createBots(scene, map.colliders, map.shootables, random);
const bomb = createBomb();
const rounds = createRounds();
const player = createPlayer(map.colliders, ATTACKER_SPAWNS[0]);
const weapons = createWeapons(camera);
const input = createInput(renderer.domElement, onLockChange);
const raycaster = new THREE.Raycaster();
raycaster.far = 90;
const direction = new THREE.Vector3();
const muzzle = new THREE.Vector3();
const hitPoint = new THREE.Vector3();
const tmpVec = new THREE.Vector3();

let shootables = map.shootables.concat(bots.hitMeshes());
let elapsed = 0;
let frozen = false;
let started = false;
let accumulator = 0;
let lastTime = performance.now();
let prevFiring = false;
let bombBeepTimer = 0;
let liveTimer = ROUND_SECONDS;

const game = { player, weapons, bots, bomb, rounds, phase: 'menu' };

function syncCamera() {
  const body = player.body;
  camera.position.set(body.position.x, body.position.y + body.eye, body.position.z);
  camera.rotation.set(body.pitch, body.yaw, 0, 'YXZ');
}

function aimAt(point) {
  const body = player.body;
  const dx = point.x - body.position.x;
  const dy = point.y - (body.position.y + body.eye);
  const dz = point.z - body.position.z;
  const length = Math.hypot(dx, dy, dz) || 1;
  body.yaw = Math.atan2(-dx, -dz);
  body.pitch = Math.asin(Math.max(-1, Math.min(1, dy / length)));
  syncCamera();
}

function pushHud() {
  const st = player.state;
  const w = weapons.def();
  const ws = weapons.state();
  hud.setAmmo(ws.mag, ws.reserve, w.name);
  hud.setHealth(Math.ceil(st.health), Math.ceil(st.armor));
  hud.setMoney(Math.floor(st.money));
  hud.setGrenades(st.grenades);
  hud.setScore(rounds.state.scoreAtk, rounds.state.scoreDef);
  hud.setAlive(1 + bots.aliveCount('atk'), bots.aliveCount('def'));
  const phase = rounds.state.phase;
  const timer = phase === 'buy' ? rounds.state.timer : phase === 'live' ? liveTimer : 0;
  hud.setTimer(Math.max(0, timer), phase);
  hud.setCrosshair(weapons.spread(player.speed()) * 900);
  hud.setBuyEnabled(Math.floor(st.money));
}

function award(amount) {
  player.state.money += amount;
}

function killFeed(text) {
  hud.killFeed(text);
}

function endRound(winner, text, sub) {
  if (rounds.state.phase !== 'live' && rounds.state.phase !== 'buy') return;
  const st = player.state;
  award(winner === 'atk' ? AWARDS.win : AWARDS.loss);
  rounds.endRound(winner, text, sub);
  if (winner === 'atk') audio.win();
  else audio.lose();
  input.exitLock();
  hud.hideBuy();
  hud.hideBanner();
  hud.showEnd(text, `${sub || ''}  Round ${rounds.state.round} goes to ${winner === 'atk' ? 'the attackers' : 'the defenders'}.`, 'Next round');
  game.phase = 'over';
}

function startRound() {
  rounds.startRound();
  bomb.reset();
  player.reset(ATTACKER_SPAWNS[0]);
  bots.spawnRound();
  shootables = map.shootables.concat(bots.hitMeshes());
  liveTimer = ROUND_SECONDS;
  input.exitLock();
  hud.hideBanner();
  hud.showBuy(player.state.money);
  hud.showOverlay('buy', `${rounds.state.scoreAtk} — ${rounds.state.scoreDef}`);
  game.phase = 'buy';
  pushHud();
}

function startLive() {
  rounds.startLive();
  hud.hideBuy();
  hud.hideOverlay();
  game.phase = 'live';
  input.requestLock();
}

function startMatch() {
  rounds.resetMatch();
  weapons.refillAll();
  weapons.owned = [true, false, false];
  player.state.money = 800;
  player.state.grenades = 1;
  startRound();
}

function onLockChange(locked) {
  if (shot) return;
  if (locked) {
    started = true;
    hud.hideOverlay();
    audio.unlock();
  } else if (game.phase === 'live' && player.state.alive) {
    hud.showOverlay('paused');
  }
}

hud.onPlay(() => {
  if (shot) return;
  if (game.phase === 'matchover') {
    startMatch();
    return;
  }
  if (game.phase === 'over') {
    rounds.nextRound();
    if (rounds.state.phase === 'matchover') {
      game.phase = 'matchover';
      input.exitLock();
      hud.showEnd(rounds.state.endText, rounds.state.endSub, 'Play again');
    } else {
      startRound();
    }
    return;
  }
  if (game.phase === 'menu') {
    startMatch();
    return;
  }
  if (game.phase === 'buy') {
    hud.hideOverlay();
    hud.hideBuy();
    input.requestLock();
  } else if (game.phase === 'live') {
    input.requestLock();
  }
});

function buyItem(id) {
  const st = player.state;
  if (game.phase !== 'buy') return;
  if (id === 'rifle' || id === 'smg') {
    const index = id === 'rifle' ? 1 : 2;
    const price = weapons.buy(index, st.money);
    if (price > 0) {
      st.money -= price;
      weapons.select(index);
      audio.reload();
    }
  } else if (id === 'grenade') {
    if (st.grenades < 2 && st.money >= PRICES.grenade) {
      st.money -= PRICES.grenade;
      st.grenades += 1;
    }
  } else if (id === 'armor') {
    if (st.armor < 100 && st.money >= PRICES.armor) {
      st.money -= PRICES.armor;
      st.armor = 100;
    }
  } else if (id === 'ammo') {
    const price = weapons.buyAmmo(st.money);
    if (price > 0) st.money -= price;
  }
  pushHud();
}

hud.onBuy(buyItem);

function playerDied(killerName) {
  player.state.hasBomb = false;
  bomb.drop(new THREE.Vector3(player.body.position.x, 0, player.body.position.z));
  killFeed(`${killerName} ▸ You`);
  input.exitLock();
  hud.showBanner('You are down — your squad fights on', null);
  pushHud();
}

const world = {
  get playerBody() { return player.body; },
  get playerAlive() { return player.state.alive; },
  get playerCrouching() { return player.body.crouching; },
  get bomb() { return bomb.state; },
  onDamagePlayer(amount, fromPos) {
    if (!player.state.alive) return;
    const died = player.damage(amount);
    audio.hurt();
    hud.damageFlash();
    if (died) playerDied('Defender');
    pushHud();
  },
  onKillFeed(text) { killFeed(text); },
  onPlant(siteKey) {
    if (bomb.state.state !== 'carried') return;
    bomb.plant(siteKey);
    award(AWARDS.plant);
    audio.plant();
    killFeed(`Teammate planted the bomb at ${siteKey}`);
    hud.showBanner(`Bomb planted at ${siteKey} — defend it`, null);
    pushHud();
  },
  onDefuse() {
    endRound('def', 'Bomb defused', 'The defenders cut the fuse in time.');
  },
  onBombDropped(pos) {
    bomb.drop(pos);
  },
  onBombPickup(bot) {
    bomb.pickup();
    killFeed(`${bot.name} picked up the bomb`);
  },
};

function shoot(spread) {
  if (!weapons.takeRound()) {
    audio.dry();
    return false;
  }
  camera.getWorldDirection(direction);
  direction.x += (random() * 2 - 1) * spread;
  direction.y += (random() * 2 - 1) * spread;
  direction.z += (random() * 2 - 1) * spread;
  direction.normalize();
  scene.updateMatrixWorld(true);
  raycaster.set(camera.position, direction);
  muzzle.copy(camera.position).addScaledVector(direction, 0.6);
  const hits = raycaster.intersectObjects(shootables, false);
  let end = tmpVec.copy(camera.position).addScaledVector(direction, 60);
  for (const hit of hits) {
    const obj = hit.object;
    if (obj.userData.bot) {
      const bot = obj.userData.bot;
      if (!bot.alive) continue;
      end = hit.point;
      hitPoint.copy(hit.point);
      const killed = bots.damage(obj, weapons.damageFor(obj.userData.part), YOU, world);
      effects.burst(hitPoint, 6, random);
      hud.hitMarker(killed, shot ? 4000 : 120);
      audio.hit();
      if (killed) {
        award(AWARDS.kill);
        audio.kill();
        killFeed(`You ▸ ${bot.name}`);
      }
      break;
    }
    end = hit.point;
    hitPoint.copy(hit.point);
    effects.burst(hitPoint, 5, random);
    break;
  }
  effects.tracer(muzzle, end);
  weapons.pullTrigger();
  player.recoil(weapons.def().kick * (0.8 + random() * 0.4), (random() * 2 - 1) * 0.004);
  bots.hearShot(new THREE.Vector3(player.body.position.x, 0, player.body.position.z), 'atk');
  audio.shot();
  pushHud();
  return true;
}

function throwGrenade() {
  const st = player.state;
  if (st.grenades <= 0 || rounds.state.phase !== 'live') return;
  st.grenades -= 1;
  camera.getWorldDirection(direction);
  const from = new THREE.Vector3(camera.position.x, camera.position.y - 0.1, camera.position.z);
  effects.throwGrenade(from, direction, random);
  pushHud();
}

function blastDamage(point) {
  audio.explosion();
  const radius = 7;
  for (const bot of bots.list) {
    if (!bot.alive) continue;
    const dist = Math.hypot(bot.body.position.x - point.x, bot.body.position.z - point.z);
    if (dist > radius) continue;
    const amount = Math.round(90 * (1 - dist / radius));
    const killed = bots.damage(bot.mesh.torso, amount, YOU, world);
    if (killed) {
      award(AWARDS.kill);
      killFeed(`You ▸ ${bot.name}`);
    }
  }
  const st = player.state;
  if (st.alive) {
    const dist = Math.hypot(player.body.position.x - point.x, player.body.position.z - point.z);
    if (dist < radius) {
      const died = player.damage(Math.round(70 * (1 - dist / radius)));
      hud.damageFlash();
      if (died) playerDied('Frag');
    }
  }
  pushHud();
}

function checkRoundEnd() {
  if (rounds.state.phase !== 'live') return;
  const atkAlive = (player.state.alive ? 1 : 0) + bots.aliveCount('atk');
  const defAlive = bots.aliveCount('def');
  if (bomb.state.state === 'planted') {
    if (defAlive === 0) endRound('atk', 'Site cleared', 'Every defender is down with the bomb ticking.');
    else if (atkAlive === 0) endRound('def', 'Squad eliminated', 'No attacker left to guard the bomb.');
    return;
  }
  if (defAlive === 0) {
    endRound('atk', 'Site cleared', 'Every defender is down.');
  } else if (atkAlive === 0) {
    endRound('def', 'Squad eliminated', 'Every attacker is down.');
  } else if (liveTimer <= 0) {
    endRound('def', 'Time expired', 'The bomb never went off.');
  }
}

function step(dt) {
  elapsed += dt;
  const phase = rounds.state.phase;
  // The clocks only run once the player has clicked in (or in shot mode):
  // before that the buy phase waits on the menu.
  const tickResult = (started || shot) ? rounds.tick(dt) : null;
  if (tickResult === 'live') {
    startLive();
  } else if (tickResult === 'next') {
    rounds.nextRound();
    if (rounds.state.phase === 'matchover') {
      game.phase = 'matchover';
      input.exitLock();
      hud.showEnd(rounds.state.endText, rounds.state.endSub, 'Play again');
    } else {
      startRound();
    }
    return;
  }

  // The player only moves while the pointer is locked (or in shot mode).
  if (input.state.locked || shot) {
    player.step(dt, input.state.keys);
  }

  if (phase === 'live') {
    liveTimer -= dt;
    // Plant / defuse channel for the player.
    const plantResult = bomb.hold(player.body.position, input.state.keys.has('KeyE') && player.state.alive, dt);
    if (plantResult === 'planted') {
      award(AWARDS.plant);
      audio.plant();
      killFeed(`You planted the bomb`);
      hud.showBanner('Bomb planted — defend it', null);
      pushHud();
    } else if (plantResult === 'defused') {
      endRound('def', 'Bomb defused', 'You cut the fuse in time.');
      return;
    }
    const fuseResult = bomb.tick(dt, (fast) => audio.beep(fast));
    if (fuseResult === 'detonated') {
      effects.explode(new THREE.Vector3(bomb.state.pos.x, 1, bomb.state.pos.z), blastDamage);
      endRound('atk', 'Bomb detonated', `Site ${bomb.state.site} is gone.`);
      return;
    }
    // Pick up a dropped bomb by walking over it.
    if (bomb.state.state === 'dropped' && player.state.alive) {
      const bp = bomb.state.pos;
      if (Math.hypot(player.body.position.x - bp.x, player.body.position.z - bp.z) < 1.2) {
        bomb.pickup();
        player.state.hasBomb = true;
        killFeed('You picked up the bomb');
      }
    }
    // Bomb banner progress while channelling.
    if (bomb.state.state === 'carried' && input.state.keys.has('KeyE')) {
      const site = bomb.nearSite(player.body.position);
      if (site) hud.showBanner(`Planting at ${site}…`, bomb.state.plantProgress / 3);
      else hud.hideBanner();
    } else if (bomb.state.state === 'planted') {
      if (bomb.nearBomb(player.body.position) && player.state.alive) {
        hud.showBanner(`Defusing… ${Math.ceil(bomb.state.timer)}s left`, bomb.state.defuseProgress / 5);
      } else {
        hud.showBanner(`Bomb planted — ${Math.ceil(bomb.state.timer)}s`, null);
      }
    } else if (player.state.alive) {
      hud.hideBanner();
    }
  }

  // Bots only walk and fight while the round is live (or in shot mode);
  // the buy phase is freeze time.
  if (phase === 'live' || shot) bots.step(dt, elapsed, world);
  weapons.step(dt);
  effects.step(dt, blastDamage);
  checkRoundEnd();
  pushHud();
}

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min((now - lastTime) / 1000, 0.1);
  lastTime = now;
  if (!frozen) {
    const look = input.takeLook();
    player.look(look.x, look.y);
    const firing = input.state.firing;
    if (firing && weapons.ready() && (weapons.def().auto || !prevFiring)) {
      if (rounds.state.phase === 'live' && player.state.alive) shoot(shot ? 0 : weapons.spread(player.speed()));
    }
    prevFiring = firing;
    if (input.takePressed('KeyR')) weapons.reload();
    if (rounds.state.phase === 'live') {
      if (input.takePressed('Digit1')) weapons.select(0);
      if (input.takePressed('Digit2')) weapons.select(1);
      if (input.takePressed('Digit3')) weapons.select(2);
    }
    if (input.takePressed('KeyG')) throwGrenade();
    if (input.takePressed('KeyB') && rounds.state.phase === 'buy') {
      if (document.pointerLockElement) {
        input.exitLock();
        hud.showBuy(player.state.money);
      } else {
        hud.hideBuy();
        input.requestLock();
      }
    }
    accumulator += dt;
    let steps = 0;
    while (accumulator >= FIXED_STEP && steps < 5) {
      step(FIXED_STEP);
      accumulator -= FIXED_STEP;
      steps += 1;
    }
    if (accumulator > FIXED_STEP * 5) accumulator = 0;
    syncCamera();
  }
  renderer.render(scene, camera);
}

function settle(steps) {
  for (let index = 0; index < steps; index += 1) step(FIXED_STEP);
}

function paintTwiceThenReady() {
  let painted = 0;
  function paint() {
    requestAnimationFrame(paint);
    syncCamera();
    renderer.render(scene, camera);
    painted += 1;
    if (painted === 2) {
      window.__shotReady = true;
      frozen = true;
    }
  }
  requestAnimationFrame(paint);
}

function runShot(name) {
  hud.hideOverlay();
  hud.hideBuy();
  startRoundSilent();
  if (name === 'cover') {
    player.body.position.set(0, 0, 12);
    player.body.yaw = 0.45;
    player.body.pitch = 0.02;
    settle(30);
    hud.showBanner('Round 1 — plant the bomb at A or B', null);
  } else if (name === 'play') {
    player.body.position.set(0, 0, 6);
    settle(20);
    const bot = bots.list[5];
    aimAt(new THREE.Vector3(bot.body.position.x, bot.body.position.y + 1.3, bot.body.position.z));
    for (let round = 0; round < 3; round += 1) {
      shoot(0);
      settle(6);
    }
    hud.hitMarker(false, 4000);
  } else {
    // end: two defenders down, round won, end card up.
    const defs = bots.list.filter((bot) => bot.team === 'def');
    for (const bot of defs) bots.damage(bot.mesh.torso, 500, YOU, world);
    rounds.endRound('atk', 'Site cleared', 'Every defender is down.');
    hud.showEnd('Site cleared', 'Every defender is down. Round 1 goes to the attackers.', 'Next round');
    settle(20);
  }
  pushHud();
  paintTwiceThenReady();
}

function startRoundSilent() {
  rounds.startRound();
  bomb.reset();
  player.reset(ATTACKER_SPAWNS[0]);
  bots.spawnRound();
  shootables = map.shootables.concat(bots.hitMeshes());
  liveTimer = ROUND_SECONDS;
  rounds.startLive();
  game.phase = 'live';
  pushHud();
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// Buy keys 1-5 while the buy menu is open and the pointer is free.
window.addEventListener('keydown', (event) => {
  if (game.phase !== 'buy' || document.pointerLockElement) return;
  const item = { Digit1: 'rifle', Digit2: 'smg', Digit3: 'grenade', Digit4: 'armor', Digit5: 'ammo' }[event.code];
  if (item) buyItem(item);
});

syncCamera();
if (shot) {
  runShot(shot);
} else {
  hud.showOverlay('start');
  hud.showBuy(player.state.money);
  game.phase = 'menu';
  requestAnimationFrame(frame);
}
