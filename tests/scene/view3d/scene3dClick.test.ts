import { describe, expect, test, vi } from 'vitest';
import type { MoveAnimator } from '../../../src/scene/animators/types';
import { Scene3D } from '../../../src/scene/view3d/scene3d';
import { ThemeRegistry } from '../../../src/themes/registry';

describe('Scene3D tıklama', () => {
  test('tahtaya tıklamak süren canlandırmayı kare seçilmeden önce tamamlar', async () => {
    const registry = await ThemeRegistry.load('yok/', (async () => ({ ok: false }) as Response) as typeof fetch);
    const themes = registry.resolve({ ortam: 'klasik-oda', masa: 'ahsap', taslar: 'klasik', eller: 'sade' });
    const scene = new Scene3D(themes, 'low');
    const animator: MoveAnimator = { play: vi.fn(async () => {}), finishNow: vi.fn(), dispose: vi.fn() };
    scene.setAnimator(animator);

    const handlers = scene as unknown as {
      onPointerDown(e: { clientX: number; clientY: number }): void;
      onPointerUp(e: { clientX: number; clientY: number }): void;
    };
    handlers.onPointerDown({ clientX: 100, clientY: 100 });
    handlers.onPointerUp({ clientX: 101, clientY: 100 });
    expect(animator.finishNow).toHaveBeenCalledTimes(1);

    // Sürükleme (kamera döndürme) canlandırmayı kesmez.
    handlers.onPointerDown({ clientX: 100, clientY: 100 });
    handlers.onPointerUp({ clientX: 200, clientY: 100 });
    expect(animator.finishNow).toHaveBeenCalledTimes(1);
  });
});
