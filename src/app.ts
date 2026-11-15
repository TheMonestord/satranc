import { SoundEngine } from './audio/soundEngine';
import { EngineClient } from './engine/engineClient';
import { GameManager } from './game/gameManager';
import { loadGame, loadSettings, saveSettings, DEFAULT_SETTINGS, type Settings } from './game/storage';
import type { BoardView } from './scene/view';
import { View2D } from './scene/view2d';
import { Scene3D } from './scene/view3d/scene3d';
import { HandAnimator, type HandSlot } from './scene/animators/handAnimator';
import { DEFAULT_CHARACTER_ID, PLAYER_BODY_ID, createCharacter, createPlayerBody, type Character } from './scene/view3d/characters';
import type { MoveAnimator } from './scene/animators/types';
import { WalkAnimator } from './scene/animators/walkAnimator';
import { ThemeRegistry } from './themes/registry';
import { applySettingsChange, type SettingsTarget } from './ui/applySettings';
import { confirmDialog } from './ui/dialog';
import { GameScreen, type ViewKind } from './ui/gameScreen';
import { detectLang, setLang, t } from './ui/i18n';
import { showMenu } from './ui/menu';
import { showHistory } from './ui/historyScreen';
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
  private audio = new SoundEngine();

  constructor(private host: HTMLElement) {}

  async run(): Promise<void> {
    // Uçtan uca testlerin 3D tahtada kare konumu bulabilmesi için.
    (globalThis as { __satranc?: unknown }).__satranc = {
      squareToClient: (sq: string, height = 0) =>
        this.view instanceof Scene3D ? this.view.squareToClient(sq, height) : null,
      // Geliştirme ve uçtan uca testler için: etkin görünüm (karakterlere erişim).
      view: () => this.view,
    };
    this.settings = loadSettings({ ...DEFAULT_SETTINGS, language: detectLang() });
    setLang(this.settings.language);
    document.title = t('app.title');
    this.can3d = Scene3D.isSupported();
    this.audio.setEnabled(this.settings.sound, this.settings.music);
    // Tarayıcılar sesi ancak ilk dokunuştan sonra açar.
    window.addEventListener('pointerdown', () => this.audio.unlock(), { once: true });

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
    // Menüde ayar değişince atılmış sahneye dokunulmasın.
    this.view = null;
    const saved = await loadGame();
    const canResume = saved !== null && (saved.mode === 'local' || this.aiAvailable);
    const lang = this.settings.language;
    const choice = await showMenu(this.host, {
      canResume,
      aiAvailable: this.aiAvailable,
      onHistory: () =>
        void showHistory(document.body, async (text) => {
          try {
            await navigator.clipboard.writeText(text);
            return true;
          } catch {
            return false;
          }
        }),
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
      this.audio.setMood(themes.ortam.muzik ?? 'sakin');
      if (this.view instanceof Scene3D) {
        this.view.applyThemes(themes);
        this.setupActors(this.view);
      } else if (this.view instanceof View2D) {
        this.view.applyTheme(themes.masa);
      }
    },
    setQuality: (quality) => {
      if (this.view instanceof Scene3D) this.view.setQuality(quality);
    },
    setMotion: () => {
      if (this.view instanceof Scene3D) this.setupActors(this.view);
    },
    setAudio: (sound, music) => this.audio.setEnabled(sound, music),
    setCamera: (camera) => {
      if (this.view instanceof Scene3D) {
        this.view.setCameraMode(camera);
        this.setupActors(this.view);
      }
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
    this.audio.setMood(themes.ortam.muzik ?? 'sakin');
    if (kind === '3d' && this.can3d) {
      const scene = new Scene3D(themes, this.settings.quality);
      scene.setCameraMode(this.settings.camera);
      this.setupActors(scene);
      scene.setAnimationSpeed(ANIMATION_SPEED[this.settings.animation]);
      scene.onSlowFrames(() => void this.onSlowFrames());
      scene.onCue((cue) => this.audio.play(cue));
      this.view = scene;
      return scene;
    }
    const flat = new View2D(themes.masa);
    flat.onCue((cue) => this.audio.play(cue));
    this.view = flat;
    return flat;
  }

  /**
   * Karakterleri ve hareket modunu birlikte kurar. Bilgisayara karşı oyunda karşıya rakip oturur;
   * masa başı kamerada ve eller modunda oyuncunun hamlelerini kendi kolu yapar.
   */
  private setupActors(scene: Scene3D): void {
    scene.setAnimator(null);
    const cfg = this.gm.state().config;
    const opponent = cfg.mode === 'ai' ? createCharacter(DEFAULT_CHARACTER_ID) : null;
    // Oyuncunun kolu: GLB karakterlerden birinin gövdesi (kodla yapılan createPlayerArm da kullanılabilir).
    const arm =
      cfg.mode === 'ai' && this.settings.camera === 'masa' && this.settings.motion === 'hands' ? createPlayerBody(PLAYER_BODY_ID) : null;
    scene.setPlayerColor(cfg.mode === 'ai' ? cfg.playerColor : 'w');
    scene.setCharacters(opponent, arm);
    scene.setAnimator(this.createAnimator(scene, opponent, arm));
  }

  private createAnimator(scene: Scene3D, opponent: Character | null, arm: Character | null): MoveAnimator {
    if (this.settings.motion === 'walk') return new WalkAnimator(scene);
    const slot = (c: Character): HandSlot => ({
      hand: c.hand,
      rest: () => c.restPoint(),
      setBusy: (b) => c.setHandBusy(b),
      // Model yüklenene kadar (ya da yüklenemezse) taşı görünür bağımsız el taşır.
      available: () => (c as Character & { ready?: boolean }).ready ?? true,
    });
    const player = this.gm.state().config.playerColor;
    const slots: Partial<Record<'w' | 'b', HandSlot>> = {};
    if (opponent) slots[player === 'w' ? 'b' : 'w'] = slot(opponent);
    if (arm) slots[player] = slot(arm);
    return new HandAnimator(scene, this.registry.resolve(this.settings.themes).eller, undefined, slots);
  }

  private updateSettings(next: Settings): void {
    this.settings = next;
    saveSettings(next);
  }
}
