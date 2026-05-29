import { safeLoadJSON, safeSaveJSON } from './storage.js';

export const DAILY_MISSIONS_KEY = 'racingDailyMissions';
export const WEEKLY_MISSIONS_KEY = 'racingWeeklyMissions';
export const MISSION_PROGRESS_KEY = 'racingMissionProgress';
export const COINS_KEY = 'racingCoins';

export const missionTemplates = [
  { id: 'daily_finish_3', type: 'daily', difficulty: 'easy', eventName: 'race_finish', title: 'Finish 3 races', description: 'Complete 3 races today.', target: 3, reward: { coins: 100 } },
  { id: 'daily_boost_5', type: 'daily', difficulty: 'easy', eventName: 'boost_used', title: 'Use Boost 5 times', description: 'Use boost 5 times in any mode.', target: 5, reward: { coins: 80 } },
  { id: 'daily_time_trial_1', type: 'daily', difficulty: 'easy', eventName: 'time_trial_played', title: 'Run Time Trial', description: 'Official records are saved in this mode.', target: 1, reward: { coins: 70 } },
  { id: 'daily_no_throttle_limit', type: 'daily', difficulty: 'normal', eventName: 'no_throttle_finish', title: 'No-throttle finish', description: 'Finish without the accelerate key within target time x1.3.', target: 1, reward: { coins: 150 } },
  { id: 'weekly_track_100', type: 'weekly', difficulty: 'hard', eventName: 'same_track_finish', title: 'Finish one map 100 times', description: 'Reduced from 1000 to a realistic 100 finishes.', target: 100, reward: { coins: 650 } },
  { id: 'weekly_drift_300', type: 'weekly', difficulty: 'hard', eventName: 'drift_second', title: 'Drift 300 seconds', description: 'Build total drift time this week.', target: 300, reward: { coins: 500 } },
  { id: 'weekly_boost_100', type: 'weekly', difficulty: 'normal', eventName: 'boost_used', title: 'Use Boost 100 times', description: 'Practice boost timing on every track.', target: 100, reward: { coins: 450 } },
  { id: 'weekly_friendly_1', type: 'weekly', difficulty: 'easy', eventName: 'friendly_room_created', title: 'Create a friendly room', description: 'Invite a friend to a room.', target: 1, reward: { coins: 120 } },
];

export function generateDailyMissions() {
  return seedMissions(DAILY_MISSIONS_KEY, 'daily', todayKey(), 3);
}

export function generateWeeklyMissions() {
  return seedMissions(WEEKLY_MISSIONS_KEY, 'weekly', weekKey(), 3);
}

export function getMissions() {
  return [...generateDailyMissions().missions, ...generateWeeklyMissions().missions];
}

export function updateMissionProgress(eventName, amount = 1) {
  const progress = safeLoadJSON(MISSION_PROGRESS_KEY, {});
  for (const mission of getMissions()) {
    if (mission.eventName !== eventName || mission.claimed) continue;
    progress[mission.id] = Math.min(mission.target, Number(progress[mission.id] || 0) + amount);
  }
  safeSaveJSON(MISSION_PROGRESS_KEY, progress);
  window.dispatchEvent(new CustomEvent('racing:missionsChange', { detail: progress }));
  return progress;
}

export function claimMissionReward(missionId) {
  const daily = generateDailyMissions();
  const weekly = generateWeeklyMissions();
  const progress = safeLoadJSON(MISSION_PROGRESS_KEY, {});
  const all = [...daily.missions, ...weekly.missions];
  const mission = all.find(item => item.id === missionId);
  if (!mission || mission.claimed || Number(progress[mission.id] || 0) < mission.target) return false;
  mission.claimed = true;
  const coins = Number(localStorage.getItem(COINS_KEY) || 0) + Number(mission.reward?.coins || 0);
  localStorage.setItem(COINS_KEY, String(coins));
  safeSaveJSON(daily.key, daily);
  safeSaveJSON(weekly.key, weekly);
  window.dispatchEvent(new CustomEvent('racing:missionsChange'));
  return true;
}

export function renderMissionPanel(target = document.getElementById('mission-panel')) {
  if (!target) return;
  const progress = safeLoadJSON(MISSION_PROGRESS_KEY, {});
  const missions = getMissions().slice(0, 4);
  target.innerHTML = `
    <div class="mission-panel-head ui-panel-title-row">
      <div><span class="ui-kicker">Goals</span><h2 class="ui-section-title">Daily <span class="ui-highlight-goal">Missions</span></h2></div>
      <b class="ui-highlight-goal">${Number(localStorage.getItem(COINS_KEY) || 0).toLocaleString()} coins</b>
    </div>
    <div class="mission-list">
      ${missions.map(mission => {
        const value = Math.min(mission.target, Number(progress[mission.id] || 0));
        const done = value >= mission.target;
        return `<button class="mission-row ${done ? 'complete' : ''}" data-mission-claim="${mission.id}" type="button">
          <span><b>${escapeHtml(mission.title)}</b><small>${escapeHtml(mission.description)}</small></span>
          <em class="mission-difficulty mission-difficulty-${escapeHtml(mission.difficulty || 'easy')}">${escapeHtml(mission.difficulty || 'easy')}</em>
          <em>${value}/${mission.target}</em>
          <i style="--mission-progress:${(value / mission.target) * 100}%"></i>
          <strong>${mission.claimed ? 'Claimed' : done ? 'Claim' : `${mission.reward.coins}c`}</strong>
        </button>`;
      }).join('')}
    </div>
  `;
  target.querySelectorAll('[data-mission-claim]').forEach(btn => {
    btn.addEventListener('click', () => {
      if (claimMissionReward(btn.dataset.missionClaim)) renderMissionPanel(target);
    });
  });
}

function seedMissions(key, type, stamp, count) {
  const saved = safeLoadJSON(key, null);
  if (saved?.stamp === stamp && Array.isArray(saved.missions)) return { ...saved, key };
  const missions = missionTemplates.filter(item => item.type === type).slice(0, count).map(item => ({ ...item, claimed: false }));
  const next = { stamp, missions };
  safeSaveJSON(key, next);
  return { ...next, key };
}

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

function weekKey() {
  const now = new Date();
  const oneJan = new Date(now.getFullYear(), 0, 1);
  return `${now.getFullYear()}-W${Math.ceil((((now - oneJan) / 86400000) + oneJan.getDay() + 1) / 7)}`;
}

function escapeHtml(text) {
  return String(text || '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}
