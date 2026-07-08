// MagicRings — 바닐라 JS 포팅 (원본: React Bits MagicRings).
// React 불필요. 기존 Three.js 사용. SUPERSONIC DRIFT 카운트다운 링 연출용.
// 셰이더는 원본과 100% 동일 — 네가 튜닝한 룩 그대로 나옴.
import * as THREE from 'three';

const vertexShader = `
void main() {
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const fragmentShader = `
precision highp float;

uniform float uTime, uAttenuation, uLineThickness;
uniform float uBaseRadius, uRadiusStep, uScaleRate;
uniform float uOpacity, uNoiseAmount, uRotation, uRingGap;
uniform float uFadeIn, uFadeOut;
uniform float uMouseInfluence, uHoverAmount, uHoverScale, uParallax, uBurst;
uniform vec2 uResolution, uMouse;
uniform vec3 uColor, uColorTwo;
uniform int uRingCount;

const float HP = 1.5707963;
const float CYCLE = 3.45;

float fade(float t) {
  return t < uFadeIn ? smoothstep(0.0, uFadeIn, t) : 1.0 - smoothstep(uFadeOut, CYCLE - 0.2, t);
}

float ring(vec2 p, float ri, float cut, float t0, float px) {
  float t = mod(uTime + t0, CYCLE);
  float r = ri + t / CYCLE * uScaleRate;
  float d = abs(length(p) - r);
  float a = atan(abs(p.y), abs(p.x)) / HP;
  float th = max(1.0 - a, 0.5) * px * uLineThickness;
  float h = (1.0 - smoothstep(th, th * 1.5, d)) + 1.0;
  d += pow(cut * a, 3.0) * r;
  return h * exp(-uAttenuation * d) * fade(t);
}

