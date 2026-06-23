// 실시간 튜닝 패널 — 주행 중 드리프트 상수 즉시 조절. 로직 ❌, 값만.
// 토글: F4. 조작: ↑↓ 선택, ←→ (또는 -/=) 증감. 변경 시 콘솔에 'NAME = value' 출력.

import { KART_TUNING as K, KART_CAMERA as KC } from '../kart-boost/config.js';

let _panelOn = false;
let _selected = 0;

const ITEMS = [
  { name: 'DRIFT_SLIP_GAIN',
    get: () => K.DRIFT_SLIP_GAIN,
    set: v => { K.DRIFT_SLIP_GAIN = v; },
    step: 0.1, min: 0.5, max: 3.0, fmt: 3 },
  { name: 'DRIFT_ARC_GRIP',
    get: () => K.DRIFT_ARC_GRIP,
    set: v => { K.DRIFT_ARC_GRIP = v; },
    step: 0.05, min: 0.0, max: 1.0, fmt: 3 },
  { name: 'COUNTER_STEER_RECOVERY_RATE',
    get: () => K.COUNTER_STEER_RECOVERY_RATE,
    set: v => { K.COUNTER_STEER_RECOVERY_RATE = v; },
    step: 1.0, min: 1, max: 30, fmt: 2 },
  { name: 'DRIFT_GRACE_TIME',
    get: () => K.DRIFT_GRACE_TIME,
    set: v => { K.DRIFT_GRACE_TIME = v; },
    step: 0.02, min: 0, max: 0.6, fmt: 3 },
  { name: 'IDLE_SLIP_DECAY',
    get: () => K.IDLE_SLIP_DECAY,
    set: v => { K.IDLE_SLIP_DECAY = v; },
    step: 0.1, min: 0, max: 5, fmt: 2 },
  { name: 'IDLE_STEER_DEAD',
    get: () => K.IDLE_STEER_DEAD,
    set: v => { K.IDLE_STEER_DEAD = v; },
    step: 0.01, min: 0, max: 0.3, fmt: 2 },
  { name: 'LEAN_DAMPING',
    get: () => KC.LEAN_DAMPING,
    set: v => { KC.LEAN_DAMPING = v; },
    step: 0.02, min: 0.04, max: 0.5, fmt: 3 },
  { name: 'YAW_DAMPING',
    get: () => K.YAW_DAMPING,
    set: v => { K.YAW_DAMPING = v; },
    step: 0.05, min: 0, max: 1.0, fmt: 3 },
  { name: 'MAX_YAW_ACCEL',
    get: () => K.MAX_YAW_ACCEL,
    set: v => { K.MAX_YAW_ACCEL = v; },
    step: 0.5, min: 1, max: 30, fmt: 2 },
  { name: 'YAW_RATE_SMOOTH',
    get: () => K.YAW_RATE_SMOOTH,
    set: v => { K.YAW_RATE_SMOOTH = v; },
    step: 0.25, min: 0.5, max: 12, fmt: 2 },
  // STEER_SMOOTH 바뀌면 실제 작동값 STEER_ENGAGE 도 1/SMOOTH 로 자동 갱신.
  { name: 'STEER_SMOOTH',
    get: () => K.STEER_SMOOTH,
    set: v => { K.STEER_SMOOTH = v; K.STEER_ENGAGE = 1 / Math.max(0.02, v); },
    step: 0.02, min: 0.05, max: 0.5, fmt: 3 },
  // DRIFT_ENTRY_KICK alias = DRIFT_ENTRY_YAW (실제 적용 값)
  { name: 'DRIFT_ENTRY_KICK',
    get: () => K.DRIFT_ENTRY_YAW,
    set: v => { K.DRIFT_ENTRY_YAW = v; K.DRIFT_ENTRY_KICK = v; },
    step: 0.05, min: 0.0, max: 1.0, fmt: 3 },
  // MAX_SLIP_ANGLE 는 라디안. UI는 도(°) 단위.
  { name: 'MAX_SLIP_ANGLE_DEG',
    get: () => K.MAX_SLIP_ANGLE * 180 / Math.PI,
    set: v => { K.MAX_SLIP_ANGLE = v * Math.PI / 180; },
    step: 5, min: 15, max: 90, fmt: 1 },
  { name: 'DRIFT_ENTRY_DECEL_KBASE',
    get: () => K.DRIFT_KBASE,
    set: v => { K.DRIFT_KBASE = v; },
    step: 1, min: 0, max: 30, fmt: 1 },
  { name: 'MAX_SPEED',
    get: () => K.MAX_SPEED,
    set: v => { K.MAX_SPEED = v; },
    step: 10, min: 80, max: 400, fmt: 1 },
  { name: 'BOOST_MAX_SPEED',
    get: () => K.BOOST_MAX_SPEED,
    set: v => { K.BOOST_MAX_SPEED = v; },
    step: 10, min: 100, max: 500, fmt: 1 },
  { name: 'BOOST_INSTANT_DV',
    get: () => K.BOOST_INSTANT_DV,
    set: v => { K.BOOST_INSTANT_DV = v; },
    step: 5, min: 0, max: 200, fmt: 1 },
  { name: 'BOOST_SUSTAIN_ACCEL',
    get: () => K.BOOST_SUSTAIN_ACCEL,
    set: v => { K.BOOST_SUSTAIN_ACCEL = v; },
    step: 10, min: 0, max: 400, fmt: 1 },
  { name: 'DRIFT_SIDE_GRIP',
    get: () => K.DRIFT_SIDE_GRIP,
    set: v => { K.DRIFT_SIDE_GRIP = v; K.GRIP_DRIFT = v; },
    step: 0.005, min: 0.90, max: 1.0, fmt: 4 },
];

