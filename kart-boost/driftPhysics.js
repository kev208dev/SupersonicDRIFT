// KartRider 원작형 드리프트+부스트 코어.
//
// 핵심 루프:
//   • 속도를 forward(vF)/lateral(vL)로 쪼개 마찰을 독립 적용.
//   • 전진 마찰 ≈ 0(0.995/프레임) — 드리프트해도 속도가 안 죽음.
//   • 횡 마찰: 평소 0.80/프레임, 드리프트 0.97/프레임.
//   • 드리프트 상태머신: idle → charge → release. 해제 순간 1스택 이상이면
//     즉발 임펄스 +72 km/h(≈+20 m/s) + 지속 부스트(1.2s, 캡 270 km/h).
//   • 톡톡이: 드리프트 中 방향키 톡 또는 driftBurst 키 → yaw 임펄스 재주입.
//
// car 인터페이스 (입출력 필드):
//   x, y, angle, vx, vy, speed, steerAngle, turnStrength, accelerationForce,
//   maxSpeed, transmission,
//   drifting, driftState, driftStateTime, driftAngle, forwardSpeed, sideSpeed,
//   boostMeter, boosting, boostPower, boostSustainTimer, boostCapDecayTimer,
//   boostTimer, boostFireFx, maxCapNow, _prevSteer, _tapFx
//
// input 인터페이스:
//   throttle, brake, steer, handbrake, driftBurst, boostJust, autoToggle

import { KART_TUNING as K } from './config.js';

export const MIN_DRIFT_SPEED = K.MIN_DRIFT_SPEED;
export const DOUBLE_DRIFT_MIN_SPEED = K.MIN_DRIFT_SPEED;

function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }

// ─── 메인: 매 물리 스텝 (dt초) 호출 ───────────────────────────
// move() / collision()은 호출자가 별도로 처리. 이 함수는 vx/vy/angle만 갱신.
export function stepKartDrift(car, input, dt) {
  if (dt <= 0) return;
  if (dt > 0.05) dt = 0.05;

  if (input.autoToggle) {
    car.transmission = (car.transmission === 'manual') ? 'auto' : 'manual';
  }

  updateDriftStateMachine(car, input, dt);
  updateBoostState(car, input, dt);

  const maxCruise = Math.max(120, (car.maxSpeed || 180));
  const maxBoost  = maxCruise * K.V_BOOST_MUL;
  const topCap    = currentTopCap(car, maxCruise, maxBoost);
  car.maxCapNow   = topCap;

  const fwdX = Math.cos(car.angle);
  const fwdY = Math.sin(car.angle);
  const rgtX = -fwdY;
  const rgtY =  fwdX;

  // forward / lateral 분해
  let vF = car.vx * fwdX + car.vy * fwdY;
  let vL = car.vx * rgtX + car.vy * rgtY;

  // ─── 조향 ───
  const speedRatio  = clamp(Math.abs(vF) / maxCruise, 0, 1);
  const maxWheel    = (car.drifting ? 0.95 : (0.72 - speedRatio * 0.28)) * (car.turnStrength || 1);
  const targetWheel = -input.steer * maxWheel;
  const steerResp   = car.drifting ? K.STEER_RESPONSE_DRIFT : K.STEER_RESPONSE_NORMAL;
  car.steerAngle   += (targetWheel - car.steerAngle) * Math.min(dt * steerResp, 1);

  if (Math.abs(vF) > 0.6) {
    const dirSign = vF >= 0 ? 1 : -1;
    if (car.drifting) {
      // heading을 회전 → 속도방향과 슬립각이 벌어짐
      const yawRate = -input.steer * K.DRIFT_YAW * Math.max(0.35, speedRatio) * dirSign;
      car.angle += yawRate * dt;
    } else {
      const turnGain = (0.42 + speedRatio * 0.55) * (car.turnStrength || 1);
      car.angle += car.steerAngle * turnGain * dirSign * dt;
    }
  }

  // ─── 톡톡이 ───
  applyTapDrift(car, input, dt);

  // ─── 가속/제동 (전진축만) ───
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
  vF = Math.min(vF, topCap);

  // ─── 마찰: 전진 거의 없음 / 횡 그립값 ───
  const frames = dt * 60;
  vF *= Math.pow(K.ROLL_FWD, frames);
  const grip = car.drifting ? K.GRIP_DRIFT : K.GRIP_NORMAL;
  vL *= Math.pow(grip, frames);

  // 재합성
  car.vx = fwdX * vF + rgtX * vL;
  car.vy = fwdY * vF + rgtY * vL;
  car.speed = Math.hypot(car.vx, car.vy);
  car.forwardSpeed = vF;
  car.sideSpeed    = vL;

  // 슬립각 + 게이지 충전
  const slip = Math.atan2(vL, Math.max(1e-3, Math.abs(vF)));
  car.driftAngle = clamp(slip, -K.MAX_SLIP_ANGLE, K.MAX_SLIP_ANGLE);
  if (car.drifting && Math.abs(vF) > K.MIN_DRIFT_SPEED * 0.8) {
    const slipNorm  = clamp(Math.abs(slip) / K.MAX_SLIP_ANGLE, 0, 1);
    const speedNorm = clamp(Math.abs(vF) / maxCruise, 0, 1.2);
    car.boostMeter  = Math.min(K.GAUGE_MAX,
      (car.boostMeter || 0) + K.GAUGE_RATE * (0.25 + slipNorm * 0.95) * speedNorm * dt);
  }

  // 드탈 — 슬립각 한계 초과 시 드리프트 강제 종료
  if (car.drifting && Math.abs(slip) >= K.MAX_SLIP_ANGLE * 0.98) {
    car.driftState = 'release';
    car.driftStateTime = 0;
    car.drifting = false;
  }
}

