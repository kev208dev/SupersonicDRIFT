import { formatTime } from '../utils/math.js';
import {
  fetchLeaderboard,
  getGuestNickname,
  getPlayerProfile,
  submitResultRecord,
  subscribeLeaderboard,
} from '../utils/leaderboard.js';
import { awardRankOneSkin } from '../utils/profile.js';
import { getBestLap } from '../utils/storage.js';
import { showBannerAd, showRewardedAd } from '../js/ads.js';
import { trackEvent } from '../js/analytics.js';
import { shareResult } from '../js/share.js';

let unsubscribeLeaderboard = null;
let renderToken = 0;
let currentResult = null;
let resultSubmitted = false;

export function initResults(data, car, track, raceOptions = {}, retryCb, menuCb) {
  cleanupLeaderboard();
  const token = ++renderToken;
  const mode = normalizeMode(raceOptions.mode);
  const score = scoreFromLap(data?.lapMs);
  resultSubmitted = false;

  currentResult = {
    nickname: getPlayerProfile().name || getGuestNickname(),
    mode,
    finishTime: Math.round(Number(data?.lapMs || 0)),
    score,
    ratingChange: mode === 'ranked' ? Math.max(1, Math.round(score / 10000)) : 0,
    track,
    car,
    sectors: data?.sectors || [],
    completedAt: new Date().toISOString(),
    isGuest: true,
    formattedTime: formatTime(data?.lapMs || 0),
  };
  sessionStorage.setItem('last_racing_score', String(score));

  setText('res-title', data?.isNew ? 'Finish! New Record' : 'Finish!');
  document.getElementById('res-title')?.classList.toggle('new', !!data?.isNew);
  setText('res-time', formatTime(data?.lapMs || 0));
  setText('res-score', score.toLocaleString());
  setText('res-play-time', formatTime(data?.lapMs || 0));
  const best = car && track ? getBestLap(car.id, track.id) : null;
  setText('res-best-record', best ? formatTime(best) : formatTime(data?.lapMs || 0));
  setText('leaderboard-subtitle', track && car ? `${modeLabel(mode)} / ${track.name} / ${car.name}` : modeLabel(mode));

  renderSectors(data);

  const listEl = document.getElementById('leaderboard-list');
  const statusEl = document.getElementById('leaderboard-status');
  renderLeaderboard(listEl, null);
  setStatus(statusEl, 'Saving record...');
  setStatus(statusEl, 'Submit Score를 눌러 기록을 저장하세요.');
  loadResultLeaderboard({ mode, token, listEl, statusEl });
  unsubscribeLeaderboard = subscribeLeaderboard(payload => {
    if (token !== renderToken) return;
    if (payload.trackId && track?.id && payload.trackId !== track.id) return;
    loadResultLeaderboard({ mode, token, listEl, statusEl, statusText: 'Live update' });
  });

  const retryBtn = document.getElementById('btn-retry');
  const menuBtn = document.getElementById('btn-to-menu');
  const leaderboardBtn = document.getElementById('btn-results-leaderboard');
  const submitBtn = document.getElementById('btn-submit-score');
  const shareBtn = document.getElementById('btn-share-score');
  const rewardedBtn = document.getElementById('btn-rewarded-continue');

  if (retryBtn) retryBtn.textContent = 'Retry';
  if (menuBtn) menuBtn.textContent = 'Main Menu';
  if (retryBtn) retryBtn.onclick = () => { cleanupLeaderboard(); retryCb?.(); };
  if (menuBtn) menuBtn.onclick = () => { cleanupLeaderboard(); menuCb?.(); };
  if (leaderboardBtn) leaderboardBtn.onclick = () => document.getElementById('btn-open-leaderboard')?.click();
  if (submitBtn) {
    submitBtn.disabled = false;
    submitBtn.textContent = 'Retry Save';
    submitBtn.onclick = () => submitCurrentResult({ submitBtn, statusEl, listEl, mode });
  }
  if (shareBtn) {
    shareBtn.onclick = async () => {
      trackEvent('share_score', { score, mode });
      const result = await shareResult(currentResult);
      setStatus(statusEl, result.message);
    };
  }
  if (rewardedBtn) {
    rewardedBtn.onclick = () => {
      trackEvent('rewarded_ad_click', { placement: 'game_over' });
      showRewardedAd(() => console.log('Reward callback placeholder'));
    };
  }
  showBannerAd('ad-game-over-banner');
  submitCurrentResult({ submitBtn, statusEl, listEl, mode, auto: true });
}

function cleanupLeaderboard() {
  renderToken++;
  if (unsubscribeLeaderboard) {
    unsubscribeLeaderboard();
    unsubscribeLeaderboard = null;
  }
}

