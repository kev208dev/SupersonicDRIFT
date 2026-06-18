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
  GRIP_DRIFT:       0.985, // 드리프트 中 — 횡속 거의 유지 (β 유지)
  DRIFT_SIDE_GRIP:  0.985,
  GRIP_NORMAL:      0.55,  // 0.78→0.55 — 평소 횡속 강하게 잡음 (얼음판 느낌 ❌, "꽉 잡힘")
  ROLL_FWD:         0.995,

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
  RECOVER_DURATION:   0.18,           // 0.45→0.18 — 드리프트 종료 직후 짧고 단호한 스냅
  RECOVER_YAW_RATE:   7.5,            // 5.5→7.5 — heading 정렬 더 빠르게
  RECOVER_GRIP:       0.62,           // 0.92→0.62 — 라인 "탁!" 잡힘
  RECOVER_OVERSHOOT:  0,

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

  // ── 조향 응답 (비드리프트) ── PC: 묵직하게 쌓이게.
  STEER_RESPONSE_DRIFT:  11.0,
  STEER_ENGAGE:           7.5,    // 15→7.5 — 조향이 천천히 쌓이게(휙 안 돌아감)
  STEER_RETURN:          14.0,    // 20→14 — 복귀도 묵직
  MAX_YAW:                1.7,    // 2.3→1.7 — 최대 yaw rate 하향 (트위치 제거)
  HIGHSPEED_TURN_FACTOR:  0.50,   // 0.55→0.50 — 고속에서 더 둔하게

  // ── 드리프트 진입 최저속 ───────────────────────────────────
  MIN_DRIFT_SPEED: 28,
};

