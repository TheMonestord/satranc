import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import type { Color, MoveEvent, PieceOnBoard, PieceType, Square } from '../../core/types';
import type { OrtamTheme, MasaTheme, TaslarTheme } from '../../themes/types';
import type { MoveAnimator, MoveAnimatorHost } from '../animators/types';
import type { BoardView, Highlights } from '../view';
import { applyBackground, buildEnvironment, type Quality } from './environment';
import { findPieceNode, loadThemeModel } from './models';
import { PIECE_HEIGHTS, buildPiece, fitToHeight } from './pieces';
import { buildTable, squareToWorld, worldToSquare } from './table';

export interface SceneThemes {
  ortam: OrtamTheme;
  masa: MasaTheme;
  taslar: TaslarTheme;
}

const POLAR = THREE.MathUtils.degToRad(42);
const FOV = 38;
const FLIP_MS = 600;
const CLICK_SLOP_PX = 7;
const PIECE_TYPES: PieceType[] = ['p', 'n', 'b', 'r', 'q', 'k'];

function disposeObject(obj: THREE.Object3D): void {
  obj.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.geometry?.dispose();
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const m of mats) m?.dispose();
  });
}

/** Three.js sahnesi. Oyun kurallarını bilmez; yalnızca verilen konumu ve hamle olaylarını gösterir. */
export class Scene3D implements BoardView, MoveAnimatorHost {
  readonly scene = new THREE.Scene();
  private renderer: THREE.WebGLRenderer | null = null;
  private camera = new THREE.PerspectiveCamera(FOV, 1, 0.5, 200);
  private controls: OrbitControls | null = null;
  private host: HTMLElement | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private raycaster = new THREE.Raycaster();

  private envGroup: THREE.Group;
  private tableGroup: THREE.Group;
  private pieceGroup = new THREE.Group();
  private highlightGroup = new THREE.Group();
  private pieces = new Map<Square, THREE.Object3D>();
  /** Tür+renk başına bir örnek; taşlar bundan kopyalanır ve geometriyi paylaşır. */
  private prototypes = new Map<string, THREE.Object3D>();

  private animator: MoveAnimator | null = null;
  private speed = 1;
  private moveToken = 0;
  private flipped = false;
  private azimuth = 0;
  private distance = 14;
  private flipAnim: { from: number; to: number; start: number } | null = null;
  private highlights: Highlights = { targets: [] };
  private clickCb: (sq: Square) => void = () => {};
  private pointerDown: { x: number; y: number } | null = null;
  private frameHandle = 0;
  private disposed = false;
  /** Tema değişimlerinde eski model yüklemelerinin sonucunu yok saymak için. */
  private themeToken = 0;
  private slowCb: (() => void) | null = null;
  private frameTimes: number[] = [];
  private measureUntil = 0;

  constructor(
    private themes: SceneThemes,
    private quality: Quality,
  ) {
    this.envGroup = buildEnvironment(themes.ortam, quality);
    this.tableGroup = buildTable(themes.masa);
    applyBackground(this.scene, themes.ortam);
    this.pieceGroup.name = 'taslar';
    this.scene.add(this.envGroup, this.tableGroup, this.pieceGroup, this.highlightGroup);
    void this.loadModels();
  }

  static isSupported(): boolean {
    try {
      const canvas = document.createElement('canvas');
      return !!(canvas.getContext('webgl2') || canvas.getContext('webgl'));
    } catch {
      return false;
    }
  }

  // ---------- BoardView ----------

  mount(el: HTMLElement): void {
    this.host = el;
    const renderer = new THREE.WebGLRenderer({ antialias: this.quality !== 'low', powerPreference: 'high-performance' });
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    this.renderer = renderer;
    this.applyQuality();
    el.append(renderer.domElement);

    const controls = new OrbitControls(this.camera, renderer.domElement);
    controls.enablePan = false;
    controls.enableDamping = false;
    controls.minPolarAngle = THREE.MathUtils.degToRad(15);
    controls.maxPolarAngle = THREE.MathUtils.degToRad(80);
    controls.addEventListener('change', () => this.requestRender());
    this.controls = controls;

    renderer.domElement.addEventListener('pointerdown', this.onPointerDown);
    renderer.domElement.addEventListener('pointerup', this.onPointerUp);

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(el);
    this.resize();
    this.placeCamera();
    this.measureUntil = performance.now() + 3000;
    this.requestRender();
  }

