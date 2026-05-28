import { initCarSelect }   from './screens/carSelect.js';
import { initSkinSelect }  from './screens/skinSelect.js';
import { initModeSelect }  from './screens/modeSelect.js';
import { initTrackSelect }  from './screens/trackSelect.js';
import { TRACKS }           from './data/tracks.js';
import { initGame, updateGame, stopGame } from './screens/game.js';
import { initResults }      from './screens/results.js';
import { initLobby, teardownLobby, detachNet } from './screens/lobby.js';
import { initMpGame, updateMpGame, stopMpGame } from './screens/mpGame.js';
import { initMpResults }    from './screens/mpResults.js';
import { initAuth }         from './utils/auth.js';
import { getCurrentUser, onAuthChange, signOut, signInLocal, signUpLocal } from './utils/auth.js';
import { clearFrameKeys }   from './utils/input.js';
import { formatTime }       from './utils/math.js';
import { CAR_DATA }         from './data/cars.js';
import {
  fetchLeaderboard,
  getPlayerProfile,
  subscribeLapCompletion,
  subscribeLeaderboard,
} from './utils/leaderboard.js';
import {
  claimStarterCar,
  getProfile,
  initProfile,
  isProfileLoading,
  onProfileChange,
  rollStarterCar,
  updateProfileSettings,
} from './utils/profile.js';
import { nicknameRejectMessage } from './utils/nicknameFilter.js';
import { initAds, showBannerAd } from './js/ads.js';
import { initAnalytics, trackEvent } from './js/analytics.js';
import { submitScore as submitPlaceholderScore } from './js/leaderboard.js';
import { clearRaceRecordsOnce } from './utils/storage.js';
import { initMobileControls, setMobileControlsVisible } from './js/mobileControls.js';

let currentScreen = 'main';
let selectedCar   = null;
let selectedSkin  = null;
let selectedTrack = null;
let selectedMode  = 'timeTrial';
let selectedRaceOptions = {};
let lastTime      = 0;
let authMode      = 'login';

// ── screen helpers ──────────────────────────────────────────
function showScreen(id) {
  setMobileControlsVisible(false);
  document.querySelectorAll('.screen').forEach(el => el.classList.remove('active'));
  const el = document.getElementById(id);
  if (el) el.classList.add('active');
}
function hideScreens() {
  document.querySelectorAll('.screen').forEach(el => el.classList.remove('active'));
}

// ── transitions ─────────────────────────────────────────────
function goToMain() {
  currentScreen = 'main';
  showScreen('screen-main');
  showBannerAd('ad-main-menu-banner');
}

function _openAuth() {
  currentScreen = 'auth';
  showScreen('screen-auth');
  _resetAuthForm();
}

function goToAuth() {
  goToMain();
}

function goToCarSelect() {
  currentScreen = 'carSelect';
  showScreen('screen-carselect');
  initCarSelect((car) => {
    selectedCar = car;
    goToSkinSelect();
  });
}

function goToSkinSelect() {
  currentScreen = 'skinSelect';
  showScreen('screen-skinselect');
  initSkinSelect(
    (skin) => { selectedSkin = skin; goToModeSelect(); },
    () => { goToCarSelect(); }
  );
}

function goToModeSelect() {
  currentScreen = 'modeSelect';
  showScreen('screen-modeselect');
  initModeSelect(
    (mode) => {
      selectedMode = mode;
      if (mode === 'ranked' || mode === 'friendly') goToLobby();
      else goToTrackSelect();
    },
    () => { goToSkinSelect(); }
  );
}

function goToLobby(existingNet = null, options = {}) {
  if (!selectedCar) { goToCarSelect(); return; }
  currentScreen = 'lobby';
  showScreen('screen-lobby');
  const raceCar = { ...selectedCar, skin: selectedSkin };
  initLobby(
    raceCar,
    (car, track, room, net, startAt, myClientId) => {
      goToMpGame(car, track, room, net, startAt, myClientId);
    },
    () => { goToModeSelect(); },
    existingNet,
    options
  );
}

