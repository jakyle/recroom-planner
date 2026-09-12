import { test, expect, type Page } from '@playwright/test';

test.use({ testIdAttribute: 'data-test' });

async function createPoolRoom(page: Page) {
  await page.goto('./');
  await page.getByTestId('project-name').fill('Canvas ' + Date.now());
  await page.getByTestId('template').selectOption('pool_room');
  await page.getByTestId('create').click();
  await page.getByTestId('display-name').fill('Tester');
  await page.getByTestId('save-name').click();
  await expect(page.getByTestId('my-name')).toHaveText('Tester');
  await page.waitForURL(/#\/p\/[^/]+\/s\/[^/]+$/);
  await expect(page.getByTestId('wall')).toHaveCount(11);
}

/** World (inches) → page coordinates, using the live SVG transform. */
async function toPage(page: Page, wx: number, wy: number): Promise<[number, number]> {
  return page.evaluate(
    ([x, y]) => {
      const svg = document.querySelector('[data-test=plan]') as SVGSVGElement;
      const g = svg.querySelector('g') as SVGGElement;
      const m = g.getAttribute('transform')!.match(/matrix\(([^)]+)\)/)![1].split(' ').map(Number);
      const r = svg.getBoundingClientRect();
      return [r.left + m[4] + x * m[0], r.top + m[5] + y * m[3]];
    },
    [wx, wy],
  );
}

async function drag(page: Page, from: [number, number], to: [number, number], steps = 8) {
  await page.mouse.move(from[0], from[1]);
  await page.mouse.down();
  for (let i = 1; i <= steps; i++) await page.mouse.move(from[0] + ((to[0] - from[0]) * i) / steps, from[1] + ((to[1] - from[1]) * i) / steps);
  await page.mouse.up();
}

async function placeObject(page: Page, name: string, at: [number, number], size: [number, number]) {
  await page.keyboard.press('o');
  await expect(page.getByTestId('tool-object')).toHaveAttribute('aria-pressed', 'true');
  const a = await toPage(page, at[0], at[1]);
  const b = await toPage(page, at[0] + size[0], at[1] + size[1]);
  await drag(page, a, b);
  await expect(page.getByTestId('object-dialog')).toBeVisible();
  await page.getByTestId('dlg-name').fill(name);
  await page.getByTestId('dlg-create').click();
  await expect(page.getByTestId('object-dialog')).toHaveCount(0);
}

function objectByName(page: Page, name: string) {
  return page.locator('[data-test=object]').filter({ hasText: name });
}

