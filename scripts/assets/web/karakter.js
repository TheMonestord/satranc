// Mixamo karakterini (FBX, T-poz) ve oturma canlandırmalarını tek bir GLB dosyasına dönüştürür.
import * as THREE from 'three';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { KARAKTERLER, KLIPLER, OTURUS_KLIBI, AYAR } from '../ayarlar.mjs';
import { calistir, dokulariBekle, glbYap, gonder, kucult, saydamlikOrani, sorgu, yaz } from './ortak.js';

const ONEK = /^mixamorig\d*[:_]?/;
const sade = (ad) => ad.replace(ONEK, '');

async function fbxYukle(dosya) {
  return new FBXLoader().loadAsync(`/kaynak/${encodeURIComponent(dosya)}`);
}

/**
 * FBXLoader, birden çok örgünün paylaştığı her kemiği örgü başına kopyalar ve kopyaları ilk kemiğin
 * altına iç içe ekler. Bütün örgüleri tek kemik takımına bağlar, kopyaları siler.
 */
function kemikleriBirlestir(model) {
  const asil = new Map();
  model.traverse((o) => {
    if (o.isBone && !(o.parent?.isBone && o.parent.name === o.name)) {
      if (asil.has(o.name)) throw new Error(`aynı adlı iki kemik: ${o.name}`);
      asil.set(o.name, o);
    }
  });
  model.updateMatrixWorld(true);
  let enBuyukFark = 0;
  model.traverse((o) => {
    if (!o.isSkinnedMesh) return;
    const kemikler = o.skeleton.bones.map((b) => {
      const a = asil.get(b.name);
      if (!a) throw new Error(`kemik bulunamadı: ${b.name}`);
      const e1 = a.matrixWorld.elements, e2 = b.matrixWorld.elements;
      for (let i = 0; i < 16; i++) enBuyukFark = Math.max(enBuyukFark, Math.abs(e1[i] - e2[i]));
      return a;
    });
    o.bind(new THREE.Skeleton(kemikler, o.skeleton.boneInverses), o.bindMatrix);
  });
  let silinen = 0;
  for (const kemik of asil.values()) {
    for (const cocuk of [...kemik.children]) {
      if (cocuk.isBone && cocuk.name === kemik.name) {
        kemik.remove(cocuk);
        cocuk.traverse(() => silinen++);
      }
    }
  }
  return { kemikSayisi: asil.size, silinen, enBuyukFark };
}

/** Phong malzemeleri PBR'a çevirir, dokuları küçültür, gereksiz UV kanallarını atar. */
function malzemeleriCevir(model) {
  const malzemeler = new Map();
  const dokular = new Map();
  const bilgi = [];
  const dokuHazirla = (t, sinir, renkli) => {
    if (!t) return null;
    if (dokular.has(t)) return dokular.get(t);
    const saydam = renkli ? saydamlikOrani(t.image) : 0;
    const eskiBoyut = `${t.image.width}x${t.image.height}`;
    t.image = kucult(t.image, sinir);
    t.userData.mimeType = saydam > 0.001 ? 'image/png' : 'image/jpeg';
    t.needsUpdate = true;
    const sonuc = { doku: t, saydam };
    dokular.set(t, sonuc);
    bilgi.push(`${t.name}: ${eskiBoyut} -> ${t.image.width}x${t.image.height} ${t.userData.mimeType} saydam=${(saydam * 100).toFixed(2)}%`);
    return sonuc;
  };
  model.traverse((o) => {
    if (!o.isMesh) return;
    const g = o.geometry;
    for (const ad of Object.keys(g.attributes)) {
      if (!['position', 'normal', 'uv', 'skinIndex', 'skinWeight'].includes(ad)) g.deleteAttribute(ad);
    }
    if (o.isSkinnedMesh) o.normalizeSkinWeights();
    const yuz = AYAR.yuzAdi.test(o.name);
    const cevir = (m) => {
      const anahtar = `${m.uuid}:${yuz}`;
      if (malzemeler.has(anahtar)) return malzemeler.get(anahtar);
      const sinir = yuz ? AYAR.yuzDokuSiniri : AYAR.dokuSiniri;
      const harita = dokuHazirla(m.map, sinir, true);
      const normal = dokuHazirla(m.normalMap, AYAR.dokuSiniri, false);
      const s = new THREE.MeshStandardMaterial({
        name: m.name,
        color: m.color ? m.color.clone() : new THREE.Color(1, 1, 1),
        map: harita?.doku ?? null,
        normalMap: normal?.doku ?? null,
        roughness: 0.7,
        metalness: 0,
        side: m.side,
        opacity: m.opacity,
        transparent: m.transparent && m.opacity < 1,
      });
      if (m.normalMap && m.normalScale) s.normalScale.copy(m.normalScale);
      if (m.emissive && m.emissive.getHex() !== 0) {
        s.emissive.copy(m.emissive);
        s.emissiveMap = m.emissiveMap ?? null;
      }
      // Dokuda saydamlık varsa (kirpik, saç kartı) alfa kesme kullanılır: sıralama sorunu yaşatmaz.
      if (harita && harita.saydam > 0.001) {
        s.alphaTest = 0.5;
        s.side = THREE.DoubleSide;
      }
      malzemeler.set(anahtar, s);
      return s;
    };
    o.material = Array.isArray(o.material) ? o.material.map(cevir) : cevir(o.material);
    o.castShadow = true;
    o.receiveShadow = true;
  });
  return bilgi;
}

