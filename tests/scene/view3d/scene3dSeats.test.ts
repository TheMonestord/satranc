import { describe, expect, test } from 'vitest';
import { Scene3D } from '../../../src/scene/view3d/scene3d';
import { createCharacter } from '../../../src/scene/view3d/characters';
import { ThemeRegistry } from '../../../src/themes/registry';

async function scene(): Promise<Scene3D> {
  const registry = await ThemeRegistry.load('yok/', (async () => ({ ok: false }) as Response) as typeof fetch);
  return new Scene3D(registry.resolve({ ortam: 'klasik-oda', masa: 'ahsap', taslar: 'klasik', eller: 'sade' }), 'low');
}

describe('Scene3D oturma düzeni', () => {
  test('rakip oyuncunun rengine göre karşıya oturur; masa başında çevirme oyuncuyu kaldırmaz', async () => {
    const s = await scene();
    const opp = createCharacter('deneyci');
    s.setPlayerColor('w');
    s.setCharacters(opp, null);
    expect(opp.root.position.z).toBeLessThan(0);
    s.setFlipped(true);
    expect((s as unknown as { flipped: boolean }).flipped).toBe(false);
    expect(opp.root.position.z).toBeLessThan(0);

    s.setPlayerColor('b');
    expect(opp.root.position.z).toBeGreaterThan(0);
    s.dispose();
  });

  test('kuşbakışında çevirme serbesttir, rakip yerinde kalır', async () => {
    const s = await scene();
    const opp = createCharacter('deneyci');
    s.setCameraMode('kus');
    s.setPlayerColor('w');
    s.setCharacters(opp, null);
    s.setFlipped(true);
    expect((s as unknown as { flipped: boolean }).flipped).toBe(true);
    expect(opp.root.position.z).toBeLessThan(0);
    s.dispose();
  });
});
