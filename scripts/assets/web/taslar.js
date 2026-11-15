// Çizgi film taş setini (GLB) oyunun taş teması biçimine dönüştürür: her taş türü ve renk için
// adlandırılmış tek bir düğüm, tabanı y=0'da, ortalanmış; ışıkla gölgelenen ahşap malzeme.
// Çizgi film dış hatları (ters çevrilmiş kabuk örgüleri) atılır; gözler, burun delikleri gibi
// koyu ayrıntılar ayrı bir malzemeyle korunur.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { SimplifyModifier } from 'three/addons/modifiers/SimplifyModifier.js';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { TASLAR } from '../ayarlar.mjs';
import { calistir, glbYap, gonder, yaz } from './ortak.js';

const ucgen = (g) => (g.index ? g.index.count : g.attributes.position.count) / 3;

/** Kaynak taş grubundaki örgüleri dünya uzayında toplar: gövde ve koyu ayrıntı ayrı. */
function topla(grup) {
  const govde = [], detay = [];
  const adlar = { govde: [], detay: [], atilan: [] };
  grup.traverse((o) => {
    if (!o.isMesh) return;
    // Dış hat kabukları "Outline..." adlı düğümlerin (veya "topOutlines" grubunun) altındadır.
    let atla = false;
    for (let p = o; p && p !== grup; p = p.parent) if (/^(Outline|topOutlines)/i.test(p.name)) atla = true;
    if (atla) {
      adlar.atilan.push(o.name);
      return;
    }
    let g = o.geometry.clone();
    for (const ad of Object.keys(g.attributes)) if (ad !== 'position' && ad !== 'normal') g.deleteAttribute(ad);
    g.applyMatrix4(o.matrixWorld);
    if (!g.index) g = mergeVertices(g);
    const ayrinti = /outline/i.test(o.material.name);
    (ayrinti ? detay : govde).push(g);
    adlar[ayrinti ? 'detay' : 'govde'].push(`${o.parent?.name}/${o.name}`);
  });
  return { govde: mergeGeometries(govde), detay: detay.length ? mergeGeometries(detay) : null, adlar };
}

/** Atın baktığı yatay yön: burun deliklerinin gövde eksenine göre konumu. */
function atYonu(govde, detay) {
  const kutu = new THREE.Box3().setFromBufferAttribute(govde.attributes.position);
  const eksen = kutu.getCenter(new THREE.Vector3());
  const p = detay.attributes.position;
  // Burun delikleri ayrıntıların en uçtaki kısmıdır: eksenden en uzak noktaların ortalaması.
  const uzaklik = [];
  for (let i = 0; i < p.count; i++) uzaklik.push([Math.hypot(p.getX(i) - eksen.x, p.getZ(i) - eksen.z), i]);
  uzaklik.sort((a, b) => b[0] - a[0]);
  const uc = uzaklik.slice(0, Math.max(1, Math.floor(p.count * 0.15)));
  const yon = new THREE.Vector2();
  for (const [, i] of uc) yon.add(new THREE.Vector2(p.getX(i) - eksen.x, p.getZ(i) - eksen.z));
  return yon.normalize();
}