function goToMpGame(car, track, room, net, startAt, myClientId) {
  trackEvent('game_start', { mode: 'online', track_id: track?.id, car_id: car?.id });
  currentScreen = 'mpGame';
  hideScreens();
  setMobileControlsVisible(true);
  detachNet();
  initMpGame({
    car,
    track,
    net,
    startAt,
    lapTarget: room.lapTarget,
    myClientId,
    roomPlayers: room.players,
    onFinish: (payload) => goToMpResults({ ...payload, mode: selectedMode, track, car }, net),
    onLeave: () => { net.disconnect(); goToCarSelect(); },
  });
}

function goToMpResults(payload, net) {
  trackEvent('game_over', { mode: 'online', reason: payload?.reason });
  currentScreen = 'mpResults';
  stopMpGame({ preserveRoom: selectedMode === 'friendly' });
  showScreen('screen-mpresults');
  initMpResults(
    payload,
    () => {
      if (selectedMode === 'friendly') {
        net?.send({ t: 'requestRematch' });
        goToLobby(net, { skipReturnToRoom: true });
      } else {
        net?.disconnect();
        goToLobby();
      }
    },
    () => {
      if (selectedMode === 'friendly') goToLobby(net);
      else { net?.disconnect(); goToCarSelect(); }
    },
    () => { net?.send({ t: 'leaveRoom' }); net?.disconnect(); goToMain(); },
    net
  );
}

function goToTrackSelect() {
  currentScreen = 'trackSelect';
  showScreen('screen-trackselect');
  initTrackSelect(
    (track, options = {}) => {
      selectedTrack = track;
      selectedRaceOptions = { ...options, mode: selectedMode };
      goToGame();
    },
    ()      => { goToModeSelect(); },
    { mode: selectedMode }
  );
}

function goToGame() {
  trackEvent('game_start', { mode: selectedRaceOptions?.mode || selectedMode, track_id: selectedTrack?.id, car_id: selectedCar?.id });
  currentScreen = 'game';
  hideScreens();
  setMobileControlsVisible(true);
  const raceCar = { ...selectedCar, skin: selectedSkin };
  initGame(
    raceCar, selectedTrack,
    (lapData) => { goToResults(lapData); },
    ()        => { goToCarSelect(); },
    selectedRaceOptions
  );
}

function goToResults(lapData) {
  trackEvent('game_over', { mode: selectedRaceOptions?.mode || selectedMode, score: _scoreFromLap(lapData?.lapMs), lap_ms: lapData?.lapMs });
  currentScreen = 'results';
  setMobileControlsVisible(false);
  stopGame();
  showScreen('screen-results');
  initResults(
    lapData,
    { ...selectedCar, skin: selectedSkin },
    selectedTrack,
    selectedRaceOptions,
    () => { trackEvent('retry_click', { source: 'results' }); goToGame(); },
    () => { goToMain(); }
  );
}

function _scoreFromLap(lapMs) {
  return Math.max(0, Math.round(1000000 - Number(lapMs || 0) * 3));
}

// ── game loop ────────────────────────────────────────────────
function gameLoop(timestamp) {
  const dt = Math.min((timestamp - lastTime) / 1000, 0.05);
  lastTime = timestamp;

  if (currentScreen === 'game') {
    updateGame(dt, timestamp);
  } else if (currentScreen === 'mpGame') {
    updateMpGame(dt, timestamp);
  }

  clearFrameKeys();
  requestAnimationFrame(gameLoop);
}

// ── help button (always visible, opens controls modal) ──────
function _wireHelpButton() {
  const btn   = document.getElementById('btn-help');
  const overlay = document.getElementById('help-overlay');
  const close = document.getElementById('btn-help-close');
  if (!btn || !overlay) return;
  const open  = () => overlay.classList.remove('hidden');
  const hide  = () => overlay.classList.add('hidden');
  btn.addEventListener('click', open);
  close && close.addEventListener('click', hide);
  overlay.addEventListener('click', e => {
    if (e.target === overlay) hide();
  });
  // ESC closes if open (but only when overlay is the topmost UI)
  window.addEventListener('keydown', e => {
    if (e.key === 'Escape' && !overlay.classList.contains('hidden')) {
      hide();
      e.stopPropagation();
    }
  }, true);
}
_wireHelpButton();

