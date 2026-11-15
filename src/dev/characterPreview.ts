import * as THREE from 'three';
import { FILES, type Square } from '../core/types';
import { buildTable, squareToWorld } from '../scene/view3d/table';
import { buildPiece, PIECE_HEIGHTS } from '../scene/view3d/pieces';
import { createCharacter, createPlayerArm, placeOpponent, PLAYER_CAMERA, type CharacterEvent } from '../scene/view3d/characters';
import type { Character } from '../scene/view3d/characters/types';
import type { MasaTheme, TaslarTheme } from '../themes/types';

/*
 * Geliştirici önizlemesi: karakter.html. Loş bir oda, masa, tahta, karşıda Deneyci ve oyuncunun kolu.
 * Tuşlar/düğmeler tepkileri ve eli rastgele karelere götürmeyi tetikler.
 * `?manual=1` ile zaman yalnızca `window.__preview.advance()` ile ilerler (ekran görüntüleri için).
 */

const params = new URLSearchParams(location.search);
const manual = params.has('manual');
if (params.has('shot')) document.body.classList.add('shot');

const masa: MasaTheme = {
  id: 'ahsap',
  tur: 'masa',
  ad: { tr: 'Ahşap', en: 'Wood' },
  baseUrl: '',
  acikKare: '#e8d2a6',
  koyuKare: '#8a5a3c',
  cerceve: '#4a2f1e',
  masaRengi: '#3a261a',
};
const taslar: TaslarTheme = {
  id: 'klasik',
  tur: 'taslar',
  ad: { tr: 'Klasik', en: 'Classic' },
  baseUrl: '',
  beyaz: '#f2e9d8',
  siyah: '#2a2420',
  parlaklik: 0.45,
};

const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.1;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color('#0d0c0e');
scene.fog = new THREE.Fog('#0d0c0e', 30, 70);

// ---- Loş oda: zemin, uzak duvar, masanın üstünde sıcak bir lamba ----
const floor = new THREE.Mesh(
  new THREE.CircleGeometry(60, 48),
  new THREE.MeshStandardMaterial({ color: '#1e1c1b', roughness: 0.95 }),
);
floor.rotation.x = -Math.PI / 2;
floor.position.y = -14;
floor.receiveShadow = true;
scene.add(floor);
const wall = new THREE.Mesh(
  new THREE.PlaneGeometry(80, 40),
  new THREE.MeshStandardMaterial({ color: '#2a2a28', roughness: 0.95 }),
);
wall.position.set(0, 10, -24);
wall.receiveShadow = true;
scene.add(wall);

scene.add(new THREE.HemisphereLight('#c8c4b8', '#1a1612', 0.35));
const lamp = new THREE.SpotLight('#ffd9a0', 700, 60, THREE.MathUtils.degToRad(58) / 2 * 2, 0.55, 1.6);
lamp.position.set(0, 15, 0);
lamp.target.position.set(0, 0, 0);
lamp.castShadow = true;
lamp.shadow.mapSize.set(2048, 2048);
lamp.shadow.bias = -0.0004;
lamp.shadow.normalBias = 0.03;
scene.add(lamp, lamp.target);
const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.6, 16, 10), new THREE.MeshBasicMaterial({ color: '#fff2d0' }));
bulb.position.copy(lamp.position);
scene.add(bulb);
const shade = new THREE.Mesh(
  new THREE.ConeGeometry(2.6, 2, 24, 1, true),
  new THREE.MeshStandardMaterial({ color: '#2b2f2a', side: THREE.DoubleSide, metalness: 0.6, roughness: 0.4 }),
);
shade.position.set(0, 15.6, 0);
scene.add(shade);

// Önizlemeye özgü dolgu ve kontur ışığı (gerçek sahnede yok)
const fillLights = new THREE.Group();
const rim = new THREE.DirectionalLight('#9fb7ff', 0.8);
rim.position.set(-10, 14, -24);
rim.target.position.set(0, 5, -10);
const fill = new THREE.DirectionalLight('#b8c8e8', 0.35);
fill.position.set(6, 14, 30);
fillLights.add(rim, rim.target, fill);
scene.add(fillLights);

// ---- Masa ve taşlar ----
scene.add(buildTable(masa));
const pieces = new Map<Square, THREE.Object3D>();
const back = ['r', 'n', 'b', 'q', 'k', 'b', 'n', 'r'] as const;
FILES.split("").forEach((f, i) => {
  for (const [rank, type, color] of [
    [1, back[i], 'w'],
    [2, 'p', 'w'],
    [7, 'p', 'b'],
    [8, back[i], 'b'],
  ] as const) {
    const sq = `${f}${rank}` as Square;
    const p = buildPiece(type, color, taslar);
    p.position.copy(squareToWorld(sq));
    p.traverse((o) => {
      o.castShadow = true;
      o.receiveShadow = true;
    });
    scene.add(p);
    pieces.set(sq, p);
  }
});

