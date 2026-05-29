export const gameState = {
  currentScreen: 'main',
  selectedMode: null,
  selectedTrack: 'suspension',
  selectedCar: 'gt3',
  selectedSkin: 'default',
  isRaceRunning: false,
  isRaceFinished: false,
  raceStartTime: null,
  raceEndTime: null,
  currentResult: null,
  currentUser: null,
  isGuest: true,
  roomCode: null,
  players: [],
  season: null,
  rating: null,
  missions: [],
  leaderboardTab: 'today',
  leaderboardMode: 'timeTrial',
};

export function updateGameState(patch = {}) {
  Object.assign(gameState, patch);
  window.dispatchEvent(new CustomEvent('racing:stateChange', { detail: gameState }));
  return gameState;
}

export function selectGameMode(mode) {
  return updateGameState({ selectedMode: mode });
}

export function selectTrack(trackId) {
  return updateGameState({ selectedTrack: trackId });
}

export function selectCarAndSkin(carId, skinId) {
  return updateGameState({ selectedCar: carId, selectedSkin: skinId });
}

export function enterLobby(mode) {
  return updateGameState({ currentScreen: 'lobby', selectedMode: mode || gameState.selectedMode });
}

export function setReadyState(playerId, ready) {
  const players = gameState.players.map(player => (
    player.id === playerId ? { ...player, ready: !!ready } : player
  ));
  return updateGameState({ players });
}

export function startRaceWithCountdown() {
  return updateGameState({
    isRaceRunning: false,
    isRaceFinished: false,
    raceStartTime: Date.now() + 3200,
  });
}