// ─── 현재 속도 캡: boost 中 boostTop, 끝나면 0.6초 디케이 ──────
function currentTopCap(car, maxCruise, maxBoost) {
  if (car.boostSustainTimer > 0) return maxBoost;
  if (car.boostCapDecayTimer > 0) {
    const k = car.boostCapDecayTimer / K.BOOST_CAP_DECAY;
    return maxCruise + (maxBoost - maxCruise) * k;
  }
  return maxCruise;
}

// ─── 상태머신: idle → charge → release → idle ───────────────
export function updateDriftStateMachine(car, input, dt) {
  car.driftState     = car.driftState || 'idle';
  car.driftStateTime = (car.driftStateTime || 0) + dt;

  const handbrake = !!input.handbrake;
  const speed     = Math.hypot(car.vx, car.vy);

  if (car.driftState === 'idle' || car.driftState === 'release') {
    if (handbrake && speed > K.MIN_DRIFT_SPEED) {
      car.driftState     = 'charge';
      car.driftStateTime = 0;
      car.drifting       = true;
      // 진입 임펄스 — heading을 살짝 비스듬히
      const dir = Math.sign(input.steer) || Math.sign(car.steerAngle) || 0;
      if (dir !== 0) car.angle += dir * -K.DRIFT_ENTRY_YAW;
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
      car.driftState     = 'release';
      car.driftStateTime = 0;
      // 해제 순간 1스택 이상이면 즉발 부스터 폭발
      if ((car.boostMeter || 0) >= K.BOOST_COST) {
        fireBoost(car);
      }
    }
  }
}

// ─── 톡톡이 ────────────────────────────────────────────────
export function applyTapDrift(car, input, dt) {
  car._prevSteer = car._prevSteer ?? 0;
  const cur  = input.steer || 0;
  const prev = car._prevSteer;
  car._prevSteer = cur;

  if (!car.drifting) {
    car._tapFx = Math.max(0, (car._tapFx || 0) - dt);
    return;
  }

  // 키 톡: 방향키가 거의 0 → 임계 이상으로 전환
  const keyTap = Math.abs(prev) < K.TAP_STEER_LO && Math.abs(cur) > K.TAP_STEER_HI;
  const burst  = !!input.driftBurst;
  if (!keyTap && !burst) {
    car._tapFx = Math.max(0, (car._tapFx || 0) - dt);
    return;
  }

  const yawDir = keyTap ? -Math.sign(cur)
                        : -Math.sign(input.steer || car.steerAngle || 1);
  car.angle      += yawDir * K.TAP_YAW_IMPULSE;
  car.boostMeter  = Math.min(K.GAUGE_MAX, (car.boostMeter || 0) + K.TAP_GAUGE_BUMP);
  car._tapFx      = 0.18;
}

// ─── 부스트 폭발: 즉발 임펄스 + 지속 1.2s ──────────────────
export function fireBoost(car) {
  car.boostMeter = Math.max(0, (car.boostMeter || 0) - K.BOOST_COST);
  const fwdX = Math.cos(car.angle);
  const fwdY = Math.sin(car.angle);
  const rgtX = -fwdY;
  const rgtY =  fwdX;
  let vF = car.vx * fwdX + car.vy * fwdY;
  let vL = car.vx * rgtX + car.vy * rgtY;
  vF += K.BOOST_INSTANT_DV;
  car.vx = fwdX * vF + rgtX * vL;
  car.vy = fwdY * vF + rgtY * vL;

  car.boostSustainTimer  = K.BOOST_SUSTAIN_TIME; // 더블부스터는 이 줄이 곧 연장
  car.boostCapDecayTimer = 0;
  car.boosting           = true;
  car.boostFireFx        = 1.0;
}

export function updateBoostState(car, input, dt) {
  car.boostMeter = clamp(car.boostMeter || 0, 0, K.GAUGE_MAX);

  // 더블부스터: Shift 추가 발동 시 지속시간 갱신
  if (input.boostJust && (car.boostMeter || 0) >= K.BOOST_COST) {
    fireBoost(car);
  }

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

  car.boostTimer = car.boostSustainTimer; // 호환
}

// ─── 초기 state 헬퍼 ──────────────────────────────────────
export function initKartState(car) {
  car.drifting           = false;
  car.driftState         = 'idle';
  car.driftStateTime     = 0;
  car.driftAngle         = 0;
  car.forwardSpeed       = 0;
  car.sideSpeed          = 0;
  car.boostMeter         = 0;
  car.boostSustainTimer  = 0;
  car.boostCapDecayTimer = 0;
  car.boostTimer         = 0;
  car.boostPower         = 0;
  car.boosting           = false;
  car.boostFireFx        = 0;
  car.maxCapNow          = 0;
  car._prevSteer         = 0;
  car._tapFx             = 0;
}