// ── 카메라 / FOV 연출 ────────────────────────────────────────
// KartRider식: 낮고 가깝게 + 속도 비례 FOV. 드리프트 거동은 별도(현 상태 유지).
export const KART_CAMERA = {
  // ── chase 리그 (낮은 시점 + 짧은 거리) ──
  CAM_HEIGHT:        22,    // 13→22 (+70% — 위에서 내려다보는 카트라이더식)
  CAM_DIST:          30,    // 유지 (가까움)
  CAM_LOOK_AHEAD:    55,    // 50→55 (앞 도로 더 보임)
  CAM_LOOK_Y:        2,     // 9→2 (타겟 낮춤 → 카메라 약 -14° 피치)
  CAM_DIST_SPEED_ADD: 10,

  // ── FOV 속도 비례 ──
  FOV_BASE:        64,    // 72→64 (정지 시 기본)
  FOV_MAX:         88,    // 90→88 (최고속도 시)
  FOV_LERP:        0.08,    // 부드러움 계수 (60fps 기준, dt 보정됨)
  FOV_BOOST_BUMP:  6,       // boost 中 추가 FOV

  // ── 드리프트 카메라 (yaw 오프셋 — 기존 유지) ──
  CAM_DIST_PULL:   0.17,
  CAM_HEIGHT_DROP: 5,
  // PC 원작: 카메라는 '진행방향(velocity)'을 추적. 차체 헤딩 추적 ❌. drift yaw 오프셋도 ❌.
  // 아래 값은 legacy(다른 screen 참조 유지용)만 남기고 사용하지 않음.
  DRIFT_YAW_GAIN:  0.0,
  DRIFT_YAW_MAX:   0.0,
  DRIFT_YAW_SMOOTH: 6.0,
  CAM_YAW_FOLLOW:  0.0,                  // (legacy) 카메라는 velocity만 추적 — heading 0%.
  BODY_ROLL_DRIFT: 0.080,    // (legacy, 사용 안 함 — KART_ROLL_MAX로 교체)
  SPEEDLINE_KMH:   200,
  SPEEDLINE_RANGE: 160,

  // ── 드리프트 차체 롤 + 카메라 뱅크 ──
  // 카트 = 안쪽으로 확 누움. 카메라 = 같은 방향으로 살짝 뱅크.
  // 정상 lerp는 부드럽게, cut/align/spin 종료는 빠르게 0 복귀.
  // 회전 피벗 (root)을 차체 뒤쪽으로 옮기기 — drift/yaw 회전 中심이 뒷축에 가까워짐.
  KART_LENGTH:           18.7,             // GLB normalize TARGET_MAX와 동일
  KART_REAR_PIVOT_BIAS:  0.30,             // 0=중심, 1=뒤끝 (살짝)
  KART_ROLL_MAX:   0,                   // 드리프트 차체 롤 ❌ — yaw만 바뀜
  CAM_TILT_MAX:    0,                    // PC: 카메라 뱅크 ❌. 수평선 항상 수평.
  ROLL_LERP:       7.0,                 // /s — 정상 응답
  ROLL_SNAP:       22.0,                // /s — cut/spin 시 빠른 0 복귀
  REF_SLIP:        20 * Math.PI / 180,  // ~20° — intensity 풀강도 빠르게 도달
  CAM_TILT_LERP:   5.5,                 // /s — 카메라 뱅크 응답 (멀미 방지로 약간 느리게)
  STEER_ROLL_MAX:  0,                   // 일반 코너 롤 ❌

  // ── 부스트 발동 펀치 (FOV kick / speedline / flame) ──
  // 발동 순간 FOV가 +KICK으로 즉시 가산, 매 프레임 SUSTAIN(boost中)/0(끝)으로
  // 감쇠. 체이닝 시 첫 kick만 큼, 지속 베이스 SUSTAIN 유지.
  BOOST_FOV_KICK:        14,     // deg — PC 원작 발동 펀치 +14°
  BOOST_FOV_SUSTAIN:     5,      // deg — 지속 中 베이스
  BOOST_FOV_DECAY:       6.0,    // /s
  BOOST_SHAKE_AMP:       8,
  SPEEDLINE_MAX_OPACITY: 0.55,   // PC: 가장자리만 진하게 (0.5-0.6 범위)
  SPEEDLINE_BOOST_RATE:  320,    // /s — boost 中 추가 spawn rate
  FLAME_BOOST_SCALE:     2.4,    // 부스트 中 화염 길이 배율

  // ── PART 3 FX 토글 (개별 on/off 가능) ─────────────────────────
  FX_WIND:        true,
  FX_BRAKE:       true,
  FX_DRIFT_TRAIL: true,
  FX_BOOST:       true,

  // 1) 고속 바람저항
  WIND_SPEED_MIN:    220,        // km/h — 이 이상부터 효과 시작
  WIND_FOV_ADD:      5,          // 최고속에서 추가 FOV (속도FOV 위에)
  WINDLINE_MAX:      1.0,        // 속도선 강도 배율 max
  RADIALBLUR_MAX:    0.0,        // (구현 안 함 — speedline으로 대체)

  // 2) 브레이크
  BRAKE_GLOW_INTENSITY: 1.0,     // 후미등 emissive 강도
  NOSE_DIVE_DEG:        2.5,     // 노즈다이브 각도 (deg)
  BRAKE_SMOKE_RATE:     14,      // /s — 브레이크 연기 spawn

  // 3) 드리프트 트레일 — 색은 gauge로 보간
  TRAIL_COLOR_LOW:   0xfff099,   // 진입 초반: 옅은 노랑
  TRAIL_COLOR_HIGH:  0x6688ff,   // 게이지 만점: 파랑/보라

  // 4) 부스트 단발 vs 링크
  BOOST_NORMAL_FOV:      14,
  BOOST_LINK_FOV:        20,
  BOOST_NORMAL_FLAME_COLOR: 0xff8033,   // 주황
  BOOST_LINK_FLAME_COLOR:   0x66b4ff,   // 청백
  BOOST_LINK_FLAME_SCALE:   3.2,        // 링크 부스트는 더 굵게
  BOOST_LINK_SUSTAIN_MUL:   1.6,        // 지속 시간 배수
};
