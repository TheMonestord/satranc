import * as THREE from 'three';
import type { OrtamTheme } from '../../themes/types';
import type { Quality } from './environment';
import { FLOOR_Y, canvas, cyl, mat, rng, texture, type RoomTick } from './room';

/** Sonbahar yaprak renkleri: altın sarısı, turuncu, kiremit, kızıl ve hâlâ biraz yeşil kalanlar. */
const LEAF_COLORS = ['#f2c14e', '#eda33a', '#e07b2b', '#c9532a', '#a83a26', '#d9b23f', '#9bab3c'];

/** Çimen dokusu: yeşilin tonları ve üstüne serpilmiş dökülmüş yapraklar. */
function grassTexture(seed: number, repeat: [number, number]): THREE.Texture | null {
  const size = 512;
  const ctx = canvas(size, size);
  if (!ctx) return null;
  const r = rng(seed);
  ctx.fillStyle = '#6f8f3c';
  ctx.fillRect(0, 0, size, size);
  for (let i = 0; i < 2600; i++) {
    const g = 110 + Math.floor(r() * 60);
    ctx.fillStyle = `rgba(${70 + Math.floor(r() * 50)},${g},${40 + Math.floor(r() * 30)},0.55)`;
    ctx.fillRect(r() * size, r() * size, 2 + r() * 3, 6 + r() * 10);
  }
  for (let i = 0; i < 18; i++) {
    const x = r() * size;
    const y = r() * size;
    const rad = 40 + r() * 90;
    const grad = ctx.createRadialGradient(x, y, 0, x, y, rad);
    grad.addColorStop(0, `rgba(${r() < 0.5 ? '160,150,60' : '60,90,40'},0.25)`);
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(x - rad, y - rad, rad * 2, rad * 2);
  }
  for (let i = 0; i < 260; i++) {
    ctx.save();
    ctx.translate(r() * size, r() * size);
    ctx.rotate(r() * Math.PI * 2);
    ctx.fillStyle = LEAF_COLORS[Math.floor(r() * LEAF_COLORS.length)];
    ctx.globalAlpha = 0.85;
    ctx.beginPath();
    ctx.ellipse(0, 0, 4 + r() * 4, 2 + r() * 2, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  return texture(ctx, repeat);
}

/** Gökyüzü: ufukta sıcak altın, yukarıda yumuşak mavi. */
function buildSky(): THREE.Mesh {
  const geo = new THREE.SphereGeometry(400, 32, 16);
  const top = new THREE.Color('#8fb6d8');
  const mid = new THREE.Color('#f6dca8');
  const low = new THREE.Color('#f3c98a');
  const pos = geo.attributes.position;
  const colors: number[] = [];
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const h = pos.getY(i) / 400;
    if (h > 0.05) c.copy(mid).lerp(top, Math.min(1, (h - 0.05) / 0.45));
    else c.copy(low).lerp(mid, Math.max(0, (h + 0.2) / 0.25));
    colors.push(c.r, c.g, c.b);
  }
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  const sky = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false }));
  sky.name = 'gokyuzu';
  sky.renderOrder = -1;
  return sky;
}

/** Yuvarlak, yumuşak hatlı sonbahar ağacı: eğri gövde, birkaç dal, üst üste binen yaprak kümeleri. */
function buildTree(r: () => number, trunkMat: THREE.Material, leafMats: THREE.Material[], blob: THREE.BufferGeometry): THREE.Group {
  const tree = new THREE.Group();
  const height = 26 + r() * 22;
  const trunk = cyl(0.9 + r() * 0.5, 1.6 + r() * 0.6, height, trunkMat, 10);
  trunk.position.y = height / 2;
  trunk.rotation.z = (r() - 0.5) * 0.12;
  tree.add(trunk);
  const crownY = height * 0.92;
  const crownR = 11 + r() * 8;
  for (let i = 0; i < 3; i++) {
    const branch = cyl(0.35, 0.7, crownR * 0.9, trunkMat, 6);
    const a = r() * Math.PI * 2;
    branch.position.set(Math.cos(a) * crownR * 0.25, crownY - crownR * 0.35, Math.sin(a) * crownR * 0.25);
    branch.rotation.set(Math.sin(a) * 0.8, 0, -Math.cos(a) * 0.8);
    tree.add(branch);
  }
  const blobs = 9 + Math.floor(r() * 6);
  for (let i = 0; i < blobs; i++) {
    const m = new THREE.Mesh(blob, leafMats[Math.floor(r() * leafMats.length)]);
    const a = r() * Math.PI * 2;
    const d = r() * crownR * 0.75;
    m.position.set(Math.cos(a) * d, crownY + (r() - 0.3) * crownR * 0.7, Math.sin(a) * d);
    m.scale.setScalar(crownR * (0.45 + r() * 0.35));
    m.rotation.set(r() * 3, r() * 3, r() * 3);
    m.castShadow = true;
    m.receiveShadow = true;
    tree.add(m);
  }
  return tree;
}

