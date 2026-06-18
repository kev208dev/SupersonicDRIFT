// Multiplayer game screen.
// Identical driving feel to solo: same fixed-step physics, same car mesh, same FX,
// same HUD. Differences are only at the boundaries — countdown comes from the
// server, lap completion is sent over the wire (no leaderboard write), remote
// ghosts are rendered interpolated from server snapshots.

import * as THREE from 'three';
import { createCar, createCar3D, updateCar3D } from '../js/car.js';
import { initStartBoostState, tickStartBoost } from '../kart-boost/index.js';
import { KART_CAMERA } from '../kart-boost/config.js';
import { updatePhysics, KMH_PER_UNIT, TOP_SPEED_MULT } from '../js/physics.js';
import { getTrackGroup } from '../js/track3d.js';
import { drawHUD } from '../js/hud.js';
import { createTiming, startTiming, updateTiming } from '../js/timing.js';
import { getInput } from '../utils/input.js';
import { startEngine, stopEngine, updateEngineSound, resumeContext, playLapDing, playWallThud } from '../js/audio.js';
import { formatTime } from '../utils/math.js';
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
import { RemoteCarInterp } from '../js/net/interp.js';
import { getSharedRenderer } from '../js/renderer.js';
import { checkVehicleCollisions } from '../js/competitionCollision.js';

const FIXED_DT = 1 / 60;
const STATE_SEND_HZ = 30;
const STATE_SEND_INTERVAL_MS = 1000 / STATE_SEND_HZ;
const CAMERA_MODES = ['chase', 'hood', 'high'];

let renderer = null;
let scene = null;
let camera3d = null;
let car = null;
let carMesh = null;
let track = null;
let carData = null;
let timing = null;
let net = null;
let onFinishCb = null;
let onLeaveCb = null;
let running = false;
let hudCanvas = null;
let hudCtx = null;
let cameraMode = 'chase';
let rearViewActive = false;

let driftFxState = null;
let smokePool = null;
let driftSmokePool = null;
let skidBuf = null;
let sparkPool = null;
let shake = null;
let speedLines = null;
let propsGroup = null;
let lastWallHitId = 0;

let accumulator = 0;
const _camPos = new THREE.Vector3();
const _camLook = new THREE.Vector3();
let _camAngle = 0;

let mpStartAt = 0;       // Date.now() of green light
let raceReleased = false;
let lapTarget = 3;
let myLapCount = 0;
let myBestLap = null;
let myTotalElapsed = null;
let lastStateSentAt = 0;
let banner = null;       // { text, sub, isNew, timer }
let myFinished = false;

let myClientId = null;
let remotePlayers = new Map(); // id -> { mesh, interp, info, lap, finished, syntheticCar }
let standingsState = []; // array sorted by progress

let mpUnsubs = [];

