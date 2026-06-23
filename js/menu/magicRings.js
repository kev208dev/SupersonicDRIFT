// MagicRings — React → 바닐라 포팅. three.js ShaderMaterial 기반.
// 사용: const rings = new MagicRings(containerEl, opts); rings.dispose();

import * as THREE from 'three';

const VERT = `
void main() {
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const FRAG = `
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

const DEFAULTS = {
  color: '#fc42ff', colorTwo: '#42fcff',
  speed: 1, ringCount: 6, attenuation: 10, lineThickness: 2,
  baseRadius: 0.35, radiusStep: 0.1, scaleRate: 0.1,
  opacity: 1, blur: 0, noiseAmount: 0.1, rotation: 0, ringGap: 1.5,
  fadeIn: 0.7, fadeOut: 0.5,
  followMouse: false, mouseInfluence: 0.2,
  hoverScale: 1.2, parallax: 0.05, clickBurst: false,
};

export class MagicRings {
  constructor(mount, opts = {}) {
    this.mount = mount;
    this.p = { ...DEFAULTS, ...opts };
    this.mouse = [0, 0];
    this.smoothMouse = [0, 0];
    this.hoverAmount = 0;
    this.isHovered = false;
    this.burst = 0;
    this.disposed = false;

    let renderer;
    try {
      renderer = new THREE.WebGLRenderer({ alpha: true });
    } catch {
      console.warn('[MagicRings] WebGL init failed');
      return;
    }
    this.renderer = renderer;
    renderer.setClearColor(0x000000, 0);
    mount.appendChild(renderer.domElement);

    this.scene = new THREE.Scene();
    this.camera = new THREE.OrthographicCamera(-0.5, 0.5, 0.5, -0.5, 0.1, 10);
    this.camera.position.z = 1;

    this.uniforms = {
      uTime:           { value: 0 },
      uAttenuation:    { value: 0 },
      uResolution:     { value: new THREE.Vector2() },
      uColor:          { value: new THREE.Color() },
      uColorTwo:       { value: new THREE.Color() },
      uLineThickness:  { value: 0 },
      uBaseRadius:     { value: 0 },
      uRadiusStep:     { value: 0 },
      uScaleRate:      { value: 0 },
      uRingCount:      { value: 0 },
      uOpacity:        { value: 1 },
      uNoiseAmount:    { value: 0 },
      uRotation:       { value: 0 },
      uRingGap:        { value: 1.6 },
      uFadeIn:         { value: 0.5 },
      uFadeOut:        { value: 0.75 },
      uMouse:          { value: new THREE.Vector2() },
      uMouseInfluence: { value: 0 },
      uHoverAmount:    { value: 0 },
      uHoverScale:     { value: 1 },
      uParallax:       { value: 0 },
      uBurst:          { value: 0 },
    };

    this.material = new THREE.ShaderMaterial({
      vertexShader: VERT, fragmentShader: FRAG,
      uniforms: this.uniforms, transparent: true,
    });
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), this.material);
    this.scene.add(this.quad);

    this._resize = this._resize.bind(this);
    this._onMouseMove = this._onMouseMove.bind(this);
    this._onMouseEnter = this._onMouseEnter.bind(this);
    this._onMouseLeave = this._onMouseLeave.bind(this);
    this._onClick = this._onClick.bind(this);

    this._resize();
    window.addEventListener('resize', this._resize);
    this._ro = new ResizeObserver(this._resize);
    this._ro.observe(mount);

    mount.addEventListener('mousemove', this._onMouseMove);
    mount.addEventListener('mouseenter', this._onMouseEnter);
    mount.addEventListener('mouseleave', this._onMouseLeave);
    mount.addEventListener('click', this._onClick);

    if (this.p.blur > 0) mount.style.filter = `blur(${this.p.blur}px)`;

    this._animate = this._animate.bind(this);
    this._raf = requestAnimationFrame(this._animate);
  }

  setProps(opts) {
    Object.assign(this.p, opts);
    if (opts.blur != null && this.mount) {
      this.mount.style.filter = opts.blur > 0 ? `blur(${opts.blur}px)` : '';
    }
  }

  _resize() {
    if (!this.renderer || !this.mount) return;
    const w = this.mount.clientWidth || 1;
    const h = this.mount.clientHeight || 1;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.renderer.setSize(w, h);
    this.renderer.setPixelRatio(dpr);
    this.uniforms.uResolution.value.set(w * dpr, h * dpr);
  }

  _onMouseMove(e) {
    const r = this.mount.getBoundingClientRect();
    this.mouse[0] = (e.clientX - r.left) / r.width - 0.5;
    this.mouse[1] = -((e.clientY - r.top) / r.height - 0.5);
  }
  _onMouseEnter() { this.isHovered = true; }
  _onMouseLeave() {
    this.isHovered = false;
    this.mouse[0] = 0; this.mouse[1] = 0;
  }
  _onClick() { this.burst = 1; }

  _animate(t) {
    if (this.disposed) return;
    this._raf = requestAnimationFrame(this._animate);
    const p = this.p;
    this.smoothMouse[0] += (this.mouse[0] - this.smoothMouse[0]) * 0.08;
    this.smoothMouse[1] += (this.mouse[1] - this.smoothMouse[1]) * 0.08;
    this.hoverAmount   += ((this.isHovered ? 1 : 0) - this.hoverAmount) * 0.08;
    this.burst *= 0.95;
    if (this.burst < 0.001) this.burst = 0;

    const u = this.uniforms;
    u.uTime.value           = t * 0.001 * p.speed;
    u.uAttenuation.value    = p.attenuation;
    u.uColor.value.set(p.color);
    u.uColorTwo.value.set(p.colorTwo);
    u.uLineThickness.value  = p.lineThickness;
    u.uBaseRadius.value     = p.baseRadius;
    u.uRadiusStep.value     = p.radiusStep;
    u.uScaleRate.value      = p.scaleRate;
    u.uRingCount.value      = p.ringCount;
    u.uOpacity.value        = p.opacity;
    u.uNoiseAmount.value    = p.noiseAmount;
    u.uRotation.value       = (p.rotation * Math.PI) / 180;
    u.uRingGap.value        = p.ringGap;
    u.uFadeIn.value         = p.fadeIn;
    u.uFadeOut.value        = p.fadeOut;
    u.uMouse.value.set(this.smoothMouse[0], this.smoothMouse[1]);
    u.uMouseInfluence.value = p.followMouse ? p.mouseInfluence : 0;
    u.uHoverAmount.value    = this.hoverAmount;
    u.uHoverScale.value     = p.hoverScale;
    u.uParallax.value       = p.parallax;
    u.uBurst.value          = p.clickBurst ? this.burst : 0;

    this.renderer.render(this.scene, this.camera);
  }

  dispose() {
    this.disposed = true;
    if (this._raf) cancelAnimationFrame(this._raf);
    window.removeEventListener('resize', this._resize);
    if (this._ro) this._ro.disconnect();
    if (this.mount) {
      this.mount.removeEventListener('mousemove', this._onMouseMove);
      this.mount.removeEventListener('mouseenter', this._onMouseEnter);
      this.mount.removeEventListener('mouseleave', this._onMouseLeave);
      this.mount.removeEventListener('click', this._onClick);
    }
    if (this.renderer) {
      const dom = this.renderer.domElement;
      if (dom && dom.parentNode) dom.parentNode.removeChild(dom);
      this.renderer.dispose();
    }
    if (this.material) this.material.dispose();
  }
}
