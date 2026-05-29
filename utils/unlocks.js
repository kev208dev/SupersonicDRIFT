import { getCurrentUser } from './auth.js';
import { getProfile, isOwned } from './profile.js';
import { hasClearedAllTracksUnderTarget } from '../js/trackProgress.js';

export function isCarUnlocked(car) {
  if (!car) return false;
  if (car.price === 0 && car.tier !== 'transcend') return true;
  if (car.tier === 'transcend') return isOwned(car.id) || meetsTranscendUnlockCondition(car.id);
  return isOwned(car.id);
}

export function unlockText(car) {
  if (!car) return '';
  if (isCarUnlocked(car)) return 'Owned';
  if (car.tier === 'transcend') return transcendUnlockText(car.id);
  if (!getCurrentUser()) return 'Login to buy with coins.';
  if (Number(car.price || 0) <= 0) return 'Free unlock';
  return `${Number(car.price || 0).toLocaleString()} coins`;
}

export function unlockProgressText(car) {
  if (!car) return '';
  const profile = getProfile();
  if (isCarUnlocked(car)) return 'Ready to use.';
  if (car.tier === 'transcend') return transcendUnlockText(car.id);
  if (!getCurrentUser()) return 'Guests can use starter cars only.';
  const price = Number(car.price || 0);
  if (price <= 0) return 'Use the unlock button to claim it.';
  const coins = Number(profile?.coins || 0);
  if (coins >= price) return `Can buy now - you have ${coins.toLocaleString()} coins.`;
  return `${Math.max(0, price - coins).toLocaleString()} coins needed.`;
}

export function meetsTranscendUnlockCondition(carId) {
  const allTargets = hasClearedAllTracksUnderTarget();
  const profile = getProfile() || {};
  const driftSeconds = Number(profile.stats?.driftSeconds || profile.driftSeconds || 0);
  const boostUses = Number(profile.stats?.boostUses || profile.boostUses || 0);
  if (carId === 'singularity_vmax') return allTargets;
  if (carId === 'grip_oracle') return allTargets && driftSeconds >= 600;
  if (carId === 'boost_phoenix') return allTargets && boostUses >= 500;
  return false;
}

function transcendUnlockText(carId) {
  if (carId === 'singularity_vmax') return 'Clear every map under target time.';
  if (carId === 'grip_oracle') return 'Clear every map under target time and drift 600 seconds.';
  if (carId === 'boost_phoenix') return 'Clear every map under target time and use boost 500 times.';
  return 'Complete transcend challenge.';
}
