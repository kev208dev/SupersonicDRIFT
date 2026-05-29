import * as THREE from 'three';

export const RECORD_LINES_KEY = 'racingRecordLines';
export const GHOST_RUNS_KEY = RECORD_LINES_KEY;

let recording = null;
let sampleTimer = 0;
let recordLineVisible = true;
let activeLineGroup = null;

export function startRecordLineCapture(trackId, carId) {
  recording = {
    trackId,
    carId,
    finishTime: 0,
    samples: [],
    createdAt: new Date().toISOString(),
  };
  sampleTimer = 0;
  return recording;
}

export function captureRecordLineSample(deltaTime, car) {
  if (!recording || !car) return;
  sampleTimer += deltaTime;
  if (sampleTimer < 0.1) return;
  const elapsed = (recording.samples.at(-1)?.t || 0) + sampleTimer;
  recording.samples.push({
    t: Math.round(elapsed * 1000),
    position: { x: car.x || 0, y: (car.roadHeight || 0) + 0.08, z: -(car.y || 0) },
    speed: car.speed || 0,
  });
  sampleTimer = 0;
}

export function saveRecordLine(result = {}) {
  if (!recording) return null;
  const line = { ...recording, finishTime: Number(result.finishTime || result.lapMs || 0) };
  recording = null;
  if (line.finishTime <= 0 || !line.samples.length) return null;
  const lines = loadAllRecordLines();
  const prev = lines[line.trackId];
  if (!prev || line.finishTime < Number(prev.finishTime || Infinity)) {
    lines[line.trackId] = line;
    localStorage.setItem(RECORD_LINES_KEY, JSON.stringify(lines));
    return line;
  }
  return null;
}

export function loadBestRecordLine(trackId) {
  const id = typeof trackId === 'string' ? trackId : trackId?.id;
  return loadAllRecordLines()[id] || null;
}

export function renderRecordLine(recordLine, scene) {
  if (!scene || !recordLine?.samples?.length) return null;
  if (activeLineGroup) {
    activeLineGroup.parent?.remove(activeLineGroup);
    activeLineGroup = null;
  }
  const group = new THREE.Group();
  group.name = 'best-record-line';
  const points = recordLine.samples.map(sample => new THREE.Vector3(sample.position.x, sample.position.y, sample.position.z));
  const geometry = new THREE.BufferGeometry().setFromPoints(points);
  const material = new THREE.LineBasicMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.82 });
  group.add(new THREE.Line(geometry, material));
  updateRecordLineSpeedMarkers(recordLine, group);
  group.visible = recordLineVisible;
  scene.add(group);
  activeLineGroup = group;
  return group;
}

export function updateRecordLineSpeedMarkers(recordLine, group = activeLineGroup) {
  if (!group || !recordLine?.samples?.length) return;
  const samples = recordLine.samples.filter((_, index) => index % 8 === 0);
  const maxSpeed = Math.max(1, ...recordLine.samples.map(sample => Number(sample.speed || 0)));
  const markerGeometry = new THREE.SphereGeometry(0.42, 8, 8);
  for (const sample of samples) {
    const fast = Number(sample.speed || 0) / maxSpeed > 0.72;
    const material = new THREE.MeshBasicMaterial({ color: fast ? 0xfacc15 : 0x38bdf8, transparent: true, opacity: fast ? 0.9 : 0.62 });
    const marker = new THREE.Mesh(markerGeometry, material);
    marker.position.set(sample.position.x, sample.position.y + 0.08, sample.position.z);
    group.add(marker);
  }
}

export function toggleRecordLine(force) {
  recordLineVisible = typeof force === 'boolean' ? force : !recordLineVisible;
  if (activeLineGroup) activeLineGroup.visible = recordLineVisible;
  return recordLineVisible;
}

export function startGhostRecording(trackId, carId) {
  return startRecordLineCapture(trackId, carId);
}

export function recordGhostSample(deltaTime, car) {
  return captureRecordLineSample(deltaTime, car);
}

export function stopGhostRecording(result = {}) {
  return saveRecordLine(result);
}

export function saveGhostRun(recordLine) {
  const lines = loadAllRecordLines();
  const id = recordLine.trackId || recordLine.track;
  const prev = lines[id];
  if (!prev || Number(recordLine.finishTime) < Number(prev.finishTime || Infinity)) {
    lines[id] = { ...recordLine, trackId: id };
    localStorage.setItem(RECORD_LINES_KEY, JSON.stringify(lines));
    return true;
  }
  return false;
}

export function loadBestGhostRun(track) {
  return loadBestRecordLine(track);
}

export function spawnGhostCar(ghostRun) {
  return ghostRun || null;
}

export function updateGhostCar(elapsedTime, ghostRun) {
  if (!ghostRun?.samples?.length) return null;
  const t = Number(elapsedTime || 0);
  return ghostRun.samples.find(sample => sample.t >= t) || ghostRun.samples.at(-1);
}

export function toggleGhostVisibility(force) {
  return toggleRecordLine(force);
}

function loadAllRecordLines() {
  try {
    return JSON.parse(localStorage.getItem(RECORD_LINES_KEY) || '{}') || {};
  } catch {
    return {};
  }
}