/** İki dörtlü arasındaki açı (radyan). */
function aci(ax, ay, az, aw, bx, by, bz, bw) {
  const d = Math.min(1, Math.abs(ax * bx + ay * by + az * bz + aw * bw));
  return 2 * Math.acos(d);
}

/**
 * Ana kareleri seyreltir: komşu tutulan kareler arasındaki ara değer, atılan her kareyi tolerans
 * içinde veriyorsa kare atılır. İlk ve son kare her zaman kalır.
 */
function seyrelt(iz, tolerans) {
  const n = iz.times.length;
  if (n <= 2) return iz;
  const boy = iz.getValueSize();
  const q = boy === 4;
  const v = iz.values, t = iz.times;
  const tmp = new Float32Array(4);
  const hata = (a, b, j) => {
    const s = (t[j] - t[a]) / (t[b] - t[a]);
    if (q) {
      THREE.Quaternion.slerpFlat(tmp, 0, v, a * 4, v, b * 4, s);
      return aci(tmp[0], tmp[1], tmp[2], tmp[3], v[j * 4], v[j * 4 + 1], v[j * 4 + 2], v[j * 4 + 3]);
    }
    let e = 0;
    for (let k = 0; k < boy; k++) e = Math.max(e, Math.abs(v[a * boy + k] + (v[b * boy + k] - v[a * boy + k]) * s - v[j * boy + k]));
    return e;
  };
  const tut = [0];
  let a = 0;
  for (let i = 1; i < n - 1; i++) {
    const b = i + 1;
    for (let j = a + 1; j < b; j++) {
      if (hata(a, b, j) > tolerans) {
        tut.push(i);
        a = i;
        break;
      }
    }
  }
  tut.push(n - 1);
  const yeniT = new Float32Array(tut.length), yeniV = new Float32Array(tut.length * boy);
  tut.forEach((k, i) => {
    yeniT[i] = t[k];
    for (let c = 0; c < boy; c++) yeniV[i * boy + c] = v[k * boy + c];
  });
  return new iz.constructor(iz.name, yeniT, yeniV);
}

/** İzi en çok `fps` kare/saniye olacak biçimde yeniden örnekler (gerekirse). */
function yenidenOrnekle(iz, fps, sure) {
  const kareHizi = (iz.times.length - 1) / Math.max(sure, 1e-6);
  if (kareHizi <= fps + 0.5) return iz;
  const n = Math.max(2, Math.round(sure * fps) + 1);
  const ara = iz.createInterpolant();
  const boy = iz.getValueSize();
  const t = new Float32Array(n), v = new Float32Array(n * boy);
  for (let i = 0; i < n; i++) {
    t[i] = (sure * i) / (n - 1);
    v.set(ara.evaluate(t[i]), i * boy);
  }
  return new iz.constructor(iz.name, t, v);
}

