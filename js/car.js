import * as THREE from 'three';
import { createCarDesign } from './carDesigns.js';
import { getKartMesh, listKartIds } from './whiteMesh.js';
import { mapStatToPhysics, normalizeCarStats } from './carStats.js';
import { getSkinById } from '../data/skins.js';
import { KART_CAMERA as KC } from '../kart-boost/config.js';

// 카트 → GLB 매핑. 두 GLB(kart_a/kart_b)만 사용. 미매핑은 kart_a 기본.
const CAR_DESIGN_BY_ID = {
  apex_gt3:   'kart_a',
  lmp:        'kart_b',
  zero_f1:    'kart_a',
  photon_gtr: 'kart_b',
  prism_evo:  'kart_a',
};

// ── physics state ────────────────────────────────────────────
export function createCar(carData, startPos) {
  const stats = normalizeCarStats(carData.stats, carData.tier);
  const statPhysics = mapStatToPhysics(stats);
  return {
    id:          carData.id,
    name:        carData.name,
    mass:        carData.mass,
    power:       carData.power,
    price:       carData.price || 0,
    maxSpeed:    Math.max(180, statPhysics.maxSpeed),
    baseMaxSpeed: carData.maxSpeed,
    accelerationForce: statPhysics.accelerationForce,
    brakePower: statPhysics.brakePower,
    traction: statPhysics.traction,
    turnStrength: statPhysics.turnStrength,
    driftPower: statPhysics.driftPower,
    boostStatMultiplier: statPhysics.boostMultiplier,
    carStats: stats,
    grip:        carData.grip * statPhysics.traction,
    wheelbase:   carData.wheelbase,
    dragCoef:    carData.dragCoef,
    maxRpm:      carData.maxRpm,
    maxTorque:   carData.maxTorque,
    boostChargeRate: (carData.boostChargeRate || 14) * statPhysics.boostRecharge,
    boostCost:   carData.boostCost || 38,
    boostDuration: (carData.boostDuration || 1.45) * (statPhysics.boostDuration / 1.4),
    boostSpeedMult: (carData.boostSpeedMult || 1.23) * (statPhysics.boostMultiplier / 1.2),
    boostAccelMult: (carData.boostAccelMult || 1.35) * (statPhysics.boostMultiplier / 1.2),
    flameScale:  carData.flameScale || 1,
    skin:        carData.skin || null,
    color:       carData.color,
    bodyColor:   carData.color,
    x: startPos.x, y: startPos.y, angle: startPos.angle,
    vx: 0, vy: 0, speed: 0,
    engineOn: true,
    parkingBrake: false,
    rpm: 1000, gear: 1, steerAngle: 0,
    offTrack: false,
    transmission: 'auto',     // 'auto' | 'manual'
    revLimitTimer: 0,
    sideSpeed: 0,
    drifting: false,
    boostMeter: 0,            // 0..100
    boostTimer: 0,
    boostPower: 0,
    boosting: false,
    superBoostMeter: 100,
    drsAvailable: false,
    drsActive: false,
    drsTimer: 0,
    drsTapTimer: 0,
    drsPower: 0,
    wallRiding: false,
    wallRideSide: 0,
    lastWallHit: null,
    _acc: 0, _shiftTimer: 0,
    _prevFwdSpeed: 0,
  };
}

// ── 3D mesh ──────────────────────────────────────────────────
// Hierarchy:
//   root (rotation.y = car.angle, position = world)
//     └── createCarDesign(type) child
export function createCar3D(carData = {}) {
  const root = new THREE.Group();
  const designId  = carData.designType || CAR_DESIGN_BY_ID[carData.id] || 'kart_a';
  const validIds  = listKartIds();
  const kartId    = validIds.includes(designId) ? designId : validIds[0];

  // body wrapper(서스펜션 y 바운스 슬롯) → inner(yaw rotation) → GLB scene.
  // GLB는 normalize에서 이미 최종 스케일 + 바닥 정렬 완료. inner는 회전만 담당.
  const body  = new THREE.Group();
  const inner = new THREE.Group();
  inner.rotation.y = Math.PI / 2;
  // 회전축(=root origin)을 차체 뒤로 살짝 옮기기 — inner를 차 forward(+X) 로 밀어 GLB를 앞으로 보냄.
  // KART_REAR_PIVOT_BIAS: 0=중심, 1=뒤끝. 살짝 → 0.30.
  inner.position.x = (KC.KART_LENGTH || 18.7) * 0.5 * (KC.KART_REAR_PIVOT_BIAS || 0.30);
  const kart  = getKartMesh(kartId);
  const model = kart ? kart.root : _fallbackBox();
  inner.add(model);
  body.add(inner);
  root.add(body);

  // 배기 화염 — GLB에 boostflame 메시가 없어서 절차적으로 추가.
  // body(서스펜션) 자식으로 붙여서 같이 흔들리게.
  _addBoostFlame(body);

  root.wheelGroups   = kart ? kart.wheels : [];
  root.body          = body;
  root.bodyInner     = inner;
  root.castShadow    = true;
  root._lastWheelTime = performance.now();
  root._designId     = kartId;
  root._needsGlbSwap = !kart;

  return root;
}

