// KartRider 원작형 드리프트+부스트 모듈 — 단일 진입점.
//
// Drop-in 사용 예시:
//   import {
//     stepKartDrift, initKartState,
//     updateFovPump, applyCameraRig, driftBodyRoll, speedLineIntensity,
//     KART_TUNING, KART_CAMERA,
//   } from './kart-boost/index.js';
//
//   // 1) car 생성 직후
//   initKartState(car);
//
//   // 2) 매 fixed-step 물리 tick
//   stepKartDrift(car, input, dt);
//   moveAndCollide(car, dt, track); // 호출자 책임
//
//   // 3) 매 렌더 frame
//   updateFovPump(camera3d, !!car.boosting, dt);
//   const rig = applyCameraRig(camState, car, BASE_DIST, BASE_HEIGHT, dt);
//   //   → rig.dist, rig.height, rig.yawOffset 으로 chase cam 계산
//   carMesh.rotation.z = driftBodyRoll(car);
//   const intensity = speedLineIntensity(kmh);

export {
  stepKartDrift,
  initKartState,
  updateDriftStateMachine,
  applyTapDrift,
  fireBoost,
  updateBoostState,
  MIN_DRIFT_SPEED,
  DOUBLE_DRIFT_MIN_SPEED,
} from './driftPhysics.js';

export {
  updateFovPump,
  applyCameraRig,
  speedLineIntensity,
  driftBodyRoll,
} from './cameraFx.js';

export { KART_TUNING, KART_CAMERA } from './config.js';
