export const ONBOARDING_KEY = 'racingOnboardingSeen';

export function shouldShowOnboarding() {
  return localStorage.getItem(ONBOARDING_KEY) !== '1';
}

export function renderOnboarding() {
  if (!shouldShowOnboarding() || document.getElementById('onboarding-overlay')) return;
  const el = document.createElement('div');
  el.id = 'onboarding-overlay';
  el.className = 'onboarding-overlay';
  el.innerHTML = `
    <div class="onboarding-card">
      <h2>Welcome to SUPERSONIC DRIFT</h2>
      <ol>
        <li><b>Steer</b><span>Use joystick or A/D.</span></li>
        <li><b>Drift</b><span>Hold Drift or Space/Enter through corners.</span></li>
        <li><b>Double Drift</b><span>Tap E during drift for sharp turns.</span></li>
        <li><b>Boost</b><span>Use Shift or Boost on straights.</span></li>
        <li><b>Finish</b><span>Records save to rankings automatically.</span></li>
      </ol>
      <div>
        <button class="btn-secondary" id="btn-onboarding-skip" type="button">Skip</button>
        <button class="btn-primary" id="btn-onboarding-done" type="button">Start Racing</button>
      </div>
    </div>
  `;
  document.body.appendChild(el);
  el.querySelector('#btn-onboarding-skip')?.addEventListener('click', skipOnboarding);
  el.querySelector('#btn-onboarding-done')?.addEventListener('click', completeOnboarding);
}

export function completeOnboarding() {
  localStorage.setItem(ONBOARDING_KEY, '1');
  document.getElementById('onboarding-overlay')?.remove();
}

export function skipOnboarding() {
  completeOnboarding();
}
