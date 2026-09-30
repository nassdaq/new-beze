import { test, expect } from '@playwright/test';

/** Ask flow against the fake provider: prompt → proposal → apply → the NPC exists and talks in Play. */
test('a prompt adds an NPC that the player can talk to', async ({ page }) => {
  await page.goto('/projects');
  await page.getByTestId('new-name').fill('Ask Village');
  await page.getByTestId('new-game').click();
  await expect(page.getByTestId('project-name')).toHaveText('Ask Village');

  await page.getByTestId('ask-prompt').fill('Add an NPC named Mika who greets the player');
  await page.getByTestId('ask-submit').click();
  await expect(page.getByTestId('ask-proposal')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId('ask-proposal')).toContainText('characters: Mika');
  await expect(page.getByTestId('ask-proposal')).toContainText('dialogues: Mika greeting');
  await page.getByTestId('ask-accept').click();

  await expect(page.getByTestId('dialogue-list')).toContainText('Mika greeting');

  // Undo removes the whole proposal in one step; redo restores it.
  await page.keyboard.press('Control+z');
  await expect(page.getByTestId('dialogue-list')).not.toContainText('Mika greeting');
  await page.keyboard.press('Control+Shift+z');
  await expect(page.getByTestId('dialogue-list')).toContainText('Mika greeting');

  // Play: the fake provider puts Mika at tile 12,6; the hero starts at 10,7.
  await page.getByTestId('play').click();
  await expect(page.getByTestId('play-panel')).toHaveAttribute('data-status', 'running', { timeout: 30_000 });
  const game = page.frames().find((f) => f.url().includes('/runtime/index.html'))!;
  await game.waitForFunction(() => !!(window as unknown as { __beze?: unknown }).__beze);
  await page.mouse.click(700, 450);
  await page.keyboard.down('ArrowRight'); await page.waitForTimeout(750); await page.keyboard.up('ArrowRight');
  await page.keyboard.down('ArrowUp'); await page.waitForTimeout(250); await page.keyboard.up('ArrowUp');
  await page.keyboard.down('KeyE'); await page.waitForTimeout(80); await page.keyboard.up('KeyE');
  await expect.poll(() => game.evaluate(() => (window as unknown as { __beze: { game: { scene: { isActive(k: string): boolean } } } }).__beze.game.scene.isActive('dialogue')), { timeout: 5000 }).toBe(true);
});
