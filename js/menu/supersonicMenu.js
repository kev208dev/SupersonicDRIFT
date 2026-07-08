// Supersonic Drift 메인 메뉴 — Hyperspeed 배경 + ASCII 타이틀.
// Stage 1: 배경 + 타이틀. Stage 2/3: 카드 전환, 계정, 리더보드, 광고 (다음 커밋).

import { Hyperspeed } from './hyperspeed.js';
import { CanvAscii } from './asciiText.js';
import { showFreeRoomIntro } from '../effects/raceCountdown.js';

let _hs = null;
let _ascii = null;
let _resizeHandler = null;
let _onlineTimer = null;
let _onlineCount = 1240;

export function initSupersonicMenu() {
  // 이미 init 된 경우 재진입 방지.
  if (document.getElementById('sd-root')) return;

  const screen = document.getElementById('screen-main');
  if (!screen) return;

  // 기존 마크업 보존: 새 디자인을 위에 얹고 기존 hero 콘텐츠 hide.
  // (Stage 3에서 기존 lobby DOM 제거 또는 분리)
  const old = screen.querySelector('.main-menu');
  if (old) old.style.display = 'none';

  const root = document.createElement('div');
  root.id = 'sd-root';
  root.innerHTML = `
    <div id="sd-hyperspeed" class="sd-hyperspeed"></div>
    <div class="sd-vignette"></div>
    <div id="sd-screen-menu" class="sd-screen-menu">
      <div class="sd-topbar">
        <div>
          <img class="sd-logo-img" src="assets/SSD-Logo-Assets/horizontal-lockup.png" alt="SuperSonic Drift" />
          <div class="sd-subline">
            <span class="sd-dot-online"></span>
            <span id="sd-online-count">1,240</span> RACERS ONLINE · NEON CIRCUIT LOBBY
          </div>
        </div>
        <div class="sd-acct-cluster">
          <button class="sd-acct-chip" id="sd-acct-chip" type="button">
            <span class="sd-acct-avatar">G</span>
            <b id="sd-acct-name">Guest</b>
            <span class="sd-acct-status">NOT SIGNED IN</span>
            <span class="sd-coin">★ <span id="sd-acct-coin">0</span></span>
            <span class="sd-acct-caret" id="sd-acct-caret">▾</span>
          </button>
          <div class="sd-acct-panel" id="sd-acct-panel" hidden>
            <div class="sd-acct-section">
              <div class="sd-acct-section-title">RACER NAME</div>
              <input id="sd-acct-input" type="text" maxlength="16" value="Guest" class="sd-acct-input" />
              <div class="sd-acct-row">
                <label class="sd-acct-color-label">
                  COLOR
                  <input id="sd-acct-color" type="color" value="#28e0ff" />
                </label>
                <button id="sd-acct-save" class="sd-acct-save" type="button">Save Guest Name</button>
              </div>
              <div class="sd-acct-cars">
                <span id="sd-acct-cars-count">— cars</span>
              </div>
            </div>
            <div class="sd-acct-divider"></div>
            <div class="sd-acct-section">
              <div class="sd-acct-section-title">SAVE YOUR PROGRESS</div>
              <p class="sd-acct-hint">Log in to keep your records and rank.</p>
              <div class="sd-acct-auth-row">
                <button class="sd-pill" id="sd-login" type="button">LOG IN</button>
                <button class="sd-pill sd-pill-cyan" id="sd-signup" type="button">SIGN UP</button>
              </div>
            </div>
          </div>
        </div>
      </div>
      <div class="sd-title-band">
        <div id="sd-ascii" class="ascii-text-container"></div>
      </div>
      <div id="sd-falling" class="sd-falling"></div>
      <div class="sd-content">
        <div class="sd-tagline">Break the sound barrier · drift past Mach 1</div>
        <div class="sd-cards">
          <button class="border-glow-card sd-card" data-action="play" style="--accent:#28e0ff;">
            <span class="edge-light"></span>
            <div class="border-glow-inner sd-card-inner">
              <div class="sd-card-head">
                <span class="sd-card-kicker">01 / PLAY</span>
                <span class="sd-card-arrow">›</span>
              </div>
              <div class="sd-card-body">
                <div class="sd-card-title">QUICK RACE</div>
                <div class="sd-card-sub">Instant match · beat the record</div>
              </div>
            </div>
          </button>
          <button class="border-glow-card sd-card" data-action="ranked" style="--accent:#ff5cc8;">
            <span class="edge-light"></span>
            <div class="border-glow-inner sd-card-inner">
              <div class="sd-card-head">
                <span class="sd-card-kicker">02 / ONLINE</span>
                <span class="sd-card-arrow">›</span>
              </div>
              <div class="sd-card-body">
                <div class="sd-card-title">Rank Game</div>
                <div class="sd-card-sub">Create room · race online</div>
              </div>
            </div>
          </button>
          <button class="border-glow-card sd-card" data-action="rank" style="--accent:#ffd400;">
            <span class="edge-light"></span>
            <div class="border-glow-inner sd-card-inner">
              <div class="sd-card-head">
                <span class="sd-card-kicker">03 / RANK</span>
                <span class="sd-card-arrow">›</span>
              </div>
              <div class="sd-card-body">
                <div class="sd-card-title">RANKING</div>
                <div class="sd-card-sub">Supersonic hall of fame</div>
              </div>
            </div>
          </button>
          <button class="border-glow-card sd-card" data-action="garage" style="--accent:#a855ff;">
            <span class="edge-light"></span>
            <div class="border-glow-inner sd-card-inner">
              <div class="sd-card-head">
                <span class="sd-card-kicker">04 / GARAGE</span>
                <span class="sd-card-arrow">›</span>
              </div>
              <div class="sd-card-body">
                <div class="sd-card-title">CAR SELECT</div>
                <div class="sd-card-sub">Pick your ride · view stats</div>
              </div>
            </div>
          </button>
        </div>
        <div class="sd-controls-hint">WASD Drive · SHIFT Drift · SPACE Boost · R Respawn · TAB Records</div>
      </div>
    </div>
  `;
  screen.appendChild(root);

  // 배경 hyperspeed
  const hsEl = root.querySelector('#sd-hyperspeed');
  _hs = new Hyperspeed(hsEl);
  _hs.start();

  // ASCII 타이틀 — 폰트 로드 후 init.
  _bootAscii();

  // 리사이즈
  _resizeHandler = () => {
    if (_hs) _hs.resize();
  };
  window.addEventListener('resize', _resizeHandler);

  _wireTopbar();
  _wireCards();
  _initBorderGlow();
  _wireAsciiClick();
  _startOnlineCounter();
}

