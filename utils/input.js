import { getMobileInput } from '../js/mobileControls.js';

export const keys = {};
const justPressed = {};
const justReleased = {};
const bufferedPress = {};
let lastShiftTapAt = 0;
const SHIFT_DOUBLE_TAP_MS = 360;
const PRESS_BUFFER_MS = 140;

window.addEventListener('keydown', e => {
  if (_isEditableTarget(e.target)) return;
  if (!keys[e.code]) {
    justPressed[e.code] = true;
    bufferedPress[e.code] = performance.now() + PRESS_BUFFER_MS;
    if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') {
      const now = performance.now();
      if (now - lastShiftTapAt <= SHIFT_DOUBLE_TAP_MS) {
        justPressed.ShiftDouble = true;
        bufferedPress.ShiftDouble = now + PRESS_BUFFER_MS;
        lastShiftTapAt = 0;
      } else {
        lastShiftTapAt = now;
      }
    }
  }
  keys[e.code] = true;
  if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space','Enter','NumpadEnter','KeyE'].includes(e.code)) {
    e.preventDefault();
  }
}, { capture: true });

window.addEventListener('keyup', e => {
  if (_isEditableTarget(e.target)) return;
  keys[e.code] = false;
  justReleased[e.code] = true;
  if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space','Enter','NumpadEnter','KeyE'].includes(e.code)) {
    e.preventDefault();
  }
}, { capture: true });

window.addEventListener('blur', () => {
  for (const k in keys) keys[k] = false;
  for (const k in justPressed) delete justPressed[k];
  for (const k in justReleased) delete justReleased[k];
  for (const k in bufferedPress) delete bufferedPress[k];
});

export function wasJustPressed(code) {
  if (justPressed[code]) {
    delete bufferedPress[code];
    return true;
  }
  const until = bufferedPress[code] || 0;
  if (until > performance.now()) {
    delete bufferedPress[code];
    return true;
  }
  return false;
}

export function clearFrameKeys() {
  for (const k in justPressed)  delete justPressed[k];
  for (const k in justReleased) delete justReleased[k];
  const now = performance.now();
  for (const k in bufferedPress) {
    if (bufferedPress[k] <= now) delete bufferedPress[k];
  }
}

export function getInput() {
  const mobile = getMobileInput();
  const throttle = (keys['KeyW'] || keys['ArrowUp'] || mobile.throttle) ? 1 : 0;
  const brake    = (keys['KeyS'] || keys['ArrowDown'])  ? 1 : 0;
  const keyboardSteer = ((keys['KeyD'] || keys['ArrowRight']) ? 1 : 0)
                      - ((keys['KeyA'] || keys['ArrowLeft'])  ? 1 : 0);
  const steer = Math.max(-1, Math.min(1, keyboardSteer + mobile.steer));
  return {
    throttle,
    brake,
    steer,
    handbrake:    !!keys['Space'] || !!keys['Enter'] || !!keys['NumpadEnter'] || mobile.drift,
    handbrakeJust:   wasJustPressed('Space') || wasJustPressed('Enter') || wasJustPressed('NumpadEnter'),
    driftBurst:      wasJustPressed('KeyE') || mobile.doubleDriftJust,
    boost:        !!(keys['ShiftLeft'] || keys['ShiftRight']),
    boostJust:    wasJustPressed('ShiftLeft') || wasJustPressed('ShiftRight') || mobile.boostJust,
    boostDouble:  wasJustPressed('ShiftDouble'),
    gearUp:       wasJustPressed('KeyQ'),
    gearDown:     wasJustPressed('KeyX'),
    autoToggle:   wasJustPressed('KeyT'),
    engineToggle: wasJustPressed('KeyJ'),
    parkingBrake: wasJustPressed('KeyP'),
    reset:        wasJustPressed('KeyR'),
    cameraToggle: wasJustPressed('KeyC'),
    escape:       wasJustPressed('Escape'),
  };
}

function _isEditableTarget(target) {
  const tag = target?.tagName;
  return target?.isContentEditable || tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
}
