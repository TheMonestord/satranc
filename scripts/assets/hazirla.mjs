#!/usr/bin/env node
// Varlık hattı: Mixamo FBX karakterlerini ve çizgi film taş setini oyunun kullandığı GLB
// dosyalarına dönüştürür. Dönüştürme, three.js'in yükleyici/dışa aktarıcılarıyla başsız bir
// Chrome içinde yapılır; sonuç dosyaları public/ altına yazılır.
//
// Kullanım:
//   node scripts/assets/hazirla.mjs --kaynak <klasör> [--is karakter|taslar|onizleme|hepsi] [--id ty]
// Ayrıntılar: scripts/assets/README.md

import { createServer } from 'vite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { KARAKTERLER, KLIPLER, TASLAR, duzAd } from './ayarlar.mjs';

const BURASI = path.dirname(fileURLToPath(import.meta.url));
const PROJE = path.resolve(BURASI, '../..');
const PUBLIC = path.join(PROJE, 'public');

function arg(ad, varsayilan) {
  const i = process.argv.indexOf(`--${ad}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : varsayilan;
}

const kaynak = path.resolve(arg('kaynak', process.env.SATRANC_KAYNAK ?? path.join(BURASI, 'kaynak')));
const is = arg('is', 'hepsi');
const sadeceId = arg('id', null);
const goruntuKlasoru = path.resolve(arg('goruntu', path.join(BURASI, 'onizleme')));

if (!fs.existsSync(kaynak)) {
  console.error(`Kaynak klasörü bulunamadı: ${kaynak}\n--kaynak <klasör> ile Mixamo indirmelerinin klasörünü verin.`);
  process.exit(1);
}

// Kaynak klasöründeki dosyaları düzleştirilmiş adla eşle ("Sitting Idle (1).fbx" -> "Sitting_Idle__1_.fbx").
const dosyalar = new Map();
for (const ad of fs.readdirSync(kaynak)) dosyalar.set(duzAd(ad), path.join(kaynak, ad));

const gerekli = [];
if (is === 'hepsi' || is === 'karakter') {
  for (const k of KARAKTERLER) gerekli.push(k.kaynak);
  for (const k of KLIPLER) gerekli.push(k.kaynak);
}
if (is === 'hepsi' || is === 'taslar') gerekli.push(TASLAR.kaynak);
const eksik = gerekli.filter((d) => !dosyalar.has(duzAd(d)));
if (eksik.length) {
  console.error(`Kaynak klasöründe eksik dosyalar:\n  ${eksik.join('\n  ')}`);
  process.exit(1);
}

/** Kaynak dosyaları /kaynak/ altında sunar, sayfanın gönderdiği çıktıları public/ altına yazar. */
function kopruEklentisi() {
  return {
    name: 'varlik-koprusu',
    configureServer(server) {
      server.middlewares.use('/kaynak/', (req, res) => {
        const ad = decodeURIComponent(req.url.split('?')[0].replace(/^\//, ''));
        const dosya = dosyalar.get(duzAd(ad));
        if (!dosya) {
          res.statusCode = 404;
          res.end('yok');
          return;
        }
        res.setHeader('Content-Type', 'application/octet-stream');
        fs.createReadStream(dosya).pipe(res);
      });
      server.middlewares.use('/cikti/', (req, res) => {
        const goreli = decodeURIComponent(req.url.split('?')[0].replace(/^\//, ''));
        const hedef = path.resolve(PUBLIC, goreli);
        if (!hedef.startsWith(PUBLIC + path.sep) || req.method !== 'POST') {
          res.statusCode = 400;
          res.end('geçersiz');
          return;
        }
        const parcalar = [];
        req.on('data', (p) => parcalar.push(p));
        req.on('end', () => {
          fs.mkdirSync(path.dirname(hedef), { recursive: true });
          fs.writeFileSync(hedef, Buffer.concat(parcalar));
          console.log(`  yazıldı: public/${goreli} (${(fs.statSync(hedef).size / 1024 / 1024).toFixed(2)} MB)`);
          res.end('tamam');
        });
      });
      // Önizleme sayfası public/ altındaki çıktıları okur.
      server.middlewares.use('/public/', (req, res, next) => {
        const goreli = decodeURIComponent(req.url.split('?')[0].replace(/^\//, ''));
        const hedef = path.resolve(PUBLIC, goreli);
        if (!hedef.startsWith(PUBLIC + path.sep) || !fs.existsSync(hedef)) return next();
        fs.createReadStream(hedef).pipe(res);
      });
    },
  };
}

const server = await createServer({
  configFile: false,
  root: path.join(BURASI, 'web'),
  // Ayrı önbellek: oyunun geliştirme sunucusunun node_modules/.vite klasörüne dokunmasın.
  cacheDir: path.join(PROJE, 'node_modules/.vite-varlik'),
  logLevel: 'warn',
  server: { port: 0, strictPort: false, fs: { allow: [PROJE] } },
  plugins: [kopruEklentisi()],
});
await server.listen();
const adres = server.resolvedUrls.local[0];

const tarayici = await chromium.launch({
  channel: 'chrome',
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});

/** Bir dönüştürme sayfasını açar, bitmesini bekler ve günlüğünü yazdırır. */
async function calistir(sayfaAdi, sorgu, sure = 600_000) {
  const sayfa = await tarayici.newPage({ viewport: { width: 1200, height: 900 } });
  sayfa.on('console', (m) => {
    const t = m.text();
    if (/Failed to load resource|GL Driver Message/.test(t)) return;
    if (m.type() === 'error' || m.type() === 'warning') console.log(`  [${m.type()}] ${t}`);
    else if (t.startsWith('»')) console.log(`  ${t}`);
  });
  sayfa.on('response', (r) => {
    if (r.status() >= 400) console.log(`  [${r.status()}] ${decodeURIComponent(r.url())}`);
  });
  sayfa.on('pageerror', (e) => console.log(`  [hata] ${e.message}`));
  await sayfa.goto(`${adres}${sayfaAdi}.html?${new URLSearchParams(sorgu)}`);
  await sayfa.waitForFunction(() => window.__bitti !== undefined, null, { timeout: sure });
  const sonuc = await sayfa.evaluate(() => window.__bitti);
  if (sonuc?.hata) throw new Error(`${sayfaAdi}: ${sonuc.hata}`);
  return { sayfa, sonuc };
}

try {
  if (is === 'hepsi' || is === 'karakter') {
    for (const k of KARAKTERLER) {
      if (sadeceId && k.id !== sadeceId) continue;
      console.log(`Karakter: ${k.id} (${k.kaynak})`);
      const { sayfa, sonuc } = await calistir('karakter', { id: k.id });
      fs.writeFileSync(path.join(BURASI, `rapor-${k.id}.json`), JSON.stringify(sonuc, null, 2));
      await sayfa.close();
    }
  }
  if (is === 'hepsi' || is === 'taslar') {
    console.log(`Taş seti: ${TASLAR.tema} (${TASLAR.kaynak})`);
    const { sayfa, sonuc } = await calistir('taslar', {});
    fs.writeFileSync(path.join(BURASI, 'rapor-taslar.json'), JSON.stringify(sonuc, null, 2));
    await sayfa.close();
  }
  if (is === 'hepsi' || is === 'onizleme') {
    fs.mkdirSync(goruntuKlasoru, { recursive: true });
    const isler = [];
    for (const k of KARAKTERLER) {
      if ((sadeceId && k.id !== sadeceId) || sadeceId === 'taslar') continue;
      for (const klip of arg('klipler', 'bekleme-1,sevinc,kizgin').split(',')) isler.push({ id: k.id, klip });
    }
    for (const { id, klip } of isler) {
      const t = arg('t', '0.5');
      const { sayfa, sonuc } = await calistir('onizleme', { id, klip, t });
      const dosya = path.join(goruntuKlasoru, `asset-${id}-${klip}${t === '0.5' ? '' : '-' + t}.png`);
      await sayfa.locator('canvas').screenshot({ path: dosya });
      console.log(`  önizleme: ${dosya} ${JSON.stringify(sonuc)}`);
      await sayfa.close();
    }
    if ((!sadeceId || sadeceId === 'taslar') && fs.existsSync(path.join(PUBLIC, 'temalar/taslar', TASLAR.tema, 'taslar.glb'))) {
      const { sayfa } = await calistir('taslar-onizleme', {});
      const dosya = path.join(goruntuKlasoru, 'asset-taslar.png');
      await sayfa.locator('canvas').screenshot({ path: dosya });
      console.log(`  önizleme: ${dosya}`);
      await sayfa.close();
    }
  }
} finally {
  await tarayici.close();
  await server.close();
}
