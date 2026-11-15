import type { Character } from './types';
import * as THREE from 'three';
import { createDeneyci } from './deneyci';
import { createGltfCharacter, type GltfCharacterOptions } from './gltfCharacter';

export type { Character, CharacterEvent } from './types';
export { createGltfCharacter } from './gltfCharacter';
export { createPlayerBody, playerBodyLayout } from './playerBody';
export { OPPONENT_ROOT, placeOpponent, PLAYER_EYE, DENEYCI_REST_LOCAL } from './deneyci';
export {
  createPlayerArm,
  placePlayerArm,
  playerArmLayout,
  PLAYER_CAMERA,
  PLAYER_SHOULDER,
  PLAYER_REST,
  type PlayerArmCharacter,
} from './playerArm';

/** Seçilebilir rakip karakterin tanımı. */
export interface CharacterInfo {
  id: string;
  ad: { tr: string; en: string };
  aciklama: { tr: string; en: string };
  /** Önerilen motor zorluk seviyesi (1 kolay – 8 en zor). */
  onerilenSeviye: number;
  create(): Character;
}

/**
 * Rakip listesi. Yeni karakter eklemek için: `characters/<id>.ts` içinde `Character` uygulayan
 * bir kurucu yazıp buraya bir satır ekleyin (ör. 'yasli-usta', 'otomat').
 */
/** Model dosyalarının yolu (sayfaya göre). */
export const KARAKTER_BASE = 'karakterler/';

/**
 * GLB karakterlerin ayarları: ölçek (model metresi başına dünya birimi), kalçanın oturduğu yer,
 * elin dinlenme noktası ve uzanırken gövdenin ne kadar yardım edebileceği. Hepsi kökün yerel uzayında.
 */
export const GLTF_TUNING: Record<'ty' | 'patron' | 'sovalye', Omit<GltfCharacterOptions, 'id'>> = {
  ty: {
    url: `${KARAKTER_BASE}ty/karakter.glb`,
    scale: 16,
    headScale: 0.6,
    hips: { y: -3.7, z: -1.3 },
    seatDrop: 2.7,
    rest: new THREE.Vector3(-3.6, 0, 3.5),
    reach: { maxPitch: 0.8, maxTwist: 0.55, maxRise: 3.0, maxForward: 3.0, maxClavicle: 0.45, comfort: 0.96, maxStretch: 0.35 },
  },
  patron: {
    url: `${KARAKTER_BASE}patron/karakter.glb`,
    scale: 18,
    hips: { y: -3.5, z: -1.5 },
    seatDrop: 1.8,
    rest: new THREE.Vector3(-4.4, 0, 3.6),
    reach: { maxPitch: 0.95, maxTwist: 0.5, maxRise: 2.2, maxForward: 1.8, maxClavicle: 0.35, comfort: 0.94, maxStretch: 0.1 },
  },
  sovalye: {
    url: `${KARAKTER_BASE}sovalye/karakter.glb`,
    scale: 16,
    handScale: 0.72,
    hips: { y: -4, z: -1.6 },
    seatDrop: 2,
    rest: new THREE.Vector3(-4.6, 0, 3.6),
    reach: { maxPitch: 0.85, maxTwist: 0.45, maxRise: 2.0, maxForward: 1.6, maxClavicle: 0.3, comfort: 0.94, maxStretch: 0.06 },
  },
};

export const CHARACTERS: readonly CharacterInfo[] = [
  {
    id: 'ty',
    ad: { tr: 'Ty', en: 'Ty' },
    aciklama: {
      tr: 'Atkılı, koca kafalı, meraklı bir çocuk. Sandalyesinde yerinde duramıyor; uzak taşlara uzanmak için masaya abanıyor.',
      en: 'A curious, big-headed boy in a scarf. He can barely sit still and leans over the table to reach far pieces.',
    },
    onerilenSeviye: 2,
    create: () => createGltfCharacter({ id: 'ty', ...GLTF_TUNING.ty }),
  },
  {
    id: 'patron',
    ad: { tr: 'Patron', en: 'The Boss' },
    aciklama: {
      tr: 'Şapkalı, purolu, kendinden emin bir iş adamı. Kaybetmeyi hiç sevmez, kazanınca alkışlar.',
      en: 'A confident businessman with a hat and a cigar. He hates losing and applauds himself when he wins.',
    },
    onerilenSeviye: 4,
    create: () => createGltfCharacter({ id: 'patron', ...GLTF_TUNING.patron }),
  },
  {
    id: 'sovalye',
    ad: { tr: 'Şövalye', en: 'The Knight' },
    aciklama: {
      tr: 'Zırhlı bir kale muhafızı. Sabırlı ve ağırbaşlı oynar; şaha karşı şövalye onuruyla savaşır.',
      en: 'An armoured castle guard. He plays patiently and gravely, defending his king with a knight\'s honour.',
    },
    onerilenSeviye: 6,
    create: () => createGltfCharacter({ id: 'sovalye', ...GLTF_TUNING.sovalye }),
  },
  {
    id: 'deneyci',
    ad: { tr: 'Deneyci', en: 'The Experimenter' },
    aciklama: {
      tr: 'Gaz maskeli, sarı-siyah koruyucu giysili, kambur bir gözlemci. Her hamleni not ediyor.',
      en: 'A hunched observer in a gas mask and yellow-black protective suit. He notes every move you make.',
    },
    onerilenSeviye: 4,
    create: createDeneyci,
  },
];

export const DEFAULT_CHARACTER_ID = 'ty';
/** Oyuncunun kolunu veren gövde (GLB karakter kimliği). */
export const PLAYER_BODY_ID = 'patron';

export function characterInfo(id: string): CharacterInfo | undefined {
  return CHARACTERS.find((c) => c.id === id);
}

/** Kimliğe göre karakter kurar; bilinmeyen kimlikte varsayılan rakibi döndürür. */
export function createCharacter(id: string): Character {
  return (characterInfo(id) ?? characterInfo(DEFAULT_CHARACTER_ID)!).create();
}
