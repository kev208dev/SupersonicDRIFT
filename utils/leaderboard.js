import { getSupabase } from './supabaseClient.js';
import { safeNickname } from './nicknameFilter.js';
import { getApiBase } from '../js/net/apiHost.js';

const API_BASE = getApiBase();
const PROFILE_KEY = 'racing_player_profile';
export const LOCAL_LEADERBOARD_KEY = 'racingLeaderboardRecords';
const GUEST_NICKNAME_KEY = 'racingGuestNickname';
const TABLE = 'leaderboard_records';
const DEFAULT_THEME = '#6E6E69';

let channel = null;
const listeners = new Set();
const completionListeners = new Set();
let identityOverride = null;

function randomId() {
  const bytes = new Uint32Array(2);
  crypto.getRandomValues(bytes);
  return `driver_${bytes[0].toString(36)}${bytes[1].toString(36)}`;
}

function loadProfile() {
  try {
    return JSON.parse(localStorage.getItem(PROFILE_KEY)) || null;
  } catch {
    return null;
  }
}

function saveProfile(profile) {
  localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
}

export function getPlayerProfile() {
  if (identityOverride?.id && identityOverride?.name) return identityOverride;
  let profile = loadProfile();
  if (!profile?.id) {
    profile = {
      id: randomId(),
      name: `Driver-${Math.floor(1000 + Math.random() * 9000)}`,
      themeColor: DEFAULT_THEME,
    };
    saveProfile(profile);
  }
  profile.themeColor = normalizeColor(profile.themeColor) || DEFAULT_THEME;
  return profile;
}

export function setPlayerName(name) {
  const profile = getPlayerProfile();
  const nextName = safeNickname(name, profile.name || 'Driver');
  profile.name = nextName || profile.name;
  saveProfile(profile);
  return profile;
}

export function setLeaderboardIdentity(identity) {
  identityOverride = identity?.id && identity?.name
    ? {
        id: identity.id,
        name: safeNickname(identity.name, 'Driver'),
        themeColor: normalizeColor(identity.themeColor) || DEFAULT_THEME,
      }
    : null;
}

export async function fetchLeaderboard(typeOrCarId = '', modeOrTrackId = '', limit = 10) {
  if (isBoardType(typeOrCarId)) {
    return fetchModeLeaderboard(typeOrCarId, modeOrTrackId || 'timeTrial', limit);
  }
  const carId = typeOrCarId;
  const trackId = modeOrTrackId;
  try {
    return await fetchSupabaseLeaderboard(carId, trackId, limit);
  } catch (error) {
    console.warn('Supabase leaderboard fetch failed, trying local server API.', error);
  }

  const params = new URLSearchParams({ carId, trackId, limit: String(limit) });
  const res = await fetch(`${API_BASE}/api/leaderboard?${params}`);
  if (!res.ok) throw new Error('leaderboard-fetch-failed');
  return res.json();
}

export async function fetchModeLeaderboard(type = 'allTime', mode = 'timeTrial', limit = 20, trackId = '') {
  const normalizedType = normalizeBoardType(type);
  const normalizedMode = normalizeMode(mode);
  try {
    const server = await fetchLeaderboard('', '', 50);
    const rows = (server.leaderboard || [])
      .map(row => ({
        ...row,
        nickname: row.playerName,
        mode: 'timeTrial',
        finishTime: Number(row.lapMs || 0),
        score: scoreFromTime(row.lapMs),
        completedAt: timestampToIso(row.createdAt || row.updatedAt),
      }))
      .filter(row => normalizedMode === 'timeTrial' && matchesBoardType(row, normalizedType));
    const local = getLocalLeaderboardRecords({ type: normalizedType, mode: normalizedMode, limit: 200, trackId });
    return { leaderboard: rankRecords([...local, ...rows], normalizedMode).slice(0, limit) };
  } catch {
    return { leaderboard: getLocalLeaderboardRecords({ type: normalizedType, mode: normalizedMode, limit, trackId }) };
  }
}