async function loadResultLeaderboard({ mode, token, listEl, statusEl, statusText = 'Loading leaderboard...' }) {
  try {
    setStatus(statusEl, statusText);
    const result = await fetchLeaderboard('today', mode, 10);
    if (token !== renderToken) return;
    renderLeaderboard(listEl, result.leaderboard || []);
    setStatus(statusEl, result.leaderboard?.length ? 'Today leaderboard' : 'No records yet');
    unlockRankOneIfLeader(result.leaderboard, statusEl);
  } catch {
    if (token !== renderToken) return;
    renderLeaderboard(listEl, []);
    setStatus(statusEl, 'No records yet');
  }
}

async function submitCurrentResult({ submitBtn, statusEl, listEl, mode, auto = false }) {
  if (!currentResult) return setStatus(statusEl, 'No result to submit yet');
  if (resultSubmitted) return setStatus(statusEl, 'Record already saved');
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.textContent = 'Saving...';
  }
  try {
    const result = await submitResultRecord(currentResult);
    resultSubmitted = true;
    renderLeaderboard(listEl, result.leaderboard || []);
    setStatus(statusEl, result.onlineSaved ? 'Record saved to leaderboard' : 'Online save failed. Saved locally.');
    if (submitBtn) submitBtn.textContent = 'Saved';
  } catch {
    resultSubmitted = false;
    if (submitBtn) submitBtn.disabled = false;
    setStatus(statusEl, auto ? 'Auto save failed. Tap Retry Save.' : 'Could not save record');
  } finally {
    if (submitBtn && !resultSubmitted) submitBtn.textContent = 'Retry Save';
  }
}

function renderSectors(data) {
  const sectorsEl = document.getElementById('res-sectors');
  if (!sectorsEl) return;
  sectorsEl.innerHTML = '';
  const labels = ['Sector 1', 'Sector 2', 'Sector 3'];
  (data?.sectors || []).forEach((t, i) => {
    const best = data?.sectorBest?.[i] || null;
    const row = document.createElement('div');
    row.className = 'sector-row';
    row.innerHTML = `
      <span class="sector-label">${labels[i] || `Sector ${i + 1}`}</span>
      <span class="sector-time${t !== null ? ' best' : ''}">${t !== null ? formatTime(t) : '--:--.---'}</span>
      <span class="sector-best">BEST ${best ? formatTime(best) : '--:--.---'}</span>
    `;
    sectorsEl.appendChild(row);
  });
}

function renderLeaderboard(listEl, rows) {
  if (!listEl) return;
  listEl.innerHTML = '';
  if (!rows) return appendEmpty(listEl, 'Loading leaderboard...');
  if (!rows.length) return appendEmpty(listEl, 'No records yet');
  const me = getPlayerProfile().id;
  for (const row of rows) {
    const li = document.createElement('li');
    li.className = 'leaderboard-row' + (row.playerId === me ? ' mine' : '');
    li.style.setProperty('--player-theme', themeColor(row.playerThemeColor));
    const rank = document.createElement('span');
    rank.className = 'leaderboard-rank';
    rank.textContent = row.rank === 1 ? '#1' : String(row.rank);
    const name = document.createElement('span');
    name.className = 'leaderboard-driver';
    name.textContent = row.playerName || row.nickname || 'Driver';
    const time = document.createElement('span');
    time.className = 'leaderboard-time';
    time.textContent = formatTime(row.finishTime || row.lapMs || 0);
    li.append(rank, name, time);
    listEl.appendChild(li);
  }
}

function appendEmpty(listEl, text) {
  const li = document.createElement('li');
  li.className = 'leaderboard-empty';
  li.textContent = text;
  listEl.appendChild(li);
}

function unlockRankOneIfLeader(rows, statusEl) {
  const me = getPlayerProfile().id;
  const isLeader = (rows || []).some(row => row.rank === 1 && row.playerId === me);
  if (!isLeader) return;
  const skinReward = awardRankOneSkin();
  if (skinReward) setStatus(statusEl, `Rank #1 reward unlocked: ${skinReward.skin.name}`);
}

function setText(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}

function setStatus(statusEl, text) {
  if (statusEl) statusEl.textContent = text;
}

function themeColor(value) {
  const text = String(value || '').trim();
  return /^#[0-9a-fA-F]{6}$/.test(text) ? text : '#2ec4b6';
}

function scoreFromLap(lapMs) {
  return Math.max(0, Math.round(1000000 - Number(lapMs || 0) * 3));
}

function normalizeMode(mode) {
  if (mode === 'ranked' || mode === 'friendly' || mode === 'timeTrial') return mode;
  if (mode === 'online') return 'ranked';
  return 'timeTrial';
}

function modeLabel(mode) {
  if (mode === 'ranked') return '경쟁모드';
  if (mode === 'friendly') return '친선전';
  return '기록깨기 모드';
}