// Deterministic "racers online" — every client at the same wall-clock UTC
// instant sees the same number. Diurnal curve (peak ~21:00 KST = 12:00 UTC),
// seeded noise interpolated across 8s buckets, rare ±bursts on a 45s window.
function _hash01(n) {
  let x = (n | 0) ^ 0x9e3779b9;
  x = Math.imul(x ^ (x >>> 16), 0x85ebca6b);
  x = Math.imul(x ^ (x >>> 13), 0xc2b2ae35);
  x ^= x >>> 16;
  return (x >>> 0) / 4294967295;
}

function _baseOnlineForUtc(utcMs) {
  const h = (utcMs / 3600000) % 24; // UTC hour
  // peak at 12 UTC (≈ 21 KST / evening across most of Asia)
  const w = 0.5 + 0.5 * Math.cos(((h - 12) / 24) * Math.PI * 2);
  // 1970-01-01 was Thursday → +4 offset; 0=Sun, 6=Sat
  const day = (Math.floor(utcMs / 86400000) + 4) % 7;
  const wkBoost = (day === 0 || day === 6) ? 120 : 0;
  return 190 + w * 860 + wkBoost;
}

function _onlineAt(utcMs) {
  const base = _baseOnlineForUtc(utcMs);

  // smooth seeded noise across 8s buckets — same for everyone
  const bucketMs = 8000;
  const idx = Math.floor(utcMs / bucketMs);
  const frac = (utcMs % bucketMs) / bucketMs;
  const n1 = _hash01(idx) - 0.5;
  const n2 = _hash01(idx + 1) - 0.5;
  const t = frac * frac * (3 - 2 * frac); // smoothstep
  const noise = (n1 * (1 - t) + n2 * t) * base * 0.05;

  // rare burst — at most one per 45s window, smoothed in/out
  const burstWin = 45000;
  const bIdx = Math.floor(utcMs / burstWin);
  let burst = 0;
  if (_hash01(bIdx ^ 0xdeadbeef) > 0.85) {
    const sign = _hash01(bIdx ^ 0x1337) > 0.5 ? 1 : -1;
    const mag  = 25 + _hash01(bIdx ^ 0xb007) * 70;
    const bf   = (utcMs % burstWin) / burstWin;
    const env  = Math.sin(bf * Math.PI); // 0 → 1 → 0
    burst = sign * mag * env;
  }

  return Math.max(50, Math.round(base + noise + burst));
}

