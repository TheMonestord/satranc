import type { Settings } from '../game/storage';
import type { ThemeRegistry } from '../themes/registry';
import { DEFAULT_THEME_IDS } from '../themes/registry';
import { THEME_SLOTS, type ThemeSlot } from '../themes/types';
import { openOverlay } from './dialog';
import { getLang, setLang, t } from './i18n';

interface Option {
  value: string;
  label: string;
  disabled?: boolean;
}

/**
 * Ayarlar penceresini açar. Her seçim anında `onChange` ile bildirilir; pencere kapanınca söz çözülür.
 * Dil değişince pencere yeni dilde yeniden çizilir.
 */
export function showSettings(
  host: HTMLElement,
  current: Settings,
  registry: ThemeRegistry,
  onChange: (next: Settings) => void,
  opts: { can3d: boolean },
): Promise<void> {
  let settings = current;

  return openOverlay<void>(host, undefined, (box, close) => {
    box.classList.add('settings');

    const emit = (next: Settings) => {
      settings = next;
      onChange(next);
    };

    const render = () => {
      box.replaceChildren();
      const title = document.createElement('h2');
      title.textContent = t('settings.title');
      box.append(title);

      box.append(
        field('language', t('settings.language'), settings.language, [
          { value: 'tr', label: 'Türkçe' },
          { value: 'en', label: 'English' },
        ], (v) => {
          setLang(v as Settings['language']);
          emit({ ...settings, language: v as Settings['language'] });
          render();
        }),
        field('view', t('settings.view'), opts.can3d ? settings.view : '2d', [
          { value: '3d', label: t('settings.view.3d'), disabled: !opts.can3d },
          { value: '2d', label: t('settings.view.2d') },
        ], (v) => emit({ ...settings, view: v as Settings['view'] })),
      );
      if (!opts.can3d) {
        const note = document.createElement('p');
        note.className = 'settings-note';
        note.textContent = t('webgl.unavailable');
        box.append(note);
      }
      box.append(
        field('quality', t('settings.quality'), settings.quality, [
          { value: 'low', label: t('settings.quality.low') },
          { value: 'medium', label: t('settings.quality.medium') },
          { value: 'high', label: t('settings.quality.high') },
        ], (v) => emit({ ...settings, quality: v as Settings['quality'] })),
        field('animation', t('settings.animation'), settings.animation, [
          { value: 'normal', label: t('settings.animation.normal') },
          { value: 'fast', label: t('settings.animation.fast') },
          { value: 'off', label: t('settings.animation.off') },
        ], (v) => emit({ ...settings, animation: v as Settings['animation'] })),
        field('motion', t('settings.motion'), settings.motion, [
          { value: 'hands', label: t('settings.motion.hands') },
          { value: 'walk', label: t('settings.motion.walk') },
        ], (v) => emit({ ...settings, motion: v as Settings['motion'] })),
        field('sound', t('settings.sound'), settings.sound ? 'on' : 'off', onOff(), (v) => emit({ ...settings, sound: v === 'on' })),
        field('music', t('settings.music'), settings.music ? 'on' : 'off', onOff(), (v) => emit({ ...settings, music: v === 'on' })),
        document.createElement('hr'),
      );

      for (const slot of THEME_SLOTS) box.append(themeField(slot));

      const row = document.createElement('div');
      row.className = 'dialog-row';
      const done = document.createElement('button');
      done.type = 'button';
      done.className = 'btn primary';
      done.dataset.settings = 'close';
      done.textContent = t('settings.close');
      done.addEventListener('click', () => close());
      row.append(done);
      box.append(row);
    };

    const themeField = (slot: ThemeSlot): HTMLElement => {
      const lang = getLang();
      const themes = registry.list(slot);
      const known = themes.some((th) => th.id === settings.themes[slot]);
      return field(
        `theme.${slot}`,
        t(`settings.theme.${slot}`),
        known ? settings.themes[slot] : DEFAULT_THEME_IDS[slot],
        themes.map((th) => ({ value: th.id, label: th.ad[lang] })),
        (v) => emit({ ...settings, themes: { ...settings.themes, [slot]: v } }),
      );
    };

    render();
  });
}

function onOff(): Option[] {
  return [
    { value: 'on', label: t('settings.on') },
    { value: 'off', label: t('settings.off') },
  ];
}

function field(name: string, label: string, value: string, options: Option[], onPick: (value: string) => void): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'settings-field';
  const id = `setting-${name.replace('.', '-')}`;
  const lab = document.createElement('label');
  lab.htmlFor = id;
  lab.textContent = label;
  const select = document.createElement('select');
  select.id = id;
  select.dataset.setting = name;
  for (const o of options) {
    const opt = document.createElement('option');
    opt.value = o.value;
    opt.textContent = o.label;
    opt.disabled = o.disabled ?? false;
    select.append(opt);
  }
  select.value = value;
  select.addEventListener('change', () => onPick(select.value));
  wrap.append(lab, select);
  return wrap;
}
