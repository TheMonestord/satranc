import { describe, expect, test } from 'vitest';
import * as THREE from 'three';
import { PIECE_HEIGHTS, buildPiece } from '../../../src/scene/view3d/pieces';
import type { PieceType } from '../../../src/core/types';
import type { TaslarTheme } from '../../../src/themes/types';

const taslar: TaslarTheme = {
  id: 'klasik', tur: 'taslar', ad: { tr: 'a', en: 'b' }, baseUrl: '',
  beyaz: '#f2e9d8', siyah: '#2a2420', parlaklik: 0.45,
};

const TYPES: PieceType[] = ['p', 'r', 'n', 'b', 'q', 'k'];

describe('buildPiece', () => {
  test('yükseklik tablosu', () => {
    expect(PIECE_HEIGHTS).toEqual({ p: 0.9, r: 1.1, n: 1.2, b: 1.35, q: 1.6, k: 1.8 });
  });

  test.each(TYPES)('%s: tabanı y=0, yüksekliği tablodaki değer, kareye sığar', (type) => {
    const obj = buildPiece(type, 'w', taslar);
    const box = new THREE.Box3().setFromObject(obj);
    expect(box.min.y).toBeCloseTo(0, 2);
    expect(box.max.y).toBeCloseTo(PIECE_HEIGHTS[type], 2);
    expect(Math.max(box.max.x, -box.min.x, box.max.z, -box.min.z)).toBeLessThan(0.45);
  });

  test('malzeme renkleri temadan gelir', () => {
    const colorOf = (obj: THREE.Object3D) => {
      let hex = '';
      obj.traverse((o) => {
        const m = (o as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined;
        if (m && !hex) hex = m.color.getHexString();
      });
      return hex;
    };
    expect(colorOf(buildPiece('q', 'w', taslar))).toBe('f2e9d8');
    expect(colorOf(buildPiece('q', 'b', taslar))).toBe('2a2420');
  });

  test('atlar rakibe bakar: beyaz ve siyah zıt yöne döner', () => {
    const w = buildPiece('n', 'w', taslar);
    const b = buildPiece('n', 'b', taslar);
    expect(Math.abs(w.rotation.y - b.rotation.y)).toBeCloseTo(Math.PI, 5);
  });

  test('taş türü ve rengi nesnede kayıtlıdır', () => {
    const obj = buildPiece('k', 'b', taslar);
    expect(obj.userData).toMatchObject({ piece: 'k', color: 'b' });
  });
});
