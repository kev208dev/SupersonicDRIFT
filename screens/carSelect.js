import { CAR_DATA } from '../data/cars.js';
import { getCarPowerTotal, isTranscendCar, renderCarStatRows } from '../js/carStats.js';

let selectedIndex    = 0;
let selectedCategory = 'All';
let onSelect         = null;

const CATEGORIES = ['All', 'GT3', 'Lightweight', 'Prototype', 'Road Car', 'Heavyweight', 'Formula', 'Transcendent'];

export function initCarSelect(cb) {
  onSelect         = cb;
  selectedIndex    = 0;
  selectedCategory = 'All';
  _render();
}

// ── helpers ─────────────────────────────────────────────────
function _filtered() {
  return CAR_DATA.filter(c =>
    selectedCategory === 'All' || c.category === selectedCategory
  );
}

function _render() {
  // ── category tabs ──
  const tabsEl = document.getElementById('cat-tabs');
  if (tabsEl) {
    tabsEl.innerHTML = '';
    CATEGORIES.forEach(cat => {
      const btn = document.createElement('button');
      btn.className = 'cat-tab' + (cat === selectedCategory ? ' active' : '');
      btn.textContent = cat;
      btn.addEventListener('click', () => { selectedCategory = cat; _render(); });
      tabsEl.appendChild(btn);
    });
  }

  // ── car grid ──
  const grid = document.getElementById('car-grid');
  if (!grid) return;
  grid.innerHTML = '';

  _filtered().forEach(car => {
    const idx  = CAR_DATA.indexOf(car);
    const card = document.createElement('div');
    card.className = 'car-card' + (idx === selectedIndex ? ' selected' : '');

    // mini preview canvas
    const previewDiv = document.createElement('div');
    previewDiv.className = 'car-preview';
    const cv = document.createElement('canvas');
    cv.width = 320; cv.height = 150;
    _drawCarPreview(cv, car);
    previewDiv.appendChild(cv);

    card.appendChild(previewDiv);
    card.insertAdjacentHTML('beforeend', `
      <div class="car-name">${car.name}</div>
        <span class="car-badge ${isTranscendCar(car.id) ? 'transcend-badge' : ''}">${isTranscendCar(car.id) ? 'TRANSCEND' : car.rarity || car.category}</span>
      <div class="car-tags">
        <span>${car.driveType}</span>
        <span>${car.power} hp</span>
        <span>READY</span>
      </div>
      <div class="car-power">Total Power <b>${getCarPowerTotal(car.id)}</b></div>
      <div class="car-spec car-stat-list">
        ${renderCarStatRows(car)}
      </div>
    `);

    card.addEventListener('click', () => {
      selectedIndex = idx;
      _render();
    });
    grid.appendChild(card);
  });

  // ── description ──
  const descEl = document.getElementById('car-desc');
  const selCar = CAR_DATA[selectedIndex];
  if (descEl && selCar) descEl.textContent = selCar.description;
  showCarCinematic(selCar?.id, selCar?.skin?.id || 'factory');

  // ── confirm button ──
  const btn = document.getElementById('btn-to-track');
  if (btn) btn.onclick = () => {
    const car = CAR_DATA[selectedIndex];
    if (onSelect) onSelect(car);
  };
}

export function initCarCinematicPreview() {
  const host = document.getElementById('car-cinematic-preview');
  if (host) return host;
  const screen = document.getElementById('screen-carselect') || document.getElementById('screen-skinselect');
  const grid = document.getElementById('car-grid');
  if (!screen || !grid) return null;
  const panel = document.createElement('section');
  panel.id = 'car-cinematic-preview';
  panel.className = 'car-cinematic-preview ui-card';
  panel.innerHTML = `
    <canvas id="car-cinematic-canvas" width="520" height="220" aria-label="Selected car preview"></canvas>
    <div class="car-cinematic-info" id="car-cinematic-info"></div>
  `;
  screen.insertBefore(panel, grid.parentElement || grid);
  return panel;
}

