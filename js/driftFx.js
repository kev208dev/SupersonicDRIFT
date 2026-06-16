// KartRider 드리프트 화면 연출 — 차체 squash + 게이지 tier 스파크.
// 물리/카메라/충돌 안 건드림. 차 모델 메시 scale + sparkPool 재사용만.
//
// 사용:
//   const driftFxState = makeDriftFxState();
//   // 매 프레임:
//   applyDriftBodyFx(driftFxState, carMesh, car, dt);
//   emitDriftSparks(driftFxState, car, sparkPool, dt);

import { spawnSparks } from './effects.js';

// ─── 튜닝 한 곳 ────────────────────────────────────────────────
export const DRIFT_FX_CONFIG = {
  // 켜고끄기 (각 효과 개별)
  ENABLE_BODY_SQUASH: true,
  ENABLE_SPARKS:      true,
  ENABLE_SMOKE:       true,   // (#3 - 후속)
  ENABLE_SKID:        true,   // (#4 - 기존 _emitDriftFx에서 처리)
  ENABLE_FLAME:       true,   // (#5 - 이미 car.js boostflame 메시가 처리)
  ENABLE_TRAIL:       false,  // (#6 - 후속)
  ENABLE_BLOOM:       false,  // (#7 - 후속)

  // ── 차체 squash ──
  BOOST_STRETCH_Z:   0.18,   // 부스트 펄스 정점에서 +18% 길어짐 (앞뒤)
  BOOST_SQUASH_Y:    0.08,   // 동시에 -8% 눌림 (위아래)
  DRIFT_LEAN_BONUS:  0.045,  // 드리프트 중 추가 롤 (rad, car.js 기존 0.080 + 이 값)
  BODY_FX_RESPONSE:  10.0,   // 페이드 응답 (높을수록 빠릿)

  // ── 스파크 (게이지 tier로 색 변화) ──
  SPARK_REAR_OFFSET:    -7.6,  // 차 로컬 X (뒤쪽)
  SPARK_SIDE_OFFSET:    7.2,   // 차 로컬 Z (양옆)
  SPARK_Y:              1.2,
  SPARK_PER_BURST:      3,
  SPARK_RATE_MIN:       18,    // /s — 드리프트 시작 시
  SPARK_RATE_MAX:       95,    // /s — 게이지 풀충전 시
  SPARK_MIN_GAUGE:      4,     // 이하 미발사
  // tier 임계값
  SPARK_TIER_T1:        40,    // 이하: tier 0
  SPARK_TIER_T2:        70,    // 이하: tier 1, 초과: tier 2
  // tier별 HSL 범위 (h, s, l ranges + jitter)
  SPARK_TIER_COLORS: [
    { h: 0.13, hJit: 0.04, s: 1.0, l: 0.70 },  // 0: 흰/노랑
    { h: 0.07, hJit: 0.03, s: 1.0, l: 0.58 },  // 1: 주황
    { h: 0.66, hJit: 0.10, s: 1.0, l: 0.62 },  // 2: 파랑/보라
  ],
};

// ─── 상태 객체 ─────────────────────────────────────────────────
export function makeDriftFxState() {
  return {
    sparkTimer:  0,
    bodyStretch: 0,  // 0..1 페이드된 스트레치 강도
    bodyLean:    0,  // 페이드된 추가 롤
    _origScale:  null,
  };
}