function _startOnlineCounter() {
  const el = document.getElementById('sd-online-count');
  if (!el) return;
  _onlineCount = _onlineAt(Date.now());
  el.textContent = _onlineCount.toLocaleString();

  const tick = () => {
    const next = _onlineAt(Date.now());
    const prev = _onlineCount;
    if (next !== prev) {
      _onlineCount = next;
      el.textContent = next.toLocaleString();
      el.classList.remove('sd-online-up', 'sd-online-down');
      if (next > prev)      el.classList.add('sd-online-up');
      else if (next < prev) el.classList.add('sd-online-down');
    }
    _onlineTimer = setTimeout(tick, 2000);
  };
  _onlineTimer = setTimeout(tick, 2000);
}

// ASCII 타이틀 클릭 → 천천히 fade → 연습장(practice) 진입.
// Hyperspeed 배경은 그대로 유지 — 시각 연속성.
// ASCII 타이틀 클릭 → 짧은 "FREE ROAM" 토스트 → 메뉴 fade → 연습장 즉시 진입.
function _wireAsciiClick() {
  const ascii = document.getElementById('sd-ascii');
  const menu  = document.getElementById('sd-screen-menu');
  if (!ascii || !menu) return;
  ascii.style.cursor = 'pointer';
  ascii.style.pointerEvents = 'auto';

  ascii.addEventListener('click', (e) => {
    e.stopPropagation();
    if (ascii.dataset.transitioning === '1') return;
    ascii.dataset.transitioning = '1';

    // MagicRings + "FREE ROOM" 풀스크린 인트로 (321 START 동일 효과)
    showFreeRoomIntro(1600);

    if (_hs) _hs.boost(true);
    menu.style.transition = 'opacity 0.6s ease';
    menu.style.opacity = '0';

    setTimeout(() => {
      menu.style.display = 'none';
      if (_hs) _hs.boost(false);
      const root = document.getElementById('sd-root');
      if (root) root.style.display = 'none';
      _showPracticeExitButton();
    }, 700);
  });
}

// 연습장 우측 상단 EXIT 버튼 — 메뉴로 복귀.
function _showPracticeExitButton() {
  let btn = document.getElementById('sd-practice-exit');
  if (!btn) {
    btn = document.createElement('button');
    btn.id = 'sd-practice-exit';
    btn.type = 'button';
    btn.innerHTML = '<span>✕</span> EXIT';
    document.body.appendChild(btn);
    btn.addEventListener('click', _returnToMenu);
    window.addEventListener('keydown', _onPracticeKey);
  }
  btn.style.display = 'inline-flex';
}

function _onPracticeKey(e) {
  if (e.key === 'Escape') _returnToMenu();
}

function _returnToMenu() {
  const root = document.getElementById('sd-root');
  const menu = document.getElementById('sd-screen-menu');
  const ascii = document.getElementById('sd-ascii');
  const btn = document.getElementById('sd-practice-exit');
  if (root) root.style.display = '';
  if (menu) { menu.style.display = ''; menu.style.opacity = '1'; }
  if (ascii) ascii.dataset.transitioning = '0';
  if (btn) btn.style.display = 'none';
}

function _bootAscii() {
  const tryInit = () => {
    if (_ascii) return;
    const el = document.getElementById('sd-ascii');
    if (!el) return;
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) {
      setTimeout(tryInit, 150);
      return;
    }
    _ascii = new CanvAscii({
      text: 'SUPERSONIC\nDRIFT',
      asciiFontSize: 6,      // cols 줄여 글자 굵게 보임
      textFontSize: 320,
      textColor: '#fdf9f3',
      planeBaseHeight: 9,    // (auto-fit 적용되면 무시됨)
      enableWaves: true,
    }, el, r.width, r.height);
    _ascii.init().then(() => _ascii.load());
  };
  // 폰트 로드 기다림
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(tryInit);
  }
  tryInit();
}