export function showCarCinematic(carId, skinId = 'factory') {
  const car = CAR_DATA.find(item => item.id === carId) || CAR_DATA[0];
  const panel = initCarCinematicPreview();
  const canvas = document.getElementById('car-cinematic-canvas');
  if (!panel || !canvas || !car) return;
  applyPreviewSkin(carId, skinId);
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const bg = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
  bg.addColorStop(0, '#050816');
  bg.addColorStop(0.55, '#111827');
  bg.addColorStop(1, '#020617');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = 'rgba(56,189,248,0.16)';
  ctx.beginPath();
  ctx.ellipse(canvas.width / 2, canvas.height - 42, 180, 24, 0, 0, Math.PI * 2);
  ctx.fill();
  const preview = document.createElement('canvas');
  preview.width = 320;
  preview.height = 140;
  _drawCarPreview(preview, car);
  ctx.drawImage(preview, 100, 44, 320, 140);
  updateCarPreviewStats(carId);
}

export function updateCarPreviewStats(carId) {
  const car = CAR_DATA.find(item => item.id === carId) || CAR_DATA[0];
  const info = document.getElementById('car-cinematic-info');
  if (!info || !car) return;
  info.innerHTML = `
    <span class="ui-kicker">${car.category}</span>
    <h2 class="ui-section-title">${car.name}</h2>
    <p class="ui-muted">${car.description}</p>
    <div class="car-power cinematic-power">Total Power <b>${getCarPowerTotal(car.id)}</b></div>
    <div class="car-stat-list">${renderCarStatRows(car)}</div>
  `;
}

export function rotatePreviewCar() {
  // The preview uses a lightweight cinematic redraw, so rotation is intentionally
  // simulated by the showroom glow rather than a separate heavy scene.
}

export function applyPreviewSkin(carId, skinId) {
  return { carId, skinId };
}

export function stopCarCinematicPreview() {
  const panel = document.getElementById('car-cinematic-preview');
  if (panel) panel.remove();
}

// ── mini car drawing ─────────────────────────────────────────
const PREVIEW_DESIGNS = {
  apex_gt3: { kind: 'gt', body: '#cfd8dc', accent: '#e11218', wheel: '#e11218', stripe: 'side', wing: true, length: 122, height: 30 },
  feather_sprint: { kind: 'classic', body: '#1b7f3a', accent: '#f2f5f6', wheel: '#cfd8dc', stripe: 'center', fin: true, length: 112, height: 27 },
  nitro_street: { kind: 'muscle', body: '#f57c00', accent: '#050505', wheel: '#050505', stripe: 'dual', scoop: true, length: 120, height: 32 },
  lmp: { kind: 'cyber', body: '#111111', accent: '#00d9ff', wheel: '#00d9ff', stripe: 'center', wing: true, length: 124, height: 25 },
  titan_v12: { kind: 'buggy', body: '#ffc400', accent: '#050505', wheel: '#ffc400', cage: true, length: 104, height: 31 },
  shadow_rs: { kind: 'rally', body: '#1565c0', accent: '#f2f5f6', wheel: '#f2f5f6', stripe: 'center', wing: true, length: 108, height: 33 },
  neon_wraith: { kind: 'hyper', body: '#7b1fa2', accent: '#00d9ff', wheel: '#00d9ff', stripe: 'channel', wing: true, length: 126, height: 25 },
  zero_f1: { kind: 'formula', body: '#e11218', accent: '#f2f5f6', wheel: '#050505', stripe: 'center', length: 126, height: 23 },
  singularity_vmax: { kind: 'hyper', body: '#35f5ff', accent: '#ffd166', wheel: '#35f5ff', stripe: 'channel', wing: true, length: 130, height: 23 },
  grip_oracle: { kind: 'formula', body: '#4ade80', accent: '#f2f5f6', wheel: '#050505', stripe: 'center', length: 118, height: 22 },
  boost_phoenix: { kind: 'muscle', body: '#ff4a08', accent: '#ffd166', wheel: '#ff4a08', stripe: 'dual', scoop: true, length: 122, height: 31 },
};

