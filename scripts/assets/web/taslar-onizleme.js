// Üretilen taslar.glb dosyasındaki 12 düğümü iki sıra halinde dizip çizer. Kırmızı ok +x yönüdür
// (oyunda beyaz atın bakması gereken yön).
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { TASLAR } from '../ayarlar.mjs';
import { calistir, onizlemeSahnesi } from './ortak.js';

calistir(async () => {
  const tuval = document.getElementById('c');
  tuval.width = 1400;
  tuval.height = 700;
  const { renderer, sahne } = onizlemeSahnesi(tuval);
  const gltf = await new GLTFLoader().loadAsync(`/public/temalar/taslar/${TASLAR.tema}/taslar.glb`);
  const turler = ['piyon', 'kale', 'at', 'fil', 'vezir', 'sah'];
  let enYuksek = 0;
  const bulunan = [];
  turler.forEach((tur, i) => {
    ['beyaz', 'siyah'].forEach((renk, j) => {
      const dugum = gltf.scene.getObjectByName(`${tur}-${renk}`);
      if (!dugum) return;
      bulunan.push(dugum.name);
      const kopya = dugum.clone();
      kopya.position.set((i - 2.5) * 0.06, 0, j === 0 ? 0.04 : -0.04);
      sahne.add(kopya);
      enYuksek = Math.max(enYuksek, new THREE.Box3().setFromObject(kopya).max.y);
    });
  });
  sahne.add(new THREE.ArrowHelper(new THREE.Vector3(1, 0, 0), new THREE.Vector3(-0.2, 0.002, 0), 0.05, 'red'));
  const kamera = new THREE.PerspectiveCamera(30, 2, 0.001, 10);
  kamera.position.set(0.02, 0.12, 0.42);
  kamera.lookAt(0, enYuksek * 0.4, 0);
  renderer.render(sahne, kamera);
  return { bulunan };
});
