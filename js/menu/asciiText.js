// ASCIIText — React Bits 컴포넌트 1:1 바닐라 포팅.
// 핵심: pre = 라디얼 그라데이션 text-fill + mix-blend-mode difference.
//       canvas = 100%×100% 픽셀화 스트레치 (둘 다 보임, 겹쳐서 효과).

import * as THREE from 'three';

const VERT = `
varying vec2 vUv;
uniform float uTime;
uniform float mouse;
uniform float uEnableWaves;

void main() {
  vUv = uv;
  float time = uTime * 5.;
  float waveFactor = uEnableWaves;
  vec3 transformed = position;
  transformed.x += sin(time + position.y) * 0.5 * waveFactor;
  transformed.y += cos(time + position.z) * 0.15 * waveFactor;
  transformed.z += sin(time + position.x) * waveFactor;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(transformed, 1.0);
}
`;

const FRAG = `
varying vec2 vUv;
uniform float mouse;
uniform float uTime;
uniform sampler2D uTexture;

void main() {
  float time = uTime;
  vec2 pos = vUv;
  float r = texture2D(uTexture, pos + cos(time * 2. - time + pos.x) * .01).r;
  float g = texture2D(uTexture, pos + tan(time * .5 + pos.x - time) * .01).g;
  float b = texture2D(uTexture, pos - cos(time * 2. + time + pos.y) * .01).b;
  float a = texture2D(uTexture, pos).a;
  gl_FragColor = vec4(r, g, b, a);
}
`;

const PX_RATIO = typeof window !== 'undefined' ? (window.devicePixelRatio || 1) : 1;
const _map = (n, a, b, c, d) => ((n - a) / (b - a)) * (d - c) + c;

let _styleInjected = false;
function _injectStyles() {
  if (_styleInjected) return;
  _styleInjected = true;
  const s = document.createElement('style');
  s.textContent = `
    .ascii-text-container canvas {
      position: absolute;
      left: 0; top: 0;
      width: 100%; height: 100%;
      image-rendering: optimizeSpeed;
      image-rendering: -moz-crisp-edges;
      image-rendering: -o-crisp-edges;
      image-rendering: -webkit-optimize-contrast;
      image-rendering: optimize-contrast;
      image-rendering: crisp-edges;
      image-rendering: pixelated;
    }
    .ascii-text-container pre {
      margin: 0;
      user-select: none;
      padding: 0;
      line-height: 1em;
      text-align: left;
      position: absolute;
      left: 0; top: 0;
      background-image: radial-gradient(circle, #ff6188 0%, #fc9867 50%, #ffd866 100%);
      background-attachment: fixed;
      -webkit-text-fill-color: transparent;
      -webkit-background-clip: text;
              background-clip: text;
      z-index: 9;
      mix-blend-mode: difference;
    }
  `;
  document.head.appendChild(s);
}

class AsciiFilter {
  constructor(renderer, { fontSize, fontFamily, charset, invert } = {}) {
    this.renderer = renderer;
    this.domElement = document.createElement('div');
    Object.assign(this.domElement.style, {
      position: 'absolute', top: '0', left: '0', width: '100%', height: '100%',
    });
    this.pre = document.createElement('pre');
    this.domElement.appendChild(this.pre);
    this.canvas = document.createElement('canvas');
    this.context = this.canvas.getContext('2d');
    this.domElement.appendChild(this.canvas);

    this.deg = 0;
    this.invert = invert ?? true;
    this.fontSize = fontSize ?? 12;
    this.fontFamily = fontFamily ?? "'Courier New', monospace";
    this.charset = charset ?? ` .'\`^",:;Il!i~+_-?][}{1)(|/tfjrxnuvczXYUJCLQ0OZmwqpdbkhao*#MW&8%B@$`;

    this.context.imageSmoothingEnabled = false;
    this.onMouseMove = this.onMouseMove.bind(this);
    document.addEventListener('mousemove', this.onMouseMove);
  }

  setSize(width, height) {
    this.width = width;
    this.height = height;
    this.renderer.setSize(width, height);
    this.reset();
    this.center = { x: width / 2, y: height / 2 };
    this.mouse = { x: this.center.x, y: this.center.y };
  }

