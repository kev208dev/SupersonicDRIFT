// KartRider 연출 — FOV 펌프 + 카메라 리그 + 스피드라인.
//
// 카트 손맛의 90%는 카메라/렌더링 트릭. 같은 물리라도 이 레이어 없으면 안 빨라 보임.
//   1. FOV 72→92 (boost in 0.3s, out 0.5s) — "슉" 감각의 정체
//   2. 카메라 거리/높이 살짝 당김 — 관성감
//   3. 드리프트 카메라 yaw — 옆으로 미끄러지는 게 보이게
//   4. 스피드라인 — 60 m/s 이상에서 발동

import { KART_CAMERA as C } from './config.js';

// ─── FOV 펌프: boost active 여부만 받아 lerp ───────────────────
// 호출: updateFovPump(camera3d, !!car.boosting, dt)
export function updateFovPump(camera, boostActive, dt) {
  const target = boostActive ? C.FOV_BOOST : C.FOV_BASE;
  const tau = (target > camera.fov) ? C.FOV_LERP_IN : C.FOV_LERP_OUT;
  // 1 - e^(-3/τ · dt) → τ초에 95% 도달
  const k = 1 - Math.exp(-(3.0 / tau) * dt);
  camera.fov += (target - camera.fov) * k;
  camera.updateProjectionMatrix();
}

// ─── 카메라 거리/높이 — boost中 당김 ─────────────────────────
// 호출: applyCameraRig(camState, car, baseDist, baseHeight, dt)
// 반환: { dist, height, aimAngle } — 호출자가 이걸로 cam pos 계산
export function applyCameraRig(camState, car, baseDist, baseHeight, dt) {
  const boostPow = Math.min(1, car.boostPower || 0);
  const distMul    = 1 - C.CAM_DIST_PULL * boostPow;
  const heightDrop = C.CAM_HEIGHT_DROP * boostPow;

  // 드리프트 카메라: 미끄러지는 반대로 yaw 오프셋
  camState._driftYaw = camState._driftYaw || 0;
  const driftYawTarget = car.drifting
    ? clampSym(-(car.driftAngle || 0) * C.DRIFT_YAW_GAIN, C.DRIFT_YAW_MAX)
    : 0;
  camState._driftYaw += (driftYawTarget - camState._driftYaw)
    * (1 - Math.exp(-C.DRIFT_YAW_SMOOTH * dt));

  return {
    dist:     baseDist * distMul,
    height:   baseHeight - heightDrop,
    yawOffset: camState._driftYaw,
  };
}

// ─── 스피드라인 intensity ─────────────────────────────────────
// 호출: speedLineIntensity(kmh) → 0..1
export function speedLineIntensity(kmh) {
  if (kmh < C.SPEEDLINE_KMH) return 0;
  return Math.min(1, (kmh - C.SPEEDLINE_KMH) / C.SPEEDLINE_RANGE);
}

// ─── 차체 롤 드리프트 시 — car 모델 회전에 적용할 값 ───────────
// 호출: driftBodyRoll(car) → rad
export function driftBodyRoll(car) {
  if (!car.drifting) return 0;
  const sign = Math.sign(car.sideSpeed || car.steerAngle || 1);
  return -sign * C.BODY_ROLL_DRIFT;
}

function clampSym(v, m) { return v < -m ? -m : v > m ? m : v; }
