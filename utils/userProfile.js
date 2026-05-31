import { getDisplayProfile } from './profile.js';

export const USER_PROFILE_KEY = 'racingUserProfile';

export const profileCustomizations = {
  avatarColors: [
    { id: 'red', name: 'Red', color: '#ef4444' },
    { id: 'blue', name: 'Blue', color: '#3b82f6' },
    { id: 'green', name: 'Green', color: '#22c55e' },
    { id: 'purple', name: 'Purple', color: '#a855f7' },
  ],
  frames: [
    { id: 'basic', name: 'Basic' },
    { id: 'neon', name: 'Neon' },
    { id: 'carbon', name: 'Carbon' },
  ],
  stickers: [
    { id: 'flame', name: 'Flame' },
    { id: 'bolt', name: 'Bolt' },
    { id: 'crown', name: 'Crown' },
    { id: 'trophy', name: 'Trophy' },
  ],
  badges: [
    { id: 'rookie', name: 'Rookie Racer' },
    { id: 'drifter', name: 'Drift Rookie' },
    { id: 'speedster', name: 'Speedster' },
  ],
  titles: [
    { id: 'guest', name: 'Guest Driver' },
    { id: 'racer', name: 'Sandbox Racer' },
    { id: 'challenger', name: 'Challenger' },
  ],
};

const DEFAULT_PROFILE = {
  avatarColor: 'blue',
  profileFrame: 'basic',
  sticker: 'flame',
  badge: 'rookie',
  title: 'guest',
};

export function getUserProfile() {
  let saved = {};
  try {
    saved = JSON.parse(localStorage.getItem(USER_PROFILE_KEY) || '{}') || {};
  } catch {
    saved = {};
  }
  return applyProfileCustomization({ ...DEFAULT_PROFILE, ...saved });
}

export function saveUserProfile(profile) {
  const clean = applyProfileCustomization({ ...getUserProfile(), ...(profile || {}) });
  localStorage.setItem(USER_PROFILE_KEY, JSON.stringify(clean));
  window.dispatchEvent(new CustomEvent('racing:userProfileChange', { detail: clean }));
  return clean;
}

export function applyProfileCustomization(profile) {
  const fallback = { ...DEFAULT_PROFILE, ...(profile || {}) };
  return {
    avatarColor: pickId(profileCustomizations.avatarColors, fallback.avatarColor, DEFAULT_PROFILE.avatarColor),
    profileFrame: pickId(profileCustomizations.frames, fallback.profileFrame, DEFAULT_PROFILE.profileFrame),
    sticker: pickId(profileCustomizations.stickers, fallback.sticker, DEFAULT_PROFILE.sticker),
    badge: pickId(profileCustomizations.badges, fallback.badge, DEFAULT_PROFILE.badge),
    title: pickId(profileCustomizations.titles, fallback.title, DEFAULT_PROFILE.title),
  };
}

export function renderProfileCard(profile = getUserProfile(), player = {}, options = {}) {
  const display = getDisplayProfile();
  const merged = applyProfileCustomization(profile);
  const color = colorById(merged.avatarColor) || player.themeColor || display.themeColor || '#3b82f6';
  const el = document.createElement(options.asListItem ? 'li' : 'article');
  el.className = 'lobby-profile-card'
    + (options.isMe ? ' is-me' : '')
    + (options.isHost ? ' is-host' : '')
    + ` frame-${merged.profileFrame}`;
  el.innerHTML = `
    <div class="lobby-profile-avatar" style="--avatar-color:${escapeAttr(color)}">
      <span>${escapeHtml(initials(player.playerName || display.name || 'Driver'))}</span>
    </div>
    <div class="lobby-profile-main">
      <div class="lobby-profile-name">
        ${escapeHtml(player.playerName || display.name || 'Driver')}
        ${options.isHost ? '<small>HOST</small>' : ''}
      </div>
      <div class="lobby-profile-title">${escapeHtml(nameById(profileCustomizations.titles, merged.title))}</div>
      <div class="lobby-profile-meta">
        <span>Rating ${Number(player.rating || 1000)}</span>
        <span>${escapeHtml(player.carName || player.carId || 'GT3')}</span>
      </div>
    </div>
    <div class="lobby-profile-tags">
      <span>${escapeHtml(nameById(profileCustomizations.stickers, merged.sticker))}</span>
      <span>${escapeHtml(nameById(profileCustomizations.badges, merged.badge))}</span>
      <b class="${player.ready ? 'ready' : ''}">${player.ready ? 'READY' : 'WAIT'}</b>
    </div>
  `;
  return el;
}

