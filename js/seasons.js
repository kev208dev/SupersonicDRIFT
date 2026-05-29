import { safeLoadJSON } from './storage.js';
import { getLocalLeaderboardRecords } from '../utils/leaderboard.js';

export const currentSeason = {
  id: 'season_1',
  name: 'Season 1: Neon Rush',
  startsAt: '2026-01-01T00:00:00.000Z',
  endsAt: '2026-01-31T23:59:59.999Z',
  themeColor: '#7c3aed',
  rewardPreview: ['Neon Frame', 'Flame Sticker', 'Season Badge'],
};

export function getCurrentSeason() {
  return safeLoadJSON('racingCurrentSeason', currentSeason);
}

export function getSeasonRemainingText(season = getCurrentSeason()) {
  const end = Date.parse(season.endsAt);
  if (!Number.isFinite(end)) return 'Season active';
  const ms = end - Date.now();
  if (ms <= 0) return 'Season ended';
  const days = Math.ceil(ms / 86400000);
  return `Ends in ${days} day${days === 1 ? '' : 's'}`;
}

export function isRecordInCurrentSeason(record, season = getCurrentSeason()) {
  const t = Date.parse(record?.completedAt || record?.createdAt || 0);
  const start = Date.parse(season.startsAt);
  const end = Date.parse(season.endsAt);
  if (!Number.isFinite(t) || !Number.isFinite(start) || !Number.isFinite(end)) return false;
  return t >= start && t <= end;
}

export async function fetchSeasonLeaderboard(mode = 'ranked', limit = 20) {
  const rows = getLocalLeaderboardRecords({ type: 'allTime', mode, limit: 200 })
    .filter(row => isRecordInCurrentSeason(row))
    .slice(0, limit)
    .map((row, index) => ({ ...row, rank: index + 1 }));
  return { leaderboard: rows };
}

export function renderSeasonPanel(target = document.getElementById('season-panel')) {
  if (!target) return;
  const season = getCurrentSeason();
  target.innerHTML = `
    <div class="season-panel-inner season-card ui-card" style="--season-color:${escapeHtml(season.themeColor)}">
      <div class="ui-panel-title-row">
        <div>
          <span class="ui-kicker">Season</span>
          <h2 class="ui-section-title"><span class="ui-highlight-season">${escapeHtml(season.name.split(':')[0])}</span>: ${escapeHtml(season.name.split(':').slice(1).join(':').trim() || 'Neon Rush')}</h2>
        </div>
        <span class="ui-badge-important">ACTIVE</span>
      </div>
      <p class="ui-muted">${escapeHtml(getSeasonRemainingText(season))} - Earn seasonal rewards by racing.</p>
      <div>${season.rewardPreview.map(item => `<b class="ui-highlight-goal">${escapeHtml(item)}</b>`).join('')}</div>
    </div>
  `;
}

function escapeHtml(text) {
  return String(text || '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}
