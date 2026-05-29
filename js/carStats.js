import { CAR_DATA } from '../data/cars.js';

const BASE_PHYSICS = {
  maxSpeed: 300,
  accelerationForce: 1,
  traction: 1,
  turnStrength: 1,
  boostMultiplier: 1.2,
  boostDuration: 1.4,
  boostRecharge: 1,
};

const STAT_KEYS = ['speed', 'acceleration', 'grip', 'handling', 'boost'];

export function normalizeCarStats(stats = {}, tier = 'common') {
  const isTranscend = tier === 'transcend';
  return STAT_KEYS.reduce((out, key) => {
    const raw = Number(stats[key] ?? 70);
    out[key] = Math.max(1, Math.min(isTranscend ? 170 : 100, raw));
    return out;
  }, {});
}

export function getCarStats(carId) {
  const car = CAR_DATA.find(item => item.id === carId) || CAR_DATA[0];
  return normalizeCarStats(car?.stats, car?.tier);
}

export function getCarPowerTotal(carId) {
  const stats = getCarStats(carId);
  return STAT_KEYS.reduce((sum, key) => sum + stats[key], 0);
}

export function isTranscendCar(carId) {
  const car = CAR_DATA.find(item => item.id === carId);
  return car?.tier === 'transcend';
}

export function effectiveStat(value) {
  const stat = Number(value) || 0;
  return stat <= 100 ? stat : 100 + (stat - 100) * 0.55;
}

export function mapStatToPhysics(carStats = {}) {
  const stats = normalizeCarStats(carStats, Math.max(...Object.values(carStats || {})) > 100 ? 'transcend' : 'common');
  return {
    maxSpeed: BASE_PHYSICS.maxSpeed * (effectiveStat(stats.speed) / 100),
    accelerationForce: BASE_PHYSICS.accelerationForce * (effectiveStat(stats.acceleration) / 100),
    traction: BASE_PHYSICS.traction * (effectiveStat(stats.grip) / 100),
    turnStrength: BASE_PHYSICS.turnStrength * (effectiveStat(stats.handling) / 100),
    boostMultiplier: BASE_PHYSICS.boostMultiplier * (effectiveStat(stats.boost) / 100),
    boostDuration: BASE_PHYSICS.boostDuration * (0.72 + effectiveStat(stats.boost) / 220),
    boostRecharge: BASE_PHYSICS.boostRecharge * (0.7 + effectiveStat(stats.boost) / 180),
  };
}

export function applyCarStatsToPhysics(carStats = {}, target = {}) {
  const physics = mapStatToPhysics(carStats);
  return Object.assign(target, physics);
}

export function renderCarStatRows(car) {
  const stats = normalizeCarStats(car?.stats, car?.tier);
  return STAT_KEYS.map(key => {
    const value = stats[key];
    const max = value > 100 ? 170 : 100;
    const width = Math.max(4, Math.min(100, Math.round((value / max) * 100)));
    const label = key === 'acceleration' ? 'Acceleration' : key[0].toUpperCase() + key.slice(1);
    return `
      <div class="car-stat-row${value > 100 ? ' transcend-stat' : ''}">
        <span>${label}</span>
        <b>${value}${value > 100 ? ' / 100+' : ' / 100'}</b>
        <i><em style="width:${width}%"></em></i>
      </div>
    `;
  }).join('');
}