export function initMpGame({
  car: carDataIn,
  track: trackIn,
  net: netIn,
  startAt,
  lapTarget: lapTargetIn,
  myClientId: myIdIn,
  roomPlayers,
  onFinish,
  onLeave,
}) {
  carData = carDataIn;
  track = trackIn;
  net = netIn;
  mpStartAt = startAt || (Date.now() + 3500);
  lapTarget = Math.max(1, Math.min(5, lapTargetIn || 3));
  myClientId = myIdIn;
  onFinishCb = onFinish;
  onLeaveCb = onLeave;
  running = true;
  accumulator = 0;
  cameraMode = 'chase';
  lastWallHitId = 0;
  raceReleased = false;
  myLapCount = 0;
  myBestLap = null;
  myTotalElapsed = null;
  lastStateSentAt = 0;
  banner = null;
  myFinished = false;
  remotePlayers.clear();
  standingsState = [];

  // HUD canvas
  hudCanvas = document.getElementById('hud-canvas');
  hudCtx = hudCanvas ? hudCanvas.getContext('2d') : null;
  if (hudCanvas) hudCanvas.style.display = 'block';

  const threeCanvas = document.getElementById('three-canvas');
  if (threeCanvas) threeCanvas.style.display = 'block';

  renderer = getSharedRenderer(threeCanvas);

  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x87ceeb);
  scene.fog = new THREE.Fog(0x87ceeb, 9000, 22000);

  camera3d = new THREE.PerspectiveCamera(
    72, window.innerWidth / window.innerHeight, 1, 26000
  );
  const startPos = track.startPos || { x: 0, y: 0, angle: 0 };
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

  scene.add(new THREE.AmbientLight(0xffffff, 0.7));
  const sun = new THREE.DirectionalLight(0xfff5dc, 1.1);
  sun.position.set(400, 700, -300);
  scene.add(sun);
  scene.add(sun.target);
  scene.sunLight = sun;
  const fill = new THREE.DirectionalLight(0xadd8e6, 0.35);
  fill.position.set(-200, 200, 300);
  scene.add(fill);

  getTrackGroup(track, scene);
  propsGroup = scatterProps(scene, track);

  // Spawn local car (own physics)
  car = createCar(carData, track.startPos);
  initStartBoostState(car);
  carMesh = createCar3D(carData);
  scene.add(carMesh);
  updateCar3D(carMesh, car, { brake: 0 });

  smokePool = createSmokePool(scene, 32);
  driftSmokePool = createDriftSmokePool(scene, 56);
  skidBuf = createSkidBuffer(scene, 360);
  sparkPool = createSparkPool(scene, 64);
  driftFxState = makeDriftFxState();
  shake = makeShake();
  speedLines = makeSpeedLines(36);

  timing = createTiming([null, null, null]);

  // Place remote players (start grid: stagger behind start line)
  if (Array.isArray(roomPlayers)) {
    let staggerIndex = 0;
    for (const p of roomPlayers) {
      if (p.id === myClientId) continue;
      _spawnRemote(p, staggerIndex);
      staggerIndex++;
    }
  }

  _wireNet();
  _showStandings(true);

  window.addEventListener('resize', _onResize);
  document.addEventListener('keydown', _onKeyDown, true);

  const hint = document.getElementById('controls-hint');
  if (hint) {
    hint.style.display = 'flex';
    hint.style.opacity = '1';
    hint.style.animation = 'none';
    void hint.offsetHeight;
    hint.style.animation = 'fadeout 4s forwards';
    hint.style.animationDelay = '4s';
  }

  startEngine();
}

export function stopMpGame(options = {}) {
  running = false;
  for (const fn of mpUnsubs) { try { fn(); } catch {} }
  mpUnsubs = [];
  stopEngine();
  window.removeEventListener('resize', _onResize);
  document.removeEventListener('keydown', _onKeyDown, true);
  _showStandings(false);

  if (!options.preserveRoom && net && net.connected) {
    try { net.send({ t: 'leaveRoom' }); } catch {}
  }

  const tc = document.getElementById('three-canvas');
  if (tc) tc.style.display = 'none';
  const hc = document.getElementById('hud-canvas');
  if (hc) { hc.style.display = 'none'; if (hudCtx) hudCtx.clearRect(0, 0, hc.width, hc.height); }
  const hint = document.getElementById('controls-hint');
  if (hint) hint.style.display = 'none';

  // Detach ghost meshes
  for (const ghost of remotePlayers.values()) {
    if (ghost.mesh && ghost.mesh.parent) ghost.mesh.parent.remove(ghost.mesh);
    if (ghost.nameSprite && ghost.nameSprite.parent) ghost.nameSprite.parent.remove(ghost.nameSprite);
  }
  remotePlayers.clear();
}

