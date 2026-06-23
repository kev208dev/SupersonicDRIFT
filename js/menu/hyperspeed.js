// Hyperspeed — three.js 곡선형 네온 도로 배경 (Supersonic Drift 디자인).
// 스트릭 + 사이드 스틱 + 센터라인 dash + curveX() 카메라 추종 + boost() 가속.

import * as THREE from 'three';

export class Hyperspeed {
  constructor(el) {
    this.el = el;
    this.speed = 1;
    this.speedTarget = 1;
    this.fov = 90;
    this.fovTarget = 90;
    this.time = 0;
    this.disposed = false;
  }
  curveX(z) {
    return Math.sin(z * 0.0085 + this.time * 0.8) * 7
         + Math.sin(z * 0.022  - this.time * 0.5) * 4;
  }
  start() {
    const w = this.el.clientWidth || window.innerWidth;
    const h = this.el.clientHeight || window.innerHeight;
    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.Fog(0x05060a, 40, 340);
    this.camera = new THREE.PerspectiveCamera(this.fov, w / h, 0.1, 1000);
    this.camera.position.set(0, 7, 14);
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    this.renderer.setSize(w, h);
    this.renderer.setClearColor(0x000000, 0);
    this.el.appendChild(this.renderer.domElement);

    const road = new THREE.Mesh(
      new THREE.PlaneGeometry(34, 920),
      new THREE.MeshBasicMaterial({ color: 0x080a12 }),
    );
    road.rotation.x = -Math.PI / 2;
    road.position.z = -430;
    this.scene.add(road);

    const Lcol = [0xD856BF, 0x9b5cff, 0xff5cc8];
    const Rcol = [0x28e0ff, 0x0E5EA5, 0x4ad9ff];
    const FAR = -760;

    this.streaks = [];
    for (let i = 0; i < 150; i++) {
      const right = i % 2 === 0;
      const len = 10 + Math.random() * 46;
      const rad = 0.06 + Math.random() * 0.09;
      const col = (right ? Rcol : Lcol)[Math.floor(Math.random() * 3)];
      const mat = new THREE.MeshBasicMaterial({
        color: col, transparent: true, opacity: 0.92,
        blending: THREE.AdditiveBlending, depthWrite: false,
      });
      const m = new THREE.Mesh(new THREE.BoxGeometry(rad * 2, rad * 2, len), mat);
      const lane = (right ? 1 : -1) * (2.2 + Math.random() * 10);
      m.position.set(lane, 0.5 + Math.random() * 2.6, FAR * Math.random());
      m.userData = { v: 90 + Math.random() * 150, lane };
      this.scene.add(m);
      this.streaks.push(m);
    }

    this.dashes = [];
    for (let i = 0; i < 40; i++) {
      const mat = new THREE.MeshBasicMaterial({
        color: 0x9af0ff, transparent: true, opacity: 0.85,
        blending: THREE.AdditiveBlending, depthWrite: false,
      });
      const d = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.06, 9), mat);
      d.position.set(0, 0.06, FAR * (i / 40));
      d.userData = { v: 150 };
      this.scene.add(d);
      this.dashes.push(d);
    }

    this.sticks = [];
    const Scol = [0x28e0ff, 0xff5cc8];
    for (let i = 0; i < 28; i++) {
      const left = i % 2 === 0;
      const col = Scol[Math.floor(Math.random() * 2)];
      const mat = new THREE.MeshBasicMaterial({
        color: col, transparent: true, opacity: 0.95,
        blending: THREE.AdditiveBlending, depthWrite: false,
      });
      const s = new THREE.Mesh(new THREE.BoxGeometry(0.32, 1.4 + Math.random() * 0.9, 0.32), mat);
      const side = left ? -1 : 1;
      s.position.set(side * 15, 1.2, FAR * Math.random());
      s.userData = { v: 120 + Math.random() * 80, side, edge: 15 };
      this.scene.add(s);
      this.sticks.push(s);
    }

    this._last = performance.now();
    this._tick = this._tick.bind(this);
    this._raf = requestAnimationFrame(this._tick);
  }
  boost(on) {
    this.speedTarget = on ? 4.4 : 1;
    this.fovTarget = on ? 134 : 90;
  }
  resize() {
    if (!this.renderer) return;
    const w = this.el.clientWidth || window.innerWidth;
    const h = this.el.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }
  _tick() {
    if (this.disposed) return;
    const now = performance.now();
    let dt = (now - this._last) / 1000;
    this._last = now;
    if (dt > 0.05) dt = 0.05;
    this.speed += (this.speedTarget - this.speed) * Math.min(1, dt * 4);
    this.fov   += (this.fovTarget   - this.fov)   * Math.min(1, dt * 4);
    this.time  += dt * (0.6 + this.speed * 0.18);
    this.camera.fov = this.fov;
    this.camera.position.x += (this.curveX(-6) * 0.28 - this.camera.position.x) * Math.min(1, dt * 3);
    this.camera.lookAt(this.curveX(-170), 4, -170);
    this.camera.updateProjectionMatrix();
    const recycle = (m) => { m.position.z = -760 - Math.random() * 60; };
    for (const m of this.streaks) {
      m.position.z += m.userData.v * this.speed * dt;
      if (m.position.z > 24) recycle(m);
      m.position.x = m.userData.lane + this.curveX(m.position.z);
    }
    for (const d of this.dashes) {
      d.position.z += d.userData.v * this.speed * dt;
      if (d.position.z > 24) recycle(d);
      d.position.x = this.curveX(d.position.z);
    }
    for (const s of this.sticks) {
      s.position.z += s.userData.v * this.speed * dt;
      if (s.position.z > 24) recycle(s);
      s.position.x = s.userData.side * s.userData.edge + this.curveX(s.position.z);
    }
    this.renderer.render(this.scene, this.camera);
    this._raf = requestAnimationFrame(this._tick);
  }
  dispose() {
    this.disposed = true;
    if (this._raf) cancelAnimationFrame(this._raf);
    if (this.renderer) {
      this.renderer.dispose();
      const dom = this.renderer.domElement;
      if (dom && dom.parentNode) dom.parentNode.removeChild(dom);
    }
  }
}
