import * as THREE from 'three';

/*
 * Kodla çizilen küçük dokular. Tuval (canvas) yoksa (ör. test ortamı) null döner; malzemeler dokusuz da çalışır.
 */

function canvas(w: number, h: number): { c: HTMLCanvasElement; g: CanvasRenderingContext2D } | null {
  if (typeof document === 'undefined') return null;
  // jsdom tuvali desteklemez (ve her çağrıda uyarı basar); test ortamında dokusuz çalışılır.
  if (typeof navigator !== 'undefined' && /jsdom/i.test(navigator.userAgent)) return null;
  try {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const g = c.getContext('2d');
    if (!g) return null;
    return { c, g };
  } catch {
    return null;
  }
}

/** Tekrarlanabilir sözde rastgele sayı üreteci; dokular her açılışta aynı görünür. */
export function seeded(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return ((s >>> 0) % 100000) / 100000;
  };
}

function finish(c: HTMLCanvasElement, repeat = 1, srgb = true): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat, repeat);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/** Giysi kumaşı: açık gri zemin üzerinde kir lekeleri, ince dikiş çizgileri ve kumaş dokusu (renk malzemeden gelir). */
export function grimeTexture(seed = 7): THREE.CanvasTexture | null {
  const cv = canvas(256, 256);
  if (!cv) return null;
  const { c, g } = cv;
  const rnd = seeded(seed);
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, 256, 256);
  // Kumaş lifi
  for (let i = 0; i < 2600; i++) {
    const v = 225 + Math.floor(rnd() * 30);
    g.fillStyle = `rgb(${v},${v},${v})`;
    g.fillRect(rnd() * 256, rnd() * 256, 1 + rnd() * 2, 1);
  }
  // Kir lekeleri
  for (let i = 0; i < 26; i++) {
    const x = rnd() * 256;
    const y = rnd() * 256;
    const r = 8 + rnd() * 36;
    const grad = g.createRadialGradient(x, y, 0, x, y, r);
    const a = 0.08 + rnd() * 0.18;
    grad.addColorStop(0, `rgba(60,48,30,${a})`);
    grad.addColorStop(1, 'rgba(60,48,30,0)');
    g.fillStyle = grad;
    g.fillRect(x - r, y - r, r * 2, r * 2);
  }
  // Kırışık izleri
  g.strokeStyle = 'rgba(90,80,60,0.18)';
  g.lineWidth = 1.2;
  for (let i = 0; i < 18; i++) {
    g.beginPath();
    const x = rnd() * 256;
    const y = rnd() * 256;
    g.moveTo(x, y);
    g.quadraticCurveTo(x + (rnd() - 0.5) * 40, y + 10 + rnd() * 20, x + (rnd() - 0.5) * 30, y + 30 + rnd() * 30);
    g.stroke();
  }
  return finish(c, 2);
}

/** Sarı-siyah çapraz şeritli uyarı bandı (kol ve bel bantları için). */
export function hazardTexture(): THREE.CanvasTexture | null {
  const cv = canvas(256, 32);
  if (!cv) return null;
  const { c, g } = cv;
  g.fillStyle = '#e8b80f';
  g.fillRect(0, 0, 256, 32);
  g.fillStyle = '#141414';
  for (let x = -32; x < 256 + 32; x += 32) {
    g.beginPath();
    g.moveTo(x, 32);
    g.lineTo(x + 16, 32);
    g.lineTo(x + 32, 0);
    g.lineTo(x + 16, 0);
    g.closePath();
    g.fill();
  }
  // Aşınmış kenarlar
  const rnd = seeded(3);
  g.fillStyle = 'rgba(40,30,10,0.35)';
  for (let i = 0; i < 160; i++) g.fillRect(rnd() * 256, rnd() < 0.5 ? rnd() * 3 : 29 + rnd() * 3, 2 + rnd() * 3, 1);
  const t = finish(c, 1);
  t.repeat.set(2, 1);
  return t;
}

/** Göğüs etiketi: kirli beyaz zemin, siyah çerçeve, uyarı simgesi ve kod. */
export function patchTexture(code: string): THREE.CanvasTexture | null {
  const cv = canvas(256, 128);
  if (!cv) return null;
  const { c, g } = cv;
  g.fillStyle = '#e9e4d4';
  g.fillRect(0, 0, 256, 128);
  g.strokeStyle = '#151515';
  g.lineWidth = 8;
  g.strokeRect(6, 6, 244, 116);
  // Üç kanatlı uyarı simgesi
  g.save();
  g.translate(62, 64);
  g.fillStyle = '#151515';
  for (let i = 0; i < 3; i++) {
    g.rotate((Math.PI * 2) / 3);
    g.beginPath();
    g.moveTo(0, 0);
    g.arc(0, 0, 38, -Math.PI / 2 - 0.5, -Math.PI / 2 + 0.5);
    g.closePath();
    g.fill();
  }
  g.fillStyle = '#e9e4d4';
  g.beginPath();
  g.arc(0, 0, 11, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#151515';
  g.beginPath();
  g.arc(0, 0, 7, 0, Math.PI * 2);
  g.fill();
  g.restore();
  g.fillStyle = '#151515';
  g.font = 'bold 40px monospace';
  g.textAlign = 'left';
  g.textBaseline = 'middle';
  g.fillText(code, 112, 52);
  g.font = 'bold 15px monospace';
  g.fillText('DENEK/SUBJECT', 112, 90);
  // Lekeler
  const rnd = seeded(11);
  for (let i = 0; i < 10; i++) {
    const x = rnd() * 256;
    const y = rnd() * 128;
    const r = 6 + rnd() * 22;
    const grad = g.createRadialGradient(x, y, 0, x, y, r);
    grad.addColorStop(0, 'rgba(80,60,30,0.25)');
    grad.addColorStop(1, 'rgba(80,60,30,0)');
    g.fillStyle = grad;
    g.fillRect(x - r, y - r, 2 * r, 2 * r);
  }
  const t = finish(c, 1);
  t.wrapS = THREE.ClampToEdgeWrapping;
  t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}

/** Filtre kapağı: koyu metal üzerinde delik dizisi. */
export function filterGrillTexture(): THREE.CanvasTexture | null {
  const cv = canvas(128, 128);
  if (!cv) return null;
  const { c, g } = cv;
  g.fillStyle = '#4a5240';
  g.fillRect(0, 0, 128, 128);
  g.fillStyle = '#0b0c0a';
  for (let y = 10; y < 128; y += 14) {
    for (let x = 10 + ((y / 14) % 2) * 7; x < 128; x += 14) {
      const dx = x - 64;
      const dy = y - 64;
      if (dx * dx + dy * dy > 54 * 54) continue;
      g.beginPath();
      g.arc(x, y, 4, 0, Math.PI * 2);
      g.fill();
    }
  }
  g.strokeStyle = '#2c3126';
  g.lineWidth = 6;
  g.beginPath();
  g.arc(64, 64, 58, 0, Math.PI * 2);
  g.stroke();
  const t = finish(c, 1);
  t.wrapS = THREE.ClampToEdgeWrapping;
  t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}