export function updateMpGame(dt, now) {
  if (!running || !car) return;

  const input = getInput();
  resumeContext();

  if (input.cameraToggle) {
    cameraMode = CAMERA_MODES[(CAMERA_MODES.indexOf(cameraMode) + 1) % CAMERA_MODES.length];
  }
  rearViewActive = !!input.rearView;
  if (input.escape) {
    stopMpGame();
    if (onLeaveCb) onLeaveCb();
    return;
  }
  // No `R` reset in MP — would teleport us. R is ignored.

  // Countdown gating uses server's startAt (Date.now-based).
  const wallNow = Date.now();
  const msUntilStart = mpStartAt - wallNow;
  const wasReleased = raceReleased;
  raceReleased = msUntilStart <= 0;
  if (!wasReleased && raceReleased && timing && !timing.started) {
    startTiming(timing, now);
  }

  // 출발부스터: raw input, countdown in seconds.
  tickStartBoost(car, input, Math.max(0, msUntilStart / 1000), raceReleased);

  const driveInput = raceReleased ? input : {
    ...input,
    throttle: 0, brake: 0, steer: 0, handbrake: false,
    boost: false, boostJust: false, gearUp: false, gearDown: false,
  };

  // Identical fixed-step physics loop to solo.
  accumulator += dt;
  let steps = 0;
  while (accumulator >= FIXED_DT && steps < 5) {
    updatePhysics(car, driveInput, FIXED_DT, track);
    accumulator -= FIXED_DT;
    steps++;
  }
  if (steps >= 5) accumulator = 0;

  updateEngineSound(car.rpm, car.maxRpm);

  // Timing
  if (raceReleased && !myFinished) {
    const event = updateTiming(timing, car, track, now);
    if (event?.type === 'lapComplete') {
      _onLocalLapComplete(event);
    }
  }

  if (banner) {
    banner.timer -= dt;
    if (banner.timer <= 0) banner = null;
  }

  _emitDriftFx(dt, driveInput);

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

  // Local mesh
  updateCar3D(carMesh, car, driveInput, track, dt);
  applyDriftBodyFx(driftFxState, carMesh, car, dt);
  updateScenery(propsGroup, now);

  // Remote ghosts
  _updateRemoteCars(now);
  _checkMultiplayerVehicleCollisions();

  // Camera follows local car
  _updateCamera(dt);

  const kmh = car.speed * KMH_PER_UNIT;
  const boostActive = !!car.boosting || !!car.drsActive;
  const justFiredBoost = !car._prevBoosting && car.boosting;
  car._prevBoosting = car.boosting;
  car._boostFovKick = car._boostFovKick ?? 0;
  if (justFiredBoost) {
    car._boostFovKick = KART_CAMERA.BOOST_FOV_KICK;
    triggerShake(shake, KART_CAMERA.BOOST_SHAKE_AMP);
  }
  const sustain = car.boosting ? KART_CAMERA.BOOST_FOV_SUSTAIN : 0;
  car._boostFovKick += (sustain - car._boostFovKick)
    * (1 - Math.exp(-KART_CAMERA.BOOST_FOV_DECAY * dt));
  updateFovPump(camera3d, kmh, car.maxSpeed * TOP_SPEED_MULT, boostActive, dt, car._boostFovKick);

  renderer.render(scene, camera3d);
  _renderHUD(dt, kmh, msUntilStart);

  // Send my state to server at fixed cadence
  if (raceReleased && net?.connected) {
    const millis = performance.now();
    if (millis - lastStateSentAt >= STATE_SEND_INTERVAL_MS) {
      lastStateSentAt = millis;
      net.send({
        t: 'state',
        x: car.x, y: car.y, a: car.angle,
        vx: car.vx, vy: car.vy, g: car.gear,
        drift: !!car.drifting,
        boost: !!car.boosting,
        drs: !!car.drsActive,
        lap: myLapCount,
        lm: timing.started && timing.lapStart != null ? Math.floor(performance.now() - timing.lapStart) : 0,
      });
    }
  }

  _updateStandings();
  updateMinimap();
}

// ── helpers ─────────────────────────────────────────────────────

function _onLocalLapComplete(event) {
  myLapCount += 1;
  if (myBestLap == null || event.lapMs < myBestLap) myBestLap = event.lapMs;
  banner = {
    text: formatTime(event.lapMs),
    sub: myLapCount >= lapTarget
      ? `LAP ${myLapCount}/${lapTarget} · FINISH`
      : `LAP ${myLapCount}/${lapTarget}`,
    isNew: !!event.isNew,
    timer: 2.4,
  };
  playLapDing(event.isNew);

  if (net?.connected) {
    net.send({ t: 'lap', lapMs: Math.round(event.lapMs), lapNum: myLapCount, sectors: event.sectors });
  }

  if (myLapCount >= lapTarget) {
    myFinished = true;
    myTotalElapsed = (timing.lapTimes || []).reduce((s, n) => s + n, 0);
    if (net?.connected) {
      net.send({ t: 'finish', totalMs: myTotalElapsed, bestLapMs: myBestLap, lapCount: myLapCount });
    }
  }
}

