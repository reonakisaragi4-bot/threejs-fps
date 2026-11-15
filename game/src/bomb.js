// The bomb: one state for the whole match. The player carries it at the start
// of every round; planting takes a 3 s hold inside a site, then a 40 s fuse
// ticks down with beeps that get faster. Defusing takes a 5 s hold beside it.
// If the carrier dies the bomb drops where they fell, and any attacker who
// walks over it picks it up.
import * as THREE from 'three';
import { SITES } from './map.js';

export const PLANT_TIME = 3;
export const DEFUSE_TIME = 5;
export const FUSE_TIME = 40;

export function createBomb() {
  const bomb = {
    state: 'carried', // carried | dropped | planted | gone
    site: null,
    pos: new THREE.Vector3(),
    timer: 0,
    plantProgress: 0,
    defuseProgress: 0,
    beepAt: 0,
  };

  return {
    state: bomb,
    reset() {
      bomb.state = 'carried';
      bomb.site = null;
      bomb.timer = 0;
      bomb.plantProgress = 0;
      bomb.defuseProgress = 0;
      bomb.beepAt = 0;
    },
    drop(pos) {
      if (bomb.state !== 'carried') return;
      bomb.state = 'dropped';
      bomb.pos.copy(pos);
      bomb.plantProgress = 0;
      bomb.defuseProgress = 0;
    },
    pickup() {
      if (bomb.state !== 'dropped') return;
      bomb.state = 'carried';
      bomb.plantProgress = 0;
    },
    plant(siteKey) {
      bomb.state = 'planted';
      bomb.site = siteKey;
      bomb.timer = FUSE_TIME;
      bomb.plantProgress = 0;
      bomb.defuseProgress = 0;
      bomb.beepAt = 0;
      const site = SITES[siteKey];
      bomb.pos.set(site.x, 0, site.z);
    },
    nearSite(pos) {
      for (const key of ['A', 'B']) {
        const site = SITES[key];
        if (Math.hypot(pos.x - site.x, pos.z - site.z) < site.radius) return key;
      }
      return null;
    },
    nearBomb(pos) {
      if (bomb.state !== 'planted') return false;
      return Math.hypot(pos.x - bomb.pos.x, pos.z - bomb.pos.z) < 2.5;
    },
    // The player holding E: returns 'planted' when the channel completes,
    // 'defused' when the defuse completes, else null. Call every fixed step.
    hold(playerPos, holding, dt) {
      if (!holding) {
        bomb.plantProgress = 0;
        bomb.defuseProgress = 0;
        return null;
      }
      if (bomb.state === 'carried') {
        const site = this.nearSite(playerPos);
        if (!site) {
          bomb.plantProgress = 0;
          return null;
        }
        bomb.plantProgress += dt;
        if (bomb.plantProgress >= PLANT_TIME) {
          this.plant(site);
          return 'planted';
        }
        return null;
      }
      if (bomb.state === 'planted' && this.nearBomb(playerPos)) {
        bomb.defuseProgress += dt;
        if (bomb.defuseProgress >= DEFUSE_TIME) {
          bomb.state = 'gone';
          bomb.defuseProgress = 0;
          return 'defused';
        }
      }
      return null;
    },
    // Fuse countdown; returns 'detonated' when it reaches zero, else null.
    // The beep interval shrinks as the fuse runs down.
    tick(dt, onBeep) {
      if (bomb.state !== 'planted') return null;
      bomb.timer -= dt;
      const interval = bomb.timer > 20 ? 1 : bomb.timer > 10 ? 0.5 : 0.25;
      if (bomb.timer <= bomb.beepAt) {
        bomb.beepAt = bomb.timer - interval;
        if (onBeep) onBeep(bomb.timer <= 10);
      }
      if (bomb.timer <= 0) {
        bomb.state = 'gone';
        return 'detonated';
      }
      return null;
    },
  };
}