// ---- Karakterler ----
const opp = createCharacter(params.get('karakter') ?? 'deneyci');
placeOpponent(opp);
scene.add(opp.root, opp.hand.root);
opp.hand.root.position.copy(opp.restPoint());
const player = createPlayerArm({ id: 'sade', tur: 'eller', ad: { tr: '', en: '' }, baseUrl: '', renk: '#d9a47e' });
scene.add(player.root, player.hand.root);
player.hand.root.position.copy(player.restPoint());
for (const c of [opp, player]) {
  c.root.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) o.castShadow = true;
  });
}

// ---- Kamera ----
const camera = new THREE.PerspectiveCamera(PLAYER_CAMERA.fov, 16 / 9, 0.3, 200);
const CAMERAS: Record<string, { pos: THREE.Vector3; target: THREE.Vector3; fov: number }> = {
  fp: { pos: PLAYER_CAMERA.position.clone(), target: PLAYER_CAMERA.target.clone(), fov: PLAYER_CAMERA.fov },
  'fp-up': { pos: PLAYER_CAMERA.position.clone(), target: new THREE.Vector3(0, 5, -8), fov: PLAYER_CAMERA.fov },
  side: { pos: new THREE.Vector3(26, 7, -3), target: new THREE.Vector3(0, 3, -7), fov: 40 },
  front: { pos: new THREE.Vector3(0, 8.5, 3), target: new THREE.Vector3(0, 6.5, -6.5), fov: 45 },
  three: { pos: new THREE.Vector3(14, 12, 6), target: new THREE.Vector3(0, 3.5, -6), fov: 42 },
  hand: { pos: new THREE.Vector3(-13, 6, -1), target: new THREE.Vector3(-4, 0.5, -4), fov: 40 },
  face: { pos: new THREE.Vector3(3.5, 7.5, -1.5), target: new THREE.Vector3(0, 6.5, -6.5), fov: 40 },
};
const camOrder = Object.keys(CAMERAS);
let camName = params.get('cam') ?? 'fp';
function setCamera(name: string): void {
  const c = CAMERAS[name] ?? CAMERAS.fp;
  camName = name;
  camera.position.copy(c.pos);
  camera.fov = c.fov;
  camera.lookAt(c.target);
  camera.updateProjectionMatrix();
}
setCamera(camName);

function resize(): void {
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
}
addEventListener('resize', resize);
resize();

// ---- El hareketi: HandAnimator'a benzer basit bir oynatıcı ----
interface Reach {
  who: Character;
  from: THREE.Vector3;
  points: THREE.Vector3[];
  t: number;
  piece: THREE.Object3D | null;
  /** Kavrama noktası ile taşın tabanı arasındaki fark (kavrarken bir kez ölçülür). */
  offset: THREE.Vector3;
}
let reach: Reach | null = null;
const ease = (k: number) => k * k * (3 - 2 * k);
const gripPoint = (sq: Square) => {
  const type = pieces.get(sq)?.userData.piece as keyof typeof PIECE_HEIGHTS | undefined;
  return squareToWorld(sq).setY((type ? PIECE_HEIGHTS[type] : 1) * 0.82);
};
const randomSquare = (): Square => `${FILES[Math.floor(Math.random() * 8)]}${1 + Math.floor(Math.random() * 8)}` as Square;

/** Eli bir kareye götürür, kavrar, başka bir kareye taşır, bırakır ve dinlenmeye döner. */
function reachTo(who: Character, a: Square = randomSquare(), b: Square = randomSquare()): void {
  who.setHandBusy(true);
  const ga = gripPoint(a);
  const gb = squareToWorld(b).setY(ga.y);
  const piece = pieces.get(a) ?? null;
  const offset = piece ? ga.clone().sub(piece.position) : new THREE.Vector3();
  reach = { who, from: who.hand.root.position.clone(), points: [ga, gb, who.restPoint()], t: 0, piece, offset };
  if (reach.piece) {
    pieces.delete(a);
    pieces.set(b, reach.piece);
  }
}

function stepReach(dt: number): void {
  if (!reach) return;
  const r = reach;
  r.t += dt;
  const h = r.who.hand;
  const [ga, gb, rest] = r.points;
  const T = [0.6, 0.22, 0.8, 0.22, 0.55];
  let t = r.t;
  const offset = r.offset;
  if ((t -= 0) < T[0]) h.root.position.lerpVectors(r.from, ga, ease(t / T[0]));
  else if ((t -= T[0]) < T[1]) h.setGrip(t / T[1]);
  else if ((t -= T[1]) < T[2]) {
    h.root.position.lerpVectors(ga, gb, ease(t / T[2]));
    h.root.position.y += 1.2 * Math.sin((Math.PI * t) / T[2]);
    r.piece?.position.copy(h.root.position).sub(offset);
  } else if ((t -= T[2]) < T[3]) {
    r.piece?.position.copy(gb).setY(0);
    h.setGrip(1 - t / T[3]);
  } else if ((t -= T[3]) < T[4]) h.root.position.lerpVectors(gb, rest, ease(t / T[4]));
  else {
    h.root.position.copy(rest);
    r.who.setHandBusy(false);
    reach = null;
  }
}

