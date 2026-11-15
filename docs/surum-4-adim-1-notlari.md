# Sürüm 4 — Adım 1 Notları: Sonbahar Parkı ve Sevimli Rakipler

Oyun adresi: https://themonestord.github.io/satranc/
Tarih: 15 Kasım 2026
Esin kaynağı: Pixar'ın "Geri's Game" kısa filmindeki park satrancı havası (karakterin kendisi kopyalanmadı).

## Yenilikler

- **Sonbahar Parkı** (yeni varsayılan ortam): ikindi güneşi, sarı-turuncu-kızıl ağaçlar, yaprak serpilmiş çimen, toprak yol, bank, eski fener, havada süzülerek düşen yapraklar, uzakta sıcak bir pus.
- **Park Masası**: yeşil masa, ahşap kareli tahta.
- **Ahşap Park Takımı**: kullanıcının getirdiği çizgi film takımından ayrılmış, fildişi ve ceviz renkli ahşap taşlar.
- **Gerçek iskeletli karakterler.** Mixamo karakterleri ve animasyonları oyuna dönüştürüldü:
  - **Ty** (varsayılan rakip): parktaki ahşap sandalyesinde oturur, bekleme hareketleri kendiliğinden değişir.
  - Düşünür, taş alınca beğeni yapar ya da alkışlar, taşı alınınca onaylamaz ya da kızar, şah çekince konuşur, şah yiyince şaşırır, kazanınca sevinir, kaybedince masaya yumruk vurur.
  - Taşa kolunu uzatır, parmaklarıyla kavrar. Uzak karelere ulaşmak için öne eğilip doğrulur.
  - Hamle sırasında eline, sen taş seçince o taşa, tepki verirken sana bakar.
- **Senin kolun**: Patron karakterinin gerçek kolu ve eli. Ekranın sağ altından girer.
- **Patron** ve **Şövalye** de oyunda hazır; seçim ekranı sonraki adımda gelecek.
- **Varlık hattı**: `npm run varliklar` komutu, `Downloads\satranç` klasöründeki FBX/GLB dosyalarını oyuna uygun GLB'lere çevirir (bkz. `scripts/assets/README.md`).
- Önceki görünüm (Sorgu Odası, Deneyci) Ayarlar'dan hâlâ seçilebilir. Eski ayarlar bir kez yeni varsayılan temalara geçer.

## Bilinen sınırlar

- Ty en uzak sıralara uzanırken masaya epey eğilir; kafası ekranda büyür.
- Bazı tepki karelerinde eller kısa bir an masa kenarına yakın, alçakta durur.
- Karakter dosyası yüklenene kadar (yavaş bağlantıda birkaç saniye) karşı sandalye boş görünür.
- Rakip seçimi henüz yok; her zaman Ty.
- Satranç takımının yazarı ve lisansı kullanıcıdan öğrenilecek (büyük olasılıkla Sketchfab, CC BY).
- Gerçek telefonda denenmedi.

## Testler

- 320 birim testi ve 6 tarayıcı testi geçiyor.

## Sıradaki

Rakip seçme ekranı (Ty, Patron, Şövalye), süre modları (Bullet, Blitz, Hızlı, Kara Delik) ve önerilen eklerden seçilenler.
