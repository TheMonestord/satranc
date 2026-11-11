import { describe, expect, test } from 'vitest';
import * as THREE from 'three';
import { findPieceNode } from '../../../src/scene/view3d/models';

function tree(...names: string[]): THREE.Object3D {
  const root = new THREE.Group();
  const inner = new THREE.Group();
  root.add(inner);
  for (const n of names) {
    const o = new THREE.Mesh(new THREE.BoxGeometry(1, 2, 1));
    o.name = n;
    inner.add(o);
  }
  return root;
}

describe('findPieceNode', () => {
  test('Türkçe adla bulur', () => {
    expect(findPieceNode(tree('piyon', 'at'), 'n', 'w')?.name).toBe('at');
  });

  test('İngilizce adla ve büyük harfle bulur', () => {
    expect(findPieceNode(tree('Pawn', 'Knight'), 'p', 'b')?.name).toBe('Pawn');
  });

  test('renge özel düğüm varsa onu seçer', () => {
    const root = tree('vezir', 'vezir-siyah', 'vezir-beyaz');
    expect(findPieceNode(root, 'q', 'b')?.name).toBe('vezir-siyah');
    expect(findPieceNode(root, 'q', 'w')?.name).toBe('vezir-beyaz');
  });

  test('renge özel düğüm yoksa ortak düğümü kullanır', () => {
    expect(findPieceNode(tree('kale'), 'r', 'b')?.name).toBe('kale');
  });

  test('yoksa null döner', () => {
    expect(findPieceNode(tree('piyon'), 'k', 'w')).toBeNull();
  });
});
