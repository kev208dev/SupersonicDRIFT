// ─────────────────────────────────────────────────────────────────────
//  Visual juice: tire smoke, skid marks, sparks, speed lines, screen
//  shake, FOV pump. All effects are cheap (small geometry pools, no
//  per-frame allocation).
// ─────────────────────────────────────────────────────────────────────

import * as THREE from 'three';

// ── tire smoke (3D billboards) ────────────────────────────────────────
export function createSmokePool(scene, count = 80) {
  const geo = new THREE.PlaneGeometry(8, 8);
  geo.rotateX(-Math.PI / 2);
  const smokeTex = _makeSmokeTexture();
  const mat = new THREE.MeshBasicMaterial({
    color: 0xeeeeee,
    map: smokeTex,
    transparent: true,
    opacity: 0.0,
    depthWrite: false,
    alphaTest: 0.02,
  });
  const pool = [];
  for (let i = 0; i < count; i++) {
    const m = new THREE.Mesh(geo, mat.clone());
    m.visible = false;
    scene.add(m);
    pool.push({
      mesh: m,
      age:  0,
      life: 0,
      vx: 0, vy: 0, vz: 0,
      scale: 1,
    });
  }
  return pool;
}

function _makeSmokeTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  const g = ctx.createRadialGradient(64, 64, 8, 64, 64, 62);
  g.addColorStop(0, 'rgba(255,255,255,0.95)');
  g.addColorStop(0.42, 'rgba(255,255,255,0.55)');
  g.addColorStop(0.76, 'rgba(255,255,255,0.14)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function spawnSmoke(pool, x, y, z, color = 0xeeeeee) {
  for (const p of pool) {
    if (p.life <= 0) {
      p.mesh.material.color.setHex(color);
      p.mesh.position.set(x, y, z);
      p.scale = 1.0;
      p.mesh.scale.set(p.scale, p.scale, p.scale);
      p.mesh.material.opacity = 0.55;
      p.mesh.visible = true;
      p.age = 0;
      p.life = 0.7 + Math.random() * 0.3;       // sec
      p.vx = (Math.random() - 0.5) * 6;
      p.vy = 4 + Math.random() * 4;
      p.vz = (Math.random() - 0.5) * 6;
      return;
    }
  }
}

export function updateSmoke(pool, dt) {
  for (const p of pool) {
    if (p.life <= 0) continue;
    p.age += dt;
    p.life -= dt;
    if (p.life <= 0) { p.mesh.visible = false; continue; }
    const t = p.age / (p.age + p.life);     // 0..1
    p.scale = 1.0 + t * 4.0;
    p.mesh.scale.set(p.scale, p.scale, p.scale);
    p.mesh.material.opacity = Math.max(0, 0.55 * (1 - t));
    p.mesh.position.x += p.vx * dt;
    p.mesh.position.y += p.vy * dt;
    p.mesh.position.z += p.vz * dt;
    p.vy *= Math.pow(0.4, dt);
  }
}

