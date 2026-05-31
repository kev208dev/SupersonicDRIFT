export function isCarUnlocked(car) {
  return !!car;
}

export function unlockText(car) {
  if (!car) return '';
  return 'Available';
}

export function unlockProgressText(car) {
  if (!car) return '';
  return 'Ready to race.';
}

export function meetsTranscendUnlockCondition(carId) {
  return !!carId;
}
