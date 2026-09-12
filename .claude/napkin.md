# Napkin — recroom-planner

Corrections and hard-won facts. Read at session start. Append the moment a mistake happens.

### 2026-09-12 — Prior agent misread the sketch note and flipped the ends
What went wrong: the prompt said "add wall / add a door" was at the 0-ft end and might be a partition. On the image it is at the 63-ft end, and the user says it is simply the feature request for editable walls/doors.
Correction: SPEC §5.16 records it as a feature, not a plan item. The 63-ft end is the top of the scan (ruler reads 63 at top, 0 at bottom).
Durable lesson: transcribe from the image, not from a prior agent's prose; confirm each feature with the user by its handwritten label.

### 2026-09-12 — "where?" ×3: describe sketch features the way the user sees them
What went wrong: asked about "the stepped bump-in at x≈10–20" and "dark marks on the ruler wall"; the user could not locate either.
Correction: refer to features by their handwritten label and the printed ruler numbers ("under the bottom edge, between the 5 and 0 labels, drawn like the 'Door' bracket").
Durable lesson: the user has not seen my coordinate system; never use it in questions.

### 2026-09-12 — Allowlist replaced by share links
What went wrong: the prompt's locked decision was a 3-email allowlist; the user wants Google-Sheets-style view/edit links.
Correction: SPEC §3 (anonymous sign-in + claim_share_link RPC + membership RLS).
Durable lesson: the prompt file is a prior agent's summary; the user's live answer wins.

### 2026-09-12 — Program is smaller than the prompt implied
Sauna, bar, bathroom are out. Pool table is a custom object the user places later. Keep presets, pre-place nothing.

### 2026-09-12 — Repo is public; no secrets in git, ever
The user made the repo public for GitHub Pages. Supabase keys (even the anon key), share tokens, and service-role keys go in GitHub Actions secrets / untracked `.env` only. Check `git diff --cached` for `eyJ` / `sb_` / `supabase.co` before every commit.
