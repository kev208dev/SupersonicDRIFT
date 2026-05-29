import * as THREE from 'three';
import { createCar, createCar3D, updateCar3D } from '../js/car.js';
import { KMH_PER_UNIT, TOP_SPEED_MULT, updatePhysics } from '../js/physics.js';
import { getInput } from '../utils/input.js';
import { getSharedRenderer } from '../js/renderer.js';
import { createSkidBuffer } from '../js/effects.js';

let renderer = null;
let scene = null;
let camera = null;
let car = null;
let carMesh = null;
let hudCanvas = null;
let hudCtx = null;
let running = false;
let selectedCarData = null;
let currentPracticeMap = 0;
let mapGroup = null;
let skidBuf = null;
let toastTimer = 0;
let practiceName = '';
let accumulator = 0;
let boostFlash = 0;
let driftPulse = 0;
let camLook = new THREE.Vector3();
let camTarget = new THREE.Vector3();
let smokeParticles = [];
let toyCooldown = 0;
const FIXED_DT = 1 / 60;

const START_POS = { x: 0, y: 0, angle: 0 };
const PRACTICE_TRACK = makePracticeTrack();

export function initLobbyPractice(carData) {
  selectedCarData = carData;
  const canvas = document.getElementById('three-canvas');
  hudCanvas = document.getElementById('hud-canvas');
  if (!canvas) return;
  canvas.style.display = 'block';
  if (hudCanvas) {
    hudCanvas.style.display = 'block';
    hudCtx = hudCanvas.getContext('2d');
    resizeHud();
  }

  renderer = getSharedRenderer(canvas);

  const bgColor = currentPracticeMap === 0 ? 0x9bd7ff : 0x8ecfb8;
  scene = new THREE.Scene();
  scene.background = new THREE.Color(bgColor);
  scene.fog = new THREE.Fog(bgColor, 520, 3200);
  camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 4200);
  camLook.set(0, 8, -20);
  camTarget.set(0, 44, 92);

  mapGroup = new THREE.Group();
  scene.add(mapGroup);
  if (currentPracticeMap === 0) buildPracticeArena(mapGroup);
  else buildJumpCourse(mapGroup);
  smokeParticles = createSmokeParticles(scene);
  skidBuf = createSkidBuffer(scene, 280);
  spawnLobbyCar(carData);
  window.addEventListener('resize', onResize);
  running = true;
}

export function stopLobbyPractice() {
  running = false;
  window.removeEventListener('resize', onResize);
}

export function updateLobbyPractice(dt) {
  if (!running || !renderer || !scene || !camera || !car) return;
  const input = getInput();
  if (input.reset) respawnLobbyCar();
  if (input.escape) document.querySelector('.lobby-hub')?.classList.toggle('panels-collapsed');
  const driveInput = makeLobbyDriveInput(input);
  toyCooldown = Math.max(0, toyCooldown - dt);
  accumulator += Math.min(dt, 0.05);
  let steps = 0;
  while (accumulator >= FIXED_DT && steps < 4) {
    if (!car.boosting) car.boostMeter = Math.min(100, (car.boostMeter || 0) + FIXED_DT * 28);
    updatePhysics(car, driveInput, FIXED_DT, PRACTICE_TRACK);
    if (car.boosting) boostFlash = Math.min(1, boostFlash + FIXED_DT * 8);
    if (car.drifting) {
      driftPulse = Math.min(1, driftPulse + FIXED_DT * 5);
      spawnLobbyDriftSmoke();
      _emitLobbySkid();
    }
    updateToyInteractions(FIXED_DT);
    updateAirTrick(FIXED_DT);
    accumulator -= FIXED_DT;
    steps++;
  }
  boostFlash = Math.max(0, boostFlash - dt * 2.8);
  driftPulse = Math.max(0, driftPulse - dt * 2.4);
  updateCar3D(carMesh, car, driveInput, PRACTICE_TRACK);
  applyAirTrickVisual();
  updateSmokeParticles(dt);
  updateLobbyCamera(dt);
  renderer.render(scene, camera);
  drawLobbyHud(dt);
}

export function switchLobbyCar(carData) {
  selectedCarData = carData;
  if (!scene) return initLobbyPractice(carData);
  if (carMesh) scene.remove(carMesh);
  spawnLobbyCar(carData);
  showLobbyCarToast(carData?.name || 'Selected car');
}

