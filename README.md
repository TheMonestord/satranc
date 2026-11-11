# Satranç

Tarayıcıda çalışan, sunucusuz, 3D satranç oyunu. Bilgisayara karşı veya aynı cihazda iki kişi oynanır.

## Çalıştırma

```bash
npm install
npm run dev      # geliştirme
npm test         # testler
npm run build    # yayın çıktısı: dist/
```

## Lisans ve teşekkür

Bu proje GPL-3.0 lisanslıdır (bkz. `LICENSE`).

Bilgisayar rakibi [Stockfish](https://stockfishchess.org/) motorunu, [stockfish.js](https://github.com/nmrugg/stockfish.js) derlemesiyle kullanır (GPL-3.0). Satranç kuralları için [chess.js](https://github.com/jhlywa/chess.js), 3D için [three.js](https://threejs.org/) kullanılır.
