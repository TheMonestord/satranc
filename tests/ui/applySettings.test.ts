import { describe, expect, test, vi } from 'vitest';
import { DEFAULT_SETTINGS, type Settings } from '../../src/game/storage';
import { applySettingsChange, type SettingsTarget } from '../../src/ui/applySettings';

function target() {
  return {
    setLanguage: vi.fn<SettingsTarget['setLanguage']>(),
    setView: vi.fn<SettingsTarget['setView']>(),
    applyThemes: vi.fn<SettingsTarget['applyThemes']>(),
    setQuality: vi.fn<SettingsTarget['setQuality']>(),
    setAnimation: vi.fn<SettingsTarget['setAnimation']>(),
    setMotion: vi.fn<SettingsTarget['setMotion']>(),
    setAudio: vi.fn<SettingsTarget['setAudio']>(),
  };
}

const base: Settings = { ...DEFAULT_SETTINGS, language: 'tr' };

describe('applySettingsChange', () => {
  test('değişiklik yoksa hiçbir şey çağrılmaz', () => {
    const tg = target();
    applySettingsChange(base, { ...base }, tg);
    for (const fn of Object.values(tg)) expect(fn).not.toHaveBeenCalled();
  });

  test('dil değişimi yalnızca setLanguage çağırır', () => {
    const tg = target();
    applySettingsChange(base, { ...base, language: 'en' }, tg);
    expect(tg.setLanguage).toHaveBeenCalledWith('en');
    expect(tg.setView).not.toHaveBeenCalled();
    expect(tg.applyThemes).not.toHaveBeenCalled();
  });

  test('tema değişimi applyThemes çağırır', () => {
    const tg = target();
    applySettingsChange(base, { ...base, themes: { ...base.themes, masa: 'mermer' } }, tg);
    expect(tg.applyThemes).toHaveBeenCalledTimes(1);
    expect(tg.setView).not.toHaveBeenCalled();
  });

  test('kalite ve animasyon değişimi ilgili ayarlayıcıyı çağırır', () => {
    const tg = target();
    applySettingsChange(base, { ...base, quality: 'low', animation: 'off' }, tg);
    expect(tg.setQuality).toHaveBeenCalledWith('low');
    expect(tg.setAnimation).toHaveBeenCalledWith('off');
  });

  test('görünüm değişimi görünümü yeniden kurar; tema ve kalite ayrıca uygulanmaz', () => {
    const tg = target();
    applySettingsChange(base, { ...base, view: '2d', quality: 'low', themes: { ...base.themes, masa: 'mermer' } }, tg);
    expect(tg.setView).toHaveBeenCalledWith('2d');
    expect(tg.applyThemes).not.toHaveBeenCalled();
    expect(tg.setQuality).not.toHaveBeenCalled();
  });

  test('hareket modu ve ses değişimi ilgili ayarlayıcıyı çağırır', () => {
    const tg = target();
    applySettingsChange(base, { ...base, motion: 'walk', music: true }, tg);
    expect(tg.setMotion).toHaveBeenCalledWith('walk');
    expect(tg.setAudio).toHaveBeenCalledWith(base.sound, true);
    expect(tg.applyThemes).not.toHaveBeenCalled();
  });
});