function _drawCarPreview(canvas, car) {
  const ctx = canvas.getContext('2d');
  const w = canvas.width, h = canvas.height;
  const spec = PREVIEW_DESIGNS[car.id] || { kind: 'gt', body: car.color, accent: '#ffd84a', wheel: car.color, length: 114, height: 30 };
  ctx.clearRect(0, 0, w, h);

  const bg = ctx.createLinearGradient(0, 0, w, h);
  bg.addColorStop(0, '#233142');
  bg.addColorStop(0.55, '#0f172a');
  bg.addColorStop(1, '#030712');
  ctx.fillStyle = bg;
  ctx.beginPath();
  ctx.roundRect(8, 8, w - 16, h - 16, 18);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.16)';
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.fillStyle = 'rgba(56,189,248,0.18)';
  ctx.beginPath();
  ctx.ellipse(w / 2, h - 28, w * 0.34, 14, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.save();
  const scale = Math.min(w / 190, h / 86);
  ctx.translate(w / 2, h / 2 + 18);
  ctx.scale(scale, scale);
  ctx.rotate(-0.035);

  ctx.fillStyle = 'rgba(0,0,0,0.36)';
  ctx.beginPath();
  ctx.ellipse(0, 19, spec.length * 0.45, 7.5, 0, 0, Math.PI * 2);
  ctx.fill();

  if (spec.kind === 'formula') {
    _drawFormulaPreview(ctx, spec);
  } else if (spec.kind === 'buggy') {
    _drawBuggyPreview(ctx, spec);
  } else {
    _drawClosedWheelPreview(ctx, spec);
  }

  ctx.restore();
}

function _drawClosedWheelPreview(ctx, spec) {
  const L = spec.length;
  const H = spec.height;
  const bodyGrad = ctx.createLinearGradient(-L / 2, -H, L / 2, H);
  bodyGrad.addColorStop(0, '#ffffff');
  bodyGrad.addColorStop(0.20, spec.body);
  bodyGrad.addColorStop(1, '#10151c');

  _drawWheel(ctx, -L * 0.34, 12, spec.kind === 'rally' ? 11 : 10.5, spec.wheel);
  _drawWheel(ctx, L * 0.34, 12, spec.kind === 'rally' ? 11 : 10.5, spec.wheel);

  ctx.fillStyle = bodyGrad;
  ctx.beginPath();
  ctx.moveTo(-L * 0.50, 7);
  ctx.bezierCurveTo(-L * 0.43, -H * 0.20, -L * 0.24, -H * 0.62, -L * 0.02, -H * 0.70);
  ctx.bezierCurveTo(L * 0.18, -H * 0.78, L * 0.36, -H * 0.26, L * 0.50, 5);
  ctx.bezierCurveTo(L * 0.38, 15, -L * 0.38, 15, -L * 0.50, 7);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = 'rgba(6,16,24,0.84)';
  ctx.beginPath();
  ctx.ellipse(L * 0.08, -H * 0.36, spec.kind === 'classic' ? 18 : 24, spec.kind === 'muscle' ? 9 : 10.5, -0.02, 0, Math.PI * 2);
  ctx.fill();

  if (spec.stripe === 'center') _stripe(ctx, spec.accent, -L * 0.38, -5, L * 0.76, 3);
  if (spec.stripe === 'dual') {
    _stripe(ctx, spec.accent, -L * 0.38, -8, L * 0.78, 3);
    _stripe(ctx, spec.accent, -L * 0.38, -2, L * 0.78, 3);
  }
  if (spec.stripe === 'side') {
    _stripe(ctx, spec.accent, -L * 0.42, 3, L * 0.58, 4);
  }
  if (spec.stripe === 'channel') {
    _stripe(ctx, '#050505', -L * 0.34, -7, L * 0.58, 6);
    _headlight(ctx, spec.accent, L * 0.34, -8);
  }

  if (spec.scoop) {
    ctx.fillStyle = spec.accent;
    ctx.beginPath();
    ctx.roundRect(L * 0.06, -H * 0.66, 22, 8, 2);
    ctx.fill();
  }
  if (spec.fin) {
    ctx.fillStyle = spec.body;
    ctx.fillRect(-L * 0.32, -H * 0.80, 18, 16);
  }
  if (spec.wing) {
    ctx.fillStyle = spec.kind === 'rally' ? spec.body : '#050505';
    ctx.fillRect(-L * 0.45, -H * 0.86, 40, 5);
    ctx.fillRect(-L * 0.36, -H * 0.73, 4, 14);
  }

  ctx.fillStyle = '#050505';
  ctx.fillRect(L * 0.35, 2, 20, 5);
  if (spec.kind === 'gt') _headlight(ctx, '#f2f5f6', L * 0.34, -3);
}

