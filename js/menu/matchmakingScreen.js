// 매치메이킹 / 입장 대기 풀스크린 오버레이. MagicRings 배경 + 중앙 텍스트.
// 사용: showMatchmaking({ title, sub, onCancel }), updateMatchmaking(sub), hideMatchmaking().

import { MagicRings } from './magicRings.js';

let _root = null;
let _rings = null;
let _ringsHost = null;
let _subEl = null;
let _onCancel = null;

function _build({ title, sub, cancelable }) {
  _root = document.createElement('div');
  _root.id = 'sd-matchmaking';
  _root.innerHTML = `
    <div class="sd-mm-bg" id="sd-mm-bg"></div>
    <div class="sd-mm-content">
      <div class="sd-mm-pulse">
        <span class="sd-mm-dot"></span>
        <span class="sd-mm-kicker">MATCHMAKING</span>
      </div>
      <div class="sd-mm-title">${title || 'FINDING RACERS'}</div>
      <div class="sd-mm-sub" id="sd-mm-sub">${sub || '서버에서 매칭 중...'}</div>
      ${cancelable
        ? '<button class="sd-mm-cancel" id="sd-mm-cancel">CANCEL</button>'
        : ''}
    </div>
  `;
  document.body.appendChild(_root);

  _ringsHost = _root.querySelector('#sd-mm-bg');
  _subEl = _root.querySelector('#sd-mm-sub');
  _rings = new MagicRings(_ringsHost, {
    color:        '#ee2a0d',  // 브랜드 Sonic red
    colorTwo:     '#f1e4df',  // Paper cream
    ringCount:    6,
    speed:        1,
    attenuation:  10,
    lineThickness:2,
    baseRadius:   0.35,
    radiusStep:   0.1,
    scaleRate:    0.1,
    opacity:      1,
    blur:         0,
    noiseAmount:  0.1,
    rotation:     0,
    ringGap:      1.5,
    fadeIn:       0.7,
    fadeOut:      0.5,
    followMouse:  false,
    mouseInfluence: 0.2,
    hoverScale:   1.2,
    parallax:     0.05,
    clickBurst:   false,
  });

  if (cancelable) {
    const btn = _root.querySelector('#sd-mm-cancel');
    btn?.addEventListener('click', () => {
      if (_onCancel) _onCancel();
      hideMatchmaking();
    });
  }
}

export function showMatchmaking({ title, sub, onCancel, cancelable = true } = {}) {
  if (_root) {
    updateMatchmaking(sub);
    return;
  }
  _onCancel = onCancel || null;
  _build({ title, sub, cancelable });
}

export function updateMatchmaking(sub) {
  if (_subEl && sub != null) _subEl.textContent = sub;
}

export function hideMatchmaking() {
  if (_rings) { _rings.dispose(); _rings = null; }
  if (_root) { _root.remove(); _root = null; }
  _ringsHost = null;
  _subEl = null;
  _onCancel = null;
}

export function isMatchmakingShown() { return !!_root; }