test('seed renders, objects place/drag/persist, marquee, layers, undo', async ({ page }) => {
  await createPoolRoom(page);
  await expect(page.getByTestId('opening')).toHaveCount(21);
  await expect(page.locator('[data-test=opening][data-kind=window]')).toHaveCount(14);
  await expect(page.locator('[data-test=opening][data-kind=fireplace]')).toHaveCount(1);

  await placeObject(page, 'Rack', [60, 300], [48, 48]);
  const rack = objectByName(page, 'Rack');
  await expect(rack).toHaveCount(1);
  await expect(rack).toHaveAttribute('data-x', '60');
  await expect(rack).toHaveAttribute('data-y', '300');

  // Drag the rack 5' to the right (snap 1'): from its center.
  const c1 = await toPage(page, 84, 324);
  const c2 = await toPage(page, 84 + 60, 324);
  await drag(page, c1, c2);
  await expect(rack).toHaveAttribute('data-x', '120');
  await expect(page.getByTestId('status-unsynced')).toHaveCount(0);

  // Persisted across reload.
  await page.waitForTimeout(500);
  await page.reload();
  await expect(page.getByTestId('wall')).toHaveCount(11);
  await expect(objectByName(page, 'Rack')).toHaveAttribute('data-x', '120');

  // Second object, then marquee both (rightward = intersect) and move the group.
  await placeObject(page, 'Bench', [120, 420], [48, 24]);
  const bench = objectByName(page, 'Bench');
  await expect(bench).toHaveAttribute('data-x', '120');
  await page.keyboard.press('Escape');
  const m1 = await toPage(page, 100, 480);
  const m2 = await toPage(page, 200, 280);
  await drag(page, m1, m2);
  await expect(page.locator('[data-test=inspector] h2')).toHaveText('2 objects');
  const g1 = await toPage(page, 144, 324);
  const g2 = await toPage(page, 144, 324 + 24);
  await drag(page, g1, g2);
  await expect(objectByName(page, 'Rack')).toHaveAttribute('data-y', '324');
  await expect(bench).toHaveAttribute('data-y', '444');

  // Undo restores the group move.
  await page.keyboard.press('Control+z');
  await expect(objectByName(page, 'Rack')).toHaveAttribute('data-y', '300');
  await expect(bench).toHaveAttribute('data-y', '420');

  // Layer eye hides furnishing objects; solo via alt-click restores.
  const eye = page.locator('[data-test=layer-row][data-key=furnishing] [data-test=layer-eye]');
  await eye.click();
  await expect(page.locator('[data-test=object]')).toHaveCount(0);
  await eye.click();
  await expect(page.locator('[data-test=object]')).toHaveCount(2);

  // Inspector edit with feet-inches parsing.
  await objectByName(page, 'Rack').click();
  await page.getByTestId('insp-x').fill(`10'-0"`);
  await page.getByTestId('insp-x').press('Enter');
  await expect(objectByName(page, 'Rack')).toHaveAttribute('data-x', '120');
  await page.getByTestId('insp-w').fill('5\'');
  await page.getByTestId('insp-w').press('Enter');
  await expect(page.getByTestId('insp-w')).toHaveValue(`5'-0"`);

  // Align and distribute (R24.10).
  await placeObject(page, 'Plate tree', [240, 480], [24, 24]);
  await page.keyboard.press('Escape');
  await page.keyboard.press('Control+a');
  await expect(page.locator('[data-test=inspector] h2')).toHaveText('3 objects');
  await page.getByTestId('align-bottom').click();
  await expect
    .poll(async () => new Set(await page.locator('[data-test=object]').evaluateAll((els) => els.map((e) => e.getAttribute('data-y')))).size)
    .toBe(1);
  await page.getByTestId('distribute-x').click();
  await expect
    .poll(async () => page.locator('[data-test=object]').evaluateAll((els) => els.map((e) => Number(e.getAttribute('data-x'))).sort((a, b) => a - b)))
    .toEqual([120, 186, 240]);

  // Trace underlay upload (R24.6): a generated 2x1 PNG scaled to the room width, persisted in project settings.
  const dataUrl = await page.evaluate(() => {
    const c = document.createElement('canvas');
    c.width = 200;
    c.height = 100;
    const g = c.getContext('2d')!;
    g.fillStyle = '#c0392b';
    g.fillRect(0, 0, 200, 100);
    return c.toDataURL('image/png');
  });
  const png = Buffer.from(dataUrl.split(',')[1], 'base64');
  await page.locator('[data-test=underlay-panel] input[type=file]').first().setInputFiles({ name: 'sketch.png', mimeType: 'image/png', buffer: png });
  await expect(page.getByTestId('underlay')).toHaveCount(1);
  await expect(page.getByTestId('underlay')).toHaveAttribute('width', '348');
  await expect(page.getByTestId('underlay')).toHaveAttribute('height', '174');
  await page.getByTestId('underlay-width').fill(`63'`);
  await page.getByTestId('underlay-width').press('Enter');
  await expect(page.getByTestId('underlay')).toHaveAttribute('width', '756');
  await page.reload();
  await expect(page.getByTestId('underlay')).toHaveAttribute('width', '756');
  await page.getByTestId('underlay-visible').click();
  await expect(page.getByTestId('underlay')).toHaveCount(0);

  // Grid + snap toggles reflect in the status strip.
  await page.keyboard.press('g');
  await expect(page.getByTestId('status-grid')).toHaveText('grid off');
  await page.keyboard.press('s');
  await expect(page.getByTestId('status-snap')).toHaveText('snap 1"');
});