function _drawBuggyPreview(ctx, spec) {
  const L = spec.length;
  const H = spec.height;
  _drawWheel(ctx, -L * 0.35, 12, 14, spec.wheel);
  _drawWheel(ctx, L * 0.35, 12, 14, spec.wheel);

  ctx.fillStyle = spec.body;
  ctx.beginPath();
  ctx.moveTo(-L * 0.40, 9);
  ctx.lineTo(-L * 0.25, -H * 0.38);
  ctx.lineTo(L * 0.22, -H * 0.44);
  ctx.lineTo(L * 0.42, 7);
  ctx.closePath();
  ctx.fill();

  ctx.strokeStyle = spec.accent;
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(-L * 0.22, -H * 0.36);
  ctx.lineTo(-L * 0.08, -H * 0.92);
  ctx.lineTo(L * 0.22, -H * 0.84);
  ctx.lineTo(L * 0.30, -H * 0.34);
  ctx.moveTo(-L * 0.08, -H * 0.92);
  ctx.lineTo(-L * 0.16, -H * 0.34);
  ctx.stroke();

  ctx.fillStyle = 'rgba(6,16,24,0.82)';
  ctx.beginPath();
  ctx.ellipse(0, -H * 0.34, 18, 8, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = spec.accent;
  ctx.fillRect(L * 0.34, 1, 24, 5);
  ctx.fillRect(-L * 0.53, 2, 22, 5);
}

function _drawFormulaPreview(ctx, spec) {
  const L = spec.length;
  const H = spec.height;
  _drawWheel(ctx, -L * 0.37, 12, 10.5, spec.wheel);
  _drawWheel(ctx, L * 0.33, 12, 10.5, spec.wheel);
  _drawWheel(ctx, -L * 0.37, -15, 9.5, spec.wheel);
  _drawWheel(ctx, L * 0.33, -15, 9.5, spec.wheel);

  ctx.fillStyle = spec.body;
  ctx.beginPath();
  ctx.moveTo(-L * 0.44, 2);
  ctx.lineTo(-L * 0.26, -H * 0.48);
  ctx.lineTo(L * 0.46, -H * 0.22);
  ctx.lineTo(L * 0.50, 1);
  ctx.closePath();
  ctx.fill();
  ctx.fillRect(-L * 0.10, -H * 0.55, 40, 13);
  ctx.fillStyle = 'rgba(6,16,24,0.84)';
  ctx.beginPath();
  ctx.ellipse(-L * 0.02, -H * 0.66, 14, 7, 0, 0, Math.PI * 2);
  ctx.fill();
  _stripe(ctx, spec.accent, -L * 0.36, -7, L * 0.74, 3);

  ctx.fillStyle = '#050505';
  ctx.fillRect(L * 0.35, -25, 30, 5);
  ctx.fillRect(-L * 0.58, -3, 34, 5);
  ctx.strokeStyle = '#050505';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-L * 0.20, -2);
  ctx.lineTo(-L * 0.37, -15);
  ctx.moveTo(L * 0.12, -3);
  ctx.lineTo(L * 0.33, -15);
  ctx.stroke();
}

function _drawWheel(ctx, x, y, r, rim) {
  ctx.fillStyle = '#050505';
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = rim;
  ctx.lineWidth = 3;
  ctx.stroke();
  ctx.fillStyle = '#b8c0c8';
  ctx.beginPath();
  ctx.arc(x, y, r * 0.36, 0, Math.PI * 2);
  ctx.fill();
}

function _stripe(ctx, color, x, y, w, h) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, h / 2);
  ctx.fill();
}

function _headlight(ctx, color, x, y) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.ellipse(x, y, 8, 3, -0.18, 0, Math.PI * 2);
  ctx.fill();
}
