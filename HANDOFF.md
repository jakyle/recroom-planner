# HANDOFF — Rec Room Planner (live cursor)

Read this first, then `.claude/napkin.md`, then ONLY the spec section named under **Next action**. Do not read all of `SPEC.md`.

## State

- **Next action:** (1) run the code-reviewer over P0 once the user OKs it (R22.1 gate); (2) then implement **SPEC §4 (client model) + §5 (seed) + §6 + §7 + §14 — Phase P1 Canvas core**, starting with R5.17 `seed_pool_room` as migration `0006_seed_pool_room.sql` (read SPEC §5 in full first). The visual design system landed 2026-09-12 (drafting-table look: `src/app.css` tokens, `src/lib/ui/*` title block / shell / panels / status strip, day+night themes); P1's canvas must live inside `.paper` in `src/routes/Project.svelte` and use these tokens, not new colors.
- **Done:** Design pass live (R24.12 `[coded]`). P0 Foundation is live at https://jakyle.github.io/recroom-planner/ — schema/RLS/RPCs (migrations 0001–0005) on both Supabase projects, share-link auth, members panel, scenario fork/promote, setup self-check, CI + Pages deploy, e2e (`e2e/access.spec.ts`, `e2e/smoke.spec.ts`) green locally, in CI, and against the live site. 34 checklist lines `[verified]`, 35 `[coded]`.
- **Location:** `C:/Users/jjack/dev/recroom-planner/`, branch `main`, remote `https://github.com/jakyle/recroom-planner` (public). Everything committed and pushed; working tree clean except this file and CHECKLIST.md after this edit.
- **Supabase:** org `software-boy`; prod `recroom` ref `rgtegkswqrafdhfifnvt`; dev `recroom-dev` ref `twpeiaygomaobvshqfvp` (CLI is linked to dev). DB passwords: `C:/Users/jjack/dev/recroom-planner.secrets.local.txt` (outside the repo). `.env` (untracked) holds the dev URL + publishable key. GitHub secrets: `VITE_SUPABASE_*` (prod), `E2E_SUPABASE_*` (dev). **Never commit keys.**
- **Not yet configured:** Google OAuth provider (R2.4/R3.8 stay `[coded]` until the user sets it up in the Supabase dashboard).
- **Plan for P0:** `docs/plans/2026-09-12-p0-foundation-plan.md` (all tasks executed; Task 0 done by the agent via CLI + config push instead of the dashboard).

## Distilled context (already read the sources; this is what bites)

- Platform is locked: GitHub Pages static + Supabase free tier; Svelte 5 + Vite + SVG canvas; jsPDF + svg2pdf for vector PDF (SPEC §2). Do not relitigate.
- **Sharing is by link, not allowlist** — the prompt file's "3-email allowlist" was reversed by the user in this session. View link + edit link, anonymous sign-in + `claim_share_link` RPC → `project_members` row; RLS is membership-based (SPEC §3, §19.3).
- The sketch is transcribed in SPEC §5 with wall names A/B/C/D and the coordinate origin at the A/C corner; window-wall marks are 12 windows (nominal 3'×5', sill ≈1'); the 28–34' box on Wall B is a **fireplace**, flush; the stepped block at the 0-ft end is an **existing utility room to be demolished**; "add a wall / add a door" is the walls feature, not a plan item.
- Sauna, bar, bathroom are OUT. Program = furniture, pool table (custom object later), gym equipment, mounted TV, rugs, modular islands. Presets stay (SPEC §13.1) but nothing is pre-placed.
- Conflict rules §12.1–§12.9 were confirmed verbatim by the user (2026-09-12).
- Comments anchor to **both** point and object (§17). Grid toggle + three snap modes (§6). Openings snap into walls in 2.5D and elevations are editable (§8).
- Realtime is two-tier: broadcast for cursors/drags, Postgres on pointer-up; LWW per row; per-user undo only (§15).
- Free-tier message budget matters: throttle rules in R15.4 are requirements, not suggestions.
- Live smoke = `$env:PW_BASE_URL='https://jakyle.github.io/recroom-planner/'; npx playwright test e2e/smoke.spec.ts`; local e2e needs the dev server or lets Playwright start it.
- Realtime private channels need `supabase.realtime.setAuth(token)` before `channel()` — use `projectChannel()` in `src/lib/supabase/realtime.ts`, never raw `supabase.channel` (bit us once: CHANNEL_ERROR).
- pgcrypto functions must be schema-qualified (`extensions.gen_random_bytes`) in SQL bodies.
- Playwright `goto('/')` hits the site root on Pages; always `goto('./')` relative to baseURL.
- User style: ≤3 sentences per reply, one question per turn, describe sketch features by their label and ruler position ("between the 5 and 0 labels"), never by coordinates they haven't seen.

## Read-on-demand (action → source, mandatory)

- If you seed the base plan → read SPEC §5 in full and R5.17; coordinates per §0.1; wire `p_template='pool_room'` in `create_project`.
- If you add a migration → name it `000N_<topic>.sql`, `npx supabase db push` to dev, then to prod (relink), then `npm run db:types`.
- If you write a migration → read SPEC §4 (whole) and §19 first; every table needs `version/updated_at/updated_by` (R4.33).
- If you touch auth/join → read SPEC §3 and R19.3–R19.5, R19.11.
- If you build any drag interaction → read SPEC §7.3, §6, and §15.3 (commit pipeline is the only write path).
- If you add a rule → read SPEC §12.2 (engine contract) then the rule line.
- If you build sheets/PDF → read SPEC §18.1–§18.2 and R2.10–R2.11.

## Verify

- P0 done-condition: deployed Pages URL loads; create project; open view link and edit link in two browser profiles; view profile cannot write (R21.8 e2e green); `npm test` green in CI.
- `[verified]` for any line = the SPEC §21.5 smoke step for it ran on the deployed app.
