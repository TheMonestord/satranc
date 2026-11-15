import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import type { GltfLike } from '../../../src/scene/view3d/characters/gltfRig';

/**
 * Gerçek karakter GLB'sini Node'da çözümler. Dokular (resimler) çıkarılır: jsdom'da resim yüklenemez,
 * kemikler, örgüler ve canlandırmalar olduğu gibi kalır.
 */
export async function loadCharacterGlb(id: string): Promise<GltfLike> {
  const buf = readFileSync(resolve(__dirname, `../../../public/karakterler/${id}/karakter.glb`));
  const jsonLen = buf.readUInt32LE(12);
  const json = JSON.parse(buf.subarray(20, 20 + jsonLen).toString('utf8'));
  delete json.images;
  delete json.textures;
  delete json.samplers;
  for (const m of json.materials ?? []) {
    const p = m.pbrMetallicRoughness;
    if (p) {
      delete p.baseColorTexture;
      delete p.metallicRoughnessTexture;
    }
    delete m.normalTexture;
    delete m.emissiveTexture;
    delete m.occlusionTexture;
  }
  const binStart = 20 + jsonLen;
  const binLen = buf.readUInt32LE(binStart);
  const bin = buf.subarray(binStart + 8, binStart + 8 + binLen);
  let js = Buffer.from(JSON.stringify(json), 'utf8');
  js = Buffer.concat([js, Buffer.alloc((4 - (js.length % 4)) % 4, 0x20)]);
  const out = Buffer.alloc(12 + 8 + js.length + 8 + bin.length);
  out.writeUInt32LE(0x46546c67, 0);
  out.writeUInt32LE(2, 4);
  out.writeUInt32LE(out.length, 8);
  out.writeUInt32LE(js.length, 12);
  out.writeUInt32LE(0x4e4f534a, 16);
  js.copy(out, 20);
  out.writeUInt32LE(bin.length, 20 + js.length);
  out.writeUInt32LE(0x004e4942, 24 + js.length);
  bin.copy(out, 28 + js.length);
  const ab = new Uint8Array(out).buffer;
  const g = await new GLTFLoader().parseAsync(ab, '');
  return { scene: g.scene, animations: g.animations };
}