function _adjust(dir) {
  const it = ITEMS[_selected];
  const cur = it.get();
  let v = cur + dir * it.step;
  v = Math.max(it.min, Math.min(it.max, v));
  v = Math.round(v * 10000) / 10000;
  it.set(v);
  console.log(`${it.name} = ${v}`);
}

if (typeof window !== 'undefined') {
  window.addEventListener('keydown', e => {
    if (e.code === 'F4') {
      _panelOn = !_panelOn;
      e.preventDefault();
      return;
    }
    if (!_panelOn) return;
    if (e.code === 'ArrowUp' || e.code === 'BracketLeft') {
      _selected = (_selected - 1 + ITEMS.length) % ITEMS.length;
      e.preventDefault();
    } else if (e.code === 'ArrowDown' || e.code === 'BracketRight') {
      _selected = (_selected + 1) % ITEMS.length;
      e.preventDefault();
    } else if (e.code === 'ArrowLeft' || e.code === 'Minus' || e.code === 'NumpadSubtract') {
      _adjust(-1);
      e.preventDefault();
    } else if (e.code === 'ArrowRight' || e.code === 'Equal' || e.code === 'NumpadAdd') {
      _adjust(1);
      e.preventDefault();
    }
  }, true);
}

export function isTunePanelOn() { return _panelOn; }

export function drawTunePanel(ctx, w) {
  if (!_panelOn) return;
  const pw = 360;
  const pad = 12;
  const rowH = 22;
  const headerH = 40;
  const ph = headerH + ITEMS.length * rowH + 10;
  const x = w - pw - 16;
  const y = 100;
  ctx.save();
  // 배경
  ctx.fillStyle = 'rgba(0,0,0,0.78)';
  ctx.fillRect(x, y, pw, ph);
  ctx.strokeStyle = 'rgba(255,255,255,0.22)';
  ctx.strokeRect(x + 0.5, y + 0.5, pw - 1, ph - 1);
  // 헤더
  ctx.font = 'bold 12px monospace';
  ctx.fillStyle = '#ffd166';
  ctx.textAlign = 'left';
  ctx.fillText('TUNE PANEL  (F4 close)', x + pad, y + 18);
  ctx.font = '10px monospace';
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  ctx.fillText('↑↓ select   ←→ or -/= adjust', x + pad, y + 32);
  // 항목
  ctx.font = '12px monospace';
  for (let i = 0; i < ITEMS.length; i++) {
    const it = ITEMS[i];
    const val = it.get();
    const sel = (i === _selected);
    const ry = y + headerH + i * rowH;
    if (sel) {
      ctx.fillStyle = 'rgba(255, 209, 102, 0.22)';
      ctx.fillRect(x + 4, ry - 14, pw - 8, rowH - 2);
    }
    ctx.fillStyle = sel ? '#ffffff' : 'rgba(255,255,255,0.78)';
    const prefix = sel ? '▶ ' : '  ';
    const label = it.name.padEnd(28).slice(0, 28);
    const valStr = val.toFixed(it.fmt || 3);
    ctx.fillText(`${prefix}${label} = ${valStr}`, x + pad, ry);
  }
  ctx.restore();
}
