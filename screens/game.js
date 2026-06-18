import * as THREE from 'three';
import { createCar, createCar3D, updateCar3D } from '../js/car.js';
import { updatePhysics, KMH_PER_UNIT, TOP_SPEED_MULT, respawnAtCenter }  from '../js/physics.js';
import { initStartBoostState, tickStartBoost } from '../kart-boost/index.js';
import { KART_CAMERA } from '../kart-boost/config.js';
import { getTrackGroup }  from '../js/track3d.js';
import { drawHUD }        from '../js/hud.js';
import { createTiming, startTiming, updateTiming } from '../js/timing.js';
import { getInput }       from '../utils/input.js';
import { startEngine, stopEngine, updateEngineSound, resumeContext, playLapDing, playWallThud, updateDriftSound, playBoostActivate, playStartBeep } from '../js/audio.js';
import { formatTime } from '../utils/math.js';
import { saveBestLap, addLapHistory, getBestSectors, saveBestSectors, getBestGhost, saveBestGhost } from '../utils/storage.js';
import {
  createSmokePool, spawnSmoke, updateSmoke,
  createSkidBuffer,
  createSparkPool, spawnSparks, updateSparks,
  createDriftSmokePool, updateDriftSmoke,
  makeShake, triggerShake, tickShake,
  makeSpeedLines, drawSpeedLines,
  updateFovPump,
} from '../js/effects.js';
import { scatterProps, updateScenery } from '../js/scenery.js';
import { makeDriftFxState, applyDriftBodyFx, emitDriftSparks, emitDriftSmoke } from '../js/driftFx.js';
import { awardMissions, recordTrackPlay } from '../utils/profile.js';
import { CAR_DATA } from '../data/cars.js';
import { initMiniMap, updateMiniMap, hideMiniMap } from '../js/minimap.js';
import { startRecordLineCapture, captureRecordLineSample, loadBestRecordLine, renderRecordLine } from '../js/ghost.js';
import { updateMissionProgress } from '../js/missions.js';
import { getSharedRenderer } from '../js/renderer.js';

// ── Three.js renderer (persists across retries) ──────────────
let renderer = null;

// ── per-session state ────────────────────────────────────────
let scene     = null;
let camera3d  = null;
let car       = null;
let carMesh   = null;
let ghostMesh = null;
let track     = null;
let carData   = null;
let timing    = null;
let onResults = null;
let onMenu    = null;
let running   = false;
let hudCanvas = null;
let hudCtx    = null;
let cameraMode = 'chase'; // 'chase' | 'hood' | 'high'
const CAMERA_MODES = ['chase', 'hood', 'high'];
let rearViewActive = false; // '/' 누르고 있는 동안 true

// fx
let smokePool = null;
let driftSmokePool = null;
let skidBuf   = null;
let sparkPool = null;
let driftFxState = null;
let shake     = null;
let speedLines = null;
let propsGroup = null;
let lastWallHitId = 0;

// lap-complete banner state
let lapBannerTimer = 0;
let lapBannerText  = '';
let lapBannerSub   = '';
let lapBannerNew   = false;
let pendingResults = null;
let startCountdown = 0;
let startReadyAt = 0;
let raceReleased = false;
let lapPath = [];
let bestGhost = null;
let resultsTimeout = null;
let raceOptions = {};
let lapStats = null;
const START_DELAY_MS = 1000;

// sound state tracking
let _prevLitCount = 0;
let _prevBoosting = false;
let _prevDrsActive = false;

let _boostPadCooldown = 0;

// fixed-step physics
const FIXED_DT  = 1 / 60;
let accumulator = 0;

// camera state (lerped)
const _camPos    = new THREE.Vector3();
const _camLook   = new THREE.Vector3();
let   _camAngle  = 0;     // smoothed heading (rad)