  setPosition(pieces: PieceOnBoard[]): void {
    this.animator?.finishNow();
    const wanted = new Map(pieces.map((p) => [p.square, p]));
    for (const [sq, obj] of [...this.pieces]) {
      const w = wanted.get(sq);
      if (!w || obj.userData.piece !== w.piece || obj.userData.color !== w.color) this.removePiece(sq);
    }
    for (const p of pieces) {
      const existing = this.pieces.get(p.square);
      if (existing) {
        // Yarım kalmış bir canlandırmadan kalan kaymayı düzelt.
        existing.position.copy(squareToWorld(p.square));
      } else {
        this.addPiece(p.square, p.piece, p.color);
      }
    }
    this.renderHighlights();
    this.requestRender();
  }

  async applyMove(ev: MoveEvent, piecesAfter: PieceOnBoard[]): Promise<void> {
    this.animator?.finishNow();
    const token = ++this.moveToken;
    if (this.animator && this.speed > 0 && this.renderer) {
      await this.animator.play(ev, this.speed);
    }
    // Bu sırada daha yeni bir hamle geldiyse konumu o belirler.
    if (token === this.moveToken && !this.disposed) this.setPosition(piecesAfter);
  }

  setHighlights(h: Highlights): void {
    this.highlights = h;
    this.renderHighlights();
    this.requestRender();
  }

  setFlipped(flipped: boolean): void {
    if (flipped === this.flipped) return;
    this.flipped = flipped;
    const to = flipped ? Math.PI : 0;
    if (!this.renderer) {
      this.azimuth = to;
      return;
    }
    this.flipAnim = { from: this.currentAzimuth(), to, start: performance.now() };
    this.requestRender();
  }

  onSquareClick(cb: (sq: Square) => void): void {
    this.clickCb = cb;
  }

  dispose(): void {
    this.disposed = true;
    this.animator?.finishNow();
    this.animator?.dispose();
    this.animator = null;
    cancelAnimationFrame(this.frameHandle);
    this.resizeObserver?.disconnect();
    this.controls?.dispose();
    if (this.renderer) {
      this.renderer.domElement.removeEventListener('pointerdown', this.onPointerDown);
      this.renderer.domElement.removeEventListener('pointerup', this.onPointerUp);
      this.renderer.domElement.remove();
      this.renderer.dispose();
      this.renderer = null;
    }
    disposeObject(this.scene);
    for (const proto of this.prototypes.values()) disposeObject(proto);
    this.prototypes.clear();
    this.pieces.clear();
  }

  // ---------- Hareket modu ----------

  /** null verilirse hamleler canlandırılmadan, anında gösterilir. */
  setAnimator(animator: MoveAnimator | null): void {
    this.animator?.finishNow();
    this.animator?.dispose();
    this.animator = animator;
  }

  /** 1 normal, 3 hızlı, 0 kapalı. */
  setAnimationSpeed(speed: number): void {
    this.speed = speed;
  }

  // ---------- MoveAnimatorHost ----------

  pieceAt(sq: Square): THREE.Object3D | null {
    return this.pieces.get(sq) ?? null;
  }

  removePiece(sq: Square): void {
    const obj = this.pieces.get(sq);
    if (!obj) return;
    this.pieceGroup.remove(obj);
    this.pieces.delete(sq);
  }

  movePieceRecord(from: Square, to: Square): void {
    const obj = this.pieces.get(from);
    if (!obj) return;
    this.pieces.delete(from);
    this.pieces.set(to, obj);
  }

  replacePiece(sq: Square, type: PieceType, color: Color): void {
    this.removePiece(sq);
    this.addPiece(sq, type, color);
  }

  requestRender(): void {
    if (this.frameHandle || this.disposed || !this.renderer) return;
    this.frameHandle = requestAnimationFrame((now) => {
      this.frameHandle = 0;
      this.frame(now);
    });
  }

  // ---------- Tema ve kalite ----------

  /** Sahneyi yeniden kurmadan ortamı, masayı ve taşları değiştirir. */
  applyThemes(themes: SceneThemes): void {
    this.animator?.finishNow();
    const current = [...this.pieces].map(([square, obj]) => ({
      square,
      piece: obj.userData.piece as PieceType,
      color: obj.userData.color as Color,
    }));
    this.themes = themes;

    this.scene.remove(this.envGroup, this.tableGroup);
    disposeObject(this.envGroup);
    disposeObject(this.tableGroup);
    this.envGroup = buildEnvironment(themes.ortam, this.quality);
    this.tableGroup = buildTable(themes.masa);
    this.scene.add(this.envGroup, this.tableGroup);
    applyBackground(this.scene, themes.ortam);

    for (const sq of [...this.pieces.keys()]) this.removePiece(sq);
    for (const proto of this.prototypes.values()) disposeObject(proto);
    this.prototypes.clear();
    for (const p of current) this.addPiece(p.square, p.piece, p.color);

    void this.loadModels();
    this.requestRender();
  }