  reset() {
    this.context.font = `${this.fontSize}px ${this.fontFamily}`;
    const charWidth = this.context.measureText('A').width;
    this.cols = Math.floor(this.width / (this.fontSize * (charWidth / this.fontSize)));
    this.rows = Math.floor(this.height / this.fontSize);
    this.canvas.width = this.cols;
    this.canvas.height = this.rows;
    Object.assign(this.pre.style, {
      fontFamily: this.fontFamily,
      fontSize: `${this.fontSize}px`,
    });
  }

  render(scene, camera) {
    this.renderer.render(scene, camera);
    const w = this.canvas.width, h = this.canvas.height;
    this.context.clearRect(0, 0, w, h);
    if (this.context && w && h) {
      this.context.drawImage(this.renderer.domElement, 0, 0, w, h);
    }
    this.asciify(this.context, w, h);
    this.hue();
  }

  onMouseMove(e) {
    this.mouse = { x: e.clientX * PX_RATIO, y: e.clientY * PX_RATIO };
  }
  get dx() { return this.mouse.x - this.center.x; }
  get dy() { return this.mouse.y - this.center.y; }

  hue() {
    const deg = (Math.atan2(this.dy, this.dx) * 180) / Math.PI;
    this.deg += (deg - this.deg) * 0.075;
    this.domElement.style.filter = `hue-rotate(${this.deg.toFixed(1)}deg)`;
  }

  asciify(ctx, w, h) {
    if (!w || !h) return;
    const d = ctx.getImageData(0, 0, w, h).data;
    let str = '';
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = x * 4 + y * 4 * w;
        const r = d[i], g = d[i + 1], b = d[i + 2], a = d[i + 3];
        if (a === 0) { str += ' '; continue; }
        const gray = (0.3 * r + 0.6 * g + 0.1 * b) / 255;
        let idx = Math.floor((1 - gray) * (this.charset.length - 1));
        if (this.invert) idx = this.charset.length - idx - 1;
        str += this.charset[idx];
      }
      str += '\n';
    }
    this.pre.innerHTML = str;
  }

  dispose() {
    document.removeEventListener('mousemove', this.onMouseMove);
  }
}

class CanvasTxt {
  constructor(txt, { fontSize = 200, fontFamily = 'Arial', color = '#fdf9f3' } = {}) {
    this.canvas = document.createElement('canvas');
    this.context = this.canvas.getContext('2d');
    this.lines = String(txt).split('\n');
    this.fontSize = fontSize;
    this.fontFamily = fontFamily;
    this.color = color;
    this.font = `600 ${this.fontSize}px ${this.fontFamily}`;
  }

  resize() {
    this.context.font = this.font;
    let maxW = 0;
    let totalH = 0;
    const lineHs = [];
    for (const l of this.lines) {
      const m = this.context.measureText(l);
      maxW = Math.max(maxW, m.width);
      const h = (m.actualBoundingBoxAscent || this.fontSize * 0.75)
              + (m.actualBoundingBoxDescent || this.fontSize * 0.25);
      lineHs.push(h);
      totalH += h;
    }
    this._lineHs = lineHs;
    this.canvas.width = Math.ceil(maxW) + 20;
    this.canvas.height = Math.ceil(totalH) + 20;
  }

  render() {
    const ctx = this.context;
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.fillStyle = this.color;
    ctx.font = this.font;
    let y = 10;
    for (let i = 0; i < this.lines.length; i++) {
      const lh = this._lineHs[i];
      const m = ctx.measureText(this.lines[i]);
      const ascent = m.actualBoundingBoxAscent || this.fontSize * 0.75;
      const x = (this.canvas.width - m.width) / 2;
      ctx.fillText(this.lines[i], x, y + ascent);
      y += lh;
    }
  }

  get width() { return this.canvas.width; }
  get height() { return this.canvas.height; }
  get texture() { return this.canvas; }
}

export class CanvAscii {
  constructor({ text, asciiFontSize, textFontSize, textColor, planeBaseHeight, enableWaves }, container, width, height) {
    this.textString = text;
    this.asciiFontSize = asciiFontSize;
    this.textFontSize = textFontSize;
    this.textColor = textColor;
    this.planeBaseHeight = planeBaseHeight;
    this.container = container;
    this.width = width; this.height = height;
    this.enableWaves = enableWaves;
    this.camera = new THREE.PerspectiveCamera(45, this.width / this.height, 1, 1000);
    this.camera.position.z = 30;
    this.scene = new THREE.Scene();
    this.mouse = { x: this.width / 2, y: this.height / 2 };
    this.onMouseMove = this.onMouseMove.bind(this);
    _injectStyles();
  }

