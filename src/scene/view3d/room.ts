import * as THREE from 'three';
import type { OrtamTheme, RoomKind } from '../../themes/types';
import type { Quality } from './environment';
import { buildAutumnPark } from './park';

/**
 * Kodla çizilen kapalı odalar. Ölçek: 1 birim ≈ 5,5 cm; tahtanın üstü y=0, oda zemini y=FLOOR_Y.
 * Oda grubunun `userData.tick(now)` işlevi her karede çağrılır (lamba sallanması, titreme).
 */
export const FLOOR_Y = -14;
const CEILING_Y = 33;
const HALF_W = 38;
const BACK_Z = -52;
const FRONT_Z = 42;

export type RoomTick = (now: number) => void;

export function buildRoom(kind: RoomKind, ortam: OrtamTheme, quality: Quality): THREE.Group {
  switch (kind) {
    case 'sorgu':
      return buildInterrogationRoom(ortam, quality);
    case 'park':
      return buildAutumnPark(ortam, quality);
  }
}

// ---------- Dokular ----------

/** Basit, tekrarlanabilir rastgele sayı üreteci; oda her açılışta aynı görünür. */
export function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

export function canvas(w: number, h: number): CanvasRenderingContext2D | null {
  if (typeof document === 'undefined') return null;
  try {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    return c.getContext('2d');
  } catch {
    return null;
  }
}

export function texture(ctx: CanvasRenderingContext2D | null, repeat: [number, number]): THREE.Texture | null {
  if (!ctx) return null;
  const tex = new THREE.CanvasTexture(ctx.canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeat[0], repeat[1]);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

/** Lekeli beton: gürültü, yağmur izleri ve döküm kalıbı çizgileri. */
function concreteTexture(base: string, seed: number, repeat: [number, number], panels = true): THREE.Texture | null {
  const size = 512;
  const ctx = canvas(size, size);
  if (!ctx) return null;
  const r = rng(seed);
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, size, size);
  // İnce gürültü
  const img = ctx.getImageData(0, 0, size, size);
  for (let i = 0; i < img.data.length; i += 4) {
    const n = (r() - 0.5) * 26;
    img.data[i] = Math.max(0, Math.min(255, img.data[i] + n));
    img.data[i + 1] = Math.max(0, Math.min(255, img.data[i + 1] + n));
    img.data[i + 2] = Math.max(0, Math.min(255, img.data[i + 2] + n));
  }
  ctx.putImageData(img, 0, 0);
  // Büyük lekeler
  for (let i = 0; i < 26; i++) {
    const x = r() * size;
    const y = r() * size;
    const rad = 20 + r() * 90;
    const g = ctx.createRadialGradient(x, y, 0, x, y, rad);
    const dark = r() < 0.7;
    g.addColorStop(0, dark ? `rgba(20,16,10,${0.12 + r() * 0.2})` : `rgba(255,250,235,${0.05 + r() * 0.06})`);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x - rad, y - rad, rad * 2, rad * 2);
  }
  // Yukarıdan akan su izleri
  for (let i = 0; i < 40; i++) {
    const x = r() * size;
    const len = 40 + r() * 220;
    const g = ctx.createLinearGradient(0, 0, 0, len);
    g.addColorStop(0, `rgba(25,20,12,${0.15 + r() * 0.2})`);
    g.addColorStop(1, 'rgba(25,20,12,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x, 0, 1 + r() * 3, len);
  }
  if (panels) {
    ctx.strokeStyle = 'rgba(0,0,0,0.35)';
    ctx.lineWidth = 2;
    ctx.strokeRect(1, 1, size - 2, size - 2);
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    for (const [x, y] of [
      [40, 40],
      [size - 40, 40],
      [40, size - 40],
      [size - 40, size - 40],
    ]) {
      ctx.beginPath();
      ctx.arc(x, y, 5, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  return texture(ctx, repeat);
}

/** Aşınmış karo zemin. */
function tileTexture(seed: number, repeat: [number, number]): THREE.Texture | null {
  const size = 512;
  const ctx = canvas(size, size);
  if (!ctx) return null;
  const r = rng(seed);
  const n = 4;
  const cell = size / n;
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const v = 58 + Math.floor(r() * 18);
      ctx.fillStyle = `rgb(${v},${v - 2},${v - 5})`;
      ctx.fillRect(x * cell, y * cell, cell, cell);
    }
  }
  const img = ctx.getImageData(0, 0, size, size);
  for (let i = 0; i < img.data.length; i += 4) {
    const k = (r() - 0.5) * 20;
    img.data[i] += k;
    img.data[i + 1] += k;
    img.data[i + 2] += k;
  }
  ctx.putImageData(img, 0, 0);
  ctx.strokeStyle = 'rgba(15,12,8,0.9)';
  ctx.lineWidth = 4;
  for (let i = 0; i <= n; i++) {
    ctx.beginPath();
    ctx.moveTo(i * cell, 0);
    ctx.lineTo(i * cell, size);
    ctx.moveTo(0, i * cell);
    ctx.lineTo(size, i * cell);
    ctx.stroke();
  }
  for (let i = 0; i < 18; i++) {
    const x = r() * size;
    const y = r() * size;
    const rad = 30 + r() * 80;
    const g = ctx.createRadialGradient(x, y, 0, x, y, rad);
    g.addColorStop(0, `rgba(30,22,12,${0.2 + r() * 0.25})`);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x - rad, y - rad, rad * 2, rad * 2);
  }
  return texture(ctx, repeat);
}

