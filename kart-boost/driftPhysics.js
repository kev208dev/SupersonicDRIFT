// KartRider 원작형 드리프트 — 물리 기반 모델.
//
// 핵심 흐름:
//   1. F-vector (heading) / V-vector (velocity) 분리. vF/vL = velocity 분해.
//   2. 슬립각 β = atan2(|vL|, |vF|).
//   3. Shift+Arrow 입력 시 μ(횡속 retention)가 GRIP_NORMAL → GRIP_DRIFT로 즉시 점프.
//   4. drift 中 감속 = K_base + K_angle(β) + K_input. K_angle은 exp 성장.
//      K_input은 안쪽 키 hold 시 가산 (톡톡이 = 키 떼기로 K_input=0).
//   5. 게이지 ΔG = speed × sin(β) × W_track × dt. 매 tick 누적.
//   6. 카운터 키 = alignment torque로 heading→velocity 정렬. β < RELEASE_BETA(3°)
//      이면 자동 release + μ 원복.
//   7. β ≥ SPIN_BETA(88°) 시 스핀오프 (vF/vL 대폭 손실).
//
// car 입출력:
//   x, y, angle, vx, vy, speed, steerAngle, drifting, driftState, driftStateTime,
//   driftTime, driftAngle, forwardSpeed, sideSpeed, slipBeta,
//   boostMeter, boostStock, boosting, boostSustainTimer, boostCapDecayTimer,
//   boostTimer, boostFireFx, boostPower, maxCapNow,
//   surface, iceSurface, suppressSkid,
//   _driftDir, _lastDriftEndReason
//
// input: throttle, brake, steer, handbrake, boostJust, autoToggle

import { KART_TUNING as K } from './config.js';

export const MIN_DRIFT_SPEED = K.MIN_DRIFT_SPEED;
export const DOUBLE_DRIFT_MIN_SPEED = K.MIN_DRIFT_SPEED;

function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
function wrapAngle(a) {
  while (a >  Math.PI) a -= 2 * Math.PI;
  while (a < -Math.PI) a += 2 * Math.PI;
  return a;
}

// ─── 노면 hook ────────────────────────────────────────────
export function getSurfaceAt(x, y, track) {
  if (typeof track?.getSurface === 'function') return track.getSurface(x, y);
  if (Array.isArray(track?.iceZones)) {
    for (const z of track.iceZones) if (_pointInPoly(x, y, z)) return 'ice';
  }
  return 'asphalt';
}

