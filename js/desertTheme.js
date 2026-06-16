// 사막/이집트 테마 — 양옆 수직 벽 + 길가 instanced props + 머리 위 아치.
// 모든 튜닝 상수 한 곳. 이 파일만 수정하면 룩 전체가 따라옴.

import * as THREE from 'three';

// ─── 튜닝 상수 ────────────────────────────────────────────────
export const DESERT_TUNING = {
  // ── 양옆 수직 벽 ──
  WALL_HEIGHT:       18,    // 월드 단위 (차 폭~16). "차 높이의 3-4배" 체감.
  WALL_TILT_DEG:     7,     // 안쪽으로 기울임 (위가 살짝 덮임)
  WALL_THICKNESS:    2.4,
  WALL_OFFSET:       3.0,   // 연석 바깥에서 안쪽으로 끌어당김 (벽-도로 간극)
  WALL_COLOR:        0xc9a45b, // 사암
  WALL_TOP_COLOR:    0xb38a3f, // 위쪽 약간 진하게 (그림자 느낌)
  WALL_BAND_COLOR:   0xa46c2a, // 하단 띠

  // ── 도로 폭 배율 ──
  ROAD_WIDTH_MULT:   0.78,  // 0.75~0.85 추천. 작을수록 좁고 빠른 느낌.

  // ── 길가 instanced props ──
  PROP_SPACING:      11.5,  // m, 8-15 사이
  PROP_OFFSET:       4.0,   // 벽 바깥에서 추가 오프셋
  CORNER_PROP_DENSITY: 2.2, // 코너 구간에서 spacing 분모 (촘촘하게)
  CORNER_TURN_THRESH: 0.08, // 이 이상 곡률이면 코너로 판정

  OBELISK_PROB:      0.45,
  COLUMN_PROB:       0.35,
  PALM_PROB:         0.20,
  TIRE_STACK_CORNER_PROB: 0.55,

  // ── 아치 게이트 ──
  ARCH_SPACING_SEG:  42,    // centerLine 인덱스 간격
  ARCH_HEIGHT:       28,
  ARCH_PILLAR_W:     5,
  ARCH_LINTEL_H:     6,
  ARCH_COLOR:        0xb88746,
  START_GATE_SCALE:  1.45,

  // ── 충돌 (참고용 — 실제 적용은 physics.js의 normalBleed) ──
  WALL_SLIDE_RETAIN: 0.85,  // 벽 따라 슬라이드 시 속도 유지율
};

// ─── 양옆 수직 벽 ──────────────────────────────────────────────
// outer + inner 양쪽 모두 build. 안쪽으로 WALL_TILT_DEG 기울임.
export function buildDesertWalls(track) {
  const cl = track.centerLine || [];
  if (cl.length < 3) return new THREE.Group();

  const grp = new THREE.Group();
  grp.name = 'desert-walls';
  const half = (track.width || 100) / 2;
  const offset = half + DESERT_TUNING.WALL_OFFSET;

  for (const sideSign of [+1, -1]) {
    grp.add(_buildContinuousWall(cl, offset, sideSign));
  }
  return grp;
}

function _buildContinuousWall(cl, offset, sideSign) {
  const N = cl.length;
  const H = DESERT_TUNING.WALL_HEIGHT;
  const tiltRad = (DESERT_TUNING.WALL_TILT_DEG * Math.PI) / 180;
  // top을 안쪽으로 H*tan(tilt)만큼 당김. sideSign과 반대.
  const topInward = Math.tan(tiltRad) * H;

  const verts = [];
  const indices = [];

  for (let i = 0; i < N; i++) {
    const [cx, cy] = cl[i];
    const [px, py] = _perpAt(cl, i); // unit perp
    // 바깥쪽 점 (base)
    const bx = cx + sideSign * px * offset;
    const by = cy + sideSign * py * offset;
    // 위쪽 점은 안쪽으로 topInward만큼 당김
    const tx = bx + (-sideSign) * px * topInward;
    const ty = by + (-sideSign) * py * topInward;

    // base: (bx, 0, -by), top: (tx, H, -ty)  (3D 좌표계는 y가 위, z=-y)
    verts.push(bx, 0, -by);
    verts.push(tx, H, -ty);
  }
  for (let i = 0; i < N; i++) {
    const a = i * 2;
    const b = ((i + 1) % N) * 2;
    // 안쪽이 보이는 면 (도로 쪽). winding을 sideSign에 맞춰 뒤집어줌.
    if (sideSign > 0) {
      indices.push(a, b, a + 1, b, b + 1, a + 1);
    } else {
      indices.push(b, a, a + 1, b + 1, b, a + 1);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();

  const mat = new THREE.MeshLambertMaterial({
    color: DESERT_TUNING.WALL_COLOR,
    side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;
  mesh.castShadow = true;
  mesh.frustumCulled = false;
  mesh.name = `wall-${sideSign > 0 ? 'right' : 'left'}`;

  // 하단 어두운 띠 (베이스 라인 강조)
  const bandH = 2.4;
  const bandVerts = [];
  const bandIdx = [];
  for (let i = 0; i < N; i++) {
    const [cx, cy] = cl[i];
    const [px, py] = _perpAt(cl, i);
    const bx = cx + sideSign * px * offset;
    const by = cy + sideSign * py * offset;
    bandVerts.push(bx, 0.05, -by);
    bandVerts.push(bx, bandH, -by);
  }
  for (let i = 0; i < N; i++) {
    const a = i * 2, b = ((i + 1) % N) * 2;
    if (sideSign > 0) bandIdx.push(a, b, a + 1, b, b + 1, a + 1);
    else bandIdx.push(b, a, a + 1, b + 1, b, a + 1);
  }
  const bandGeo = new THREE.BufferGeometry();
  bandGeo.setAttribute('position', new THREE.Float32BufferAttribute(bandVerts, 3));
  bandGeo.setIndex(bandIdx);
  bandGeo.computeVertexNormals();
  const bandMat = new THREE.MeshLambertMaterial({
    color: DESERT_TUNING.WALL_BAND_COLOR,
    side: THREE.DoubleSide,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
  });
  const band = new THREE.Mesh(bandGeo, bandMat);
  band.frustumCulled = false;

  const group = new THREE.Group();
  group.add(mesh);
  group.add(band);
  return group;
}

// 중심선 i에서 단위 perpendicular (px, py). 외측 = (+).
function _perpAt(cl, i) {
  const N = cl.length;
  const [px0, py0] = cl[(i - 1 + N) % N];
  const [nx0, ny0] = cl[(i + 1) % N];
  const tx = nx0 - px0;
  const ty = ny0 - py0;
  const l = Math.hypot(tx, ty) || 1;
  // 외측 perpendicular: (ty, -tx)/l
  return [ty / l, -tx / l];
}