  async init() {
    try {
      await document.fonts.load('600 200px "IBM Plex Mono"');
      await document.fonts.load('500 12px "IBM Plex Mono"');
    } catch (e) {}
    await document.fonts.ready;
    this.setMesh();
    this.setRenderer();
  }

  setMesh() {
    this.textCanvas = new CanvasTxt(this.textString, {
      fontSize: this.textFontSize,
      fontFamily: 'IBM Plex Mono',
      color: this.textColor,
    });
    this.textCanvas.resize();
    this.textCanvas.render();
    this.texture = new THREE.CanvasTexture(this.textCanvas.texture);
    this.texture.minFilter = THREE.NearestFilter;
    const aspect = this.textCanvas.width / this.textCanvas.height;
    // 카메라 프러스텀 자동맞춤 — 글자가 화면 꽉 채우게.
    const dist = this.camera.position.z;
    const vH = 2 * dist * Math.tan((this.camera.fov * Math.PI / 180) / 2);
    const vW = vH * (this.width / this.height);
    const planeH = Math.min(vH * 0.95, (vW * 0.95) / aspect);
    const planeW = planeH * aspect;
    this.geometry = new THREE.PlaneGeometry(planeW, planeH, 48, 32);
    this.material = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      uniforms: {
        uTime: { value: 0 },
        mouse: { value: 1.0 },
        uTexture: { value: this.texture },
        uEnableWaves: { value: this.enableWaves ? 1.0 : 0.0 },
      },
    });
    this.mesh = new THREE.Mesh(this.geometry, this.material);
    this.scene.add(this.mesh);
  }

  setRenderer() {
    this.renderer = new THREE.WebGLRenderer({ antialias: false, alpha: true });
    this.renderer.setPixelRatio(1);
    this.renderer.setClearColor(0x000000, 0);
    this.filter = new AsciiFilter(this.renderer, {
      fontFamily: 'IBM Plex Mono',
      fontSize: this.asciiFontSize,
      invert: true,
    });
    this.container.appendChild(this.filter.domElement);
    this.setSize(this.width, this.height);
    this.container.addEventListener('mousemove', this.onMouseMove);
    this.container.addEventListener('touchmove', this.onMouseMove);
  }

  setSize(w, h) {
    this.width = w; this.height = h;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.filter.setSize(w, h);
    this.center = { x: w / 2, y: h / 2 };
  }

  load() { this.animate(); }

  onMouseMove(evt) {
    const e = evt.touches ? evt.touches[0] : evt;
    const b = this.container.getBoundingClientRect();
    this.mouse = { x: e.clientX - b.left, y: e.clientY - b.top };
  }

  animate() {
    const f = () => { this.animationFrameId = requestAnimationFrame(f); this.render(); };
    f();
  }

  render() {
    const t = Date.now() * 0.001;
    this.textCanvas.render();
    this.texture.needsUpdate = true;
    this.mesh.material.uniforms.uTime.value = Math.sin(t);
    const x = _map(this.mouse.y, 0, this.height, 0.5, -0.5);
    const y = _map(this.mouse.x, 0, this.width, -0.5, 0.5);
    this.mesh.rotation.x += (x - this.mesh.rotation.x) * 0.05;
    this.mesh.rotation.y += (y - this.mesh.rotation.y) * 0.05;
    this.filter.render(this.scene, this.camera);
  }

  dispose() {
    cancelAnimationFrame(this.animationFrameId);
    if (this.filter) {
      this.filter.dispose();
      if (this.filter.domElement.parentNode) {
        this.container.removeChild(this.filter.domElement);
      }
    }
    this.container.removeEventListener('mousemove', this.onMouseMove);
    this.container.removeEventListener('touchmove', this.onMouseMove);
    if (this.renderer) {
      this.renderer.dispose();
      this.renderer.forceContextLoss();
    }
  }
}
