import { test, expect, type Frame, type Page } from '@playwright/test';

/**
 * Webslinger template acceptance: create a game from the template card (its art pack loads) → Play → the HUD shows
 * the starting money → X facing the apartment wall zips Spidey up onto the building (collision value 2 lets him
 * stand on the facade) → walking north keeps him on the roof → a thug webbed by X is frozen (stunnedUntil set).
 */
test('create Webslinger from the template, zip onto a wall and web a thug', async ({ page }) => {
  await page.goto('/projects');
  await expect(page.getByTestId('template-cards')).toBeVisible();
  await page.getByTestId('template-webslinger').click();
  await expect(page.getByTestId('project-name')).toHaveText('Webslinger', { timeout: 30_000 });

  await page.getByTestId('play').click();
  await expect(page.getByTestId('play-panel')).toHaveAttribute('data-status', 'running', { timeout: 30_000 });
  const game = page.frames().find((f) => f.url().includes('/runtime/index.html'))!;
  await game.waitForFunction(() => !!(window as unknown as { __beze?: unknown }).__beze);
  await expect(page.frameLocator('iframe[title="Game preview"]').locator('canvas')).toBeVisible();
  await page.mouse.click(700, 450);
  await expect.poll(() => game.evaluate(() => (window as unknown as { __beze: Beze }).__beze.state.variables['var_money'])).toBe(20);

  // Spidey starts on the sidewalk below his block, facing right. Face up (a tap, so he barely moves) and shoot: the
  // web grabs the facade two tiles up and zips him onto it.
  const before = await playerCenter(game);
  expect(before).not.toBeNull();
  await tap(page, 'ArrowUp');
  await page.waitForTimeout(100);
  await tap(page, 'KeyX');
  await page.waitForTimeout(900);
  const onWall = await playerCenter(game);
  expect(before!.y - onWall!.y).toBeGreaterThan(40);
  expect(await cellUnderPlayer(game)).toBe(2);

  // Climbing: holding up walks him over the facade and the ledge onto the roof (a walkable cell inside the ring).
  // Polled rather than timed, so a slow test machine (software GL, capped frame rate) does not fail it.
  await page.keyboard.down('ArrowUp');
  await expect.poll(async () => (await cellUnderPlayer(game)) === 0 && (await playerCenter(game))!.y < onWall!.y - 96, { timeout: 25_000 }).toBe(true);
  await page.keyboard.up('ArrowUp');
  await expect.poll(() => game.evaluate(() => (window as unknown as { __beze: Beze }).__beze.state.variables['var_discovered_roof']), { timeout: 5_000 }).toBe(true);

  // Webbing: move a thug in front of Spidey and fire. The web stuns it.
  await game.evaluate(() => {
    const world = (window as unknown as { __beze: Beze }).__beze.game.scene.getScene('world') as unknown as { entities: Array<{ entity: { id: string }; sprite: { x: number; y: number; body: { center: { x: number; y: number } } } | null; isPlayer: boolean; facing: string; stunnedUntil: number }> };
    const player = world.entities.find((e) => e.isPlayer)!;
    const thug = world.entities.find((e) => e.entity.id === 'ent_downtown_thug_alley')!;
    thug.sprite!.x = player.sprite!.x;
    thug.sprite!.y = player.sprite!.y - 64;
  });
  await page.waitForTimeout(150);
  await page.mouse.click(700, 450); // keep the keyboard focus on the game frame
  await tap(page, 'KeyX');
  await expect.poll(() => game.evaluate(() => {
    const world = (window as unknown as { __beze: Beze }).__beze.game.scene.getScene('world') as unknown as { entities: Array<{ entity: { id: string }; stunnedUntil: number }> };
    return world.entities.find((e) => e.entity.id === 'ent_downtown_thug_alley')!.stunnedUntil > 0;
  }), { timeout: 3_000 }).toBe(true);

  await page.keyboard.press('Escape');
  await expect(page.getByTestId('play-panel')).toHaveCount(0);
});

type Beze = {
  state: { variables: Record<string, unknown> };
  project: { maps: Record<string, { width: number; tileWidth: number; collision: number[] }> };
  game: { scene: { getScene(key: string): unknown; isActive(key: string): boolean } };
};

function playerCenter(game: Frame): Promise<{ x: number; y: number } | null> {
  return game.evaluate(() => ((window as unknown as { __beze: Beze }).__beze.game.scene.getScene('world') as unknown as { playerCenter(): { x: number; y: number } | null }).playerCenter());
}

/** The collision value of the downtown cell under the player's body centre. */
function cellUnderPlayer(game: Frame): Promise<number | null> {
  return game.evaluate(() => {
    const beze = (window as unknown as { __beze: Beze }).__beze;
    const c = (beze.game.scene.getScene('world') as unknown as { playerCenter(): { x: number; y: number } | null }).playerCenter();
    const map = beze.project.maps['map_downtown']!;
    if (!c) return null;
    return map.collision[Math.floor(c.y / map.tileWidth) * map.width + Math.floor(c.x / map.tileWidth)] ?? null;
  });
}

async function tap(page: Page, key: string) {
  await page.keyboard.down(key);
  await page.waitForTimeout(60);
  await page.keyboard.up(key);
}