function _wireMainMenu() {
  document.getElementById('btn-main-play')?.addEventListener('click', () => {
    trackEvent('guest_play_click', { source: 'main_menu' });
    goToCarSelect();
  });
  document.getElementById('btn-main-login')?.addEventListener('click', () => {
    _openAuth();
  });
  document.getElementById('btn-main-leaderboard')?.addEventListener('click', () => {
    _openLeaderboardOverlay();
  });
}

function _wireMainLeaderboardPreview() {
  document.querySelectorAll('.main-board-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.main-board-tab').forEach(item => item.classList.toggle('active', item === tab));
      _loadMainLeaderboardPreview();
    });
  });
  _loadMainLeaderboardPreview();
}

async function _loadMainLeaderboardPreview(statusText = 'Loading racers...') {
  const list = document.getElementById('main-leaderboard-list');
  const status = document.getElementById('main-leaderboard-status');
  if (!list || !status) return;
  const activeTab = document.querySelector('.main-board-tab.active');
  const boardType = activeTab?.dataset?.mainBoardType === 'all-time' ? 'allTime' : 'today';
  status.textContent = boardType === 'today' ? statusText : 'All-time leaders';
  list.innerHTML = '<li class="leaderboard-empty">Loading leaderboard...</li>';
  try {
    const result = await fetchLeaderboard(boardType, 'timeTrial', 5);
    const rows = result.leaderboard?.slice(0, 5) || [];
    renderLeaderboardPreview(rows);
    status.textContent = rows.length
      ? (boardType === 'today' ? 'Today Top 5' : 'All-time Top 5')
      : 'No records yet';
  } catch {
    renderLeaderboardPreview([]);
    status.textContent = 'No records yet';
  }
}

function _openLeaderboardOverlay() {
  const overlay = document.getElementById('leaderboard-overlay');
  if (!overlay) return;
  overlay.classList.remove('hidden');
  trackEvent('leaderboard_open', { source: currentScreen });
  _loadGlobalLeaderboard();
}

function _wireGlobalLeaderboard() {
  const openBtn = document.getElementById('btn-open-leaderboard');
  const overlay = document.getElementById('leaderboard-overlay');
  const closeBtn = document.getElementById('btn-leaderboard-close');
  const refreshBtn = document.getElementById('btn-leaderboard-refresh');
  const trackFilter = document.getElementById('leaderboard-track-filter');
  if (!openBtn || !overlay) return;

  if (trackFilter) {
    trackFilter.innerHTML = TRACKS.map((track, idx) =>
      `<option value="${track.id}"${idx === 0 ? ' selected' : ''}>${track.name}</option>`
    ).join('');
    trackFilter.addEventListener('change', () => _loadGlobalLeaderboard());
  }

  const open = () => _openLeaderboardOverlay();
  const close = () => overlay.classList.add('hidden');

  openBtn.addEventListener('click', open);
  closeBtn && closeBtn.addEventListener('click', close);
  refreshBtn && refreshBtn.addEventListener('click', () => _loadGlobalLeaderboard());
  overlay.addEventListener('click', e => {
    if (e.target === overlay) close();
  });
  document.querySelectorAll('.leaderboard-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      setLeaderboardTab(tab.dataset.boardType || 'all-time');
    });
  });
  document.getElementById('leaderboard-submit-form')?.addEventListener('submit', async event => {
    event.preventDefault();
    const nickname = document.getElementById('leaderboard-nickname')?.value || getPlayerProfile().name;
    const score = Number(sessionStorage.getItem('last_racing_score') || 0);
    await submitPlaceholderScore(nickname, score);
    const status = document.getElementById('global-leaderboard-status');
    if (status) status.textContent = 'Score submit placeholder ready.';
  });

  subscribeLeaderboard(() => {
    if (!overlay.classList.contains('hidden')) _loadGlobalLeaderboard('실시간 갱신됨');
    _loadHomeLeaderboard('실시간 갱신됨');
  });
}