void main() {
  float px = 1.0 / min(uResolution.x, uResolution.y);
  vec2 p = (gl_FragCoord.xy - 0.5 * uResolution.xy) * px;
  float cr = cos(uRotation), sr = sin(uRotation);
  p = mat2(cr, -sr, sr, cr) * p;
  p -= uMouse * uMouseInfluence;
  float sc = mix(1.0, uHoverScale, uHoverAmount) + uBurst * 0.3;
  p /= sc;
  vec3 c = vec3(0.0);
  float rcf = max(float(uRingCount) - 1.0, 1.0);
  for (int i = 0; i < 10; i++) {
    if (i >= uRingCount) break;
    float fi = float(i);
    vec2 pr = p - fi * uParallax * uMouse;
    vec3 rc = mix(uColor, uColorTwo, fi / rcf);
    c = mix(c, rc, vec3(ring(pr, uBaseRadius + fi * uRadiusStep, pow(uRingGap, fi), i == 0 ? 0.0 : 2.95 * fi, px)));
  }
  c *= 1.0 + uBurst * 2.0;
  float n = fract(sin(dot(gl_FragCoord.xy + uTime * 100.0, vec2(12.9898, 78.233))) * 43758.5453);
  c += (n - 0.5) * uNoiseAmount;
  gl_FragColor = vec4(c, max(c.r, max(c.g, c.b)) * uOpacity);
}
`;

// 네가 React Bits에서 튜닝한 값 = 기본값
const DEFAULTS = {
  color: '#ff2100', colorTwo: '#ffe900', speed: 1.4, ringCount: 6,
  attenuation: 13.5, lineThickness: 3, baseRadius: 0.26, radiusStep: 0.11,
  scaleRate: 0.08, opacity: 1, blur: 0, noiseAmount: 0.1, rotation: 180,
  ringGap: 1.7, fadeIn: 0.35, fadeOut: 0.5, followMouse: false,
  mouseInfluence: 0.25, hoverScale: 1.2, parallax: 0.07, clickBurst: false,
};

export function createMagicRings(mount, options = {}) {
  const cfg = { ...DEFAULTS, ...options };

  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({
      alpha: true,
      premultipliedAlpha: true,
      preserveDrawingBuffer: false,
      antialias: false,
    });
  } catch (e) {
    return null;
  }
  if (!renderer.capabilities.isWebGL2) {
    renderer.dispose();
    return null;
  }
  renderer.autoClear = true;
  renderer.setClearColor(0x000000, 0);

  // 기존 magic-rings 캔버스가 같은 mount에 남아있으면 중복 마운트 방지 — 강제 제거.
  mount.querySelectorAll('canvas[data-magic-rings="1"]').forEach((c) => c.remove());

  const dom = renderer.domElement;
  dom.dataset.magicRings = '1';
  dom.style.width = '100%';
  dom.style.height = '100%';
  dom.style.display = 'block';
  // 부드러운 페이드 인 — 캔버스 자체 opacity transition (셰이더 fadeIn과 별도).
  dom.style.opacity = '0';
  dom.style.transition = 'opacity 300ms ease-out';
  if (cfg.blur > 0) dom.style.filter = `blur(${cfg.blur}px)`;
  mount.appendChild(dom);
  requestAnimationFrame(() => {
    requestAnimationFrame(() => { dom.style.opacity = '1'; });
  });

  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-0.5, 0.5, 0.5, -0.5, 0.1, 10);
  camera.position.z = 1;

  const uniforms = {
    uTime: { value: 0 }, uAttenuation: { value: 0 },
    uResolution: { value: new THREE.Vector2() },
    uColor: { value: new THREE.Color() }, uColorTwo: { value: new THREE.Color() },
    uLineThickness: { value: 0 }, uBaseRadius: { value: 0 }, uRadiusStep: { value: 0 },
    uScaleRate: { value: 0 }, uRingCount: { value: 0 }, uOpacity: { value: 1 },
    uNoiseAmount: { value: 0 }, uRotation: { value: 0 }, uRingGap: { value: 1.6 },
    uFadeIn: { value: 0.5 }, uFadeOut: { value: 0.75 }, uMouse: { value: new THREE.Vector2() },
    uMouseInfluence: { value: 0 }, uHoverAmount: { value: 0 }, uHoverScale: { value: 1 },
    uParallax: { value: 0 }, uBurst: { value: 0 },
  };

  const material = new THREE.ShaderMaterial({ vertexShader, fragmentShader, uniforms, transparent: true });
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), material);
  scene.add(quad);

  const mouse = [0, 0], smoothMouse = [0, 0];
  let hoverAmount = 0, isHovered = false, burst = 0;

  const resize = () => {
    const w = mount.clientWidth, h = mount.clientHeight;
    const dpr = Math.min(window.devicePixelRatio, 2);
    renderer.setSize(w, h);
    renderer.setPixelRatio(dpr);
    uniforms.uResolution.value.set(w * dpr, h * dpr);
  };
  resize();
  window.addEventListener('resize', resize);
  const ro = new ResizeObserver(resize);
  ro.observe(mount);

  const onMove = (e) => {
    const r = mount.getBoundingClientRect();
    mouse[0] = (e.clientX - r.left) / r.width - 0.5;
    mouse[1] = -((e.clientY - r.top) / r.height - 0.5);
  };
  const onEnter = () => { isHovered = true; };
  const onLeave = () => { isHovered = false; mouse[0] = 0; mouse[1] = 0; };
  const onClick = () => { burst = 1; };
  if (cfg.followMouse) {
    mount.addEventListener('mousemove', onMove);
    mount.addEventListener('mouseenter', onEnter);
    mount.addEventListener('mouseleave', onLeave);
  }
  if (cfg.clickBurst) mount.addEventListener('click', onClick);

  let frameId;
  const animate = (t) => {
    frameId = requestAnimationFrame(animate);
    smoothMouse[0] += (mouse[0] - smoothMouse[0]) * 0.08;
    smoothMouse[1] += (mouse[1] - smoothMouse[1]) * 0.08;
    hoverAmount += ((isHovered ? 1 : 0) - hoverAmount) * 0.08;
    burst *= 0.95;
    if (burst < 0.001) burst = 0;

    uniforms.uTime.value = t * 0.001 * cfg.speed;
    uniforms.uAttenuation.value = cfg.attenuation;
    uniforms.uColor.value.set(cfg.color);
    uniforms.uColorTwo.value.set(cfg.colorTwo);
    uniforms.uLineThickness.value = cfg.lineThickness;
    uniforms.uBaseRadius.value = cfg.baseRadius;
    uniforms.uRadiusStep.value = cfg.radiusStep;
    uniforms.uScaleRate.value = cfg.scaleRate;
    uniforms.uRingCount.value = cfg.ringCount;
    uniforms.uOpacity.value = cfg.opacity;
    uniforms.uNoiseAmount.value = cfg.noiseAmount;
    uniforms.uRotation.value = (cfg.rotation * Math.PI) / 180;
    uniforms.uRingGap.value = cfg.ringGap;
    uniforms.uFadeIn.value = cfg.fadeIn;
    uniforms.uFadeOut.value = cfg.fadeOut;
    uniforms.uMouse.value.set(smoothMouse[0], smoothMouse[1]);
    uniforms.uMouseInfluence.value = cfg.followMouse ? cfg.mouseInfluence : 0;
    uniforms.uHoverAmount.value = hoverAmount;
    uniforms.uHoverScale.value = cfg.hoverScale;
    uniforms.uParallax.value = cfg.parallax;
    uniforms.uBurst.value = burst;

    renderer.render(scene, camera);
  };
  frameId = requestAnimationFrame(animate);

  return {
    el: renderer.domElement,
    set(next) { Object.assign(cfg, next); },        // 실시간 prop 변경
    pulse(strength = 1) { burst = strength; },        // 3/2/1 박자 플래시(가운데서 확)
    flash() { burst = 2.2; },                         // START 강한 점등
    dispose() {
      cancelAnimationFrame(frameId);
      window.removeEventListener('resize', resize);
      ro.disconnect();
      mount.removeEventListener('mousemove', onMove);
      mount.removeEventListener('mouseenter', onEnter);
      mount.removeEventListener('mouseleave', onLeave);
      mount.removeEventListener('click', onClick);
      if (renderer.domElement.parentNode === mount) mount.removeChild(renderer.domElement);
      quad.geometry.dispose();
      material.dispose();
      renderer.dispose();
    },
  };
}

export default createMagicRings;
