// Env-aware API host routing.
// - Live Server (5500) or any non-3000 localhost port → redirect to node server on :3000
// - localhost:3000 / 127.0.0.1:3000 / *.fly.dev → use current host
// - other hosts (itch.io, github.io, custom domain) → remote fly app

const REMOTE_HOST = 'racinggame.fly.dev';
const LOCAL_SERVER_PORT = '3000';

function isLocal(host) {
  return host.startsWith('localhost') || host.startsWith('127.0.0.1');
}

export function getApiHost() {
  const host = window.location.host;
  if (isLocal(host)) {
    // dev: node server runs on 3000, even if page is served from Live Server :5500
    const hostname = window.location.hostname;
    return `${hostname}:${LOCAL_SERVER_PORT}`;
  }
  if (host.includes('fly.dev')) return host;
  return REMOTE_HOST;
}

export function getApiBase() {
  const host = window.location.host;
  if (isLocal(host)) {
    const hostname = window.location.hostname;
    return `http://${hostname}:${LOCAL_SERVER_PORT}`;
  }
  if (host.includes('fly.dev')) return '';
  return `https://${REMOTE_HOST}`;
}
