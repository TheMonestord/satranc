# Varlık hattı (scripts/assets)

Mixamo'dan indirilen karakterleri/canlandırmaları ve çizgi film taş setini oyunun kullandığı
GLB dosyalarına dönüştürür. Dönüştürme, three.js'in kendi yükleyici ve dışa aktarıcılarıyla
başsız (görünmez) bir Chrome içinde yapılır; sonuç dosyaları doğrudan `public/` altına yazılır.
Hat yeniden çalıştırılabilir: kaynak dosyalar değişince komutu yeniden çalıştırmak yeter.

## Ne üretir?

| Çıktı | Kaynak |
| --- | --- |
| `public/karakterler/ty/karakter.glb` | `Ty.fbx` + bütün canlandırmalar |
| `public/karakterler/patron/karakter.glb` | `The Boss.fbx` + bütün canlandırmalar |
| `public/karakterler/sovalye/karakter.glb` | `castle_guard_01.fbx` + bütün canlandırmalar |
| `public/temalar/taslar/cizgi-film/taslar.glb` | `cartoon_chess_set.glb` |

Hangi dosyadan hangi klibin üretileceği `ayarlar.mjs` içindedir (klip adları, türleri,
doku sınırları, renkler).

## Gerekenler

- `npm install` yapılmış proje (three, vite, playwright).
- Google Chrome (playwright `channel: 'chrome'` ile açar). Ekran kartı gerekmez.
- Kaynak dosyaların bulunduğu klasör. Kullanıcının bilgisayarında bu klasör:
  `C:\Users\TEPEHAN\Downloads\satranç`

Dosyaları yeniden adlandırmaya gerek yoktur: "Sitting Idle (1).fbx" gibi boşluklu ve parantezli
adlar otomatik olarak `Sitting_Idle__1_.fbx` biçimine eşlenir.

## Çalıştırma

Proje klasöründe:

```bash
# Hepsi: karakterler + taş seti + önizleme görüntüleri
node scripts/assets/hazirla.mjs --kaynak "C:\Users\TEPEHAN\Downloads\satranç"

# Yalnızca karakterler (veya tek karakter)
node scripts/assets/hazirla.mjs --kaynak <klasör> --is karakter
node scripts/assets/hazirla.mjs --kaynak <klasör> --is karakter --id patron

# Yalnızca taş seti
node scripts/assets/hazirla.mjs --kaynak <klasör> --is taslar

# Yalnızca önizleme görüntüleri (üretilmiş GLB'leri yükleyip çizer)
node scripts/assets/hazirla.mjs --kaynak <klasör> --is onizleme
node scripts/assets/hazirla.mjs --kaynak <klasör> --is onizleme --id ty --klipler oturma-2,konusma --t 0.1
```

Kısayol: `npm run varliklar -- --kaynak <klasör>`.

`--kaynak` verilmezse `SATRANC_KAYNAK` ortam değişkeni, o da yoksa `scripts/assets/kaynak/`
klasörü kullanılır (bu klasör git'e girmez).

Önizleme görüntüleri `scripts/assets/onizleme/asset-*.png` olarak kaydedilir (`--goruntu <klasör>`
ile değiştirilebilir). Her karakter için `bekleme-1`, `sevinc` ve `kizgin` klipleri yarı sürede
durdurulup önden ve yandan çizilir; kırmızı nokta karakterin kök noktasıdır (0,0,0).
Her çalıştırma `scripts/assets/rapor-*.json` dosyalarına ayrıntılı bir rapor da yazar.

Sonra denetim: `npm test` (`tests/assets/assets.test.ts` GLB dosyalarını denetler).

## Karakter dönüştürmede yapılanlar

1. **Kemik birleştirme.** FBXLoader, birden çok örgünün paylaştığı her kemiği örgü başına
   kopyalar. Bütün örgüler tek kemik takımına bağlanır, kopyalar silinir.
2. **Malzemeler.** Phong malzemeleri `MeshStandardMaterial`'a çevrilir (renk ve doku korunur,
   pürüzlülük 0,7, metallik 0; normal haritası varsa korunur, specular haritası atılır).
   Dokusunda saydamlık olan malzemeler (kirpik, saç kartı) alfa kesme (alphaTest 0,5) ve çift
   yüz ile çizilir. Dokular en çok 1024 piksele (adı head/face içeren örgülerde 2048) küçültülür;
   saydamlığı olmayanlar JPEG, olanlar PNG olarak gömülür. Fazladan UV kanalları atılır.
3. **Canlandırma aktarımı.** Kemik adlarındaki `mixamorig`, `mixamorig1`, `mixamorig:` öneki atılıp
   hedef karakterin öneki eklenir. Hedefte olmayan kemiklerin izleri (ör. parmaksız kliplerde)
   atlanır. Yalnızca dönüş izleri ve kalça konumu kullanılır.
4. **Kalça konumu.** Kaynak ile hedef iskeletin kalça yüksekliği oranında ölçeklenir. Bütün
   oturma klipleri aynı oturma noktasına taşınır: noktanın yüksekliği `oturus` klibinden gelir,
   yatayda (0, 0) noktasındadır. Klip içindeki küçük kalça hareketleri korunur, kayma olmaz.
   `oturma-2` (ayaktan oturma geçişi) son karesi bu noktaya oturacak biçimde taşınır.
   Son olarak bütün kalça konumları, `bekleme-1` klibinde ayak tabanı y=0'a gelecek kadar
   kaydırılır (zemin ayarı).
5. **sasirma** (ayakta çekilmiş klip): yalnızca omurga, boyun, baş, omuz, kol ve el izleri kalır;
   kalça ve bacak izleri atılır. Oturma klibinin üstüne katman olarak oynatılmak içindir.
6. **Seyreltme.** Kare hızı en çok 30 FPS; ara değerle yeniden üretilebilen ana kareler atılır
   (dönüşte ~0,09°, konumda 0,02 cm tolerans).
7. **Birim.** Kaynak santimetredir; kök düğüm (`karakter`) 0,01 ölçekle metreye çevirir.

## Taş seti dönüştürmede yapılanlar

- Taş türleri kaynaktaki grup adlarından (`Pawn_W1`, `Rook_W1`, `Knight_W1`, `Bishop_W1`,
  `Queen_W`, `King_W`) alınır; başlangıç dizilişiyle de denetlenmiştir (beyaz takım -x
  tarafında, vezir d sütununda). İki renk de beyaz takımın geometrisini kullanır.
- Çizgi film dış hat kabukları (`Outline...` düğümleri) atılır; atın gözleri, burun delikleri ve
  şahın taç bandı ayrı bir "boya" malzemesiyle korunur.
- Malzemeler ışıkla gölgelenen ahşap: beyaz `#efe3c8`, siyah `#3a2418`, pürüzlülük 0,45.
- Her taş tabanı y=0'da ve dikey eksende ortalanır; at başı +x yönüne bakar (oyun siyah taşları
  yarım tur döndürür). 3000 üçgeni aşan gövdeler meshoptimizer ile inceltilir.
- Oyundaki düğüm adları: `piyon-beyaz`, `piyon-siyah`, `kale-…`, `at-…`, `fil-…`, `vezir-…`, `sah-…`.
