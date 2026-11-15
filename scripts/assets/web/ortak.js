// Dönüştürme sayfalarının ortak yardımcıları.
import * as THREE from 'three';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';

/** Node tarafının yazdırdığı günlük satırı. */
export function yaz(...parcalar) {
  console.log('» ' + parcalar.join(' '));
}

/** Sayfanın işi bitti; sonuç Node tarafına geçer. */
export function bitir(sonuc) {
  window.__bitti = sonuc ?? {};
}

/** Ana işi çalıştırır; hata olursa Node tarafına bildirir. */
export async function calistir(is) {
  try {
    bitir(await is());
  } catch (e) {
    console.error(e);
    bitir({ hata: String(e?.stack ?? e) });
  }
}

export const sorgu = new URLSearchParams(location.search);

/** Çıktı dosyasını public/ altına yazdırır. */
export async function gonder(goreliYol, veri) {
  const yanit = await fetch(`/cikti/${goreliYol}`, { method: 'POST', body: veri });
  if (!yanit.ok) throw new Error(`yazılamadı: ${goreliYol}`);
}

/** Sahneyi ikili GLB olarak dışa aktarır. */
export async function glbYap(kok, animasyonlar = [], dokuSiniri = 4096) {
  const exporter = new GLTFExporter();
  return exporter.parseAsync(kok, { binary: true, animations: animasyonlar, maxTextureSize: dokuSiniri, onlyVisible: false });
}

/** Görüntünün saydam pikselleri var mı? (alfa < 250 olanların oranı) */
export function saydamlikOrani(goruntu) {
  const w = Math.min(512, goruntu.width), h = Math.min(512, goruntu.height);
  const tuval = document.createElement('canvas');
  tuval.width = w;
  tuval.height = h;
  const c = tuval.getContext('2d', { willReadFrequently: true });
  c.drawImage(goruntu, 0, 0, w, h);
  const d = c.getImageData(0, 0, w, h).data;
  let saydam = 0;
  for (let i = 3; i < d.length; i += 4) if (d[i] < 250) saydam++;
  return saydam / (w * h);
}

/** Görüntüyü en büyük kenarı `sinir` olacak şekilde küçültür (gerekirse). */
export function kucult(goruntu, sinir) {
  const olcek = Math.min(1, sinir / Math.max(goruntu.width, goruntu.height));
  if (olcek >= 1) return goruntu;
  const tuval = document.createElement('canvas');
  tuval.width = Math.round(goruntu.width * olcek);
  tuval.height = Math.round(goruntu.height * olcek);
  const c = tuval.getContext('2d');
  c.imageSmoothingQuality = 'high';
  c.drawImage(goruntu, 0, 0, tuval.width, tuval.height);
  return tuval;
}

/** Dokuların görüntüleri yüklenene kadar bekler. */
export async function dokulariBekle(kok, sure = 30000) {
  const dokular = new Set();
  kok.traverse((o) => {
    if (!o.isMesh) return;
    for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
      for (const k of ['map', 'normalMap', 'specularMap', 'alphaMap', 'emissiveMap', 'bumpMap']) if (m[k]) dokular.add(m[k]);
    }
  });
  const bas = performance.now();
  for (const t of dokular) {
    while (!(t.image && t.image.width > 0)) {
      if (performance.now() - bas > sure) throw new Error(`doku yüklenemedi: ${t.name}`);
      await new Promise((r) => setTimeout(r, 50));
    }
  }
  return [...dokular];
}

/** Basit önizleme sahnesi: yumuşak ışık, açık arka plan. */
export function onizlemeSahnesi(tuval) {
  const renderer = new THREE.WebGLRenderer({ canvas: tuval, antialias: true, preserveDrawingBuffer: true });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  const sahne = new THREE.Scene();
  sahne.background = new THREE.Color('#c9d3dc');
  sahne.add(new THREE.HemisphereLight('#ffffff', '#5a5048', 1.6));
  const gunes = new THREE.DirectionalLight('#fff4e6', 2.4);
  gunes.position.set(2, 4, 3);
  sahne.add(gunes);
  const dolgu = new THREE.DirectionalLight('#dce8ff', 0.8);
  dolgu.position.set(-3, 2, -2);
  sahne.add(dolgu);
  return { renderer, sahne };
}