function _spawnRemote(playerInfo, staggerIndex) {
  // Build a "synthetic" car data object — pick safe defaults if we don't know
  // the remote car's full stats.
  const designCarData = { id: playerInfo.carId, name: playerInfo.carName, flameScale: 1 };
  const mesh = createCar3D(designCarData);
  scene.add(mesh);

  // Place at the start line, slightly staggered behind so they don't clip the host.
  const back = 18 + staggerIndex * 22;
  const lateral = (staggerIndex % 2 === 0 ? 1 : -1) * 9;
  const sa = track.startPos.angle;
  const sx = track.startPos.x - Math.cos(sa) * back + Math.cos(sa + Math.PI / 2) * lateral;
  const sy = track.startPos.y - Math.sin(sa) * back + Math.sin(sa + Math.PI / 2) * lateral;
  const syntheticCar = _makeSyntheticCar(sx, sy, sa);
  updateCar3D(mesh, syntheticCar, { throttle: 0, brake: 0 }, track);

  const nameSprite = _makeNameSprite(playerInfo.playerName, playerInfo.themeColor || '#2ec4b6');
  mesh.add(nameSprite);
  nameSprite.position.set(0, 22, 0);

  const ghost = {
    id: playerInfo.id,
    mesh,
    nameSprite,
    interp: new RemoteCarInterp(),
    info: playerInfo,
    syntheticCar,
    lap: 0,
    finished: false,
    bestLapMs: null,
    lastLapMs: null,
    lastUpdateTime: performance.now(),
    visible: true,
    ping: 0,
  };
  remotePlayers.set(playerInfo.id, ghost);
}

function _makeSyntheticCar(x, y, angle) {
  return {
    id: 'remote', name: 'Remote',
    x, y, angle,
    vx: 0, vy: 0, speed: 0,
    sideSpeed: 0,
    rpm: 1000, maxRpm: 8000, gear: 1,
    steerAngle: 0,
    drifting: false,
    boostMeter: 0,
    boostPower: 0,
    boosting: false,
    drsPower: 0,
    drsActive: false,
    drsAvailable: false,
    flameScale: 1,
    wallRiding: false,
    wallRideSide: 0,
    offTrack: false,
    transmission: 'auto',
    lastWallHit: null,
    roadHeight: 0,
    _prevX: x, _prevY: y, _prevTime: performance.now(),
  };
}

function _updateRemoteCars(now) {
  for (const ghost of remotePlayers.values()) {
    const sample = ghost.interp.sample(performance.now());
    const age = performance.now() - (ghost.lastUpdateTime || 0);
    ghost.visible = age < 5000;
    if (ghost.mesh) ghost.mesh.visible = ghost.visible;
    if (ghost.mesh) ghost.mesh.traverse(child => {
      if (child.material && 'opacity' in child.material) {
        child.material.transparent = age > 1000 || child.material.transparent;
        child.material.opacity = age > 1000 ? 0.42 : 1;
      }
    });
    if (!sample || !ghost.visible) continue;
    const synth = ghost.syntheticCar;
    // Smooth remote visuals so 20Hz network snapshots do not pop or twitch.
    const blend = 0.55;
    const snapDist2 = (sample.x - synth.x) ** 2 + (sample.y - synth.y) ** 2;
    if (snapDist2 > 2500) {
      synth.x = sample.x;
      synth.y = sample.y;
      synth.angle = sample.a;
    } else {
      synth.x += (sample.x - synth.x) * blend;
      synth.y += (sample.y - synth.y) * blend;
      let da = sample.a - synth.angle;
      while (da > Math.PI) da -= Math.PI * 2;
      while (da < -Math.PI) da += Math.PI * 2;
      synth.angle += da * 0.58;
    }
    synth.vx += (sample.vx - synth.vx) * 0.48;
    synth.vy += (sample.vy - synth.vy) * 0.48;
    synth.gear = sample.g;
    synth.drifting = sample.drift;
    synth.boosting = sample.boost;
    synth.drsActive = sample.drs;
    synth.boostPower = sample.boost ? 1 : Math.max(0, synth.boostPower - 0.1);
    synth.drsPower = sample.drs ? 1 : Math.max(0, synth.drsPower - 0.1);

    const dx = synth.x - synth._prevX;
    const dy = synth.y - synth._prevY;
    const dt = Math.max(0.001, (performance.now() - synth._prevTime) / 1000);
    const planar = Math.hypot(dx, dy) / dt;
    synth.speed = planar;
    // Rough sideSpeed (for drift mesh effects)
    const fx = Math.cos(synth.angle), fy = Math.sin(synth.angle);
    const sxn = -fy, syn = fx;
    synth.sideSpeed = (dx / dt) * sxn + (dy / dt) * syn;
    synth.rpm = Math.max(1000, Math.min(synth.maxRpm, 1000 + (synth.speed / 220) * synth.maxRpm));
    synth.steerAngle = 0; // visual only
    synth._prevX = synth.x;
    synth._prevY = synth.y;
    synth._prevTime = performance.now();

    ghost.lap = Math.max(ghost.lap, sample.lap);
    ghost.finished = ghost.finished || sample.finished;

    updateCar3D(ghost.mesh, synth, {
      throttle: synth.boosting ? 1 : Math.min(1, Math.max(0.35, synth.speed / 180)),
      brake: 0,
    }, track);

    if (ghost.nameSprite) {
      ghost.nameSprite.material.opacity = age > 1000 ? 0.42 : (ghost.finished ? 0.55 : 1.0);
    }
  }
}