export function respawnLobbyCar() {
  if (!selectedCarData) return;
  if (!car) {
    spawnLobbyCar(selectedCarData);
    return;
  }
  car.x = START_POS.x;
  car.y = START_POS.y;
  car.angle = START_POS.angle;
  car.vx = 0;
  car.vy = 0;
  car.speed = 0;
  car.airTime = 0;
  car.airDuration = 0;
  car.airHeight = 0;
}

export function showLobbyCarToast(name) {
  practiceName = name;
  toastTimer = 1.4;
}

export function switchPracticeMap() {
  currentPracticeMap = (currentPracticeMap + 1) % 2;
  if (mapGroup) {
    mapGroup.traverse(obj => {
      if (obj.geometry) obj.geometry.dispose();
      if (obj.material) {
        if (Array.isArray(obj.material)) obj.material.forEach(m => m.dispose());
        else obj.material.dispose();
      }
    });
    mapGroup.clear();
    if (currentPracticeMap === 0) buildPracticeArena(mapGroup);
    else buildJumpCourse(mapGroup);
  }
  if (scene) {
    const bgColor = currentPracticeMap === 0 ? 0x9bd7ff : 0x8ecfb8;
    scene.background = new THREE.Color(bgColor);
    scene.fog = new THREE.Fog(bgColor, 520, 3200);
  }
  respawnLobbyCar();
  showLobbyCarToast(currentPracticeMap === 0 ? '연습장' : '점프 코스');
}

function spawnLobbyCar(carData) {
  car = createCar(carData, START_POS);
  car.boostMeter = 100;
  car.superBoostMeter = 100;
  carMesh = createCar3D(carData);
  scene.add(carMesh);
  updateCar3D(carMesh, car, { throttle: 0, brake: 0, steer: 0 }, PRACTICE_TRACK);
}

function buildPracticeArena(target) {
  target.add(new THREE.HemisphereLight(0xdff4ff, 0x5f7f62, 1.25));
  target.add(new THREE.AmbientLight(0xffffff, 0.72));
  const key = new THREE.DirectionalLight(0xffffff, 1.35);
  key.position.set(260, 360, 180);
  target.add(key);
  const rim = new THREE.DirectionalLight(0xff9a42, 0.62);
  rim.position.set(-160, 90, -180);
  target.add(rim);

  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(9000, 9000),
    new THREE.MeshStandardMaterial({ color: 0x304b5e, roughness: 0.9, metalness: 0.02 })
  );
  ground.rotation.x = -Math.PI / 2;
  target.add(ground);

  const grid = new THREE.GridHelper(9000, 120, 0xffffff, 0x86c5e8);
  grid.position.y = 0.05;
  grid.material.transparent = true;
  grid.material.opacity = 0.28;
  target.add(grid);

  const roadMat = new THREE.MeshStandardMaterial({ color: 0x3d4652, roughness: 0.72, metalness: 0.06 });
  const lineMat = new THREE.MeshBasicMaterial({ color: 0xff7a1f, transparent: true, opacity: 0.94 });
  const cyanMat = new THREE.MeshBasicMaterial({ color: 0x0077ff, transparent: true, opacity: 0.62 });

  const circle = new THREE.Mesh(new THREE.RingGeometry(190, 270, 128), roadMat);
  circle.rotation.x = -Math.PI / 2;
  circle.position.y = 0.02;
  target.add(circle);

  const straight = new THREE.Mesh(new THREE.PlaneGeometry(1400, 96), roadMat);
  straight.rotation.x = -Math.PI / 2;
  straight.position.set(0, 0.03, 0);
  target.add(straight);

  const cross = new THREE.Mesh(new THREE.PlaneGeometry(96, 920), roadMat);
  cross.rotation.x = -Math.PI / 2;
  cross.position.set(0, 0.025, 0);
  target.add(cross);

  for (let i = -14; i <= 14; i++) {
    const stripe = new THREE.Mesh(new THREE.PlaneGeometry(28, 2.2), lineMat);
    stripe.rotation.x = -Math.PI / 2;
    stripe.position.set(i * 46, 0.07, 0);
    target.add(stripe);
  }

  for (const [x, z, s] of [[-210, -110, 1.1], [220, 115, 1.3], [-130, 170, 0.9], [145, -180, 1]]) {
    const cone = new THREE.Mesh(
      new THREE.ConeGeometry(7 * s, 20 * s, 18),
      new THREE.MeshStandardMaterial({ color: 0xff6a00, roughness: 0.55 })
    );
    cone.position.set(x, 10 * s, z);
    target.add(cone);
  }

  addRamp(target, -360, -120, Math.PI * 0.08, 1.05);
  addRamp(target, 330, 130, Math.PI * 1.08, 1.15);
  addRamp(target, -40, 360, -Math.PI * 0.5, 1.0);
  addBoostPad(target, -180, 0, 0);
  addBoostPad(target, 180, 0, Math.PI);
  addBoostPad(target, 0, -220, Math.PI * 0.5);
  addLoopRing(target, 0, 410, 0);
  addLoopRing(target, 430, -260, Math.PI * 0.22);

  for (const z of [-340, 340]) {
    const neon = new THREE.Mesh(new THREE.PlaneGeometry(1500, 4), cyanMat);
    neon.rotation.x = -Math.PI / 2;
    neon.position.set(0, 0.08, z);
    target.add(neon);
  }
}

