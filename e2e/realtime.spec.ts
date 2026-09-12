// Two browser contexts on one edit link (SPEC §15). Runs against the dev server or the live site:
//   $env:PW_BASE_URL = "https://jakyle.github.io/recroom-planner/"; npx playwright test e2e/realtime.spec.ts
import { test, expect, type Page } from '@playwright/test';

test.use({ testIdAttribute: 'data-test' });

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

async function online(page: Page) {
  await expect(page.getByTestId('status-live')).toHaveText('online', { timeout: 30_000 });
}

test('cursors, live drag, committed position, LWW, reconnect refetch, presence, activity', async ({ browser }) => {
  const ctxA = await browser.newContext();
  const a = await ctxA.newPage();
  await a.goto('./');
  await a.getByTestId('project-name').fill('RT ' + Date.now());
  await a.getByTestId('template').selectOption('pool_room');
  await a.getByTestId('create').click();
  await a.getByTestId('display-name').fill('Ann');
  await a.getByTestId('save-name').click();
  await expect(a.getByTestId('my-name')).toHaveText('Ann');
  await a.waitForURL(/#\/p\/[^/]+\/s\/[^/]+$/);
  await expect(a.getByTestId('wall')).toHaveCount(11);
  await a.getByTestId('tab-project').click();
  const editLink = (await a.getByTestId('edit-link').getAttribute('data-url'))!;
  await a.getByTestId('tab-plan').click();
  await online(a);

  const ctxB = await browser.newContext();
  const b = await ctxB.newPage();
  await b.goto(editLink);
  await b.getByTestId('display-name').fill('Bob');
  await b.getByTestId('save-name').click();
  await expect(b.getByTestId('my-name')).toHaveText('Bob');
  await expect(b.getByTestId('wall')).toHaveCount(11);
  await online(b);

  // Presence: both see two online avatars (R15.13).
  await expect(a.locator('[data-test=avatar][data-online=true]')).toHaveCount(2, { timeout: 15_000 });
  await expect(b.locator('[data-test=avatar][data-online=true]')).toHaveCount(2, { timeout: 15_000 });

  // Cursor badge: Bob moves over the plan, Ann sees a cursor named Bob (R15.1, R15.3).
  const bp = await toPage(b, 100, 300);
  await b.mouse.move(bp[0], bp[1]);
  await b.mouse.move(bp[0] + 20, bp[1] + 10);
  await expect(a.getByTestId('peer-cursor')).toContainText('Bob', { timeout: 10_000 });

  // Ann adds a rack; Bob receives the committed row (R15.7).
  await placeObject(a, 'Rack', [60, 300], [48, 48]);
  await expect(objectByName(b, 'Rack')).toHaveAttribute('data-x', '60', { timeout: 10_000 });

  // Ann's in-flight drag previews live in Bob's tab before pointer-up (R15.1), then commits (R15.2, R15.7).
  const c1 = await toPage(a, 84, 324);
  const mid = await toPage(a, 84 + 36, 324);
  const end = await toPage(a, 84 + 60, 324);
  await a.mouse.move(c1[0], c1[1]);
  await a.mouse.down();
  for (let i = 1; i <= 6; i++) await a.mouse.move(c1[0] + ((mid[0] - c1[0]) * i) / 6, c1[1]);
  await expect(objectByName(a, 'Rack')).toHaveAttribute('data-x', '96');
  await expect(objectByName(b, 'Rack')).toHaveAttribute('data-x', '96', { timeout: 10_000 });
  for (let i = 1; i <= 4; i++) await a.mouse.move(mid[0] + ((end[0] - mid[0]) * i) / 4, c1[1]);
  await a.mouse.up();
  await expect(objectByName(b, 'Rack')).toHaveAttribute('data-x', '120', { timeout: 10_000 });
  await expect(a.getByTestId('status-unsynced')).toHaveCount(0);

  // Bob's selection shows in Ann's tab with his name (R15.13).
  await objectByName(b, 'Rack').click();
  await expect(a.getByTestId('peer-selection')).toHaveCount(1, { timeout: 10_000 });
  await a.screenshot({ path: 'test-results/realtime-peers.png' });

  // LWW (R15.9): both set x at the same time; both converge on one of the two values.
  await objectByName(a, 'Rack').click();
  await Promise.all([
    (async () => {
      await a.getByTestId('insp-x').fill(`20'`);
      await a.getByTestId('insp-x').press('Enter');
    })(),
    (async () => {
      await b.getByTestId('insp-x').fill(`21'`);
      await b.getByTestId('insp-x').press('Enter');
    })(),
  ]);
  await expect
    .poll(
      async () => {
        const [xa, xb] = await Promise.all([objectByName(a, 'Rack').getAttribute('data-x'), objectByName(b, 'Rack').getAttribute('data-x')]);
        return xa === xb ? xa : `${xa}≠${xb}`;
      },
      { timeout: 15_000 },
    )
    .toMatch(/^(240|252)$/);

  // Reconnect refetch (R15.5, R15.8): Bob goes offline, Ann moves the rack, Bob comes back and refetches.
  await ctxB.setOffline(true);
  await expect(b.getByTestId('status-live')).toHaveText('offline collaboration', { timeout: 40_000 });
  await a.keyboard.press('Escape');
  await objectByName(a, 'Rack').click();
  await a.getByTestId('insp-x').fill(`30'`);
  await a.getByTestId('insp-x').press('Enter');
  await expect(objectByName(a, 'Rack')).toHaveAttribute('data-x', '360');
  await ctxB.setOffline(false);
  await expect(objectByName(b, 'Rack')).toHaveAttribute('data-x', '360', { timeout: 60_000 });
  await online(b);

  // Activity feed lists the rack with Ann's name (R15.14).
  await a.getByTestId('tab-project').click();
  await expect(a.getByTestId('activity-row').first()).toContainText('Rack', { timeout: 10_000 });
  await expect(a.getByTestId('activity-panel')).toContainText('Ann');

  // Closing Bob's tab drops his avatar.
  await b.close();
  await ctxB.close();
  await expect(a.locator('[data-test=avatar][data-online=true]')).toHaveCount(1, { timeout: 20_000 });
});