export async function submitLeaderboard(car, track, lapData) {
  const profile = getPlayerProfile();
  try {
    const result = await submitSupabaseLeaderboard(profile, car, track, lapData);
    _broadcastLocalCompletion(profile, car, track, lapData, !!result?.improved);
    return result;
  } catch (error) {
    console.warn('Supabase leaderboard submit failed, trying local server API.', error);
  }

  const res = await fetch(`${API_BASE}/api/leaderboard`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      playerId: profile.id,
      playerName: safeNickname(profile.name, 'Driver'),
      playerThemeColor: normalizeColor(profile.themeColor) || DEFAULT_THEME,
      carId: car.id,
      carName: car.name,
      trackId: track.id,
      trackName: track.name,
      lapMs: lapData.lapMs,
      sectors: lapData.sectors || [],
    }),
  });
  if (!res.ok) throw new Error('leaderboard-submit-failed');
  return res.json();
}

export async function submitResultRecord(result) {
  const normalized = normalizeResultRecord(result);
  let onlineSaved = false;
  let onlineError = null;
  if (normalized.mode === 'timeTrial' && normalized.car?.id && normalized.track?.id) {
    try {
      await submitLeaderboard(normalized.car, normalized.track, {
        lapMs: normalized.finishTime,
        sectors: normalized.sectors || [],
      });
      onlineSaved = true;
    } catch (error) {
      onlineError = error;
    }
  }
  saveLocalLeaderboardRecord(normalized);
  const leaderboard = getLocalLeaderboardRecords({ type: 'today', mode: normalized.mode, limit: 20 });
  return {
    accepted: true,
    onlineSaved,
    onlineError,
    localSaved: true,
    leaderboard,
    message: onlineSaved ? 'Record saved to leaderboard' : 'Online save failed. Saved locally.',
  };
}

export function saveLocalLeaderboardRecord(result) {
  const record = normalizeResultRecord(result);
  const records = readLocalRecords();
  const duplicate = records.some(item =>
    item.playerId === record.playerId
    && item.mode === record.mode
    && item.trackId === record.trackId
    && item.carId === record.carId
    && Number(item.finishTime || 0) === Number(record.finishTime || 0)
  );
  if (!duplicate) records.push(record);
  localStorage.setItem(LOCAL_LEADERBOARD_KEY, JSON.stringify(records.slice(-300)));
  return record;
}

export function getLocalLeaderboardRecords({ type = 'allTime', mode = 'timeTrial', limit = 20, trackId = '' } = {}) {
  const normalizedType = normalizeBoardType(type);
  const normalizedMode = normalizeMode(mode);
  return rankRecords(
    readLocalRecords().filter(record =>
      normalizeMode(record.mode) === normalizedMode
      && (!trackId || record.trackId === trackId)
      && matchesBoardType(record, normalizedType)
    ),
    normalizedMode
  ).slice(0, limit);
}

export async function fetchTrackLeaderboard(trackId, type = 'allTime', mode = 'timeTrial', limit = 20) {
  return fetchModeLeaderboard(type, mode, limit, trackId);
}

export function getGuestNickname() {
  let nickname = localStorage.getItem(GUEST_NICKNAME_KEY);
  if (!nickname) {
    nickname = `Guest_${Math.floor(1000 + Math.random() * 9000)}`;
    localStorage.setItem(GUEST_NICKNAME_KEY, nickname);
  }
  return nickname;
}

export function subscribeLapCompletion(listener) {
  completionListeners.add(listener);
  _ensureRealtimeChannel();
  return () => {
    completionListeners.delete(listener);
    _teardownIfIdle();
  };
}

export function subscribeLeaderboard(listener) {
  listeners.add(listener);
  _ensureRealtimeChannel();
  return () => {
    listeners.delete(listener);
    _teardownIfIdle();
  };
}

function _ensureRealtimeChannel() {
  if (channel) return;
  channel = getSupabase()
    .channel('public:leaderboard_records')
    .on('postgres_changes', { event: '*', schema: 'public', table: TABLE }, async payload => {
      const row = payload.new || payload.old || {};
      const carId = row.car_id || '';
      const trackId = row.track_id || '';
      const newLap = Number(payload.new?.lap_ms || 0);
      const oldLap = Number(payload.old?.lap_ms || Infinity);
      const isInsert = payload.eventType === 'INSERT';
      const isImprovement = isInsert || (newLap > 0 && newLap < oldLap);
      if (isImprovement && payload.new) {
        for (const fn of completionListeners) {
          fn({
            playerId: payload.new.player_id,
            playerName: payload.new.player_name,
            playerThemeColor: payload.new.player_theme_color,
            carId,
            carName: payload.new.car_name,
            trackId,
            trackName: payload.new.track_name,
            lapMs: newLap,
            isInsert,
          });
        }
      }
      if (listeners.size === 0) return;
      try {
        const result = await fetchLeaderboard('', trackId, 20);
        for (const fn of listeners) {
          fn({ carId, trackId, leaderboard: result.leaderboard || [] });
        }
      } catch {}
    })
    .subscribe(status => {
      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        console.warn('Supabase realtime leaderboard channel status:', status);
      }
    });
}

