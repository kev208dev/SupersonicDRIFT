let spectatorMode = false;
let targets = [];
let currentTargetId = null;

export function enterSpectatorMode(players = []) {
  spectatorMode = true;
  targets = players.filter(player => player && player.id);
  currentTargetId = targets[0]?.id || null;
  renderSpectatorHUD();
  return currentTargetId;
}

export function exitSpectatorMode() {
  spectatorMode = false;
  currentTargetId = null;
  document.getElementById('spectator-hud')?.remove();
}

export function spectatePlayer(playerId) {
  if (!targets.some(player => player.id === playerId)) return null;
  currentTargetId = playerId;
  renderSpectatorHUD();
  return currentTargetId;
}

export function nextSpectateTarget() {
  if (!targets.length) return null;
  const index = Math.max(0, targets.findIndex(player => player.id === currentTargetId));
  currentTargetId = targets[(index + 1) % targets.length].id;
  renderSpectatorHUD();
  return currentTargetId;
}

export function updateSpectatorCamera(camera, remotePlayers) {
  if (!spectatorMode || !camera || !currentTargetId) return false;
  const target = remotePlayers?.get?.(currentTargetId)?.syntheticCar;
  if (!target) return false;
  const a = target.angle || 0;
  camera.position.set(target.x - Math.cos(a) * 104, 46, -(target.y - Math.sin(a) * 104));
  camera.lookAt(target.x + Math.cos(a) * 64, 14, -(target.y + Math.sin(a) * 64));
  return true;
}

function renderSpectatorHUD() {
  let el = document.getElementById('spectator-hud');
  if (!spectatorMode) return el?.remove();
  const current = targets.find(player => player.id === currentTargetId);
  if (!el) {
    el = document.createElement('div');
    el.id = 'spectator-hud';
    el.className = 'spectator-hud';
    document.body.appendChild(el);
  }
  el.innerHTML = `
    <span>Spectating: ${escapeHtml(current?.playerName || current?.name || 'Driver')}</span>
    <button id="btn-spectator-next" type="button">Next Player</button>
    <button id="btn-spectator-exit" type="button">Exit Spectator</button>
  `;
  el.querySelector('#btn-spectator-next')?.addEventListener('click', nextSpectateTarget);
  el.querySelector('#btn-spectator-exit')?.addEventListener('click', exitSpectatorMode);
}

function escapeHtml(text) {
  return String(text || '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}