function buildJumpCourse(target) {
  target.add(new THREE.HemisphereLight(0xd4f5e8, 0x2a4a30, 1.2));
  target.add(new THREE.AmbientLight(0xffffff, 0.65));
  const key = new THREE.DirectionalLight(0xfff8ee, 1.4);
  key.position.set(500, 480, 100);
  target.add(key);
  const rim = new THREE.DirectionalLight(0x00ffcc, 0.48);
  rim.position.set(-200, 120, -300);
  target.add(rim);

  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(9000, 9000),
    new THREE.MeshStandardMaterial({ color: 0x1e3028, roughness: 0.88, metalness: 0.03 })
  );
  ground.rotation.x = -Math.PI / 2;
  target.add(ground);

  const grid = new THREE.GridHelper(9000, 120, 0x00ffcc, 0x00aa88);
  grid.position.y = 0.05;
  grid.material.transparent = true;
  grid.material.opacity = 0.22;
  target.add(grid);

  const roadMat = new THREE.MeshStandardMaterial({ color: 0x252d3a, roughness: 0.68, metalness: 0.08 });
  const road = new THREE.Mesh(new THREE.PlaneGeometry(1850, 80), roadMat);
  road.rotation.x = -Math.PI / 2;
  road.position.set(820, 0.03, 0);
  target.add(road);

  // Dashed center line (along x-axis)
  const lineMat = new THREE.MeshBasicMaterial({ color: 0xfacc15, transparent: true, opacity: 0.85 });
  for (let i = 0; i < 28; i++) {
    const stripe = new THREE.Mesh(new THREE.PlaneGeometry(32, 3.5), lineMat);
    stripe.rotation.x = -Math.PI / 2;
    stripe.position.set(i * 64, 0.08, 0);
    target.add(stripe);
  }

  // Neon edge strips along the road
  const neonMat = new THREE.MeshBasicMaterial({ color: 0x00ffcc, transparent: true, opacity: 0.75 });
  for (const z of [-42, 42]) {
    const strip = new THREE.Mesh(new THREE.PlaneGeometry(1850, 3), neonMat);
    strip.rotation.x = -Math.PI / 2;
    strip.position.set(820, 0.1, z);
    target.add(strip);
  }

  // Course pylons (alternating sides)
  const coneMat = new THREE.MeshStandardMaterial({ color: 0xff2200, roughness: 0.5 });
  const bandMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.5 });
  const pylonXs = [0, 150, 350, 560, 750, 970, 1150, 1400, 1600];
  pylonXs.forEach((x, i) => {
    for (const side of [-1, 1]) {
      const z = side * 68;
      const cone = new THREE.Mesh(new THREE.ConeGeometry(6, 18, 16), coneMat);
      cone.position.set(x, 9, z);
      target.add(cone);
      const band = new THREE.Mesh(new THREE.CylinderGeometry(6.2, 6.2, 3, 16), bandMat);
      band.position.set(x, 6.5, z);
      target.add(band);
    }
  });

  // Landing platform at the end
  const platform = new THREE.Mesh(
    new THREE.CylinderGeometry(160, 160, 4, 64),
    new THREE.MeshStandardMaterial({ color: 0x1a4040, roughness: 0.6 })
  );
  platform.position.set(1750, -1, 0);
  target.add(platform);
  const ringMark = new THREE.Mesh(
    new THREE.RingGeometry(120, 130, 64),
    new THREE.MeshBasicMaterial({ color: 0x00ffcc, side: THREE.DoubleSide })
  );
  ringMark.rotation.x = -Math.PI / 2;
  ringMark.position.set(1750, 2, 0);
  target.add(ringMark);

  // Start arrow marker
  const arrowMat = new THREE.MeshBasicMaterial({ color: 0xfacc15, transparent: true, opacity: 0.9 });
  const startArrow = new THREE.Mesh(new THREE.PlaneGeometry(60, 8), arrowMat);
  startArrow.rotation.x = -Math.PI / 2;
  startArrow.position.set(40, 0.12, 0);
  target.add(startArrow);

  // Ramps along the x-axis (angle = PI/2 = car approaches from -x going in +x)
  addRamp(target,  280, 0, Math.PI * 0.5, 1.05);
  addRamp(target,  700, 0, Math.PI * 0.5, 1.15);
  addRamp(target, 1120, 0, Math.PI * 0.5, 1.25);
  addRamp(target, 1480, 0, Math.PI * 0.5, 1.1);

  // Boost pads before each ramp
  addBoostPad(target,  100, 0, 0);
  addBoostPad(target,  520, 0, 0);
  addBoostPad(target,  960, 0, 0);
  addBoostPad(target, 1300, 0, 0);

  // Loop rings between ramps
  addLoopRing(target,  450, 0, Math.PI * 0.5);
  addLoopRing(target,  870, 0, Math.PI * 0.5);
  addLoopRing(target, 1650, 0, Math.PI * 0.5);
}

