import { THEME_SLOTS, type Theme, type ThemeOf, type ThemeSet, type ThemeSlot } from './types';
import { validateManifest } from './validate';

export const DEFAULT_THEME_IDS: Record<ThemeSlot, string> = {
  ortam: 'klasik-oda',
  masa: 'ahsap',
  taslar: 'klasik',
  eller: 'sade',
};

/** Ağdan hiçbir tema gelmese bile oyunun açılabilmesi için kod içinde tutulan varsayılanlar. */
const BUILT_IN: ThemeSet = {
  ortam: {
    id: 'klasik-oda',
    tur: 'ortam',
    ad: { tr: 'Klasik Oda', en: 'Classic Room' },
    baseUrl: '',
    arkaPlan: '#1b1a22',
    zemin: '#2b2622',
    isikRengi: '#fff1d6',
    isikSiddeti: 2.2,
  },
  masa: {
    id: 'ahsap',
    tur: 'masa',
    ad: { tr: 'Ahşap Masa', en: 'Wooden Table' },
    baseUrl: '',
    acikKare: '#e8d2a6',
    koyuKare: '#8a5a3c',
    cerceve: '#4a2f1e',
    masaRengi: '#3a261a',
  },
  taslar: {
    id: 'klasik',
    tur: 'taslar',
    ad: { tr: 'Klasik Taşlar', en: 'Classic Pieces' },
    baseUrl: '',
    beyaz: '#f2e9d8',
    siyah: '#2a2420',
    parlaklik: 0.45,
  },
  eller: {
    id: 'sade',
    tur: 'eller',
    ad: { tr: 'Sade El', en: 'Plain Hand' },
    baseUrl: '',
    renk: '#d9a47e',
  },
};

export class ThemeRegistry {
  private themes = new Map<string, Theme>();

  private constructor() {
    for (const slot of THEME_SLOTS) this.add(BUILT_IN[slot]);
  }

  /** Tema listesini ve tema dosyalarını yükler. Hiçbir hata reddetmez; eksikler varsayılanla kapanır. */
  static async load(baseUrl: string, fetchFn: typeof fetch = fetch): Promise<ThemeRegistry> {
    const reg = new ThemeRegistry();
    let folders: string[] = [];
    try {
      const res = await fetchFn(`${baseUrl}index.json`);
      if (res.ok) {
        const index = (await res.json()) as { temalar?: unknown };
        if (Array.isArray(index.temalar)) {
          folders = index.temalar.filter((f): f is string => typeof f === 'string' && /^[\w-]+(\/[\w-]+)*$/.test(f));
        }
      }
    } catch {
      return reg;
    }
    await Promise.all(
      folders.map(async (folder) => {
        const dir = `${baseUrl}${folder}/`;
        try {
          const res = await fetchFn(`${dir}tema.json`);
          if (!res.ok) return;
          const result = validateManifest(await res.json(), dir);
          if (result.ok) reg.add(result.theme);
          else console.warn(`Tema atlandı (${folder}): ${result.error}`);
        } catch {
          console.warn(`Tema okunamadı: ${folder}`);
        }
      }),
    );
    return reg;
  }

  list<S extends ThemeSlot>(slot: S): ThemeOf<S>[] {
    return [...this.themes.values()].filter((t): t is ThemeOf<S> => t.tur === slot);
  }

  /** Kimlik bulunamazsa o yuvanın varsayılan temasını döner. */
  get<S extends ThemeSlot>(slot: S, id: string): ThemeOf<S> {
    const found = this.themes.get(`${slot}/${id}`) ?? this.themes.get(`${slot}/${DEFAULT_THEME_IDS[slot]}`);
    return found as ThemeOf<S>;
  }

  resolve(ids: Record<ThemeSlot, string>): ThemeSet {
    return {
      ortam: this.get('ortam', ids.ortam),
      masa: this.get('masa', ids.masa),
      taslar: this.get('taslar', ids.taslar),
      eller: this.get('eller', ids.eller),
    };
  }

  private add(theme: Theme): void {
    this.themes.set(`${theme.tur}/${theme.id}`, theme);
  }
}