calistir(async () => {
  const gltf = await new GLTFLoader().loadAsync(`/kaynak/${TASLAR.kaynak}`);
  const sahne = gltf.scene;
  sahne.updateMatrixWorld(true);

  // Renk grupları: hangi takımın beyaz olduğunu malzeme adı söyler; ayrıca konumla denetlenir.
  const gruplar = {};
  for (const ad of ['WhitePieces', 'BlackPieces']) {
    const g = sahne.getObjectByName(ad);
    if (!g) throw new Error(`grup yok: ${ad}`);
    let malzeme = '';
    g.traverse((o) => {
      if (o.isMesh && !/outline/i.test(o.material.name)) malzeme = o.material.name;
    });
    gruplar[/^White/i.test(malzeme) ? 'beyaz' : 'siyah'] = g;
  }

  // Denetim: başlangıç dizilişi. Satırlar x ekseninde, sütunlar z ekseninde.
  const konumlar = {};
  for (const [renk, g] of Object.entries(gruplar)) {
    for (const c of g.children) {
      const k = new THREE.Box3().setFromObject(c).getCenter(new THREE.Vector3());
      konumlar[`${renk}:${c.name}`] = [+k.x.toFixed(3), +k.z.toFixed(3)];
    }
  }
  yaz(`konumlar ${JSON.stringify(konumlar)}`);

  const malzemeler = {
    beyaz: new THREE.MeshStandardMaterial({ name: 'ahsap-beyaz', color: TASLAR.beyaz, roughness: TASLAR.puruzluluk, metalness: 0 }),
    siyah: new THREE.MeshStandardMaterial({ name: 'ahsap-siyah', color: TASLAR.siyah, roughness: TASLAR.puruzluluk, metalness: 0 }),
    detay: new THREE.MeshStandardMaterial({ name: 'boya-koyu', color: TASLAR.detay, roughness: 0.35, metalness: 0 }),
    detayAcik: new THREE.MeshStandardMaterial({ name: 'boya-acik', color: TASLAR.beyaz, roughness: 0.35, metalness: 0 }),
  };

  const kok = new THREE.Group();
  kok.name = 'taslar';
  const rapor = [];
  const simplifier = new SimplifyModifier();
  // Her iki renk de beyaz takımın geometrisini kullanır; böylece taşlar birebir aynı olur ve
  // dosyada geometri bir kez saklanır.
  for (const [kaynakAd, tur] of Object.entries(TASLAR.turler)) {
    const grup = gruplar.beyaz.getObjectByName(kaynakAd);
    if (!grup) throw new Error(`taş yok: ${kaynakAd}`);
    let { govde, detay, adlar } = topla(grup);
    const ilkUcgen = ucgen(govde);

    // Ortala: taban y=0, dikey eksen (0,0).
    const kutu = new THREE.Box3().setFromBufferAttribute(govde.attributes.position);
    if (detay) kutu.union(new THREE.Box3().setFromBufferAttribute(detay.attributes.position));
    const merkez = kutu.getCenter(new THREE.Vector3());
    const kaydir = new THREE.Matrix4().makeTranslation(-merkez.x, -kutu.min.y, -merkez.z);
    govde.applyMatrix4(kaydir);
    detay?.applyMatrix4(kaydir);

    // At: başı +x yönüne (oyunda beyaz at profilden görünür; siyah taşlar yarım tur döndürülür).
    let donus = 0;
    if (tur === 'at') {
      const yon = atYonu(govde, detay);
      donus = Math.atan2(yon.y, yon.x);
      const r = new THREE.Matrix4().makeRotationY(donus);
      govde.applyMatrix4(r);
      detay.applyMatrix4(r);
      // Dönüşten sonra yeniden ortala.
      const k2 = new THREE.Box3().setFromBufferAttribute(govde.attributes.position);
      const m2 = k2.getCenter(new THREE.Vector3());
      const t2 = new THREE.Matrix4().makeTranslation(-m2.x, 0, -m2.z);
      govde.applyMatrix4(t2);
      detay.applyMatrix4(t2);
      yaz(`at yönü (${yon.x.toFixed(2)}, ${yon.y.toFixed(2)}) -> ${((donus * 180) / Math.PI).toFixed(1)}° döndürüldü; sonra ${JSON.stringify(atYonu(govde, detay).toArray().map((v) => +v.toFixed(2)))}`);
    }

    // İncelt: sınırı aşan gövdeler.
    if (ilkUcgen > TASLAR.ucgenSiniri) {
      const hedefOran = TASLAR.ucgenSiniri / ilkUcgen;
      const silinecek = Math.floor(govde.attributes.position.count * (1 - hedefOran));
      govde = await simplifier.modify(govde, silinecek);
    }
    govde.computeBoundingBox();
    govde.computeBoundingSphere();

    const boyut = new THREE.Box3().setFromBufferAttribute(govde.attributes.position).getSize(new THREE.Vector3());
    for (const renk of ['beyaz', 'siyah']) {
      const dugum = new THREE.Group();
      dugum.name = `${tur}-${renk}`;
      const m = new THREE.Mesh(govde, malzemeler[renk]);
      m.name = `${tur}-${renk}-govde`;
      dugum.add(m);
      if (detay) {
        const d = new THREE.Mesh(detay, renk === 'beyaz' ? malzemeler.detay : malzemeler.detayAcik);
        d.name = `${tur}-${renk}-ayrinti`;
        dugum.add(d);
      }
      kok.add(dugum);
    }
    rapor.push({
      tur,
      kaynak: kaynakAd,
      ucgen: `${ilkUcgen} -> ${ucgen(govde)}`,
      ayrintiUcgen: detay ? ucgen(detay) : 0,
      boyut: boyut.toArray().map((v) => +v.toFixed(4)),
      ...adlar,
    });
    yaz(`${tur} <- ${kaynakAd}: üçgen ${ilkUcgen} -> ${ucgen(govde)}, ayrıntı ${detay ? ucgen(detay) : 0}, boyut ${boyut.toArray().map((v) => v.toFixed(4))}; atılan ${adlar.atilan.length} dış hat; ayrıntı ${adlar.detay.join(',')}`);
  }

  const glb = await glbYap(kok);
  await gonder(`temalar/taslar/${TASLAR.tema}/taslar.glb`, glb);
  return { boyut: glb.byteLength, konumlar, taslar: rapor };
});
