import type * as THREE from 'three';
import type { Cue } from '../../audio/cues';
import type { Color, MoveEvent, PieceType, Square } from '../../core/types';

/** Bir hareket modu: hamle olayını alır, canlandırır, bitince haber verir. */
export interface MoveAnimator {
  /** `speed`: 1 normal, 3 üç kat hızlı. */
  play(ev: MoveEvent, speed: number): Promise<void>;
  /** Süren canlandırmayı anında bitirir; tahta hamlenin sonucunu gösterir. */
  finishNow(): void;
  dispose(): void;
}

/** Hareket modlarının 3D sahnede kullanabildiği işlemler. */
export interface MoveAnimatorHost {
  readonly scene: THREE.Scene;
  pieceAt(sq: Square): THREE.Object3D | null;
  /** Taşı sahneden ve kayıttan kaldırır. */
  removePiece(sq: Square): void;
  /** Taş nesnesine dokunmadan yalnızca "hangi karede" kaydını günceller. */
  movePieceRecord(from: Square, to: Square): void;
  /** Karedeki taşı verilen türle değiştirir (terfi). */
  replacePiece(sq: Square, type: PieceType, color: Color): void;
  /** Taşın kaydını siler ama nesneyi sahnede bırakır; nesneyi kaldırmak çağırana kalır (düşen taş için). */
  detachPiece(sq: Square): THREE.Object3D | null;
  /** Verilen türde ve renkteki ilk taşı bulur (şahın tepkisi için). */
  findPiece(type: PieceType, color: Color): { square: Square; object: THREE.Object3D } | null;
  /** Bir ses anını bildirir (taş yere kondu, taş alındı…). */
  cue(cue: Cue): void;
  requestRender(): void;
}