function _teardownIfIdle() {
  if (listeners.size === 0 && completionListeners.size === 0 && channel) {
    getSupabase().removeChannel(channel);
    channel = null;
  }
}

function _broadcastLocalCompletion(profile, car, track, lapData, improved) {
  for (const fn of completionListeners) {
    try {
      fn({
        playerId: profile.id,
        playerName: profile.name,
        playerThemeColor: profile.themeColor,
        carId: car.id,
        carName: car.name,
        trackId: track.id,
        trackName: track.name,
        lapMs: Number(lapData.lapMs || 0),
        isInsert: false,
        isLocal: true,
        isImprovement: !!improved,
      });
    } catch (err) {
      console.warn('local completion broadcast failed:', err);
    }
  }
}

async function fetchSupabaseLeaderboard(carId, trackId, limit = 10) {
  const { data, error } = await runLeaderboardQuery(carId, trackId, limit, true);
  if (error && String(error.message || '').includes('player_theme_color')) {
    const fallback = await runLeaderboardQuery(carId, trackId, limit, false);
    if (fallback.error) throw fallback.error;
    return { leaderboard: toLeaderboardRows(fallback.data || []) };
  }
  if (error) throw error;

  return { leaderboard: toLeaderboardRows(data || []) };
}

function runLeaderboardQuery(carId, trackId, limit, includeTheme) {
  const columns = includeTheme
    ? 'player_id,player_name,player_theme_color,car_id,car_name,track_id,track_name,lap_ms,sectors,created_at,updated_at'
    : 'player_id,player_name,car_id,car_name,track_id,track_name,lap_ms,sectors,created_at,updated_at';
  let query = getSupabase()
    .from(TABLE)
    .select(columns)
    .order('lap_ms', { ascending: true })
    .order('created_at', { ascending: true })
    .limit(Math.max(1, Math.min(Number(limit) || 10, 50)));

  if (carId) query = query.eq('car_id', carId);
  if (trackId) query = query.eq('track_id', trackId);
  return query;
}

async function submitSupabaseLeaderboard(profile, car, track, lapData) {
  const client = getSupabase();
  const lapMs = Math.round(Number(lapData.lapMs));
  const now = Date.now();

  const { data: existing, error: existingError } = await client
    .from(TABLE)
    .select('lap_ms,created_at')
    .eq('player_id', profile.id)
    .eq('car_id', car.id)
    .eq('track_id', track.id)
    .maybeSingle();

  if (existingError) throw existingError;

  const improved = !existing || lapMs < existing.lap_ms;
  const payload = {
    player_id: profile.id,
    player_name: safeNickname(profile.name, 'Driver'),
    player_theme_color: normalizeColor(profile.themeColor) || DEFAULT_THEME,
    car_id: car.id,
    car_name: car.name,
    track_id: track.id,
    track_name: track.name,
    lap_ms: lapMs,
    sectors: lapData.sectors || [],
    created_at: existing?.created_at || now,
    updated_at: now,
  };
  let { error } = await client
    .from(TABLE)
    .upsert(payload, { onConflict: 'player_id,car_id,track_id' });

  if (error && String(error.message || '').includes('player_theme_color')) {
    const { player_theme_color, ...legacyPayload } = payload;
    const legacy = await client
      .from(TABLE)
      .upsert(legacyPayload, { onConflict: 'player_id,car_id,track_id' });
    error = legacy.error;
  }

  if (error) throw error;

  const result = await fetchSupabaseLeaderboard('', track.id, 20);
  const rank = result.leaderboard.find(row => row.playerId === profile.id && row.carId === car.id)?.rank ?? null;
  return {
    accepted: true,
    improved,
    rank,
    leaderboard: result.leaderboard,
  };
}