function _checkMultiplayerVehicleCollisions() {
  if (!raceReleased || myFinished || !car || remotePlayers.size === 0) return;
  // 실제 syntheticCar 참조를 그대로 넘김 — spread 복사하면 임펄스가 사본에만 적용됨.
  const opponents = [];
  for (const ghost of remotePlayers.values()) {
    if (ghost.finished) continue;
    const synth = ghost.syntheticCar;
    if (!synth) continue;
    synth.collisionRadius = 28;   // 차 OBB(반장 11 × 2)에 가깝게 — 너무 작으면 안 부딪힘
    opponents.push(synth);
  }
  const hit = checkVehicleCollisions(car, opponents, 'friendly');
  if (hit) triggerShake(shake, 4.5);
}

function _makeNameSprite(name, color) {
  const cv = document.createElement('canvas');
  cv.width = 256; cv.height = 64;
  const ctx = cv.getContext('2d');
  ctx.fillStyle = 'rgba(8,11,16,0.78)';
  ctx.beginPath();
  ctx.roundRect(4, 8, cv.width - 8, cv.height - 16, 14);
  ctx.fill();
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(28, 32, 9, 0, Math.PI * 2);
  ctx.fill();
  ctx.font = 'bold 22px system-ui, sans-serif';
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(String(name || 'Driver').slice(0, 14), 48, 32);
  const tex = new THREE.CanvasTexture(cv);
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(36, 9, 1);
  sprite.renderOrder = 999;
  return sprite;
}

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
  const a = car.angle;
  const cs = Math.cos(a), sn = Math.sin(a);
  const rearOffset = -7.6;
  const sideOffset = 7.2;
  for (const sideSign of [-1, 1]) {
    const wx = car.x + rearOffset * cs - sideSign * sideOffset * sn;
    const wy = car.y + rearOffset * sn + sideSign * sideOffset * cs;
    const w3z = -wy;
    const key = sideSign < 0 ? '_lastSkidL' : '_lastSkidR';
    const prev = car[key];
    if (prev) {
      const dx = wx - prev.x, dz = w3z - prev.z;
      if (dx * dx + dz * dz > 4.0) {
        skidBuf.appendTrail(prev.x, prev.z, wx, w3z, 1.15, 0x9aa0a6);
        car[key] = { x: wx, z: w3z };
      }
    } else {
      car[key] = { x: wx, z: w3z };
    }
  }
}

function _updateCamera(dt) {
  const isHigh = cameraMode === 'high';
  const isHood = cameraMode === 'hood';

  // KartRider 연출 + 속도 비례 거리
  const boostPow = Math.min(1, car.boostPower || 0);
  const distMul = (isHigh || isHood) ? 1 : (1 - KART_CAMERA.CAM_DIST_PULL * boostPow);
  const heightDrop = (isHigh || isHood) ? 0 : KART_CAMERA.CAM_HEIGHT_DROP * boostPow;

  const topSpeed = Math.max(80, (car.maxSpeed || 180) * TOP_SPEED_MULT);
  const kmhNow   = (car.speed || 0) * KMH_PER_UNIT;
  const speedT   = Math.max(0, Math.min(1, kmhNow / topSpeed));
  const chaseDist = KART_CAMERA.CAM_DIST + KART_CAMERA.CAM_DIST_SPEED_ADD * speedT;

  const DIST = (isHigh ? 0 : isHood ? -8 : chaseDist) * distMul;
  const HEIGHT = (isHigh ? 380 : isHood ? 13.5 : KART_CAMERA.CAM_HEIGHT) - heightDrop;
  const LOOK_AHEAD = isHigh ? 20 : isHood ? 155 : KART_CAMERA.CAM_LOOK_AHEAD;
  const LOOK_Y_BASE = isHigh ? 0 : isHood ? 10.5 : KART_CAMERA.CAM_LOOK_Y;

  // 후진 시 시점 그대로(carAngle 유지).
  const movingFwd = (car.forwardSpeed || 0) > 5;
  const targetCam = movingFwd ? Math.atan2(car.vy, car.vx) : car.angle;
  let dA = targetCam - _camAngle;
  while (dA > Math.PI) dA -= Math.PI * 2;
  while (dA < -Math.PI) dA += Math.PI * 2;
  const angK = 1 - Math.exp(-5.0 * dt);
  _camAngle += dA * angK;

  // PC: 드리프트 yaw 오프셋 ❌. 카메라는 velocity만.
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

  const posK = 1 - Math.exp(-12.0 * dt);
  const lookK = 1 - Math.exp(-15.0 * dt);

  _camPos.x += (tx - _camPos.x) * posK;
  _camPos.y += (ty - _camPos.y) * posK;
  _camPos.z += (tz - _camPos.z) * posK;

  _camLook.x += (lx - _camLook.x) * lookK;
  _camLook.y += (ly - _camLook.y) * lookK;
  _camLook.z += (lz - _camLook.z) * lookK;

  // PC: 카메라 뱅크 ❌. up 고정 + lookAt만.
  car._camTilt = 0;
  const shk = tickShake(shake, dt);
  camera3d.position.set(_camPos.x + shk.x, _camPos.y + shk.y, _camPos.z);
  camera3d.up.set(0, 1, 0);
  camera3d.lookAt(_camLook);

  if (scene && scene.sunLight) {
    const carZ = -car.y;
    scene.sunLight.position.set(car.x + 400, 700, carZ - 300);
    scene.sunLight.target.position.set(car.x, 0, carZ);
    scene.sunLight.target.updateMatrixWorld();
  }
}

