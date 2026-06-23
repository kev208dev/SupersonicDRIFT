import { formatTime } from '../utils/math.js';
import { KMH_PER_UNIT } from './physics.js';
import { drawTunePanel } from './debugPanel.js';

// ─── Kart debug overlay (F3 토글) ──────────────────────────
// 상태(GRIP/DRIFT/순부 윈도우), vF, slip°, gauge, driftTime 실시간 표시.
let _kartDebugOn = false;
if (typeof window !== 'undefined') {
  window.addEventListener('keydown', e => {
    if (e.code === 'F3') {
      _kartDebugOn = !_kartDebugOn;
      e.preventDefault();
    }
  });
}
export function isKartDebugOn() { return _kartDebugOn; }
export function setKartDebug(on) { _kartDebugOn = !!on; }

export function drawHUD(ctx, car, timing, canvasW, canvasH, track, ghost = null) {
  const kmh = car.speed * KMH_PER_UNIT;

  ctx.save();
  ctx.resetTransform();

  // ─── 부스터 통합 (하단 중앙: 스톡 2칸 + 진행 게이지) ──
  _boostUnified(ctx, car, canvasW, canvasH);

  // ─── 속도 (작게, 부스터 위) ──
  _miniSpeed(ctx, kmh, canvasW, canvasH);

  // ─── 드리프트 / off-track / 출부 상태 ──
  _statusLabel(ctx, car, canvasW, canvasH);

  // ─── 랩 타이머 (상단 중앙) ──
  if (timing?.started && timing?.lapStart != null) {
    const elapsed = performance.now() - timing.lapStart;
    ctx.font = "bold 28px 'IBM Plex Mono', monospace";
    ctx.fillStyle = 'rgba(255,255,255,0.92)';
    ctx.textAlign = 'center';
    ctx.fillText(formatTime(elapsed), canvasW / 2, 38);
  }
  if (track?.name) {
    ctx.font = "bold 14px 'Chakra Petch', system-ui";
    ctx.fillStyle = 'rgba(255,255,255,0.65)';
    ctx.textAlign = 'center';
    ctx.fillText(track.name, canvasW / 2, 60);
  }

  // ─── 랩 타임 LAST / BEST + 섹터 (우측 하단) ──
  _lapsRightBottom(ctx, timing, canvasW, canvasH);

  // top-left hint (before first lap start)
  if (!timing?.started) {
    ctx.font = "13px 'IBM Plex Mono', monospace";
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.textAlign = 'left';
    ctx.fillText('W/A/S/D 로 주행 — 출발선 통과 시 랩 시작', 10, 24);
  }

  // minimap (top-right)
  if (track) _drawMinimap(ctx, car, track, canvasW - 250, 20, 230, 165, ghost);

  if (_kartDebugOn) _drawKartDebug(ctx, car);

  // 상시 슬립각 디버그 (heading vs velocity, deg). DRIFT_SLIP_GAIN 튜닝용.
  _drawSlipBadge(ctx, car);

  // F4 실시간 튜닝 패널
  drawTunePanel(ctx, canvasW);

  ctx.restore();
}

function _drawSlipBadge(ctx, car) {
  const beta = Math.abs(car.slipBeta || 0) * 180 / Math.PI;
  const drift = !!car.drifting;
  ctx.save();
  ctx.font = "bold 13px 'IBM Plex Mono', monospace";
  ctx.textAlign = 'left';
  ctx.fillStyle = drift ? '#ffd166' : 'rgba(255,255,255,0.55)';
  ctx.fillText(`SLIP ${beta.toFixed(1)}°${drift ? ' *' : ''}`, 12, 80);
  ctx.restore();
}