/** Elin belirli bir kareye uzanmış hâlde durması (ekran görüntüsü için). */
function holdAt(who: Character, sq: Square, grip = 0.6): void {
  reach = null;
  who.setHandBusy(true);
  who.hand.root.position.copy(gripPoint(sq));
  who.hand.setGrip(grip);
}
function release(who: Character): void {
  who.hand.root.position.copy(who.restPoint());
  who.hand.setGrip(0.3);
  who.setHandBusy(false);
}

// ---- Bakış: rakip oyuncunun eline bakar ----
function updateLook(): void {
  if (reach && reach.who === player) opp.lookAt(player.hand.root.position);
  else if (reach && reach.who === opp) opp.lookAt(opp.hand.root.position);
  else opp.lookAt(null);
}

// ---- Döngü ----
let last = performance.now();
let simTime = 0;
function step(dt: number): void {
  simTime += dt;
  stepReach(dt);
  updateLook();
  opp.update(dt, simTime * 1000);
  player.update(dt, simTime * 1000);
}
function render(): void {
  renderer.render(scene, camera);
}
function loop(): void {
  const now = performance.now();
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  step(dt);
  render();
  requestAnimationFrame(loop);
}

// ---- Denetimler ----
const EVENTS: CharacterEvent[] = ['think-start', 'lost-piece', 'took-piece', 'gave-check', 'in-check', 'won', 'lost', 'draw'];
const panel = document.getElementById('panel')!;
const button = (label: string, fn: () => void) => {
  const b = document.createElement('button');
  b.textContent = label;
  b.onclick = fn;
  panel.appendChild(b);
};
EVENTS.forEach((ev, i) => button(`${i + 1} ${ev}`, () => opp.react(ev)));
button('0 think-end', () => opp.react('think-end'));
button('R rakip eli', () => reachTo(opp));
button('P oyuncu eli', () => reachTo(player));
button('C kamera', () => setCamera(camOrder[(camOrder.indexOf(camName) + 1) % camOrder.length]));
button('L dolgu ışığı', () => (fillLights.visible = !fillLights.visible));
addEventListener('keydown', (e) => {
  const n = Number(e.key);
  if (n >= 1 && n <= 8) opp.react(EVENTS[n - 1]);
  else if (e.key === '0') opp.react('think-end');
  else if (e.key === 'r') reachTo(opp);
  else if (e.key === 'p') reachTo(player);
  else if (e.key === 'c') setCamera(camOrder[(camOrder.indexOf(camName) + 1) % camOrder.length]);
  else if (e.key === 'l') fillLights.visible = !fillLights.visible;
});

/** Playwright için: zamanı sabit adımlarla ilerletir ve çizer. */
const api = {
  advance(seconds: number, fps = 60) {
    const n = Math.max(1, Math.round(seconds * fps));
    for (let i = 0; i < n; i++) step(1 / fps);
    render();
  },
  setCamera(name: string) {
    setCamera(name);
    render();
  },
  react: (ev: CharacterEvent) => opp.react(ev),
  reachTo: (who: 'rakip' | 'oyuncu', a?: Square, b?: Square) => reachTo(who === 'rakip' ? opp : player, a, b),
  holdAt: (who: 'rakip' | 'oyuncu', sq: Square, grip?: number) => holdAt(who === 'rakip' ? opp : player, sq, grip),
  release: (who: 'rakip' | 'oyuncu') => release(who === 'rakip' ? opp : player),
  fill: (on: boolean) => (fillLights.visible = on),
  info: () => ({ triangles: renderer.info.render.triangles, calls: renderer.info.render.calls }),
  triangles(who: 'rakip' | 'oyuncu') {
    const c = who === 'rakip' ? opp : player;
    let n = 0;
    for (const root of [c.root, c.hand.root]) {
      root.traverse((o) => {
        const m = o as THREE.Mesh;
        if (!m.isMesh || !m.visible) return;
        const g = m.geometry;
        n += (g.index ? g.index.count : g.attributes.position.count) / 3;
      });
    }
    return n;
  },
};
(window as unknown as { __preview: typeof api }).__preview = api;

if (manual) {
  api.advance(0.5);
} else {
  requestAnimationFrame(loop);
}
