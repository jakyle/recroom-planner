// UI-only smoke run of the README runbook (P0 rows 2–7). Works against the dev server or the live site:
//   $env:PW_BASE_URL = "https://jakyle.github.io/recroom-planner/"; npx playwright test e2e/smoke.spec.ts
import { test, expect, type Page } from '@playwright/test';

test.use({ testIdAttribute: 'data-test' });

async function join(page: Page, link: string, name: string) {
  await page.goto(link);
  await page.getByTestId('display-name').fill(name);
  await page.getByTestId('save-name').click();
  await expect(page.getByTestId('my-name')).toHaveText(name);
}

test('runbook: create, join edit/view, members, rotate, fork, promote', async ({ browser }) => {
  const ownerCtx = await browser.newContext();
  const owner = await ownerCtx.newPage();
  owner.on('dialog', (d) => d.accept(d.defaultValue() || undefined));

  // 2. create
  await owner.goto('./');
  await owner.getByTestId('project-name').fill('Smoke ' + Date.now());
  await owner.getByTestId('create').click();
  await owner.getByTestId('display-name').fill('Owner');
  await owner.getByTestId('save-name').click();
  await expect(owner.getByTestId('my-access')).toHaveText('owner');
  await owner.waitForURL(/#\/p\/[^/]+\/s\/[^/]+$/);
  const editLink = (await owner.getByTestId('edit-link').getAttribute('data-url'))!;
  const viewLink = (await owner.getByTestId('view-link').getAttribute('data-url'))!;

  // 3. editor joins
  const editorCtx = await browser.newContext();
  const editor = await editorCtx.newPage();
  await join(editor, editLink, 'Editor');
  await expect(editor.getByTestId('my-access')).toHaveText('edit');
  await expect(editor.getByTestId('share-panel')).toHaveCount(0);

  // 4. viewer joins; setup page green
  const viewerCtx = await browser.newContext();
  const viewer = await viewerCtx.newPage();
  await join(viewer, viewLink, 'Viewer');
  await expect(viewer.getByTestId('my-access')).toHaveText('view');
  await expect(viewer.getByTestId('fork')).toHaveCount(0);
  await viewer.goto('./#/setup');
  await expect(viewer.getByTestId('check').nth(0)).toHaveAttribute('data-status', 'ok');
  await expect(viewer.getByTestId('check').nth(1)).toHaveAttribute('data-status', 'ok');
  await expect(viewer.getByTestId('check').nth(2)).toHaveAttribute('data-status', 'ok');
  await expect(viewer.getByTestId('check').nth(3)).toHaveAttribute('data-status', 'ok', { timeout: 40_000 });

  // 5. members panel: three rows; demote editor to view and back; remove viewer
  await owner.reload();
  const rows = owner.getByTestId('member-row');
  await expect(rows).toHaveCount(3);
  const editorRow = rows.filter({ hasText: 'Editor' });
  await editorRow.locator('select').selectOption('view');
  await expect(editorRow.locator('select')).toHaveValue('view');
  await editorRow.locator('select').selectOption('edit');
  await expect(editorRow.locator('select')).toHaveValue('edit');
  await rows.filter({ hasText: 'Viewer' }).getByRole('button', { name: 'Remove' }).click();
  await expect(rows).toHaveCount(2);
  await viewer.goto('./');
  await viewer.goto(owner.url());
  await expect(viewer.getByTestId('error')).toContainText('not on this plan');

  // 6. rotate edit link; old link invalid
  await owner.getByTestId('rotate-edit').click();
  await expect.poll(async () => owner.getByTestId('edit-link').getAttribute('data-url')).not.toBe(editLink);
  const lateCtx = await browser.newContext();
  const late = await lateCtx.newPage();
  await late.goto(editLink);
  await expect(late.getByTestId('join-error')).toContainText('invalid link');

  // 7. fork + promote
  await owner.getByTestId('fork').click();
  await owner.waitForURL(/#\/p\/[^/]+\/s\/[^/]+$/);
  await expect(owner.getByTestId('scenario-link')).toHaveCount(2);
  const forked = owner.getByTestId('scenario-link').filter({ hasText: 'Copy of Base' });
  await expect(forked).toHaveCount(1);
  await owner.getByRole('button', { name: 'Make primary' }).click();
  await expect(forked.locator('xpath=..')).toContainText('★ primary');
});