function _renderHUD(dt, kmh, msUntilStart) {
  if (!hudCtx || !hudCanvas) return;
  if (hudCanvas.width !== window.innerWidth) hudCanvas.width = window.innerWidth;
  if (hudCanvas.height !== window.innerHeight) hudCanvas.height = window.innerHeight;
  hudCtx.clearRect(0, 0, hudCanvas.width, hudCanvas.height);
  const boostT = Math.min(1, (car?.boostPower || 0));
  drawSpeedLines(hudCtx, speedLines, kmh, hudCanvas.width, hudCanvas.height, dt, cameraMode, boostT);
  drawHUD(hudCtx, car, timing, hudCanvas.width, hudCanvas.height, track, null);
  if (banner) _drawLapBanner(hudCtx, hudCanvas.width, hudCanvas.height);
  if (!raceReleased) _drawCountdownOverlay(hudCtx, hudCanvas.width, hudCanvas.height, msUntilStart);
  _drawLapCounter(hudCtx, hudCanvas.width, hudCanvas.height);
  if (myFinished) _drawWaitingBanner(hudCtx, hudCanvas.width, hudCanvas.height);
}

function _drawLapCounter(ctx, w, h) {
  ctx.save();
  ctx.font = 'bold 18px monospace';
  ctx.fillStyle = '#ffd166';
  ctx.textAlign = 'right';
  ctx.fillText(`LAP ${Math.min(myLapCount + (raceReleased && !myFinished ? 1 : 0), lapTarget)} / ${lapTarget}`, w - 24, 38);
  ctx.restore();
}

function _drawCountdownOverlay(ctx, w, h, msUntilStart) {
  const seconds = Math.max(0, msUntilStart / 1000);
  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,0.42)';
  ctx.fillRect(0, 0, w, h);
  ctx.font = 'bold 110px monospace';
  ctx.fillStyle = seconds > 0.5 ? '#ffd166' : '#79e2cb';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const label = seconds > 3 ? 'GET READY' : seconds > 0.4 ? String(Math.ceil(seconds)) : 'GO!';
  ctx.fillText(label, w / 2, h * 0.42);
  ctx.font = 'bold 18px system-ui';
  ctx.fillStyle = '#c0c5cf';
  ctx.fillText(`${remotePlayers.size + 1}명이 함께 출발합니다`, w / 2, h * 0.52);
  ctx.restore();
}

function _drawLapBanner(ctx, w, h) {
  if (!banner) return;
  const cx = w / 2;
  const cy = h * 0.32;
  ctx.save();
  ctx.fillStyle = banner.isNew ? 'rgba(80, 40, 100, 0.78)' : 'rgba(0, 0, 0, 0.78)';
  ctx.fillRect(0, cy - 60, w, 130);
  ctx.strokeStyle = banner.isNew ? '#ff66ff' : '#ffd23c';
  ctx.lineWidth = 4;
  ctx.strokeRect(0, cy - 60, w, 130);
  ctx.font = 'bold 18px monospace';
  ctx.fillStyle = banner.isNew ? '#ff66ff' : '#ffd23c';
  ctx.textAlign = 'center';
  ctx.fillText(banner.sub, cx, cy - 24);
  ctx.font = 'bold 64px monospace';
  ctx.fillStyle = '#fff';
  ctx.fillText(banner.text, cx, cy + 38);
  ctx.restore();
}

