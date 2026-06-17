import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const URL = 'assets/cars/white_mesh.glb';

let _loaded = null;     // THREE.Group (원본)
let _loading = null;    // Promise

export function preloadWhiteMesh() {
  if (_loaded) return Promise.resolve(_loaded);
  if (_loading) return _loading;
  const loader = new GLTFLoader();
  _loading = new Promise((resolve, reject) => {
    loader.load(URL, gltf => {
      _loaded = gltf.scene;
      _normalize(_loaded);
      resolve(_loaded);
    }, undefined, reject);
  });
  return _loading;
}

export function getWhiteMeshClone() {
  if (!_loaded) return null;
  const clone = _loaded.clone(true);
  return clone;
}

// GLB의 forward축/스케일이 게임 기대와 다를 수 있어 한 번 정규화.
// car.js에서 model.rotation.y = π/2, scale 5.2 적용함 → 여기서는 단위 박스로 맞춤.
function _normalize(scene) {
  // 1) 측정 → 가장 긴 축이 TARGET 단위가 되도록 scale 먼저 적용.
  const TARGET_MAX = 3.6; // car.js scale 5.2 와 조합 → ~18 단위 카트.
  const box0 = new THREE.Box3().setFromObject(scene);
  const size0 = new THREE.Vector3();
  box0.getSize(size0);
  const maxDim = Math.max(size0.x, size0.y, size0.z) || 1;
  const k = TARGET_MAX / maxDim;
  scene.scale.multiplyScalar(k);
  scene.updateMatrixWorld(true);

  // 2) scale 적용된 상태로 다시 측정 → 정확한 ground/center 보정.
  const box = new THREE.Box3().setFromObject(scene);
  const center = new THREE.Vector3();
  box.getCenter(center);
  scene.position.x -= center.x;
  scene.position.z -= center.z;
  scene.position.y -= box.min.y;   // 바닥을 y=0 에 정렬

  scene.traverse(c => {
    if (c.isMesh) {
      c.castShadow = true;
      c.receiveShadow = false;
    }
  });
}