// ── public API ───────────────────────────────────────────────
export function initGame(cd, tr, resultsCb, menuCb, options = {}) {
  carData     = cd;
  track       = tr;
  raceOptions = options || {};
  onResults   = resultsCb;
  onMenu      = menuCb;
  running     = true;
  accumulator = 0;
  cameraMode  = 'chase';
  lastWallHitId = 0;
  _boostPadCooldown = 0;
  startCountdown = 3.2 + START_DELAY_MS / 1000;
  startReadyAt = performance.now() + 3200 + START_DELAY_MS;
  raceReleased = false;
  lapPath = [];
  bestGhost = raceOptions.ghostEnabled ? loadBestRecordLine(tr.id) || getBestGhost(tr.id) : null;
  lapStats = _makeLapStats();
  try {
    recordTrackPlay(tr.id);
  } catch (error) {
    console.warn('Track play progress failed:', error);
  }
  if (resultsTimeout) {
    clearTimeout(resultsTimeout);
    resultsTimeout = null;
  }

  // ── HUD canvas ──
  hudCanvas = document.getElementById('hud-canvas');
  hudCtx    = hudCanvas ? hudCanvas.getContext('2d') : null;
  if (hudCanvas) hudCanvas.style.display = 'block';

  // ── renderer ──
  const threeCanvas = document.getElementById('three-canvas');
  if (threeCanvas) threeCanvas.style.display = 'block';

  renderer = getSharedRenderer(threeCanvas);

  // ── scene ──
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x87ceeb);
  scene.fog        = new THREE.Fog(0x87ceeb, 9000, 22000);

  // ── camera ──
  camera3d = new THREE.PerspectiveCamera(
    72, window.innerWidth / window.innerHeight, 1, 26000
  );
  const startPos = tr.startPos || { x: 0, y: 0, angle: 0 };
  const sa = startPos.angle;
  _camPos.set(
    startPos.x - Math.cos(sa) * 78,
    36,
    -(startPos.y - Math.sin(sa) * 78)
  );
  _camLook.set(
    startPos.x + Math.cos(sa) * 45,
    12,
    -(startPos.y + Math.sin(sa) * 45)
  );
  _camAngle = sa;
  camera3d.position.copy(_camPos);
  camera3d.lookAt(_camLook);

  // ── lights ──
  scene.add(new THREE.AmbientLight(0xffffff, 0.7));
  const sun = new THREE.DirectionalLight(0xfff5dc, 1.1);
  sun.position.set(400, 700, -300);
  sun.castShadow = false;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.camera.near   = 10;
  sun.shadow.camera.far    = 1500;
  sun.shadow.camera.left   = -400;
  sun.shadow.camera.right  =  400;
  sun.shadow.camera.top    =  400;
  sun.shadow.camera.bottom = -400;
  scene.add(sun);
  scene.add(sun.target);
  scene.sunLight = sun;

  const fill = new THREE.DirectionalLight(0xadd8e6, 0.35);
  fill.position.set(-200, 200, 300);
  scene.add(fill);

  // ── track ──
  getTrackGroup(track, scene);
  if ((raceOptions.mode || 'timeTrial') === 'timeTrial' && bestGhost) renderRecordLine(bestGhost, scene);

  // ── scenery (mountains, trees, billboards, pit garages, etc) ──
  propsGroup = scatterProps(scene, track);

  // ── car ──
  car     = createCar(cd, tr.startPos);
  initStartBoostState(car);
  carMesh = createCar3D(cd);
  scene.add(carMesh);
  updateCar3D(carMesh, car, { brake: 0 });
  ghostMesh = null;

  // ── effects ──
  smokePool  = createSmokePool(scene, 32);
  driftSmokePool = createDriftSmokePool(scene, 56);
  skidBuf    = createSkidBuffer(scene, 360);
  sparkPool  = createSparkPool(scene, 64);
  driftFxState = makeDriftFxState();
  shake      = makeShake();
  speedLines = makeSpeedLines(36);

  // ── timing ──
  timing = createTiming(getBestSectors(track.id));

  window.addEventListener('resize', _onResize);

  const hint = document.getElementById('controls-hint');
  if (hint) {
    hint.style.display    = 'flex';
    hint.style.opacity    = '1';
    hint.style.animation  = 'none';
    void hint.offsetHeight;
    hint.style.animation       = 'fadeout 4s forwards';
    hint.style.animationDelay  = '5s';
  }

  startEngine();
}

export function stopGame() {
  running = false;
  hideMiniMap();
  if (resultsTimeout) {
    clearTimeout(resultsTimeout);
    resultsTimeout = null;
  }
  stopEngine();
  window.removeEventListener('resize', _onResize);

  const tc = document.getElementById('three-canvas');
  if (tc) tc.style.display = 'none';
  const hc = document.getElementById('hud-canvas');
  if (hc) { hc.style.display = 'none'; if (hudCtx) hudCtx.clearRect(0, 0, hc.width, hc.height); }
  const hint = document.getElementById('controls-hint');
  if (hint) hint.style.display = 'none';
}