function _drawKartDebug(ctx, car) {
  const x = 12, y = 92;
  const w = 260, h = 308;
  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,0.66)';
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = 'rgba(255,255,255,0.18)';
  ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);

  const stateLabel = car.drifting
    ? (car._counterSteer ? 'DRIFT (counter)' : 'DRIFT')
    : (Math.abs(car.driftAngle || 0) > 0.12 ? 'SLIDE' : 'GRIP');
  const reason = car._lastDriftEndReason ? ` (${car._lastDriftEndReason})` : '';
  const slipDeg = (car.driftAngle || 0) * 180 / Math.PI;
  const betaDeg = (car.slipBeta || 0) * 180 / Math.PI;
  const vF = car.forwardSpeed || 0;
  const vL = car.sideSpeed || 0;
  const gauge = car.boostMeter || 0;
  const stock = car.boostStock || 0;
  const driftTime = car.driftTime || 0;
  const surface = car.surface || 'asphalt';

  ctx.font = "bold 11px 'IBM Plex Mono', monospace";
  ctx.textAlign = 'left';
  ctx.fillStyle = '#FFD400';
  ctx.fillText(`STATE: ${stateLabel}${reason}`, x + 8, y + 18);

  ctx.fillStyle = '#fff';
  ctx.font = "11px 'IBM Plex Mono', monospace";
  // ── 차량동역학 / 6단계 분류 ──
  const phase = car.phase || 'STRAIGHT';
  const phaseT = car.phaseTime || 0;
  const yawDeg = ((car.yawRate || 0) * 180 / Math.PI);
  const al = car.axleLoads || {};
  const lines = [
    `phase    : ${phase}  (${phaseT.toFixed(2)}s)`,
    `surface  : ${surface}`,
    `vF / vL  : ${vF.toFixed(1)} / ${vL.toFixed(1)}`,
    `β (slip) : ${betaDeg.toFixed(1)}°  (vis ${slipDeg.toFixed(1)}°)`,
    `yawRate  : ${yawDeg.toFixed(1)}°/s`,
    `aLat/Lng : ${(car.aLat || 0).toFixed(1)} / ${(car.aLong || 0).toFixed(1)}`,
    `N front  : ${(al.front || 0).toFixed(0)}`,
    `N rear   : ${(al.rear || 0).toFixed(0)}`,
    `ΔW lat   : in ${(al.inner || 0).toFixed(0)} / out ${(al.outer || 0).toFixed(0)}`,
    `μ-circle : ${car.frictionCircleOver ? 'OVER' : 'ok'}`,
    `gauge    : ${gauge.toFixed(1)} / 100  stock=${stock}/2`,
    `driftTime: ${driftTime.toFixed(2)} s`,
    `boost    : ${(car.boosting ? 'ON' : 'off')} sus=${(car.boostSustainTimer || 0).toFixed(2)}`,
    `boost FX : power=${(car.boostPower || 0).toFixed(2)} kick=${(car._boostFovKick || 0).toFixed(1)} fire=${(car.boostFireFx || 0).toFixed(2)}`,
  ];
  for (let i = 0; i < lines.length; i++) ctx.fillText(lines[i], x + 8, y + 36 + i * 14);

  // gauge bar
  ctx.fillStyle = 'rgba(255,255,255,0.18)';
  ctx.fillRect(x + 8, y + h - 14, w - 16, 6);
  ctx.fillStyle = gauge >= 30 ? '#67e480' : '#FFD400';
  ctx.fillRect(x + 8, y + h - 14, (w - 16) * Math.min(1, gauge / 100), 6);
  ctx.restore();
}

// ── minimap ──────────────────────────────────────────────────
let _miniCache = null;
let _miniCacheKey = null;

