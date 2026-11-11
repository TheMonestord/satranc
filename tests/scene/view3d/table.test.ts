import { describe, expect, test } from 'vitest';
import * as THREE from 'three';
import { buildTable, squareToWorld, worldToSquare } from '../../../src/scene/view3d/table';
import type { MasaTheme } from '../../../src/themes/types';

const masa: MasaTheme = {
  id: 'ahsap', tur: 'masa', ad: { tr: 'a', en: 'b' }, baseUrl: '',
  acikKare: '#e8d2a6', koyuKare: '#8a5a3c', cerceve: '#4a2f1e', masaRengi: '#3a261a',
};

describe('tahta koordinatları', () => {
  test('köşe ve orta kareler', () => {
    expect(squareToWorld('a1').toArray()).toEqual([-3.5, 0, 3.5]);
    expect(squareToWorld('h8').toArray()).toEqual([3.5, 0, -3.5]);
    expect(squareToWorld('e4').toArray()).toEqual([0.5, 0, 0.5]);
  });

  test('64 karenin hepsi gidiş-dönüş aynı kareyi verir', () => {
    for (const file of 'abcdefgh') {
      for (let rank = 1; rank <= 8; rank++) {
        const sq = `${file}${rank}`;
        expect(worldToSquare(squareToWorld(sq))).toBe(sq);
      }
    }
  });

  test('karenin kenarına yakın nokta yine o kareyi verir', () => {
    expect(worldToSquare(new THREE.Vector3(0.95, 0, 0.05))).toBe('e4');
  });

  test('tahta dışı nokta null döner', () => {
    expect(worldToSquare(new THREE.Vector3(4.2, 0, 0))).toBeNull();
    expect(worldToSquare(new THREE.Vector3(0, 0, -4.01))).toBeNull();
  });
});

describe('buildTable', () => {
  test('64 kare üretir, yarısı açık yarısı koyu ve renkler temadan gelir', () => {
    const table = buildTable(masa);
    const squares: THREE.Mesh[] = [];
    table.traverse((o) => {
      if (o.userData.square) squares.push(o as THREE.Mesh);
    });
    expect(squares).toHaveLength(64);
    const colorOf = (sq: string) =>
      (squares.find((m) => m.userData.square === sq)!.material as THREE.MeshStandardMaterial).color.getHexString();
    expect(colorOf('a1')).toBe('8a5a3c');
    expect(colorOf('h1')).toBe('e8d2a6');
    expect(colorOf('d1')).toBe('e8d2a6');
  });

  test('karelerin üst yüzeyi y=0 düzlemindedir', () => {
    const table = buildTable(masa);
    let top = -Infinity;
    table.traverse((o) => {
      if (o.userData.square) top = Math.max(top, new THREE.Box3().setFromObject(o).max.y);
    });
    expect(top).toBeCloseTo(0, 5);
  });
});