export function updateGame(dt, now) {
  if (!running || !car) return;

  const input = getInput();
  resumeContext();

  if (input.cameraToggle) {
    cameraMode = CAMERA_MODES[(CAMERA_MODES.indexOf(cameraMode) + 1) % CAMERA_MODES.length];
  }
  rearViewActive = !!input.rearView;
  if (input.reset) respawnAtCenter(car, track); // R: 위치 리스폰 (타이머 유지)
  if (input.escape) { stopGame(); if (onMenu) onMenu(); return; }

  startCountdown = Math.max(0, (startReadyAt - now) / 1000);
  const wasReleased = raceReleased;
  raceReleased = startCountdown <= 0;

  // 출발부스터: raw input 사용 (gating 전). GO 전환 시 1회 fire.
  tickStartBoost(car, input, startCountdown, raceReleased);

  // ── start light beeps ──
  if (!raceReleased) {
    const litCount = startCountdown > 2.2 ? 1 : startCountdown > 1.2 ? 2 : startCountdown > 0.25 ? 3 : 4;
    if (litCount !== _prevLitCount) { playStartBeep(litCount); _prevLitCount = litCount; }
  }

  if (!wasReleased && raceReleased && timing && !timing.started) {
    unlockRaceInput();
    startRaceTimer(now);
    lapStats = _makeLapStats();
  }
  initMiniMap(track);
  if ((raceOptions.mode || 'timeTrial') === 'timeTrial') startRecordLineCapture(track.id, carData.id);
  const driveInput = raceReleased ? input : {
    ...input,
    throttle: 0, brake: 0, steer: 0, handbrake: false,
    boost: false, boostJust: false, gearUp: false, gearDown: false,
  };

  // ── fixed-step physics ──
  accumulator += dt;
  let steps = 0;
  while (accumulator >= FIXED_DT && steps < 5) {
    updatePhysics(car, driveInput, FIXED_DT, track);
    _tickBoostPads(FIXED_DT);
    if (raceReleased && car?.drifting) updateMissionProgress('drift_second', FIXED_DT);
    if (raceReleased && driveInput.boostJust) updateMissionProgress('boost_used');
    if (raceReleased && (raceOptions.mode || 'timeTrial') === 'timeTrial') captureRecordLineSample(FIXED_DT, car);
    if (raceReleased && lapStats) {
      if (driveInput.throttle > 0) lapStats.throttleUsed = true;
      lapStats.maxSpeed = Math.max(lapStats.maxSpeed, car.speed * KMH_PER_UNIT);
      lapStats.offTrack = lapStats.offTrack || !!car.offTrack;
    }
    accumulator -= FIXED_DT;
    steps++;
  }
  if (steps >= 5) accumulator = 0;

  // ── audio ──
  updateEngineSound(car.rpm, car.maxRpm);
  updateDriftSound(car.drifting, Math.abs(car.sideSpeed || 0));
  if (car.boosting && !_prevBoosting) playBoostActivate(false);
  if (car.drsActive && !_prevDrsActive) playBoostActivate(true);
  // _prevBoosting / _prevDrsActive 갱신은 프레임 끝(FOV 펀치 계산 뒤)에서 한다 — 같은 프레임 안에서 다른 곳도 edge 감지하려면 살아있어야 함.

  // ── timing ──
  const event = updateTiming(timing, car, track, now);
  if (timing.started && raceReleased) _sampleLapPath(now);
  if (event?.type === 'lapComplete') {
    const isNew = !!event.isNew;
    const completedPath = lapPath.slice(0, 900);
    _saveLapCompletion(event, isNew, completedPath);
    lapPath = [];
    // Show in-game banner first; results screen follows after a beat.
    lapBannerText  = formatTime(event.lapMs);
    lapBannerSub   = isNew ? '🏆 NEW BEST LAP' : 'LAP COMPLETE';
    lapBannerNew   = isNew;
    lapBannerTimer = 2.4;
    pendingResults = { ...event };
    _awardCompletionRewards(event, _completionContext());
    _scheduleResults({ ...event });
    playLapDing(isNew);
  }
  if (lapBannerTimer > 0) {
    lapBannerTimer -= dt;
    if (lapBannerTimer <= 0 && pendingResults) {
      const ev = pendingResults;
      pendingResults = null;
      _showResults(ev);
      return;
    }
  }

  // ── effects: drift smoke + skid marks ──
  _emitDriftFx(dt, driveInput);

  // ── effects: wall hit sparks + screen shake + thud ──
  if (car.lastWallHit && car.lastWallHit.time !== lastWallHitId) {
    lastWallHitId = car.lastWallHit.time;
    const w = car.lastWallHit;
    if (car.speed > 60) {
      spawnSparks(sparkPool, w.x, 5, -w.y, 12);
      playWallThud(Math.min(2, car.speed / 120));
    }
    if (car.speed > 160) {
      triggerShake(shake, Math.min(12, car.speed * 0.04));
    }
  }
  emitDriftSparks(driftFxState, car, sparkPool, dt);
  emitDriftSmoke(driftFxState, car, driftSmokePool, dt,
    (car.maxSpeed || 180) * TOP_SPEED_MULT);
  updateSmoke(smokePool, dt);
  updateDriftSmoke(driftSmokePool, dt);
  updateSparks(sparkPool, dt);

  // ── 3D update ──
  updateCar3D(carMesh, car, driveInput, track, dt);
  applyDriftBodyFx(driftFxState, carMesh, car, dt);
  _updateGhostMesh(now);
  updateScenery(propsGroup, now);
  _updateCamera(dt);

  // ── FOV pump + boost 발동 펀치 ──
  const kmh = car.speed * KMH_PER_UNIT;
  const boostActive = !!car.boosting || !!car.drsActive;

  // boost 발동 전환 감지: 직전 !boosting → 현재 boosting = kick 가산.
  // (체이닝: 첫 발동에만 kick, 지속 中엔 sustain 베이스만 유지)
  const justFiredBoost = !_prevBoosting && car.boosting;
  car._boostFovKick = car._boostFovKick ?? 0;
  if (justFiredBoost) {
    car._boostFovKick = KART_CAMERA.BOOST_FOV_KICK;
    triggerShake(shake, KART_CAMERA.BOOST_SHAKE_AMP);
  }
  // sustain 목표: boost 中엔 베이스 유지, 끝나면 0.
  const sustain = car.boosting ? KART_CAMERA.BOOST_FOV_SUSTAIN : 0;
  car._boostFovKick += (sustain - car._boostFovKick)
    * (1 - Math.exp(-KART_CAMERA.BOOST_FOV_DECAY * dt));

  updateFovPump(camera3d, kmh, car.maxSpeed * TOP_SPEED_MULT, boostActive, dt, car._boostFovKick);

  // edge 감지용 prev 갱신 — kick 트리거 계산 끝난 뒤에.
  _prevBoosting = !!car.boosting;
  _prevDrsActive = !!car.drsActive;

  // ── render ──
  renderer.render(scene, camera3d);
  updateMiniMap({ x: car.x, y: car.y });
  _renderHUD(dt, kmh);
}