function _drawMinimap(ctx, car, track, x, y, w, h, ghost) {
  // Build & cache static layer (background + track outline) per-track.
  if (_miniCacheKey !== track.id) {
    _miniCache = _buildMinimap(track, w, h);
    _miniCacheKey = track.id;
  }
  ctx.drawImage(_miniCache.canvas, x, y);
  const m = _miniCache;

  if (ghost?.path?.length) {
    ctx.save();
    ctx.strokeStyle = 'rgba(255, 209, 102, 0.9)';
    ctx.lineWidth = 2.2;
    ctx.setLineDash([6, 5]);
    ctx.beginPath();
    ghost.path.forEach((p, i) => {
      const gx = x + (p.x - m.minX) * m.scale + m.padX;
      const gy = y + (p.y - m.minY) * m.scale + m.padY;
      if (i === 0) ctx.moveTo(gx, gy);
      else ctx.lineTo(gx, gy);
    });
    ctx.stroke();
    ctx.setLineDash([]);
    const head = ghost.path[Math.min(ghost.path.length - 1, Math.floor(ghost.path.length * 0.55))];
    const hx = x + (head.x - m.minX) * m.scale + m.padX;
    const hy = y + (head.y - m.minY) * m.scale + m.padY;
    ctx.fillStyle = '#FFD400';
    ctx.beginPath();
    ctx.arc(hx, hy, 4.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // Live overlay: car position dot.
  const cx = x + (car.x - m.minX) * m.scale + m.padX;
  const cy = y + (car.y - m.minY) * m.scale + m.padY;
  // direction indicator
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(Math.atan2(Math.sin(car.angle), Math.cos(car.angle)));
  ctx.fillStyle = '#fff';
  ctx.strokeStyle = '#000';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(6, 0);
  ctx.lineTo(-4, 3);
  ctx.lineTo(-4, -3);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

function _buildMinimap(track, w, h) {
  const cv  = document.createElement('canvas');
  cv.width  = w;
  cv.height = h;
  const c   = cv.getContext('2d');

  const pts  = track.outerBoundary;
  const xs   = pts.map(p => p[0]), ys = pts.map(p => p[1]);
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const minY = Math.min(...ys), maxY = Math.max(...ys);
  const pad  = 12;
  const scale = Math.min((w - pad * 2) / (maxX - minX), (h - pad * 2) / (maxY - minY));
  const padX  = pad + (w - pad * 2 - (maxX - minX) * scale) / 2;
  const padY  = pad + (h - pad * 2 - (maxY - minY) * scale) / 2;
  const tp    = ([px, py]) => [(px - minX) * scale + padX, (py - minY) * scale + padY];

  // panel background
  const bg = c.createLinearGradient(0, 0, w, h);
  bg.addColorStop(0, 'rgba(12,18,26,0.86)');
  bg.addColorStop(1, 'rgba(44,55,62,0.72)');
  c.fillStyle = bg;
  c.fillRect(0, 0, w, h);
  c.strokeStyle = 'rgba(255,255,255,0.32)';
  c.lineWidth = 1;
  c.strokeRect(0.5, 0.5, w - 1, h - 1);

  // track surface (outer minus inner, evenodd fill)
  c.beginPath();
  c.moveTo(...tp(track.outerBoundary[0]));
  for (const p of track.outerBoundary) c.lineTo(...tp(p));
  c.closePath();
  c.moveTo(...tp(track.innerBoundary[0]));
  for (const p of track.innerBoundary) c.lineTo(...tp(p));
  c.closePath();
  c.fillStyle = '#666';
  c.fill('evenodd');

  const center = track.centerLine || [];
  if (center.length) {
    const colors = [track.accentColor || '#FFD400', track.sectors?.[0]?.color || '#A8A8A3', track.sectors?.[1]?.color || '#6E6E69'];
    for (let s = 0; s < 3; s++) {
      const a = Math.floor(center.length * s / 3);
      const b = Math.floor(center.length * (s + 1) / 3);
      c.strokeStyle = colors[s];
      c.lineWidth = 4.2;
      c.lineCap = 'round';
      c.beginPath();
      c.moveTo(...tp(center[a]));
      for (let i = a + 1; i < b; i++) c.lineTo(...tp(center[i]));
      c.stroke();
    }
  }

  // outline
  c.strokeStyle = 'rgba(255,255,255,0.82)';
  c.lineWidth = 1.1;
  c.beginPath();
  c.moveTo(...tp(track.outerBoundary[0]));
  for (const p of track.outerBoundary) c.lineTo(...tp(p));
  c.closePath();
  c.stroke();

  // start line
  if (track.startLine) {
    const sl = track.startLine;
    const [sx1, sy1] = tp([sl.x1, sl.y1]);
    const [sx2, sy2] = tp([sl.x2, sl.y2]);
    c.strokeStyle = '#fff';
    c.lineWidth = 2.5;
    c.beginPath();
    c.moveTo(sx1, sy1);
    c.lineTo(sx2, sy2);
    c.stroke();
  }

  return { canvas: cv, minX, minY, scale, padX, padY };
}

// ─── 통합 부스터 표시: 하단 중앙. 2칸 스톡 + 다음 빈칸이 진행 게이지로 채워짐. ───
function _boostUnified(ctx, car, canvasW, canvasH) {
  const STOCK_MAX = 2;
  const stock = Math.max(0, Math.min(STOCK_MAX, car.boostStock || 0));
  const progress = Math.max(0, Math.min(100, car.boostMeter || 0)) / 100;
  const atMax = stock >= STOCK_MAX;

  const cellW = 134, cellH = 30, gap = 14;
  const totalW = cellW * STOCK_MAX + gap * (STOCK_MAX - 1);
  const x = (canvasW - totalW) / 2;
  const y = canvasH - 56;

  // 라벨 + SPACE 힌트
  ctx.font = "bold 11px 'Chakra Petch', system-ui";
  ctx.textAlign = 'center';
  ctx.fillStyle = atMax ? '#67e480' : 'rgba(255,255,255,0.62)';
  ctx.fillText(atMax ? 'BOOSTER  FULL' : 'BOOSTER', canvasW / 2, y - 8);
  if (stock > 0 && !car.boosting) {
    ctx.font = "bold 11px 'IBM Plex Mono', monospace";
    ctx.fillStyle = '#FFD400';
    ctx.textAlign = 'right';
    ctx.fillText('SPACE', x + totalW, y - 8);
  }

  for (let i = 0; i < STOCK_MAX; i++) {
    const cx = x + i * (cellW + gap);
    const filled = i < stock;
    const isProgress = !filled && i === stock; // 다음 빈 칸이 게이지

    // 배경
    ctx.fillStyle = 'rgba(14,18,26,0.78)';
    ctx.fillRect(cx, y, cellW, cellH);

    // 채움
    if (filled) {
      ctx.save();
      ctx.shadowColor = '#FFD400';
      ctx.shadowBlur = car.boosting ? 16 : 8;
      ctx.fillStyle = '#FFD400';
      ctx.fillRect(cx + 2, y + 2, cellW - 4, cellH - 4);
      ctx.restore();
      // 화살표
      ctx.fillStyle = '#1a1300';
      ctx.font = "bold 18px 'IBM Plex Mono', monospace";
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('▶', cx + cellW / 2, y + cellH / 2 + 1);
      ctx.textBaseline = 'alphabetic';
    } else if (isProgress) {
      const fillCol = car.drifting ? '#FFD400' : '#FFB000';
      ctx.fillStyle = fillCol;
      ctx.fillRect(cx + 2, y + 2, (cellW - 4) * progress, cellH - 4);
      if (car.drifting && progress > 0.05) {
        ctx.save();
        ctx.shadowColor = '#FFD400';
        ctx.shadowBlur = 10;
        ctx.fillStyle = fillCol;
        ctx.fillRect(cx + 2, y + 2, (cellW - 4) * progress, cellH - 4);
        ctx.restore();
      }
    }

    // 외곽
    ctx.strokeStyle = filled ? '#FFD400' : 'rgba(255,255,255,0.28)';
    ctx.lineWidth = filled ? 2 : 1;
    ctx.strokeRect(cx + 0.5, y + 0.5, cellW - 1, cellH - 1);
  }
}

// ─── 작은 속도 표시 (부스터 위) ───
function _miniSpeed(ctx, kmh, canvasW, canvasH) {
  const y = canvasH - 84;
  ctx.font = "bold 28px 'IBM Plex Mono', monospace";
  ctx.textAlign = 'center';
  ctx.fillStyle = 'rgba(255,255,255,0.92)';
  ctx.fillText(`${Math.round(kmh)}`, canvasW / 2, y);
  ctx.font = "bold 10px 'Chakra Petch', system-ui";
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  ctx.fillText('km/h', canvasW / 2, y + 12);
}

// ─── 상태 라벨 ───
function _statusLabel(ctx, car, canvasW, canvasH) {
  const y = canvasH - 108;
  ctx.font = "bold 13px 'IBM Plex Mono', monospace";
  ctx.textAlign = 'center';
  if (car.offTrack) {
    ctx.fillStyle = '#FF453A';
    ctx.fillText('OFF TRACK', canvasW / 2, y);
  } else if (car.drifting) {
    ctx.fillStyle = '#FFD400';
    ctx.fillText('DRIFT!', canvasW / 2, y);
  } else if (car.startBoostFired && (car.boostSustainTimer || 0) > 0) {
    ctx.fillStyle = '#67e480';
    ctx.fillText('START BOOSTER!', canvasW / 2, y);
  } else if (car.boosting) {
    ctx.fillStyle = '#FFD400';
    ctx.fillText('BOOST!', canvasW / 2, y);
  }
}

// ─── 우측 하단 LAP 정보 ───
function _lapsRightBottom(ctx, timing, canvasW, canvasH) {
  const x = canvasW - 240;
  const y = canvasH - 72;
  ctx.textAlign = 'left';

  ctx.font = "11px 'IBM Plex Mono', monospace";
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  ctx.fillText('LAST', x, y);
  ctx.font = "bold 18px 'IBM Plex Mono', monospace";
  ctx.fillStyle = '#fff';
  ctx.fillText(timing?.currentLap ? formatTime(timing.currentLap) : '--:--.---', x, y + 20);

  ctx.font = "11px 'IBM Plex Mono', monospace";
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  ctx.fillText('BEST', x + 120, y);
  ctx.font = "bold 16px 'IBM Plex Mono', monospace";
  ctx.fillStyle = '#A8A8A3';
  ctx.fillText(timing?.bestLap ? formatTime(timing.bestLap) : '--:--.---', x + 120, y + 20);

  _sectors(ctx, timing, x, y + 36, canvasW);
}

function _sectors(ctx, timing, x, y, canvasW) {
  const labels = ['S1', 'S2', 'S3'];
  const times = timing?.sectorTimes || [null, null, null];
  const bests = timing?.sectorBest  || [null, null, null];
  let dx = 0;
  for (let i = 0; i < 3; i++) {
    const t = times[i];
    const best = bests[i];
    let color = '#aaa';
    if (t !== null) {
      color = (best && t <= best) ? '#FFD400' : '#A8A8A3';
    }
    ctx.font = "11px 'IBM Plex Mono', monospace";
    ctx.fillStyle = color;
    ctx.textAlign = 'left';
    ctx.fillText(`${labels[i]} ${t !== null ? formatTime(t) : '--:--.---'}`, x + dx, y);
    ctx.fillStyle = '#6E6E69';
    ctx.fillText(`BEST ${best ? formatTime(best) : '--:--.---'}`, x + dx, y + 17);
    dx += 105;
  }
}
