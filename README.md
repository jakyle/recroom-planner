# Rec Room Planner

Collaborative 2.5D floor planner for the 63'×29' rec room / home gym conversion. Spec: `SPEC.md`. Progress: `CHECKLIST.md`. Cursor: `HANDOFF.md`.

Live: https://jakyle.github.io/recroom-planner/

## Setup (done once; recorded here so it can be redone)

1. Supabase projects `recroom` (prod, ref `rgtegkswqrafdhfifnvt`) and `recroom-dev` (dev/e2e, ref `twpeiaygomaobvshqfvp`) in org `software-boy`. Database passwords live outside the repo.
2. Auth settings come from `supabase/config.toml` (anonymous sign-ins, manual linking, site URL, redirect URLs) and are applied with `npx supabase config push`. The Google provider is optional and configured in the dashboard when wanted.
3. Schema: `npx supabase link --project-ref <ref>` then `npx supabase db push`. Migrations in `supabase/migrations/` are the source of truth.
4. `.env` (untracked): `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` for the dev project (publishable key).
5. GitHub secrets: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (prod), `E2E_SUPABASE_URL`, `E2E_SUPABASE_ANON_KEY` (dev).
6. Pages source = GitHub Actions (`gh api -X POST repos/jakyle/recroom-planner/pages -f build_type=workflow`).

Never commit keys. `.env*` is ignored; secrets live in GitHub Actions only.

## Develop

```powershell
npm ci
npm run dev        # http://localhost:5173/recroom-planner/
npm test           # unit (vitest)
npm run e2e        # Playwright against the dev project (needs .env)
npm run check      # svelte-check
npm run db:push    # apply migrations to the linked project
npm run db:types   # regenerate src/lib/supabase/database.types.ts
```

## Smoke runbook (defines `[verified]` in CHECKLIST.md)

P0 rows, run against the live URL:

1. Open the live URL → landing renders. (R2.1, R2.2)
2. Create a project → project page shows owner access, name dialog, share panel with view and edit links. (R3.1, R3.7, R19.3)
3. Open the edit link in a second browser profile → prompted for a name, access `edit`, no share panel. (R3.3)
4. Open the view link in a third profile → access `view`, no Fork button; `#/setup` shows OK for env, anonymous, schema, realtime. (R3.3, R3.6, R20.4)
5. In the owner profile: Members panel lists three; change the editor to view and back; remove the viewer → their page shows the not-a-member error on reload. (R3.5)
6. Rotate the edit link → the old link shows "invalid link". (R3.4)
7. Fork "Base" as "Option A" → appears in the list; Promote it → star moves. (R19.6)
8. Owner clicks Link Google (once the provider is configured) → returns signed in with Google, still owner. (R2.4, R3.8)

P2 rows (two browser profiles on the edit link, automated in `e2e/realtime.spec.ts`):

12. Both profiles show two ringed (online) avatars; moving the mouse in B shows a cursor with B's name in A. (R15.1, R15.3, R15.13)
13. Drag an object in A: B shows it moving before the mouse is released, then at the committed spot. (R15.1, R15.2, R15.7)
14. Click an object in B: A shows B's colored dashed outline and name. (R15.13)
15. Click B's avatar in A: A's view jumps to B's viewport once. (R15.13)
16. Set the same object's x in both profiles at the same time: both end on the later value. (R15.9)
17. Turn off B's network, move the object in A, turn B's network back on: B refetches and shows the new spot; the status strip read "offline collaboration" meanwhile. (R15.5, R15.8)
18. Edit in A, undo in A after B changed the same object: toast "Undid over B's newer change". (R15.11)
19. Project tab › Activity lists the last commits with names; clicking a row zooms to it. (R15.14)
20. With the network blocked during a drag: after retries a toast offers Retry and the object shows an orange dot until it saves. (R15.10)