function _saveLapCompletion(event, isNew, completedPath) {
  try {
    saveBestLap(carData.id, track.id, event.lapMs);
    addLapHistory(carData.id, track.id, {
      lapMs: event.lapMs, sectors: event.sectors, date: Date.now(), path: completedPath
    });
    saveBestSectors(track.id, event.sectors, { carName: carData.name });
    if (isNew) {
      saveBestGhost(track.id, {
        lapMs: event.lapMs,
        carId: carData.id,
        carName: carData.name,
        skin: carData.skin || null,
        path: completedPath,
      });
      bestGhost = getBestGhost(track.id);
    }
  } catch (error) {
    console.warn('Lap persistence failed, continuing to results:', error);
  }
}

async function _awardCompletionRewards(event, context) {
  try {
    const rewards = await awardMissions(track.id, event.lapMs, context);
    if (pendingResults?.lapMs === event.lapMs) pendingResults.rewards = rewards;
  } catch (error) {
    console.warn('Reward persistence failed:', error);
  }
}

function _makeLapStats() {
  return {
    throttleUsed: false,
    offTrack: false,
    maxSpeed: 0,
  };
}

function _completionContext() {
  return {
    mode: raceOptions.mode || 'online',
    noThrottle: !lapStats?.throttleUsed,
    offTrack: !!lapStats?.offTrack,
    maxSpeed: lapStats?.maxSpeed || 0,
  };
}

function _createGhostMesh(ghost) {
  if (!ghost?.path?.length || !scene) return null;
  const ghostCar = CAR_DATA.find(item => item.id === ghost.carId) || carData;
  const mesh = createCar3D({ ...ghostCar, skin: ghost.skin });
  mesh.name = 'best-lap-ghost';
  mesh.traverse(child => {
    if (!child.isMesh || !child.material) return;
    const mat = child.material.clone();
    mat.transparent = true;
    mat.opacity = child.name.toLowerCase().includes('tire') ? 0.22 : 0.36;
    mat.depthWrite = false;
    if (mat.emissive) mat.emissiveIntensity = Math.max(mat.emissiveIntensity || 0, 0.22);
    child.material = mat;
  });
  scene.add(mesh);
  return mesh;
}

