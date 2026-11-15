# Sürüm 3 Tasarımı — Masa Başında Rakip

Tarih: 15 Kasım 2026
Esin kaynağı: The Outlast Trials içindeki satranç oyunu (birinci şahıs bakış, karşıda oturan rakip, masada mekanik saat, taşı tutan eller).

## Hedef

Oyuncu artık tahtaya yukarıdan bakan bir kamera değil, masada oturan bir kişidir. Karşısında yüzü ve kolları görünen bir rakip oturur. Arkada bir oda vardır. Hamleler kolla yapılır: tıklanınca kol uzanır, taşı alır, bırakır, geri çekilir. Sağda bir satranç saati durur. Gerçekçilik değil, **karakter** önceliklidir: rakiplerin yüzü, duruşu ve tepkileri oyunun kişiliğidir.

## Kullanıcının kararları

- Birkaç seçilebilir rakip olacak; her birinin yüzü, kolları ve tavrı farklı.
- Odalar hem karanlık/gerilimli hem sıcak/rahat olacak; ortam teması olarak seçilecek.
- Her adım bitince GitHub'a gönderilip oyun adresinde yayınlanacak.
- Dosya boyutu önemli değil.

## Adımlar

### Adım 1 — Masa başı sahne ve ilk rakip (bu adım)

- **Masa başı görünüm.** 3D'de yeni varsayılan kamera: oyuncunun gözü tahtanın beyaz tarafında, masanın biraz üstünde; tahtaya eğik bakar. Fareyle sınırlı bakınma (sağa sola, yukarı aşağı). Eski görünüm Ayarlar → Görünüm → "Kuşbakışı" olarak kalır.
- **Oda.** Yeni ortam teması "Sorgu Odası": beton duvarlar, sallanan tek tavan lambası (ara sıra titrer), demir kapı, borular, köşede karanlık. Oda kodla üretilir.
- **İlk rakip: Deneyci.** Gaz maskeli, gözlüklü, lastik eldivenli, sarı-siyah koruyucu giysili, kambur oturan bir karakter. Bilgisayara karşı oyunda masanın karşısında oturur.
  - Boşta: nefes alır, başını hafifçe oynatır, oyuncunun elini ve tahtayı izler.
  - Düşünürken: başını eğer, parmaklarını masaya vurur.
  - Tepkiler: taşı alınınca irkilir; şah çekince öne eğilir; kazanınca başını sallar; kaybedince çöker.
- **Kollar.** Hem oyuncunun hem rakibin hamlesi omuzdan gelen bir kolla yapılır (iki kemikli ters kinematik: omuz, dirsek, bilek). Oyuncunun kolu ekranın sağ altından girer. Var olan el canlandırması (uzan, kavra, taşı, bırak, geri çekil) korunur; kol, elin gittiği yeri izler.
- **Masa saati.** Oyuncunun sağında, masada iki yüzlü bir satranç saati. Saatli oyunda kalan süreleri gösterir ve hamleden sonra düğmesine basılır. Ekranın sağında da süre göstergesi durur.
- İki kişilik oyunda karşıda karakter oturmaz; görünüm her hamlede taraf değiştirir (bugünkü gibi).

### Adım 2 — Süre modları

- Yeni oyun menüsünde "Oyun Süresi":
  - **Bullet:** 1+0, 2+1
  - **Blitz:** 3+2, 5+0
  - **Hızlı:** 10+0, 15+10
  - **Kara Delik:** süresiz. Masanın yanında dönen bir kara delik belirir; saatin ibreleri donar, göstergede ∞ yazar. Oyun biri pes edene, mat olana ya da berabere kalana kadar sürer. Alınan taşlar kara deliğe çekilir.
- Saat artık bilgisayara karşı oyunda da çalışır. Bullet'ta bilgisayarın düşünme süresi kısaltılır.

### Adım 3 — Daha çok rakip ve oda

- Rakipler: **Yaşlı Usta** (sakallı, gözlüklü, hırkalı, sakin), **Otomat** (kurmalı mekanik bebek; dişliler, porselen yüz), ve bir tane daha. Her rakibin önerilen zorluk seviyesi olur.
- Odalar: **Kütüphane** (sıcak, şömine), **Bodrum** (karanlık), mevcut açık ortamlar da kalır.
- Yeni oyun ekranında rakip seçimi (kart görünümü).

### Adım 4 — Ekler (kullanıcı onayıyla)

Önerilen ek özellikler ayrı listede sunuldu; kullanıcı seçtikçe eklenir.

## Teknik çerçeve

- Karakterler `src/scene/view3d/characters/` altında kodla üretilir (Three.js). Her karakter aynı arayüzü uygular: gövde, baş/yüz, iki kol, `update(dt)` ile boşta canlandırma, `react(olay)` ile tepkiler, kolun takip ettiği bir `Hand`.
- Kol çözücüsü (`rig.ts`) iki kemikli ters kinematiktir; dirsek yönü bir ipucu vektörüyle belirlenir. Oyuncunun kolu da aynı çözücüyü kullanır.
- `HandAnimator` tek bir el yerine renk başına bir el alır; el karakterin koluna bağlıysa sahneden çıkarılmaz, hamle bitince dinlenme noktasına döner.
- Ölçek: bir kare 1 birimdir (gerçekte ~5,5 cm). Buna göre bir insan başı ~4 birim, omuz genişliği ~8 birimdir.
- Oda, ortam temasındaki isteğe bağlı `oda` alanıyla seçilir (`"sorgu"` …). Alan yoksa bugünkü açık ortam çizilir.

## Doğrulama

- Her adımda birim testleri ve tarayıcı testleri geçer.
- Karakterler için önizleme sayfası (`karakter.html`) ve ekran görüntüsü alınarak gözle kontrol.
- Adım sonunda bağımsız bir gözden geçirme.