function addRamp(target, x, z, angle, scale = 1) {
  const group = new THREE.Group();
  group.position.set(x, 0.2, z);
  group.rotation.y = angle;
  group.scale.setScalar(scale);
  const shape = new THREE.Shape();
  shape.moveTo(-32, 0);
  shape.lineTo(32, 0);
  shape.lineTo(32, 18);
  shape.lineTo(-32, 0);
  const geom = new THREE.ExtrudeGeometry(shape, { depth: 72, bevelEnabled: false });
  geom.rotateY(Math.PI / 2);
  geom.translate(0, 0, -36);
  const ramp = new THREE.Mesh(geom, new THREE.MeshStandardMaterial({ color: 0xff7a1f, roughness: 0.45, metalness: 0.12 }));
  group.add(ramp);
  const arrow = new THREE.Mesh(new THREE.PlaneGeometry(42, 4), new THREE.MeshBasicMaterial({ color: 0xfacc15 }));
  arrow.rotation.x = -Math.PI / 2;
  arrow.position.set(0, 1.2, -10);
  group.add(arrow);
  target.add(group);
}

function addBoostPad(target, x, z, angle) {
  const group = new THREE.Group();
  group.position.set(x, 0.12, z);
  group.rotation.y = angle;
  const pad = new THREE.Mesh(
    new THREE.PlaneGeometry(88, 34),
    new THREE.MeshBasicMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.62 })
  );
  pad.rotation.x = -Math.PI / 2;
  group.add(pad);
  for (let i = -1; i <= 1; i++) {
    const stripe = new THREE.Mesh(new THREE.PlaneGeometry(48, 3), new THREE.MeshBasicMaterial({ color: 0xfacc15 }));
    stripe.rotation.x = -Math.PI / 2;
    stripe.position.z = i * 9;
    group.add(stripe);
  }
  target.add(group);
}

function addLoopRing(target, x, z, angle) {
  const group = new THREE.Group();
  group.position.set(x, 58, z);
  group.rotation.y = angle;
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(52, 4, 10, 72),
    new THREE.MeshBasicMaterial({ color: 0xff5a1f })
  );
  ring.rotation.y = Math.PI / 2;
  group.add(ring);
  const inner = new THREE.Mesh(
    new THREE.TorusGeometry(40, 1.5, 8, 72),
    new THREE.MeshBasicMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.75 })
  );
  inner.rotation.y = Math.PI / 2;
  group.add(inner);
  target.add(group);
}

