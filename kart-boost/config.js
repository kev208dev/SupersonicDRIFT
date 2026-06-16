// KartRider 원작형(즉발 폭발) 드리프트+부스트 튜닝 상수.
// 모든 값은 60fps 1프레임 기준 또는 km/h 단위.

export const KART_TUNING = {
  // ── 그립 (횡속 유지율 / 60fps 프레임) ──────────────────────
  GRIP_DRIFT:  0.97, // 드리프트 中 — 옆으로 길게 미끄러짐
  GRIP_NORMAL: 0.80, // 평소 — "레일 위에 붙은" 느낌
  ROLL_FWD:    0.995, // 전진 구름저항 — 사실상 안 죽음

  // ── 속도 티어 (km/h) ───────────────────────────────────────
  V_BOOST_MUL: 1.50,  // boost top = 1.5× cruise
  ACCEL_BASE:  95,    // km/h/s
  BRAKE_RATE:  150,
  REVERSE_TOP: 60,

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
  BOOST_INSTANT_DV:    72,   // km/h (≈ +20 m/s) — 즉발 임펄스
  BOOST_SUSTAIN_TIME:  1.2,  // s
  BOOST_SUSTAIN_ACCEL: 108,  // km/h/s (≈ +30 m/s²)
  BOOST_CAP_DECAY:     0.6,  // s — 캡을 boost→cruise로 부드럽게

  // ── 조향 응답 ──────────────────────────────────────────────
  STEER_RESPONSE_NORMAL: 5.8,
  STEER_RESPONSE_DRIFT:  11.0,

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

  SPEEDLINE_KMH:   160,   // ~60 m/s 영역에서 본격 발동
  SPEEDLINE_RANGE: 130,   // intensity 정규화 폭
};
