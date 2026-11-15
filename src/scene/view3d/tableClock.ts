import * as THREE from 'three';
import type { Color } from '../../core/types';
import { formatClock, type ClockSnapshot } from '../../game/clock';

/** Saatin masadaki yeri (tahta beyaz taraftan bakarken oyuncunun sağı). Görünüm çevrilince saat de döner. */
export const CLOCK_POSITION = new THREE.Vector3(7.2, -0.292, 1.6);
/** Kadranlar oyuncunun gözüne dönük; oyuncunun kadranı sağda, rakibinki solda. */
export const CLOCK_YAW = 0.75;
const CLOCK_SCALE = 0.82;

const CASE_W = 2.3; // x: kadranların baktığı yön boyunca derinlik
const CASE_H = 2.7;
const CASE_L = 5; // z: iki oyuncu arasında uzanan boy
const DIAL_R = 0.98;
const DIAL_Z = 1.22;

interface Dial {
  minute: THREE.Object3D;
  hour: THREE.Object3D;
  second: THREE.Object3D;
  flag: THREE.Object3D;
  plunger: THREE.Object3D;
  plungerY: number;
  label: { ctx: CanvasRenderingContext2D | null; tex: THREE.Texture | null; text: string };
}

function readout(): { ctx: CanvasRenderingContext2D | null; tex: THREE.Texture | null; text: string } {
  if (typeof document === 'undefined') return { ctx: null, tex: null, text: '' };
  let ctx: CanvasRenderingContext2D | null = null;
  try {
    const c = document.createElement('canvas');
    c.width = 256;
    c.height = 96;
    ctx = c.getContext('2d');
  } catch {
    ctx = null;
  }
  if (!ctx) return { ctx: null, tex: null, text: '' };
  const tex = new THREE.CanvasTexture(ctx.canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return { ctx, tex, text: '' };
}

function drawReadout(label: Dial['label'], text: string, active: boolean, low: boolean): void {
  if (!label.ctx || !label.tex || label.text === `${text}|${active}|${low}`) return;
  label.text = `${text}|${active}|${low}`;
  const ctx = label.ctx;
  ctx.fillStyle = '#0d120e';
  ctx.fillRect(0, 0, 256, 96);
  ctx.fillStyle = low ? '#ff5a3c' : active ? '#a8ff8a' : '#4f7a48';
  ctx.font = 'bold 64px "Courier New", monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 128, 52);
  label.tex.needsUpdate = true;
}

/** Kadran yüzü dokusu: rakamlar ve çentikler. */
function faceTexture(): THREE.Texture | null {
  if (typeof document === 'undefined') return null;
  let ctx: CanvasRenderingContext2D | null = null;
  try {
    const c = document.createElement('canvas');
    c.width = c.height = 256;
    ctx = c.getContext('2d');
  } catch {
    ctx = null;
  }
  if (!ctx) return null;
  ctx.fillStyle = '#ece6d4';
  ctx.fillRect(0, 0, 256, 256);
  ctx.translate(128, 128);
  ctx.strokeStyle = '#222';
  for (let i = 0; i < 60; i++) {
    const a = (i / 60) * Math.PI * 2;
    const long = i % 5 === 0;
    ctx.lineWidth = long ? 5 : 2;
    ctx.beginPath();
    ctx.moveTo(Math.sin(a) * (long ? 98 : 106), -Math.cos(a) * (long ? 98 : 106));
    ctx.lineTo(Math.sin(a) * 118, -Math.cos(a) * 118);
    ctx.stroke();
  }
  ctx.fillStyle = '#1b1b1b';
  ctx.font = 'bold 26px Georgia, serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (let h = 1; h <= 12; h++) {
    const a = (h / 12) * Math.PI * 2;
    ctx.fillText(String(h), Math.sin(a) * 78, -Math.cos(a) * 78);
  }
  // Bayrak düşme bölgesi
  ctx.fillStyle = 'rgba(180,30,20,0.85)';
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.arc(0, 0, 118, -Math.PI / 2 - 0.42, -Math.PI / 2);
  ctx.closePath();
  ctx.globalAlpha = 0.25;
  ctx.fill();
  ctx.globalAlpha = 1;
  const tex = new THREE.CanvasTexture(ctx.canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/**
 * Masadaki analog satranç saati. İki kadran: yakındaki oyuncunun, uzaktaki rakibin.
 * Kadranlar gerçek saatlerdeki gibi kurulur: süre bittiğinde yelkovan 12'ye gelir ve bayrak düşer.
 * Altlarında okunması kolay olsun diye küçük bir sayısal gösterge vardır.
 */
export class TableClock {
  readonly group = new THREE.Group();
  private dials: Record<'near' | 'far', Dial>;
  private nearColor: Color = 'w';
  private snap: ClockSnapshot | null = null;
  private frozen = false;
  private disposables: Array<{ dispose(): void }> = [];

  constructor() {
    this.group.name = 'masa-saati';
    const caseMat = this.track(new THREE.MeshStandardMaterial({ color: '#5f7d78', roughness: 0.55, metalness: 0.25 }));
    const trimMat = this.track(new THREE.MeshStandardMaterial({ color: '#c9b27a', roughness: 0.35, metalness: 0.8 }));
    const darkMat = this.track(new THREE.MeshStandardMaterial({ color: '#1d1f1f', roughness: 0.6, metalness: 0.3 }));
    const faceTex = faceTexture();
    if (faceTex) this.disposables.push(faceTex);
    const faceMat = this.track(new THREE.MeshStandardMaterial({ color: '#ffffff', map: faceTex, roughness: 0.7 }));
    if (!faceTex) faceMat.color.set('#ece6d4');
    const glassMat = this.track(
      new THREE.MeshPhysicalMaterial({ color: '#ffffff', roughness: 0.05, transmission: 0, transparent: true, opacity: 0.12, metalness: 0 }),
    );
    const handMat = this.track(new THREE.MeshStandardMaterial({ color: '#141414', roughness: 0.5 }));
    const redMat = this.track(new THREE.MeshStandardMaterial({ color: '#b3261e', roughness: 0.5 }));

    const body = new THREE.Group();
    this.group.add(body);
    // Gövde: önden bakınca yamuk (üstü dar); kadranlar eğik ön yüzdedir.
    const shape = new THREE.Shape();
    shape.moveTo(-CASE_W / 2, 0);
    shape.lineTo(CASE_W / 2, 0);
    shape.lineTo(CASE_W / 2 - 0.35, CASE_H);
    shape.lineTo(-CASE_W / 2 + 0.55, CASE_H);
    shape.closePath();
    const caseGeo = this.track(new THREE.ExtrudeGeometry(shape, { depth: CASE_L, bevelEnabled: true, bevelSize: 0.08, bevelThickness: 0.08, bevelSegments: 2 }));
    caseGeo.translate(0, 0, -CASE_L / 2);
    const shell = new THREE.Mesh(caseGeo, caseMat);
    shell.castShadow = true;
    shell.receiveShadow = true;
    body.add(shell);

    // Ön yüz (-x) eğimi
    const slope = Math.atan2(0.55, CASE_H);
    const front = new THREE.Group();
    front.position.set(-CASE_W / 2 + 0.275, CASE_H / 2, 0);
    front.rotation.z = -slope;
    body.add(front);

    const mk = (geo: THREE.BufferGeometry, m: THREE.Material, shadow = true) => {
      this.track(geo);
      const mesh = new THREE.Mesh(geo, m);
      mesh.castShadow = shadow;
      return mesh;
    };

    const buildDial = (z: number): Dial => {
      const dial = new THREE.Group();
      dial.position.set(-0.09, 0.22, z);
      dial.rotation.y = -Math.PI / 2; // yerel +z, saatin önüne (-x) bakar
      front.add(dial);
      const bezel = mk(new THREE.TorusGeometry(DIAL_R + 0.05, 0.09, 10, 40), trimMat);
      dial.add(bezel);
      const face = mk(new THREE.CircleGeometry(DIAL_R, 40), faceMat, false);
      face.position.z = 0.01;
      dial.add(face);
      const glass = mk(new THREE.CircleGeometry(DIAL_R, 40), glassMat, false);
      glass.position.z = 0.12;
      dial.add(glass);
      const hand = (len: number, width: number, m: THREE.Material, zz: number) => {
        const pivot = new THREE.Group();
        pivot.position.z = zz;
        const g = new THREE.BoxGeometry(width, len, 0.02);
        g.translate(0, len / 2 - 0.08, 0);
        pivot.add(mk(g, m, false));
        dial.add(pivot);
        return pivot;
      };
      const hour = hand(DIAL_R * 0.5, 0.07, handMat, 0.03);
      const minute = hand(DIAL_R * 0.82, 0.05, handMat, 0.05);
      const second = hand(DIAL_R * 0.88, 0.018, redMat, 0.07);
      const cap = mk(new THREE.CircleGeometry(0.07, 12), trimMat, false);
      cap.position.z = 0.08;
      dial.add(cap);
      // Bayrak: 12'nin hemen solunda, yelkovan kaldırır, süre bitince düşer.
      const flag = new THREE.Group();
      flag.position.set(-0.08, DIAL_R * 0.72, 0.06);
      const flagMesh = mk(new THREE.PlaneGeometry(0.1, 0.32), redMat, false);
      flagMesh.position.y = -0.16;
      flag.add(flagMesh);
      dial.add(flag);

      // Sayısal gösterge (kadranın altında)
      const label = readout();
      if (label.tex) {
        this.disposables.push(label.tex);
        const lm = this.track(new THREE.MeshBasicMaterial({ map: label.tex, toneMapped: false }));
        const screen = mk(new THREE.PlaneGeometry(0.95, 0.36), lm, false);
        screen.position.set(-0.09, -0.92, z);
        screen.rotation.y = -Math.PI / 2;
        front.add(screen);
      }

      // Üstteki basma düğmesi
      const plunger = new THREE.Group();
      const plungerY = CASE_H + 0.05;
      plunger.position.set(0.1, plungerY, z);
      const stem = mk(new THREE.CylinderGeometry(0.16, 0.16, 0.5, 12), trimMat);
      stem.position.y = 0.25;
      const knob = mk(new THREE.CylinderGeometry(0.38, 0.4, 0.22, 20), darkMat);
      knob.position.y = 0.55;
      plunger.add(stem, knob);
      body.add(plunger);

      return { minute, hour, second, flag, plunger, plungerY, label };
    };

    this.dials = { near: buildDial(DIAL_Z), far: buildDial(-DIAL_Z) };

    // Ayaklar
    for (const zz of [-CASE_L / 2 + 0.4, CASE_L / 2 - 0.4]) {
      for (const xx of [-CASE_W / 2 + 0.3, CASE_W / 2 - 0.3]) {
        const foot = mk(new THREE.CylinderGeometry(0.16, 0.2, 0.12, 10), darkMat);
        foot.position.set(xx, -0.02, zz);
        body.add(foot);
      }
    }

    this.group.scale.setScalar(CLOCK_SCALE);
    this.group.position.copy(CLOCK_POSITION);
    this.group.rotation.y = CLOCK_YAW;
    this.render();
  }

  /** Görünüm çevrildiğinde (oyuncu siyahsa) saat masanın öbür tarafına, oyuncunun sağına geçer. */
  setFlipped(flipped: boolean): void {
    this.nearColor = flipped ? 'b' : 'w';
    const pos = CLOCK_POSITION.clone();
    if (flipped) pos.set(-pos.x, pos.y, -pos.z);
    this.group.position.copy(pos);
    this.group.rotation.y = CLOCK_YAW + (flipped ? Math.PI : 0);
    this.render();
  }

  /** null: süresiz oyun; kadranlar 12'de durur ve göstergede ∞ yazar. */
  setSnapshot(snap: ClockSnapshot | null): void {
    this.snap = snap;
    this.render();
  }

  /** Süre donar (Kara Delik). İbreler son konumlarında kalır. */
  setFrozen(frozen: boolean): void {
    this.frozen = frozen;
    this.render();
  }

  /** Düğmelerin yumuşak hareketi; düğmeler hâlâ hareket ediyorsa true. */
  update(dt: number): boolean {
    let moving = false;
    const running = this.snap?.running ?? null;
    for (const side of ['near', 'far'] as const) {
      const color = side === 'near' ? this.nearColor : this.nearColor === 'w' ? 'b' : 'w';
      const d = this.dials[side];
      // Saati akan tarafın düğmesi yukarıdadır; öbür taraf düğmesine basmıştır.
      const down = running !== null && running !== color;
      const target = d.plungerY - (down ? 0.32 : 0);
      const diff = target - d.plunger.position.y;
      if (Math.abs(diff) > 1e-3) {
        moving = true;
        d.plunger.position.y += dt > 0 ? diff * Math.min(1, dt * 18) : 0;
      } else d.plunger.position.y = target;
    }
    return moving;
  }

  dispose(): void {
    for (const d of this.disposables) d.dispose();
    this.disposables = [];
  }

  private render(): void {
    for (const side of ['near', 'far'] as const) {
      const color: Color = side === 'near' ? this.nearColor : this.nearColor === 'w' ? 'b' : 'w';
      const d = this.dials[side];
      const ms = this.snap ? Math.max(0, this.snap[color]) : 0;
      // Kalan süre kadar 12'den geri: 5 dakika kaldıysa saat 11:55'i gösterir.
      const totalMin = this.snap ? ms / 60_000 : 0;
      const clockMin = (12 * 60 - totalMin) % (12 * 60);
      d.minute.rotation.z = -((clockMin % 60) / 60) * Math.PI * 2;
      d.hour.rotation.z = -(clockMin / 720) * Math.PI * 2;
      const secs = this.snap ? (ms / 1000) % 60 : 0;
      d.second.rotation.z = this.snap ? -((60 - secs) / 60) * Math.PI * 2 : 0;
      // Bayrak: son 5 dakikada yelkovanla birlikte kalkar, süre bitince düşer.
      const lift = this.snap ? THREE.MathUtils.clamp(1 - totalMin / 5, 0, 1) : 0;
      d.flag.rotation.z = this.snap && ms <= 0 ? -1.2 : lift * 0.5;
      const text = !this.snap || this.frozen ? '∞' : formatClock(ms);
      drawReadout(d.label, text, this.snap?.running === color && !this.frozen, !!this.snap && ms < 20_000);
    }
  }

  private track<T extends { dispose(): void }>(x: T): T {
    this.disposables.push(x);
    return x;
  }
}