calistir(async () => {
  const tanim = KARAKTERLER.find((k) => k.id === sorgu.get('id'));
  if (!tanim) throw new Error(`bilinmeyen karakter: ${sorgu.get('id')}`);
  yaz(`yükleniyor ${tanim.kaynak}`);
  const model = await fbxYukle(tanim.kaynak);
  model.animations = [];
  await dokulariBekle(model);
  const birlesim = kemikleriBirlestir(model);
  yaz(`kemikler: ${birlesim.kemikSayisi} (silinen kopya ${birlesim.silinen}, konum farkı ${birlesim.enBuyukFark.toExponential(1)})`);
  const dokuBilgisi = malzemeleriCevir(model);
  dokuBilgisi.forEach((b) => yaz(b));

  const kemikler = new Map();
  model.traverse((o) => {
    if (o.isBone) kemikler.set(sade(o.name), o);
  });
  const kalca = kemikler.get('Hips');
  if (!kalca) throw new Error('Hips kemiği yok');
  const onek = kalca.name.slice(0, kalca.name.length - 'Hips'.length);
  model.updateMatrixWorld(true);
  const kutu = new THREE.Box3().setFromObject(model);
  const boy = kutu.max.y - kutu.min.y;
  const kalcaDinlenme = kalca.position.clone();
  yaz(`boy ${boy.toFixed(1)} kaynak birimi, kalça ${kalcaDinlenme.toArray().map((x) => x.toFixed(1))}`);

  // Kliplerin yüklenmesi; önce oturuş (ortak oturma yüksekliği).
  const sirali = [...KLIPLER].sort((a, b) => (a.ad === OTURUS_KLIBI ? -1 : b.ad === OTURUS_KLIBI ? 1 : 0));
  let oturmaNoktasi = null;
  const klipler = [];
  const klipRaporu = [];
  let dinlenmeFarki = { aci: 0, kemik: '' };
  for (const k of sirali) {
    const kaynak = await fbxYukle(k.kaynak);
    const klip = kaynak.animations[0];
    const kaynakKemikler = new Map();
    kaynak.traverse((o) => {
      if (o.isBone) kaynakKemikler.set(sade(o.name), o);
    });
    const kaynakKalca = kaynakKemikler.get('Hips');
    const oran = kalcaDinlenme.y / kaynakKalca.position.y;
    // Dinlenme pozlarının farkı (yalnızca rapor için): Mixamo iskeletlerinde dönüşler aynı olmalı.
    for (const [ad, kb] of kaynakKemikler) {
      const hb = kemikler.get(ad);
      if (!hb) continue;
      const fark = aci(...kb.quaternion.toArray(), ...hb.quaternion.toArray());
      if (fark > dinlenmeFarki.aci) dinlenmeFarki = { aci: fark, kemik: `${ad} (${k.kaynak})` };
    }

    const izler = [];
    let hamKare = 0;
    for (const iz of klip.tracks) {
      const nokta = iz.name.lastIndexOf('.');
      const dugum = sade(iz.name.slice(0, nokta));
      const ozellik = iz.name.slice(nokta + 1);
      const hedef = kemikler.get(dugum);
      if (!hedef) continue;
      if (ozellik === 'quaternion') {
        if (k.tur === 'ust-govde' && !/Spine|Neck|Head|Shoulder|Arm|Hand/.test(dugum)) continue;
      } else if (ozellik === 'position' && dugum === 'Hips') {
        if (k.tur === 'ust-govde') continue;
      } else continue;
      let yeni = iz.clone();
      yeni.name = `${hedef.name}.${ozellik}`;
      yeni = yenidenOrnekle(yeni, AYAR.fps, klip.duration);
      if (ozellik === 'position') {
        // Kalça konumu: hedef iskeletin boyuna ölçeklenir ve ortak oturma noktasına taşınır.
        const v = yeni.values, n = v.length / 3;
        const yer = new THREE.Vector3();
        if (k.tur === 'gecis') yer.fromArray(v, (n - 1) * 3);
        else {
          for (let i = 0; i < n; i++) yer.add(new THREE.Vector3().fromArray(v, i * 3));
          yer.divideScalar(n);
        }
        if (!oturmaNoktasi) oturmaNoktasi = new THREE.Vector3(0, yer.y * oran, 0);
        for (let i = 0; i < n; i++) {
          for (let c = 0; c < 3; c++) v[i * 3 + c] = oturmaNoktasi.getComponent(c) + (v[i * 3 + c] - yer.getComponent(c)) * oran;
        }
      }
      hamKare += yeni.times.length;
      izler.push(seyrelt(yeni, ozellik === 'position' ? AYAR.konumTolerans : AYAR.donusTolerans));
    }
    const yeniKlip = new THREE.AnimationClip(k.ad, klip.duration, izler);
    const kare = izler.reduce((s, i) => s + i.times.length, 0);
    klipRaporu.push({ ad: k.ad, kaynak: k.kaynak, sure: +klip.duration.toFixed(3), iz: izler.length, kaynakIz: klip.tracks.length, kare, hamKare, oran: +oran.toFixed(4) });
    yaz(`klip ${k.ad} <- ${k.kaynak}: ${izler.length}/${klip.tracks.length} iz, kare ${hamKare} -> ${kare}`);
    klipler.push(yeniKlip);
  }
  klipler.sort((a, b) => KLIPLER.findIndex((k) => k.ad === a.name) - KLIPLER.findIndex((k) => k.ad === b.name));
  yaz(`dinlenme pozu en büyük fark: ${((dinlenmeFarki.aci * 180) / Math.PI).toFixed(2)}° ${dinlenmeFarki.kemik}`);

  // Zemin ayarı: ana bekleme klibinde ayak tabanı y=0'a gelsin diye bütün kalça konumları aynı
  // miktarda kaydırılır (bacak boyu kaynak karakterden farklı olduğu için gerekir).
  const bekleme = klipler.find((c) => c.name === AYAR.zeminKlibi);
  const dinlenme = [];
  model.traverse((o) => {
    if (o.isBone) dinlenme.push([o, o.position.clone(), o.quaternion.clone(), o.scale.clone()]);
  });
  const karistirici = new THREE.AnimationMixer(model);
  karistirici.clipAction(bekleme).play();
  karistirici.update(0);
  model.updateMatrixWorld(true);
  const zeminFarki = -new THREE.Box3().setFromObject(model, true).min.y;
  karistirici.stopAllAction();
  karistirici.uncacheRoot(model);
  for (const c of klipler) {
    for (const iz of c.tracks) {
      if (iz.name !== `${kalca.name}.position`) continue;
      for (let i = 1; i < iz.values.length; i += 3) iz.values[i] += zeminFarki;
    }
  }
  oturmaNoktasi.y += zeminFarki;
  // Karıştırıcı kemikleri pozladı; dışa aktarımdan önce T-poza dön.
  for (const [o, p, q, s] of dinlenme) {
    o.position.copy(p);
    o.quaternion.copy(q);
    o.scale.copy(s);
  }
  model.updateMatrixWorld(true);
  yaz(`zemin ayarı ${zeminFarki.toFixed(2)} birim, oturma kalça yüksekliği ${oturmaNoktasi.y.toFixed(2)}`);

  const kok = new THREE.Group();
  kok.name = 'karakter';
  kok.scale.setScalar(AYAR.olcek);
  model.name = model.name || tanim.id;
  kok.add(model);
  kok.userData = { kaynakBoy: +boy.toFixed(2), oturmaKalcaYuksekligi: +oturmaNoktasi.y.toFixed(2), birim: 'kaynak birimi cm; kök ölçeği 0.01 ile metre' };

  const glb = await glbYap(kok, klipler, AYAR.yuzDokuSiniri);
  await gonder(`karakterler/${tanim.id}/karakter.glb`, glb);

  const kemikAdlari = [];
  model.traverse((o) => {
    if (o.isBone) kemikAdlari.push(o.name);
  });
  return {
    id: tanim.id,
    boyut: glb.byteLength,
    kaynakBoy: boy,
    kalcaDinlenme: kalcaDinlenme.toArray(),
    oturmaKalcaYuksekligi: oturmaNoktasi.y,
    onek,
    kemikAdlari,
    klipler: klipRaporu,
    dokular: dokuBilgisi,
    dinlenmeFarkiDerece: (dinlenmeFarki.aci * 180) / Math.PI,
    dinlenmeFarkiKemik: dinlenmeFarki.kemik,
  };
});
