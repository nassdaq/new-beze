import { fileURLToPath } from 'node:url';
import { test, expect } from '@playwright/test';

const villagerSheet = fileURLToPath(new URL('../public/starter/villager.png', import.meta.url));

/**
 * Import path: a sprite sheet made outside Beze becomes a character. The starter villager sheet
 * (192×512, Beze v2 layout) stands in for a ChatGPT export; detection must read 48×64 frames in
 * 4 columns × 8 rows, and the imported character must show up wherever characters are listed.
 */
test('import a sprite sheet as a character', async ({ page }) => {
  await page.goto('/projects');
  await page.getByTestId('new-name').fill('E2E Import');
  await page.getByTestId('new-game').click();
  await expect(page.getByTestId('project-name')).toHaveText('E2E Import');

  await page.getByTestId('import-character').click();
  const dialog = page.getByTestId('import-sheet-dialog');
  await expect(dialog).toBeVisible();
  await expect(page.getByTestId('import-confirm')).toBeDisabled();

  await page.getByTestId('import-file').setInputFiles(villagerSheet);
  await expect(page.getByTestId('import-detection')).toContainText('48×64');
  await expect(page.getByTestId('import-detection')).toContainText('4 columns × 8 rows');
  await expect(page.getByTestId('import-frame-width')).toHaveValue('48');
  await expect(page.getByTestId('import-frame-height')).toHaveValue('64');
  await expect(page.getByTestId('import-columns')).toHaveValue('4');
  await expect(page.getByTestId('import-rows')).toHaveValue('8');
  await expect(page.getByTestId('import-preset')).toHaveValue('beze-v2');
  // The starter sheet is already transparent, so background removal stays off.
  await expect(page.getByTestId('import-remove-bg')).not.toBeChecked();

  await page.getByTestId('import-name').fill('Imported');
  await page.getByTestId('import-confirm').click();
  await expect(dialog).toHaveCount(0);

  const list = page.getByTestId('character-list');
  await expect(list).toContainText('Imported');
  // The new character is selected and its sheet decoded (a "?" would mean the asset store has no image).
  await expect(list.locator('li.selected')).toContainText('Imported');
  await expect(list.locator('li.selected canvas')).toHaveCount(1);

  await page.getByTestId('tool-placeEntity').click();
  const card = page.locator('.place-card', { hasText: 'Imported' });
  await expect(card).toHaveCount(1);
  await expect(card).toHaveAttribute('title', /48×64/);
  await expect(card.locator('canvas')).toHaveCount(1);

  // Play loads every project asset through data URLs, uploads included.
  await page.getByTestId('play').click();
  await expect(page.getByTestId('play-panel')).toHaveAttribute('data-status', 'running', { timeout: 30_000 });
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('play-panel')).toHaveCount(0);

  // The upload survives a reload: the asset comes back from IndexedDB and still renders.
  await expect(page.getByTestId('save-state')).toHaveText('Saved', { timeout: 10_000 });
  await page.reload();
  await expect(page.getByTestId('project-name')).toHaveText('E2E Import');
  await expect(page.getByTestId('character-list')).toContainText('Imported');
  await page.getByTestId('tool-placeEntity').click();
  await expect(page.locator('.place-card', { hasText: 'Imported' }).locator('canvas')).toHaveCount(1);
});

test('import a tileset from the Assets chooser', async ({ page }) => {
  await page.goto('/projects');
  await page.getByTestId('new-name').fill('E2E Tiles');
  await page.getByTestId('new-game').click();
  await expect(page.getByTestId('project-name')).toHaveText('E2E Tiles');

  await page.getByTestId('import-asset').click();
  await page.getByTestId('import-asset-tileset').click();
  const dialog = page.getByTestId('import-tileset-dialog');
  await expect(dialog).toBeVisible();
  await page.getByTestId('import-tileset-file').setInputFiles(fileURLToPath(new URL('../public/starter/tileset.png', import.meta.url)));
  await expect(page.getByTestId('import-tileset-detection')).toContainText('32×32');
  await expect(page.getByTestId('import-tile-size')).toHaveValue('32');
  await page.getByTestId('import-tileset-name').fill('Imported tiles');
  await page.getByTestId('import-tileset-confirm').click();
  await expect(dialog).toHaveCount(0);
  await expect(page.locator('.panel-left')).toContainText('Imported tiles tiles');
});
