# Sürüm 1 Notları

Oyun adresi: https://themonestord.github.io/satranc/

## Yapılanlar

- Eksiksiz klasik satranç: rok, geçerken alma, terfi (taş seçimiyle), şah, şah mat, pat, üç kez tekrar, 50 hamle kuralı, yetersiz materyal.
- Bilgisayara karşı oyun, altı seviye (Stockfish).
- Aynı cihazda iki kişi.
- 3D görünüm ve 2D görünüm; oyun sırasında geçiş.
- Eller modu: taşları bir el alır, taşır ve bırakır; taş alma, rok, geçerken alma ve terfi canlandırılır.
- Tema sistemi: ortam, masa, taş seti ve eller ayrı ayrı seçilir. İki masa teması var (Ahşap, Mermer); diğer yuvalarda birer tema.
- Yeni oyun, hamle geri alma, pes etme, tahtayı çevirme, hamle listesi, FEN ve PGN kopyalama.
- Ayarlar: dil (Türkçe / İngilizce), grafik kalitesi, animasyon hızı, görünüm, temalar. Değişiklikler anında uygulanır ve cihazda saklanır.
- Yarım kalan oyun cihazda saklanır; sayfa yeniden açılınca "Devam Et" ile sürer.
- 3D desteklenmeyen cihazda 2D görünüm; 3D yavaş çalışırsa kalite düşürülür, yine yavaşsa 2D önerilir.

## Yapılmayanlar (sonraki sürümler)

- Ses efektleri ve müzik.
- Satranç saati.
- Maç geçmişi (yalnızca süren oyun saklanır; biten oyun saklanmaz).
- Yürüyen taşlar modu.
- Bulmacalar, eğitim, analiz.
- İnternetsiz kurulum (PWA). Oyun bir kez açıldıktan sonra tarayıcı önbelleğinden açılabilir, ancak bu garanti değildir.
- Online oyun.

## Bilinen sınırlar

- Taşlar, el ve ortam kodla üretilen sade modellerdir; gerçekçi modeller henüz yok.
- Hazır 3D model dosyası (GLB) yükleme yolu yazıldı ama gerçek bir model dosyasıyla denenmedi.
- 3D görünüm gerçek telefonlarda denenmedi; yalnızca telefon boyutunda tarayıcı penceresiyle sınandı.
- Bilgisayar rakibi dosyası yaklaşık 1,8 MB'tır; yavaş bağlantıda ilk açılış birkaç saniye sürebilir.

## Testler

- Birim testleri: `npm test`
- Uçtan uca testler: `npm run e2e` (iki kişilik oyun, bilgisayara karşı oyun, tema seçimi, telefon boyutu)
