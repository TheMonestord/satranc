import { beforeEach, describe, expect, test } from 'vitest';
import { DEFAULT_SETTINGS, type Settings } from '../../src/game/storage';
import { ThemeRegistry } from '../../src/themes/registry';
import { setLang } from '../../src/ui/i18n';
import { showSettings } from '../../src/ui/settings';

const mermer = {
  id: 'mermer',
  tur: 'masa',
  ad: { tr: 'Mermer Masa', en: 'Marble Table' },
  acikKare: '#eeeed2',
  koyuKare: '#769656',
  cerceve: '#3b4a2f',
  masaRengi: '#26301f',
};

async function registryWithMermer(): Promise<ThemeRegistry> {
  const files: Record<string, unknown> = {
    't/index.json': { temalar: ['masalar/mermer'] },
    't/masalar/mermer/tema.json': mermer,
  };
  const fetchFn = (async (url: string) => {
    const body = files[url];
    return { ok: body !== undefined, json: async () => body } as Response;
  }) as typeof fetch;
  return ThemeRegistry.load('t/', fetchFn);
}

function field(name: string): HTMLSelectElement {
  return document.querySelector<HTMLSelectElement>(`select[data-setting="${name}"]`)!;
}

function choose(name: string, value: string): void {
  const el = field(name);
  el.value = value;
  el.dispatchEvent(new Event('change'));
}

describe('showSettings', () => {
  let registry: ThemeRegistry;
  let changes: Settings[];

  beforeEach(async () => {
    document.body.innerHTML = '';
    setLang('tr');
    registry = await registryWithMermer();
    changes = [];
  });

  const open = (current: Settings = DEFAULT_SETTINGS, can3d = true) =>
    showSettings(document.body, current, registry, (next) => changes.push(next), { can3d });

  test('dil, kalite, animasyon, görünüm, hareket modu ve dört tema yuvasını listeler', () => {
    open();
    const names = [...document.querySelectorAll<HTMLSelectElement>('select[data-setting]')].map((s) => s.dataset.setting);
    expect(names).toEqual([
      'language',
      'view',
      'quality',
      'animation',
      'motion',
      'sound',
      'music',
      'theme.ortam',
      'theme.masa',
      'theme.taslar',
      'theme.eller',
    ]);
    const motion = [...field('motion').options].map((o) => o.value);
    expect(motion).toEqual(['hands', 'walk']);
  });

  test('tema listesi kayıt defterindeki temaları etkin dildeki adlarıyla gösterir', () => {
    open();
    const options = [...field('theme.masa').options].map((o) => [o.value, o.textContent]);
    expect(options).toEqual([
      ['ahsap', 'Ahşap Masa'],
      ['mermer', 'Mermer Masa'],
    ]);
  });

  test('bir seçim onChange\'i güncel ayarlarla çağırır', () => {
    open();
    choose('quality', 'high');
    expect(changes).toEqual([{ ...DEFAULT_SETTINGS, quality: 'high' }]);
  });

  test('tema seçimi yalnızca o yuvayı değiştirir', () => {
    open();
    choose('theme.masa', 'mermer');
    expect(changes[0].themes).toEqual({ ...DEFAULT_SETTINGS.themes, masa: 'mermer' });
  });

  test('art arda seçimler birikir', () => {
    open();
    choose('animation', 'fast');
    choose('theme.masa', 'mermer');
    expect(changes[1].animation).toBe('fast');
    expect(changes[1].themes.masa).toBe('mermer');
  });

  test('kayıtlı tema kimliği kayıt defterinde yoksa varsayılan seçili görünür', () => {
    open({ ...DEFAULT_SETTINGS, themes: { ...DEFAULT_SETTINGS.themes, masa: 'silinmis' } });
    expect(field('theme.masa').value).toBe('ahsap');
  });

  test('3D desteklenmiyorsa görünüm 2D gösterilir, 3D seçilemez ve neden yazılır', () => {
    open(DEFAULT_SETTINGS, false);
    const view = field('view');
    expect(view.value).toBe('2d');
    expect(view.querySelector<HTMLOptionElement>('option[value="3d"]')!.disabled).toBe(true);
    expect(document.body.textContent).toContain('3D görünümü desteklemiyor');
  });

  test('dil değişince panel yeni dilde yeniden çizilir', () => {
    open();
    choose('language', 'en');
    expect(changes[0].language).toBe('en');
    expect(document.querySelector('.settings h2')!.textContent).toBe('Settings');
    expect([...field('theme.masa').options].map((o) => o.textContent)).toContain('Marble Table');
  });

  test('Kapat düğmesi pencereyi kapatır', async () => {
    const done = open();
    document.querySelector<HTMLElement>('[data-settings="close"]')!.click();
    await done;
    expect(document.querySelector('.overlay')).toBeNull();
  });
});
