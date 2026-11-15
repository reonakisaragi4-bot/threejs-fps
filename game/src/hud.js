// The DOM HUD: crosshair, hit marker, health, ammo, money, timer, score,
// alive counts, kill feed, bomb banner and the buy menu. It never touches the
// simulation; main.js pushes numbers in and reads callbacks out.
import { WEAPONS } from './weapons.js';
import { PRICES } from './rounds.js';

const OVERLAY_COPY = {
  start: { title: 'Ember Yard', copy: 'A dusk yard, two bomb sites, one fuse. Plant the bomb or clear the defenders. Click to play.', action: 'Click to play' },
  paused: { title: 'Ember Yard', copy: 'Paused. Click to resume.', action: 'Click to resume' },
  buy: { title: 'Buy phase', copy: 'Spend your money before the round starts.', action: 'Click to play' },
};

export function createHud() {
  const $ = (id) => document.getElementById(id);
  const overlay = $('overlay');
  const title = $('overlay-title');
  const copy = $('overlay-copy');
  const play = $('play');
  const ammoMag = $('ammo-mag');
  const ammoReserve = $('ammo-reserve');
  const weaponName = $('weapon-name');
  const healthFill = $('health-fill');
  const healthNum = $('health-num');
  const armorRow = $('armor-row');
  const moneyValue = $('money-value');
  const timerValue = $('timer-value');
  const scoreValue = $('score-value');
  const aliveAtk = $('alive-atk');
  const aliveDef = $('alive-def');
  const feed = $('feed');
  const banner = $('banner');
  const bannerText = $('banner-text');
  const bannerFill = $('banner-fill');
  const crosshair = $('crosshair');
  const hitmarker = $('hitmarker');
  const vignette = $('vignette');
  const buyMenu = $('buy-menu');
  const buyMoney = $('buy-money');
  const buyList = $('buy-list');
  const grenadeCount = $('grenade-count');

  let hitTimer = 0;
  let last = { mag: -1, reserve: -1, weapon: '', health: -1, armor: -1, money: -1, timer: '', score: '', atk: -1, def: -1, grenades: -1 };
  let buyHandler = null;
  let playHandler = null;

  function buildBuyMenu() {
    const items = [
      { key: '1', id: 'rifle', label: 'VK-7 Ember rifle', price: PRICES.rifle },
      { key: '2', id: 'smg', label: 'Wasp-9 SMG', price: PRICES.smg },
      { key: '3', id: 'grenade', label: 'Frag grenade', price: PRICES.grenade },
      { key: '4', id: 'armor', label: 'Kevlar armor', price: PRICES.armor },
      { key: '5', id: 'ammo', label: 'Refill reserve ammo', price: PRICES.ammo },
    ];
    buyList.innerHTML = '';
    for (const item of items) {
      const row = document.createElement('button');
      row.type = 'button';
      row.className = 'buy-row';
      row.dataset.id = item.id;
      row.innerHTML = `<span><kbd>${item.key}</kbd> ${item.label}</span><b>$${item.price}</b>`;
      row.addEventListener('click', () => { if (buyHandler) buyHandler(item.id); });
      buyList.appendChild(row);
    }
  }
  buildBuyMenu();

  return {
    setAmmo(mag, reserve, weapon) {
      if (mag === last.mag && reserve === last.reserve && weapon === last.weapon) return;
      last.mag = mag;
      last.reserve = reserve;
      last.weapon = weapon;
      ammoMag.textContent = String(mag);
      ammoReserve.textContent = `/ ${reserve}`;
      weaponName.textContent = weapon;
      $('ammo').classList.toggle('empty', mag === 0);
    },
    setHealth(health, armor) {
      if (health === last.health && armor === last.armor) return;
      last.health = health;
      last.armor = armor;
      healthFill.style.width = `${health}%`;
      healthNum.textContent = String(health);
      armorRow.textContent = armor > 0 ? `Armor ${armor}` : '';
      healthFill.classList.toggle('low', health <= 30);
    },
    setMoney(money) {
      if (money === last.money) return;
      last.money = money;
      moneyValue.textContent = `$${money}`;
      buyMoney.textContent = `$${money}`;
    },
    setTimer(seconds, phase) {
      const text = phase === 'buy' ? `BUY ${Math.ceil(seconds)}` : `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;
      if (text === last.timer) return;
      last.timer = text;
      timerValue.textContent = text;
      timerValue.classList.toggle('buy', phase === 'buy');
    },
    setScore(atk, def) {
      const text = `ATK ${atk} — ${def} DEF`;
      if (text === last.score) return;
      last.score = text;
      scoreValue.textContent = text;
    },
    setAlive(atk, def) {
      if (atk === last.atk && def === last.def) return;
      last.atk = atk;
      last.def = def;
      aliveAtk.textContent = `ATK ${atk} alive`;
      aliveDef.textContent = `DEF ${def} alive`;
    },
    setGrenades(n) {
      if (n === last.grenades) return;
      last.grenades = n;
      grenadeCount.textContent = n > 0 ? `◉ ${n} frag` : '';
    },
    setCrosshair(spreadPx) {
      crosshair.style.setProperty('--gap', `${Math.round(4 + spreadPx)}px`);
    },
    hitMarker(killed, holdMs = 90) {
      hitmarker.classList.add('on');
      if (killed) hitmarker.classList.add('kill');
      clearTimeout(hitTimer);
      hitTimer = setTimeout(() => hitmarker.classList.remove('on', 'kill'), holdMs);
    },
    damageFlash() {
      vignette.classList.add('on');
      setTimeout(() => vignette.classList.remove('on'), 180);
    },
    killFeed(text) {
      const row = document.createElement('div');
      row.className = 'feed-row';
      row.textContent = text;
      feed.prepend(row);
      while (feed.children.length > 4) feed.removeChild(feed.lastChild);
      setTimeout(() => { if (row.parentNode) row.parentNode.removeChild(row); }, 5000);
    },
    showBanner(text, progress) {
      banner.hidden = false;
      bannerText.textContent = text;
      bannerFill.style.width = progress == null ? '0%' : `${Math.round(progress * 100)}%`;
    },
    hideBanner() {
      banner.hidden = true;
    },
    showBuy(money) {
      buyMenu.hidden = false;
      buyMoney.textContent = `$${money}`;
    },
    hideBuy() {
      buyMenu.hidden = true;
    },
    onBuy(handler) { buyHandler = handler; },
    showOverlay(mode, scoreText) {
      const text = OVERLAY_COPY[mode] || OVERLAY_COPY.start;
      title.textContent = text.title;
      copy.textContent = mode === 'buy' ? `${text.copy} ${scoreText || ''}` : text.copy;
      play.textContent = text.action;
      overlay.hidden = false;
      play.focus();
    },
    showEnd(titleText, copyText, actionText) {
      title.textContent = titleText;
      copy.textContent = copyText;
      play.textContent = actionText;
      overlay.hidden = false;
      play.focus();
    },
    hideOverlay() {
      overlay.hidden = true;
    },
    onPlay(handler) {
      playHandler = handler;
      play.addEventListener('click', () => { if (playHandler) playHandler(); });
    },
    setBuyEnabled(canAfford) {
      for (const row of buyList.querySelectorAll('.buy-row')) {
        const price = PRICES[row.dataset.id];
        row.classList.toggle('poor', price > canAfford);
      }
    },
  };
}
