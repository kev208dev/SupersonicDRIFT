const REMOTE_HOST = 'racinggame.fly.dev';

export function getApiHost() {
  const host = window.location.host;
  if (host.includes('localhost') || host.includes('127.0.0.1') || host.includes('fly.dev')) {
    return host;
  } else {
    return REMOTE_HOST;
  }
}

export function getApiBase() {
  const host = window.location.host;
  if (host.includes('localhost') || host.includes('127.0.0.1') || host.includes('fly.dev')) {
    return '';
  } else {
    return `https://${REMOTE_HOST}`;
  }
}