/** Park bankı: ahşap çıtalar, döküm ayaklar. */
function buildBench(wood: THREE.Material, iron: THREE.Material): THREE.Group {
  const bench = new THREE.Group();
  for (let i = 0; i < 3; i++) {
    const slat = new THREE.Mesh(new THREE.BoxGeometry(26, 0.5, 1.8), wood);
    slat.position.set(0, 8, i * 2.1 - 2.1);
    bench.add(slat);
  }
  for (let i = 0; i < 3; i++) {
    const slat = new THREE.Mesh(new THREE.BoxGeometry(26, 1.8, 0.45), wood);
    slat.position.set(0, 10.5 + i * 2.2, -3.6);
    slat.rotation.x = -0.15;
    bench.add(slat);
  }
  for (const x of [-11.5, 11.5]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.7, 8, 6), iron);
    leg.position.set(x, 4, -0.5);
    bench.add(leg);
    const back = new THREE.Mesh(new THREE.BoxGeometry(0.7, 8, 0.7), iron);
    back.position.set(x, 12, -3.9);
    bench.add(back);
  }
  bench.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) {
      o.castShadow = true;
      o.receiveShadow = true;
    }
  });
  return bench;
}

/** Eski tip park feneri. */
function buildLamp(iron: THREE.Material, glass: THREE.Material): THREE.Group {
  const lamp = new THREE.Group();
  const pole = cyl(0.45, 0.7, 52, iron, 10);
  pole.position.y = 26;
  lamp.add(pole);
  const head = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 2.6, 4.5, 6), glass);
  head.position.y = 54;
  lamp.add(head);
  const cap = new THREE.Mesh(new THREE.ConeGeometry(3.2, 2.2, 6), iron);
  cap.position.y = 57.4;
  lamp.add(cap);
  return lamp;
}

/**
 * Sonbahar Parkı: altın sarısı ve kızıl ağaçlar, yaprak serpilmiş çimen, uzakta bank ve fener,
 * alçaktan gelen sıcak ikindi güneşi ve havada süzülerek düşen yapraklar.
 */
