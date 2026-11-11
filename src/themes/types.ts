export type ThemeSlot = 'ortam' | 'masa' | 'taslar' | 'eller';
export const THEME_SLOTS: ThemeSlot[] = ['ortam', 'masa', 'taslar', 'eller'];

interface ThemeBase {
  id: string;
  ad: { tr: string; en: string };
  /** İsteğe bağlı 3D model dosyası (glTF/GLB), tema klasörüne göre yol. Yoksa parça kodla üretilir. */
  model?: string;
  /** Temanın klasörü; model gibi dosyalar buna göre çözülür. */
  baseUrl: string;
}

export interface OrtamTheme extends ThemeBase {
  tur: 'ortam';
  arkaPlan: string;
  zemin: string;
  isikRengi: string;
  isikSiddeti: number;
}

export interface MasaTheme extends ThemeBase {
  tur: 'masa';
  acikKare: string;
  koyuKare: string;
  cerceve: string;
  masaRengi: string;
}

export interface TaslarTheme extends ThemeBase {
  tur: 'taslar';
  beyaz: string;
  siyah: string;
  parlaklik: number;
}

export interface EllerTheme extends ThemeBase {
  tur: 'eller';
  renk: string;
}

export type Theme = OrtamTheme | MasaTheme | TaslarTheme | EllerTheme;
export type ThemeOf<S extends ThemeSlot> = Extract<Theme, { tur: S }>;
export type ThemeSet = { ortam: OrtamTheme; masa: MasaTheme; taslar: TaslarTheme; eller: EllerTheme };
