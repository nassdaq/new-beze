import { test, expect, type Page, type Frame } from '@playwright/test';

/**
 * Vertical slice acceptance: new project → place NPC → give it a dialogue with a choice →
 * Play → walk to the NPC → talk → pick the option → the variable changes.
 */
test('create a game, place an NPC, talk to it in Play', async ({ page }) => {
  await page.goto('/projects');
  await page.getByTestId('new-name').fill('E2E Village');
  await page.getByTestId('new-game').click();
  await expect(page.getByTestId('project-name')).toHaveText('E2E Village');

  // Place a villager two tiles above the hero (hero starts at tile 10,7 of a 20x15 map).
  await page.getByTestId('tool-placeEntity').click();
  await page.getByTestId('place-chr_villager').click();
  await clickTile(page, 10, 5);
  await expect(page.getByTestId('entity-name')).toHaveValue('Villager 2');
  await page.getByTestId('entity-name').fill('Aiko');

  // Give Aiko a dialogue: one line plus a choice whose first option sets a variable.
  await page.getByTestId('new-dialogue').click();
  await expect(page.getByTestId('dialogue-editor')).toBeVisible();
  await page.getByTestId('line-text').first().fill('Hi, I am Aiko. Do you like frogs?');
  // Need a variable before "+ Set variable" is enabled.
  await page.locator('.panel-left').getByTitle('Add variable').click();
  await page.locator('.panel-left').getByRole('button', { name: /Aiko talk/ }).click();
  await page.getByTestId('add-set').click();
  await page.getByTestId('add-choice').click();
  // Wire: line → choice; option 1 → set; set → end (append put set after the line, then choice after set).
  const setNode = page.getByTestId('node-set');
  const choiceNode = page.getByTestId('node-choice');
  await expect(setNode).toBeVisible();
  await expect(choiceNode).toBeVisible();
  const setId = await optionValueByLabel(page, page.getByTestId('node-line').locator('select').first(), 'set variable');
  const choiceId = await optionValueByLabel(page, page.getByTestId('node-line').locator('select').first(), 'choice (2)');
  await page.getByTestId('node-line').locator('select').first().selectOption(choiceId);
  await choiceNode.getByTestId('option-text').first().fill('Yes!');
  await choiceNode.getByTestId('option-next').first().selectOption(setId);
  const endId = await optionValueByLabel(page, setNode.locator('select').last(), 'end');
  await setNode.locator('select').last().selectOption(endId);

  // Play.
  await page.getByTestId('play').click();
  const panel = page.getByTestId('play-panel');
  await expect(panel).toHaveAttribute('data-status', 'running', { timeout: 30_000 });
  const frame = page.frameLocator('iframe[title="Game preview"]');
  await expect(frame.locator('canvas')).toBeVisible();
  const game = page.frames().find((f) => f.url().includes('/runtime/index.html'))!;
  await game.waitForFunction(() => !!(window as unknown as { __beze?: unknown }).__beze);
  await page.mouse.click(700, 450);

  const state = () => game.evaluate(() => (window as unknown as { __beze: { state: { variables: Record<string, unknown> } } }).__beze.state.variables);
  expect(Object.values(await state())).toEqual([false]);

  // Walk up to Aiko (two tiles), then talk: line → choice → "Yes!" → set → end.
  await hold(game, page, 'ArrowUp', 900);
  await tap(page, 'KeyE');
  await page.waitForTimeout(200);
  await tap(page, 'KeyE');
  await page.waitForTimeout(200);
  await tap(page, 'KeyE');
  await page.waitForTimeout(300);
  await expect.poll(async () => Object.values(await state())[0], { timeout: 5000 }).toBe(true);

  await page.keyboard.press('Escape');
  await expect(page.getByTestId('play-panel')).toHaveCount(0);

  // Reload restores the project from IndexedDB.
  await page.reload();
  await expect(page.getByTestId('project-name')).toHaveText('E2E Village');
  await page.getByTestId('tool-select').click();
});

async function clickTile(page: Page, tx: number, ty: number) {
  // Map is 20x15 tiles centred in the canvas at an integer zoom; read the camera by probing the status line.
  const canvas = page.getByTestId('viewport');
  const box = (await canvas.boundingBox())!;
  // Move across the canvas until the status shows the target tile; the camera fits the map so a linear search is fine.
  const target = `tile ${tx}, ${ty}`;
  for (let y = 10; y < box.height; y += 12) {
    for (let x = 10; x < box.width; x += 12) {
      await page.mouse.move(box.x + x, box.y + y);
      const text = await page.locator('.viewport-status').textContent();
      if (text?.startsWith(target)) {
        await page.mouse.click(box.x + x, box.y + y);
        return;
      }
    }
  }
  throw new Error(`tile ${tx},${ty} not visible`);
}

async function optionValueByLabel(_page: Page, select: ReturnType<Page['locator']>, label: string): Promise<string> {
  return select.evaluate((el, l) => {
    const opt = Array.from((el as HTMLSelectElement).options).find((o) => o.textContent === l);
    if (!opt) throw new Error(`no option "${l}"`);
    return opt.value;
  }, label);
}

async function hold(_frame: Frame, page: Page, key: string, ms: number) {
  await page.keyboard.down(key);
  await page.waitForTimeout(ms);
  await page.keyboard.up(key);
}

async function tap(page: Page, key: string) {
  await page.keyboard.down(key);
  await page.waitForTimeout(60);
  await page.keyboard.up(key);
}
