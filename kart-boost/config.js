// KartRider 원작형 드리프트+부스트 — 물리 모델 튜닝 상수.
// 모든 값은 60fps 1프레임 기준 또는 km/h 단위.
//
// 모델 요약:
//   • 마찰력 단절: drift 진입 = 횡속 retention이 GRIP_NORMAL → GRIP_DRIFT로 즉시 점프.
//     release = 즉시 GRIP_NORMAL 복원 (μ 원복).
//   • 슬립각 β = atan2(|vL|, |vF|). DRIFT_MIN_BETA(8°) 이상이면 IsDrifting 유지.
//   • 감속 = K_base + K_angle(β) + K_input. K_angle은 exp 성장. K_input은 안쪽
//     방향키 hold 시만 가산 (톡톡이 시 0).
//   • 게이지 ΔG = speed × sin(β) × W_track × dt.
//   • 카운터 키 = alignment torque (heading을 velocity로 보간). β < RELEASE_BETA(3°)
//     이면 자동 release. 스핀: β ≥ SPIN_BETA(88°) 시 vF/vL 대폭 감소.
//   • 부스트 = Spacebar로만 발동, sequential, 스택 최대 2.

export const KART_TUNING = {
  // ── 그립 (횡속 유지율 / 60fps 프레임) ──────────────────────
  // drift 전환 = 즉시 (수식 드롭). μ는 normal→drift = 약 30% 수준으로 표현.
  GRIP_DRIFT:       0.985, // 드리프트 中 — 횡속 거의 유지 (β 키우려 0.95→0.985)
  DRIFT_SIDE_GRIP:  0.985, // alias — HOLD 中 횡속 retention (GRIP_DRIFT와 분리 튜닝 가능)
  GRIP_NORMAL:      0.78,  // 평소 — 빠른 횡속 감쇠 (22%/프레임 손실 → 빠른 그립)
  ROLL_FWD:         0.995, // 전진 구름저항

  // ── 속도 티어 (km/h) ───────────────────────────────────────
  CRUISE_MUL:  1.35,
  V_BOOST_MUL: 1.30,
  ACCEL_BASE:  150,
  BRAKE_RATE:  205,
  REVERSE_TOP: 80,

  // ── 드리프트 회전 ──────────────────────────────────────────
  DRIFT_YAW:         3.6,            // rad/s — 헤딩 회전속도 (β 키우려 2.4→3.6)
  DRIFT_YAW_SMOOTH:  9.0,            // /s — yaw rate lerp 응답 (스텝 응답)
  DRIFT_ENTRY_YAW:   0.48,           // rad ~28° — 진입 임펄스 (β 즉시 키움; 0.060→0.48)
  DRIFT_HEADING_FOLLOW: 0.16,        // heading→velocity 추종 (β 키우려 0.38→0.16)
  MAX_SLIP_ANGLE:    Math.PI * 0.48, // ~86° — driftAngle 비주얼 클램프
  // ── 슬립각 목표·캡 ──
  TARGET_SLIP:       45 * Math.PI / 180, // 45° — HOLD 中 목표 β. 도달 시 yaw 권한 감쇠.
  DEEP_ANGLE:        60 * Math.PI / 180, // 60° — 이 이상부터 감속 페널티 (54→60).
  SAFE_SLIP_CAP:     80 * Math.PI / 180, // 80° — 소프트 슬립 캡 (70→80).
  DRIFT_YAW_MUL:     1.0,                // HOLD 中 yaw 권한 전체 배수.

  // ── 드리프트 판정 (β 임계값) ───────────────────────────────
  DRIFT_MIN_HOLD:     0.15,          // s — 진입 직후 그레이스 (즉시 release 방지)
  DRIFT_MIN_BETA:     8 * Math.PI / 180,  // 8° — 이 이상이면 IsDrifting 유지
  DRIFT_RELEASE_BETA: 3 * Math.PI / 180,  // 3° — 이 이하로 떨어지면 자동 release
  DRIFT_SPIN_BETA:    88 * Math.PI / 180, // 88° — 이 이상이면 스핀오프 (속도 증발)
  SPIN_SPEED_KEEP:    0.18,          // 스핀 시 vF/vL 잔존율 (=82% 손실)

  // ── 감속 모델: Current_Speed = ∫(K_base + K_angle(β) + K_input) dt ─
  // K_base: 카트 고유. 좋은 카트일수록 작음.
  // K_angle: exp 성장 — 깊이 꺾을수록 급격히 감속.
  // K_input: 안쪽 키 hold 시 가산. 톡톡이(키 떼기) 시 0.
  DRIFT_KBASE:        18,            // km/h/s
  DRIFT_KANGLE_SCALE: 8,             // K_scale
  DRIFT_KANGLE_TAU:   0.55,          // rad — exp(β/tau) - 1
  DRIFT_KINPUT:       24,            // km/h/s — 안쪽 키 hold 시
  INSIDE_HOLD_THRESHOLD: 0.4,        // |steer| 이상이고 _driftDir 같은 부호면 hold

  // ── 카운터 스티어 (Alignment Torque) ──────────────────────
  // 반대 방향키 입력 시 heading을 velocity 벡터로 능동 정렬 → β 축소.
  // β < RELEASE_BETA 떨어지면 drift release.
  COUNTER_STEER_THRESHOLD: 0.3,      // 반대 부호 |steer| 이상이면 카운터 인정
  ALIGNMENT_GAIN:    3.5,            // /s — heading→velocity 정렬 속도

  // ── 드리프트 회복 (CM 활주 + 차체 1회 회전, yaw·속도 디커플) ──
  // 종료 시 velocity 스냅 ❌. 관성 그대로 두고 heading만 진행방향으로 회전.
  // 횡속은 RECOVER_GRIP로 천천히 블리드 → 잠깐 미끄러지는 '활주' 구간.
  // heading 회전은 1회 수렴(임계감쇠), 도달 후 정지 → fishtail 방지.
  RECOVER_DURATION:   0.45,           // s — 회복 윈도우 (활주 + 회전 진행)
  RECOVER_YAW_RATE:   5.5,            // rad/s (~315°/s) — heading→velocity 1회 회전
  RECOVER_GRIP:       0.92,           // 횡속 retention (NORMAL 0.78보다 느슨 — 활주감)
  RECOVER_OVERSHOOT:  0,              // rad — 0=칼정렬, >0=한 번만 살짝 넘침

  // ── 차량동역학 골격 (analytics + 6단계 상태머신용) ─────────────
  // 아케이드 위에 '관측/분류' 레이어로 얹힘. 손맛은 아래 RECOVER_*/GRIP_* 가 우선.
  MASS:        1000,                  // kg (가상)
  CG_HEIGHT:   0.40,                  // m — 무게중심 높이
  WHEELBASE:   2.6,                   // m — 휠베이스 L
  TRACK:       1.5,                   // m — 트레드 T
  MU:          1.05,                  // 타이어 μ
  REAR_GRIP_BIAS: 0.55,               // 후륜이 떠받치는 횡력 비율
  FRICTION_OVER_MARGIN: 1.15,         // FreqRear > Fmax*MARGIN 이면 over
  FRICTION_TRIGGER: false,            // true: 마찰원 초과 시 Shift 없이도 drift 진입
  FRICTION_TRIGGER_MIN_SPEED: 60,     // 이 속도 이상에서만 트리거 허용
  // 6단계 분류 임계.
  PHASE_ENTRY_STEER:    0.06,         // |steer| 이상이면 ENTRY
  PHASE_TURN_AY:        40,           // |a_y| 이상이면 LOAD_SHIFT
  PHASE_DRIFT_START_WIN: 0.22,        // s — 진입 직후 DRIFT_START 윈도우

  // ── 게이지 & 부스트 스택 ──────────────────────────────────
  // ΔG = speed × sin(β) × W_track × dt
  // 100 → 스택+1, 게이지 0. 스택 만석(2) 시 충전 멈춤.
  // 벽 박으면 boostMeter=0 (스택 보존).
  GAUGE_MAX:           100,
  BOOST_STOCK_MAX:     2,
  GAUGE_W_TRACK:       0.45,         // 트랙 기본 W 계수
  IDLE_CHARGE_RATE:    4,            // /s — 일반 주행 中 작은 충전
  IDLE_CHARGE_MIN_VF:  30,           // 이 vF 이상이어야 idle charge
  BOOST_INSTANT_DV:    55,           // km/h — 부스트 즉발 임펄스
  BOOST_SUSTAIN_TIME:  1.4,          // s
  BOOST_SUSTAIN_ACCEL: 90,           // km/h/s
  BOOST_CAP_DECAY:     0.6,          // s

  // ── 빙판 ──────────────────────────────────────────────────
  ICE_SIDE_RETENTION:  0.99,
  ICE_DISABLE_GAUGE:   true,
  ICE_DISABLE_SKID:    true,

  // ── 출발부스터 ─────────────────────────────────────────────
  START_BOOST_WINDOW:       0.4,
  START_BOOST_FLOOD_LIMIT:  1.0,
  START_BOOST_DV:           75,
  START_BOOST_SUSTAIN_TIME: 1.6,

  // ── 조향 응답 (비드리프트) ──────────────────────────────────
  STEER_RESPONSE_DRIFT:  11.0,
  STEER_ENGAGE:           15.0,
  STEER_RETURN:           20.0,
  MAX_YAW:                2.3,
  HIGHSPEED_TURN_FACTOR:  0.55,

  // ── 드리프트 진입 최저속 ───────────────────────────────────
  MIN_DRIFT_SPEED: 28,
};

