# kart-boost

KartRider 원작형(즉발 폭발) 드리프트+부스트 모듈. 엔진/렌더러 독립.

## 파일

| 파일 | 역할 |
|---|---|
| `config.js` | 튜닝 상수 (그립, 부스트 DV, FOV 등) |
| `driftPhysics.js` | 드리프트 상태머신 + 부스트 폭발 + 톡톡이 + 마찰 분리 |
| `cameraFx.js` | FOV 펌프 72→92°, 카메라 거리/높이/yaw, 스피드라인, 차체 롤 |
| `index.js` | 단일 진입점 |

## 핵심 메커니즘

```
isDrifting ? grip=0.97 : grip=0.80   // 횡속 유지율/프레임
fwd        : grip=0.995              // 전진 — 사실상 안 죽음
```

이 세 줄이 카트 드리프트 손맛의 90%.

### 부스트 폭발 (원작형)

```
드리프트 해제 + 게이지≥30
  → 즉발 임펄스 +72 km/h (≈+20 m/s)
  → 캡 270 km/h로 1.2초 지속 (+108 km/h/s 가속)
  → 0.6초에 걸쳐 캡 디케이 (탁 안 끊김)
```

### 톡톡이

드리프트 中 방향키 톡(prev<0.2 → cur>0.55) 또는 `driftBurst` 키 누름
→ ±0.085 rad yaw 임펄스 + 게이지 +4. 속도는 안 죽음.

### 상태머신

```
idle ──(handbrake & speed>28)──▶ charge
charge ──(handbrake 해제)──▶ release ─(게이지≥30: fireBoost)
release ──(>0.08s)──▶ idle
charge ──(슬립각 >40°)──▶ release  // 드탈
```

## 사용

```js
import {
  initKartState, stepKartDrift,
  updateFovPump, applyCameraRig, driftBodyRoll, speedLineIntensity,
} from './kart-boost/index.js';

// car 생성 직후
initKartState(car);

// 매 물리 tick (60Hz fixed step 권장)
stepKartDrift(car, input, dt);
moveAndCollide(car, dt, track);   // 호출자가 별도 처리

// 매 렌더 frame
updateFovPump(camera3d, !!car.boosting, dt);
const rig = applyCameraRig(camState, car, BASE_DIST, BASE_HEIGHT, dt);
// → rig.dist / rig.height / rig.yawOffset 사용해 chase cam 계산
carBody.rotation.z = driftBodyRoll(car);
const intensity = speedLineIntensity(kmh);
```

## input 인터페이스

```ts
{
  throttle:   number,   // 0..1
  brake:      number,   // 0..1
  steer:      number,   // -1..1 (좌=-1, 우=+1, 음수가 우회전)
  handbrake:  boolean,  // 드리프트 트리거
  driftBurst: boolean,  // 톡톡이 (E 키 등)
  boostJust:  boolean,  // 수동 부스트 (Shift 등) — 게이지≥30이면 발동
  autoToggle: boolean,  // 옵션
}
```

## car 인터페이스

읽기/쓰기 필드:
```
x, y, angle, vx, vy, speed
steerAngle, turnStrength, accelerationForce, maxSpeed
drifting, driftState, driftStateTime, driftAngle
forwardSpeed, sideSpeed
boostMeter, boosting, boostPower
boostSustainTimer, boostCapDecayTimer, boostTimer
boostFireFx, maxCapNow
_prevSteer, _tapFx
```

`initKartState(car)` 호출로 한번에 초기화.

## 튜닝

`config.js`의 `KART_TUNING` / `KART_CAMERA` 직접 수정.

원작 즉발형 vs 신작 지속형 전환:
- 원작형 (현재 default): `BOOST_INSTANT_DV=72`, `BOOST_SUSTAIN_TIME=1.2`
- 신작형으로 바꾸려면: `BOOST_INSTANT_DV=30` 낮추고 `GAUGE_RATE` 올려 지속 충전 강조

## 충돌

이 모듈은 충돌 처리 안 함. `vx/vy`만 갱신. 호출자가 별도 `moveWithCollision()` 수행.