function _updateGhostMesh(now) {
  if (!ghostMesh || !bestGhost?.path?.length || !timing?.started || timing.lapStart === null) return;
  const elapsed = now - timing.lapStart;
  const path = bestGhost.path;
  let index = path.findIndex(point => point.t >= elapsed);
  if (index <= 0) index = Math.min(1, path.length - 1);
  const prev = path[index - 1] || path[0];
  const next = path[index] || path[path.length - 1];
  const span = Math.max(1, (next.t || 0) - (prev.t || 0));
  const k = Math.max(0, Math.min(1, (elapsed - (prev.t || 0)) / span));
  const x = prev.x + (next.x - prev.x) * k;
  const y = prev.y + (next.y - prev.y) * k;
  const angle = Math.atan2(next.y - prev.y, next.x - prev.x);
  ghostMesh.position.set(x, 1.4, -y);
  ghostMesh.rotation.y = Number.isFinite(angle) ? angle : ghostMesh.rotation.y;
  ghostMesh.visible = elapsed <= (path[path.length - 1]?.t || 0) + 800;
}

// ── drift smoke + skid mark emission ─────────────────────────
function _emitDriftFx(dt, driveInput) {
  const visualDrift = car.drifting || (
    driveInput?.handbrake
    && car.speed > 18
    && (Math.abs(car.steerAngle || 0) > 0.025 || Math.abs(car.sideSpeed || 0) > 2.5)
  );
  if (!visualDrift || car.suppressSkid) {
    delete car._lastSkidL;
    delete car._lastSkidR;
    return;
  }
  // World positions of rear wheels (from car frame, mesh local coords).
  const a = car.angle;
  const cs = Math.cos(a), sn = Math.sin(a);
  // rear wheels: x=-10 (back), z=±9 (sides) in mesh-local; in physics 2D the
  // sides correspond to perpendicular ±9 from car heading.
  const rearOffset = -7.6;
  const sideOffset = 7.2;
  for (const sideSign of [-1, 1]) {
    // mesh-local (-10, 0, sideSign*9). Convert to world-physics 2D:
    //   world x = car.x + rearOffset*cos(a) - sideSign*sideOffset*sin(a)
    //   world y = car.y + rearOffset*sin(a) + sideSign*sideOffset*cos(a)
    const wx = car.x + rearOffset * cs - sideSign * sideOffset * sn;
    const wy = car.y + rearOffset * sn + sideSign * sideOffset * cs;
    const w3z = -wy;
    const key = sideSign < 0 ? '_lastSkidL' : '_lastSkidR';
    const prev = car[key];
    if (prev) {
      const dx = wx - prev.x, dz = w3z - prev.z;
      if (dx*dx + dz*dz > 4.0) {
        skidBuf.appendTrail(prev.x, prev.z, wx, w3z, 1.15, _driftTrailColor());
        car[key] = { x: wx, z: w3z };
      }
    } else {
      car[key] = { x: wx, z: w3z };
    }
  }
}

function _driftTrailColor() {
  // KartRider식: 연회색 단일 스키드 (저투명은 appendTrail 두께/alpha 조절 영역).
  return 0x9aa0a6;
}

function _scheduleResults(ev) {
  if (resultsTimeout) clearTimeout(resultsTimeout);
  resultsTimeout = setTimeout(() => {
    if (!pendingResults) return;
    const next = pendingResults;
    pendingResults = null;
    _showResults(next || ev);
  }, 2200);
}

function _showResults(ev) {
  if (resultsTimeout) {
    clearTimeout(resultsTimeout);
    resultsTimeout = null;
  }
  running = false;
  if (onResults) onResults(ev);
}

export function restartRaceWithCountdown() {
  if (!car || !track) return;
  if (!raceReleased && startCountdown > 0) return;
  resetRaceState();
  lockRaceInput();
  showStartLights();
}

export function showStartLights() {
  startReadyAt = performance.now() + 3200 + START_DELAY_MS;
  startCountdown = 3.2 + START_DELAY_MS / 1000;
  _prevLitCount = 0;
  _prevBoosting = false;
  _prevDrsActive = false;
}

export function lockRaceInput() {
  raceReleased = false;
}

export function unlockRaceInput() {
  raceReleased = true;
}

export function resetRaceState() {
  _resetCar();
}

export function startRaceTimer(now = performance.now()) {
  if (!timing) timing = createTiming(getBestSectors(track.id));
  if (!timing.started) startTiming(timing, now);
}

