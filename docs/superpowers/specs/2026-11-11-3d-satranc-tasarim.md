# 3D Satranç Oyunu — Tasarım Belgesi

Tarih: 11 Kasım 2026
Durum: Sohbette onaylandı, yazılı inceleme bekliyor

## 1. Amaç

Arkadaşlara link atılarak oynatılabilen, herkese açık, ücretsiz, sunucusuz bir 3D satranç oyunu.

- Ticari hedef yok. Mağaza, ödeme ve hesap sistemi yok.
- GitHub üzerinden yayınlanır (GitHub Pages). Oyuncu linke tıklar, tarayıcıda oynar; kurulum gerekmez.
- Temel ilke değiştirilebilirliktir: renkler, ortamlar, masalar, taşlar ve taşları oynatan eller birbirinden bağımsız parçalardır ve yenileri oyunun koduna dokunmadan eklenebilir.
- Online oyun şimdilik kapsam dışıdır; yapı ileride eklenmesine engel olmayacak şekilde kurulur.

### Başarı ölçütleri

- Bir arkadaş linke tıkladıktan sonra en geç 10 saniyede oyuna başlayabilir (ortalama bir bağlantıda).
- Bütün satranç kuralları hatasız çalışır.
- Yeni bir tema, yalnızca yeni bir klasör ve bir ayar dosyası eklenerek oyuna girer.
- Oyun bilgisayarda ve telefonda oynanabilir.

## 2. Kapsam

### Sürüm 1 — Oynanabilir oyun

- Eksiksiz klasik satranç: rok, geçerken alma, terfi (taş seçimiyle), şah, şah mat, pat, üç kez tekrar, 50 hamle kuralı, yetersiz materyal.
- Bilgisayara karşı oyun, altı seviye: Beginner, Easy, Medium, Hard, Expert, Master.
- Aynı cihazda iki kişi.
- 3D görünüm ve 2D görünüm; ikisi aynı oyunu gösterir, oyun sırasında geçiş yapılabilir.
- Hareket modu: eller (bir el taşı alır ve yerine koyar).
- Bir ortam, bir masa/tahta, bir taş seti, bir el seti (varsayılan tema).
- Tema altyapısı ve menüden yuva seçimi.
- Oyun işlevleri: yeni oyun, hamle geri alma (bilgisayara karşı), pes etme, tahtayı çevirme, hamle listesi, FEN ve PGN dışa aktarma.
- Ayarlar: grafik kalitesi (Low / Medium / High), animasyon hızı (normal / hızlı / kapalı), dil (Türkçe / İngilizce).
- Yarım kalan oyun cihazda saklanır ve sayfa yeniden açılınca devam eder.
- GitHub Pages'te yayın.

### Sürüm 2 — Yaşayan taşlar

- Hareket modu: taşlar kendi yürür (bkz. bölüm 6).
- İki veya üç yeni tema.
- Ses efektleri ve ortam müziği.
- Satranç saati (aynı cihazda iki kişi için).
- Maç geçmişi (cihazda saklanır).

### Sürüm 3 — Derinlik

- Bulmacalar, eğitim modu, analiz modu.
- İnternetsiz kurulum (PWA): oyun telefona veya bilgisayara uygulama gibi eklenir, internet yokken açılır.

### Kapsam dışı

Online eşleşme, kullanıcı hesapları, ELO ve ligler, turnuvalar, sohbet, mağaza, oyun içi para, ödeme. Bunlar ilk proje dosyasında vardı; bu sürümlerin hiçbirinde yoktur.

## 3. Teknoloji

| Konu | Seçim | Neden |
|---|---|---|
| Dil ve derleme | TypeScript + Vite | Hata yakalama, hızlı derleme, statik çıktı |
| 3D | Three.js | Tarayıcıda çalışır, en geniş kaynak ve model desteği |
| Satranç kuralları | chess.js | Kanıtlanmış kütüphane; kuralları yeniden yazmak gereksiz risk |
| Bilgisayar rakibi | Stockfish (WebAssembly), Web Worker içinde | Güçlü motor; arayüzü dondurmadan çalışır |
| Arayüz | Düz HTML + CSS + TypeScript | Menü sayısı az; ek çerçeve gerekmiyor |
| Saklama | localStorage (ayarlar), IndexedDB (oyunlar) | Sunucu gerektirmez |
| Yayın | GitHub Pages + GitHub Actions | Ücretsiz; her güncellemede otomatik yayın |
| Lisans | GPL-3.0 | Stockfish GPL lisanslıdır; proje zaten açık kaynak olacak |

