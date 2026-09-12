import { test, expect, type Page } from '@playwright/test';

type Hooks = {
  renameProject: (id: string, name: string) => Promise<void>;
  renameScenario: (id: string, name: string) => Promise<void>;
  rotateShareLink: (id: string, kind: 'view' | 'edit') => Promise<string>;
};

async function join(page: Page, link: string, name: string) {
  await page.goto(link);
  await page.getByTestId('display-name').fill(name);
  await page.getByTestId('save-name').click();
  await expect(page.getByTestId('my-name')).toHaveText(name);
}

test.use({ testIdAttribute: 'data-test' });

test('owner creates, editor and viewer join, viewer cannot write', async ({ browser }) => {
  const ownerCtx = await browser.newContext();
  const owner = await ownerCtx.newPage();
  await owner.goto('./');
  await owner.getByTestId('project-name').fill('E2E ' + Date.now());
  await owner.getByTestId('create').click();
  await owner.getByTestId('display-name').fill('Owner');
  await owner.getByTestId('save-name').click();
  await expect(owner.getByTestId('my-access')).toHaveText('owner');
  await expect(owner.getByTestId('scenario-link')).toHaveCount(1);
  await owner.waitForURL(/#\/p\/[^/]+\/s\/[^/]+$/);

  const editLink = (await owner.getByTestId('edit-link').getAttribute('data-url'))!;
  const viewLink = (await owner.getByTestId('view-link').getAttribute('data-url'))!;
  const hashParts = new URL(owner.url()).hash.split('/');
  const projectId = hashParts[2];
  const scenarioId = hashParts[4];
  expect(editLink).toContain('#/join/');
  expect(viewLink).toContain('#/join/');
  expect(scenarioId).toBeTruthy();

  const editorCtx = await browser.newContext();
  const editor = await editorCtx.newPage();
  await join(editor, editLink, 'Editor');
  await expect(editor.getByTestId('my-access')).toHaveText('edit');
  await expect(editor.getByTestId('share-panel')).toHaveCount(0);
  await expect(editor.getByTestId('fork')).toHaveCount(1);

  const viewerCtx = await browser.newContext();
  const viewer = await viewerCtx.newPage();
  await join(viewer, viewLink, 'Viewer');
  await expect(viewer.getByTestId('my-access')).toHaveText('view');
  await expect(viewer.getByTestId('fork')).toHaveCount(0);

  // Editor can rename the scenario (edit policy).
  await editor.evaluate(async ([sid]) => {
    await (window as unknown as { __rr: Hooks }).__rr.renameScenario(sid, 'Renamed by editor');
  }, [scenarioId]);

  // Viewer cannot rename the scenario, the project, or rotate links.
  const viewerResults = await viewer.evaluate(
    async ([pid, sid]) => {
      const rr = (window as unknown as { __rr: Hooks }).__rr;
      const out: string[] = [];
      for (const f of [
        () => rr.renameScenario(sid, 'hacked'),
        () => rr.renameProject(pid, 'hacked'),
        () => rr.rotateShareLink(pid, 'edit'),
      ]) {
        try {
          await f();
          out.push('ALLOWED');
        } catch (e) {
          out.push('rejected: ' + (e as Error).message);
        }
      }
      return out;
    },
    [projectId, scenarioId],
  );
  expect(viewerResults.every((s) => s.startsWith('rejected'))).toBe(true);

  // Editor cannot rotate links either (owner only).
  const editorRotate = await editor.evaluate(async ([pid]) => {
    try {
      await (window as unknown as { __rr: Hooks }).__rr.rotateShareLink(pid, 'edit');
      return 'ALLOWED';
    } catch {
      return 'rejected';
    }
  }, [projectId]);
  expect(editorRotate).toBe('rejected');

  // Owner sees three members and the editor's rename.
  await owner.reload();
  await expect(owner.getByTestId('member-row')).toHaveCount(3);
  await expect(owner.getByTestId('scenario-link')).toHaveText('Renamed by editor');

  // Rotation invalidates the old edit link.
  owner.on('dialog', (d) => d.accept());
  await owner.getByTestId('rotate-edit').click();
  await expect
    .poll(async () => owner.getByTestId('edit-link').getAttribute('data-url'))
    .not.toBe(editLink);
  const lateCtx = await browser.newContext();
  const late = await lateCtx.newPage();
  await late.goto(editLink);
  await expect(late.getByTestId('join-error')).toContainText('invalid link');
});