export function startRaceTimerAfterDelay(delayMs = START_DELAY_MS) {
  startReadyAt = performance.now() + Number(delayMs || 0);
  startCountdown = Math.max(0, Number(delayMs || 0) / 1000);
  lockRaceInput();
}

// ── boost pad collision ──────────────────────────────────────
function _tickBoostPads(dt) {
  _boostPadCooldown = Math.max(0, _boostPadCooldown - dt);
  if (!track?.boostPads?.length || !car || _boostPadCooldown > 0) return;
  for (const pad of track.boostPads) {
    const dx = car.x - pad.x, dy = car.y - pad.y;
    if (dx * dx + dy * dy < pad.radius * pad.radius) {
      const push = 50;
      car.vx += Math.cos(pad.angle) * push;
      car.vy += Math.sin(pad.angle) * push;
      car.boostMeter = Math.min(100, (car.boostMeter || 0) + 30);
      _boostPadCooldown = 0.45;
      playBoostActivate(false);
      break;
    }
  }
}

// ── chase camera (framerate-independent smoothing) ──────────
function _updateCamera(dt) {
  const isHigh = cameraMode === 'high';
  const isHood = cameraMode === 'hood';

  // KartRider 연출: boost 中 카메라 거리/높이 당김 + 속도 비례 거리 추가
  const boostPow = Math.min(1, car.boostPower || 0);
  const distMul = (isHigh || isHood) ? 1 : (1 - KART_CAMERA.CAM_DIST_PULL * boostPow);
  const heightDrop = (isHigh || isHood) ? 0 : KART_CAMERA.CAM_HEIGHT_DROP * boostPow;

  // chase: 낮고 가깝게, 고속에선 살짝 뒤로.
  const topSpeed = Math.max(80, (car.maxSpeed || 180) * TOP_SPEED_MULT);
  const kmh = (car.speed || 0) * KMH_PER_UNIT;
  const speedT = Math.max(0, Math.min(1, kmh / topSpeed));
  const chaseDist = KART_CAMERA.CAM_DIST + KART_CAMERA.CAM_DIST_SPEED_ADD * speedT;

  const DIST       = (isHigh ? 0 : isHood ? -8 : chaseDist) * distMul;
  const HEIGHT     = (isHigh ? 380 : isHood ? 13.5 : KART_CAMERA.CAM_HEIGHT) - heightDrop;
  const LOOK_AHEAD = isHigh ? 20 : isHood ? 155 : KART_CAMERA.CAM_LOOK_AHEAD;
  const LOOK_Y_BASE = isHigh ? 0 : isHood ? 10.5 : KART_CAMERA.CAM_LOOK_Y;

  // PC: 카메라 = velocity 추적. 단, 후진(forwardSpeed<0)은 시점 안 바꾸게 → car.angle 유지.
  const movingFwd = (car.forwardSpeed || 0) > 5;
  const targetCam = movingFwd ? Math.atan2(car.vy, car.vx) : car.angle;
  let dA = targetCam - _camAngle;
  while (dA >  Math.PI) dA -= Math.PI * 2;
  while (dA < -Math.PI) dA += Math.PI * 2;
  // PC: 카메라 yaw 추적 더 느슨하게 (9→5) — 급격한 방향변화에 휙 안 돌아감.
  const angK = 1 - Math.exp(-5.0 * dt);
  _camAngle += dA * angK;

  // 드리프트 yaw 오프셋 제거(스윙 방지) — 카메라는 velocity만 본다.
  car._camDriftYaw = 0;
  const rearFlip = rearViewActive ? Math.PI : 0;
  const aimAngle = _camAngle + rearFlip;
  const cs = Math.cos(aimAngle), sn = Math.sin(aimAngle);
  const roadY = car.roadHeight || 0;

  const tx = car.x - cs * DIST;
  const ty = HEIGHT + roadY;
  const tz = -(car.y - sn * DIST);

  const lx = car.x + cs * LOOK_AHEAD;
  const ly = LOOK_Y_BASE + roadY;
  const lz = -(car.y + sn * LOOK_AHEAD);

  const posK  = 1 - Math.exp(-12.0 * dt);
  const lookK = 1 - Math.exp(-15.0 * dt);

  _camPos.x += (tx - _camPos.x) * posK;
  _camPos.y += (ty - _camPos.y) * posK;
  _camPos.z += (tz - _camPos.z) * posK;

  _camLook.x += (lx - _camLook.x) * lookK;
  _camLook.y += (ly - _camLook.y) * lookK;
  _camLook.z += (lz - _camLook.z) * lookK;

  // ── 카메라 뱅크 계산 (lookAt 후 rotateZ — view axis 기준 roll) ──
  // up 벡터 방식은 view dir이 월드 X축에 가까우면 cross 결과가 t와 무관해져 무효.
  // 정공법: lookAt으로 자세 잡고 → camera.rotateZ(t)로 local Z(view축) 기준 roll.
  const refSlip = KART_CAMERA.REF_SLIP || (25 * Math.PI / 180);
  const intensity = car.drifting
    ? Math.min(1, Math.abs(car.slipBeta || car.driftAngle || 0) / Math.max(1e-3, refSlip))
    : 0;
  const dir = car._driftDir || Math.sign(car.sideSpeed || car.steerAngle || 1);
  const tiltTarget = car.drifting ? (-dir * KART_CAMERA.CAM_TILT_MAX * intensity) : 0;
  const snapEnd = !car.drifting
    && (car._lastDriftEndReason === 'align'
     || car._lastDriftEndReason === 'spin'
     || car._lastDriftEndReason === 'cut')
    && (car.driftStateTime || 0) < 0.25;
  const tiltRate = snapEnd ? KART_CAMERA.ROLL_SNAP : KART_CAMERA.CAM_TILT_LERP;
  car._camTilt = car._camTilt ?? 0;
  car._camTilt += (tiltTarget - car._camTilt) * (1 - Math.exp(-tiltRate * Math.max(0, dt)));

  // Apply screen-shake offset on top of the smoothed position.
  const shk = tickShake(shake, dt);
  camera3d.position.set(_camPos.x + shk.x, _camPos.y + shk.y, _camPos.z);
  // PC: 카메라 뱅크 ❌ — up 고정, lookAt만. rotateZ 안 함 (수평선 항상 수평).
  camera3d.up.set(0, 1, 0);
  camera3d.lookAt(_camLook);

  if (scene && scene.sunLight) {
    const carZ = -car.y;
    scene.sunLight.position.set(car.x + 400, 700, carZ - 300);
    scene.sunLight.target.position.set(car.x, 0, carZ);
    scene.sunLight.target.updateMatrixWorld();
  }
}

