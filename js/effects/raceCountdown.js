// Race-start countdown overlay — MagicRings bg + center "3 / 2 / 1 / START!".
// Rings appear ONLY during the race-start sequence (READY→3→2→1→START).
// FREE ROOM intro reuses the text overlay only (no rings).
// API:
//   showRaceCountdown()                — mount overlay + rings.
//   updateRaceCountdown(secondsLeft)   — sync displayed digit.
//   hideRaceCountdown()                — fade out + dispose rings + remove DOM.
//   disposeRaceCountdown()             — instant kill (no fade) for screen transitions.
//   showFreeRoomIntro(durationMs)      — text-only FREE ROOM label, auto-dismiss.

import { createMagicRings } from './magicRings.js';

let _root = null;
let _ringsLayer = null;
let _rings = null;
let _slotA = null;
let _slotB = null;
let _activeSlot = 'A';
let _lastLabel = null;
let _flashTimer = null;

function _ensureRoot() {
  if (_root) return _root;
  _root = document.createElement('div');
  _root.id = 'race-countdown-root';
  _root.innerHTML = `
    <div class="rc-stack">
      <span class="rc-slot rc-slot-a"></span>
      <span class="rc-slot rc-slot-b"></span>
    </div>
  `;
  document.body.appendChild(_root);
  _slotA = _root.querySelector('.rc-slot-a');
  _slotB = _root.querySelector('.rc-slot-b');
  _activeSlot = 'A';
  return _root;
}

// 카운트다운 시작 시점에만 호출 — 메뉴/인트로에서는 절대 안 부름.
function _attachRings() {
  if (!_root) return;
  if (_rings) return;
  _ringsLayer = document.createElement('div');
  _ringsLayer.className = 'rc-rings';
  _ringsLayer.id = 'rc-rings';
  _root.insertBefore(_ringsLayer, _root.firstChild);
  _rings = createMagicRings(_ringsLayer, {
    color: '#ff2100',
    colorTwo: '#ffe900',
    speed: 2.6,
    ringCount: 6,
    attenuation: 9,
    lineThickness: 3.5,
    baseRadius: 0.07,
    radiusStep: 0.045,
    scaleRate: 0.08,
    opacity: 1,
    blur: 0,
    noiseAmount: 0,
    rotation: 180,
    ringGap: 1.7,
    fadeIn: 0.35,
    fadeOut: 0.5,
    followMouse: false,
    mouseInfluence: 0,
    hoverScale: 1,
    parallax: 0,
    clickBurst: false,
  });
}

function _detachRings() {
  if (_rings) { _rings.dispose(); _rings = null; }
  if (_ringsLayer) { _ringsLayer.remove(); _ringsLayer = null; }
}

function _showLabel(label, variant /* 'pop' | 'go' | 'free' */) {
  const incoming = _activeSlot === 'A' ? _slotB : _slotA;
  const outgoing = _activeSlot === 'A' ? _slotA : _slotB;
  _activeSlot = _activeSlot === 'A' ? 'B' : 'A';

  outgoing.classList.remove('rc-in-pop', 'rc-in-go', 'rc-in-free');
  outgoing.classList.add('rc-out');

  incoming.classList.remove('rc-out', 'rc-in-pop', 'rc-in-go', 'rc-in-free', 'rc-variant-go', 'rc-variant-free');
  incoming.textContent = label;
  if (variant === 'go')   incoming.classList.add('rc-variant-go');
  if (variant === 'free') incoming.classList.add('rc-variant-free');
  void incoming.offsetWidth;
  incoming.classList.add(
    variant === 'go'   ? 'rc-in-go'   :
    variant === 'free' ? 'rc-in-free' :
                         'rc-in-pop'
  );
}

export function showRaceCountdown() {
  // 이전 hide 타이머가 떠있으면 취소 — 새 overlay가 죽지 않게.
  if (_flashTimer) { clearTimeout(_flashTimer); _flashTimer = null; }
  _ensureRoot();
  _attachRings();
  _root.classList.remove('rc-hide');
  _lastLabel = null;
  if (_slotA) _slotA.textContent = '';
  if (_slotB) _slotB.textContent = '';
}

export function updateRaceCountdown(secondsLeft) {
  if (!_root) {
    // 안전망 — show 안 부르고 update만 부르는 경로 대비 (rings 포함 full overlay).
    _ensureRoot();
    _attachRings();
  }
  let label;
  if (secondsLeft > 3) label = 'READY';
  else if (secondsLeft > 0.35) label = String(Math.ceil(secondsLeft));
  else label = 'START!';

  if (label === _lastLabel) return;
  _lastLabel = label;

  _showLabel(label, label === 'START!' ? 'go' : 'pop');

  // 박자 동기화: 3/2/1 → pulse, START! → flash
  if (_rings) {
    if (label === '3' || label === '2' || label === '1') _rings.pulse(1);
    else if (label === 'START!') _rings.flash();
  }

  if (label === 'START!') {
    if (_flashTimer) clearTimeout(_flashTimer);
    _flashTimer = setTimeout(() => hideRaceCountdown(), 850);
  }
}

export function hideRaceCountdown() {
  if (_flashTimer) { clearTimeout(_flashTimer); _flashTimer = null; }
  if (!_root) return;
  _root.classList.add('rc-hide');
  setTimeout(() => {
    _detachRings();
    if (_root) { _root.remove(); _root = null; }
    _slotA = _slotB = null;
    _activeSlot = 'A';
    _lastLabel = null;
  }, 500);
}

// 즉시 kill — 화면 전환/게임 종료 시 호출 (fade 무시, 잔존 링 강제 제거).
export function disposeRaceCountdown() {
  if (_flashTimer) { clearTimeout(_flashTimer); _flashTimer = null; }
  _detachRings();
  if (_root) { _root.remove(); _root = null; }
  _slotA = _slotB = null;
  _activeSlot = 'A';
  _lastLabel = null;
}

// FREE ROOM 인트로 — 텍스트만, 링 없음.
export function showFreeRoomIntro(durationMs = 1800) {
  _ensureRoot();
  _root.classList.remove('rc-hide');
  _lastLabel = 'FREE ROOM';
  _showLabel('FREE ROOM', 'free');
  if (_flashTimer) clearTimeout(_flashTimer);
  _flashTimer = setTimeout(() => hideRaceCountdown(), durationMs);
}
