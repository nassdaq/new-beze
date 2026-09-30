import { test, expect, type Frame, type Page } from '@playwright/test';

/**
 * Hacho template acceptance: create a game from the template card → the editor opens as "Hacho" → Play →
 * the HUD shows the starting money → the player walks → the map and inventory screens open and close on
 * M / I / Escape → a final Escape (with nothing open) leaves Play.
 */
test('create Hacho from the template and play it', async ({ page }) => {
  await page.goto('/projects');
  await expect(page.getByTestId('template-cards')).toBeVisible();
  await page.getByTestId('template-hacho').click();
  await expect(page.getByTestId('project-name')).toHaveText('Hacho', { timeout: 30_000 });

  await page.getByTestId('play').click();
  await expect(page.getByTestId('play-panel')).toHaveAttribute('data-status', 'running', { timeout: 30_000 });
  const game = page.frames().find((f) => f.url().includes('/runtime/index.html'))!;
  await game.waitForFunction(() => !!(window as unknown as { __beze?: unknown }).__beze);
  await expect(page.frameLocator('iframe[title="Game preview"]').locator('canvas')).toBeVisible();
  await page.mouse.click(700, 450);

  // The HUD scene shows the starting money.
  await expect.poll(() => hudTexts(game), { timeout: 10_000 }).toContain('TSh 50,000');
  await expect.poll(() => game.evaluate(() => (window as unknown as { __beze: Beze }).__beze.state.variables['var_money'])).toBe(50000);

  // Walk right for two seconds: the player moves along the sidewalk.
  const before = await playerCenter(game);
  expect(before).not.toBeNull();
  await page.keyboard.down('ArrowRight');
  await page.waitForTimeout(2000);
  await page.keyboard.up('ArrowRight');
  const after = await playerCenter(game);
  expect(after!.x - before!.x).toBeGreaterThan(64);
  expect(Math.abs(after!.y - before!.y)).toBeLessThan(4);

  // M opens the map; Escape closes it and does not leave Play.
  await tap(page, 'KeyM');
  await expect.poll(() => sceneActive(game, 'map')).toBe(true);
  await expect.poll(() => activeOverlay(game)).toBe('map');
  await page.waitForTimeout(200);
  await tap(page, 'Escape');
  await expect.poll(() => sceneActive(game, 'map')).toBe(false);
  await expect(page.getByTestId('play-panel')).toHaveAttribute('data-status', 'running');

  // I opens the inventory; Escape closes it.
  await tap(page, 'KeyI');
  await expect.poll(() => sceneActive(game, 'inventory')).toBe(true);
  await page.waitForTimeout(200);
  await tap(page, 'Escape');
  await expect.poll(() => sceneActive(game, 'inventory')).toBe(false);
  await expect(page.getByTestId('play-panel')).toHaveAttribute('data-status', 'running');
  await expect.poll(() => activeOverlay(game)).toBeNull();

  // Escape with nothing open leaves Play.
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('play-panel')).toHaveCount(0);
  await expect(page.getByTestId('project-name')).toHaveText('Hacho');
});

type Beze = {
  state: { variables: Record<string, unknown> };
  game: { scene: { getScene(key: string): unknown; isActive(key: string): boolean } };
};

/** Every text object in the HUD scene, containers included. */
function hudTexts(game: Frame): Promise<string[]> {
  return game.evaluate(() => {
    const scene = (window as unknown as { __beze: Beze }).__beze.game.scene.getScene('hud') as unknown as { children: { list: unknown[] } };
    const out: string[] = [];
    const walk = (objs: unknown[]) => {
      for (const o of objs) {
        const obj = o as { type?: string; text?: string; list?: unknown[] };
        if (obj.type === 'Text' && typeof obj.text === 'string') out.push(obj.text);
        if (Array.isArray(obj.list)) walk(obj.list);
      }
    };
    walk(scene.children.list);
    return out;
  });
}

function playerCenter(game: Frame): Promise<{ x: number; y: number } | null> {
  return game.evaluate(() => ((window as unknown as { __beze: Beze }).__beze.game.scene.getScene('world') as unknown as { playerCenter(): { x: number; y: number } | null }).playerCenter());
}

function sceneActive(game: Frame, key: string): Promise<boolean> {
  return game.evaluate((k) => (window as unknown as { __beze: Beze }).__beze.game.scene.isActive(k), key);
}

function activeOverlay(game: Frame): Promise<string | null> {
  return game.evaluate(() => ((window as unknown as { __beze: Beze }).__beze.game.scene.getScene('world') as unknown as { activeOverlay: string | null }).activeOverlay);
}

async function tap(page: Page, key: string) {
  await page.keyboard.down(key);
  await page.waitForTimeout(60);
  await page.keyboard.up(key);
}