export function buildAutumnPark(ortam: OrtamTheme, quality: Quality): THREE.Group {
  const group = new THREE.Group();
  group.name = 'oda-park';
  const r = rng(2026);

  group.add(buildSky());

  // Çimen
  const groundMat = mat(ortam.zemin, { roughness: 1 });
  const grassTex = grassTexture(5, [26, 26]);
  if (grassTex) {
    groundMat.map = grassTex;
    groundMat.color.set('#ffffff');
  }
  const ground = new THREE.Mesh(new THREE.CircleGeometry(380, 64), groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = FLOOR_Y;
  ground.receiveShadow = true;
  group.add(ground);

  // Toprak yürüyüş yolu: masanın arkasından kıvrılarak geçer
  const pathMat = mat('#c9a979', { roughness: 1 });
  const pathShape = new THREE.Shape();
  pathShape.moveTo(-220, -40);
  pathShape.bezierCurveTo(-80, -70, 60, -35, 220, -75);
  pathShape.lineTo(220, -60);
  pathShape.bezierCurveTo(60, -20, -80, -55, -220, -25);
  pathShape.closePath();
  const path = new THREE.Mesh(new THREE.ShapeGeometry(pathShape, 40), pathMat);
  path.rotation.x = Math.PI / 2;
  path.position.y = FLOOR_Y + 0.05;
  path.scale.z = -1;
  path.receiveShadow = true;
  group.add(path);

  // Ağaçlar: masanın çevresinde boş bir halka bırakıp etrafa dağılır
  const trunkMat = mat('#4a3324', { roughness: 0.95 });
  const leafMats = LEAF_COLORS.map((c) => mat(c, { roughness: 0.85 }));
  const blob = new THREE.IcosahedronGeometry(1, 1);
  const treeCount = quality === 'low' ? 16 : 30;
  for (let i = 0; i < treeCount; i++) {
    const a = r() * Math.PI * 2;
    const d = 55 + r() * 120;
    const x = Math.cos(a) * d;
    const z = Math.sin(a) * d;
    // Oyuncunun hemen arkası boş kalsın: arkadaki ağaçlar görünmez ama gölgeyi bozar.
    if (z > 20 && Math.abs(x) < 30) continue;
    const tree = buildTree(r, trunkMat, leafMats, blob);
    tree.position.set(x, FLOOR_Y, z);
    tree.rotation.y = r() * Math.PI * 2;
    group.add(tree);
  }

  // Uzakta bank ve fener
  const wood = mat('#8a5a34', { roughness: 0.8 });
  const iron = mat('#2d3330', { roughness: 0.5, metalness: 0.6 });
  const bench = buildBench(wood, iron);
  bench.position.set(-34, FLOOR_Y, -62);
  bench.rotation.y = 0.25;
  group.add(bench);
  const glass = new THREE.MeshStandardMaterial({ color: '#fff3d0', emissive: '#ffcf7a', emissiveIntensity: 0.6, roughness: 0.3 });
  const lamp = buildLamp(iron, glass);
  lamp.position.set(44, FLOOR_Y, -86);
  group.add(lamp);

  // Yerdeki yapraklar (çok sayıda, tek çizimde)
  const leafGeo = new THREE.CircleGeometry(0.55, 6);
  leafGeo.scale(1, 0.55, 1);
  const leafMat = new THREE.MeshStandardMaterial({ roughness: 0.9, side: THREE.DoubleSide });
  const groundLeaves = new THREE.InstancedMesh(leafGeo, leafMat, quality === 'low' ? 300 : 900);
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const color = new THREE.Color();
  for (let i = 0; i < groundLeaves.count; i++) {
    const a = r() * Math.PI * 2;
    const d = 6 + Math.pow(r(), 0.7) * 90;
    e.set(-Math.PI / 2 + (r() - 0.5) * 0.3, 0, r() * Math.PI * 2);
    q.setFromEuler(e);
    const s = 0.8 + r() * 1.2;
    m4.compose(new THREE.Vector3(Math.cos(a) * d, FLOOR_Y + 0.1 + r() * 0.05, Math.sin(a) * d), q, new THREE.Vector3(s, s, s));
    groundLeaves.setMatrixAt(i, m4);
    groundLeaves.setColorAt(i, color.set(LEAF_COLORS[Math.floor(r() * LEAF_COLORS.length)]));
  }
  groundLeaves.receiveShadow = true;
  group.add(groundLeaves);

  // Havada süzülerek düşen yapraklar
  const fallingCount = quality === 'low' ? 30 : 70;
  const falling = new THREE.InstancedMesh(leafGeo, leafMat.clone(), fallingCount);
  const leaves = Array.from({ length: fallingCount }, () => ({
    x: (r() - 0.5) * 120,
    z: -75 + r() * 55,
    y: FLOOR_Y + r() * 60,
    speed: 2.2 + r() * 2.5,
    sway: 2 + r() * 4,
    phase: r() * Math.PI * 2,
    spin: 0.6 + r() * 1.8,
    scale: 0.9 + r() * 0.9,
  }));
  leaves.forEach((_, i) => falling.setColorAt(i, color.set(LEAF_COLORS[Math.floor(r() * LEAF_COLORS.length)])));
  group.add(falling);

  // Işık: alçaktan, sol arkadan gelen sıcak ikindi güneşi; gökyüzünden mavi, çimenden yeşil yansıma.
  group.add(new THREE.HemisphereLight('#f4dcb8', '#6d7a34', 0.75));
  const sun = new THREE.DirectionalLight(ortam.isikRengi, ortam.isikSiddeti);
  sun.position.set(-34, 26, -26);
  if (quality !== 'low') {
    sun.castShadow = true;
    const size = quality === 'high' ? 4096 : 2048;
    sun.shadow.mapSize.set(size, size);
    const cam = sun.shadow.camera;
    cam.left = -22;
    cam.right = 22;
    cam.top = 22;
    cam.bottom = -22;
    cam.near = 5;
    cam.far = 120;
    sun.shadow.bias = -0.0008;
    sun.shadow.normalBias = 0.05;
    sun.shadow.radius = quality === 'high' ? 4 : 2;
  }
  group.add(sun, sun.target);
  // Oyuncunun arkasından gelen yumuşak dolgu: karşıdaki yüz gölgede kalmasın.
  const fill = new THREE.DirectionalLight('#ffe2bd', ortam.isikSiddeti * 0.28);
  fill.position.set(10, 18, 30);
  group.add(fill);

  let last = 0;
  const leafPos = new THREE.Vector3();
  const leafScale = new THREE.Vector3();
  const tick: RoomTick = (now) => {
    const dt = last ? Math.min(0.1, (now - last) / 1000) : 0;
    last = now;
    const t = now / 1000;
    leaves.forEach((l, i) => {
      l.y -= l.speed * dt;
      if (l.y < FLOOR_Y + 0.3) {
        l.y = FLOOR_Y + 45 + Math.random() * 20;
        l.x = (Math.random() - 0.5) * 120;
        // Kameranın önünden geçip ekranı kapatmasınlar: yalnızca masanın arkasındaki alana düşerler.
        l.z = -75 + Math.random() * 55;
      }
      const sx = Math.sin(t * 0.9 + l.phase) * l.sway;
      e.set(t * l.spin + l.phase, t * l.spin * 0.7, Math.sin(t * 1.3 + l.phase) * 0.8);
      q.setFromEuler(e);
      m4.compose(leafPos.set(l.x + sx, l.y, l.z + Math.cos(t * 0.7 + l.phase) * 1.5), q, leafScale.setScalar(l.scale));
      falling.setMatrixAt(i, m4);
    });
    falling.instanceMatrix.needsUpdate = true;
  };
  group.userData.tick = tick;
  return group;
}
