// Weapons: three guns and the numbers that make them feel different. Each gun
// owns its magazine, reserve, fire gap, reload time and spread curve; the view
// model, muzzle flash and kick are per gun too. main.js owns the ray and the
// damage; this module owns the trigger.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

export const WEAPONS = [
  {
    id: 'pistol', name: 'P9 Sidearm', price: 0, auto: false,
    mag: 12, reserve: 48, damage: 34, headMult: 2.5,
    gap: 0.16, reload: 1.2, spreadStill: 0.004, spreadMove: 0.03, kick: 0.011,
  },
  {
    id: 'rifle', name: 'VK-7 Ember', price: 2700, auto: true,
    mag: 30, reserve: 90, damage: 34, headMult: 4,
    gap: 0.1, reload: 2.0, spreadStill: 0.002, spreadMove: 0.032, kick: 0.016,
  },
  {
    id: 'smg', name: 'Wasp-9', price: 1500, auto: true,
    mag: 32, reserve: 96, damage: 26, headMult: 2.5,
    gap: 0.07, reload: 1.7, spreadStill: 0.006, spreadMove: 0.024, kick: 0.009,
  },
];

const MUZZLE_TIME = 0.06;
const MOVE_REFERENCE = 5.2;

export function createWeapons(camera) {
  const gripMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.steel), roughness: 0.6, metalness: 0.35 });
  const bodyMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.ink), roughness: 0.45, metalness: 0.4 });
  const accentMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.accent), roughness: 0.5, metalness: 0.3 });

  function buildModel(def) {
    const model = new THREE.Group();
    if (def.id === 'pistol') {
      const slide = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.06, 0.22), bodyMat);
      const grip = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.12, 0.06), gripMat);
      grip.position.set(0, -0.07, 0.07);
      model.add(slide, grip);
    } else if (def.id === 'rifle') {
      const receiver = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.1, 0.42), bodyMat);
      const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.045, 0.4), gripMat);
      barrel.position.set(0, 0.025, -0.38);
      const scope = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.14), accentMat);
      scope.position.set(0, 0.08, -0.05);
      const stock = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.08, 0.22), gripMat);
      stock.position.set(0, -0.02, 0.3);
      model.add(receiver, barrel, scope, stock);
    } else {
      const body = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.09, 0.3), bodyMat);
      const suppressor = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.2, 10), gripMat);
      suppressor.rotation.x = Math.PI / 2;
      suppressor.position.set(0, 0.01, -0.24);
      const mag = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.16, 0.05), gripMat);
      mag.position.set(0, -0.1, 0.02);
      model.add(body, suppressor, mag);
    }
    model.position.set(0.24, -0.2, -0.42);
    model.visible = false;
    camera.add(model);
    return model;
  }

  const flash = new THREE.Mesh(
    new THREE.PlaneGeometry(0.24, 0.24),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.accent), transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide }),
  );
  flash.position.set(0.24, -0.18, -0.95);
  flash.visible = false;
  camera.add(flash);
  const flashLight = new THREE.PointLight(new THREE.Color(PALETTE.accent), 0, 5);
  flashLight.position.set(0.24, -0.16, -0.6);
  camera.add(flashLight);

  const models = WEAPONS.map(buildModel);
  const states = WEAPONS.map((def) => ({
    mag: def.mag, reserve: def.reserve, cooldown: 0, reloadLeft: 0, flash: 0, kick: 0,
  }));
  let current = 0;
  models[0].visible = true;

  function def() { return WEAPONS[current]; }
  function st() { return states[current]; }

  function step(dt) {
    const s = st();
    s.cooldown = Math.max(0, s.cooldown - dt);
    s.flash = Math.max(0, s.flash - dt);
    s.kick += (0 - s.kick) * Math.min(1, dt * 14);
    const model = models[current];
    model.position.z = -0.42 + s.kick;
    model.rotation.x = s.kick * 2.2;
    flash.visible = s.flash > 0;
    flash.rotation.z = s.flash * 30;
    flashLight.intensity = s.flash > 0 ? 18 : 0;
    if (s.reloadLeft > 0) {
      s.reloadLeft = Math.max(0, s.reloadLeft - dt);
      model.rotation.x = -0.55 * Math.min(1, (def().reload - s.reloadLeft) * 2);
      if (s.reloadLeft === 0) {
        const need = def().mag - s.mag;
        const take = Math.min(need, s.reserve);
        s.mag += take;
        s.reserve -= take;
      }
    }
  }

  return {
    current() { return current; },
    def,
    state() { return st(); },
    step,
    owned: [true, false, false],
    select(index) {
      if (index === current || !this.owned[index] || st().reloadLeft > 0) return false;
      models[current].visible = false;
      current = index;
      models[current].visible = true;
      st().cooldown = Math.max(st().cooldown, 0.25);
      return true;
    },
    buy(index, money) {
      if (this.owned[index] || money < WEAPONS[index].price) return -1;
      this.owned[index] = true;
      return WEAPONS[index].price;
    },
    buyAmmo(money) {
      const s = st();
      if (s.reserve >= def().reserve * 2 || money < 150) return -1;
      s.reserve += def().mag * 2;
      return 150;
    },
    ready() {
      const s = st();
      return s.mag > 0 && s.cooldown === 0 && s.reloadLeft === 0;
    },
    pullTrigger() {
      const s = st();
      s.cooldown = def().gap;
      s.flash = MUZZLE_TIME;
      s.kick = 0.055;
    },
    takeRound() {
      const s = st();
      if (s.mag <= 0) return false;
      s.mag -= 1;
      return true;
    },
    reload() {
      const s = st();
      if (s.reloadLeft > 0 || s.mag === def().mag || s.reserve === 0) return;
      s.reloadLeft = def().reload;
    },
    spread(speed) {
      return def().spreadStill + Math.min(1, speed / MOVE_REFERENCE) * def().spreadMove;
    },
    damageFor(part) {
      return part === 'head' ? def().damage * def().headMult : def().damage;
    },
    refillAll() {
      for (let i = 0; i < WEAPONS.length; i += 1) {
        states[i].mag = WEAPONS[i].mag;
        states[i].reserve = WEAPONS[i].reserve;
        states[i].cooldown = 0;
        states[i].reloadLeft = 0;
        states[i].flash = 0;
        states[i].kick = 0;
      }
    },
  };
}
