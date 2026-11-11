import { EngineClient } from './engine/engineClient';
import { GameManager } from './game/gameManager';
import { loadGame, loadSettings, saveSettings, DEFAULT_SETTINGS, type Settings } from './game/storage';
import type { BoardView } from './scene/view';
import { View2D } from './scene/view2d';
import { Scene3D } from './scene/view3d/scene3d';
import { HandAnimator } from './scene/animators/handAnimator';
import { ThemeRegistry } from './themes/registry';
import { applySettingsChange, type SettingsTarget } from './ui/applySettings';
import { confirmDialog } from './ui/dialog';
import { GameScreen, type ViewKind } from './ui/gameScreen';
import { detectLang, setLang, t } from './ui/i18n';
import { showMenu } from './ui/menu';
import { showSettings } from './ui/settings';

const THEME_BASE = 'temalar/';
const ENGINE_URL = 'engine/stockfish.js';
const ANIMATION_SPEED: Record<Settings['animation'], number> = { normal: 1, fast: 3, off: 0 };

/** Uygulamanın tamamını kurar: ayarlar, temalar, rakip, menü ve oyun ekranı arasındaki geçişler. */
export class App {
  private settings!: Settings;
  private registry!: ThemeRegistry;
  private gm!: GameManager;
  private aiAvailable = false;
  private screen: GameScreen | null = null;
  private can3d = false;
  private view: BoardView | null = null;
  private webglNoticeShown = false;

  constructor(private host: HTMLElement) {}

  async run(): Promise<void> {
    this.settings = loadSettings({ ...DEFAULT_SETTINGS, language: detectLang() });
    setLang(this.settings.language);
    document.title = t('app.title');
    this.can3d = Scene3D.isSupported();

    const loading = document.createElement('div');
    loading.className = 'loading';
    loading.textContent = t('app.loading');
    this.host.replaceChildren(loading);

    const [registry, engine] = await Promise.all([ThemeRegistry.load(THEME_BASE), this.loadEngine()]);
    this.registry = registry;
    this.aiAvailable = engine !== null;
    this.gm = new GameManager({ opponent: engine });

    await this.showMenu();
  }

  private async loadEngine(): Promise<EngineClient | null> {
    try {
      const client = new EngineClient(EngineClient.createWorkerTransport(ENGINE_URL));
      await client.init();
      return client;
    } catch {
      return null;
    }
  }

  private async showMenu(): Promise<void> {
    this.screen?.dispose();
    this.screen = null;
    const saved = await loadGame();
    const canResume = saved !== null && (saved.mode === 'local' || this.aiAvailable);
    const lang = this.settings.language;
    const choice = await showMenu(this.host, {
      canResume,
      aiAvailable: this.aiAvailable,
      onSettings: () =>
        void this.openSettings().then(() => {
          // Menü açıkken dil değiştiyse menüyü yeni dilde yeniden çiz.
          if (!this.screen && this.settings.language !== lang) void this.showMenu();
        }),
    });
    if (this.screen) return; // Dil değişimi sonrası yeniden çizilen eski menünün seçimi yok sayılır.
    if (choice.action === 'resume') {
      const resumed = await this.gm.resume();
      if (!resumed) {
        await this.showMenu();
        return;
      }
    } else {
      await this.gm.start(choice.config);
    }
    this.showGame();
  }

  private showGame(): void {
    this.screen = new GameScreen(this.host, {
      gm: this.gm,
      createView: (kind) => this.createView(kind),
      initialView: this.can3d ? this.settings.view : '2d',
      can3d: this.can3d,
      onExit: () => void this.showMenu(),
      onSettings: () => void this.openSettings(),
      onViewChange: (kind) => this.updateSettings({ ...this.settings, view: kind }),
    });
    if (!this.can3d && !this.webglNoticeShown) {
      this.webglNoticeShown = true;
      this.screen.showToast(t('webgl.unavailable'));
    }
  }

  private openSettings(): Promise<void> {
    return showSettings(
      document.body,
      this.settings,
      this.registry,
      (next) => {
        const prev = this.settings;
        this.updateSettings(next);
        applySettingsChange(prev, next, this.settingsTarget);
      },
      { can3d: this.can3d },
    );
  }

  private readonly settingsTarget: SettingsTarget = {
    setLanguage: (lang) => {
      setLang(lang);
      document.title = t('app.title');
      this.screen?.refreshLabels();
    },
    setView: (kind) => this.screen?.setView(this.can3d ? kind : '2d'),
    applyThemes: () => {
      const themes = this.registry.resolve(this.settings.themes);
      if (this.view instanceof Scene3D) {
        this.view.applyThemes(themes);
        this.view.setAnimator(new HandAnimator(this.view, themes.eller));
      } else if (this.view instanceof View2D) {
        this.view.applyTheme(themes.masa);
      }
    },
    setQuality: (quality) => {
      if (this.view instanceof Scene3D) this.view.setQuality(quality);
    },
    setAnimation: (animation) => {
      if (this.view instanceof Scene3D) this.view.setAnimationSpeed(ANIMATION_SPEED[animation]);
    },
  };

  /** 3D görünüm yavaşsa önce kaliteyi düşürür; zaten düşükse 2D görünümü önerir. */
  private async onSlowFrames(): Promise<void> {
    if (!this.screen) return;
    if (this.settings.quality !== 'low') {
      const next: Settings = { ...this.settings, quality: 'low' };
      this.updateSettings(next);
      this.settingsTarget.setQuality('low');
      this.screen.showToast(t('perf.lowered'));
      return;
    }
    if (await confirmDialog(this.host, t('perf.suggest2d'))) {
      this.updateSettings({ ...this.settings, view: '2d' });
      this.screen?.setView('2d');
    }
  }

  private createView(kind: ViewKind): BoardView {
    const themes = this.registry.resolve(this.settings.themes);
    if (kind === '3d' && this.can3d) {
      const scene = new Scene3D(themes, this.settings.quality);
      scene.setAnimator(new HandAnimator(scene, themes.eller));
      scene.setAnimationSpeed(ANIMATION_SPEED[this.settings.animation]);
      scene.onSlowFrames(() => void this.onSlowFrames());
      this.view = scene;
      return scene;
    }
    this.view = new View2D(themes.masa);
    return this.view;
  }

  private updateSettings(next: Settings): void {
    this.settings = next;
    saveSettings(next);
  }
}