function _addBoostFlame(parent) {
  // root 좌표계 기준: kart forward = +X, 차체 뒤끝 ≈ -7 부근(KART_LENGTH 18.7 / 2 - 피벗 bias).
  const len = KC.KART_LENGTH || 18.7;
  const bias = KC.KART_REAR_PIVOT_BIAS || 0.30;
  const rearX = -(len * 0.5) + (len * 0.5 * bias);  // root-local에서 차 뒤쪽 위치
  const group = new THREE.Group();
  group.name = 'boostflame';
  group.position.set(rearX - 1.2, 1.4, 0);
  group.rotation.z = Math.PI / 2; // cone 끝을 -X로
  // 콘 메시 3겹.
  const layers = [
    { name: 'flameouter', color: 0xff5a1f, opacity: 0.36, radius: 0.9 },
    { name: 'flameinner', color: 0xfff1a8, opacity: 0.68, radius: 0.55 },
    { name: 'flameglow',  color: 0xffd066, opacity: 0.13, radius: 1.45 },
  ];
  for (const L of layers) {
    const m = new THREE.Mesh(
      new THREE.ConeGeometry(L.radius, 3.5, 16, 1, true),
      new THREE.MeshBasicMaterial({
        color: L.color, transparent: true, opacity: L.opacity,
        depthWrite: false, blending: THREE.AdditiveBlending,
      })
    );
    m.name = L.name;
    m.position.y = 1.8;
    group.add(m);
  }
  group.visible = false;
  parent.add(group);
}

function _trySwapToGlb(root) {
  if (!root._needsGlbSwap) return;
  const kart = getKartMesh(root._designId);
  if (!kart) return;
  // inner의 자식만 교체 — body(서스펜션 슬롯)와 inner(yaw) 구조 유지.
  const inner = root.bodyInner;
  if (!inner) return;
  while (inner.children.length) inner.remove(inner.children[0]);
  inner.add(kart.root);
  root.wheelGroups = kart.wheels;
  root._needsGlbSwap = false;
  root._susState = null;
}

function _fallbackBox() {
  const g = new THREE.Group();
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(2.5, 1.0, 1.4),
    new THREE.MeshStandardMaterial({ color: 0xcccccc, roughness: 0.4 })
  );
  mesh.position.y = 0.5;
  g.add(mesh);
  return g;
}

function _applySkin(model, skinData) {
  const skin = getSkinById(skinData?.id || skinData);
  if (!skin || skin.id === 'factory') return;
  const paint = new THREE.Color(skin.color || '#ffffff');
  const accent = new THREE.Color(skin.accent || skin.color || '#ffffff');
  const emissive = skin.emissive ? new THREE.Color(skin.emissive) : accent.clone().multiplyScalar(0.22);

  model.traverse(child => {
    if (!child.isMesh || !child.material) return;
    const name = child.name.toLowerCase();
    if (
      name.includes('tire')
      || name.includes('glass')
      || name.includes('brakelight')
      || name.includes('headlight')
      || name.includes('splitter')
      || name.includes('diffuser')
      || name.includes('intake')
      || name.includes('canard')
      || name.includes('skirt')
      || name.includes('flame')
    ) return;
    const isAccent = name.includes('rim') || name.includes('wing') || name.includes('stripe') || name.includes('spoiler');
    const mat = child.material.clone();
    mat.color.copy(isAccent ? accent : paint);
    if (skin.emissive || skin.id === 'ori' || skin.id === 'flame') {
      mat.emissive = (isAccent ? accent : emissive).clone();
      mat.emissiveIntensity = isAccent ? 0.45 : 0.18;
    }
    child.material = mat;
  });
}

