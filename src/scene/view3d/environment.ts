import * as THREE from 'three';
import type { Settings } from '../../game/storage';
import type { OrtamTheme } from '../../themes/types';

export type Quality = Settings['quality'];

/** Ortam: zemin ve ışıklar. Arka plan ve sis sahneye `applyBackground` ile uygulanır. */
export function buildEnvironment(ortam: OrtamTheme, quality: Quality): THREE.Group {
  const group = new THREE.Group();
  group.name = 'ortam';

  const floor = new THREE.Mesh(
    new THREE.CircleGeometry(70, 48),
    new THREE.MeshStandardMaterial({ color: ortam.zemin, roughness: 0.95, metalness: 0 }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -7.8;
  floor.receiveShadow = true;
  group.add(floor);

  group.add(new THREE.HemisphereLight(ortam.isikRengi, ortam.zemin, 0.55));

  const key = new THREE.DirectionalLight(ortam.isikRengi, ortam.isikSiddeti);
  key.position.set(4, 12, 6);
  if (quality !== 'low') {
    key.castShadow = true;
    const size = quality === 'high' ? 2048 : 1024;
    key.shadow.mapSize.set(size, size);
    key.shadow.camera.left = -7;
    key.shadow.camera.right = 7;
    key.shadow.camera.top = 7;
    key.shadow.camera.bottom = -7;
    key.shadow.camera.near = 1;
    key.shadow.camera.far = 30;
    key.shadow.bias = -0.0005;
    key.shadow.normalBias = 0.02;
    key.shadow.radius = quality === 'high' ? 4 : 2;
  }
  group.add(key);

  const fill = new THREE.DirectionalLight(ortam.isikRengi, ortam.isikSiddeti * 0.3);
  fill.position.set(-6, 6, -5);
  group.add(fill);

  return group;
}

export function applyBackground(scene: THREE.Scene, ortam: OrtamTheme): void {
  scene.background = new THREE.Color(ortam.arkaPlan);
  scene.fog = new THREE.Fog(ortam.arkaPlan, 35, 95);
}