// ---------- Sorgu Odası ----------

export function mat(color: string, opts: Partial<THREE.MeshStandardMaterialParameters> = {}): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.85, metalness: 0, ...opts });
}

export function box(w: number, h: number, d: number, material: THREE.Material, shadows = true): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  m.castShadow = shadows;
  m.receiveShadow = true;
  return m;
}
export function cyl(rTop: number, rBottom: number, h: number, material: THREE.Material, seg = 16): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rTop, rBottom, h, seg), material);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

/**
 * Sorgu Odası: lekeli beton duvarlar, karo zemin, tavandan sarkan ve hafifçe sallanan tek lamba,
 * arka duvarda demir kapı, borular, havalandırma ızgarası ve bir dolap.
 */
function buildInterrogationRoom(ortam: OrtamTheme, quality: Quality): THREE.Group {
  const group = new THREE.Group();
  group.name = 'oda-sorgu';
  const width = HALF_W * 2;
  const depth = FRONT_Z - BACK_Z;
  const height = CEILING_Y - FLOOR_Y;
  const midZ = (FRONT_Z + BACK_Z) / 2;

  // Zemin
  const floorMat = mat(ortam.zemin, { roughness: 0.75 });
  const floorTex = tileTexture(7, [width / 18, depth / 18]);
  if (floorTex) {
    floorMat.map = floorTex;
    floorMat.color.set('#ffffff');
  }
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(width, depth), floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(0, FLOOR_Y, midZ);
  floor.receiveShadow = true;
  group.add(floor);

  // Duvarlar ve tavan
  const wallMat = mat('#6e6a62', { roughness: 0.95 });
  const wallTex = concreteTexture('#7a766c', 11, [width / 24, height / 24]);
  if (wallTex) {
    wallMat.map = wallTex;
    wallMat.color.set('#cfcac0');
  }
  const sideMat = wallMat.clone();
  if (wallTex) {
    const t = wallTex.clone();
    t.repeat.set(depth / 24, height / 24);
    t.needsUpdate = true;
    sideMat.map = t;
  }
  const ceilMat = mat('#2b2a28', { roughness: 1 });

  const back = new THREE.Mesh(new THREE.PlaneGeometry(width, height), wallMat);
  back.position.set(0, FLOOR_Y + height / 2, BACK_Z);
  const front = new THREE.Mesh(new THREE.PlaneGeometry(width, height), wallMat);
  front.position.set(0, FLOOR_Y + height / 2, FRONT_Z);
  front.rotation.y = Math.PI;
  const left = new THREE.Mesh(new THREE.PlaneGeometry(depth, height), sideMat);
  left.position.set(-HALF_W, FLOOR_Y + height / 2, midZ);
  left.rotation.y = Math.PI / 2;
  const right = new THREE.Mesh(new THREE.PlaneGeometry(depth, height), sideMat);
  right.position.set(HALF_W, FLOOR_Y + height / 2, midZ);
  right.rotation.y = -Math.PI / 2;
  const ceiling = new THREE.Mesh(new THREE.PlaneGeometry(width, depth), ceilMat);
  ceiling.rotation.x = Math.PI / 2;
  ceiling.position.set(0, CEILING_Y, midZ);
  for (const m of [back, front, left, right, ceiling]) {
    m.receiveShadow = true;
    group.add(m);
  }

  // Duvar dibi süpürgelik ve orta hizada boyalı bant (eski kurum binası havası)
  const bandMat = mat('#3d4a44', { roughness: 0.7 });
  const skirt = box(width, 2.2, 0.4, bandMat, false);
  skirt.position.set(0, FLOOR_Y + 1.1, BACK_Z + 0.2);
  group.add(skirt);
  const lowerPaint = new THREE.Mesh(new THREE.PlaneGeometry(width, 18), mat('#4a5650', { roughness: 0.8 }));
  lowerPaint.position.set(0, FLOOR_Y + 9, BACK_Z + 0.05);
  lowerPaint.receiveShadow = true;
  group.add(lowerPaint);
  for (const x of [-HALF_W + 0.05, HALF_W - 0.05]) {
    const side = new THREE.Mesh(new THREE.PlaneGeometry(depth, 18), lowerPaint.material);
    side.position.set(x, FLOOR_Y + 9, midZ);
    side.rotation.y = x < 0 ? Math.PI / 2 : -Math.PI / 2;
    side.receiveShadow = true;
    group.add(side);
  }

  // Demir kapı (arka duvarda, sol tarafta) ve küçük gözetleme penceresi
  const metal = mat('#4b4d4c', { roughness: 0.55, metalness: 0.6 });
  const rust = mat('#5a3d2a', { roughness: 0.9, metalness: 0.2 });
  const doorFrame = box(19, 37, 1, rust);
  doorFrame.position.set(-20, FLOOR_Y + 18.5, BACK_Z + 0.5);
  group.add(doorFrame);
  const door = box(16.5, 35, 1.2, metal);
  door.position.set(-20, FLOOR_Y + 17.5, BACK_Z + 0.9);
  group.add(door);
  const windowGlow = new THREE.Mesh(
    new THREE.PlaneGeometry(6, 3.4),
    new THREE.MeshStandardMaterial({ color: '#0c1418', emissive: '#6fa3b8', emissiveIntensity: 0.5, roughness: 0.2 }),
  );
  windowGlow.position.set(-20, FLOOR_Y + 27, BACK_Z + 1.55);
  group.add(windowGlow);
  for (let i = -2; i <= 2; i++) {
    const bar = cyl(0.12, 0.12, 3.4, metal, 6);
    bar.position.set(-20 + i * 1.2, FLOOR_Y + 27, BACK_Z + 1.7);
    group.add(bar);
  }
  const handle = box(0.6, 3.5, 0.8, metal);
  handle.position.set(-13.8, FLOOR_Y + 17, BACK_Z + 1.9);
  group.add(handle);
  for (const y of [6, 29]) {
    const hinge = cyl(0.5, 0.5, 2.6, rust, 8);
    hinge.position.set(-28.1, FLOOR_Y + y, BACK_Z + 1.5);
    group.add(hinge);
  }
  // Kapı penceresinden süzülen soğuk ışık
  const doorLight = new THREE.PointLight('#7fb2d0', 40, 30, 1.6);
  doorLight.position.set(-20, FLOOR_Y + 27, BACK_Z + 4);
  group.add(doorLight);

  // Borular: arka duvar boyunca iki yatay boru, sağda dikey iniş
  const pipeMat = mat('#55524a', { roughness: 0.5, metalness: 0.7 });
  for (const [y, r] of [
    [27.5, 0.9],
    [25, 0.55],
  ] as const) {
    const pipe = cyl(r, r, width, pipeMat, 14);
    pipe.rotation.z = Math.PI / 2;
    pipe.position.set(0, y, BACK_Z + 2.5);
    group.add(pipe);
    for (let x = -32; x <= 32; x += 16) {
      const clamp = cyl(r + 0.25, r + 0.25, 0.8, rust, 12);
      clamp.rotation.z = Math.PI / 2;
      clamp.position.set(x, y, BACK_Z + 2.5);
      group.add(clamp);
    }
  }
  const drop = cyl(0.9, 0.9, CEILING_Y - FLOOR_Y, pipeMat, 14);
  drop.position.set(30, (CEILING_Y + FLOOR_Y) / 2, BACK_Z + 2.5);
  group.add(drop);
  const valve = new THREE.Mesh(new THREE.TorusGeometry(1.4, 0.22, 8, 20), mat('#7a1f18', { roughness: 0.6, metalness: 0.4 }));
  valve.position.set(30, 6, BACK_Z + 4.1);
  group.add(valve);

  // Havalandırma ızgarası
  const vent = box(9, 5, 0.5, metal);
  vent.position.set(14, 22, BACK_Z + 0.3);
  group.add(vent);
  const slatMat = mat('#1a1b1b', { roughness: 0.8 });
  for (let i = 0; i < 6; i++) {
    const slat = box(8.2, 0.25, 0.6, slatMat, false);
    slat.position.set(14, 20.3 + i * 0.7, BACK_Z + 0.6);
    slat.rotation.x = -0.5;
    group.add(slat);
  }

  // Sağ arka köşede metal dolap; üstünde kavanozlar
  const cabinet = box(12, 26, 7, mat('#5e6460', { roughness: 0.6, metalness: 0.4 }));
  cabinet.position.set(27, FLOOR_Y + 13, BACK_Z + 4.5);
  group.add(cabinet);
  const seam = box(0.15, 24, 0.2, slatMat, false);
  seam.position.set(27, FLOOR_Y + 13, BACK_Z + 8.05);
  group.add(seam);
  const glass = new THREE.MeshStandardMaterial({ color: '#9fb39a', roughness: 0.15, metalness: 0, transparent: true, opacity: 0.55 });
  const murk = mat('#4b3d22', { roughness: 0.4, emissive: '#1a1206', emissiveIntensity: 0.4 });
  const jarRand = rng(23);
  for (let i = 0; i < 4; i++) {
    const h = 2.5 + jarRand() * 2;
    const jar = cyl(1, 1, h, glass, 14);
    jar.position.set(23 + i * 2.6, FLOOR_Y + 26 + h / 2, BACK_Z + 4.5);
    jar.castShadow = false;
    group.add(jar);
    const fill = cyl(0.85, 0.85, h * (0.4 + jarRand() * 0.4), murk, 12);
    fill.position.set(jar.position.x, FLOOR_Y + 26 + (fill.geometry as THREE.CylinderGeometry).parameters.height / 2, jar.position.z);
    group.add(fill);
  }

  // Sol duvarda tek yönlü ayna (karanlık cam)
  const mirror = new THREE.Mesh(
    new THREE.PlaneGeometry(28, 12),
    new THREE.MeshStandardMaterial({ color: '#0a0c0d', roughness: 0.08, metalness: 0.9 }),
  );
  mirror.position.set(-HALF_W + 0.1, 12, -14);
  mirror.rotation.y = Math.PI / 2;
  group.add(mirror);
  const mirrorFrame = box(0.6, 13.2, 29.2, metal);
  mirrorFrame.position.set(-HALF_W + 0.25, 12, -14);
  group.add(mirrorFrame);

  // Sağ duvarda saat (durmuş)
  const wallClock = new THREE.Group();
  const face = cyl(3.2, 3.2, 0.5, mat('#d9d2bf', { roughness: 0.6 }), 32);
  face.rotation.x = Math.PI / 2;
  wallClock.add(face);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(3.2, 0.3, 8, 32), metal);
  wallClock.add(rim);
  const handMat = mat('#111111');
  const hour = box(0.25, 1.9, 0.1, handMat, false);
  hour.position.set(0.55, 0.6, 0.3);
  hour.rotation.z = -0.9;
  const minute = box(0.18, 2.7, 0.1, handMat, false);
  minute.position.set(-0.3, 1.3, 0.32);
  minute.rotation.z = 0.25;
  wallClock.add(hour, minute);
  wallClock.position.set(HALF_W - 0.4, 22, -20);
  wallClock.rotation.y = -Math.PI / 2;
  group.add(wallClock);

  // Tavandan sarkan lamba
  const pivot = new THREE.Group();
  pivot.position.set(0, CEILING_Y, 0);
  group.add(pivot);
  const lampY = 17; // tahtanın ~95 cm üstü
  const cordLen = CEILING_Y - lampY;
  const cord = cyl(0.08, 0.08, cordLen, mat('#111111'), 6);
  cord.position.y = -cordLen / 2;
  cord.castShadow = false;
  pivot.add(cord);
  const shadeMat = new THREE.MeshStandardMaterial({ color: '#2f3b33', roughness: 0.5, metalness: 0.5, side: THREE.DoubleSide });
  const shade = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 4.2, 3, 28, 1, true), shadeMat);
  shade.position.y = -cordLen - 1.2;
  shade.castShadow = true;
  pivot.add(shade);
  const shadeInner = new THREE.Mesh(
    new THREE.CylinderGeometry(0.88, 4.15, 2.95, 28, 1, true),
    new THREE.MeshStandardMaterial({ color: '#f2e6c8', roughness: 0.8, side: THREE.BackSide, emissive: '#ffcf87', emissiveIntensity: 0.25 }),
  );
  shadeInner.position.copy(shade.position);
  pivot.add(shadeInner);
  const bulbMat = new THREE.MeshStandardMaterial({ color: '#fff4dc', emissive: '#ffd590', emissiveIntensity: 3 });
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.75, 16, 12), bulbMat);
  bulb.position.y = -cordLen - 2.1;
  pivot.add(bulb);

  const lamp = new THREE.SpotLight(ortam.isikRengi, ortam.isikSiddeti * 900, 70, THREE.MathUtils.degToRad(58), 0.55, 1.7);
  lamp.position.y = -cordLen - 2.2;
  const lampTarget = new THREE.Object3D();
  lampTarget.position.y = -cordLen - 30;
  pivot.add(lamp, lampTarget);
  lamp.target = lampTarget;
  if (quality !== 'low') {
    lamp.castShadow = true;
    const size = quality === 'high' ? 4096 : 2048;
    lamp.shadow.mapSize.set(size, size);
    // Gölge haritası yalnızca masanın çevresini kapsar: taşların gölgeleri keskin kalır.
    lamp.shadow.focus = 0.6;
    lamp.shadow.camera.near = 2;
    lamp.shadow.camera.far = 60;
    lamp.shadow.bias = -0.003;
    lamp.shadow.normalBias = 0.3;
    lamp.shadow.radius = quality === 'high' ? 5 : 3;
  }
  const baseIntensity = lamp.intensity;

  // Odanın geri kalanı neredeyse karanlık; çok zayıf bir genel ışık ayrıntıyı tamamen yitirmemek için.
  group.add(new THREE.HemisphereLight('#8a8f99', '#1a1714', 0.8));
  // Arka duvarı hafifçe yalayan, tavana yakın zayıf bir sıcak ışık: odanın derinliği okunsun.
  const wash = new THREE.PointLight('#c9a878', 260, 70, 1.4);
  wash.position.set(6, 26, -30);
  group.add(wash);
  // Oyuncunun arkasından gelen çok zayıf soğuk dolgu: karşıdaki karakterin yüzü tamamen kararmasın.
  const fill = new THREE.DirectionalLight('#9fb0c8', 0.35);
  fill.position.set(6, 14, 30);
  group.add(fill);

  // Karşıdaki oturanın sırtını ve omuzlarını ayıran soğuk kenar ışığı (kapı penceresinden geliyormuş gibi).
  const rimLight = new THREE.DirectionalLight('#7fa6c8', 0.9);
  rimLight.position.set(-14, 22, -40);
  group.add(rimLight);

  // Lambanın sallanması ve ara sıra titremesi
  const flicker = rng(99);
  let nextFlicker = 6000;
  let flickerUntil = 0;
  const tick: RoomTick = (now) => {
    pivot.rotation.z = Math.sin(now / 2300) * 0.035;
    pivot.rotation.x = Math.sin(now / 3100 + 1.3) * 0.025;
    let k = 1;
    if (now > nextFlicker) {
      flickerUntil = now + 180 + flicker() * 420;
      nextFlicker = now + 7000 + flicker() * 14000;
    }
    if (now < flickerUntil) k = flicker() < 0.5 ? 0.25 + flicker() * 0.3 : 1;
    else k = 0.97 + Math.sin(now / 90) * 0.015 + Math.sin(now / 37) * 0.01;
    lamp.intensity = baseIntensity * k;
    bulbMat.emissiveIntensity = 3 * k;
  };
  group.userData.tick = tick;
  return group;
}
