import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

/*
 * Kodla yapılan, yuvarlak hatlı, sıcak renkli ahşap park sandalyesi.
 * Karakterin kökünün yerel uzayında kurulur: karakter +z yönüne bakar, sırtlık -z tarafındadır.
 */

export interface ChairOptions {
  /** Oturma yüzeyinin üstü (y) */
  seatY: number;
  /** Oturağın merkezinin z konumu */
  seatZ: number;
  /** Zemin (y) */
  floorY: number;
  /** Oturağın eni ve derinliği */
  width?: number;
  depth?: number;
  /** Sırtlığın oturaktan yüksekliği */
  backHeight?: number;
  /** Oturağın üstüne konan yükseltici minder kalınlığı (çocuk için); 0 yok */
  cushion?: number;
  /** Ahşap rengi */
  wood?: string;
  cushionColor?: string;
}

export function buildParkChair(o: ChairOptions): THREE.Group {
  const g = new THREE.Group();
  g.name = 'sandalye';
  const width = o.width ?? 8;
  const depth = o.depth ?? 7;
  const backH = o.backHeight ?? 8;
  const cushion = o.cushion ?? 0;
  const wood = new THREE.MeshStandardMaterial({ color: o.wood ?? '#b0703c', roughness: 0.62, metalness: 0 });
  const darkWood = new THREE.MeshStandardMaterial({
    color: new THREE.Color(o.wood ?? '#b0703c').multiplyScalar(0.62),
    roughness: 0.7,
    metalness: 0,
  });
  const iron = new THREE.MeshStandardMaterial({ color: '#2d2a26', roughness: 0.5, metalness: 0.55 });
  const add = (geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number, rx = 0) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.rotation.x = rx;
    m.castShadow = true;
    m.receiveShadow = true;
    g.add(m);
    return m;
  };

  const seatTop = o.seatY - cushion;
  const slatT = 0.45;
  // Oturak: araları hafif açık dört tahta
  const slats = 4;
  const gap = 0.18;
  const slatD = (depth - gap * (slats - 1)) / slats;
  for (let i = 0; i < slats; i++) {
    const z = o.seatZ - depth / 2 + slatD / 2 + i * (slatD + gap);
    add(new RoundedBoxGeometry(width, slatT, slatD, 2, 0.14), wood, 0, seatTop - slatT / 2, z);
  }
  // Oturağın altındaki çerçeve
  const frameY = seatTop - slatT - 0.3;
  add(new RoundedBoxGeometry(width - 0.4, 0.6, 0.5, 2, 0.12), darkWood, 0, frameY, o.seatZ + depth / 2 - 0.5);
  add(new RoundedBoxGeometry(width - 0.4, 0.6, 0.5, 2, 0.12), darkWood, 0, frameY, o.seatZ - depth / 2 + 0.5);

  // Ayaklar: dökme demir park sandalyesi gibi koyu, hafif dışa açık
  const legH = Math.max(1, frameY - o.floorY);
  const legGeo = new THREE.CylinderGeometry(0.28, 0.36, legH, 12);
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const leg = add(legGeo, iron, sx * (width / 2 - 0.6), o.floorY + legH / 2, o.seatZ + sz * (depth / 2 - 0.6));
      leg.rotation.z = sx * 0.04;
      leg.rotation.x = -sz * 0.04;
    }
    // Yan bağlantı ve kolçak yok; ayakların arasında ince bir demir çubuk
    add(new THREE.CylinderGeometry(0.12, 0.12, depth - 1.2, 8), iron, sx * (width / 2 - 0.6), o.floorY + legH * 0.3, o.seatZ, Math.PI / 2);
  }
  // Ayak ucu pabuçları
  const footGeo = new THREE.SphereGeometry(0.42, 12, 8);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) add(footGeo, iron, sx * (width / 2 - 0.6), o.floorY + 0.2, o.seatZ + sz * (depth / 2 - 0.6));

  // Sırtlık: iki dikme, üç yatay tahta, hafif geriye yatık
  const back = new THREE.Group();
  back.position.set(0, seatTop, o.seatZ - depth / 2 + 0.2);
  back.rotation.x = -0.14;
  g.add(back);
  const postGeo = new THREE.CylinderGeometry(0.26, 0.3, backH, 12);
  for (const sx of [-1, 1]) {
    const p = new THREE.Mesh(postGeo, iron);
    p.position.set(sx * (width / 2 - 0.6), backH / 2, 0);
    p.castShadow = true;
    back.add(p);
  }
  for (let i = 0; i < 3; i++) {
    const h = backH * (0.42 + i * 0.22);
    const slat = new THREE.Mesh(new RoundedBoxGeometry(width + 0.2, 1.05, 0.42, 2, 0.16), wood);
    slat.position.set(0, h, 0);
    slat.castShadow = true;
    slat.receiveShadow = true;
    back.add(slat);
  }

  if (cushion > 0) {
    // Yükseltici minder: sıcak renkli, yumuşak köşeli
    const cm = new THREE.MeshStandardMaterial({ color: o.cushionColor ?? '#c2452d', roughness: 0.9, metalness: 0 });
    add(new RoundedBoxGeometry(width * 0.82, cushion, depth * 0.8, 4, Math.min(0.6, cushion * 0.45)), cm, 0, seatTop + cushion / 2, o.seatZ);
  }
  return g;
}
