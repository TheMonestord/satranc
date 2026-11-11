# Satranç

Tarayıcıda çalışan, sunucusuz, 3D satranç oyunu. Bilgisayara karşı veya aynı cihazda iki kişi oynanır.

**Oyna:** https://themonestord.github.io/satranc/

## Çalıştırma

```bash
npm install
npm run dev      # geliştirme
npm test         # testler
npm run build    # yayın çıktısı: dist/
npm run e2e      # tarayıcıda uçtan uca testler (Chrome gerekir)
```

## Lisans ve teşekkür

Bu proje GPL-3.0 lisanslıdır (bkz. `LICENSE`).

Bilgisayar rakibi [Stockfish](https://stockfishchess.org/) motorunu, [stockfish.js](https://github.com/nmrugg/stockfish.js) derlemesiyle kullanır (GPL-3.0). Satranç kuralları için [chess.js](https://github.com/jhlywa/chess.js), 3D için [three.js](https://threejs.org/) kullanılır.

## Yeni tema nasıl eklenir

Oyunun görünümü dört bağımsız yuvadan oluşur: **ortam**, **masa**, **taşlar** ve **eller**. Her tema `public/temalar/` altında kendi klasöründe durur. Yeni tema eklemek için koda dokunmak gerekmez:

1. İlgili klasörün altında yeni bir klasör açın, örneğin `public/temalar/masalar/mermer/`.
2. İçine bir `tema.json` koyun (aşağıdaki alanlarla).
3. `public/temalar/index.json` içindeki listeye klasörün yolunu ekleyin: `"masalar/mermer"`.

Tema, oyunun Ayarlar bölümünde kendiliğinden görünür.

### Ortak alanlar

| Alan | Açıklama |
|---|---|
| `id` | Klasör adıyla aynı kısa ad; küçük harf, rakam ve tire |
| `tur` | `ortam`, `masa`, `taslar` veya `eller` |
| `ad` | Menüde görünen ad: `{ "tr": "...", "en": "..." }` |
| `model` | İsteğe bağlı. Aynı klasördeki bir `.glb` / `.gltf` dosyasının adı |

### Yuvaya özel alanlar

Renkler `#rrggbb` biçimindedir.

| Yuva | Alanlar |
|---|---|
| `ortam` | `arkaPlan`, `zemin`, `isikRengi`, `isikSiddeti` (0–5) |
| `masa` | `acikKare`, `koyuKare`, `cerceve`, `masaRengi` |
| `taslar` | `beyaz`, `siyah`, `parlaklik` (0–1) |
| `eller` | `renk`, isteğe bağlı `kolRengi` |

Hatalı bir `tema.json` oyunu bozmaz; o tema atlanır ve tarayıcı konsoluna nedeni yazılır.
