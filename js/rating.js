import { safeLoadJSON, safeSaveJSON } from './storage.js';

export const RATING_KEY = 'racingRating';
const DEFAULT_RATING = 1000;

export function getRating() {
  const value = Number(safeLoadJSON(RATING_KEY, DEFAULT_RATING));
  return Number.isFinite(value) ? value : DEFAULT_RATING;
}

export function saveRating(value) {
  const rating = Math.max(0, Math.round(Number(value) || DEFAULT_RATING));
  safeSaveJSON(RATING_KEY, rating);
  window.dispatchEvent(new CustomEvent('racing:ratingChange', { detail: rating }));
  return rating;
}

export function calculateRatingChange(result = {}) {
  if (result.mode !== 'ranked') return 0;
  if (result.dnf || result.leftEarly) return result.leftEarly ? -25 : -15;
  const placement = Number(result.placement || result.finishRank || 1);
  if (placement <= 1) return 25;
  if (placement === 2) return Math.max(5, Number(result.playerCount || 2) > 2 ? 10 : 5);
  return -8;
}

export function getRankTier(rating = getRating()) {
  const value = Number(rating) || 0;
  const tiers = [
    ['Master', 1800], ['Diamond', 1600], ['Platinum', 1400],
    ['Gold', 1200], ['Silver', 1000], ['Bronze', 0],
  ];
  const [name] = tiers.find(([, min]) => value >= min) || tiers[tiers.length - 1];
  const division = Math.max(1, 3 - Math.floor((value % 200) / 67));
  return { name, division, label: `${name} ${name === 'Master' ? '' : division}`.trim() };
}

export function renderRatingBadge(rating = getRating()) {
  const tier = getRankTier(rating);
  return `<span class="rating-badge tier-${tier.name.toLowerCase()}">Rating ${rating} · ${tier.label}</span>`;
}

export function applyRankedResult(result = {}) {
  const oldRating = getRating();
  const ratingChange = calculateRatingChange(result);
  const newRating = saveRating(oldRating + ratingChange);
  return { ...result, oldRating, ratingBefore: oldRating, ratingChange, newRating, ratingAfter: newRating };
}
