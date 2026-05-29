let miniMapTrack = null;
let lastMiniMapRenderAt = 0;

export function initMiniMap(track) {
  miniMapTrack = track;
  return ensureCanvas();
}

export function updateMiniMap(playerPosition, opponents = []) {
  const now = performance.now();
  if (now - lastMiniMapRenderAt < 66) return;
  lastMiniMapRenderAt = now;
  renderMiniMap(playerPosition, opponents);
}

export function worldToMiniMapPosition(worldPos) {
  const line = miniMapTrack?.centerLine || [];
  if (!line.length) return { x: 0, y: 0 };
  const xs = line.map(p => p[0]);
  const ys = line.map(p => p[1]);
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const minY = Math.min(...ys), maxY = Math.max(...ys);
  return {
    x: 12 + ((worldPos.x - minX) / ((maxX - minX) || 1)) * 166,
    y: 10 + ((worldPos.y - minY) / ((maxY - minY) || 1)) * 112,
  };
}

export function renderMiniMap(playerPosition, opponents = []) {
  const canvas = ensureCanvas();
  if (!canvas || !miniMapTrack) return;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = 'rgba(8,11,16,0.72)';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  const line = miniMapTrack.centerLine || [];
  if (line.length > 1) {
    ctx.strokeStyle = 'rgba(255,255,255,0.18)';
    ctx.lineWidth = 8;
    drawLine(ctx, line);
    ctx.strokeStyle = miniMapTrack.accentColor || '#2ec4b6';
    ctx.lineWidth = 3;
    drawLine(ctx, line);
  }
  drawDot(ctx, playerPosition, '#2ec4b6', 5);
  opponents.forEach(opponent => drawDot(ctx, opponent, opponent.color || '#ff4d6d', 4));
}

function ensureCanvas() {
  let panel = document.getElementById('race-minimap');
  if (!panel) {
    panel = document.createElement('div');
    panel.id = 'race-minimap';
    panel.className = 'race-minimap';
    panel.innerHTML = '<canvas id="race-minimap-canvas" width="190" height="132"></canvas>';
    document.body.appendChild(panel);
  }
  return document.getElementById('race-minimap-canvas');
}

function drawLine(ctx, line) {
  ctx.beginPath();
  line.forEach(([x, y], index) => {
    const p = worldToMiniMapPosition({ x, y });
    if (index === 0) ctx.moveTo(p.x, p.y);
    else ctx.lineTo(p.x, p.y);
  });
  ctx.closePath();
  ctx.stroke();
}

function drawDot(ctx, pos, color, radius) {
  if (!pos) return;
  const p = worldToMiniMapPosition(pos);
  ctx.beginPath();
  ctx.arc(p.x, p.y, radius, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 1;
  ctx.stroke();
}
