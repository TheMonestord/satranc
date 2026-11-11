import { EngineClient } from './engine/engineClient';
import { GameManager } from './game/gameManager';
import { loadGame, loadSettings, saveSettings, DEFAULT_SETTINGS, type Settings } from './game/storage';
import type { BoardView } from './scene/view';
import { View2D } from './scene/view2d';
import { ThemeRegistry } from './themes/registry';
import { GameScreen, type ViewKind } from './ui/gameScreen';
import { detectLang, setLang, t } from './ui/i18n';
import { showMenu } from './ui/menu';

const THEME_BASE = 'temalar/';
const ENGINE_URL = 'engine/stockfish.js';

/** Uygulamanın tamamını kurar: ayarlar, temalar, rakip, menü ve oyun ekranı arasındaki geçişler. */
export class App {
  private settings!: Settings;
  private registry!: ThemeRegistry;
  private gm!: GameManager;
  private aiAvailable = false;
  private screen: GameScreen | null = null;

  constructor(private host: HTMLElement) {}

  async run(): Promise<void> {
    this.settings = loadSettings({ ...DEFAULT_SETTINGS, language: detectLang() });
    setLang(this.settings.language);
    document.title = t('app.title');

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
    const choice = await showMenu(this.host, { canResume, aiAvailable: this.aiAvailable });
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
      initialView: '2d',
      can3d: false,
      onExit: () => void this.showMenu(),
      onSettings: () => {},
      onViewChange: (kind) => this.updateSettings({ ...this.settings, view: kind }),
    });
  }

  private createView(_kind: ViewKind): BoardView {
    return new View2D(this.registry.get('masa', this.settings.themes.masa));
  }

  private updateSettings(next: Settings): void {
    this.settings = next;
    saveSettings(next);
  }
}
