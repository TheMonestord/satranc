# Sürüm 2 Notları

Oyun adresi: https://themonestord.github.io/satranc/
Tarih: 12 Kasım 2026

## Sürüm 1 üzerinde düzeltmeler

- El ve kol canlandırması yavaşlatıldı: bir hamle yaklaşık 1,3 saniyeden 2,4 saniyeye çıktı.
- Bilgisayarın eli artık oyuncunun eli çekilmeden tahtaya girmiyor. Önceden bilgisayarın cevabı oyuncunun canlandırmasını yarıda kesiyordu. Şimdi hamleler sırayla canlandırılır ve aralarında yarım saniyelik bir duraklama olur.
- Bilgisayarın hamle öncesi en kısa bekleme süresi 0,6 saniyeden 0,9 saniyeye çıkarıldı.
- Tahtaya tıklamak süren canlandırmayı hâlâ anında bitirir; bekleme istemeyen oyuncu tıklayarak geçebilir.

## Yapılanlar

- **Yürüyen taşlar modu.** Ayarlar → Hareket modu → "Taşlar kendi yürüsün". Her taşın kendi hareketi var:
  - Piyon küçük, hızlı adımlar atar.
  - At diğer taşların üzerinden sıçrar ve yere otururken ezilir.
  - Kale yerden kalkmadan ağır ilerler; durduğunda yerde toz halkası çıkar.
  - Fil havada süzülür, arkasında ışık izi bırakır.
  - Vezir kendi etrafında dönerek hızla kayar.
  - Şah ağırbaşlı yürür; şah çekilince irkilir, mat olunca devrilir ve devrik kalır.
  - Alınan taş, saldıran ulaştığında geriye devrilip kaybolur. Rok, geçerken alma ve terfi de canlandırılır.
- **Ses efektleri.** Taş koyma, taş alma, adım, sıçrama, kayma, terfi, şah, mat ve beraberlik sesleri. Ayarlardan kapatılabilir.
- **Müzik.** Ortama göre üç hava (sakin, gece, gündüz). Varsayılan olarak kapalıdır; Ayarlar → Müzik ile açılır.
- **Satranç saati.** İki kişilik oyunda süre seçimi: Süresiz, 3+2, 5+0, 10+0, 15+10. Süresi biten kaybeder. Kalan süre oyundan çıkınca saklanır.
- **Geçmiş oyunlar.** Biten her oyun (mat, beraberlik, pes, süre) cihazda saklanır; menüdeki "Geçmiş Oyunlar" ekranında tarih, tür, sonuç ve hamle sayısıyla listelenir, PGN'i kopyalanabilir. En çok 100 oyun tutulur.
- **Yeni temalar.** Ortam: Gece Salonu, Gün Işığı. Masa: Gece Mavisi. Taş seti: Buz ve Ateş, Altın ve Gümüş. El: Deri Eldiven.

## Bilinen sınırlar

- Sesler ve müzik ses dosyası değil, tarayıcıda üretilen sade tonlardır. Çalıştıkları testle doğrulandı ama kulakla dinlenip ayarlanmadı; ses düzeyleri ve tınılar değişiklik isteyebilir.
- Saat yalnızca iki kişilik oyunda vardır; bilgisayara karşı oyunda yoktur.
- Saatli oyunda geri alma yoktur.
- Saat, oyun başlar başlamaz beyaz için akmaya başlar.
- Yürüyen taşlar hâlâ kodla çizilmiş klasik satranç taşlarıdır; kol ve bacakları olan karakterler değildir. Karakter görünümü hazır 3D model dosyaları eklenince gelir.
- Yürüyen taşlar modu ve yeni ekranlar gerçek telefonda denenmedi.
- Bu sürüm bağımsız bir denetçiden geçmedi (Sürüm 1 geçmişti).

## Testler

- 237 birim testi (`npm test`) ve 6 tarayıcı testi (`npm run e2e`) geçiyor.