// ── per-frame mesh sync ──────────────────────────────────────
export function updateCar3D(mesh3d, car, input, track = null, dt = 1 / 60) {
  // GLB 늦게 로드된 경우 첫 프레임에 fallback → GLB 교체.
  if (mesh3d._needsGlbSwap) _trySwapToGlb(mesh3d);
  // 2D y → 3D -z mapping
  // 차는 항상 평평하게 — 펜스/연석 타고 올라가지 않게 수직 변위 ❌.
  const surfaceY = _trackSurfaceHeight(track, car.x, car.y);
  car.roadHeight = surfaceY;
  mesh3d.position.set(car.x, surfaceY, -car.y);
  if (mesh3d._visualAngle == null) mesh3d._visualAngle = car.angle;
  let visualDelta = car.angle - mesh3d._visualAngle;
  while (visualDelta > Math.PI) visualDelta -= Math.PI * 2;
  while (visualDelta < -Math.PI) visualDelta += Math.PI * 2;
  if (Math.abs(visualDelta) > Math.PI * 0.72) mesh3d._visualAngle = car.angle;
  else mesh3d._visualAngle += visualDelta * 0.38;
  mesh3d.rotation.y = mesh3d._visualAngle;

  const speedSign = Math.sign(car.vx * Math.cos(car.angle) + car.vy * Math.sin(car.angle)) || 1;
  const speed = car.speed;
  const speedN = Math.min(1, speed / 210);

  const now = performance.now();
  const wheelDt = Math.min(0.05, Math.max(0, (now - (mesh3d._lastWheelTime || now)) / 1000));
  mesh3d._lastWheelTime = now;
  const spinRate = speed * 0.40 * wheelDt * speedSign;
  for (const wg of (mesh3d.wheelGroups || [])) {
    if (!wg.pivot) continue;
    // 휠 메시의 짧은축(=axle)을 기준으로 굴림.
    if      (wg.axis === 'x') wg.pivot.rotation.x += spinRate;
    else if (wg.axis === 'y') wg.pivot.rotation.y += spinRate;
    else                       wg.pivot.rotation.z += spinRate;
  }


  const throttle = input ? (input.throttle || 0) : 0;
  const brake    = input ? (input.brake    || 0) : 0;

  const a = car.angle;
  const ca = Math.cos(a), sa = Math.sin(a);

  if (!mesh3d._susState) {
    const initY = (mesh3d.wheelGroups?.[0]?.pivot?.position?.y) ?? 0.48;
    mesh3d._susState = {
      wheels: {
        fl: { y: initY }, fr: { y: initY },
        rl: { y: initY }, rr: { y: initY },
      },
      pitch: 0, roll: 0,
    };
  }

  const sus = mesh3d._susState;
  const baseRef = mesh3d.wheelGroups?.[0]?.pivot?.position?.y ?? 0.48;

  const corners = [
    { key: 'fl', lx: 12, lz: 9 },
    { key: 'fr', lx: 12, lz: -9 },
    { key: 'rl', lx: -10, lz: 9 },
    { key: 'rr', lx: -10, lz: -9 },
  ];

  for (const c of corners) {
    const w = sus.wheels[c.key];
    if (!w) continue;
    const wx = car.x + c.lx * ca + c.lz * sa;
    const wy = car.y + c.lx * sa - c.lz * ca;
    const profile = track?.roadProfile;
    const rough = profile?.type === 'rumble' ? 0.20 * (profile.roughness || 1) : 0.04;
    const roadH = Math.sin(wx * 0.003 + wy * 0.005) * rough
                + Math.sin(wx * 0.009 - wy * 0.007) * rough * 0.5;
    const brakeDive = brake * (c.lx > 0 ? -0.42 : 0.16);
    const accelSquat = throttle * (c.lx > 0 ? 0.10 : -0.30);
    const turnSide = Math.sign(car.steerAngle || 0);
    const outsideSide = -turnSide;
    const wheelSide = c.lz > 0 ? 1 : -1;
    const turnLoad = Math.abs(car.steerAngle || 0) * speedN * 0.34;
    const cornerLoad = wheelSide === outsideSide ? -turnLoad : 0;
    const driftPress = car.drifting && wheelSide === outsideSide ? (c.lx < 0 ? -0.34 : -0.18) : 0;
    const targetY = baseRef + roadH + brakeDive + accelSquat + cornerLoad + driftPress;
    w.y += (targetY - w.y) * 0.22;
  }

  const fAvg = (sus.wheels.fl.y + sus.wheels.fr.y) / 2;
  const rAvg = (sus.wheels.rl.y + sus.wheels.rr.y) / 2;
  const lAvg = (sus.wheels.fl.y + sus.wheels.rl.y) / 2;
  const rAvg2 = (sus.wheels.fr.y + sus.wheels.rr.y) / 2;

  if (mesh3d.body) {
    // 차는 항상 평평 + 평면 — 펜스/연석/충돌이 Y/피치/롤에 영향 ❌.
    mesh3d.body.position.y = 0;
    const targetPitch = 0;
    car._kartRoll = 0;
    const targetRoll = 0;
    mesh3d.body.rotation.z += (targetPitch - mesh3d.body.rotation.z) * 0.20;
    mesh3d.body.rotation.x += (targetRoll - mesh3d.body.rotation.x) * 0.20;
  }

  // 휠 위치는 GLB normalize한 자리 그대로. 굴림은 위 spinRate 루프에서 처리.
  // 앞바퀴 yaw 스티어는 GLB의 회전축 다양성 때문에 일단 skip (바디 yaw는 root에서 처리).

  // brake lights
  const braking = input && (input.brake > 0);
  mesh3d.traverse(c => {
    if (c.name === 'brakelight' && c.material) {
      c.material.emissive.setHex(braking ? 0xff2222 : 0x441111);
    }
    if (c.name === 'boostflame') {
      const on = !!car.boosting || !!car.drsActive;
      c.visible = on;
      const power = Math.max(car.boostPower || 0, car.drsPower || 0);
      const boostBoost = car.boosting ? KC.FLAME_BOOST_SCALE : 1.0;
      const base = 1.0 * (car.flameScale || 1) * (0.46 + power * 0.82);
      const flicker = 0.92 + Math.random() * 0.14;
      // boost 中엔 길이(z) 더 길게, 두께도 약간 더
      c.scale.set(base * 0.52 * flicker * (1 + (boostBoost - 1) * 0.5),
                  base * 0.48 * (1 + (boostBoost - 1) * 0.4),
                  base * 0.72 * boostBoost);
      c.children.forEach(part => {
        if (!part.material) return;
        const inner = part.name === 'flameinner';
        const glow = part.name === 'flameglow';
        part.material.opacity = on
          ? (inner ? 0.68 : glow ? 0.13 : 0.36) * (0.55 + power * 0.45)
          : 0;
      });
    }
  });
}

