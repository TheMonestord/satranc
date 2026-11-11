// Stockfish'in tek iş parçacıklı "lite" derlemesini public/engine altına kopyalar.
// GitHub Pages çok iş parçacıklı derlemenin gerektirdiği başlıkları veremediği için bu derleme kullanılır.
import { copyFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const binDir = join(root, 'node_modules', 'stockfish', 'bin');
const outDir = join(root, 'public', 'engine');

if (!existsSync(binDir)) {
  console.error('copy-engine: node_modules/stockfish/bin bulunamadı');
  process.exit(1);
}
const files = readdirSync(binDir);
const js = files.find((f) => f.includes('lite') && f.includes('single') && f.endsWith('.js'));
const wasm = files.find((f) => f.includes('lite') && f.includes('single') && f.endsWith('.wasm'));
if (!js || !wasm) {
  console.error('copy-engine: lite-single derlemesi bulunamadı. Mevcut dosyalar:', files.join(', '));
  process.exit(1);
}
mkdirSync(outDir, { recursive: true });
// Motor betiği .wasm dosyasını kendi adından türetir; ikisi aynı adı taşımalıdır.
copyFileSync(join(binDir, js), join(outDir, 'stockfish.js'));
copyFileSync(join(binDir, wasm), join(outDir, 'stockfish.wasm'));
console.log(`copy-engine: ${js} + ${wasm} -> public/engine/`);