// ─── 차체 squash/stretch + 추가 롤 ─────────────────────────────
export function applyDriftBodyFx(state, carMesh, car, dt) {
  if (!DRIFT_FX_CONFIG.ENABLE_BODY_SQUASH) return;
  const body = carMesh?.body;
  if (!body) return;

  if (!state._origScale) {
    state._origScale = { x: body.scale.x, y: body.scale.y, z: body.scale.z };
  }

  // 부스트 펄스: boostFireFx가 1→0으로 감소하는 동안 squash 적용
  const fireFx = Math.min(1, car.boostFireFx || 0);
  const k = 1 - Math.exp(-DRIFT_FX_CONFIG.BODY_FX_RESPONSE * dt);
  state.bodyStretch += (fireFx - state.bodyStretch) * k;

  const stretchZ = 1 + state.bodyStretch * DRIFT_FX_CONFIG.BOOST_STRETCH_Z;
  const squashY  = 1 - state.bodyStretch * DRIFT_FX_CONFIG.BOOST_SQUASH_Y;
  body.scale.x = state._origScale.x;
  body.scale.y = state._origScale.y * squashY;
  body.scale.z = state._origScale.z * stretchZ;

  // 드리프트 중 추가 롤 (기존 car.js의 driftLean 위에 더해짐)
  const target = car.drifting
    ? -Math.sign(car.sideSpeed || car.steerAngle || 1) * DRIFT_FX_CONFIG.DRIFT_LEAN_BONUS
    : 0;
  state.bodyLean += (target - state.bodyLean) * k;
  body.rotation.x += state.bodyLean;
}

// ─── 게이지 tier 스파크 ────────────────────────────────────────
export function emitDriftSparks(state, car, sparkPool, dt) {
  if (!DRIFT_FX_CONFIG.ENABLE_SPARKS) return;
  if (!car.drifting || !sparkPool) {
    state.sparkTimer = Math.max(0, state.sparkTimer - dt);
    return;
  }
  const gauge = Math.max(0, Math.min(100, car.boostMeter || 0));
  if (gauge < DRIFT_FX_CONFIG.SPARK_MIN_GAUGE) return;

  // gauge 비례 spawn rate
  const t = gauge / 100;
  const rate = DRIFT_FX_CONFIG.SPARK_RATE_MIN
    + (DRIFT_FX_CONFIG.SPARK_RATE_MAX - DRIFT_FX_CONFIG.SPARK_RATE_MIN) * t;

  // tier 결정
  const tier = gauge < DRIFT_FX_CONFIG.SPARK_TIER_T1 ? 0
             : gauge < DRIFT_FX_CONFIG.SPARK_TIER_T2 ? 1 : 2;
  const tierColor = DRIFT_FX_CONFIG.SPARK_TIER_COLORS[tier];

  state.sparkTimer -= dt;
  while (state.sparkTimer <= 0) {
    state.sparkTimer += 1 / rate;
    _emitOneBurst(car, sparkPool, tierColor);
  }
}

function _emitOneBurst(car, sparkPool, tierColor) {
  const a  = car.angle || 0;
  const cs = Math.cos(a), sn = Math.sin(a);
  const rx = DRIFT_FX_CONFIG.SPARK_REAR_OFFSET;
  const ry = DRIFT_FX_CONFIG.SPARK_SIDE_OFFSET;

  for (const sideSign of [-1, 1]) {
    // 차 로컬 (rx, 0, sideSign*ry) → 월드 2D
    const wx = car.x + rx * cs - sideSign * ry * sn;
    const wy = car.y + rx * sn + sideSign * ry * cs;
    // 3D 좌표: (wx, SPARK_Y, -wy)
    spawnSparks(sparkPool, wx, DRIFT_FX_CONFIG.SPARK_Y, -wy, DRIFT_FX_CONFIG.SPARK_PER_BURST);
    // 색상 재칠 (spawnSparks가 HSL 랜덤하므로 직접 덮어씀)
    _recolorLatest(sparkPool, DRIFT_FX_CONFIG.SPARK_PER_BURST, tierColor);
  }
}

// 방금 spawn된 스파크의 색만 tier로 덮어씀.
function _recolorLatest(sparkPool, count, tierColor) {
  let touched = 0;
  // spawnSparks는 풀의 앞쪽부터 비어있는 슬롯 채움. 최근 spawn된 건
  // life가 거의 최대값에 가까운 슬롯들 → 그 중 count개 색 갱신.
  let maxLife = 0;
  for (const p of sparkPool) if (p.life > maxLife) maxLife = p.life;
  if (maxLife <= 0) return;
  for (const p of sparkPool) {
    if (touched >= count) break;
    if (p.life < maxLife - 0.02) continue;
    const jit = (Math.random() - 0.5) * 2 * (tierColor.hJit || 0);
    p.mesh.material.color.setHSL(tierColor.h + jit, tierColor.s, tierColor.l);
    touched++;
  }
}