function toLeaderboardRows(rows) {
  return rows.map((row, index) => ({
    rank: index + 1,
    playerId: row.player_id,
    playerName: row.player_name,
    playerThemeColor: normalizeColor(row.player_theme_color) || DEFAULT_THEME,
    carId: row.car_id,
    carName: row.car_name,
    trackId: row.track_id,
    trackName: row.track_name,
    lapMs: row.lap_ms,
    sectors: row.sectors || [],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
}

function readLocalRecords() {
  try {
    const raw = localStorage.getItem(LOCAL_LEADERBOARD_KEY);
    const records = raw ? JSON.parse(raw) : [];
    return Array.isArray(records) ? records : [];
  } catch {
    return [];
  }
}

function normalizeResultRecord(result = {}) {
  const profile = getPlayerProfile();
  const mode = normalizeMode(result.mode || 'timeTrial');
  const finishTime = Math.round(Number(result.finishTime ?? result.lapMs ?? 0));
  const completedAt = result.completedAt || new Date().toISOString();
  const nickname = safeNickname(result.nickname || profile.name || getGuestNickname(), getGuestNickname());
  const track = result.track || {};
  const car = result.car || {};
  return {
    id: result.id || `record_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    playerId: result.playerId || profile.id,
    playerName: nickname,
    nickname,
    playerThemeColor: normalizeColor(result.playerThemeColor || profile.themeColor) || DEFAULT_THEME,
    mode,
    finishTime,
    lapMs: finishTime,
    score: Number(result.score ?? scoreFromTime(finishTime)),
    rating: Number(result.rating ?? result.rankedScore ?? result.score ?? 0),
    ratingBefore: Number(result.ratingBefore ?? result.oldRating ?? 0),
    ratingChange: Number(result.ratingChange || 0),
    ratingAfter: Number(result.ratingAfter ?? result.newRating ?? result.rating ?? 0),
    seasonId: result.seasonId || '',
    trackId: track.id || result.trackId || '',
    trackName: track.name || result.trackName || 'Track',
    carId: car.id || result.carId || '',
    carName: car.name || result.carName || 'Car',
    car,
    track,
    sectors: result.sectors || [],
    completedAt,
    createdAt: Date.parse(completedAt) || Date.now(),
    isGuest: result.isGuest ?? true,
  };
}

function rankRecords(records, mode) {
  const sorted = [...records].sort((a, b) => {
    if (mode === 'ranked') return Number(b.rating || b.score || 0) - Number(a.rating || a.score || 0);
    return Number(a.finishTime || a.lapMs || Infinity) - Number(b.finishTime || b.lapMs || Infinity);
  });
  return sorted.map((row, index) => ({
    ...row,
    rank: index + 1,
    lapMs: row.finishTime || row.lapMs,
    playerName: row.playerName || row.nickname || 'Driver',
  }));
}

function matchesBoardType(record, type) {
  if (normalizeBoardType(type) !== 'today') return true;
  const date = new Date(record.completedAt || record.createdAt || Date.now());
  const now = new Date();
  return date.getFullYear() === now.getFullYear()
    && date.getMonth() === now.getMonth()
    && date.getDate() === now.getDate();
}

function normalizeBoardType(type) {
  return String(type || 'allTime').toLowerCase().replace('-', '') === 'today' ? 'today' : 'allTime';
}

function isBoardType(value) {
  const text = String(value || '').toLowerCase();
  return ['today', 'alltime', 'all-time'].includes(text);
}

function normalizeMode(mode) {
  const text = String(mode || 'timeTrial');
  if (text === 'online') return 'ranked';
  if (text === 'singlePlayer') return 'timeTrial';
  return ['ranked', 'timeTrial', 'friendly'].includes(text) ? text : 'timeTrial';
}

function scoreFromTime(ms) {
  return Math.max(0, Math.round(1000000 - Number(ms || 0) * 3));
}

function timestampToIso(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? new Date(n).toISOString() : new Date().toISOString();
}

function normalizeColor(value) {
  const text = String(value || '').trim();
  return /^#[0-9a-fA-F]{6}$/.test(text) ? text : null;
}
