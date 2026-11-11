import * as THREE from 'three';
import type { Color, PieceType } from '../../core/types';
import type { TaslarTheme } from '../../themes/types';

export const PIECE_HEIGHTS: Record<PieceType, number> = { p: 0.9, r: 1.1, n: 1.2, b: 1.35, q: 1.6, k: 1.8 };

/** Taban yarıçapı; bütün taşlar 1 birimlik kareye rahat sığar. */
const BASE_RADIUS: Record<PieceType, number> = { p: 0.3, r: 0.34, n: 0.34, b: 0.34, q: 0.37, k: 0.38 };

type Profile = Array<[radius: number, y: number]>;

function lathe(points: Profile, segments = 28): THREE.BufferGeometry {
  return new THREE.LatheGeometry(
    points.map(([r, y]) => new THREE.Vector2(r, y)),
    segments,
  );
}

/** Bütün taşların ortak kaidesi: geniş taban, boğum ve yukarı daralan gövde başlangıcı. */
function base(r: number): Profile {
  return [
    [0, 0],
    [r, 0],
    [r, 0.06],
    [r * 0.86, 0.1],
    [r * 0.9, 0.15],
    [r * 0.62, 0.22],
  ];
}

function buildGeometries(type: PieceType): THREE.BufferGeometry[] {
  const r = BASE_RADIUS[type];
  switch (type) {
    case 'p': {
      const head = new THREE.SphereGeometry(0.17, 24, 16);
      head.translate(0, 0.73, 0);
      return [
        lathe([...base(r), [0.11, 0.45], [0.1, 0.54], [0.19, 0.57], [0.19, 0.6], [0.09, 0.63], [0, 0.63]]),
        head,
      ];
    }
    case 'r': {
      const parts = [
        lathe([
          ...base(r),
          [0.2, 0.34],
          [0.18, 0.74],
          [0.27, 0.8],
          [0.27, 0.95],
          [0.19, 0.95],
          [0.19, 0.86],
          [0, 0.86],
        ]),
      ];
      // Burç dişleri
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        const tooth = new THREE.BoxGeometry(0.12, 0.15, 0.08);
        tooth.translate(0, 1.025, 0.23);
        tooth.rotateY(a);
        parts.push(tooth);
      }
      return parts;
    }
    case 'b': {
      const tip = new THREE.SphereGeometry(0.055, 16, 12);
      tip.translate(0, 1.295, 0);
      return [
        lathe([
          ...base(r),
          [0.12, 0.5],
          [0.1, 0.8],
          [0.2, 0.84],
          [0.2, 0.88],
          [0.11, 0.91],
          [0.17, 1.02],
          [0.16, 1.1],
          [0.09, 1.2],
          [0, 1.26],
        ]),
        tip,
      ];
    }
    case 'q': {
      const parts = [
        lathe([
          ...base(r),
          [0.14, 0.55],
          [0.11, 1.0],
          [0.22, 1.04],
          [0.22, 1.08],
          [0.13, 1.12],
          [0.15, 1.25],
          [0.24, 1.42],
          [0.19, 1.42],
          [0.12, 1.36],
          [0, 1.38],
        ]),
      ];
      const orb = new THREE.SphereGeometry(0.085, 16, 12);
      orb.translate(0, 1.515, 0);
      parts.push(orb);
      for (let i = 0; i < 8; i++) {
        const bead = new THREE.SphereGeometry(0.04, 10, 8);
        bead.translate(0, 1.44, 0.215);
        bead.rotateY((i / 8) * Math.PI * 2);
        parts.push(bead);
      }
      return parts;
    }
    case 'k': {
      const vertical = new THREE.BoxGeometry(0.07, 0.3, 0.07);
      vertical.translate(0, 1.65, 0);
      const horizontal = new THREE.BoxGeometry(0.22, 0.07, 0.07);
      horizontal.translate(0, 1.68, 0);
      return [
        lathe([
          ...base(r),
          [0.15, 0.6],
          [0.12, 1.1],
          [0.23, 1.14],
          [0.23, 1.18],
          [0.14, 1.22],
          [0.17, 1.36],
          [0.25, 1.5],
          [0.1, 1.52],
          [0, 1.52],
        ]),
        vertical,
        horizontal,
      ];
    }
    case 'n': {
      // At başı: +x yönüne bakan yandan görünüş, sonra kalınlık verilir.
      const s = new THREE.Shape();
      s.moveTo(-0.2, 0.3);
      s.lineTo(0.22, 0.3);
      s.quadraticCurveTo(0.2, 0.5, 0.08, 0.62);
      s.quadraticCurveTo(0.02, 0.7, 0.1, 0.76);
      s.lineTo(0.3, 0.72);
      s.quadraticCurveTo(0.36, 0.78, 0.33, 0.86);
      s.lineTo(0.14, 1.08);
      s.lineTo(0.1, 1.2);
      s.lineTo(0.0, 1.1);
      s.quadraticCurveTo(-0.2, 1.05, -0.26, 0.8);
      s.quadraticCurveTo(-0.3, 0.5, -0.2, 0.3);
      const head = new THREE.ExtrudeGeometry(s, {
        depth: 0.24,
        bevelEnabled: true,
        bevelThickness: 0.035,
        bevelSize: 0.035,
        bevelSegments: 3,
        curveSegments: 10,
      });
      // Baş yana bakar: oyuncu atı profilden görür (beyaz +x, siyah -x yönüne).
      head.translate(0, 0, -0.12);
      return [lathe([...base(r), [0.24, 0.3], [0.2, 0.34], [0, 0.34]]), head];
    }
  }
}

function material(color: Color, taslar: TaslarTheme): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color: color === 'w' ? taslar.beyaz : taslar.siyah,
    roughness: 1 - taslar.parlaklik * 0.8,
    metalness: 0.06,
  });
}

/** Nesneyi tabanı y=0'a oturacak ve yüksekliği tam `height` olacak biçimde ölçekler. */
export function fitToHeight(obj: THREE.Object3D, height: number, maxRadius = 0.42): void {
  obj.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(obj);
  const size = box.getSize(new THREE.Vector3());
  if (size.y <= 0) return;
  let scale = height / size.y;
  const radius = Math.max(box.max.x, -box.min.x, box.max.z, -box.min.z);
  // Yüksekliğe göre ölçek kareden taşırıyorsa yatayda ayrıca daralt.
  const horizontal = radius * scale > maxRadius ? maxRadius / radius : scale;
  obj.scale.multiply(new THREE.Vector3(horizontal, scale, horizontal));
  obj.position.y -= box.min.y * scale;
}

/**
 * Kodla üretilen satranç taşı. Kök nesnenin tabanı y=0'dadır; siyah taşlar beyazlara göre
 * yarım tur dönüktür (yalnızca atta fark edilir).
 */
export function buildPiece(type: PieceType, color: Color, taslar: TaslarTheme): THREE.Object3D {
  const root = new THREE.Group();
  const body = new THREE.Group();
  const mat = material(color, taslar);
  for (const geo of buildGeometries(type)) {
    const mesh = new THREE.Mesh(geo, mat);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    body.add(mesh);
  }
  fitToHeight(body, PIECE_HEIGHTS[type]);
  root.add(body);
  root.rotation.y = color === 'w' ? 0 : Math.PI;
  root.userData.piece = type;
  root.userData.color = color;
  return root;
}
