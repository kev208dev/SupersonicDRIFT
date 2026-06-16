// KartRider 원작형(즉발 폭발) 드리프트+부스트 튜닝 상수.
// 모든 값은 60fps 1프레임 기준 또는 km/h 단위.

export const KART_TUNING = {
  // ── 그립 (횡속 유지율 / 60fps 프레임) ──────────────────────
  GRIP_DRIFT:  0.97, // 드리프트 中 — 옆으로 길게 미끄러짐
  GRIP_NORMAL: 0.80, // 평소 — "레일 위에 붙은" 느낌
  ROLL_FWD:    0.995, // 전진 구름저항 — 사실상 안 죽음

  // ── 속도 티어 (km/h) ───────────────────────────────────────
  CRUISE_MUL:  1.35,  // car.maxSpeed에 곱하는 전역 cruise 배율
  V_BOOST_MUL: 1.30,  // boost top = 1.30× cruise (부스트가 너무 폭주하지 않게)
  ACCEL_BASE:  150,   // km/h/s — 정지→cruise ≈ 1.3s
  BRAKE_RATE:  205,
  REVERSE_TOP: 80,

  // ── 드리프트 회전 ──────────────────────────────────────────
  DRIFT_YAW:         2.6,            // rad/s (~150°/s)
  DRIFT_ENTRY_YAW:   0.06,           // rad — 진입 임펄스
  MAX_SLIP_ANGLE:    Math.PI * 0.22, // ~40° 넘으면 드탈
  TAP_YAW_IMPULSE:   0.085,
  TAP_STEER_HI:      0.55,
  TAP_STEER_LO:      0.20,
  TAP_GAUGE_BUMP:    4,

  // ── 게이지 & 부스트 ────────────────────────────────────────
  GAUGE_MAX:           100,
  GAUGE_RATE:          30,   // slip×speed 가중 충전
  BOOST_COST:          30,   // 1스택
  BOOST_INSTANT_DV:    45,   // km/h — 즉발 임펄스 (벽 충돌 완화 위해 낮춤)
  BOOST_SUSTAIN_TIME:  1.0,  // s
  BOOST_SUSTAIN_ACCEL: 85,   // km/h/s — 지속 가속 (감속 후 천천히 cap까지)
  BOOST_CAP_DECAY:     0.6,  // s — 캡을 boost→cruise로 부드럽게

  // ── 조향 응답 ──────────────────────────────────────────────
  STEER_RESPONSE_DRIFT:  11.0,

  // ── 일반 주행 조향 손맛 (비드리프트 경로만 적용) ────────────
  // 응답률 r = 3/T (T초에 95% 도달). 클수록 빠름.
  STEER_ENGAGE:           15.0, // ≈ 0.20s에 풀조향 도달 (입력 → 휠)
  STEER_RETURN:           20.0, // ≈ 0.15s에 0으로 복귀 (놓으면 빠르게)
  MAX_YAW:                2.3,  // rad/s ≈ 130°/s — 최대 회전속도 cap
  HIGHSPEED_TURN_FACTOR:  0.55, // 최고속 회전력 배율 (저속 1.0 → 최고속 0.55)

  // ── 드리프트 진입 최저속 ───────────────────────────────────
  MIN_DRIFT_SPEED: 28,
};

// ── 카메라 / FOV 연출 ────────────────────────────────────────
export const KART_CAMERA = {
  FOV_BASE:        72,    // 기본 FOV
  FOV_BOOST:       92,    // boost 中 — "슉" 감각의 정체
  FOV_LERP_IN:     0.30,  // s — boost 진입 (95% 도달 시간)
  FOV_LERP_OUT:    0.50,  // s — boost 종료

  CAM_DIST_PULL:   0.17,  // boost 中 후방 거리 17% 당김 (6m→5m)
  CAM_HEIGHT_DROP: 6,     // boost 中 카메라 높이 -0.3m 비례 단위

  DRIFT_YAW_GAIN:  0.55,  // 드리프트 슬립각에 비례한 yaw 오프셋
  DRIFT_YAW_MAX:   0.26,  // rad ≈ 15°
  DRIFT_YAW_SMOOTH: 8.0,  // 카메라 yaw lerp 응답

  BODY_ROLL_DRIFT: 0.080, // rad ≈ 4.6° (차체 롤)

  SPEEDLINE_KMH:   200,   // cruise 위 영역에서 발동
  SPEEDLINE_RANGE: 160,   // intensity 정규화 폭
};