function updateLobbyCamera(dt) {
  const speedN = Math.min(1, (car.speed || 0) / Math.max(1, (car.maxSpeed || 280) * TOP_SPEED_MULT));
  const back = 98 + speedN * 30 + boostFlash * 20;
  const height = 40 + speedN * 12;
  const lookAhead = 62 + speedN * 36;
  const targetX = car.x - Math.cos(car.angle) * back;
  const targetZ = -car.y + Math.sin(car.angle) * back;
  const lerp = Math.min(1, dt * (3.0 + speedN * 2.2));
  camTarget.set(targetX, height, targetZ);
  camera.position.lerp(camTarget, lerp);
  camLook.lerp(new THREE.Vector3(
    car.x + Math.cos(car.angle) * lookAhead,
    7 + speedN * 5,
    -(car.y + Math.sin(car.angle) * lookAhead)
  ), Math.min(1, dt * 5.5));
  camera.fov += ((62 + speedN * 6 + boostFlash * 8) - camera.fov) * Math.min(1, dt * 5.5);
  camera.updateProjectionMatrix();
  camera.lookAt(camLook);
  if (toastTimer > 0) toastTimer = Math.max(0, toastTimer - dt);
  const toast = document.getElementById('lobby-car-toast');
  if (toast) {
    toast.textContent = practiceName;
    toast.classList.toggle('visible', toastTimer > 0);
  }
}

function onResize() {
  if (!renderer || !camera) return;
  renderer.setSize(window.innerWidth, window.innerHeight);
  resizeHud();
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
}

function makeLobbyDriveInput(input) {
  const cost = car?.boostCost || 38;
  const boostReady = (car?.boostMeter || 0) >= cost && (car?.boostTimer || 0) <= 0;
  return {
    ...input,
    boostJust: input.boostJust || (input.boost && boostReady),
  };
}

function _emitLobbySkid() {
  if (!skidBuf || !car) return;
  const a = car.angle;
  const cs = Math.cos(a), sn = Math.sin(a);
  const rearOffset = -7.6, sideOffset = 7.2;
  const colors = [0x35f5ff, 0xff3b18, 0xb85cff];
  const col = colors[Math.abs((car.id || '').split('').reduce((s, c) => s + c.charCodeAt(0), 0)) % colors.length];
  for (const side of [-1, 1]) {
    const wx = car.x + rearOffset * cs - side * sideOffset * sn;
    const wy = car.y + rearOffset * sn + side * sideOffset * cs;
    const key = side < 0 ? '_skidL' : '_skidR';
    const prev = car[key];
    if (prev) {
      const dx = wx - prev.x, dz = -wy - prev.z;
      if (dx * dx + dz * dz > 4) {
        skidBuf.appendTrail(prev.x, prev.z, wx, -wy, 1.15, col);
        car[key] = { x: wx, z: -wy };
      }
    } else {
      car[key] = { x: wx, z: -wy };
    }
  }
}

const MAP0_TOYS = [
  { type: 'ramp',  x: -360, y:  120, radius: 58, angle: Math.PI * 0.08 },
  { type: 'ramp',  x:  330, y: -130, radius: 64, angle: Math.PI * 1.08 },
  { type: 'ramp',  x:  -40, y: -360, radius: 58, angle: -Math.PI * 0.5 },
  { type: 'boost', x: -180, y:    0, radius: 52, angle: 0 },
  { type: 'boost', x:  180, y:    0, radius: 52, angle: Math.PI },
  { type: 'boost', x:    0, y:  220, radius: 52, angle: Math.PI * 0.5 },
  { type: 'loop',  x:    0, y: -410, radius: 82, angle: 0 },
  { type: 'loop',  x:  430, y:  260, radius: 82, angle: Math.PI * 0.22 },
];
const MAP1_TOYS = [
  { type: 'boost', x:  100, y: 0, radius: 52, angle: 0 },
  { type: 'ramp',  x:  280, y: 0, radius: 60, angle: 0 },
  { type: 'loop',  x:  450, y: 0, radius: 82, angle: 0 },
  { type: 'boost', x:  560, y: 0, radius: 52, angle: 0 },
  { type: 'ramp',  x:  700, y: 0, radius: 60, angle: 0 },
  { type: 'loop',  x:  870, y: 0, radius: 82, angle: 0 },
  { type: 'boost', x:  980, y: 0, radius: 52, angle: 0 },
  { type: 'ramp',  x: 1120, y: 0, radius: 60, angle: 0 },
  { type: 'boost', x: 1300, y: 0, radius: 52, angle: 0 },
  { type: 'ramp',  x: 1480, y: 0, radius: 60, angle: 0 },
  { type: 'loop',  x: 1650, y: 0, radius: 82, angle: 0 },
];