async function _loadGlobalLeaderboard(statusText = '서버 연결 중...') {
  const list = document.getElementById('global-leaderboard-list');
  const status = document.getElementById('global-leaderboard-status');
  const trackFilter = document.getElementById('leaderboard-track-filter');
  if (!list || !status) return;
  const activeTab = document.querySelector('.leaderboard-tab.active');
  const boardType = activeTab?.dataset?.boardType === 'today' ? 'today' : 'allTime';
  status.textContent = statusText;
  list.innerHTML = '<li class="leaderboard-empty">Loading leaderboard...</li>';
  try {
    const result = await fetchLeaderboard(boardType, 'timeTrial', 20);
    _renderGlobalLeaderboard(result.leaderboard || []);
    status.textContent = result.leaderboard?.length ? `${boardType === 'today' ? 'Today' : 'All-time'} TOP 20` : 'No records yet';
  } catch {
    list.innerHTML = '<li class="leaderboard-empty">No records yet</li>';
    status.textContent = 'No records yet';
  }
  return;
  const trackId = trackFilter?.value || TRACKS[0]?.id || '';
  const trackName = TRACKS.find(t => t.id === trackId)?.name || '선택 맵';

  status.textContent = `${trackName} ${statusText}`;
  list.innerHTML = '<li class="leaderboard-empty">랭킹을 불러오는 중...</li>';

  try {
    const result = await fetchLeaderboard('', trackId, 20);
    _renderGlobalLeaderboard(result.leaderboard || []);
    status.textContent = result.leaderboard?.length ? `${trackName} TOP 20` : `${trackName} 등록된 기록이 없습니다.`;
  } catch {
    list.innerHTML = '<li class="leaderboard-empty">서버에 연결할 수 없습니다.</li>';
    status.textContent = '온라인 랭킹 서버를 확인하세요.';
  }
}

function _wireHomeLeaderboard() {
  const trackFilter = document.getElementById('home-leaderboard-track');
  if (!trackFilter) return;
  trackFilter.innerHTML = TRACKS.map((track, idx) =>
    `<option value="${track.id}"${idx === 0 ? ' selected' : ''}>${track.name}</option>`
  ).join('');
  trackFilter.addEventListener('change', () => _loadHomeLeaderboard());
  _loadHomeLeaderboard();
}

async function _loadHomeLeaderboard(statusText = '서버 연결 중...') {
  const list = document.getElementById('home-leaderboard-list');
  const status = document.getElementById('home-leaderboard-status');
  const trackFilter = document.getElementById('home-leaderboard-track');
  if (!list || !status || !trackFilter) return;
  const trackId = trackFilter.value || TRACKS[0]?.id || '';
  status.textContent = statusText;
  list.innerHTML = '<li class="leaderboard-empty">랭킹을 불러오는 중...</li>';
  try {
    const result = await fetchLeaderboard('', trackId, 8);
    _renderLeaderboardInto(list, result.leaderboard || []);
    status.textContent = result.leaderboard?.length ? '맵별 TOP 8' : '아직 기록 없음';
  } catch {
    list.innerHTML = '<li class="leaderboard-empty">서버에 연결할 수 없습니다.</li>';
    status.textContent = 'Supabase 연결 확인 필요';
  }
}

function _renderGlobalLeaderboard(rows) {
  renderLeaderboard(rows, 'allTime', 'timeTrial');
}

function renderLeaderboard(scores, type = 'allTime', mode = 'timeTrial') {
  const list = document.getElementById('global-leaderboard-list');
  if (!list) return;
  _renderLeaderboardInto(list, scores || []);
}

function renderLeaderboardPreview(scores) {
  const list = document.getElementById('main-leaderboard-list');
  if (!list) return;
  _renderLeaderboardInto(list, scores || []);
}