function _trackSurfaceHeight(track, x, y) {
  const profile = track?.roadProfile;
  const cl = track?.centerLine || [];
  if (!profile || cl.length < 2) return 0;
  let best = { d2: Infinity, i: 0 };
  for (let i = 0; i < cl.length; i++) {
    const [x1, y1] = cl[i];
    const [x2, y2] = cl[(i + 1) % cl.length];
    const dx = x2 - x1;
    const dy = y2 - y1;
    const lenSq = dx * dx + dy * dy || 1;
    const t = Math.max(0, Math.min(1, ((x - x1) * dx + (y - y1) * dy) / lenSq));
    const px = x1 + dx * t;
    const py = y1 + dy * t;
    const d2 = (x - px) ** 2 + (y - py) ** 2;
    if (d2 < best.d2) best = { d2, i: i + t };
  }
  const p = best.i / cl.length;
  if (profile.type === 'climb') {
    const climb = Math.sin(p * Math.PI) ** 1.25;
    const loopPulse = Math.sin(p * Math.PI * 4) * 0.12;
    return (profile.height || 28) * Math.max(0, climb + loopPulse);
  }
  if (profile.type === 'rumble') {
    const amp = profile.roughness || 1;
    return Math.sin(x * 0.018 + y * 0.011) * amp
      + Math.sin(x * 0.041 - y * 0.023) * amp * 0.55;
  }
  return 0;
}