function updateToyInteractions(dt) {
  if (!car || toyCooldown > 0) return;
  const toys = currentPracticeMap === 0 ? MAP0_TOYS : MAP1_TOYS;
  for (const toy of toys) {
    const dx = car.x - toy.x;
    const dy = car.y - toy.y;
    if (dx * dx + dy * dy > toy.radius * toy.radius) continue;
    if (toy.type === 'boost') {
      const push = 155;
      car.vx += Math.cos(toy.angle) * push * dt * 8;
      car.vy += Math.sin(toy.angle) * push * dt * 8;
      boostFlash = 1;
      toyCooldown = 0.24;
      return;
    }
    if ((car.speed || 0) > 22) {
      startAirTrick(toy.type === 'loop' ? 1.35 : 1.05, toy.type === 'loop' ? 82 : 58);
      const push = toy.type === 'loop' ? 90 : 52;
      car.vx += Math.cos(car.angle) * push;
      car.vy += Math.sin(car.angle) * push;
      toyCooldown = 0.9;
      return;
    }
  }
}

function startAirTrick(duration, height) {
  car.airTime = duration;
  car.airDuration = duration;
  car.airHeight = height;
  boostFlash = 1;
}

function updateAirTrick(dt) {
  if (!car?.airTime) return;
  car.airTime = Math.max(0, car.airTime - dt);
}

function applyAirTrickVisual() {
  if (!carMesh) return;
  if (!car?.airTime || !car.airDuration) {
    carMesh.rotation.x *= 0.82;
    carMesh.rotation.z *= 0.82;
    return;
  }
  const progress = 1 - car.airTime / car.airDuration;
  carMesh.position.y += Math.sin(progress * Math.PI) * car.airHeight;
  carMesh.rotation.z = Math.sin(progress * Math.PI * 2) * 0.18;
  carMesh.rotation.x = progress * Math.PI * 2;
}

function resizeHud() {
  if (!hudCanvas) return;
  const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
  hudCanvas.width = Math.round(window.innerWidth * dpr);
  hudCanvas.height = Math.round(window.innerHeight * dpr);
  hudCanvas.style.width = `${window.innerWidth}px`;
  hudCanvas.style.height = `${window.innerHeight}px`;
  hudCtx?.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function drawLobbyHud(dt) {
  if (!hudCtx || !hudCanvas || !car) return;
  const w = window.innerWidth;
  const h = window.innerHeight;
  hudCtx.clearRect(0, 0, w, h);
  const kmh = Math.round((car.speed || 0) * KMH_PER_UNIT);
  drawSpeedStreaks(hudCtx, w, h, kmh, dt);
  drawBoostHud(hudCtx, w, h, kmh);
}

function drawSpeedStreaks(ctx, w, h, kmh, dt) {
  const intensity = Math.min(1, Math.max(0, (kmh - 120) / 220) + boostFlash * 0.7);
  if (intensity <= 0.02) return;
  ctx.save();
  ctx.globalAlpha = 0.18 * intensity;
  ctx.strokeStyle = car.boosting ? '#facc15' : '#38bdf8';
  ctx.lineWidth = 2 + intensity * 3;
  const count = Math.floor(12 + intensity * 18);
  for (let i = 0; i < count; i++) {
    const y = ((i * 73 + performance.now() * (0.08 + intensity * 0.12)) % h);
    const side = i % 2 ? 1 : -1;
    const x = side > 0 ? w - 20 - (i % 5) * 16 : 20 + (i % 5) * 16;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x - side * (80 + intensity * 120), y + 28);
    ctx.stroke();
  }
  ctx.restore();
}