  setQuality(quality: Quality): void {
    if (quality === this.quality) return;
    this.quality = quality;
    this.applyQuality();
    this.scene.remove(this.envGroup);
    disposeObject(this.envGroup);
    this.envGroup = buildEnvironment(this.themes.ortam, quality);
    this.scene.add(this.envGroup);
    this.resize();
    this.requestRender();
  }

  /** İlk 3 saniyede ortalama kare süresi 50 ms'yi aşarsa bir kez çağrılır. */
  onSlowFrames(cb: () => void): void {
    this.slowCb = cb;
  }

  // ---------- İç işleyiş ----------

  private applyQuality(): void {
    if (!this.renderer) return;
    const cap = this.quality === 'low' ? 1 : this.quality === 'medium' ? 1.5 : 2;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, cap));
    this.renderer.shadowMap.enabled = this.quality !== 'low';
    this.renderer.shadowMap.type = this.quality === 'high' ? THREE.PCFSoftShadowMap : THREE.PCFShadowMap;
  }

  private prototype(type: PieceType, color: Color): THREE.Object3D {
    const key = `${type}${color}`;
    let proto = this.prototypes.get(key);
    if (!proto) {
      proto = buildPiece(type, color, this.themes.taslar);
      this.prototypes.set(key, proto);
    }
    return proto;
  }

  private addPiece(sq: Square, type: PieceType, color: Color): void {
    const obj = this.prototype(type, color).clone();
    obj.position.copy(squareToWorld(sq));
    this.pieceGroup.add(obj);
    this.pieces.set(sq, obj);
  }

  /** Temalarda model dosyası varsa yükler ve kodla üretilen parçaların yerine koyar. */
  private async loadModels(): Promise<void> {
    const token = ++this.themeToken;
    const { ortam, masa, taslar } = this.themes;
    const [ortamModel, masaModel, taslarModel] = await Promise.all([
      loadThemeModel(ortam),
      loadThemeModel(masa),
      loadThemeModel(taslar),
    ]);
    if (token !== this.themeToken || this.disposed) return;

    if (ortamModel) this.envGroup.add(ortamModel);
    if (masaModel) {
      const body = this.tableGroup.getObjectByName('masa-govde');
      if (body) {
        this.tableGroup.remove(body);
        disposeObject(body);
      }
      masaModel.name = 'masa-govde';
      this.tableGroup.add(masaModel);
    }
    if (taslarModel) {
      for (const type of PIECE_TYPES) {
        for (const color of ['w', 'b'] as const) {
          const node = findPieceNode(taslarModel, type, color);
          if (!node) continue;
          const body = node.clone();
          body.position.set(0, 0, 0);
          fitToHeight(body, PIECE_HEIGHTS[type]);
          const root = new THREE.Group();
          root.add(body);
          root.rotation.y = color === 'w' ? 0 : Math.PI;
          root.userData.piece = type;
          root.userData.color = color;
          const old = this.prototypes.get(`${type}${color}`);
          if (old) disposeObject(old);
          this.prototypes.set(`${type}${color}`, root);
        }
      }
      const current = [...this.pieces].map(([square, obj]) => ({
        square,
        piece: obj.userData.piece as PieceType,
        color: obj.userData.color as Color,
      }));
      this.animator?.finishNow();
      for (const p of current) this.replacePiece(p.square, p.piece, p.color);
    }
    this.requestRender();
  }

  private resize(): void {
    if (!this.renderer || !this.host) return;
    const w = Math.max(1, this.host.clientWidth);
    const h = Math.max(1, this.host.clientHeight);
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();

    // Tahtanın tamamı görünecek uzaklık: dar ekranlarda kamera geri çekilir.
    const vHalf = THREE.MathUtils.degToRad(FOV / 2);
    const hHalf = Math.atan(Math.tan(vHalf) * this.camera.aspect);
    const fit = Math.max(5.6 / Math.tan(hHalf), 5.5 / Math.tan(vHalf));
    const changed = Math.abs(fit - this.distance) > 0.01;
    this.distance = fit;
    if (this.controls) {
      this.controls.minDistance = fit * 0.55;
      this.controls.maxDistance = fit * 1.5;
    }
    if (changed) this.placeCamera();
    this.requestRender();
  }

  private currentAzimuth(): number {
    return Math.atan2(this.camera.position.x, this.camera.position.z);
  }

  private placeCamera(azimuth = this.flipped ? Math.PI : 0): void {
    this.azimuth = azimuth;
    const r = this.distance;
    this.camera.position.set(
      r * Math.sin(POLAR) * Math.sin(azimuth),
      r * Math.cos(POLAR),
      r * Math.sin(POLAR) * Math.cos(azimuth),
    );
    this.camera.lookAt(0, 0, 0);
    this.controls?.target.set(0, 0, 0);
    this.controls?.update();
  }

  private frame(now: number): void {
    if (!this.renderer || this.disposed) return;
    if (this.flipAnim) {
      const k = Math.min(1, (now - this.flipAnim.start) / FLIP_MS);
      const eased = k * k * (3 - 2 * k);
      // En kısa yoldan dön.
      let delta = this.flipAnim.to - this.flipAnim.from;
      delta = Math.atan2(Math.sin(delta), Math.cos(delta));
      if (Math.abs(Math.abs(delta) - Math.PI) < 1e-6) delta = Math.PI;
      this.placeCamera(this.flipAnim.from + delta * eased);
      if (k >= 1) this.flipAnim = null;
      else this.requestRender();
    }
    this.renderer.render(this.scene, this.camera);
    this.measure(now);
  }

  private lastFrameAt = 0;
  private measure(now: number): void {
    if (!this.slowCb || now > this.measureUntil) return;
    if (this.lastFrameAt && now - this.lastFrameAt < 500) this.frameTimes.push(now - this.lastFrameAt);
    this.lastFrameAt = now;
    if (this.frameTimes.length >= 20) {
      const avg = this.frameTimes.reduce((a, b) => a + b, 0) / this.frameTimes.length;
      const cb = this.slowCb;
      this.slowCb = null;
      if (avg > 50) cb();
    }
  }

  private onPointerDown = (e: PointerEvent): void => {
    this.pointerDown = { x: e.clientX, y: e.clientY };
  };

  private onPointerUp = (e: PointerEvent): void => {
    const down = this.pointerDown;
    this.pointerDown = null;
    if (!down || !this.renderer) return;
    // Sürükleme kamerayı döndürür; yalnızca yerinde bırakılan dokunuş tıklama sayılır.
    if (Math.hypot(e.clientX - down.x, e.clientY - down.y) > CLICK_SLOP_PX) return;
    const sq = this.pickSquare(e.clientX, e.clientY);
    if (sq) this.clickCb(sq);
  };

  private pickSquare(clientX: number, clientY: number): Square | null {
    const rect = this.renderer!.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1,
    );
    this.raycaster.setFromCamera(ndc, this.camera);

    // Önce taşlar: uzun bir taşın gövdesine tıklamak arkasındaki kareyi seçmemeli.
    const hit = this.raycaster.intersectObjects(this.pieceGroup.children, true)[0];
    if (hit) {
      for (const [sq, obj] of this.pieces) {
        let o: THREE.Object3D | null = hit.object;
        while (o) {
          if (o === obj) return sq;
          o = o.parent;
        }
      }
    }
    const point = new THREE.Vector3();
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    return this.raycaster.ray.intersectPlane(plane, point) ? worldToSquare(point) : null;
  }

  private renderHighlights(): void {
    for (const child of [...this.highlightGroup.children]) {
      this.highlightGroup.remove(child);
      const mesh = child as THREE.Mesh;
      mesh.geometry.dispose();
      (mesh.material as THREE.Material).dispose();
    }
    const h = this.highlights;
    const tile = (sq: Square, color: number, opacity: number, y: number) => {
      const mesh = new THREE.Mesh(
        new THREE.PlaneGeometry(1, 1),
        new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false }),
      );
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.copy(squareToWorld(sq)).setY(y);
      this.highlightGroup.add(mesh);
    };
    if (h.lastMove) for (const sq of h.lastMove) tile(sq, 0xe8c850, 0.42, 0.004);
    if (h.check) tile(h.check, 0xd64838, 0.6, 0.006);
    if (h.selected) tile(h.selected, 0x5aaa78, 0.6, 0.008);
    for (const sq of h.targets) {
      const occupied = this.pieces.has(sq);
      const geo = occupied ? new THREE.RingGeometry(0.4, 0.48, 32) : new THREE.CircleGeometry(0.17, 24);
      const mesh = new THREE.Mesh(
        geo,
        new THREE.MeshBasicMaterial({ color: 0x1e6e3c, transparent: true, opacity: 0.75, depthWrite: false }),
      );
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.copy(squareToWorld(sq)).setY(0.01);
      this.highlightGroup.add(mesh);
    }
  }
}