function _renderLeaderboardInto(list, rows) {
  list.innerHTML = '';

  if (rows.length === 0) {
    list.innerHTML = '<li class="leaderboard-empty">아직 등록된 기록이 없습니다.</li>';
    return;
  }

  const me = getPlayerProfile().id;
  for (const row of rows) {
    const li = document.createElement('li');
    li.className = 'global-leaderboard-row' + (row.playerId === me ? ' mine' : '');
    li.style.setProperty('--player-theme', _themeColor(row.playerThemeColor));

    const rank = document.createElement('span');
    rank.className = 'leaderboard-rank';
    rank.textContent = row.rank === 1 ? '♛ 1' : String(row.rank);

    const main = document.createElement('span');
    main.className = 'global-leaderboard-main';
    main.textContent = row.playerName || 'Driver';

    const meta = document.createElement('span');
    meta.className = 'global-leaderboard-meta';
    meta.textContent = `${row.trackName || row.trackId} / ${row.carName || row.carId}`;

    const time = document.createElement('span');
    time.className = 'leaderboard-time';
    time.textContent = formatTime(row.lapMs);

    li.append(rank, main, meta, time);
    list.appendChild(li);
  }
}

function _themeColor(value) {
  const text = String(value || '').trim();
  return /^#[0-9a-fA-F]{6}$/.test(text) ? text : '#2ec4b6';
}

function _wireProfilePanel() {
  const openBtn = document.getElementById('btn-profile-open');
  const panel = document.getElementById('profile-panel');
  const closeBtn = document.getElementById('btn-profile-close');
  const logout = document.getElementById('btn-auth-logout');
  const status = document.getElementById('auth-status');
  const nickname = document.getElementById('profile-nickname');
  const theme = document.getElementById('profile-theme');
  const save = document.getElementById('btn-profile-save');
  if (!openBtn || !panel) return;

  openBtn.addEventListener('click', () => panel.classList.toggle('hidden'));
  closeBtn?.addEventListener('click', () => panel.classList.add('hidden'));
  logout && (logout.onclick = async () => {
    await signOut();
    panel.classList.add('hidden');
    goToAuth();
  });
  save && (save.onclick = async () => {
    try {
      await updateProfileSettings({ nickname: nickname?.value, themeColor: theme?.value });
      if (status) status.textContent = '프로필 저장 완료';
    } catch (error) {
      if (!status) return;
      status.textContent = error?.code === 'bad-nickname'
        ? nicknameRejectMessage()
        : '로그인 후 프로필을 저장할 수 있습니다.';
    }
  });

  onAuthChange(_renderProfilePanel);
  onProfileChange(profile => {
    _renderProfilePanel();
    if (profile && !profile.starter_claimed) _openStarterRewardPack();
  });
}

function _renderProfilePanel() {
  const user = getCurrentUser();
  const profile = getProfile();
  const local = getPlayerProfile();
  const name = profile?.nickname || local.name;
  const color = profile?.theme_color || '#2ec4b6';
  const coins = profile?.coins || 0;
  const ownedCount = profile?.owned_car_ids?.length || 2;
  const chipName = document.getElementById('profile-chip-name');
  const chipCoins = document.getElementById('profile-chip-coins');
  const dot = document.getElementById('profile-dot');
  const nickname = document.getElementById('profile-nickname');
  const theme = document.getElementById('profile-theme');
  const coinsEl = document.getElementById('profile-coins');
  const note = document.getElementById('profile-note');
  const logout = document.getElementById('btn-auth-logout');
  const status = document.getElementById('auth-status');

  if (chipName) chipName.textContent = user ? name : 'Guest';
  if (chipCoins) chipCoins.textContent = user ? coins.toLocaleString() : 'login';
  if (dot) dot.style.background = color;
  if (nickname) {
    nickname.value = name;
    nickname.disabled = !user || isProfileLoading();
  }
  if (theme) {
    theme.value = color;
    theme.disabled = !user || isProfileLoading();
  }
  if (coinsEl) coinsEl.textContent = coins.toLocaleString();
  if (note) note.textContent = user
    ? `${ownedCount}/${CAR_DATA.length}대 소유 · 미션 클리어로 코인을 모아 구매하세요.`
    : '게스트는 기본 차량만 사용할 수 있습니다.';
  if (logout) logout.classList.toggle('hidden', !user);
  if (status) status.textContent = user ? `${user.id} 로그인됨` : '로그인하면 코인과 차량을 저장합니다.';
}

