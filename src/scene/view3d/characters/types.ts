import type * as THREE from 'three';
import type { Hand } from '../hand';

/** Karakterin tepki verdiği oyun anları. */
export type CharacterEvent =
  | 'think-start' // bilgisayar düşünmeye başladı
  | 'think-end' // bilgisayar hamlesini buldu
  | 'lost-piece' // karakterin taşı alındı
  | 'took-piece' // karakter bir taş aldı
  | 'gave-check' // karakter şah çekti
  | 'in-check' // karaktere şah çekildi
  | 'won' // karakter kazandı
  | 'lost' // karakter kaybetti
  | 'draw';

/**
 * Masada oturan, kollarıyla taş oynatan bir karakter.
 * Koordinatlar: tahtanın merkezi (0,0,0), üstü y=0, bir kare 1 birim (~5,5 cm).
 * Karakter kendi yerel uzayında +z yönüne (tahtaya) bakar; sahne onu konumlandırır ve döndürür.
 */
export interface Character {
  readonly id: string;
  /** Sahneye eklenen kök. Gövde, baş ve kollar bunun altındadır. */
  readonly root: THREE.Group;
  /** Hamle yapan el. Kol her `update` çağrısında bu elin dünya konumunu izler. */
  readonly hand: Hand;
  /**
   * Elin dinlenme noktası (dünya koordinatı). `root` yerleştirildikten sonra geçerlidir.
   * El hamleden sonra buraya döner.
   */
  restPoint(): THREE.Vector3;
  /** Her karede çağrılır; dt saniye. Boşta canlandırma, bakış ve kolun ters kinematiği burada. */
  update(dt: number, now: number): void;
  /** Gözün/başın bakacağı dünya noktası (ör. oyuncunun eli, seçili taş); null ise serbest. */
  lookAt(target: THREE.Vector3 | null): void;
  react(ev: CharacterEvent): void;
  /** El hamle yaparken true; boşta canlandırma eli sürüklemesin diye. */
  setHandBusy(busy: boolean): void;
  dispose(): void;
}