## 4. Mimari

Dört katman vardır. Her katman yalnızca bir altındakini bilir.

```
Arayüz (menüler, ayarlar, hamle listesi)
        |
Sahne (3D görünüm, 2D görünüm, hareket modları)  <-- Tema sistemi
        |
Oyun yöneticisi (sıra, rakip çağrısı, kayıt)
        |
Satranç çekirdeği (kurallar)        Rakip (Stockfish)
```

### 4.1 Satranç çekirdeği

chess.js üzerine ince bir sarmalayıcı. Görselden habersizdir.

- Girdi: bir hamle isteği (nereden, nereye, terfi taşı).
- Çıktı: hamle geçerliyse bir **hamle olayı**; değilse ret.
- Hamle olayı şunları içerir: taş, renk, başlangıç ve bitiş karesi, alınan taş ve karesi, özel durum (rok, geçerken alma, terfi), sonuç (şah, şah mat, pat, beraberlik).

Sahne ve hareket modları yalnızca bu hamle olayını görür. Online oyun ileride eklenirse hamle olayının kaynağı sunucu olur; üst katmanlar değişmez.

### 4.2 Rakip

Stockfish ayrı bir iş parçacığında çalışır. Seviyeler yalnızca arama derinliğiyle değil, üç ayarla belirlenir: motorun beceri seviyesi, düşünme süresi ve alt seviyelerde bilinçli hata oranı. Bilgisayar hamlesinden önce kısa, doğal bir bekleme olur.

### 4.3 Sahne

- **3D görünüm:** Three.js sahnesi. Temadan gelen ortam, masa, taşlar ve eller yüklenir.
- **2D görünüm:** Düz tahta. WebGL olmayan veya zayıf cihazlarda otomatik olarak buna geçilir.
- İkisi de aynı oyun yöneticisini dinler.

Kural: hamle çekirdekte anında işlenir, animasyon arkadan oynar. Animasyon hızlandırılabilir, atlanabilir veya kapatılabilir; oyunun durumu animasyona bağlı değildir.

### 4.4 Hareket modları

Her hareket modu aynı sözleşmeye uyar: bir hamle olayı alır, canlandırır, bittiğinde haber verir.

- **Eller modu (Sürüm 1):** El masanın kenarından uzanır, taşı kavrar, kaldırır, hedef kareye koyar ve geri çekilir. Taş almada el önce alınan taşı tahtadan kaldırır. Rokta iki taş sırayla oynatılır. Tek bir el animasyonu bütün taşlar için çalışır.
- **Yürüyen taşlar modu (Sürüm 2):** Bkz. bölüm 6.

Yeni bir hareket modu, bu sözleşmeye uyan yeni bir parça olarak eklenir.

## 5. Tema sistemi

Beş bağımsız yuva vardır:

