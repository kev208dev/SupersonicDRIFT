import { safeLoadJSON, safeSaveJSON } from './storage.js';
import { getRating, getRankTier } from './rating.js';
import { hasClearedAllTracksUnderTarget } from './trackProgress.js';

export const UNLOCKS_KEY = 'racingUnlocks';

export const unlockables = {
  cars: [
    { id: 'apex_gt3', name: 'Apex GT3', unlocked: true, unlockCondition: 'Default car' },
    { id: 'nitro_street', name: 'Nitro Street', unlocked: false, unlockCondition: 'Finish 10 races' },
    { id: 'shadow_rs', name: 'Shadow RS', unlocked: false, unlockCondition: 'Drift for 300 total seconds' },
    { id: 'zero_f1', name: 'Zero F1-X', unlocked: false, unlockCondition: 'Reach Gold rank' },
    { id: 'singularity_vmax', name: 'Singularity VMAX', unlocked: false, unlockCondition: 'Clear every map under target time' },
    { id: 'grip_oracle', name: 'Grip Oracle', unlocked: false, unlockCondition: 'Clear every map under target time and drift 600 seconds' },
    { id: 'boost_phoenix', name: 'Boost Phoenix', unlocked: false, unlockCondition: 'Clear every map under target time and use boost 500 times' },
  ],
  skins: [
    { id: 'default', name: 'Default', unlocked: true, unlockCondition: 'Default skin' },
    { id: 'neon_red', name: 'Neon Red', unlocked: false, unlockCondition: 'Claim 3 daily missions' },
    { id: 'carbon_black', name: 'Carbon Black', unlocked: false, unlockCondition: 'Win 3 ranked races' },
  ],
};

export function getUnlockState() {
  const saved = safeLoadJSON(UNLOCKS_KEY, { cars: ['apex_gt3', 'feather_sprint'], skins: ['default'] });
  return {
    cars: Array.isArray(saved.cars) ? [...new Set(['apex_gt3', 'feather_sprint', ...saved.cars.filter(id => id !== 'gt3_basic')])] : ['apex_gt3', 'feather_sprint'],
    skins: Array.isArray(saved.skins) ? saved.skins : ['default'],
  };
}

export function saveUnlockState(state) {
  safeSaveJSON(UNLOCKS_KEY, state);
  window.dispatchEvent(new CustomEvent('racing:unlocksChange', { detail: state }));
  return state;
}

export function checkUnlockConditions(stats = {}) {
  const state = getUnlockState();
  const tier = getRankTier(getRating()).name;
  if ((stats.finishedRaces || 0) >= 10) unlockItem('cars', 'nitro_street', state);
  if ((stats.driftSeconds || 0) >= 300) unlockItem('cars', 'shadow_rs', state);
  if (['Gold', 'Platinum', 'Diamond', 'Master'].includes(tier)) unlockItem('cars', 'zero_f1', state);
  if (hasClearedAllTracksUnderTarget()) unlockItem('cars', 'singularity_vmax', state);
  if (hasClearedAllTracksUnderTarget() && (stats.driftSeconds || 0) >= 600) unlockItem('cars', 'grip_oracle', state);
  if (hasClearedAllTracksUnderTarget() && (stats.boostUses || 0) >= 500) unlockItem('cars', 'boost_phoenix', state);
  if ((stats.claimedDailyMissions || 0) >= 3) unlockItem('skins', 'neon_red', state);
  if ((stats.rankedWins || 0) >= 3) unlockItem('skins', 'carbon_black', state);
  return saveUnlockState(state);
}

export function unlockItem(type, id, state = getUnlockState()) {
  const key = type === 'skins' ? 'skins' : 'cars';
  if (!state[key].includes(id)) state[key].push(id);
  saveUnlockState(state);
  return state;
}

export function renderGarage(target = document.getElementById('garage-panel')) {
  if (!target) return;
  const state = getUnlockState();
  target.innerHTML = `
    <h2>Garage</h2>
    <div class="garage-unlocks">
      ${renderItems('cars', state)}
      ${renderItems('skins', state)}
    </div>
  `;
}

export function selectCar(carId) {
  localStorage.setItem('racingSelectedCar', carId);
}

export function selectSkin(skinId) {
  localStorage.setItem('racingSelectedSkin', skinId);
}

function renderItems(type, state) {
  return `<section><h3>${type === 'cars' ? 'Cars' : 'Skins'}</h3>${unlockables[type].map(item => {
    const unlocked = state[type].includes(item.id) || item.unlocked;
    return `<button class="garage-unlock ${unlocked ? '' : 'locked'}" type="button" title="${escapeHtml(item.unlockCondition || '')}">
      <b>${escapeHtml(item.name)}</b><span>${unlocked ? 'Unlocked' : `Unlock by: ${escapeHtml(item.unlockCondition)}`}</span>
    </button>`;
  }).join('')}</section>`;
}

function escapeHtml(text) {
  return String(text || '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}