function _wireTopbar() {
  const login  = document.getElementById('sd-login');
  const signup = document.getElementById('sd-signup');
  const chip   = document.getElementById('sd-acct-chip');
  const panel  = document.getElementById('sd-acct-panel');
  const caret  = document.getElementById('sd-acct-caret');
  const save   = document.getElementById('sd-acct-save');
  const input  = document.getElementById('sd-acct-input');
  const nameEl = document.getElementById('sd-acct-name');
  const carsEl = document.getElementById('sd-acct-cars-count');

  const openPanel  = () => { panel.hidden = false; chip.classList.add('open'); };
  const closePanel = () => { panel.hidden = true;  chip.classList.remove('open'); };
  const toggle = () => panel.hidden ? openPanel() : closePanel();

  chip?.addEventListener('click', (e) => { e.stopPropagation(); toggle(); });
  panel?.addEventListener('mousedown', (e) => e.stopPropagation());
  document.addEventListener('mousedown', (e) => {
    if (!panel || panel.hidden) return;
    if (chip.contains(e.target) || panel.contains(e.target)) return;
    closePanel();
  });

  // 기존 라우팅 위임 (Stage 3에서 자체 API)
  login?.addEventListener('click', () => { closePanel(); document.getElementById('btn-main-login')?.click(); });
  signup?.addEventListener('click', () => { closePanel(); document.getElementById('btn-main-signup')?.click(); });

  // 게스트 닉네임 — localStorage 저장
  try {
    const saved = localStorage.getItem('sd_guest_name');
    if (saved && nameEl && input) {
      const safe = String(saved).trim().slice(0, 16) || 'Guest';
      nameEl.textContent = safe;
      input.value = safe;
    }
  } catch {}
  save?.addEventListener('click', () => {
    const v = (input?.value || '').trim().slice(0, 16) || 'Guest';
    if (nameEl) nameEl.textContent = v;
    try { localStorage.setItem('sd_guest_name', v); } catch {}
    closePanel();
  });

  // 차량 카운트 — TODO Stage 3: 실제 unlocks API. 일단 안전한 'N cars' 포맷.
  if (carsEl) {
    let n = 0;
    try {
      const raw = window.CAR_DATA || (window.__cars || []);
      n = Array.isArray(raw) ? raw.length : 0;
    } catch {}
    carsEl.textContent = `${n || 0} cars`;
  }
}

function _wireCards() {
  // 카드 → 기존 라우팅에 위임. _dropTitle / boost 효과는 Stage 2-b.
  document.querySelectorAll('#sd-root .border-glow-card').forEach(card => {
    card.addEventListener('click', () => {
      const act = card.dataset.action;
      if (_hs) _hs.boost(true);
      setTimeout(() => { if (_hs) _hs.boost(false); }, 1400);
      if (act === 'play')        document.getElementById('btn-main-play')?.click();
      else if (act === 'ranked') {
        // Rank Game — trackSelect 건너뛰고 바로 lobby/방생성.
        if (typeof window.skipToRankedLobby === 'function') window.skipToRankedLobby();
        else document.getElementById('btn-lobby-ranked')?.click();
      }
      else if (act === 'rank')   document.getElementById('btn-main-leaderboard')?.click();
      else if (act === 'garage') _openGarage();
    });
  });
}

// GARAGE 카드 → 기존 .lobby-car-panel(차량 선택 UI, main.js에서 이미 렌더/wiring 완료)을
// .main-menu 밖 모달로 재배치(reparent)해서 노출. 클론이 아닌 이동이라 id 기반 리스너 그대로 유지.
let _garageModal = null;
let _garagePanelHome = null; // { parent, next } — dispose 시 원위치 복구용

