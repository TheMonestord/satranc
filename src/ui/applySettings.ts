import type { Settings } from '../game/storage';

/** Ayar değişikliklerinin uygulandığı yer; App bunu görünüm ve arayüz üzerinde uygular. */
export interface SettingsTarget {
  setLanguage(lang: Settings['language']): void;
  /** Görünümü güncel ayarlarla yeniden kurar. */
  setView(kind: Settings['view']): void;
  applyThemes(): void;
  setQuality(quality: Settings['quality']): void;
  setAnimation(animation: Settings['animation']): void;
}

/** Eski ve yeni ayarı karşılaştırır, yalnızca değişen kısımları uygular. */
export function applySettingsChange(prev: Settings, next: Settings, target: SettingsTarget): void {
  if (prev.language !== next.language) target.setLanguage(next.language);

  if (prev.view !== next.view) {
    // Yeniden kurulan görünüm tema, kalite ve animasyon ayarını zaten güncel haliyle alır.
    target.setView(next.view);
    return;
  }

  const slots = Object.keys(next.themes) as Array<keyof Settings['themes']>;
  if (slots.some((slot) => prev.themes[slot] !== next.themes[slot])) target.applyThemes();
  if (prev.quality !== next.quality) target.setQuality(next.quality);
  if (prev.animation !== next.animation) target.setAnimation(next.animation);
}
