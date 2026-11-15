// Üretilen karakter GLB dosyasını GLTFLoader ile yükler, bir klibi yarısında durdurup çizer.
// Sol: önden üç çeyrek, sağ: yandan görünüm. Zemin çizgisi y=0, kırmızı nokta kökün (0,0,0) yeri.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { calistir, onizlemeSahnesi, sorgu } from './ortak.js';

calistir(async () => {
  const id = sorgu.get('id');
  const klipAdi = sorgu.get('klip') ?? 'bekleme-1';
  const oran = Number(sorgu.get('t') ?? 0.5);
  const tuval = document.getElementById('c');
  tuval.width = 1200;
  tuval.height = 800;
  const { renderer, sahne } = onizlemeSahnesi(tuval);
  const gltf = await new GLTFLoader().loadAsync(`/public/karakterler/${id}/karakter.glb`);
  sahne.add(gltf.scene);

  // Zemin ve bir sandalye yüksekliği işareti.
  const zemin = new THREE.Mesh(new THREE.PlaneGeometry(4, 4), new THREE.MeshStandardMaterial({ color: '#9aa39a', roughness: 1 }));
  zemin.rotation.x = -Math.PI / 2;
  sahne.add(zemin);
  const nokta = new THREE.Mesh(new THREE.SphereGeometry(0.02), new THREE.MeshBasicMaterial({ color: 'red' }));
  sahne.add(nokta);

  const klip = gltf.animations.find((a) => a.name === klipAdi);
  if (!klip) throw new Error(`klip yok: ${klipAdi}`);
  const karistirici = new THREE.AnimationMixer(gltf.scene);
  karistirici.clipAction(klip).play();
  karistirici.update(klip.duration * oran);
  gltf.scene.updateMatrixWorld(true);

  let kalca = null;
  let malzemeler = 0, haritali = 0;
  gltf.scene.traverse((o) => {
    if (o.isBone && /Hips$/.test(o.name)) kalca = o;
    if (o.isMesh) {
      malzemeler++;
      if (o.material.map) haritali++;
    }
  });
  const kutu = new THREE.Box3().setFromObject(gltf.scene, true);
  const merkez = kutu.getCenter(new THREE.Vector3());
  const boyut = kutu.getSize(new THREE.Vector3());
  const kalcaDunya = kalca.getWorldPosition(new THREE.Vector3());

  const kamera = new THREE.PerspectiveCamera(30, 600 / 800, 0.01, 100);
  const uzak = Math.max(boyut.y, boyut.x) * 2.4;
  renderer.setScissorTest(true);
  const ciz = (x, yon) => {
    renderer.setViewport(x, 0, 600, 800);
    renderer.setScissor(x, 0, 600, 800);
    kamera.position.copy(merkez).add(yon.normalize().multiplyScalar(uzak));
    kamera.lookAt(merkez);
    renderer.render(sahne, kamera);
  };
  ciz(0, new THREE.Vector3(0.45, 0.2, 1));
  ciz(600, new THREE.Vector3(1, 0.1, 0));
  return {
    klip: klipAdi,
    sure: +klip.duration.toFixed(2),
    kutuMin: kutu.min.toArray().map((v) => +v.toFixed(3)),
    kutuMax: kutu.max.toArray().map((v) => +v.toFixed(3)),
    kalca: kalcaDunya.toArray().map((v) => +v.toFixed(3)),
    ortu: `${haritali}/${malzemeler} haritalı`,
  };
});
