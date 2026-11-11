import * as THREE from 'three';
import { FILES, type Square } from '../../core/types';
import type { MasaTheme } from '../../themes/types';

export const SQUARE_SIZE = 1;
const HALF = 4 * SQUARE_SIZE;
/** Tahtanın çevresindeki çerçevenin genişliği */
export const FRAME = 0.45;
export const BOARD_THICKNESS = 0.28;

/** Karenin merkezinin dünya konumu. Tahtanın merkezi (0,0,0), üst yüzeyi y=0; a1 beyazın sol yakın köşesidir. */
export function squareToWorld(sq: Square): THREE.Vector3 {
  const file = FILES.indexOf(sq[0]);
  const rank = Number(sq[1]);
  return new THREE.Vector3((file - 3.5) * SQUARE_SIZE, 0, (4.5 - rank) * SQUARE_SIZE);
}

/** Tahta düzlemindeki bir noktanın karesi; tahta dışındaysa null. */
export function worldToSquare(p: THREE.Vector3): Square | null {
  if (Math.abs(p.x) >= HALF || Math.abs(p.z) >= HALF) return null;
  const file = Math.floor(p.x / SQUARE_SIZE + 4);
  const rank = 8 - Math.floor(p.z / SQUARE_SIZE + 4);
  if (file < 0 || file > 7 || rank < 1 || rank > 8) return null;
  return `${FILES[file]}${rank}`;
}

/** Masa ve tahta. Kareler `userData.square` ile işaretlidir; gövde parçaları 'masa-govde' grubundadır. */
export function buildTable(masa: MasaTheme): THREE.Group {
  const group = new THREE.Group();
  group.name = 'masa';

  const light = new THREE.MeshStandardMaterial({ color: masa.acikKare, roughness: 0.55, metalness: 0.02 });
  const dark = new THREE.MeshStandardMaterial({ color: masa.koyuKare, roughness: 0.5, metalness: 0.02 });
  const squareGeo = new THREE.BoxGeometry(SQUARE_SIZE, 0.06, SQUARE_SIZE);
  const board = new THREE.Group();
  board.name = 'tahta';
  for (let f = 0; f < 8; f++) {
    for (let rank = 1; rank <= 8; rank++) {
      const sq = `${FILES[f]}${rank}`;
      const mesh = new THREE.Mesh(squareGeo, (f + rank) % 2 === 1 ? dark : light);
      mesh.position.copy(squareToWorld(sq));
      mesh.position.y = -0.03;
      mesh.receiveShadow = true;
      mesh.userData.square = sq;
      board.add(mesh);
    }
  }

  const frameMat = new THREE.MeshStandardMaterial({ color: masa.cerceve, roughness: 0.45, metalness: 0.05 });
  const outer = 2 * HALF + 2 * FRAME;
  const frame = new THREE.Mesh(new THREE.BoxGeometry(outer, BOARD_THICKNESS, outer), frameMat);
  // Çerçevenin üstü karelerin hemen altında kalır; kareler çerçevenin içine gömülü görünür.
  frame.position.y = -0.012 - BOARD_THICKNESS / 2;
  frame.receiveShadow = true;
  frame.castShadow = true;
  board.add(frame);
  group.add(board);

  const body = new THREE.Group();
  body.name = 'masa-govde';
  const topMat = new THREE.MeshStandardMaterial({ color: masa.masaRengi, roughness: 0.6, metalness: 0.03 });
  const top = new THREE.Mesh(new THREE.CylinderGeometry(8.4, 8.2, 0.5, 48), topMat);
  top.position.y = -BOARD_THICKNESS - 0.012 - 0.25;
  top.receiveShadow = true;
  body.add(top);
  const leg = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 2.6, 7, 24), topMat);
  leg.position.y = top.position.y - 0.25 - 3.5;
  body.add(leg);
  group.add(body);

  return group;
}