function _authErrorMessage(error) {
  switch (error?.code) {
    case 'invalid-id':
      return '아이디는 영문/숫자/_/- 3~20자로 입력하세요.';
    case 'invalid-password':
      return '비밀번호는 4자 이상이어야 합니다.';
    case 'id-taken':
      return '이미 사용 중인 아이디입니다.';
    case 'no-account':
      return '존재하지 않는 아이디입니다.';
    case 'wrong-password':
      return '비밀번호가 일치하지 않습니다.';
    case 'password-mismatch':
      return '비밀번호 확인이 일치하지 않습니다.';
    default:
      return `오류: ${error?.message || '알 수 없는 문제가 발생했습니다.'}`;
  }
}

function _resetAuthForm() {
  const idInput = document.getElementById('auth-id');
  const pwInput = document.getElementById('auth-password');
  const pwConfirm = document.getElementById('auth-password-confirm');
  const errorEl = document.getElementById('auth-error');
  if (idInput) idInput.value = '';
  if (pwInput) pwInput.value = '';
  if (pwConfirm) pwConfirm.value = '';
  if (errorEl) errorEl.textContent = '';
  _setAuthMode('login');
  setTimeout(() => idInput?.focus(), 50);
}

function _setAuthMode(mode) {
  authMode = mode;
  const subtitle = document.getElementById('auth-mode-subtitle');
  const submit = document.getElementById('btn-auth-submit');
  const toggle = document.getElementById('btn-auth-toggle');
  const switchLabel = document.getElementById('auth-switch-label');
  const confirmField = document.querySelector('.auth-field-confirm');
  const pwInput = document.getElementById('auth-password');
  const errorEl = document.getElementById('auth-error');
  const isSignup = mode === 'signup';
  if (subtitle) subtitle.textContent = isSignup ? '새 계정을 만들어 주세요' : '아이디와 비밀번호로 로그인';
  if (submit) submit.textContent = isSignup ? '회원가입 완료' : '로그인';
  if (toggle) toggle.textContent = isSignup ? '로그인' : '회원가입';
  if (switchLabel) switchLabel.textContent = isSignup ? '이미 계정이 있으신가요?' : '계정이 없으신가요?';
  if (confirmField) confirmField.classList.toggle('hidden', !isSignup);
  if (pwInput) pwInput.setAttribute('autocomplete', isSignup ? 'new-password' : 'current-password');
  if (errorEl) errorEl.textContent = '';
}

function _wireAuthScreen() {
  const form = document.getElementById('auth-form');
  const toggle = document.getElementById('btn-auth-toggle');
  const errorEl = document.getElementById('auth-error');
  const submit = document.getElementById('btn-auth-submit');
  if (!form) return;

  toggle?.addEventListener('click', () => {
    _setAuthMode(authMode === 'signup' ? 'login' : 'signup');
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('auth-id')?.value || '';
    const pw = document.getElementById('auth-password')?.value || '';
    const pwConfirm = document.getElementById('auth-password-confirm')?.value || '';
    if (errorEl) errorEl.textContent = '';
    if (submit) submit.disabled = true;
    try {
      if (authMode === 'signup') {
        if (pw !== pwConfirm) {
          const err = new Error('password-mismatch');
          err.code = 'password-mismatch';
          throw err;
        }
        await signUpLocal(id, pw);
      } else {
        await signInLocal(id, pw);
      }
      goToCarSelect();
    } catch (error) {
      if (errorEl) errorEl.textContent = _authErrorMessage(error);
    } finally {
      if (submit) submit.disabled = false;
    }
  });
}

