import { formatTime } from '../utils/math.js';
import { getGuestNickname, getPlayerProfile, submitResultRecord } from '../utils/leaderboard.js';

let onRematch = null;
let onMenu = null;
let onLeave = null;
let net = null;
let roomStateUnsub = null;

export function initMpResults(payload, rematchCb, menuCb, leaveCb, netHandle) {
  onRematch = rematchCb;
  onMenu = menuCb;
  onLeave = leaveCb;
  net = netHandle || null;
  if (roomStateUnsub) {
    try { roomStateUnsub(); } catch {}
    roomStateUnsub = null;
  }

  const list = document.getElementById('mpresults-list');
  if (list) {
    list.innerHTML = '';
    const results = payload?.results || [];
    results.forEach((row, idx) => {
      const li = document.createElement('li');
      const isMe = row.id === payload.myClientId;
      const isFirst = row.finishRank === 1;
      li.className = 'mpresults-row'
        + (isMe ? ' mine' : '')
        + (isFirst ? ' first' : '')
        + (row.dnf ? ' dnf' : '');

      const rank = document.createElement('span');
      rank.className = 'mpresults-rank';
      rank.textContent = row.dnf ? 'DNF' : (row.finishRank ?? '-');

      const name = document.createElement('div');
      name.innerHTML = `<div class="mpresults-name">${escapeHtml(row.playerName || 'Driver')}</div>
                       <div class="mpresults-car">${escapeHtml(row.carName || row.carId || 'Car')}</div>`;

      const total = document.createElement('span');
      total.className = 'mpresults-time';
      total.textContent = row.totalMs != null ? formatTime(row.totalMs) : '--:--.---';

      const best = document.createElement('span');
      best.className = 'mpresults-best';
      best.textContent = row.bestLapMs != null ? `B ${formatTime(row.bestLapMs)}` : '';

      li.append(rank, name, total, best);
      list.appendChild(li);
    });
    if (results.length === 0) {
      list.innerHTML = '<li class="mpresults-row dnf"><span>-</span><div class="mpresults-name">결과 없음</div></li>';
    }
  }

  const title = document.getElementById('mpresults-title');
  if (title) {
    if (payload?.reason === 'time-limit') title.textContent = '시간 초과 — 레이스 종료';
    else if (payload?.reason === 'trailer-timeout') title.textContent = '리더 완주 — 잔여 시간 종료';
    else title.textContent = '레이스 종료';
  }

  const rematchBtn = document.getElementById('btn-mp-rematch');
  const menuBtn = document.getElementById('btn-mp-to-menu');
  ensureFriendlyResultActions(payload);
  if (rematchBtn) {
    rematchBtn.textContent = payload?.mode === 'friendly' ? '재경기' : '다시 매칭';
    rematchBtn.onclick = () => { if (onRematch) onRematch(); };
  }
  if (menuBtn) {
    menuBtn.textContent = payload?.mode === 'friendly' ? '방 로비로 돌아가기' : '메인으로';
    menuBtn.onclick = () => { if (onMenu) onMenu(); };
  }

  autoSaveMultiplayerResult(payload);
}

function ensureFriendlyResultActions(payload) {
  const box = document.querySelector('#screen-mpresults .mpresults-box');
  if (!box || payload?.mode !== 'friendly') return;
  let panel = document.getElementById('mp-rematch-status');
  if (!panel) {
    panel = document.createElement('div');
    panel.id = 'mp-rematch-status';
    panel.className = 'mp-rematch-status';
    box.insertBefore(panel, box.querySelector('.mpresults-actions'));
  }
  renderRematchStatus(panel, payload.partyState?.players || payload.results || []);
  let leave = document.getElementById('btn-mp-leave-room');
  if (!leave) {
    leave = document.createElement('button');
    leave.id = 'btn-mp-leave-room';
    leave.className = 'btn-secondary';
    leave.type = 'button';
    leave.textContent = '방 나가기';
    box.querySelector('.mpresults-actions')?.appendChild(leave);
  }
  leave.onclick = () => onLeave?.();
  roomStateUnsub = net?.on?.('roomState', msg => {
    renderRematchStatus(panel, msg.room?.players || []);
  });
}

function renderRematchStatus(panel, players) {
  panel.innerHTML = `
    <strong>Party Rematch</strong>
    <div>${(players || []).map(player => `
      <span class="${player.ready ? 'ready' : ''}">
        ${escapeHtml(player.playerName || player.nickname || 'Driver')} ${player.ready ? 'Ready' : 'Waiting'}
      </span>
    `).join('')}</div>
  `;
}

async function autoSaveMultiplayerResult(payload) {
  const me = (payload?.results || []).find(row => row.id === payload.myClientId);
  if (!me || me.dnf || me.totalMs == null) return;
  const profile = getPlayerProfile();
  try {
    await submitResultRecord({
      nickname: profile.name || getGuestNickname(),
      mode: payload.mode === 'ranked' ? 'ranked' : 'friendly',
      finishTime: Math.round(me.totalMs),
      score: Math.max(0, Math.round(1000000 - Number(me.totalMs || 0) * 2)),
      ratingChange: payload.mode === 'ranked' ? Math.max(1, Math.round(1000000 / Math.max(1, me.totalMs))) : 0,
      track: payload.track || null,
      car: payload.car || null,
      completedAt: new Date().toISOString(),
      isGuest: true,
    });
  } catch (error) {
    console.warn('Multiplayer result save failed:', error);
  }
}

function escapeHtml(text) {
  return String(text || '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}
