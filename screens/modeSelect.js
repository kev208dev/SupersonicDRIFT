import { getRating, renderRatingBadge } from '../js/rating.js';

let onSelect = null;
let onBack = null;

export const gameModes = [
  {
    id: 'ranked',
    title: 'Ranked Mode',
    description: 'Beta matchmaking with local rating feedback. Official time records are not saved here.',
    affectsRating: true,
    leaderboardType: 'ranked',
    badge: 'Rating Beta',
  },
  {
    id: 'timeTrial',
    title: 'Time Trial',
    description: 'Race solo, beat map times, and save official leaderboard records.',
    affectsRating: false,
    leaderboardType: 'time',
    badge: 'Official Records',
  },
  {
    id: 'friendly',
    title: 'Friendly Room',
    description: 'Create or join a room with friends. Results do not affect official records.',
    affectsRating: false,
    leaderboardType: 'friendly',
    badge: 'Private Room',
  },
];

export function initModeSelect(cb, backCb) {
  onSelect = cb;
  onBack = backCb;
  renderGameModeCards();
}

export function renderGameModeCards() {
  const grid = document.getElementById('game-mode-grid') || document.querySelector('#screen-modeselect .mode-grid');
  const header = document.querySelector('#screen-modeselect .screen-header h1');
  const subtitle = document.querySelector('#screen-modeselect .screen-header .subtitle');
  if (header) header.textContent = 'Game Mode Select';
  if (subtitle) subtitle.textContent = 'Choose ranked, time trial, or friendly racing.';
  if (!grid) return;

  grid.id = 'game-mode-grid';
  grid.classList.add('game-mode-grid');
  grid.innerHTML = gameModes.map(mode => `
    <button class="mode-card game-mode-card" data-mode-id="${mode.id}" type="button">
      <span class="ui-kicker">${mode.badge}</span>
      <b>${mode.title}</b>
      <span>${mode.description}</span>
      <em>${mode.affectsRating ? renderRatingBadge(getRating()) : mode.badge}</em>
    </button>
  `).join('');

  wireModeSelect();
}

function wireModeSelect() {
  const back = document.getElementById('btn-back-mode-skin');
  document.querySelectorAll('[data-mode-id]').forEach(card => {
    card.onclick = () => onSelect?.(card.dataset.modeId);
  });
  if (back) back.onclick = () => onBack?.();
}