1. **Ortam** — oda, arka plan, ışık, (Sürüm 2'de) müzik ve ortam sesi
2. **Masa ve tahta** — masa modeli, tahta, kare renkleri
3. **Taş seti** — altı taşın modelleri, iki rengin malzemeleri
4. **Eller** — el modeli, ten veya eldiven malzemesi
5. **Hareket modu** — eller veya yürüyen taşlar

Her yuvanın her seçeneği kendi klasöründe durur ve bir ayar dosyası (`tema.json`) ile tanımlanır:

```
temalar/
  ortamlar/klasik-oda/tema.json
  masalar/ahsap/tema.json
  taslar/klasik/tema.json
  eller/sade/tema.json
```

Örnek ayar dosyası:

```json
{
  "id": "ahsap",
  "tur": "masa",
  "ad": { "tr": "Ahşap Masa", "en": "Wooden Table" },
  "acikKare": "#e8d2a6",
  "koyuKare": "#8a5a3c",
  "model": "masa.glb"
}
```

- Oyun açılırken tema listesini okur ve menüde gösterir.
- Oyuncu yuvaları serbestçe karıştırır; seçim cihazda saklanır.
- Bir model dosyası verilmemişse parça kodla üretilen sade şekliyle çizilir. Gerçekçi görünüm, hazır 3D model dosyaları (glTF/GLB) bulundukça aynı yuvaya eklenerek gelir.
- Bir tema yüklenemezse o yuva için varsayılan temaya dönülür ve oyun devam eder.

## 6. Yürüyen taşların karakteri (Sürüm 2)

Kurallar klasik satranç olarak kalır; fark yalnızca görsel kişiliktedir.

| Taş | Hareket | Ek tepki |
|---|---|---|
| Piyon | Küçük, hızlı adımlar | Terfi ederken dönüşüm efekti |
| At | Kavis çizerek sıçrar | İnişte hafif toz |
| Kale | Ağır ilerler | Durduğunda yer hafifçe sarsılır |
| Fil | Süzülür | Arkasında ışık izi bırakır |
| Vezir | Zarif ve hızlı | Taş alırken kısa bir parlama |
| Şah | Ağırbaşlı, tek adım | Şah çekilince irkilir; mat olunca devrilir |

İlk hâlinde karakterler kodla üretilen stilize modellerdir. Hazır, hareketli karakter modelleri bulunursa taş seti yuvasına eklenir.

## 7. Veri akışı

1. Oyuncu bir taşa dokunur; arayüz çekirdekten geçerli kareleri alır ve işaretler.
2. Oyuncu hedef kareyi seçer; oyun yöneticisi hamleyi çekirdeğe gönderir.
3. Çekirdek hamleyi işler ve hamle olayı üretir.
4. Oyun yöneticisi durumu cihaza kaydeder ve olayı sahneye iletir.
5. Etkin hareket modu olayı canlandırır.
6. Sıra bilgisayardaysa oyun yöneticisi rakipten hamle ister ve 3. adımdan devam eder.

## 8. Hata durumları

| Durum | Davranış |
|---|---|
| WebGL yok veya çok yavaş | 2D görünüme geçilir, oyuncuya bildirilir |
| Tema veya model yüklenemedi | O yuva için varsayılan tema kullanılır |
| Stockfish yüklenemedi | Bilgisayara karşı mod kapatılır, iki kişilik mod açık kalır, oyuncuya bildirilir |
| Kayıtlı oyun bozuk | Kayıt atlanır, yeni oyun açılır |
| Animasyon sırasında yeni hamle | Süren animasyon anında tamamlanır, yenisi başlar |

## 9. Test

- **Çekirdek:** Özel hamleler ve oyun sonu durumları için otomatik testler (rok koşulları, geçerken alma, terfi, pat, üç kez tekrar, 50 hamle, yetersiz materyal).
- **Hareket modları:** Her özel hamle türü için hamle olayının doğru canlandırma adımlarına çevrildiğini doğrulayan testler.
- **Tema sistemi:** Ayar dosyası doğrulaması; eksik veya hatalı temada varsayılana dönüş testi.
- **Uçtan uca:** Tarayıcıda otomatik bir oyun: açılış, birkaç hamle, bilgisayarın cevabı, görünüm değiştirme, sayfayı yenileyip oyuna devam.
- **Elle kontrol:** Her sürüm sonunda bilgisayarda ve telefonda oynanarak kontrol listesi.

Tamamlanmayan özellik tamamlanmış gibi gösterilmez; her sürüm notunda neyin yapıldığı ve neyin yapılmadığı yazılır.

## 10. Varsayımlar

- "Taşların kendine has özelliği" görsel kişilik olarak yorumlandı; taşlara özel güç veya kural değişikliği yoktur.
- İlk sürümde modeller kodla üretilir ve stilizedir; gerçekçi modeller sonradan eklenir.
- Arkadaşlar birbirleriyle uzaktan oynamaz; bilgisayara karşı veya aynı cihazda oynar.
- Proje herkese açık bir GitHub deposunda durur.
