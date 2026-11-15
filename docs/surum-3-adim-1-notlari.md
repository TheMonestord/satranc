# Sürüm 3 — Adım 1 Notları: Masa Başında Rakip

Oyun adresi: https://themonestord.github.io/satranc/
Tarih: 15 Kasım 2026

## Yenilikler

- **Masa başı görünüm.** 3D'de kamera artık masada oturan oyuncunun gözüdür. Fareyle sürükleyince baş sınırlı biçimde döner, tekerlekle tahtaya doğru eğilinir. Eski görünüm: Ayarlar → Kamera → Kuşbakışı.
- **Sorgu Odası.** Yeni varsayılan ortam. Lekeli beton duvarlar, karo zemin, tavandan sarkan ve hafifçe sallanan tek lamba (ara sıra titrer), parmaklıklı pencereli demir kapı, borular, dolapta kavanozlar, durmuş duvar saati. Diğer ortamlar Ayarlar'dan seçilebilir.
- **İlk rakip: Deneyci.** Bilgisayara karşı oyunda karşıda oturur. Kirli sarı koruyucu giysi, yeşil camlı gaz maskesi, yanda filtre kutusu, kalın lastik eldivenler.
  - Boşta nefes alır, başını oynatır; seçtiğin taşa bakar.
  - Düşünürken başını eğer, sol parmaklarıyla masaya vurur.
  - Taşı alınınca irkilir, taş alınca başını sallar, şah çekince öne eğilir, şah yiyince geri çekilir, kazanınca ellerini birleştirir, kaybedince çöker, berabere kalınca omuz silker.
  - Uzaktaki karelere uzanmak için sandalyeden yarı doğrulur ve öne eğilir.
- **Kolla oynanan hamleler.** Hem senin hem rakibin hamlesini omuzdan gelen bir kol yapar: uzanır, taşı kavrar, taşır, bırakır, geri çekilir. Senin kolun ekranın sağ altından girer.
- **Masa saati.** Sağında iki kadranlı analog satranç saati. Saatli oyunda süreleri gösterir, sırası geçenin düğmesi basılı durur, süre bitince bayrak düşer. Süresiz oyunda göstergede ∞ yazar. Ekranın sağındaki panelde de süreler görünür.
- Siyahla oynarken her şey masanın öbür yanına geçer: rakip karşına, saat sağına.

## Bilinen sınırlar

- Saat bilgisayara karşı oyunda henüz çalışmıyor (Adım 2'de gelecek). Bu oyunda masa saati ∞ gösterir.
- İki kişilik oyunda karşıda karakter yoktur; hamleleri eski bağımsız el yapar.
- Kuşbakışı kamerada oyuncunun kolu yoktur; rakip yine oturur.
- Karakterin "kazandı" pozundaki birleşmiş eller yakından biraz kaba görünüyor.
- Gerçek telefonda denenmedi. Oda ve karakter sürekli çizim gerektirdiği için zayıf cihazlarda kalite otomatik düşebilir.

## Testler

- Birim testleri (`npm test`) ve 6 tarayıcı testi (`npm run e2e`) geçiyor.
- Karakter önizleme sayfası (yalnızca geliştirme): `npx vite` sonra `/karakter.html`.

## Sıradaki: Adım 2

Süre modları: Bullet, Blitz, Hızlı ve Kara Delik; bilgisayara karşı oyunda saat.