function _wireStarterRewardPack() {
  const open = document.getElementById('btn-reward-pack-open');
  if (!open) return;
  open.onclick = async () => {
    const profile = getProfile();
    if (!profile || profile.starter_claimed) return _closeStarterRewardPack();
    const car = rollStarterCar();
    const cards = [
      document.getElementById('reward-card-1'),
      document.getElementById('reward-card-2'),
      document.getElementById('reward-card-3'),
    ];
    const result = document.getElementById('reward-pack-result');
    const names = CAR_DATA.map(item => item.name);
    open.disabled = true;
    let ticks = 0;
    const interval = setInterval(() => {
      ticks++;
      cards.forEach((card, i) => {
        if (card) card.textContent = names[(ticks + i * 3) % names.length];
      });
      if (ticks > 26) {
        clearInterval(interval);
        cards.forEach(card => { if (card) card.textContent = car.name; });
        if (result) result.textContent = `Bonus car unlocked: ${car.name}`;
        claimStarterCar(car.id).finally(() => {
          setTimeout(_closeStarterRewardPack, 1200);
          open.disabled = false;
        });
      }
    }, 70);
  };
}

function setLeaderboardTab(type) {
  const normalized = type === 'today' ? 'today' : 'all-time';
  document.querySelectorAll('.leaderboard-tab').forEach(item => {
    item.classList.toggle('active', item.dataset.boardType === normalized);
  });
  _loadGlobalLeaderboard();
}

function _openStarterRewardPack() {
  const overlay = document.getElementById('starter-reward-overlay');
  if (overlay) overlay.classList.remove('hidden');
}

function _closeStarterRewardPack() {
  const overlay = document.getElementById('starter-reward-overlay');
  if (overlay) overlay.classList.add('hidden');
}

const recentToastKeys = new Map();
const TOAST_DEDUPE_MS = 6000;

function _wireGlobalCompletionToast() {
  subscribeLapCompletion(event => {
    if (!event) return;
    const key = `${event.playerId}|${event.trackId}|${event.carId}|${event.lapMs}|${event.isLocal ? 'L' : 'R'}`;
    const now = Date.now();
    for (const [k, t] of recentToastKeys) {
      if (now - t > TOAST_DEDUPE_MS) recentToastKeys.delete(k);
    }
    if (recentToastKeys.has(key)) return;
    recentToastKeys.set(key, now);
    _showCompletionToast(event);
  });
}

function _showCompletionToast(event) {
  const container = document.getElementById('global-toast-container');
  if (!container) return;
  const name = event.playerName || 'Driver';
  const track = event.trackName || event.trackId || '?';
  const time = formatTime(event.lapMs);
  const theme = _themeColor(event.playerThemeColor);
  let verb;
  if (event.isLocal) verb = event.isImprovement ? '베스트 갱신 (글로벌 송출)' : '글로벌 송출';
  else verb = event.isInsert ? '완주' : '베스트 갱신';
  const toast = document.createElement('div');
  toast.className = 'global-toast';
  toast.style.setProperty('--player-theme', theme);
  toast.innerHTML = `<b>${_escape(name)}</b>님이 ${_escape(track)} <time>${_escape(time)}</time> ${verb}!`;
  container.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add('show'));
  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 400);
  }, 5200);
  while (container.children.length > 5) {
    container.firstElementChild?.remove();
  }
}

function _escape(value) {
  return String(value ?? '').replace(/[&<>"']/g, ch => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]
  ));
}

initAnalytics();
clearRaceRecordsOnce();
initMobileControls();
initAds();
_wireMainMenu();
_wireMainLeaderboardPreview();
_wireAuthScreen();
_wireProfilePanel();
_wireStarterRewardPack();
_wireHomeLeaderboard();
_wireGlobalLeaderboard();
_wireGlobalCompletionToast();
await initAuth();
initProfile();

onAuthChange(() => {
  _renderProfilePanel();
});

// ── start ────────────────────────────────────────────────────
goToMain();
requestAnimationFrame(gameLoop);
