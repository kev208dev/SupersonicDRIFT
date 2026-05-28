const COLLISION_COOLDOWN_MS = 300;
const lastHits = new Map();

export function handleCarCollision(carA, carB, collisionInfo = {}) {
  if (!carA || !carB) return false;
  const strength = Number(collisionInfo.strength || 1);
  applyCollisionImpulse(carA, carB, collisionInfo.normal, strength);
  return true;
}

export function applyCollisionImpulse(carA, carB, normal = null, strength = 1) {
  const dx = normal?.x ?? ((carA.x || 0) - (carB.x || 0));
  const dy = normal?.y ?? ((carA.y || 0) - (carB.y || 0));
  const len = Math.hypot(dx, dy) || 1;
  const nx = dx / len;
  const ny = dy / len;
  const impulse = Math.max(0.2, Math.min(2.5, strength));
  carA.vx = (carA.vx || 0) * 0.82 + nx * impulse * 12;
  carA.vy = (carA.vy || 0) * 0.82 + ny * impulse * 12;
  carB.vx = (carB.vx || 0) * 0.88 - nx * impulse * 8;
  carB.vy = (carB.vy || 0) * 0.88 - ny * impulse * 8;
  carA.angle = (carA.angle || 0) + (Math.random() - 0.5) * 0.05 * impulse;
  carB.angle = (carB.angle || 0) - (Math.random() - 0.5) * 0.04 * impulse;
}

export function checkOpponentCollision(playerCar, opponents = [], mode = 'timeTrial') {
  if (mode === 'timeTrial' || !playerCar || !Array.isArray(opponents)) return false;
  for (const opponent of opponents) {
    const dx = (playerCar.x || 0) - (opponent.x || 0);
    const dy = (playerCar.y || 0) - (opponent.y || 0);
    const dist = Math.hypot(dx, dy);
    const radius = Number(opponent.collisionRadius || 18);
    if (dist < radius && canHit(playerCar, opponent)) {
      const normal = { x: dx / (dist || 1), y: dy / (dist || 1) };
      return handleCarCollision(playerCar, opponent, { normal, strength: (radius - dist) / radius + 0.45 });
    }
  }
  return false;
}

export function checkVehicleCollisions(playerCar, opponents = [], mode = 'timeTrial') {
  if (mode === 'timeTrial') return false;
  return checkOpponentCollision(playerCar, opponents, mode);
}

export function handleVehicleCollision(playerCar, opponentCar, collisionInfo = {}) {
  return handleCarCollision(playerCar, opponentCar, collisionInfo);
}

export function applyCollisionResponse(carA, carB, strength = 1) {
  return applyCollisionImpulse(carA, carB, null, strength);
}

function canHit(carA, carB) {
  const key = `${carA.id || 'local'}:${carB.id || 'remote'}`;
  const now = performance.now?.() || Date.now();
  if ((lastHits.get(key) || 0) + COLLISION_COOLDOWN_MS > now) return false;
  lastHits.set(key, now);
  return true;
}
