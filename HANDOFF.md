# HANDOFF — Rec Room Planner (live cursor)

Read this first, then `.claude/napkin.md`, then ONLY the spec section named under **Next action**. Do not read all of `SPEC.md`.

## State

- **Next action:** implement **SPEC §8 (2.5D and elevations) + §9 (walls, openings, rooms) — Phase P3**. Plan first (`docs/plans/2026-09-12-p3-walls-plan.md`, writing-plans), then execute inline. Start by reading SPEC §8 and §9 in full, then `src/lib/geom/walls.ts` (outline/opening/swing geometry), `src/lib/canvas/Plan.svelte` (walls + openings render, pointer pipeline) and `src/lib/canvas/tools/select.ts` (tool pattern; a wall tool follows it). Walls/openings already sync in realtime (they are in `PG_TABLES` and the store's `inScope`), so new wall edits only need to go through `store.commit`.
- **Phase gate (R22.1) still open:** the user has been asked three times (last: 2026-09-12, P2 session) whether to run the code-reviewer over P0+P1; no answer. P2 has not been code-reviewed either. Ask once, plain text, then proceed.
- **Done:** P0 (auth by link, RLS, RPCs, Pages deploy), P1 (plan canvas), **P2 Realtime** (this session): one private channel per project carrying broadcast (cursors 15 Hz, drags 20 Hz with the cursor folded in, selections, `committed`/`deleted`), presence (`{user_id,name,color,scenario_id,viewport}`) and `postgres_changes` on the seven scenario tables; LWW per row; refetch+diff on rejoin and after >30 s hidden; retry ×3 with backoff then toast + orange dot; "Undid over <name>'s newer change"; online avatar rings + click-to-jump; peer selections with name tags; activity feed (last 200); "offline collaboration" strip label; realtime-budget chip at 50 % of 2M/month. Unit 60 green; `e2e/realtime.spec.ts` (two contexts) green locally; CHECKLIST states in `CHECKLIST.md` §15.
- **Location:** `C:/Users/jjack/dev/recroom-planner/`, branch `main`, remote public. Everything committed; see `git log` for the P2 commits.
- **Supabase:** migrations 0001–**0008** applied to dev (`twpeiaygomaobvshqfvp`, CLI linked). **0008 (`supabase_realtime` publication) is applied to prod only if the user ran the block in the P2 session summary** — check with the SQL below before trusting live realtime. Passwords in `C:/Users/jjack/dev/recroom-planner.secrets.local.txt` (outside the repo). The agent cannot run `supabase link -p …` (auto-mode classifier blocks any command that reads the secrets file, even via a script) — prod pushes are a **user step**; hand them a PowerShell block.
  ```sql
  select tablename from pg_publication_tables where pubname = 'supabase_realtime' order by 1;
  -- expect: layers, object_groups, objects, openings, scenario_wall_states, slabs, walls
  ```
- **Not yet configured:** Google OAuth provider (R2.4/R3.8 stay `[coded]`).
- **Open user report:** "why are windows opening like doors?" — not reproduced; ask for the label (W1–W14) or a screenshot before touching opening symbols in `Plan.svelte`.
- **Plans:** `docs/plans/2026-09-12-p0-foundation-plan.md`, `…-p1-canvas-plan.md`, `…-p2-realtime-plan.md` (all executed).

## Distilled context (already read the sources; this is what bites)

- Platform locked: GitHub Pages + Supabase free tier; Svelte 5 + Vite + SVG canvas (SPEC §2). Sharing by view/edit link; RLS is membership-based (§3, §19.3).
- **Realtime shape (P2):** `CollabSession` in `src/lib/realtime/collab.svelte.ts` owns the channel (always via `projectChannel(projectId, presenceKey)` in `src/lib/supabase/realtime.ts` — it calls `setAuth` first; a raw `supabase.channel` fails with CHANNEL_ERROR). Ephemeral sends go through `Outbox` (`src/lib/realtime/outbox.ts`); throttles in R15.4 are requirements. Presence key = user id so two tabs merge. Messages carry `s` = scenario id and receivers drop other scenarios (R15.3).
- **Store hooks:** `store.onWritten(op, stored)` → `collab.announce` (broadcast `committed`/`deleted`); `store.applyRemote(table,row)` (LWW by `version`, defers while a write for that id is in flight, never touches undo); `store.removeRemote`; `store.refresh()` (diff, keeps unsynced/in-flight ids); `store.notices` + `notify/dismiss` render in `src/lib/ui/Toast.svelte`; `store.revision` bumps on every own write/remote apply (the activity panel refetches on it). `store.userId`/`store.nameOf` are set by `Project.svelte`.
- **Peer drags** render through `ui.remotePreview` merged under `ui.preview` in `mergedBox(o, preview, remote)` (`src/lib/canvas/scene.ts`); only the object `<g>` and peer selections use the remote map — handles/hit-tests stay local.
- **Project.svelte:** the auth `Session` variable is `session`; the realtime session is `collab`. Members are refetched when presence shows a user/name the list doesn't know (`peerKey` effect).
- **Budget:** `MessageBudget` (`src/lib/realtime/budget.ts`) counts sent+received per project in localStorage and projects the UTC month; chip appears at ≥50 % of 2M (`data-test="rt-budget"`).
- Canvas architecture, world +y up (`matrix(s 0 0 -s tx ty)`), text needs `scale(1,-1)`; smart-guide reach 120"; `props` patched via `mergeProps`; editors change project settings only through `set_project_setting` RPC — unchanged from P1.
- A user hook blocks `// ---- section ----` divider comments; Bash heredocs break on large files (use Write); Playwright `goto('./')`; never commit keys (`git diff --cached | grep -c "eyJ\|sb_\|supabase\.co"` must be 0).
- User style: ≤3 sentences per reply, one question per turn, never `AskUserQuestion`, no time estimates, PowerShell for anything they re-run, full scope, `[verified]` only after the live run.

## Read-on-demand (action → source, mandatory)

- If you add a table that must sync live → add it to migration `0009_…` (`alter publication supabase_realtime add table …`), to `PG_TABLES` in `src/lib/realtime/protocol.ts`, and to `inScope`/`table()` in `src/lib/model/store.svelte.ts`.
- If you add a migration → `npx supabase db push --yes` (dev) works; prod = user step (see State). Then `npm run db:types` if the schema changed.
- If you draw walls (P3) → read SPEC §9.1–§9.4, `src/lib/geom/walls.ts`, `SelectTool` in `src/lib/canvas/tools/select.ts` (mode machine + `ui.preview` + commit on pointer-up), and `Plan.svelte` wall/opening render blocks first. Broadcast of in-flight wall drawing (R15.1) = put the preview in a `ui.preview`-like map and send it through `collab.sendPreview` (extend `DragMsg.p` if the shape differs).
- If you touch elevations/2.5D (§8) → read SPEC §8 whole and R4.33; every new row needs `version/updated_at/updated_by` and the `set_version_fields` trigger (`0003_triggers.sql`).
- If you change the commit pipeline → read `commit`, `absorb`, `applyRemote`, `refresh` in `store.svelte.ts` and the six P2 tests in `tests/store.test.ts` first.
- If you add an e2e → copy helpers from `e2e/realtime.spec.ts` (two contexts, `online()`, `toPage`, `drag`, `placeObject`); `workers: 1`, earlier tests' pages stay open so error-context snapshots can show the wrong page.

## Verify

- `npm run check` 0 errors; `npm test` (60); `npx playwright test` (4 specs). Live: `$env:PW_BASE_URL='https://jakyle.github.io/recroom-planner/'; npx playwright test e2e/smoke.spec.ts e2e/canvas.spec.ts e2e/realtime.spec.ts`.
- `[verified]` for any line = the README runbook step ran on the deployed app.
