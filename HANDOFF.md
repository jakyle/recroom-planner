# HANDOFF — Rec Room Planner (live cursor)

Read this first, then `.claude/napkin.md`, then ONLY the spec section named under **Next action**. Do not read all of `SPEC.md`.

## State

- **Next action:** (1) run the code-reviewer over P0+P1 once the user OKs it (R22.1 gate, asked 2026-09-12, not yet answered); (2) then implement **SPEC §15 — Phase P2 Realtime**: cursors/selection/in-flight drags on the project broadcast channel, `committed` broadcast + `postgres_changes` backstop, reconnect refetch, presence UI, activity feed. Start by reading SPEC §15 in full and `src/lib/model/store.svelte.ts` (`commit()` is where peers' rows get applied) and `src/lib/supabase/realtime.ts` (`projectChannel()` must be used for every channel).
- **Done:** P1 Canvas core is live at https://jakyle.github.io/recroom-planner/ — seeded shell renders (11 walls, 21 openings), select/marquee/drag/rotate/resize/nudge, snap modes + smart guides, measure, object/text/walkway tools, layers panel, inspector, objects list, hover card, context menu, groups, halos, align/distribute, trace underlay (Supabase Storage), day/night themes. Unit 46 green; e2e `access`, `smoke`, `canvas` green locally and against the live site. Checklist: 63 `[verified]`, 61 `[coded]`, 132 open.
- **Location:** `C:/Users/jjack/dev/recroom-planner/`, branch `main`, remote public; everything committed and pushed.
- **Supabase:** migrations 0001–0007 applied to dev (`twpeiaygomaobvshqfvp`, CLI linked) and prod (`rgtegkswqrafdhfifnvt`). Passwords in `C:/Users/jjack/dev/recroom-planner.secrets.local.txt` (outside the repo). `.env` = dev URL + publishable key. GitHub secrets: `VITE_SUPABASE_*` (prod), `E2E_SUPABASE_*` (dev). **Never commit keys.**
- **Not yet configured:** Google OAuth provider (R2.4/R3.8 stay `[coded]`).
- **Open user report (2026-09-12):** "why are windows opening like doors?" — could not reproduce (windows render as a wall gap with three lines, only doors get swing arcs; see `test-results/overview.png` if present). Asked which opening; no answer yet. If it comes up, ask for the label (W1–W14) or a screenshot before changing `Plan.svelte` opening symbols.
- **Code-review gate (R22.1):** the user was asked twice whether to run the code-reviewer over P0+P1 and has not answered. Next agent: ask once in plain text as the first message, then start P2 either way.
- **Plans:** `docs/plans/2026-09-12-p0-foundation-plan.md` (done), `docs/plans/2026-09-12-p1-canvas-plan.md` (done; Task 12's e2e is `e2e/canvas.spec.ts`).

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
- Canvas architecture: `DocumentStore` (reactive maps + op batches, `commit()` applies locally then writes via `Repo`), `Viewport` (px/in, world +y up: `matrix(s 0 0 -s tx ty)`), `CanvasUi` (tool/snap/preview/overlays), tools in `src/lib/canvas/tools/` implement `Tool` (`pointerDown/Move/Up`), `Plan.svelte` renders everything as SVG; keyboard in `src/lib/canvas/keys.ts`.
- World y is up, so SVG text needs `scale(1,-1)` and door-arc sweep flags are already correct for that frame (verified by measuring arc midpoints = radius from hinge; a screenshot misread once suggested otherwise — measure, don't eyeball).
- Smart guides: object edges+centers, wall faces edges-only, and only candidates within 120" on the other axis (`applyGuides(..., reach)`); guides override grid snap by design.
- Object `props` is a DB `Json` column: patch it with `mergeProps(o, patch)` from `src/lib/model/types.ts`, never spread manually (type error).
- Editors change project settings through the `set_project_setting` RPC (projects UPDATE is owner-only in RLS).
- A user hook blocks `// ---- section ----` divider comments in written files; write code without them.
- User style: ≤3 sentences per reply, one question per turn, describe sketch features by their label and ruler position ("between the 5 and 0 labels"), never by coordinates they haven't seen.

## Read-on-demand (action → source, mandatory)

- If you seed the base plan → read SPEC §5 in full and R5.17; coordinates per §0.1; wire `p_template='pool_room'` in `create_project`.
- If you add a migration → name it `000N_<topic>.sql`, `npx supabase db push` to dev, then to prod (relink), then `npm run db:types`.
- If you write a migration → read SPEC §4 (whole) and §19 first; every table needs `version/updated_at/updated_by` (R4.33).
- If you touch auth/join → read SPEC §3 and R19.3–R19.5, R19.11.
- If you build any drag interaction → read SPEC §7.3, §6, and §15.3 (commit pipeline is the only write path).
- If you add a rule → read SPEC §12.2 (engine contract) then the rule line.
- If you build sheets/PDF → read SPEC §18.1–§18.2 and R2.10–R2.11.
- If you add realtime (P2) → read SPEC §15 whole, then `src/lib/supabase/realtime.ts`, `src/lib/model/store.svelte.ts` (`commit`, `applyLocal`), and R2.8 budget rules; throttles in R15.4 are requirements.
- If you touch the canvas → read `src/lib/canvas/Plan.svelte` top-to-bottom first (render order and pointer pipeline) and `src/lib/canvas/tools/select.ts`.
- If you add an e2e → copy the `toPage`/`drag`/`placeObject` helpers from `e2e/canvas.spec.ts`; always `goto('./')`.

## Verify

- P0 done-condition: deployed Pages URL loads; create project; open view link and edit link in two browser profiles; view profile cannot write (R21.8 e2e green); `npm test` green in CI.
- `[verified]` for any line = the SPEC §21.5 smoke step for it ran on the deployed app.