// ── 카메라 / FOV 연출 ────────────────────────────────────────
// KartRider식: 낮고 가깝게 + 속도 비례 FOV. 드리프트 거동은 별도(현 상태 유지).
export const KART_CAMERA = {
  // ── chase 리그 (낮은 시점 + 짧은 거리) ──
  CAM_HEIGHT:        17,    // 기존 36 → 17 (도로가 화면 하단을 채움)
  CAM_DIST:          46,    // 기존 76 → 46 (가깝게)
  CAM_LOOK_AHEAD:    64,    // 카트 앞쪽을 봄
  CAM_LOOK_Y:        11,    // lookAt 타겟 높이 (지평선 위로 살짝)
  CAM_DIST_SPEED_ADD: 14,   // 고속에서 추가 거리 (km/h 비율)

  // ── FOV 속도 비례 ──
  FOV_BASE:        72,
  FOV_MAX:         90,
  FOV_LERP:        0.08,    // 부드러움 계수 (60fps 기준, dt 보정됨)
  FOV_BOOST_BUMP:  6,       // boost 中 추가 FOV

  // ── 드리프트 카메라 (yaw 오프셋 — 기존 유지) ──
  CAM_DIST_PULL:   0.17,
  CAM_HEIGHT_DROP: 5,
  DRIFT_YAW_GAIN:  0.80,   // 0.55→0.80 — 차체 슬립 더 따라가 측면 보이게
  DRIFT_YAW_MAX:   0.45,   // 0.26→0.45 rad (~26°) — 카메라 yaw 지연 폭 확대
  DRIFT_YAW_SMOOTH: 6.0,   // 8→6 — 살짝 느슨하게 추적
  BODY_ROLL_DRIFT: 0.080,    // (legacy, 사용 안 함 — KART_ROLL_MAX로 교체)
  SPEEDLINE_KMH:   200,
  SPEEDLINE_RANGE: 160,

  // ── 드리프트 차체 롤 + 카메라 뱅크 ──
  // 카트 = 안쪽으로 확 누움. 카메라 = 같은 방향으로 살짝 뱅크.
  // 정상 lerp는 부드럽게, cut/align/spin 종료는 빠르게 0 복귀.
  // 회전 피벗 (root)을 차체 뒤쪽으로 옮기기 — drift/yaw 회전 中심이 뒷축에 가까워짐.
  KART_LENGTH:           18.7,             // GLB normalize TARGET_MAX와 동일
  KART_REAR_PIVOT_BIAS:  0.30,             // 0=중심, 1=뒤끝 (살짝)
  KART_ROLL_MAX:   22 * Math.PI / 180,  // 22° — 카트라이더식 안쪽 누움
  CAM_TILT_MAX:    7  * Math.PI / 180,  // 7° — 수평선 확실히 기울게
  ROLL_LERP:       7.0,                 // /s — 정상 응답
  ROLL_SNAP:       22.0,                // /s — cut/spin 시 빠른 0 복귀
  REF_SLIP:        20 * Math.PI / 180,  // ~20° — intensity 풀강도 빠르게 도달
  CAM_TILT_LERP:   5.5,                 // /s — 카메라 뱅크 응답 (멀미 방지로 약간 느리게)
  STEER_ROLL_MAX:  3  * Math.PI / 180,  // ~3° — 일반 코너링 미세 롤

  // ── 부스트 발동 펀치 (FOV kick / speedline / flame) ──
  // 발동 순간 FOV가 +KICK으로 즉시 가산, 매 프레임 SUSTAIN(boost中)/0(끝)으로
  // 감쇠. 체이닝 시 첫 kick만 큼, 지속 베이스 SUSTAIN 유지.
  BOOST_FOV_KICK:        14,     // deg — 발동 순간 즉시 가산
  BOOST_FOV_SUSTAIN:     4,      // deg — 지속 중 베이스 (kick 끝나도 유지)
  BOOST_FOV_DECAY:       6.0,    // /s — kick → sustain/0 lerp 응답
  BOOST_SHAKE_AMP:       7,      // 발동 순간 카메라 셰이크 (effects.triggerShake)
  SPEEDLINE_MAX_OPACITY: 0.85,   // 부스트 中 속도선 알파 max
  SPEEDLINE_BOOST_RATE:  260,    // /s — boost 中 추가 spawn rate
  FLAME_BOOST_SCALE:     1.85,   // 부스트 中 화염 길이 배율 (base 추가)
};