function _drawWaitingBanner(ctx, w, h) {
  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,0.42)';
  ctx.fillRect(0, h - 84, w, 84);
  ctx.font = 'bold 22px system-ui';
  ctx.fillStyle = '#79e2cb';
  ctx.textAlign = 'center';
  ctx.fillText('FINISHED · 다른 플레이어 대기 중', w / 2, h - 48);
  ctx.restore();
}

// ── networking ───────────────────────────────────────────────────

function _wireNet() {
  if (!net) return;
  mpUnsubs.push(net.on('snap', (msg) => _onSnapshot(msg)));
  mpUnsubs.push(net.on('playerLap', (msg) => _onRemoteLap(msg)));
  mpUnsubs.push(net.on('playerFinish', (msg) => _onRemoteFinish(msg)));
  mpUnsubs.push(net.on('playerLeft', (msg) => _onPlayerLeft(msg)));
  mpUnsubs.push(net.on('roomState', (msg) => _onRoomState(msg)));
  mpUnsubs.push(net.on('raceEnd', (msg) => _onRaceEnd(msg)));
}

function _onSnapshot(msg) {
  if (!Array.isArray(msg.P)) return;
  const serverTime = msg.T;
  for (const playerSnap of msg.P) {
    if (playerSnap.id === myClientId) continue;
    const ghost = remotePlayers.get(playerSnap.id);
    if (!ghost) continue;
    ghost.lastUpdateTime = performance.now();
    ghost.ping = Math.max(0, Date.now() - Number(playerSnap.ts || msg.T || Date.now()));
    ghost.interp.push(serverTime, playerSnap);
  }
}

function _onRemoteLap(msg) {
  if (msg.id === myClientId) return;
  const ghost = remotePlayers.get(msg.id);
  if (!ghost) return;
  ghost.lap = Math.max(ghost.lap, msg.lapNum);
  ghost.lastLapMs = msg.lapMs;
  if (msg.isBest) ghost.bestLapMs = msg.lapMs;
}

function _onRemoteFinish(msg) {
  if (msg.id === myClientId) return;
  const ghost = remotePlayers.get(msg.id);
  if (!ghost) return;
  ghost.finished = true;
  ghost.bestLapMs = msg.bestLapMs ?? ghost.bestLapMs;
}

function _onPlayerLeft(msg) {
  const ghost = remotePlayers.get(msg.id);
  if (!ghost) return;
  if (ghost.mesh && ghost.mesh.parent) ghost.mesh.parent.remove(ghost.mesh);
  remotePlayers.delete(msg.id);
}

function _onRoomState(msg) {
  // If a new player joined mid-countdown, spawn them too.
  if (!msg?.room?.players) return;
  for (const p of msg.room.players) {
    if (p.id === myClientId) continue;
    if (!remotePlayers.has(p.id)) {
      _spawnRemote(p, remotePlayers.size);
    }
  }
}

function _onRaceEnd(msg) {
  running = false;
  if (onFinishCb) {
    onFinishCb({
      reason: msg.reason,
      results: msg.results,
      myClientId,
      lapTarget,
    });
  }
}

// ── standings overlay ───────────────────────────────────────────

function _showStandings(on) {
  let panel = document.getElementById('mp-standings');
  if (on) {
    if (!panel) {
      panel = document.createElement('div');
      panel.id = 'mp-standings';
      panel.innerHTML = '<h4>STANDINGS</h4><div id="mp-standings-body"></div>';
      document.body.appendChild(panel);
    }
    panel.classList.remove('hidden');
    ensureMinimapPanel();
  } else if (panel) {
    panel.classList.add('hidden');
    document.getElementById('mp-minimap')?.classList.add('hidden');
  }
}

function ensureMinimapPanel() {
  let panel = document.getElementById('mp-minimap');
  if (panel) {
    panel.classList.remove('hidden');
    return panel;
  }
  panel = document.createElement('div');
  panel.id = 'mp-minimap';
  panel.innerHTML = '<canvas id="mp-minimap-canvas" width="190" height="132"></canvas>';
  document.body.appendChild(panel);
  return panel;
}

