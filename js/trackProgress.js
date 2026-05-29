import { TRACKS } from '../data/tracks.js';
import { getLocalLeaderboardRecords } from '../utils/leaderboard.js';

export function getTrackTargetTime(trackId) {
  const track = TRACKS.find(item => item.id === trackId);
  return Number(track?.targetTime || Infinity);
}

export function getBestTimeForTrack(trackId) {
  const rows = getLocalLeaderboardRecords({ type: 'allTime', mode: 'timeTrial', trackId, limit: 500 });
  const best = rows.reduce((min, row) => Math.min(min, Number(row.finishTime || row.lapMs || Infinity)), Infinity);
  return Number.isFinite(best) ? best : null;
}

export function getTrackMedal(trackId, finishTime) {
  const track = TRACKS.find(item => item.id === trackId);
  const time = Number(finishTime);
  if (!track || !Number.isFinite(time)) return 'none';
  if (time <= track.goldTime) return 'gold';
  if (time <= track.silverTime) return 'silver';
  if (time <= track.targetTime) return 'target';
  return 'finish';
}

export function hasClearedTrackUnderTarget(trackId) {
  const best = getBestTimeForTrack(trackId);
  return Number.isFinite(best) && best <= getTrackTargetTime(trackId);
}

export function hasClearedAllTracksUnderTarget() {
  return TRACKS.every(track => hasClearedTrackUnderTarget(track.id));
}

export function getAllTrackProgress() {
  return TRACKS.map(track => {
    const best = getBestTimeForTrack(track.id);
    return {
      trackId: track.id,
      name: track.name,
      targetTime: track.targetTime,
      bestTime: best,
      cleared: Number.isFinite(best) && best <= track.targetTime,
      medal: getTrackMedal(track.id, best),
    };
  });
}