function _pointInPoly(x, y, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i][0], yi = poly[i][1];
    const xj = poly[j][0], yj = poly[j][1];
    const intersect = ((yi > y) !== (yj > y)) &&
      (x < (xj - xi) * (y - yi) / ((yj - yi) || 1e-9) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

// ─── 드리프트 종료 루틴 (manual / align / spin) ───────────────
// - 상태 → release, drifting=false (μ는 다음 tick에 즉시 NORMAL로 복귀)
function endDriftRoutine(car, reason) {
  car.driftState = 'release';
  car.driftStateTime = 0;
  car.drifting = false;
  car._lastDriftEndReason = reason;
  // 회복 페이즈: CM 관성 보존 + heading 1회 회전. spin 종료는 회복 skip(이미 속도 손실).
  if (reason === 'spin') {
    car._recoverActive = false;
    car._recoverTimer  = 0;
    car._recoverDone   = true;
  } else {
    car._recoverActive = true;
    car._recoverTimer  = K.RECOVER_DURATION;
    car._recoverDone   = false;
  }
}

// ─── 메인 스텝 ────────────────────────────────────────────
export function stepKartDrift(car, input, dt, track) {
  if (dt <= 0) return;
  if (dt > 0.05) dt = 0.05;

  if (input.autoToggle) {
    car.transmission = (car.transmission === 'manual') ? 'auto' : 'manual';
  }

  const surface = getSurfaceAt(car.x, car.y, track);
  const isIce   = surface === 'ice';
  car.surface   = surface;
  car.iceSurface = isIce;

  updateDriftStateMachine(car, input, dt);
  updateBoostState(car, input, dt);

  const maxCruise = Math.max(120, (car.maxSpeed || 180)) * (K.CRUISE_MUL || 1);
  const maxBoost  = maxCruise * K.V_BOOST_MUL;
  const topCap    = currentTopCap(car, maxCruise, maxBoost);
  car.maxCapNow   = topCap;

  // ─── F-vector / V-vector 분해 ───
  const fwdX = Math.cos(car.angle);
  const fwdY = Math.sin(car.angle);
  const rgtX = -fwdY;
  const rgtY =  fwdX;

  let vF = car.vx * fwdX + car.vy * fwdY;
  let vL = car.vx * rgtX + car.vy * rgtY;

  // ─── 슬립각 β (unsigned) ───
  const beta = Math.atan2(Math.abs(vL), Math.max(1e-3, Math.abs(vF)));

  // ─── 조향 입력 → steerAngle ───
  const speedRatio  = clamp(Math.abs(vF) / maxCruise, 0, 1);
  const maxWheel    = (car.drifting ? 0.95 : (0.72 - speedRatio * 0.28)) * (car.turnStrength || 1);
  const targetWheel = -input.steer * maxWheel;
  if (car.drifting) {
    car.steerAngle += (targetWheel - car.steerAngle) * Math.min(dt * K.STEER_RESPONSE_DRIFT, 1);
  } else {
    const moving = Math.abs(targetWheel) > Math.abs(car.steerAngle);
    const resp = moving ? K.STEER_ENGAGE : K.STEER_RETURN;
    car.steerAngle += (targetWheel - car.steerAngle) * (1 - Math.exp(-resp * dt));
  }

  const angleBeforeYaw = car.angle;

  // ─── yaw 적용 ───
  if (Math.abs(vF) > 0.6) {
    const dirSign = vF >= 0 ? 1 : -1;
    if (car.drifting) {
      // β를 TARGET_SLIP으로 수렴: |β| < TARGET 이면 full yaw 권한, 도달하면 0, 초과하면 약하게 되돌림.
      const slipNorm = Math.abs(beta) / Math.max(1e-3, K.TARGET_SLIP);
      const driftGate = slipNorm < 1
        ? (1 - slipNorm * slipNorm)        // 0~TARGET: 1 → 0 (smooth)
        : -0.35 * Math.min(1, slipNorm - 1); // 초과: 음의 yaw로 되돌림
      const mulHold   = (K.DRIFT_YAW_MUL || 1.0);
      const targetYawRate = -input.steer * K.DRIFT_YAW * Math.max(0.35, speedRatio) * dirSign * driftGate * mulHold;
      car._driftYawRate = car._driftYawRate || 0;
      car._driftYawRate += (targetYawRate - car._driftYawRate) * (1 - Math.exp(-K.DRIFT_YAW_SMOOTH * dt));
      car.angle += car._driftYawRate * dt;
    } else {
      car._driftYawRate = 0;
      const baseGain = 0.95 * (car.turnStrength || 1);
      const speedFactor = 1 - (1 - K.HIGHSPEED_TURN_FACTOR) * speedRatio;
      let yawRate = car.steerAngle * baseGain * speedFactor * dirSign;
      if (yawRate >  K.MAX_YAW) yawRate =  K.MAX_YAW;
      if (yawRate < -K.MAX_YAW) yawRate = -K.MAX_YAW;
      car.angle += yawRate * dt;
    }
  }

  // ─── 카운터 스티어 alignment torque (drift 中만) ───
  // 반대 방향키 입력 시 heading을 velocity 방향으로 능동 정렬 → β 감소.
  let counterSteer = false;
  if (car.drifting && car._driftDir !== 0) {
    const s = input.steer || 0;
    counterSteer = Math.sign(s) === -car._driftDir && Math.abs(s) > K.COUNTER_STEER_THRESHOLD;
    if (counterSteer) {
      const velAngle = Math.atan2(car.vy, car.vx);
      const delta = wrapAngle(velAngle - car.angle);
      car.angle += delta * K.ALIGNMENT_GAIN * dt;
    }
  }

  // ─── 회복 페이즈: 차체 yaw → velocity 방향으로 1회 회전 (CM 관성 보존) ───
  // 도달 시점에 회전 정지 → 반복 진동(팽이) 차단. 횡속 블리드는 RECOVER_GRIP에서.
  if (car._recoverActive && !car._recoverDone && Math.hypot(car.vx, car.vy) > 1) {
    const velAngle = Math.atan2(car.vy, car.vx);
    const delta    = wrapAngle(velAngle - car.angle);
    const maxStep  = K.RECOVER_YAW_RATE * dt;
    if (Math.abs(delta) <= maxStep) {
      // 도달: optional overshoot 후 종결.
      car.angle += delta + Math.sign(delta) * (K.RECOVER_OVERSHOOT || 0);
      car._recoverDone = true;
    } else {
      car.angle += Math.sign(delta) * maxStep;
    }
  }

  // ─── 가속/제동 (전진축) ───
  if (input.throttle > 0) {
    vF += K.ACCEL_BASE * (car.accelerationForce || 1) * input.throttle * dt;
    if (car.boostSustainTimer > 0) vF += K.BOOST_SUSTAIN_ACCEL * dt;
  }
  if (input.brake > 0) {
    if (vF > 0.5) vF = Math.max(0, vF - K.BRAKE_RATE * input.brake * dt);
    else if (input.throttle === 0 && vF > -K.REVERSE_TOP) {
      vF -= K.ACCEL_BASE * 0.34 * input.brake * dt;
    }
  }

  // ─── ★ 드리프트 감속 (K_base + K_angle(β) + K_input) ───
  if (car.drifting) {
    const Kbase  = K.DRIFT_KBASE;
    const Kangle = K.DRIFT_KANGLE_SCALE * (Math.exp(beta / Math.max(1e-3, K.DRIFT_KANGLE_TAU)) - 1);
    // K_input: 안쪽 키 hold 시 가산 (톡톡이로 떼면 0)
    const s = input.steer || 0;
    const insideHold = car._driftDir !== 0
      && Math.sign(s) === car._driftDir
      && Math.abs(s) > K.INSIDE_HOLD_THRESHOLD;
    const Kinput = insideHold ? K.DRIFT_KINPUT : 0;
    vF -= (Kbase + Kangle + Kinput) * dt;
    if (vF < 0) vF = 0;

    // 스핀오프: β가 SPIN_BETA 이상이면 vF/vL 대폭 손실
    if (beta >= K.DRIFT_SPIN_BETA) {
      vF *= K.SPIN_SPEED_KEEP;
      vL *= K.SPIN_SPEED_KEEP;
      endDriftRoutine(car, 'spin');
    }
  }

  vF = Math.min(vF, topCap);

  // ─── 마찰 (전진 거의 없음, 횡속 = drift 中이면 즉시 GRIP_DRIFT) ───
  const frames = dt * 60;
  vF *= Math.pow(K.ROLL_FWD, frames);

  // μ 단절: drift 中 = GRIP_DRIFT, 회복 中 = RECOVER_GRIP(느슨, 활주), 평소 = GRIP_NORMAL.
  const baseGrip = car.drifting
    ? K.GRIP_DRIFT
    : (car._recoverActive ? K.RECOVER_GRIP : K.GRIP_NORMAL);
  const sideRetention = isIce ? K.ICE_SIDE_RETENTION : baseGrip;
  vL *= Math.pow(sideRetention, frames);

  // ─── 재합성 ───
  car.vx = fwdX * vF + rgtX * vL;
  car.vy = fwdY * vF + rgtY * vL;

  // heading 회전의 일부를 velocity가 따라옴 (곡선 감싸돌기)
  if (car.drifting && (K.DRIFT_HEADING_FOLLOW || 0) > 0) {
    const yawDelta = car.angle - angleBeforeYaw;
    if (yawDelta !== 0) {
      const blendAngle = yawDelta * K.DRIFT_HEADING_FOLLOW;
      const cb = Math.cos(blendAngle), sb = Math.sin(blendAngle);
      const nvx = car.vx * cb - car.vy * sb;
      const nvy = car.vx * sb + car.vy * cb;
      car.vx = nvx; car.vy = nvy;
    }
  }

  car.speed = Math.hypot(car.vx, car.vy);
  car.forwardSpeed = vF;
  car.sideSpeed    = vL;

  // ─── β 재계산 + 자동 release 판정 ───
  const betaPost = Math.atan2(Math.abs(vL), Math.max(1e-3, Math.abs(vF)));
  car.slipBeta   = betaPost;

  // 비주얼 클램프 (HUD/카메라용)
  const slipSigned = Math.atan2(vL, Math.max(1e-3, Math.abs(vF)));
  car.driftAngle = clamp(slipSigned, -K.MAX_SLIP_ANGLE, K.MAX_SLIP_ANGLE);

  // 자동 release: drift 中 β가 RELEASE 임계 밑으로 떨어지면 μ 원복.
  // 기본적으로는 안쪽 키 hold + 카운터 키 없으면 β 안 줄어듬.
  // 카운터 키 alignment로만 β가 깎여서 RELEASE 도달.
  if (car.drifting && car.driftStateTime > K.DRIFT_MIN_HOLD
      && betaPost < K.DRIFT_RELEASE_BETA) {
    endDriftRoutine(car, 'align');
  }

  // ─── 게이지 충전 ───
  // 드리프트 中: ΔG = speed × sin(β) × W_track × dt
  // 일반 주행: 작은 상수 충전
  const atMaxStock = (car.boostStock || 0) >= K.BOOST_STOCK_MAX;
  if (!atMaxStock) {
    let charge = 0;
    if (car.drifting && !(isIce && K.ICE_DISABLE_GAUGE)) {
      const wTrack = (track?.gaugeWeight) ?? K.GAUGE_W_TRACK;
      charge = car.speed * Math.sin(betaPost) * wTrack * dt;
    } else if (!car.drifting && Math.abs(vF) > K.IDLE_CHARGE_MIN_VF) {
      charge = K.IDLE_CHARGE_RATE * dt;
    }
    if (charge > 0) car.boostMeter = Math.min(K.GAUGE_MAX, (car.boostMeter || 0) + charge);
    // 100 도달 → 스택+1, 게이지 0
    if (car.boostMeter >= K.GAUGE_MAX && (car.boostStock || 0) < K.BOOST_STOCK_MAX) {
      car.boostStock = (car.boostStock || 0) + 1;
      car.boostMeter = 0;
    }
  } else {
    car.boostMeter = 0;
  }

  car.driftTime    = car.drifting ? (car.driftStateTime || 0) : 0;
  car.suppressSkid = isIce && K.ICE_DISABLE_SKID;
  car._counterSteer = counterSteer;

  // 회복 타이머 — 만료되면 RECOVER_GRIP 해제 → 평소 GRIP_NORMAL 복귀.
  if (car._recoverActive) {
    car._recoverTimer -= dt;
    if (car._recoverTimer <= 0) car._recoverActive = false;
  }
}

function currentTopCap(car, maxCruise, maxBoost) {
  if (car.boostSustainTimer > 0) return maxBoost;
  if (car.boostCapDecayTimer > 0) {
    const k = car.boostCapDecayTimer / K.BOOST_CAP_DECAY;
    return maxCruise + (maxBoost - maxCruise) * k;
  }
  return maxCruise;
}

// ─── 상태머신: idle → charge → release → idle ───────────────
// 진입: handbrake + 방향키 (둘 다 필요). 종료: handbrake 해제(manual) /
// β 자동 release(align) / 스핀(spin).
export function updateDriftStateMachine(car, input, dt) {
  car.driftState     = car.driftState || 'idle';
  car.driftStateTime = (car.driftStateTime || 0) + dt;

  const handbrake = !!input.handbrake;
  const speed     = Math.hypot(car.vx, car.vy);

  if (car.driftState === 'idle' || car.driftState === 'release') {
    const steerSign = Math.sign(input.steer || 0);
    const hasSteer  = Math.abs(input.steer || 0) > 0.1;
    // 마찰원 초과 트리거 — Shift 없이도 후륜 그립 한계 넘으면 자동 진입.
    const frictionTrigger = K.FRICTION_TRIGGER
      && car.frictionCircleOver
      && hasSteer
      && speed > (K.FRICTION_TRIGGER_MIN_SPEED || 60);
    if ((handbrake || frictionTrigger) && hasSteer && speed > K.MIN_DRIFT_SPEED) {
      car.driftState     = 'charge';
      car.driftStateTime = 0;
      car.drifting       = true;
      car._driftDir      = steerSign;
      // 회복 中 새 드리프트 — 회복 페이즈 즉시 종료.
      car._recoverActive = false;
      car._recoverDone   = true;
      // 진입 임펄스 — 마찰 정점 돌파 표현 (β 즉시 키움)
      car.angle += steerSign * -K.DRIFT_ENTRY_YAW;
    } else {
      car.drifting = false;
      if (car.driftState === 'release' && car.driftStateTime > 0.08) {
        car.driftState     = 'idle';
        car.driftStateTime = 0;
      }
    }
  } else if (car.driftState === 'charge') {
    car.drifting = true;
    if (!handbrake) {
      endDriftRoutine(car, 'manual');
    }
  }
}

// ─── 부스트 폭발 ─────────────────────────────────────────
// 조건: 스택>0 && !boosting (sequential). 스택 -1 + 즉발 임펄스 + sustain.
export function fireBoost(car) {
  if ((car.boostStock || 0) <= 0) return;
  if (car.boosting) return;
  car.boostStock = Math.max(0, (car.boostStock || 0) - 1);
  const fwdX = Math.cos(car.angle);
  const fwdY = Math.sin(car.angle);
  const rgtX = -fwdY;
  const rgtY =  fwdX;
  let vF = car.vx * fwdX + car.vy * fwdY;
  let vL = car.vx * rgtX + car.vy * rgtY;
  vF += K.BOOST_INSTANT_DV;
  car.vx = fwdX * vF + rgtX * vL;
  car.vy = fwdY * vF + rgtY * vL;
  car.boostSustainTimer  = K.BOOST_SUSTAIN_TIME;
  car.boostCapDecayTimer = 0;
  car.boosting           = true;
  car.boostFireFx        = 1.0;
}

export function updateBoostState(car, input, dt) {
  car.boostMeter = clamp(car.boostMeter || 0, 0, K.GAUGE_MAX);
  car.boostStock = clamp(car.boostStock || 0, 0, K.BOOST_STOCK_MAX);

  if (input.boostJust) fireBoost(car);

  if (car.boostSustainTimer > 0) {
    car.boostSustainTimer -= dt;
    if (car.boostSustainTimer <= 0) {
      car.boostSustainTimer  = 0;
      car.boostCapDecayTimer = K.BOOST_CAP_DECAY;
      car.boosting           = false;
    }
  } else if (car.boostCapDecayTimer > 0) {
    car.boostCapDecayTimer = Math.max(0, car.boostCapDecayTimer - dt);
  }

  const target   = car.boosting ? 1 : (car.boostCapDecayTimer > 0 ? 0.35 : 0);
  const response = car.boosting ? 7.5 : 4.0;
  car.boostPower = (car.boostPower || 0)
    + (target - (car.boostPower || 0)) * (1 - Math.exp(-response * dt));
  car.boostFireFx = Math.max(0, (car.boostFireFx || 0) - dt * 3.0);
  car.boostTimer = car.boostSustainTimer;
}

// ─── 초기 state ──────────────────────────────────────────
export function initKartState(car) {
  car.drifting           = false;
  car.driftState         = 'idle';
  car.driftStateTime     = 0;
  car.driftAngle         = 0;
  car.slipBeta           = 0;
  car.forwardSpeed       = 0;
  car.sideSpeed          = 0;
  car.boostMeter         = 0;
  car.boostStock         = 0;
  car.boostSustainTimer  = 0;
  car.boostCapDecayTimer = 0;
  car.boostTimer         = 0;
  car.boostPower         = 0;
  car.boosting           = false;
  car.boostFireFx        = 0;
  car.maxCapNow          = 0;
  car._driftDir          = 0;
  car._counterSteer      = false;
  car._lastDriftEndReason = null;
  car._recoverActive     = false;
  car._recoverTimer      = 0;
  car._recoverDone       = true;
  car.driftTime          = 0;
  car.surface            = 'asphalt';
  car.iceSurface         = false;
  car.suppressSkid       = false;
}