// ── HUD overlay ──────────────────────────────────────────────
function _renderHUD(dt, kmh) {
  if (!hudCtx || !hudCanvas) return;
  if (hudCanvas.width !== window.innerWidth) hudCanvas.width = window.innerWidth;
  if (hudCanvas.height !== window.innerHeight) hudCanvas.height = window.innerHeight;
  hudCtx.clearRect(0, 0, hudCanvas.width, hudCanvas.height);
  // speed-line streaks below normal HUD
  const boostT = Math.min(1, (car?.boostPower || 0));
  drawSpeedLines(hudCtx, speedLines, kmh, hudCanvas.width, hudCanvas.height, dt, cameraMode, boostT);
  drawHUD(hudCtx, car, timing, hudCanvas.width, hudCanvas.height, track, bestGhost);
  if (lapBannerTimer > 0) _drawLapBanner(hudCtx, hudCanvas.width, hudCanvas.height);
  if (!raceReleased) _drawStartSignal(hudCtx, hudCanvas.width, hudCanvas.height);
}

function _sampleLapPath(now) {
  const last = lapPath[lapPath.length - 1];
  if (last) {
    const dx = car.x - last.x;
    const dy = car.y - last.y;
    if (dx * dx + dy * dy < 2600 && now - last.t < 220) return;
  }
  lapPath.push({ x: car.x, y: car.y, t: now - timing.lapStart });
  if (lapPath.length > 900) lapPath.shift();
}

