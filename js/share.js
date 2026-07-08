export async function shareScore(score) {
  const text = `I scored ${Number(score || 0).toLocaleString()} in SUPERSONIC DRIFT. Can you beat me?`;
  const url = window.location.href;
  if (navigator.share) {
    await navigator.share({ title: 'SUPERSONIC DRIFT', text, url });
    return true;
  }
  await navigator.clipboard?.writeText(`${text} ${url}`);
  alert('Share link copied');
  return false;
}

export async function shareResult(result) {
  if (!result?.finishTime && !result?.score) {
    return { ok: false, message: 'No result to share yet' };
  }
  renderShareCard(result);
  const text = buildShareText(result);
  const url = 'https://racinggame.fly.dev';
  try {
    if (navigator.share) {
      await navigator.share({ title: 'SUPERSONIC DRIFT', text, url });
      return { ok: true, message: 'Shared' };
    }
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return { ok: true, message: 'Share text copied' };
    }
  } catch (error) {
    if (error?.name === 'AbortError') return { ok: false, message: 'Share canceled' };
  }
  window.prompt('Copy your result', text);
  return { ok: true, message: 'Share text ready' };
}

export function buildShareText(result = {}) {
  const modeName = modeLabel(result.mode);
  const formattedTime = result.formattedTime || formatMs(result.finishTime || result.lapMs);
  const trackName = result.track?.name || result.trackName || 'Track';
  return `SUPERSONIC DRIFT?�서 ${modeName} ${trackName} 기록 ${formattedTime} ?�성! ?�도 ?�전?�봐: https://racinggame.fly.dev`;
}

export function copyShareText(text) {
  return copyToClipboard(text);
}

export async function copyToClipboard(text) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return true;
  }
  window.prompt('Copy your result', text);
  return false;
}

export function renderShareCard(result = {}) {
  let card = document.getElementById('share-card-preview');
  if (!card) {
    card = document.createElement('div');
    card.id = 'share-card-preview';
    card.className = 'share-card-preview';
    document.querySelector('#screen-results .results-box')?.appendChild(card);
  }
  const formattedTime = result.formattedTime || formatMs(result.finishTime || result.lapMs);
  card.innerHTML = `
    <span>SUPERSONIC DRIFT</span>
    <h3>${escapeHtml(modeLabel(result.mode))}</h3>
    <p>Track: ${escapeHtml(result.track?.name || result.trackName || 'Track')}</p>
    <p>Car: ${escapeHtml(result.car?.name || result.carName || 'GT3')}</p>
    <b>${escapeHtml(formattedTime)}</b>
  `;
  return card;
}

export function createShareImageCanvas(result = {}) {
  const canvas = document.createElement('canvas');
  canvas.width = 900;
  canvas.height = 500;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#0d1117';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#2ec4b6';
  ctx.font = '700 34px system-ui';
  ctx.fillText('SUPERSONIC DRIFT', 48, 72);
  ctx.fillStyle = '#ffffff';
  ctx.font = '900 72px system-ui';
  ctx.fillText(result.formattedTime || formatMs(result.finishTime || result.lapMs), 48, 190);
  ctx.font = '500 28px system-ui';
  ctx.fillText(`${modeLabel(result.mode)} · ${result.track?.name || result.trackName || 'Track'}`, 48, 250);
  ctx.fillStyle = '#ffd166';
  ctx.fillText('Can you beat me? racinggame.fly.dev', 48, 420);
  return canvas;
}

function modeLabel(mode) {
  if (mode === 'ranked') return 'ranked mode';
  if (mode === 'friendly') return 'friendly match';
  return 'time trial';
}

function formatMs(ms) {
  const n = Math.max(0, Math.round(Number(ms || 0)));
  const minutes = Math.floor(n / 60000);
  const seconds = Math.floor((n % 60000) / 1000);
  const millis = n % 1000;
  return `${minutes}:${String(seconds).padStart(2, '0')}.${String(millis).padStart(3, '0')}`;
}

function escapeHtml(text) {
  return String(text || '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

