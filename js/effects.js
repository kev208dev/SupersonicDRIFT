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
    opacity: 0.42,
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
        const startGlow = 0.16 + 0.84 * Math.pow(t0, 3.2);
        const endGlow = 0.16 + 0.84 * Math.pow(t1, 3.2);

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
    p.len = 24 + Math.random() * 42;
    p.alpha = 0.10 + Math.random() * 0.18;
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
    ctx.strokeStyle = `rgba(190,220,255,${a})`;
    ctx.lineWidth = 1.0 + intensity * 1.2 + boostI * 1.5;
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
export const DRIFT_SMOKE_TUNING = {
  SMOKE_RATE:       55,    // /s — base rate (β/속도로 가산)
  SMOKE_RATE_MAX:   120,   // /s — β=깊고 속도 cruise+ 시
  SMOKE_LIFE:       0.55,  // 0.85→0.55 — 짧게(덩어리 ❌)
  SMOKE_LIFE_JIT:   0.18,
  SMOKE_SIZE_START: 2.0,   // 4.5→2.0 — 작게 시작
  SMOKE_SIZE_END:   11.0,  // 17.0→11.0 — 부드럽게 커지며 페이드아웃
  SMOKE_OPACITY:    0.48,  // 0.62→0.48
  SMOKE_COLOR:      0xf2f4f6, // 흰~연회색
  SMOKE_OUT_SPEED:  16,    // 바깥 방향 속도 (단위/s)
  SMOKE_UP_SPEED:   8,     // 위로 (천천히)
  SMOKE_BACK_SPEED: 10,    // 뒤로
  SMOKE_VY_DAMP:    0.55,  // /s (감쇠 계수)
};

export function createDriftSmokePool(scene, count = 96) {
  const tex = _makeDriftSmokeTexture();
  const geo = new THREE.PlaneGeometry(1, 1);
  geo.rotateX(-Math.PI / 2);
  const matProto = new THREE.MeshBasicMaterial({
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
    const m = new THREE.Mesh(geo, matProto.clone());
    m.visible = false;
    m.renderOrder = 4;
    scene.add(m);
    pool.push({
      mesh: m,
      age:  0,
      life: 0,
      vx: 0, vy: 0, vz: 0,
      sizeStart: DRIFT_SMOKE_TUNING.SMOKE_SIZE_START,
      sizeEnd:   DRIFT_SMOKE_TUNING.SMOKE_SIZE_END,
      opacity0:  DRIFT_SMOKE_TUNING.SMOKE_OPACITY,
    });
  }
  return pool;
}

function _makeDriftSmokeTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  const g = ctx.createRadialGradient(64, 64, 4, 64, 64, 64);
  g.addColorStop(0,    'rgba(255,255,255,1.0)');
  g.addColorStop(0.35, 'rgba(255,255,255,0.55)');
  g.addColorStop(0.7,  'rgba(255,255,255,0.12)');
  g.addColorStop(1,    'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// vBack/vOut/vUp = 카트 좌표계에서 뒤/바깥/위 속도. 월드 변환은 호출자.
export function spawnDriftSmoke3D(pool, x, y, z, vx, vy, vz, opts = {}) {
  for (const p of pool) {
    if (p.life > 0) continue;
    const life = (opts.life ?? DRIFT_SMOKE_TUNING.SMOKE_LIFE)
      + (Math.random() - 0.5) * 2 * (opts.lifeJit ?? DRIFT_SMOKE_TUNING.SMOKE_LIFE_JIT);
    const sizeStart = opts.sizeStart ?? DRIFT_SMOKE_TUNING.SMOKE_SIZE_START;
    const sizeEnd   = opts.sizeEnd   ?? DRIFT_SMOKE_TUNING.SMOKE_SIZE_END;
    const opacity0  = opts.opacity   ?? DRIFT_SMOKE_TUNING.SMOKE_OPACITY;
    p.mesh.position.set(x, y, z);
    p.mesh.scale.set(sizeStart, 1, sizeStart);
    p.mesh.rotation.y = Math.random() * Math.PI * 2;
    p.mesh.material.opacity = opacity0;
    p.mesh.material.color.setHex(opts.color ?? DRIFT_SMOKE_TUNING.SMOKE_COLOR);
    p.mesh.visible = true;
    p.age = 0;
    p.life = Math.max(0.15, life);
    p.vx = vx; p.vy = vy; p.vz = vz;
    p.sizeStart = sizeStart;
    p.sizeEnd   = sizeEnd;
    p.opacity0  = opacity0;
    return true;
  }
  return false;
}

export function updateDriftSmoke(pool, dt) {
  if (!pool) return;
  for (const p of pool) {
    if (p.life <= 0) continue;
    p.age += dt;
    p.life -= dt;
    if (p.life <= 0) { p.mesh.visible = false; continue; }
    const total = p.age + p.life;
    const t = total > 0 ? p.age / total : 0;
    const size = p.sizeStart + (p.sizeEnd - p.sizeStart) * t;
    p.mesh.scale.set(size, 1, size);
    p.mesh.material.opacity = Math.max(0, p.opacity0 * (1 - t));
    p.mesh.position.x += p.vx * dt;
    p.mesh.position.y += p.vy * dt;
    p.mesh.position.z += p.vz * dt;
    p.vy *= Math.pow(DRIFT_SMOKE_TUNING.SMOKE_VY_DAMP, dt);
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
