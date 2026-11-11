import { expect, test, type Page } from '@playwright/test';

declare global {
  // eslint-disable-next-line no-var
  var __satranc: { squareToClient(sq: string, height?: number): { x: number; y: number } | null };
}

function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  page.on('pageerror', (e) => errors.push(String(e)));
  return errors;
}

/**
 * 3D tahtada bir kareye tıklar. Taşa tıklarken `height` taşın üst kısmını hedefler:
 * karenin zemindeki merkezi, öndeki uzun bir taşın arkasında kalabilir.
 */
async function click3d(page: Page, sq: string, height = 0): Promise<void> {
  const pos = await page.evaluate(([s, h]) => globalThis.__satranc.squareToClient(s as string, h as number), [sq, height]);
  expect(pos, `3D konum: ${sq}`).not.toBeNull();
  await page.mouse.click(pos!.x, pos!.y);
}

async function click2d(page: Page, sq: string): Promise<void> {
  await page.click(`.board2d [data-square="${sq}"]`);
}

const moves = (page: Page) => page.locator('.moves .move');

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.evaluate(async () => {
    localStorage.clear();
    await new Promise<void>((resolve) => {
      const req = indexedDB.deleteDatabase('satranc');
      req.onsuccess = req.onerror = req.onblocked = () => resolve();
    });
  });
  await page.goto('/');
});

test('iki kişilik oyun: 3D hamle, görünüm değişimi, yenileme sonrası devam', async ({ page }) => {
  const errors = collectErrors(page);
  await expect(page.locator('[data-menu="local"]')).toBeVisible();
  await page.click('[data-menu="local"]');
  await expect(page.locator('canvas')).toBeVisible();

  await click3d(page, 'e2', 0.8);
  await click3d(page, 'e4');
  await expect(moves(page)).toHaveText(['e4']);
  await click3d(page, 'e7', 0.8);
  await click3d(page, 'e5');
  await expect(moves(page)).toHaveText(['e4', 'e5']);

  await page.click('[data-action="view"]');
  await expect(page.locator('.board2d .piece')).toHaveCount(32);
  await expect(page.locator('.board2d [data-square="e4"] .piece')).toHaveCount(1);
  await click2d(page, 'g1');
  await click2d(page, 'f3');
  await expect(moves(page)).toHaveText(['e4', 'e5', 'Nf3']);

  await page.click('[data-action="view"]');
  await expect(page.locator('canvas')).toBeVisible();

  await page.reload();
  await page.click('[data-menu="resume"]');
  await expect(moves(page)).toHaveText(['e4', 'e5', 'Nf3']);
  expect(errors).toEqual([]);
});

test('bilgisayara karşı: rakip 10 saniye içinde cevap verir', async ({ page }) => {
  const errors = collectErrors(page);
  await page.click('[data-menu="ai"]');
  await page.click('[data-level="beginner"]');
  await page.click('[data-color="w"]');
  await page.click('[data-menu="start"]');
  await expect(page.locator('canvas')).toBeVisible();
  await click3d(page, 'd2', 0.8);
  await click3d(page, 'd4');
  await expect(moves(page)).toHaveCount(2, { timeout: 10_000 });
  expect(errors).toEqual([]);
});

test('ayarlar: yeni masa teması kod değişmeden seçilebilir ve kalıcıdır', async ({ page }) => {
  await page.click('[data-menu="local"]');
  await page.click('[data-action="settings"]');
  await page.selectOption('[data-setting="theme.masa"]', 'mermer');
  await page.selectOption('[data-setting="view"]', '2d');
  await page.click('[data-settings="close"]');
  const dark = () => page.locator('.board2d').evaluate((el) => (el as HTMLElement).style.getPropertyValue('--koyu-kare'));
  expect(await dark()).toBe('#769656');
  await click2d(page, 'e2');
  await click2d(page, 'e4');
  await page.reload();
  await page.click('[data-menu="resume"]');
  expect(await dark()).toBe('#769656');
});

test.describe('telefon', () => {
  test.use({ viewport: { width: 360, height: 740 }, hasTouch: true, isMobile: true });

  test('360 px genişlikte tahta sığar ve dokunmayla oynanır', async ({ page }) => {
    await page.click('[data-menu="local"]');
    await expect(page.locator('canvas')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(360);
    const canvas = await page.locator('canvas').boundingBox();
    expect(canvas!.x).toBeGreaterThanOrEqual(0);
    expect(canvas!.x + canvas!.width).toBeLessThanOrEqual(360);

    await page.tap('[data-action="view"]');
    const board = await page.locator('.board2d').boundingBox();
    expect(board!.x).toBeGreaterThanOrEqual(0);
    expect(board!.x + board!.width).toBeLessThanOrEqual(360);
    expect(board!.y + board!.height).toBeLessThanOrEqual(740);
    const sq = await page.locator('.board2d [data-square="e2"]').boundingBox();
    expect(sq!.width).toBeGreaterThanOrEqual(40);

    await page.tap('.board2d [data-square="e2"]');
    await page.tap('.board2d [data-square="e4"]');
    await expect(moves(page)).toHaveText(['e4']);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(360);
  });
});
