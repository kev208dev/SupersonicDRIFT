import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// 두 GLB 카트 — id → 파일.
const KART_URLS = {
  kart_a: 'assets/cars/kart_a.glb',
  kart_b: 'assets/cars/kart_b.glb',
};

const _loaded = {};    // id → THREE.Group (정규화된 원본)
const _loading = {};   // id → Promise

export function preloadKartMeshes() {
  return Promise.all(Object.keys(KART_URLS).map(id => _loadOne(id)));
}

function _loadOne(id) {
  if (_loaded[id]) return Promise.resolve(_loaded[id]);
  if (_loading[id]) return _loading[id];
  const loader = new GLTFLoader();
  _loading[id] = new Promise((resolve, reject) => {
    loader.load(KART_URLS[id], gltf => {
      _loaded[id] = gltf.scene;
      _normalize(_loaded[id]);
      let meshCount = 0;
      _loaded[id].traverse(c => { if (c.isMesh) meshCount++; });
      console.log(`[kart] loaded ${id}: ${meshCount} mesh(es)`);
      resolve(_loaded[id]);
    }, undefined, err => {
      console.warn(`[kart] FAILED ${id}:`, err);
      reject(err);
    });
  });
  return _loading[id];
}

// 카트 그룹 복제본 + 휠 메시 배열 반환. 로드 전이면 null.
export function getKartMesh(id) {
  const src = _loaded[id];
  if (!src) return null;
  const root = src.clone(true);
  const wheels = _detectWheels(root);
  return { root, wheels };
}

export function listKartIds() {
  return Object.keys(KART_URLS);
}

function _normalize(scene) {
  // 1) 최대축이 TARGET_MAX 가 되도록 scale.
  const TARGET_MAX = 3.6;
  const box0 = new THREE.Box3().setFromObject(scene);
  const size0 = new THREE.Vector3();
  box0.getSize(size0);
  const maxDim = Math.max(size0.x, size0.y, size0.z) || 1;
  scene.scale.multiplyScalar(TARGET_MAX / maxDim);
  scene.updateMatrixWorld(true);

  // 2) scaled 상태로 재측정 → 바닥 y=0, x/z 중심 0.
  const box = new THREE.Box3().setFromObject(scene);
  const center = new THREE.Vector3();
  box.getCenter(center);
  scene.position.x -= center.x;
  scene.position.z -= center.z;
  scene.position.y -= box.min.y;

  scene.traverse(c => {
    if (c.isMesh) {
      c.castShadow = true;
      c.receiveShadow = false;
    }
  });
}

// 휠 감지: 이름 매치(wheel|tire|tyre|rim)만. 매치 부족 시 휠 회전 ❌ (차체 통회전 방지).
// 반환: [{ pivot: Group, axis: 'x'|'y'|'z', front: bool, side: -1|1 }]
function _detectWheels(root) {
  const named = [];
  root.traverse(c => {
    if (!c.isMesh) return;
    const n = (c.name || '').toLowerCase();
    if (n.includes('wheel') || n.includes('tire') || n.includes('tyre') || n.includes('rim')) {
      named.push(c);
    }
  });
  // 이름 매치 < 2 이면 휴리스틱 사용 ❌ — 단일 메시 GLB가 통째로 돌아가는 버그 방지.
  if (named.length < 2) {
    console.log(`[kart] wheel detect: only ${named.length} named match → skip spin`);
    return [];
  }
  const picks = named;

  // 각 휠을 pivot Group으로 감싸기: pivot이 휠 중심에 위치 → mesh는 pivot-local 0,0,0.
  const wheels = [];
  for (const mesh of picks) {
    const b = new THREE.Box3().setFromObject(mesh);
    const center = b.getCenter(new THREE.Vector3());
    const size = b.getSize(new THREE.Vector3());
    // 가장 짧은 축을 축(axle)로 추정 (실린더 가정).
    let axis = 'x';
    const minDim = Math.min(size.x, size.y, size.z);
    if (minDim === size.x) axis = 'x';
    else if (minDim === size.y) axis = 'y';
    else axis = 'z';

    // pivot Group을 mesh의 parent 위치(world)에 추가, mesh를 pivot child로.
    const pivot = new THREE.Group();
    pivot.name = mesh.name + '_pivot';
    const parent = mesh.parent || root;
    // mesh world → parent local 변환은 단순화: mesh 그대로 두고 회전만 pivot에 거는 대신
    // pivot을 mesh로 swap.
    parent.add(pivot);
    pivot.position.copy(mesh.position);
    pivot.rotation.copy(mesh.rotation);
    pivot.scale.copy(mesh.scale);
    parent.remove(mesh);
    mesh.position.set(0, 0, 0);
    mesh.rotation.set(0, 0, 0);
    mesh.scale.set(1, 1, 1);
    pivot.add(mesh);

    // x 좌표(or z 좌표) 부호로 front/side 추정.
    // 카트 forward = local +x (car.js에서 model.rotation.y=π/2 적용 후).
    const front = center.x > 0;
    const side  = center.z >= 0 ? 1 : -1;
    wheels.push({ pivot, axis, front, side, _centerLocal: center.clone() });
  }
  return wheels;
}