function _ensureGarageModal() {
  if (_garageModal) return _garageModal;
  const modal = document.createElement('div');
  modal.id = 'sd-garage-modal';
  modal.innerHTML = `
    <div class="sd-garage-box">
      <div class="sd-garage-bar">
        <span>GARAGE</span>
        <button id="sd-garage-close" type="button">✕ CLOSE</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
  modal.querySelector('#sd-garage-close').addEventListener('click', _closeGarage);
  modal.addEventListener('mousedown', (e) => { if (e.target === modal) _closeGarage(); });
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && modal.classList.contains('is-open')) _closeGarage();
  });
  _garageModal = modal;
  return modal;
}

function _openGarage() {
  const panel = document.querySelector('.lobby-car-panel');
  if (!panel) return;
  const modal = _ensureGarageModal();
  if (!_garagePanelHome) {
    _garagePanelHome = { parent: panel.parentNode, next: panel.nextSibling };
  }
  modal.querySelector('.sd-garage-box').appendChild(panel);
  modal.classList.add('is-open');
}

function _closeGarage() {
  if (_garageModal) _garageModal.classList.remove('is-open');
}

// 카드별 BorderGlow 색상 — glowColor(HSL) + gradient palette.
const _CARD_GLOW = {
  play:   { h: 190, s: 100, l: 70, colors: ['#28e0ff', '#7fefff', '#0e5ea5'] },
  ranked: { h: 320, s: 100, l: 72, colors: ['#ff5cc8', '#ff99e0', '#c01985'] },
  rank:   { h:  50, s: 100, l: 65, colors: ['#ffd400', '#ffea66', '#cc9900'] },
  garage: { h: 270, s: 100, l: 67, colors: ['#a855ff', '#c896ff', '#7a1fd6'] },
};
const _GRAD_POS = ['80% 55%', '69% 34%', '8% 6%', '41% 38%', '86% 85%', '82% 18%', '51% 4%'];
const _GRAD_KEYS = ['--gradient-one','--gradient-two','--gradient-three','--gradient-four','--gradient-five','--gradient-six','--gradient-seven'];
const _COLOR_MAP = [0, 1, 2, 0, 1, 2, 1];

function _applyGlowVars(card, cfg) {
  const base = `${cfg.h}deg ${cfg.s}% ${cfg.l}%`;
  const stops = [100, 60, 50, 40, 30, 20, 10];
  const keys  = ['', '-60', '-50', '-40', '-30', '-20', '-10'];
  for (let i = 0; i < stops.length; i++) {
    card.style.setProperty(`--glow-color${keys[i]}`, `hsl(${base} / ${stops[i]}%)`);
  }
  for (let i = 0; i < 7; i++) {
    const c = cfg.colors[Math.min(_COLOR_MAP[i], cfg.colors.length - 1)];
    card.style.setProperty(_GRAD_KEYS[i], `radial-gradient(at ${_GRAD_POS[i]}, ${c} 0px, transparent 50%)`);
  }
  card.style.setProperty('--gradient-base', `linear-gradient(${cfg.colors[0]} 0 100%)`);
  card.style.setProperty('--edge-sensitivity', '30');
  card.style.setProperty('--glow-padding', '40px');
  card.style.setProperty('--cone-spread', '25');
  card.style.setProperty('--border-radius', '14px');
}

function _initBorderGlow() {
  document.querySelectorAll('#sd-root .border-glow-card').forEach(card => {
    const cfg = _CARD_GLOW[card.dataset.action] || _CARD_GLOW.play;
    _applyGlowVars(card, cfg);
    card.addEventListener('pointermove', (e) => {
      const b = card.getBoundingClientRect();
      const cx = b.width / 2, cy = b.height / 2;
      const x = e.clientX - b.left, y = e.clientY - b.top;
      const dx = x - cx, dy = y - cy;
      let kx = Infinity, ky = Infinity;
      if (dx !== 0) kx = cx / Math.abs(dx);
      if (dy !== 0) ky = cy / Math.abs(dy);
      const edge = Math.min(Math.max(1 / Math.min(kx, ky), 0), 1);
      let deg = Math.atan2(dy, dx) * 180 / Math.PI + 90; if (deg < 0) deg += 360;
      card.style.setProperty('--edge-proximity', (edge * 100).toFixed(3));
      card.style.setProperty('--cursor-angle', deg.toFixed(3) + 'deg');
    });
  });
}

export function disposeSupersonicMenu() {
  if (_hs) { _hs.dispose(); _hs = null; }
  if (_ascii) { _ascii.dispose(); _ascii = null; }
  if (_resizeHandler) { window.removeEventListener('resize', _resizeHandler); _resizeHandler = null; }
  if (_onlineTimer) { clearTimeout(_onlineTimer); _onlineTimer = null; }
  if (_garagePanelHome) {
    const panel = document.querySelector('.lobby-car-panel');
    if (panel) _garagePanelHome.parent.insertBefore(panel, _garagePanelHome.next);
    _garagePanelHome = null;
  }
  _garageModal?.remove();
  _garageModal = null;
  document.getElementById('sd-root')?.remove();
}