function _drawStartSignal(ctx, w, h) {
  const left = startCountdown;
  const lit = left > 2.2 ? 1 : left > 1.2 ? 2 : left > 0.25 ? 3 : 4;
  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,0.38)';
  ctx.fillRect(0, 0, w, h);
  const cx = w / 2;
  const y = h * 0.23;
  ctx.fillStyle = 'rgba(8,12,18,0.92)';
  ctx.strokeStyle = 'rgba(255,255,255,0.22)';
  ctx.lineWidth = 3;
  _roundRect(ctx, cx - 170, y - 42, 340, 84, 18);
  ctx.fill();
  ctx.stroke();
  for (let i = 0; i < 4; i++) {
    const x = cx - 112 + i * 74;
    const go = lit >= 4;
    const active = go ? i === 3 : i < lit;
    const color = go ? '#2ec4b6' : '#e63946';
    ctx.beginPath();
    ctx.arc(x, y, 24, 0, Math.PI * 2);
    ctx.fillStyle = active ? color : '#272d36';
    ctx.shadowColor = active ? color : 'transparent';
    ctx.shadowBlur = active ? 18 : 0;
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = 'rgba(255,255,255,0.18)';
    ctx.stroke();
  }
  ctx.textAlign = 'center';
  ctx.font = '800 20px system-ui';
  ctx.fillStyle = 'rgba(255,255,255,0.82)';
  ctx.fillText(lit >= 4 ? 'GO!' : '출발 신호 대기', cx, y + 62);
  _drawFlagMarshal(ctx, 90, h * 0.38, performance.now());
  _drawFlagMarshal(ctx, w - 90, h * 0.38, performance.now() + 800, true);
  ctx.restore();
}

function _drawFlagMarshal(ctx, x, y, t, flip = false) {
  ctx.save();
  ctx.translate(x, y);
  if (flip) ctx.scale(-1, 1);
  const wave = Math.sin(t * 0.012) * 0.45;
  ctx.strokeStyle = '#f5f5f5';
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(0, 12);
  ctx.lineTo(24, -24);
  ctx.stroke();
  ctx.save();
  ctx.translate(24, -24);
  ctx.rotate(wave);
  for (let i = 0; i < 4; i++) {
    for (let j = 0; j < 3; j++) {
      ctx.fillStyle = (i + j) % 2 ? '#111' : '#fff';
      ctx.fillRect(i * 10, j * 8, 10, 8);
    }
  }
  ctx.restore();
  ctx.fillStyle = '#101820';
  ctx.beginPath();
  ctx.arc(0, -8, 10, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillRect(-9, 2, 18, 36);
  ctx.restore();
}

function _roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
}

function _drawLapBanner(ctx, w, h) {
  const cx = w / 2;
  const cy = h * 0.35;
  ctx.save();
  // backdrop
  ctx.fillStyle = lapBannerNew ? 'rgba(80, 40, 100, 0.78)' : 'rgba(0, 0, 0, 0.78)';
  ctx.fillRect(0, cy - 70, w, 150);
  ctx.strokeStyle = lapBannerNew ? '#ff66ff' : '#ffd23c';
  ctx.lineWidth = 4;
  ctx.strokeRect(0, cy - 70, w, 150);
  // sub label
  ctx.font = 'bold 20px monospace';
  ctx.fillStyle = lapBannerNew ? '#ff66ff' : '#ffd23c';
  ctx.textAlign = 'center';
  ctx.fillText(lapBannerSub, cx, cy - 30);
  // big time
  ctx.font = 'bold 84px monospace';
  ctx.fillStyle = '#fff';
  ctx.fillText(lapBannerText, cx, cy + 40);
  ctx.restore();
}

// ── reset ────────────────────────────────────────────────────
function _resetCar() {
  car.x  = track.startPos.x;
  car.y  = track.startPos.y;
  car.angle = track.startPos.angle;
  car.vx = car.vy = car.speed = 0;
  car.gear = 1;
  car.rpm  = 1000;
  car.steerAngle = 0;
  car.offTrack = false;
  car.boostMeter = 0;
  car.boostStock = 0;
  car.boostTimer = 0;
  car.boostPower = 0;
  car.boosting = false;
  car.superBoostMeter = 100;
  car.drsAvailable = false;
  car.drsActive = false;
  car.drsTimer = 0;
  car.drsTapTimer = 0;
  car.drsPower = 0;
  car.wallRiding = false;
  car.wallRideSide = 0;
  car.lastWallHit = null;
  initStartBoostState(car);
  if (skidBuf) skidBuf.reset();
  // Re-create timing so the countdown releases into a clean lap.
  timing = createTiming(getBestSectors(track.id));
  lapPath = [];
  startCountdown = 3.2 + START_DELAY_MS / 1000;
  startReadyAt = performance.now() + 3200 + START_DELAY_MS;
  raceReleased = false;
  lapStats = _makeLapStats();
  lapBannerTimer = 0;
  pendingResults = null;
  if (resultsTimeout) {
    clearTimeout(resultsTimeout);
    resultsTimeout = null;
  }
}

function _onResize() {
  if (!renderer || !camera3d) return;
  renderer.setSize(window.innerWidth, window.innerHeight);
  camera3d.aspect = window.innerWidth / window.innerHeight;
  camera3d.updateProjectionMatrix();
}