export function updateMinimap() {
  const canvas = document.getElementById('mp-minimap-canvas');
  if (!canvas || !track || !car) return;
  const ctx = canvas.getContext('2d');
  const players = [
    { id: myClientId, x: car.x, y: car.y, color: '#2ec4b6', name: 'YOU', isMe: true, visible: true },
    ...[...remotePlayers.values()].map(ghost => ({
      id: ghost.id,
      x: ghost.syntheticCar.x,
      y: ghost.syntheticCar.y,
      color: ghost.info?.themeColor || '#ffd166',
      name: ghost.info?.playerName || 'Driver',
      visible: ghost.visible !== false,
      faded: performance.now() - (ghost.lastUpdateTime || 0) > 1000,
    })),
  ];
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = 'rgba(8,11,16,0.72)';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  const line = track.centerLine || [];
  if (line.length > 1) {
    ctx.strokeStyle = 'rgba(255,255,255,0.18)';
    ctx.lineWidth = 9;
    drawTrackLine(ctx, line);
    ctx.strokeStyle = track.accentColor || '#2ec4b6';
    ctx.lineWidth = 3;
    drawTrackLine(ctx, line);
  }
  renderPlayerDots(ctx, players);
}

export function worldToMinimapPosition(position) {
  const line = track?.centerLine || [];
  const xs = line.map(p => p[0]);
  const ys = line.map(p => p[1]);
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const minY = Math.min(...ys), maxY = Math.max(...ys);
  return {
    x: 12 + ((position.x - minX) / ((maxX - minX) || 1)) * 166,
    y: 10 + ((position.y - minY) / ((maxY - minY) || 1)) * 112,
  };
}

export function renderPlayerDots(ctx, players) {
  for (const player of players) {
    if (!player.visible) continue;
    const p = worldToMinimapPosition(player);
    ctx.globalAlpha = player.faded ? 0.45 : 1;
    ctx.beginPath();
    ctx.arc(p.x, p.y, player.isMe ? 5 : 4, 0, Math.PI * 2);
    ctx.fillStyle = player.color;
    ctx.fill();
    ctx.strokeStyle = player.isMe ? '#ffffff' : 'rgba(255,255,255,0.55)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

function drawTrackLine(ctx, line) {
  ctx.beginPath();
  line.forEach(([x, y], index) => {
    const p = worldToMinimapPosition({ x, y });
    if (index === 0) ctx.moveTo(p.x, p.y);
    else ctx.lineTo(p.x, p.y);
  });
  ctx.closePath();
  ctx.stroke();
}

function _updateStandings() {
  const body = document.getElementById('mp-standings-body');
  if (!body) return;
  const all = [];
  all.push({
    id: myClientId,
    name: 'YOU',
    color: '#2ec4b6',
    lap: myLapCount,
    finished: myFinished,
    isMe: true,
  });
  for (const ghost of remotePlayers.values()) {
    all.push({
      id: ghost.id,
      name: ghost.info?.playerName || 'Driver',
      color: ghost.info?.themeColor || '#888',
      lap: ghost.lap,
      finished: ghost.finished,
      isMe: false,
    });
  }
  all.sort((a, b) => {
    if (a.finished && !b.finished) return -1;
    if (!a.finished && b.finished) return 1;
    return b.lap - a.lap;
  });
  body.innerHTML = '';
  all.forEach((row, i) => {
    const div = document.createElement('div');
    div.className = 'mp-standings-row'
      + (row.isMe ? ' mine' : '')
      + (row.finished ? ' finished' : '');
    div.innerHTML = `<span>${i + 1}.</span>
      <span style="display:flex;gap:6px;align-items:center;"><span class="mp-standings-dot" style="background:${row.color}"></span>${escapeHtml(row.name)}</span>
      <span>L${row.lap}</span>`;
    body.appendChild(div);
  });
}

function _onResize() {
  if (!renderer || !camera3d) return;
  renderer.setSize(window.innerWidth, window.innerHeight);
  camera3d.aspect = window.innerWidth / window.innerHeight;
  camera3d.updateProjectionMatrix();
}

function _onKeyDown(e) {
  // Block 'R' reset in multiplayer (would teleport).
  if (e.code === 'KeyR') {
    e.stopPropagation();
  }
}

function escapeHtml(text) {
  return String(text || '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}
