# HANDOFF — Rec Room Planner (live cursor)

Read this first, then `.claude/napkin.md`, then ONLY the spec section named under **Next action**. Do not read all of `SPEC.md`.

## State

- **Next action:** Implement **SPEC §2 + §3 + §19 + §20 (Phase P0 Foundation)** starting with R2.14 (repo scaffold) — `git init`, Svelte 5 + Vite + TS skeleton per §2.4, then the Supabase migrations for §19.
- **Done:** SPEC.md (full scope, 256 requirements), CHECKLIST.md (all `[ ]`), this file, napkin. **No code written.**
- **Location:** `C:/Users/jjack/dev/recroom-planner/` — **not a git repo yet**, no branch. First commit is part of P0.
- **Files:** `SPEC.md`, `CHECKLIST.md`, `HANDOFF.md`, `.claude/napkin.md` (all untracked, nothing else exists).
- **§24 confirmed:** the user accepted all 12 additional features (2026-09-12); they are normal requirements in the phase each names.

## Distilled context (already read the sources; this is what bites)

- Platform is locked: GitHub Pages static + Supabase free tier; Svelte 5 + Vite + SVG canvas; jsPDF + svg2pdf for vector PDF (SPEC §2). Do not relitigate.
- **Sharing is by link, not allowlist** — the prompt file's "3-email allowlist" was reversed by the user in this session. View link + edit link, anonymous sign-in + `claim_share_link` RPC → `project_members` row; RLS is membership-based (SPEC §3, §19.3).
- The sketch is transcribed in SPEC §5 with wall names A/B/C/D and the coordinate origin at the A/C corner; window-wall marks are 12 windows (35-3/8"×59-1/4", sill ≈1'); the 28–34' box on Wall B is a **fireplace**, flush; the stepped block at the 0-ft end is an **existing utility room to be demolished**; "add a wall / add a door" is the walls feature, not a plan item.
- Sauna, bar, bathroom are OUT. Program = furniture, pool table (custom object later), gym equipment, mounted TV, rugs, modular islands. Presets stay (SPEC §13.1) but nothing is pre-placed.
- Conflict rules §12.1–§12.9 were confirmed verbatim by the user (2026-09-12).
- Comments anchor to **both** point and object (§17). Grid toggle + three snap modes (§6). Openings snap into walls in 2.5D and elevations are editable (§8).
- Realtime is two-tier: broadcast for cursors/drags, Postgres on pointer-up; LWW per row; per-user undo only (§15).
- Free-tier message budget matters: throttle rules in R15.4 are requirements, not suggestions.
- User style: ≤3 sentences per reply, one question per turn, describe sketch features by their label and ruler position ("between the 5 and 0 labels"), never by coordinates they haven't seen.

## Read-on-demand (action → source, mandatory)

- If you scaffold the repo → read SPEC §2.4 and §2.5 first.
- If you write a migration → read SPEC §4 (whole) and §19 first; every table needs `version/updated_at/updated_by` (R4.33).
- If you touch auth/join → read SPEC §3 and R19.3–R19.5, R19.11.
- If you seed the base plan → read SPEC §5 (all of it) and R5.17; coordinates per §0.1.
- If you build any drag interaction → read SPEC §7.3, §6, and §15.3 (commit pipeline is the only write path).
- If you add a rule → read SPEC §12.2 (engine contract) then the rule line.
- If you build sheets/PDF → read SPEC §18.1–§18.2 and R2.10–R2.11.

## Verify

- P0 done-condition: deployed Pages URL loads; create project; open view link and edit link in two browser profiles; view profile cannot write (R21.8 e2e green); `npm test` green in CI.
- `[verified]` for any line = the SPEC §21.5 smoke step for it ran on the deployed app.