function drawBoostHud(ctx, w, h, kmh) {
  const x = Math.max(18, w * 0.5 - 170);
  const y = h - 82;
  const bw = 340;
  const bh = 12;
  const boost = Math.max(0, Math.min(100, car.boostMeter || 0));
  ctx.save();
  ctx.fillStyle = 'rgba(2, 6, 23, 0.58)';
  ctx.strokeStyle = car.boosting ? 'rgba(250, 204, 21, 0.92)' : 'rgba(148, 163, 184, 0.28)';
  ctx.lineWidth = 1;
  roundRect(ctx, x - 14, y - 34, bw + 28, 62, 16);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#f8fafc';
  ctx.font = '900 18px system-ui';
  ctx.textAlign = 'left';
  ctx.fillText(`${kmh} km/h`, x, y - 10);
  ctx.textAlign = 'right';
  ctx.fillStyle = car.boosting ? '#facc15' : '#38bdf8';
  ctx.fillText(car.boosting ? 'BOOST' : 'LOBBY PRACTICE', x + bw, y - 10);
  ctx.fillStyle = 'rgba(148, 163, 184, 0.22)';
  roundRect(ctx, x, y, bw, bh, 999);
  ctx.fill();
  const grad = ctx.createLinearGradient(x, y, x + bw, y);
  grad.addColorStop(0, '#ff5a1f');
  grad.addColorStop(0.55, '#facc15');
  grad.addColorStop(1, '#38bdf8');
  ctx.fillStyle = grad;
  roundRect(ctx, x, y, bw * boost / 100, bh, 999);
  ctx.fill();
  if (driftPulse > 0.05) {
    ctx.globalAlpha = driftPulse;
    ctx.fillStyle = '#f8fafc';
    ctx.font = '800 12px system-ui';
    ctx.textAlign = 'center';
    ctx.fillText('DRIFT CHARGING BOOST', x + bw / 2, y + 30);
  }
  ctx.restore();
}

function roundRect(ctx, x, y, w, h, r) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

function makePracticeTrack() {
  return {
    id: 'lobby_practice',
    name: 'Infinite Practice Arena',
    width: 999999,
    centerLine: [],
    startPos: START_POS,
    roadProfile: { type: 'practice', roughness: 0.12 },
  };
}

function createSmokeParticles(target) {
  const particles = [];
  const geometry = new THREE.SphereGeometry(1, 10, 8);
  for (let i = 0; i < 46; i++) {
    const material = new THREE.MeshBasicMaterial({
      color: 0xe9f2ff,
      transparent: true,
      opacity: 0,
      depthWrite: false,
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.visible = false;
    target.add(mesh);
    particles.push({ mesh, life: 0, maxLife: 1, vx: 0, vz: 0, vy: 0, scale: 1 });
  }
  return particles;
}

function spawnLobbyDriftSmoke() {
  if (!smokeParticles.length || !car) return;
  const speed = Math.max(0, car.speed || 0);
  if (speed < 16) return;
  const particle = smokeParticles.find(item => item.life <= 0) || smokeParticles[0];
  const side = Math.sign(car.sideSpeed || car.steerAngle || 1);
  const backX = car.x - Math.cos(car.angle) * 13 - Math.sin(car.angle) * side * 7;
  const backY = car.y - Math.sin(car.angle) * 13 + Math.cos(car.angle) * side * 7;
  particle.life = 0.75;
  particle.maxLife = 0.75;
  particle.vx = -Math.cos(car.angle) * 10 + (Math.random() - 0.5) * 8;
  particle.vz = Math.sin(car.angle) * 10 + (Math.random() - 0.5) * 8;
  particle.vy = 6 + Math.random() * 8;
  particle.scale = 6 + Math.min(14, speed * 0.08);
  particle.mesh.visible = true;
  particle.mesh.position.set(backX, 3.5, -backY);
  particle.mesh.scale.setScalar(1);
  particle.mesh.material.opacity = 0.38;
}

function updateSmokeParticles(dt) {
  for (const particle of smokeParticles) {
    if (particle.life <= 0) continue;
    particle.life -= dt;
    const t = Math.max(0, particle.life / particle.maxLife);
    particle.mesh.position.x += particle.vx * dt;
    particle.mesh.position.y += particle.vy * dt;
    particle.mesh.position.z += particle.vz * dt;
    particle.mesh.scale.setScalar(particle.scale * (1.1 - t));
    particle.mesh.material.opacity = 0.34 * t;
    if (particle.life <= 0) {
      particle.mesh.visible = false;
      particle.mesh.material.opacity = 0;
    }
  }
}
