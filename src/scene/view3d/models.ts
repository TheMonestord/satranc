import * as THREE from 'three';
import type { Color, PieceType } from '../../core/types';
import type { Theme } from '../../themes/types';

/** Taş seti model dosyasında düğümlerin taşıyabileceği adlar. */
const PIECE_NAMES: Record<PieceType, string[]> = {
  p: ['piyon', 'pawn'],
  n: ['at', 'knight'],
  b: ['fil', 'bishop'],
  r: ['kale', 'rook'],
  q: ['vezir', 'queen'],
  k: ['sah', 'şah', 'king'],
};
const COLOR_SUFFIX: Record<Color, string[]> = { w: ['beyaz', 'white'], b: ['siyah', 'black'] };

/**
 * Model ağacında bir taşın düğümünü arar. Önce renge özel ad (örn. "vezir-siyah"),
 * yoksa ortak ad (örn. "vezir") kullanılır.
 */
export function findPieceNode(root: THREE.Object3D, type: PieceType, color: Color): THREE.Object3D | null {
  const byName = new Map<string, THREE.Object3D>();
  root.traverse((o) => {
    if (o.name) byName.set(o.name.toLowerCase(), o);
  });
  for (const name of PIECE_NAMES[type]) {
    for (const suffix of COLOR_SUFFIX[color]) {
      for (const sep of ['-', '_', ' ']) {
        const found = byName.get(`${name}${sep}${suffix}`);
        if (found) return found;
      }
    }
  }
  for (const name of PIECE_NAMES[type]) {
    const found = byName.get(name);
    if (found) return found;
  }
  return null;
}

/** Temanın `model` dosyasını yükler. Dosya yoksa veya okunamazsa null döner; çağıran kodla üretilene döner. */
export async function loadThemeModel(theme: Theme): Promise<THREE.Object3D | null> {
  if (!theme.model) return null;
  try {
    const { GLTFLoader } = await import('three/addons/loaders/GLTFLoader.js');
    const gltf = await new GLTFLoader().loadAsync(`${theme.baseUrl}${theme.model}`);
    gltf.scene.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) {
        o.castShadow = true;
        o.receiveShadow = true;
      }
    });
    return gltf.scene;
  } catch (err) {
    console.warn(`Model yüklenemedi (${theme.id}); kodla üretilen şekil kullanılıyor.`, err);
    return null;
  }
}
