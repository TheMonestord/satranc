import type { Character } from './types';
import { createDeneyci } from './deneyci';

export type { Character, CharacterEvent } from './types';
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
export const CHARACTERS: readonly CharacterInfo[] = [
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

export const DEFAULT_CHARACTER_ID = 'deneyci';

export function characterInfo(id: string): CharacterInfo | undefined {
  return CHARACTERS.find((c) => c.id === id);
}

/** Kimliğe göre karakter kurar; bilinmeyen kimlikte varsayılan rakibi döndürür. */
export function createCharacter(id: string): Character {
  return (characterInfo(id) ?? characterInfo(DEFAULT_CHARACTER_ID)!).create();
}