export function openProfileEditor() {
  const modal = ensureProfileEditor();
  fillProfileEditor(modal, getUserProfile());
  modal.classList.remove('hidden');
}

function ensureProfileEditor() {
  let modal = document.getElementById('profile-editor-overlay');
  if (modal) return modal;
  modal = document.createElement('div');
  modal.id = 'profile-editor-overlay';
  modal.className = 'profile-editor-overlay hidden';
  modal.innerHTML = `
    <div class="profile-editor-modal" role="dialog" aria-modal="true" aria-label="Edit Profile">
      <header>
        <div>
          <h2>Edit Profile</h2>
          <p>Customize your lobby card.</p>
        </div>
        <button class="btn-icon" id="btn-profile-editor-close" type="button" aria-label="Close">x</button>
      </header>
      <div class="profile-editor-grid">
        ${selectMarkup('avatarColor', 'Avatar color', profileCustomizations.avatarColors)}
        ${selectMarkup('profileFrame', 'Frame', profileCustomizations.frames)}
        ${selectMarkup('sticker', 'Sticker', profileCustomizations.stickers)}
        ${selectMarkup('badge', 'Badge', profileCustomizations.badges)}
        ${selectMarkup('title', 'Title', profileCustomizations.titles)}
      </div>
      <div class="profile-editor-preview" id="profile-editor-preview"></div>
      <footer>
        <button class="btn-secondary" id="btn-profile-editor-cancel" type="button">Cancel</button>
        <button class="btn-primary" id="btn-profile-editor-save" type="button">Save</button>
      </footer>
    </div>
  `;
  document.body.appendChild(modal);
  modal.addEventListener('click', event => {
    if (event.target === modal) modal.classList.add('hidden');
  });
  modal.querySelector('#btn-profile-editor-close')?.addEventListener('click', () => modal.classList.add('hidden'));
  modal.querySelector('#btn-profile-editor-cancel')?.addEventListener('click', () => modal.classList.add('hidden'));
  modal.querySelector('#btn-profile-editor-save')?.addEventListener('click', () => {
    saveUserProfile(readProfileEditor(modal));
    modal.classList.add('hidden');
  });
  modal.querySelectorAll('select').forEach(select => {
    select.addEventListener('change', () => {
      const preview = modal.querySelector('#profile-editor-preview');
      if (preview) {
        preview.innerHTML = '';
        preview.appendChild(renderProfileCard(readProfileEditor(modal), {}, { isMe: true, isHost: true }));
      }
    });
  });
  return modal;
}

function fillProfileEditor(modal, profile) {
  for (const [key, value] of Object.entries(profile)) {
    const select = modal.querySelector(`[data-profile-field="${key}"]`);
    if (select) select.value = value;
  }
  const preview = modal.querySelector('#profile-editor-preview');
  if (preview) {
    preview.innerHTML = '';
    preview.appendChild(renderProfileCard(profile, {}, { isMe: true, isHost: true }));
  }
}

function readProfileEditor(modal) {
  const profile = {};
  modal.querySelectorAll('[data-profile-field]').forEach(select => {
    profile[select.dataset.profileField] = select.value;
  });
  return profile;
}

function selectMarkup(key, label, options) {
  return `
    <label class="profile-editor-field">
      <span>${escapeHtml(label)}</span>
      <select data-profile-field="${escapeAttr(key)}">
        ${options.map(item => `<option value="${escapeAttr(item.id)}">${escapeHtml(item.name)}</option>`).join('')}
      </select>
    </label>
  `;
}

function pickId(items, value, fallback) {
  return items.some(item => item.id === value) ? value : fallback;
}

function colorById(id) {
  return profileCustomizations.avatarColors.find(item => item.id === id)?.color;
}

function nameById(items, id) {
  return items.find(item => item.id === id)?.name || id;
}

function initials(name) {
  return String(name || 'D').trim().slice(0, 2).toUpperCase();
}

function escapeHtml(text) {
  return String(text || '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

function escapeAttr(text) {
  return escapeHtml(text).replace(/`/g, '&#96;');
}