// ── drift light trails (single buffered geometry that grows) ─────────
export function createSkidBuffer(scene, capSegments = 400) {
  const positions = new Float32Array(capSegments * 4 * 3);
  const colors = new Float32Array(capSegments * 4 * 3);
  const indices = new Uint16Array(capSegments * 6);
  for (let i = 0; i < capSegments; i++) {
    const v = i * 4;
    const n = i * 6;
    indices[n + 0] = v;
    indices[n + 1] = v + 1;
    indices[n + 2] = v + 2;
    indices[n + 3] = v + 2;
    indices[n + 4] = v + 1;
    indices[n + 5] = v + 3;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.setIndex(new THREE.BufferAttribute(indices, 1));
  geo.setDrawRange(0, 0);
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, 0), 20000);
  geo.boundingBox = new THREE.Box3(
    new THREE.Vector3(-20000, -20, -20000),
    new THREE.Vector3(20000, 20, 20000)
  );
  // KartRider식: 연회색 스키드, 어둡지도 형광도 아닌 자연스러운 흔적.
  const mat = new THREE.MeshBasicMaterial({
    vertexColors: true,
    transparent: true,
    opacity: 0.55,
    blending: THREE.NormalBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.renderOrder = 1;
  mesh.frustumCulled = false;
  scene.add(mesh);

  return {
    mesh,
    positions,
    colors,
    capSegments,
    segments: [],
    reset() {
      this.segments.length = 0;
      geo.setDrawRange(0, 0);
    },
    appendTrail(ax, az, bx, bz, headHalfWidth = 2.2, color = 0x6ee7ff) {
      this.segments.push({ ax, az, bx, bz, headHalfWidth, color });
      while (this.segments.length > this.capSegments) this.segments.shift();
      this._rebuild();
    },
    _rebuild() {
      const count = this.segments.length;
      if (!count) {
        geo.setDrawRange(0, 0);
        return;
      }
      for (let s = 0; s < count; s++) {
        const seg = this.segments[s];
        const dx = seg.bx - seg.ax;
        const dz = seg.bz - seg.az;
        const dl = Math.hypot(dx, dz) || 1;
        const nx = dz / dl;
        const nz = -dx / dl;
        const denom = Math.max(1, count - 1);
        const t0 = s / denom;
        const t1 = Math.min(1, (s + 1) / denom);
        const tailWidth = Math.max(0.14, seg.headHalfWidth * 0.055);
        const w0 = tailWidth + (seg.headHalfWidth - tailWidth) * Math.pow(t0, 9.5);
        const w1 = tailWidth + (seg.headHalfWidth - tailWidth) * Math.pow(t1, 9.5);
        const i = s * 12;
        const c = new THREE.Color(seg.color);
        // 검은 타이어 마크 — 균등한 색 (글로우/페이드 그라데이션 ❌).
        const startGlow = 1.0;
        const endGlow   = 1.0;

        positions[i+0] = seg.ax + nx * w0; positions[i+1] = 0.86; positions[i+2] = seg.az + nz * w0;
        positions[i+3] = seg.ax - nx * w0; positions[i+4] = 0.86; positions[i+5] = seg.az - nz * w0;
        positions[i+6] = seg.bx + nx * w1; positions[i+7] = 0.86; positions[i+8] = seg.bz + nz * w1;
        positions[i+9] = seg.bx - nx * w1; positions[i+10] = 0.86; positions[i+11] = seg.bz - nz * w1;

        colors[i+0] = c.r * startGlow; colors[i+1] = c.g * startGlow; colors[i+2] = c.b * startGlow;
        colors[i+3] = c.r * startGlow; colors[i+4] = c.g * startGlow; colors[i+5] = c.b * startGlow;
        colors[i+6] = c.r * endGlow; colors[i+7] = c.g * endGlow; colors[i+8] = c.b * endGlow;
        colors[i+9] = c.r * endGlow; colors[i+10] = c.g * endGlow; colors[i+11] = c.b * endGlow;
      }
      geo.attributes.position.needsUpdate = true;
      geo.attributes.color.needsUpdate = true;
      geo.setDrawRange(0, count * 6);
    },
    appendQuad(ax, az, bx, bz, halfWidth = 1.4, color = 0x6ee7ff) {
      this.appendTrail(ax, az, bx, bz, halfWidth, color);
    },
  };
}

// ── sparks (small short-lived emissive boxes) ────────────────────────
export function createSparkPool(scene, count = 40) {
  const geo = new THREE.BoxGeometry(0.6, 0.6, 0.6);
  const mat = new THREE.MeshBasicMaterial({ color: 0xffaa22 });
  const pool = [];
  for (let i = 0; i < count; i++) {
    const m = new THREE.Mesh(geo, mat.clone());
    m.visible = false;
    scene.add(m);
    pool.push({ mesh: m, life: 0, vx: 0, vy: 0, vz: 0 });
  }
  return pool;
}

export function spawnSparks(pool, x, y, z, count = 14) {
  let emitted = 0;
  for (const p of pool) {
    if (emitted >= count) break;
    if (p.life > 0) continue;
    p.mesh.position.set(x, y, z);
    p.mesh.visible = true;
    p.mesh.material.color.setHSL(
      0.10 + Math.random() * 0.05, 1.0, 0.55 + Math.random() * 0.2
    );
    p.life = 0.30 + Math.random() * 0.25;
    const sp = 30 + Math.random() * 60;
    const a  = Math.random() * Math.PI * 2;
    p.vx = Math.cos(a) * sp;
    p.vz = Math.sin(a) * sp;
    p.vy = 25 + Math.random() * 25;
    emitted++;
  }
}

export function updateSparks(pool, dt) {
  for (const p of pool) {
    if (p.life <= 0) continue;
    p.life -= dt;
    if (p.life <= 0) { p.mesh.visible = false; continue; }
    p.mesh.position.x += p.vx * dt;
    p.mesh.position.y += p.vy * dt;
    p.mesh.position.z += p.vz * dt;
    p.vy -= 200 * dt;             // gravity
    const s = Math.max(0.2, p.life * 2);
    p.mesh.scale.set(s, s, s);
  }
}

// ── screen shake (camera offset) ─────────────────────────────────────
export function makeShake() {
  return { amount: 0, decay: 6.0 };
}
export function triggerShake(state, amount) {
  state.amount = Math.max(state.amount, amount);
}
export function tickShake(state, dt) {
  state.amount *= Math.exp(-state.decay * dt);
  if (state.amount < 0.05) { state.amount = 0; return { x: 0, y: 0 }; }
  return {
    x: (Math.random() - 0.5) * state.amount * 2,
    y: (Math.random() - 0.5) * state.amount * 2,
  };
}

// ── speed lines (Canvas-2D overlay, drawn on the HUD canvas) ─────────
export function makeSpeedLines(count = 60) {
  const arr = new Array(count);
  for (let i = 0; i < count; i++) {
    arr[i] = { x: 0, y: 0, vx: 0, vy: 0, len: 0, alpha: 0, life: 0 };
  }
  return arr;
}

export function drawSpeedLines(ctx, lines, kmh, w, h, dt, cameraMode = 'chase', boostT = 0) {
  if (cameraMode === 'high') {
    for (const p of lines) p.life = 0;
    return;
  }
  // FX_WIND: 임계 WIND_SPEED_MIN 부터 활성, boost 중엔 즉시.
  const windMin = (KC.FX_WIND === false) ? 99999 : (KC.WIND_SPEED_MIN || 220);
  const threshold = boostT > 0.05 ? 0 : windMin;
  if (kmh < threshold) {
    for (const p of lines) p.life = 0;
    return;
  }
  const speedI = Math.max(0, Math.min(1, (kmh - windMin) / 100)) * (KC.WINDLINE_MAX || 1.0);
  const boostI = Math.max(0, Math.min(1, boostT));
  const intensity = Math.max(speedI, boostI);
  const cx = w * 0.5, cy = h * 0.58;
  const speedScale = 1500 + intensity * 3200;
  const spawnRate  = boostActiveRate(kmh) + intensity * 180
    + boostI * KC.SPEEDLINE_BOOST_RATE;

  // Spawn fresh particles
  let toSpawn = spawnRate * dt;
  for (const p of lines) {
    if (p.life > 0) continue;
    if (toSpawn <= 0) break;
    const side = Math.floor(Math.random() * 4);
    if (side === 0) { p.x = Math.random() * w; p.y = -20; }
    else if (side === 1) { p.x = w + 20; p.y = Math.random() * h; }
    else if (side === 2) { p.x = Math.random() * w; p.y = h + 20; }
    else { p.x = -20; p.y = Math.random() * h; }
    const dx = p.x - cx;
    const dy = p.y - cy;
    const dl = Math.hypot(dx, dy) || 1;
    p.vx = (dx / dl) * speedScale;
    p.vy = (dy / dl) * speedScale;
    p.len = 24 + Math.random() * 42 + boostI * 30;     // 부스트 시 더 길게
    p.alpha = 0.10 + Math.random() * 0.18 + boostI * 0.20;
    p.life  = 0.34;
    toSpawn -= 1;
  }

  // Update + draw
  ctx.save();
  ctx.lineCap = 'round';
  for (const p of lines) {
    if (p.life <= 0) continue;
    p.life -= dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    if (p.x < -100 || p.x > w + 100 || p.y < -100 || p.y > h + 100) {
      p.life = 0; continue;
    }
    const dx = p.vx, dy = p.vy;
    const dl = Math.hypot(dx, dy) || 1;
    const tx = -dx / dl * p.len;
    const ty = -dy / dl * p.len;
    // 가장자리 진하게 — 중심에서 거리 비례 alpha
    const ddx = p.x - cx, ddy = p.y - cy;
    const distNorm = Math.min(1, Math.hypot(ddx, ddy) / (Math.min(w, h) * 0.42));
    const baseAlpha = p.alpha * intensity * distNorm * distNorm;
    const boostAlphaMul = 1 + boostI * (KC.SPEEDLINE_MAX_OPACITY / 0.25);
    const a = Math.min(KC.SPEEDLINE_MAX_OPACITY, baseAlpha * boostAlphaMul);
    // 색: 청백(평상) → 주황-흰(부스트)
    const lr = Math.round(190 + (255 - 190) * boostI);
    const lg = Math.round(220 + (200 - 220) * boostI);
    const lb = Math.round(255 + (140 - 255) * boostI);
    ctx.strokeStyle = `rgba(${lr},${lg},${lb},${a})`;
    ctx.lineWidth = 1.0 + intensity * 1.2 + boostI * 2.2;
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    ctx.lineTo(p.x + tx, p.y + ty);
    ctx.stroke();
  }
  ctx.restore();
}

function boostActiveRate(kmh) {
  return kmh > 180 ? 105 : 70;
}

// ── FOV: 속도 비례 + boost 추가량 + 외부 kick (부스트 발동 펀치) ──
// fovExtra (deg) = 호출자가 매 프레임 갱신하는 발동 펀치 값 (즉시 가산).
// 평소 lerp는 부드럽게, kick은 외부에서 즉시 +K로 점프시키므로 안 부드러움.
import { KART_CAMERA as KC } from '../kart-boost/config.js';
export function updateFovPump(camera, kmh, maxKmh, boostActive, dt, fovExtra = 0) {
  const topSpeed = Math.max(80, maxKmh || 240);
  const t = Math.max(0, Math.min(1, (kmh || 0) / topSpeed));
  let smoothTarget = KC.FOV_BASE + (KC.FOV_MAX - KC.FOV_BASE) * t;
  if (boostActive) smoothTarget += KC.FOV_BOOST_BUMP;
  // FX_WIND: 고속 추가 FOV.
  if (KC.FX_WIND !== false) {
    const windMin = KC.WIND_SPEED_MIN || 220;
    const windT = Math.max(0, Math.min(1, ((kmh || 0) - windMin) / 100));
    smoothTarget += (KC.WIND_FOV_ADD || 0) * windT;
  }
  const k = 1 - Math.pow(1 - KC.FOV_LERP, Math.max(0, dt) * 60);
  // smoothed 부분만 lerp, kick은 즉시 가산 (camera._smoothFov 분리)
  camera._smoothFov = camera._smoothFov ?? camera.fov;
  camera._smoothFov += (smoothTarget - camera._smoothFov) * k;
  camera.fov = camera._smoothFov + (fovExtra || 0);
  camera.updateProjectionMatrix();
}

export function spawnDriftSmoke(position, pool = null) {
  if (!pool || !position) return false;
  spawnSmoke(pool, position.x || 0, position.y || 2, position.z || 0);
  return true;
}

// ── KartRider 드리프트 흰 연기 (전용 풀) ─────────────────────
// 부드러운 원형 알파 + NormalBlending + depthWrite:false.
// 입자: 뒤+바깥+살짝 위로 방출. 수명 동안 크기 커지며 페이드아웃.
// 드리프트 시트: 땅에서 일어나는 흰 삼각 시트 (drift_sheet.png).
// Sprite (auto-billboard), 바닥 pin (center.y=0).
// 자연스러운 먼지 → 크기·각도·위치·수명·opacity 모두 랜덤화.
export const DRIFT_SMOKE_TUNING = {
  SMOKE_RATE:       55,
  SMOKE_RATE_MAX:   120,
  SMOKE_LIFE:       0.50,
  SMOKE_LIFE_JIT:   0.12,
  SHEET_W_START:    1.2,
  SHEET_W_END:      2.4,
  SHEET_H_START:    0.8,        // 1.7→0.8 — 낮게 (공중 덩어리 ❌)
  SHEET_H_END:      1.6,        // 3.4→1.6
  SMOKE_OPACITY:    0.60,       // 0.55→0.60 — 0.6→0 페이드 spec
  SMOKE_COLOR:      0xf2f4f6,
  SHEET_RISE_SPEED: 6,
  SMOKE_BACK_SPEED: 4,
  SMOKE_OUT_SPEED:  2,
  // 랜덤화 (불규칙성)
  SHEET_SCALE_RAND:   0.40,    // ±40% 크기
  SHEET_ROT_RAND:     Math.PI, // sprite material.rotation 풀 랜덤
  SHEET_POS_RAND:     1.6,     // 위치 오프셋 (xz)
  SHEET_LIFE_RAND:    0.20,    // ±20% 수명
  SHEET_OPACITY_RAND: 0.20,    // ±20% opacity
};

export function createDriftSmokePool(scene, count = 96) {
  const tex = _makeDriftSheetTexture();
  const matProto = new THREE.SpriteMaterial({
    map: tex,
    color: DRIFT_SMOKE_TUNING.SMOKE_COLOR,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    blending: THREE.NormalBlending,
    alphaTest: 0.01,
  });
  const pool = [];
  for (let i = 0; i < count; i++) {
    const m = new THREE.Sprite(matProto.clone());
    m.visible = false;
    m.renderOrder = 4;
    m.center.set(0.5, 0);  // 바닥 pin — sprite가 위로 솟음
    scene.add(m);
    pool.push({
      mesh: m,
      age:  0,
      life: 0,
      vx: 0, vy: 0, vz: 0,
      wStart: DRIFT_SMOKE_TUNING.SHEET_W_START,
      wEnd:   DRIFT_SMOKE_TUNING.SHEET_W_END,
      hStart: DRIFT_SMOKE_TUNING.SHEET_H_START,
      hEnd:   DRIFT_SMOKE_TUNING.SHEET_H_END,
      opacity0: DRIFT_SMOKE_TUNING.SMOKE_OPACITY,
    });
  }
  return pool;
}

// PNG 텍스처는 한 번만 로드해 모든 풀이 공유.
const _texLoader = new THREE.TextureLoader();
let _smokePuffTex = null;
let _windWispTex  = null;
let _driftSheetTex = null;

function _makeDriftSheetTexture() {
  // smoke_puff.png — 부드러운 원형 페이드 (삼각 시트 ❌).
  if (!_driftSheetTex) _driftSheetTex = _loadFxTex('assets/fx/smoke_puff.png');
  return _driftSheetTex;
}

function _loadFxTex(url) {
  const t = _texLoader.load(
    url,
    undefined,
    undefined,
    (err) => { console.warn(`[fx] tex FAILED: ${url}`, err); }
  );
  t.colorSpace = THREE.SRGBColorSpace;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.magFilter = THREE.LinearFilter;
  return t;
}

function _makeDriftSmokeTexture() {
  // assets/fx/smoke_puff.png — 흰색 알파 텍스처.
  if (!_smokePuffTex) _smokePuffTex = _loadFxTex('assets/fx/smoke_puff.png');
  return _smokePuffTex;
}

function _makeWindWispTexture() {
  if (!_windWispTex) _windWispTex = _loadFxTex('assets/fx/wind_wisp.png');
  return _windWispTex;
}

// vx/vy/vz = world 속도. Sprite는 카메라 향함. 모든 시트 불규칙화.
export function spawnDriftSmoke3D(pool, x, y, z, vx, vy, vz, opts = {}) {
  for (const p of pool) {
    if (p.life > 0) continue;
    const cfg = DRIFT_SMOKE_TUNING;
    // 수명 ±20%
    const lifeJit = (opts.lifeJit ?? cfg.SHEET_LIFE_RAND);
    const life = (opts.life ?? cfg.SMOKE_LIFE) * (1 + (Math.random() - 0.5) * 2 * lifeJit);
    // 크기 ±40% 가로/세로 독립
    const sjRand = opts.scaleRand ?? cfg.SHEET_SCALE_RAND;
    const jW = 1 + (Math.random() - 0.5) * 2 * sjRand;
    const jH = 1 + (Math.random() - 0.5) * 2 * sjRand;
    const wStart = (opts.wStart ?? cfg.SHEET_W_START) * jW;
    const wEnd   = (opts.wEnd   ?? cfg.SHEET_W_END)   * jW;
    const hStart = (opts.hStart ?? cfg.SHEET_H_START) * jH;
    const hEnd   = (opts.hEnd   ?? cfg.SHEET_H_END)   * jH;
    // opacity ±20%
    const opJit = opts.opacityRand ?? cfg.SHEET_OPACITY_RAND;
    const opacity0 = (opts.opacity ?? cfg.SMOKE_OPACITY) * (1 + (Math.random() - 0.5) * 2 * opJit);
    // 위치 오프셋 (xz 평면)
    const posR = opts.posRand ?? cfg.SHEET_POS_RAND;
    const dx = (Math.random() - 0.5) * 2 * posR;
    const dz = (Math.random() - 0.5) * 2 * posR;
    p.mesh.position.set(x + dx, y, z + dz);
    p.mesh.scale.set(wStart, hStart, 1);
    p.mesh.material.opacity = Math.max(0, opacity0);
    p.mesh.material.color.setHex(opts.color ?? cfg.SMOKE_COLOR);
    // sprite material rotation (screen-space) — 각도 랜덤
    const rotR = opts.rotRand ?? cfg.SHEET_ROT_RAND;
    p.mesh.material.rotation = (Math.random() - 0.5) * 2 * rotR;
    p.mesh.visible = true;
    p.age = 0;
    p.life = Math.max(0.15, life);
    p.vx = vx; p.vy = vy; p.vz = vz;
    p.wStart = wStart; p.wEnd = wEnd;
    p.hStart = hStart; p.hEnd = hEnd;
    p.opacity0 = opacity0;
    return true;
  }
  return false;
}

// 살짝 피어올랐다 가라앉음 — 약한 gravity + 강한 drag.
const _DUST_GRAVITY = 18;   // 22→18
const _DUST_DRAG_XZ = 0.55; // 0.85→0.55 — 빨리 멎음 (공중 흩어짐 ❌)
export function updateDriftSmoke(pool, dt) {
  if (!pool) return;
  for (const p of pool) {
    if (p.life <= 0) continue;
    p.age += dt;
    p.life -= dt;
    if (p.life <= 0) { p.mesh.visible = false; continue; }
    const total = p.age + p.life;
    const t = total > 0 ? p.age / total : 0;
    const w = p.wStart + (p.wEnd - p.wStart) * t;
    const h = p.hStart + (p.hEnd - p.hStart) * t;
    p.mesh.scale.set(w, h, 1);
    p.mesh.material.opacity = Math.max(0, p.opacity0 * (1 - t));
    p.vy -= _DUST_GRAVITY * dt;
    p.vx *= Math.pow(_DUST_DRAG_XZ, dt);
    p.vz *= Math.pow(_DUST_DRAG_XZ, dt);
    p.mesh.position.x += p.vx * dt;
    p.mesh.position.y += Math.max(p.vy, -18) * dt;
    p.mesh.position.z += p.vz * dt;
    if (p.mesh.position.y < 0.02) p.mesh.position.y = 0.02;  // 바닥에서 안 가라앉음
  }
}

export function showBoostEffect(target = document.body) {
  target?.classList?.add('boost-effect-active');
  setTimeout(() => target?.classList?.remove('boost-effect-active'), 420);
}

export function showCollisionEffect(position, sparkPool = null) {
  if (!sparkPool || !position) return false;
  spawnSparks(sparkPool, position.x || 0, position.y || 4, position.z || 0, 10);
  return true;
}

export function triggerScreenShake(shake, intensity = 4, duration = 0.2) {
  if (!shake) return;
  shake.duration = Math.max(shake.duration || 0, duration);
  triggerShake(shake, intensity);
}

export function showNewRecordEffect(target = document.body) {
  target?.classList?.add('new-record-effect');
  setTimeout(() => target?.classList?.remove('new-record-effect'), 900);
}

// ── 앞쪽 와류 (wind_wisp.png) ─────────────────────────────────
// 고속 주행 中 차 앞 양옆에서 흰 반투명 와류가 뒤로 흘러나감.
// 부드러운 구름형 (속도선과 별개). billowy = sprite 살짝 회전 + size 성장.
export const WIND_TUNING = {
  WIND_LIFE:        0.45,
  WIND_LIFE_JIT:    0.10,
  WIND_SIZE_END_MUL: 2.2,   // 3.0→2.2 — 최종 크기 제한 (큰 구름 방지)
  WIND_COLOR:       0xeaf2ff,
};

export function createWindPool(scene, count = 56) {
  // Sprite 기반 — 항상 카메라 향함 → 차 앞 공중에 와류로 보임 (바닥 데칼 ❌).
  const tex = _makeWindWispTexture();
  const matProto = new THREE.SpriteMaterial({
    map: tex,
    color: (KC.WIND_COLOR ?? WIND_TUNING.WIND_COLOR),
    transparent: true,
    opacity: 0,
    depthWrite: false,
    blending: THREE.NormalBlending,
    alphaTest: 0.01,
  });
  const pool = [];
  for (let i = 0; i < count; i++) {
    const m = new THREE.Sprite(matProto.clone());
    m.visible = false;
    m.renderOrder = 5;
    scene.add(m);
    pool.push({
      mesh: m,
      age: 0,
      life: 0,
      vx: 0, vy: 0, vz: 0,
      rotV: 0,
      sizeStart: 2.4,
      sizeEnd:   8.0,
      opacity0:  0.32,
    });
  }
  return pool;
}

export function spawnWind3D(pool, x, y, z, vx, vy, vz, opts = {}) {
  for (const p of pool) {
    if (p.life > 0) continue;
    const life = (opts.life ?? WIND_TUNING.WIND_LIFE)
      + (Math.random() - 0.5) * 2 * (opts.lifeJit ?? WIND_TUNING.WIND_LIFE_JIT);
    const sizeStart = opts.sizeStart ?? 2.4;
    const sizeEnd   = opts.sizeEnd   ?? sizeStart * WIND_TUNING.WIND_SIZE_END_MUL;
    const opacity0  = opts.opacity   ?? 0.32;
    p.mesh.position.set(x, y, z);
    // Sprite: scale.x = width, scale.y = height (screen-aligned). z 무시.
    p.mesh.scale.set(sizeStart, sizeStart, 1);
    p.mesh.material.rotation = Math.random() * Math.PI * 2;   // 화면-공간 회전
    p.mesh.material.opacity = opacity0;
    p.mesh.material.color.setHex(opts.color ?? KC.WIND_COLOR ?? WIND_TUNING.WIND_COLOR);
    // Additive 스위치 제거 — 매번 needsUpdate 가 셰이더 재컴파일 → 렉 유발.
    p.mesh.visible = true;
    p.age = 0;
    p.life = Math.max(0.10, life);
    p.vx = vx; p.vy = vy; p.vz = vz;
    p.sizeStart = sizeStart;
    p.sizeEnd   = sizeEnd;
    p.opacity0  = opacity0;
    p.rotV = (Math.random() - 0.5) * 2.4;   // billowy roll
    return true;
  }
  return false;
}

export function updateWind(pool, dt) {
  if (!pool) return;
  for (const p of pool) {
    if (p.life <= 0) continue;
    p.age += dt;
    p.life -= dt;
    if (p.life <= 0) { p.mesh.visible = false; continue; }
    const total = p.age + p.life;
    const t = total > 0 ? p.age / total : 0;
    const size = p.sizeStart + (p.sizeEnd - p.sizeStart) * t;
    p.mesh.scale.set(size, size, 1);
    p.mesh.material.rotation += p.rotV * dt;
    p.mesh.material.opacity = Math.max(0, p.opacity0 * (1 - t));
    p.mesh.position.x += p.vx * dt;
    p.mesh.position.y += p.vy * dt;
    p.mesh.position.z += p.vz * dt;
  }
}

// 차 forward = car.angle. 2D → 3D: (wx, _, -wy).
// forward 3D = (cos, 0, -sin). backward = (-cos, 0, sin). right(차 기준) = (-sin, 0, -cos).
function _lerpHexColor(a, b, t) {
  const ar = (a >> 16) & 0xff, ag = (a >> 8) & 0xff, ab = a & 0xff;
  const br = (b >> 16) & 0xff, bg = (b >> 8) & 0xff, bb = b & 0xff;
  const r = Math.round(ar + (br - ar) * t);
  const g = Math.round(ag + (bg - ag) * t);
  const bl = Math.round(ab + (bb - ab) * t);
  return (r << 16) | (g << 8) | bl;
}

// ── WIND DEBUG 토글 ───────────────────────────────────────────
// true: 속도 게이트 무시, 차 앞 좌/우에서 항상 큰 빨강 스프라이트 emit.
//       빨강 보이면 렌더 OK → false로 돌려 2단계(실제 와류) 활성화.
//       안 보이면 emitter가 안 도는 것 → wiring 점검.
const WIND_DEBUG_FORCE_RED = false;   // 2단계: 실제 wind_wisp.png 흰 와류

export function emitWindFromCar(state, car, pool, dt, kmh, boostT = 0) {
  if (!pool) return;
  if (WIND_DEBUG_FORCE_RED) {
    const a = car.angle || 0;
    const cs = Math.cos(a), sn = Math.sin(a);
    const frontOff = 8.2, sideOff = 4.0;
    state._windT = (state._windT || 0) - dt;
    const rate = 30;
    while (state._windT <= 0) {
      state._windT += 1 / rate;
      for (const sideSign of [-1, 1]) {
        const wx = car.x + frontOff * cs - sideSign * sideOff * sn;
        const wy = car.y + frontOff * sn + sideSign * sideOff * cs;
        spawnWind3D(pool, wx, 1.8, -wy, -cs * 20, 2, sn * 20, {
          opacity: 0.95,
          sizeStart: 5.0,
          color: 0xff0000,
        });
      }
    }
    return;
  }
  const windMin = (KC.WIND_SPEED_MIN ?? 150);
  const speedT  = Math.max(0, Math.min(1, ((kmh || 0) - windMin) / 100));
  const boostI  = Math.max(0, Math.min(1, boostT));
  const intensity = Math.max(speedT, boostI);
  if (intensity <= 0.03) { state._windT = 0; return; }
  // 부스트 mul (rate/opacity/size 더 진하고 더 많이)
  const bRateMul = 1 + boostI * ((KC.WIND_BOOST_RATE_MUL ?? 1.8) - 1);
  const bOpMul   = 1 + boostI * ((KC.WIND_BOOST_OPACITY_MUL ?? 1.45) - 1);
  const bSizeMul = 1 + boostI * ((KC.WIND_BOOST_SIZE_MUL ?? 1.30) - 1);
  // 색: 평상 청백 → 부스트 주황
  const cIdle  = KC.WIND_COLOR ?? 0xeaf2ff;
  const cBoost = KC.WIND_COLOR_BOOST ?? 0xffb066;
  const wColor = _lerpHexColor(cIdle, cBoost, boostI);
  const rate = Math.max(5, (KC.WIND_RATE_MAX ?? 45) * intensity * bRateMul);
  const a = car.angle || 0;
  const cs = Math.cos(a), sn = Math.sin(a);
  // 차체 '앞코 좌/우 모서리' (forward=+X, 양옆=±Y in 2D physics).
  const frontOff = 11.0;       // 차 길이 거의 앞끝 (앞코)
  const sideOff  = 3.6;        // 약간 바깥
  const baseY    = (KC.WIND_Y ?? 2.6);
  // 차 world 속도 — sprite가 차와 함께 흘러야 앞에 머무름.
  const carVxW = car.vx || 0;
  const carVyW = car.vy || 0;
  const matchK = 0.82;         // sprite 차 속도 82% 매칭 → 18% 만큼만 상대적으로 뒤로 흘러감
  state._windT = (state._windT || 0) - dt;
  while (state._windT <= 0) {
    state._windT += (1 / rate) * (0.7 + Math.random() * 0.6);
    for (const sideSign of [-1, 1]) {
      // 위치: 앞코 좌/우 + 살짝 랜덤
      const fOff = frontOff + (Math.random() - 0.5) * 1.4;
      const sOff = sideOff  + Math.random() * 1.2;
      const wx = car.x + fOff * cs - sideSign * sOff * sn;
      const wy = car.y + fOff * sn + sideSign * sOff * cs;
      const w3x = wx;
      const w3y = baseY + (Math.random() - 0.3) * 0.8;
      const w3z = -wy;
      // 속도 = 차 속도 × matchK + 살짝 바깥/위
      const outScale = 3 + intensity * 4;
      const outX = -sn * outScale * sideSign;
      const outZ = -cs * outScale * sideSign;
      const vx = carVxW * matchK + outX + (Math.random() - 0.5) * 2;
      const vz = -carVyW * matchK + outZ + (Math.random() - 0.5) * 2;
      const vy = 1.2 + Math.random() * 1.8;
      const sizeJit = 0.85 + Math.random() * 0.30;
      const opJit   = 0.90 + Math.random() * 0.20;
      spawnWind3D(pool, w3x, w3y, w3z, vx, vy, vz, {
        opacity:   (KC.WIND_OPACITY_MAX ?? 0.35) * intensity * bOpMul * opJit,
        sizeStart: (KC.WIND_SIZE ?? 2.4) * sizeJit * bSizeMul,
        color:     wColor,
        additive:  boostI > 0.5,
        life:      0.45 + Math.random() * 0.15,   // 0.45~0.60s
      });
    }
  }
}
