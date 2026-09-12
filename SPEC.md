# Rec Room Planner — Specification

Status: **contract**. Read-only during the build. Progress is tracked in `CHECKLIST.md`; the cursor is `HANDOFF.md`. Never edit this file to record progress.

Every section has a stable ID (`§7.3`). Every requirement is a line beginning `**Rn.m**`. `CHECKLIST.md` is generated from those lines, one per requirement.

Decisions marked **[LOCKED]** were argued through with the user and are not to be relitigated. Items marked **[UNVERIFIED ±1']** were read off the hand sketch and are editable in the app. Section §24 lists additional features the user confirmed on 2026-09-12; they are full requirements built in the phase each line names.

---

## §0 Conventions

### §0.1 Units and coordinates

- Internal unit: **inches, integer** (1" is the finest snap). Display: feet-and-inches, `12'-6"`. Angles in degrees, 0.1° resolution.
- Plan coordinates: origin at the corner of **Wall A** (the 12-window long wall) and **Wall C** (the utility-room end wall). `x` runs 0→348" (29'-0") toward Wall B. `y` runs 0→756" (63'-0") toward Wall D. `z` is height above finished floor, 0→112" (9'-4" ceiling).
- Walls are named A/B/C/D (§5). "North" is a project setting (§5.6), default +y.
- Screen: +y is **up** on the canvas (Wall D at the top, matching the sketch).

### §0.2 Requirement states

Each requirement moves `[ ] → [coded] → [verified]` in `CHECKLIST.md`. `[verified]` means the real built app ran the smoke step for that requirement (§21.5), not a unit test.

### §0.3 Access levels

`owner` (created the project), `edit` (came in via the edit link), `view` (came in via the view link). "Editor" below means owner or edit.

---

## §1 Goals and non-goals

### §1.1 Goals

- **R1.1** Plan the 63'×29' pool-room conversion (rec room + home gym) as a layered 2.5D floor plan that three people edit together in real time.
- **R1.2** Produce a contractor-grade printable sheet set at 1/4"=1'-0", a color working sheet, and a machine-readable JSON datasheet.
- **R1.3** Catch slab-anchor vs radiant-tubing conflicts (and the other §12 rules) before the concrete is poured.
- **R1.4** Support "plan another room later" as a new Project without code changes.

### §1.2 Non-goals

- No full 3D rendering. No CRDT/merge. No global undo. No public/anonymous-read pages. No native mobile app. No email/notifications.
- Not a code-compliance tool: rules in §12 are planning aids, not engineering sign-off.

---

## §2 Platform and architecture [LOCKED]

### §2.1 Hosting

- **R2.1** The app is a static single-page bundle deployed to **GitHub Pages** from the repo's `main` branch by GitHub Actions on push.
- **R2.2** Routing uses hash routes (`#/p/<projectId>/s/<scenarioId>`, `#/join/<token>`) so deep links survive Pages' lack of SPA rewrites.
- **R2.3** The Supabase project URL and anon key are baked in at build time via `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` (public by design; all security is RLS, §19).

### §2.2 Backend: Supabase free tier

- **R2.4** Auth: Supabase **anonymous sign-in** for every visitor, with optional **Google** sign-in that upgrades (links) the anonymous identity so ownership survives a cleared browser.
- **R2.5** Durable state: Postgres with Row-Level Security; every policy is membership-based (§19.3). No client-side authorization.
- **R2.6** Ephemeral state: Supabase Realtime **broadcast** + **presence** on one private channel per project (`project:<id>`), authorized by RLS on `realtime.messages`.
- **R2.7** Files: Supabase Storage bucket `refs` for reference images (§13.5), path-scoped per project, policies membership-based.
- **R2.8** Free-tier budgets are designed to, not discovered: Realtime ≤200 concurrent connections, 2M messages/month → client throttles in §15.2; Storage 1 GB → 5 MB per image, 200 MB per project soft cap shown in UI.

### §2.3 Front-end stack

- **R2.9** Svelte 5 (runes) + Vite + TypeScript, static build (`vite build`), no SSR.
- **R2.10** The plan canvas and elevations render as **SVG** (one `<svg>` per view, layers as `<g>` groups) so the same render path feeds the vector PDF export.
- **R2.11** PDF sheets are produced client-side with **jsPDF + svg2pdf.js** (vector), fonts embedded (§18.2).
- **R2.12** State: a single in-memory document store per open scenario (plain objects + Svelte runes), with a commit pipeline (§15.3) as the only write path.
- **R2.13** Geometry/graph/conflict code lives in framework-free TypeScript modules (`src/lib/geom`, `src/lib/graph`, `src/lib/rules`) so they unit-test without a DOM.

### §2.4 Repo layout

```
recroom-planner/
  SPEC.md  CHECKLIST.md  HANDOFF.md
  .claude/napkin.md
  .github/workflows/deploy.yml
  supabase/config.toml
  supabase/migrations/*.sql
  supabase/seed.sql              # built-in presets + base plan seed function
  src/
    app.html  main.ts  App.svelte
    routes/                      # hash router views: Landing, Join, Project
    lib/
      supabase/  (client, auth, realtime, repo per table)
      model/     (types, document store, commit pipeline, undo)
      geom/      (units, snapping, walls, rooms, transforms)
      graph/     (ports, edges, inference, circuits)
      rules/     (conflict engine + rule modules)
      radiant/   (loops, zones, serpentine generator, lengths)
      canvas/    (Plan.svelte, Elevation.svelte, tools/, overlays/)
      sheets/    (sheet model, composer, schedules, pdf)
      exports/   (working sheet, json datasheet, import)
      ui/        (panels: layers, objects, library, comments, scenarios, conflicts)
  tests/  (vitest unit + component)  e2e/ (playwright)
```

- **R2.14** The repo layout above exists with placeholder modules and a passing empty test suite before any feature work.

### §2.5 Local development

- **R2.15** `npm run dev` runs against the hosted Supabase project (a dedicated `recroom-dev` project) by default; the Supabase CLI local stack is optional, documented, and never required for the smoke runbook (RAM-constrained machine).
- **R2.16** Migrations are applied with `supabase db push`; the schema in the repo is the source of truth, never the dashboard.

---

## §3 Access and sharing [LOCKED — replaces the earlier 3-email allowlist]

### §3.1 Share links

- **R3.1** Each project has two links: a **view link** and an **edit link**, each carrying a 32-byte random token (`#/join/<token>`), exactly like a Google Sheets "anyone with the link" share.
- **R3.2** Tokens are stored only as SHA-256 hashes on the project row; the plaintext exists only in the link the owner copies.
- **R3.3** Opening a link signs the visitor in anonymously (if needed), calls `claim_share_link(token)` (a `SECURITY DEFINER` RPC), which inserts/updates a `project_members` row with access `view` or `edit`, then routes to the project.
- **R3.4** The owner can **rotate** either link (`rotate_share_link`); old tokens stop working immediately; existing members keep their membership until the owner **removes** them from the Members panel.
- **R3.5** The Members panel (owner only) lists members with display name, access, last seen; owner can change a member's access or remove them.
- **R3.6** No route renders any project data without a valid membership; the join flow is the only way in.

### §3.2 Identity

- **R3.7** First visit prompts for a **display name** (stored on `project_members`); the name and an assigned cursor color label the user's cursor, selections, comments, and commits.
- **R3.8** The owner is nudged (dismissible banner) to link a Google account so ownership is not lost with browser storage; any member may link Google.
- **R3.9** A user's identity persists via Supabase's session in `localStorage`; a new browser = a new anonymous user who re-joins via the link (their old comments keep the old author name).

---

## §4 Domain model

`Project → Scenario → Layer → Object`, plus walls/openings, runs, flooring, comments, snapshots, sheets.

### §4.1 Project

- **R4.1** `projects`: id, name, owner_id, view/edit token hashes, `settings` JSON (north angle, room defaults, rule parameters §12.4, title-block fields §18.2.3, units display), timestamps.
- **R4.2** A project owns the **shell** (§4.5 walls with `scope='shell'`, their openings, and utility service points) which is **shared across all scenarios**.

### §4.2 Scenario

- **R4.3** `scenarios`: id, project_id, name, parent_scenario_id, is_primary, archived, created_by, created_at. Exactly one scenario per project is primary (the export default).
- **R4.4** Every project is created with one scenario named "Base".
- **R4.5** Scenario-scoped rows: new walls, shell demolition marks, objects, runs, circuits, slab, zones, rooms, comments, snapshots, sheets, conflict acknowledgements.

### §4.3 Layer

- **R4.6** Built-in layers, seeded per project in this order with these keys: `walls` (Shell & Walls), `utility` (Utility: panel, boiler, water heater, manifold, service entries), `flooring` (Flooring & Radiant), `plumbing`, `electrical` (power), `lighting`, `hvac`, `sound` (Sound & AV), `furnishing`, `gym`, `annotations` (dimensions, text, comment pins).
- **R4.7** Users may add custom layers (name, color, sort); custom layers behave identically for visibility/lock/opacity and export.
- **R4.8** Every object, run, and wall references exactly one layer.

### §4.4 Object

- **R4.9** `objects`: id, scenario_id, layer_id, preset_id (nullable), name, `x,y,z` (inches, position of the object's local origin = bottom-left of its footprint before rotation), `w,d,h` (inches), `rot` (degrees, about the footprint center), `mount` ∈ {`floor`, `floor_anchored`, `wall`, `ceiling`, `recessed`}, `wall_id` (required when mount ∈ {wall, recessed}), `tags text[]`, `image_path`, `halo` JSON, `locked`, `props` JSON, `version`, `updated_at`, `updated_by`.
- **R4.10** `props` carries typed extras per category: `cost`, `product_url`, `vendor`, `sku`, `notes`, `load_va`, `voltage` (120/240), `ports[]` (§10.2), `lumens`, `btu`, `weight_lb`, `anchor_points[]` (footprint offsets that hit the slab, used by rule §12.1).
- **R4.11** Object footprint is the rotated `w×d` rectangle; all hit-testing, snapping, halos, and conflicts use it. Non-rectangular objects are out of scope (a rug or L-sectional is composed of rectangles via groups §7.9).

### §4.5 Walls

- **R4.12** `walls`: id, project_id, scenario_id (NULL when `scope='shell'`), `scope` ∈ {shell, scenario}, `ax,ay,bx,by` (centerline endpoints, inches), `thickness` (default 4.5" = 2×4 + ½" drywall each side; 6.5" for 2×6), `framing` ∈ {2x4, 2x6, masonry, existing_unknown}, `height` (default ceiling 112"), `state` ∈ {existing, new} plus per-scenario `demo` marks (§4.5 R4.14), `layer_id` (always `walls`), version fields.
- **R4.13** Shell walls are the as-built (§5) and are editable only in **Shell mode** (§9.6) by editors; edits propagate to all scenarios.
- **R4.14** `scenario_wall_states`: (scenario_id, wall_id, state ∈ {demo}) — a scenario marks a shell wall as demolished without touching the shell.
- **R4.15** Walls that meet at endpoints (within 1") are joined; T-junctions and crossings are split into segments on commit (§9.3).

### §4.6 Openings

- **R4.16** `openings`: id, wall_id, `kind` ∈ {door, double_door, slider, window, fireplace, cased_opening}, `offset` (inches from wall point A to opening start), `width`, `sill` (0 for doors), `head`, `swing` ∈ {in, out, none}, `hinge` ∈ {a_side, b_side, none}, `label`, `props` JSON (unit model, product url), version fields.
- **R4.17** An opening belongs to exactly one wall and cannot extend past its ends or overlap another opening on the same wall (hard validation on commit).
- **R4.18** Shell openings (on shell walls) are project-scoped and shared; openings on scenario walls are scenario-scoped.

### §4.7 Systems graph

- **R4.19** `runs`: id, scenario_id, layer_id, `system` (§10.1), `points` JSON (polyline of `{x,y,z}`), `from_object_id/from_port`, `to_object_id/to_port` (nullable = dangling), `circuit_id` (nullable), `zone_id` (nullable, for `pex_loop`), `props` (gauge, pipe size, tubing size), version fields.
- **R4.20** `circuits`: id, scenario_id, panel_object_id, slot, name, amps, voltage, `pole` ∈ {1,2}, version fields.
- **R4.21** Ports are declared on objects (`props.ports[]`: id, system, `dx,dy,dz` offset, `dir` in/out/any) and referenced by runs; there is no separate ports table.

### §4.8 Flooring and radiant

- **R4.22** `slabs`: id, scenario_id, `polygon` JSON, `thickness`, `insulation` JSON (type, R-value, thickness), `vapor_barrier` bool, `notes`. One slab per scenario (default = room polygon minus retained shell intrusions).
- **R4.23** `zones`: id, scenario_id, name, `polygon`, `spacing` (6/9/12"), `tubing` (3/8", 1/2", 5/8"), `manifold_object_id`, `manifold_port`, `design_btuh` (computed, §11.5).
- **R4.24** Loops are `runs` with `system='pex_loop'` and a `zone_id`; supply/return from manifold to boiler are `pex_supply` / `pex_return` runs.
- **R4.25** `rooms`: id, scenario_id, name, `polygon` (cached, recomputed from walls on commit), `finish` (rubber mat, LVP, carpet, concrete, other), `finish_props` (thickness, product url, cost/sqft).

### §4.9 Comments

- **R4.26** `comments`: id, scenario_id, `anchor` ∈ {point, object}, `x,y` (point anchor), `object_id` (object anchor), `parent_id` (reply), body, author_id, author_name, resolved, created_at.
- **R4.27** Comments are scenario-scoped; forking a scenario copies open comments (with a "copied from <scenario>" marker), resolved ones are not copied.

### §4.10 Tags

- **R4.28** Tags are free-form strings on objects (`tags text[]`), normalized lowercase-trimmed; the project keeps a derived tag list with optional colors in `settings.tags`.

### §4.11 Snapshots

- **R4.29** `snapshots`: id, scenario_id, name, `kind` ∈ {manual, auto_fork, auto_restore}, `payload` JSON (full scenario export §18.4 shape), created_by, created_at.

### §4.12 Sheets

- **R4.30** `sheets`: id, scenario_id, `code` (A-1…), title, `paper` ∈ {ARCH_C, ARCH_D, ANSI_B}, `scale` ∈ {1/4", 1/8", 3/8", 1/2"}, `view` JSON (kind plan|elevation|rcp, wall_id, crop rect, rotation), `layers text[]`, `schedules` JSON (which schedule blocks), sort, version fields. A default sheet set is generated per scenario (§18.2.1) and is editable.

### §4.13 Presets

- **R4.31** `presets`: id, project_id (NULL = built-in), name, category, layer_key, `w,d,h`, mount, `props`, `halo`, `image_path`, `tags`. Built-ins are seeded (§13.1); project presets are created via "Save to library".

### §4.14 Conflict acknowledgements

- **R4.32** `conflict_acks`: scenario_id, rule_id, `key` (stable hash of the involved ids), user_id, note, created_at — an acknowledged conflict is shown dimmed, not hidden.

### §4.15 Versioning

- **R4.33** Every mutable row carries `version` (int, +1 per write), `updated_at`, `updated_by`. Writes are last-writer-wins; the client never sends compare-and-set.

---

## §5 Base plan — the as-built shell (confirmed with the user 2026-09-12)

This section is the citable transcription of the hand sketch. Everything here is seeded into Project 1's shell (§5.7) and is editable in Shell mode. Dimensions from the grid are **[UNVERIFIED ±1']** unless marked confirmed.

### §5.1 Room

- **R5.1** Interior 63'-0" (y) × 29'-0" (x), ceiling 9'-4" (112"). Sketch grid = interior faces. Wall thickness for shell walls: `existing_unknown`, drawn 6" for exterior (A, C, D) and 4.5" for B, editable.
- **R5.2** Wall names: **A** = long wall at x=0 (12 windows). **B** = long wall at x=29' (doors + fireplace). **C** = short wall at y=0 (utility room, door, window). **D** = short wall at y=63' (exterior: slider + window).

### §5.2 Wall A (x=0, y 0→63') — window wall

- **R5.3** Twelve windows, unit **American Craftsman 50 Series single-hung, 35-3/8" W × 59-1/4" H** (confirmed), centers at y ≈ 4', 9', 14', 19', 24', 29', 34', 39', 44', 49', 54', 59' [UNVERIFIED ±1'], sill **≈ 1'-0"** (user estimate, editable), head ≈ 5'-11¼".

### §5.3 Wall B (x=29', y 0→63') — door wall

- **R5.4** Bathroom door: single 3'-0", y ≈ 1'→4' (center 2'-6"), swings out of the room (assumed), label "Bathroom" (the bathroom is **not** part of this project).
- **R5.5** Double door #1: 6'-0", center y ≈ 17'-6" (14'-6"→20'-6"), swing in (assumed).
- **R5.6** **Fireplace** (confirmed): 5'-6" wide, centered y ≈ 31' (28'-3"→33'-9"), firebox opening 3'-6" tall with its bottom 2'-6" AFF (opening 2'-6"→6'-0"), **flush** with the wall (no projection into the room; depth irrelevant per user). Rendered as an opening of kind `fireplace`; appears on the Wall B elevation; rule §12.6 protects its face.
- **R5.7** Double door #2: 6'-0", center y ≈ 45' (42'→48'), swing in (assumed).
- **R5.8** Hall door: single 3'-0", center y ≈ 57'-6" (56'→59'), swing in (assumed), label "Hall".

### §5.4 Wall C (y=0, x 0→29') — utility end wall

- **R5.9** Window: same unit as §5.3, center x ≈ 3'-6" (2'→5'), sill ≈ 1'-0" (confirmed as a window, same size).
- **R5.10** **Existing utility room** (confirmed): stepped enclosure projecting into the room from Wall C. Lower block x ≈ 9'-6"→20'-6" × y 0→5'; upper step x ≈ 11'→19' × y 5'→7' [UNVERIFIED ±1']. Seeded as shell walls with `state=existing`. The user will **demolish it and draw a new utility room** elsewhere, so scenarios mark these walls `demo` (§4.5) and place new walls (§9). Contents (panel, boiler, water heater) are **unknown** — open item §23.
- **R5.11** Door: single 3'-0", center x ≈ 25'-6" (24'→27'), unlabeled in the sketch, swing assumed out; label editable.

### §5.5 Wall D (y=63', x 0→29') — exterior end wall

- **R5.12** Sliding door, **exterior** (confirmed), 8'-0", center x ≈ 20' (16'→24'), `swing=none`.
- **R5.13** Window: center x ≈ 7'-6" (5'-6"→9'-6"); unit assumed the same as §5.2 (not confirmed), sill ≈ 1'-0".

### §5.6 Orientation and misc

- **R5.14** North angle is unknown; default north = +y (toward Wall D); stored in project settings and drawn on every sheet's north arrow.
- **R5.15** The faint mirrored "9'5 / 2'5" mark at the bottom-left of the scan is bleed-through and is ignored.
- **R5.16** The sketch note "add a wall / add a door" is a **feature request** (§9), not a plan feature; nothing is seeded for it.

### §5.7 Seeding

- **R5.17** `seed.sql` provides `seed_pool_room(project_id)` which creates the four shell walls, all openings above, the utility-room shell walls, the default slab (room polygon minus the utility room), the built-in layers, the default sheet set, and the "Base" scenario. Project 1 is created by the owner through the UI with "Start from: Pool room (63×29)" or "Start from: empty rectangle W×L".

---

## §6 Units, grid, snapping

- **R6.1** All lengths display as feet-inches (`12'-6"`, `0'-3½"` with ⅛" precision when a value is non-integer); input fields accept `12'6"`, `12-6`, `150"`, `12.5'`, `150` (inches when unitless).
- **R6.2** Grid: 1'-0" major lines, 1" minor lines appear when zoom ≥ 24 px/ft; grid visibility is a toggle (`G`) persisted per user.
- **R6.3** Snap modes (toolbar + keys): **Grid** (1'-0"), **Fine** (1"), **Free**. Holding `Alt` while dragging forces Free; holding `Shift` constrains to axis.
- **R6.4** Smart guides: while dragging, edges/centers align to nearby object edges/centers and wall faces within 6 px, with red guide lines and distance readouts to the nearest wall faces on each side.
- **R6.5** Wall-mounted objects snap to the nearest wall face and slide along it; ceiling/recessed objects snap to the 1' grid by default; openings snap along their wall (§9.4).
- **R6.6** Rotation snaps to 15° by default; `Alt` frees it; live readout shows angle and the rotated bounding box.

---

## §7 Plan canvas and interaction

### §7.1 Viewport

- **R7.1** Pan (space+drag, middle-drag, two-finger), zoom (wheel/pinch, 10 px/ft → 400 px/ft), zoom-to-fit, zoom-to-selection; the viewport is per user and persisted.
- **R7.2** Rendering stays ≥ 50 fps with 500 objects + 200 runs on a mid-range laptop (measured in §21.4).

### §7.2 Selection

- **R7.3** Click selects; shift-click toggles; **click-drag marquee** selects everything whose footprint intersects (drag right) or is fully enclosed (drag left), across visible unlocked layers.
- **R7.4** Selection shows handles (move, rotate, resize when the object is not preset-locked), a dimension readout (`W×D`, `z`, `h`), and the owner's name tag when selected by someone else.
- **R7.5** `Esc` clears; `Ctrl+A` selects all on the active layer; `Tab` cycles overlapping objects under the cursor.

### §7.3 Move, rotate, resize

- **R7.6** Everything drawable is drag-and-droppable: objects, groups, wall segments, wall endpoints, openings (along their wall), run vertices, run endpoints, slab/zone vertices, comment pins, dimension strings.
- **R7.7** Multi-select moves as a group (relative positions kept), rotates about the group centroid, deletes, tags, and changes layer together.
- **R7.8** Arrow keys nudge 1" (`Shift` = 1'-0"); `Ctrl+D` duplicates with a 1' offset; `R` enters rotate; `F` flips (mirror) about the object's center.
- **R7.9** Resize handles change `w/d` (and `h` in elevations) with live readout; preset objects resize only after "Unlock size" (so a pool table stays 8').
- **R7.10** During a drag the local model updates immediately; nothing waits on the network (§15).

### §7.4 Tools

- **R7.11** Tool palette: Select, Pan, Measure, Wall, Opening, Object (from library), Custom object (draw box), Run (per system), Zone, Slab edit, Comment, Text/Dimension.
- **R7.12** Measure: click-click distance (feet-inches, with dx/dy), click-chain polyline length, and closed-loop area; measurements are transient unless "Pin" is pressed, which stores them as annotation objects.
- **R7.13** Text callouts and dimension strings are annotation objects on the `annotations` layer and export to sheets.

### §7.5 Hover and context

- **R7.14** Hovering an object for 400 ms shows a popout: reference image (if any), name, W×D×H, z/mount, tags, cost and product link, open comment count.
- **R7.15** Right-click context menu: Duplicate, Group/Ungroup, Lock, Send to layer, Add tag, Save to library, Add comment, Delete, Bring to front / Send to back (z-order within layer).

### §7.6 Clearance halos

- **R7.16** Objects may define a halo (`halo` JSON: uniform expand in inches, or per-side, or an arc set for cue swing); halos render as dashed translucent regions when the object is selected or when "Show halos" is on.
- **R7.17** Built-in halos: pool tables 5'-0" per side (cue swing), walkways 3'-0" (a `walkway` annotation object type: a rectangle that must stay clear), power rack 2'-0" sides and 4'-0" front, bench 2'-0" per side, treadmill 6'-6" rear × 1'-8" sides, doors' swing arcs (derived, §9.4).

### §7.7 Layer panel

- **R7.18** Layer panel lists layers in order with per-layer **visible**, **lock**, **opacity** (0–100%), color swatch, object count; the active layer receives new objects.
- **R7.19** Solo (alt-click the eye) shows one layer alone; locked layers are unselectable and unsnappable-to except walls.

### §7.8 Object panel and search

- **R7.20** Object list panel: filter by name/tag/layer/mount, sort by name/layer/cost, click to select and zoom; bulk tag/layer/delete on the filtered set.

### §7.9 Groups

- **R7.21** Objects can be grouped (named group); groups move/rotate as one, ungroup restores; a group can be "Saved to library" as a composite preset (e.g., modular island arrangement, sectional + coffee table).

### §7.10 Keyboard and touch

- **R7.22** All tools have single-key shortcuts listed in a `?` overlay; touch (tablet) supports pan/zoom/select/drag with the same commit path.

---

## §8 2.5D and elevations

- **R8.1** Every object carries `z` (bottom above floor) and `h`; `mount` determines defaults: floor `z=0`; floor_anchored `z=0` + anchor points; wall `z` from preset (TV 42" center, speakers 72", mini-split head 84", outlets 16" to box center, switches 48"); ceiling `z = ceiling − h`; recessed `z` per preset with `wall_id`.
- **R8.2** Four **wall elevations** (A–D) plus one per scenario wall marked "elevation" are **generated from the plan data**, never drawn separately: floor and ceiling lines, the wall's openings with sill/head, the fireplace, wall/recessed objects on that wall at their `z`, and floor/ceiling objects whose footprint lies within 3'-0" of the wall drawn as lighter silhouettes at their `z`.
- **R8.3** Elevations are **editable**: dragging an object vertically sets `z`; dragging horizontally moves it along the wall; resizing sets `h`; openings' sill/head drag with feet-inch readout. Edits commit through the same pipeline and update the plan.
- **R8.4** Ceiling-mounted items and the 9'-4" ceiling line are drawn on elevations; the **reflected ceiling plan (RCP)** view shows ceiling/recessed objects (lights, speakers, mini-split heads) on the plan outline for sheet E-2.
- **R8.5** Window placement is 2.5D: an opening is placed into a wall segment with `offset/width/sill/head`, snaps along the wall (§6.5) and to 1" heights, and refuses to overlap another opening (§4.6).

---

## §9 Walls, openings, rooms

### §9.1 Drawing walls

- **R9.1** Wall tool: click-click (or click-drag) draws a wall centerline with thickness/framing/height from the tool options; `Shift` constrains to 0/90°; endpoints snap to existing wall endpoints and faces; chained clicks draw connected runs; `Esc` ends.
- **R9.2** Walls display double lines at true thickness with a hatch by framing type in plan; `state=new` walls are drawn heavier and `demo` walls dashed (§9.5).
- **R9.3** Wall endpoints and whole segments drag; dragging a shared endpoint moves all joined walls; `Alt` detaches.

### §9.2 Editing

- **R9.4** Properties: thickness, framing, height, state, layer (always `walls`), label; "Split at point" and "Join collinear" commands.

### §9.3 Topology

- **R9.5** On commit the wall set is normalized: overlaps merged, T-junctions and crossings split at intersections, endpoints within 1" fused. Normalization is a pure function (`geom/walls.ts`) with unit tests.

### §9.4 Openings

- **R9.6** Opening tool: click a wall to place a door (3'-0" single / 6'-0" double / 8'-0" slider / cased opening) or window (default = the project's window unit 35-3/8"×59-1/4", sill 1'-0"); standard sizes are defaults, all fields editable per §4.6.
- **R9.7** Openings slide along their wall, show swing arcs (doors) and sill/head labels (windows); door swing arcs are derived halos for rule §12.2.
- **R9.8** Openings cannot be placed on `demo` walls; demolishing a wall dims its openings.

### §9.5 Demolition

- **R9.9** In a scenario, an editor marks any shell wall "Demolish" (dashed render, excluded from rooms/areas/elevations, listed on the A-1 demo note) or "Keep"; scenario walls are simply deleted.

### §9.6 Shell mode

- **R9.10** "Edit shell" toggles Shell mode (editors only, banner shown): shell walls/openings become editable and edits propagate to all scenarios; outside Shell mode they are locked.

### §9.7 Rooms and areas

- **R9.11** Closed wall loops (using non-demo walls, inner faces) are detected as rooms on commit; each room row keeps name and finish; the panel shows floor area, perimeter, wall area (perimeter × height minus openings), and ceiling area.
- **R9.12** Room areas feed HVAC sizing (§10.6), radiant zones (§11.5), flooring quantities (§11.6), and the working-sheet totals (§18.3).

---

## §10 Connected systems — graph behind freehand [LOCKED]

### §10.1 System types

- **R10.1** Runs carry one `system`: `cold`, `hot`, `dwv`, `vent`, `gas`, `v120`, `v240`, `lighting`, `switch_leg`, `low_voltage`, `speaker`, `hdmi`, `refrigerant`, `duct_supply`, `duct_return`, `pex_loop`, `pex_supply`, `pex_return`. Each has a color, line style, default layer, and default size/gauge.

### §10.2 Ports

- **R10.2** Fixtures declare ports (`props.ports[]`) with a system and an offset; e.g., outlet: `v120 in`; 240V receptacle: `v240 in`; panel: N breaker ports `v120/v240 out`; manifold: N `pex_loop out` + `pex_supply in` + `pex_return out`; boiler: `pex_supply out`, `pex_return in`, `cold in`, `v120 in`; water heater: `cold in`, `hot out`, `v240 in`; utility sink: `cold in`, `hot in`, `dwv out`; floor drain: `dwv out`; TV: `v120 in`, `hdmi in`; AV rack: `hdmi out ×4`, `speaker out ×8`, `v120 in`; speaker: `speaker in`; mini-split head: `refrigerant in`, `v120 in`; condenser: `refrigerant out`, `v240 in`; light fixture: `lighting in`; switch: `v120 in`, `switch_leg out`.
- **R10.3** Custom objects can add ports in the properties panel (system, side, offset).

### §10.3 Drawing runs

- **R10.4** Run tool (per system): freehand click-chain polyline with `Shift` orthogonal constraint; vertices carry `z` (default: v120/v240 in-wall at 16" or ceiling at 112" per project setting; plumbing under slab −6"; pex_loop in slab −2").
- **R10.5** **Magnet snap**: while drawing or dragging an endpoint, ports of the same system within 12 px pull the endpoint; the run's `from/to` object+port are set and the endpoint follows the object when it moves.
- **R10.6** Runs can start or end dangling (no port); dangling ends render with a hollow circle and appear in the "unconnected" list.
- **R10.7** Run vertices drag; `Alt`-click a segment inserts a vertex; `Delete` on a vertex removes it.

### §10.4 Inference

- **R10.8** The graph (`graph/`) is rebuilt on every commit: nodes = objects with ports, edges = runs; connectivity is derived per system; a run touching another run's vertex of the same system (within 1") joins them (junction).
- **R10.9** Queries exposed in the inspector: "What circuit is this on?", "Is this outlet connected to the panel?", "Does this drain reach the stack/exit point?", "What does this manifold port feed?", "Which fixtures does this switch control?"; each answer highlights the path on the canvas.

### §10.5 Electrical

- **R10.10** A panel object has a circuit list (§4.7); a `v120/v240` run whose upstream reaches a panel port gets that circuit; the circuit's load = Σ `load_va` of connected fixtures; the inspector shows amps at 120/240 and % of breaker.
- **R10.11** Circuit list UI: add/edit breaker (amps, poles, name), assign a run/fixture to a circuit by dragging the run start to the panel port, panel schedule export (§18.2).
- **R10.12** Wire gauge suggestion by breaker: 15A→14 AWG, 20A→12 AWG, 30A→10 AWG, 40A→8 AWG, 50A→6 AWG; shown as run default, editable.
- **R10.13** Lighting: fixtures on `lighting` runs; switches connect via `switch_leg` runs; the inference reports which fixtures each switch controls.

### §10.6 HVAC

- **R10.14** Mini-split heads (wall/ceiling) connect to a condenser via `refrigerant` runs (line-set length shown); optional ducts (`duct_supply/return`) with sizes; an ERV/exhaust fan object type.
- **R10.15** Room-area BTU helper: per room, `area × BTU/sqft` (project setting, default 25) + window allowance (per window count × setting, default 1,000 BTU/h) shown next to each head's rated BTU; advisory only.

### §10.7 Plumbing

- **R10.16** Plumbing nodes (utility sink, floor drain, water heater, boiler feed, hose bib, future wet-bar rough-in) with `cold/hot/dwv/vent/gas` runs; pipe sizes on runs; DWV slope note (¼"/ft) shown as a length-derived drop in the inspector.
- **R10.17** Service entry points (water entry, main stack/exit, panel location, gas entry) are `utility`-layer objects on the project shell so every scenario ties back to the same points.

### §10.8 Sound & AV

- **R10.18** TV, AV rack, speakers, in-ceiling speakers, subwoofer objects with `speaker/hdmi/low_voltage` runs; run lengths sum per system for the BOM; TV objects have `size_in` and mount `z`.

---

## §11 Flooring and radiant [LOCKED as first-class geometry]

- **R11.1** Slab: editable polygon (default room outline minus retained intrusions), thickness, insulation type/thickness/R, vapor barrier flag; area and concrete volume (cu yd) computed.
- **R11.2** Zones: draw polygons inside the slab; each has spacing (6/9/12"), tubing size, name, manifold port assignment; zones may not overlap (validation).
- **R11.3** Loops: `pex_loop` runs drawn freehand inside a zone, or **auto-generated** as a serpentine (or counter-flow spiral) from the zone polygon and spacing (`radiant/serpentine.ts`), then editable vertex-by-vertex; loop length is computed and shown; bend radius warning at < 6× tubing OD.
- **R11.4** Loop length limit per tubing size (project setting; defaults 3/8"→250', 1/2"→300', 5/8"→400'): exceeding it is a conflict (§12.8).
- **R11.5** Zone heat-loss estimate: `area × BTU/sqft` (default 25) + windows on adjoining walls; compared to the zone's capacity at the chosen spacing (setting: BTU/h per sqft by spacing, defaults 6"→35, 9"→30, 12"→25); advisory.
- **R11.6** Finish flooring per room (§4.8): rubber mats (tile size, count with cuts), LVP/plank (sqft + 10% waste), carpet, bare/sealed concrete; quantities appear on the working sheet and M-1/A-1 notes.
- **R11.7** Radiant BOM: total PEX by size, manifold ports used, insulation sqft, vapor barrier sqft, concrete cu yd, supply/return lengths.
- **R11.8** Manifold and boiler are `utility`-layer objects with ports (§10.2); supply/return runs connect them; the manifold's port count is a property and over-assignment is a conflict (§12.8).

---

## §12 Conflict engine (confirmed with the user 2026-09-12)

### §12.1 Rules

- **R12.1** **Slab anchor vs PEX** (error): any anchor point of a `floor_anchored` object, any `new` wall's bottom plate (its full footprint), any floor drain / floor box / post within **3"** of a `pex_loop`, `pex_supply`, or `pex_return` polyline.
- **R12.2** **Door swing** (warning/error): an object footprint intersecting a door's swing arc → warning; a wall crossing a swing arc or blocking an opening → error.
- **R12.3** **Clearance halo** (warning): any object's halo (§7.6) intersecting another object's footprint or a non-demo wall; walkway objects intersecting anything.
- **R12.4** **Headroom** (error): `z + h > ceiling` (112"), or a floor object's top intersecting a ceiling-mounted object's footprint at that height; power racks and pull-up bars additionally check `z + h + 12"` (user clearance) as a warning.
- **R12.5** **Circuit load** (error): circuit load > 80% of breaker rating; a `voltage=240` fixture on a 120V circuit or vice versa; a fixture with no path to a panel → warning ("unpowered").
- **R12.6** **Openings** (warning/error): an object covering any part of a window, the fireplace face, or a door's leaf → warning; an object blocking the exterior slider or the hall door → error (egress).
- **R12.7** **Walls** (error): a `new` wall crossing an existing non-demo wall (T-junctions are allowed and split, §9.3); openings overlapping on one wall; an opening wider than its wall.
- **R12.8** **Radiant** (warning): loop length over limit (§11.4); loop leaves its zone; zone without a manifold port; manifold ports over-assigned; `pex_loop` spacing under 6" anywhere (adjacent parallel segments).
- **R12.9** **Connectivity** (info): dangling runs; fixtures with ports and no runs.

### §12.2 Engine

- **R12.10** Rules are pure functions over the document (`rules/*.ts`), run incrementally on every commit (affected objects only) and fully on scenario load; each conflict = {rule_id, severity, ids[], message, geometry to highlight}.
- **R12.11** Conflicts render as badges on the involved objects and highlighted geometry; a Conflicts panel lists them with filters by rule/severity/layer, click-to-zoom.
- **R12.12** Any conflict can be **acknowledged** with a note (§4.14), synced to all users; acknowledged ones show dimmed and are listed in a sheet note ("Acknowledged conflicts").
- **R12.13** Rule parameters (3" PEX clearance, 3' walkway, 80% load, loop limits, headroom clearance) are editable in Project settings and stored in `settings.rules`.
- **R12.14** The conflict count appears in the header per severity; exporting the contractor set with unacknowledged errors shows a confirm dialog and prints the list on the cover sheet.

---

## §13 Object library and custom objects

### §13.1 Built-in presets (nominal, all editable)

- **R13.1** Seeded presets with real nominal dimensions (W×D×H inches; halo; mount; ports; layer):
  - Rec: pool table 7' (93×53×32, halo 60"), 8' (100×56×32, halo 60"), 9' (112×62×32, halo 60"); sofa 84×38×34; loveseat 60×38×34; sectional (composite); recliner 36×38×40; coffee table 48×24×18; side table 22×22×24; bar stool 18×18×42; **modular island unit** 48×24×36 (snap-together, composite-able); bookshelf 36×12×72; rug 96×120×1 (image-backed); **mounted TV** 55" (48×3×28), 65" (57×3×33), 75" (66×3×38), 85" (75×3×43), wall mount z center 42"; AV rack 24×20×40.
  - Gym: power rack 53×34×90 (floor_anchored, 4 anchor points, halo 24"/48" front); half rack 48×48×90; flat bench 48×24×18; adjustable bench 52×26×20; lifting platform 96×96×1 (floor_anchored optional); dumbbell rack 72×24×32; plate tree 24×24×48; treadmill 80×36×60 (halo rear 78"); rower 96×24×36; bike 48×24×54; functional trainer 60×40×84; cable crossover 120×40×84; wall mirror panel 48×72×0.25 (wall, z 12"); rubber mat 48×72×0.75; pull-up bar (wall, z 84"); barbell (84×2×2, for halo layout).
  - Electrical: panel 14.5×4×30 (wall, z 48" bottom, 40 breaker ports); duplex outlet (wall, z 16"); 240V receptacle NEMA 6-50 / 14-50 (wall, z 16"); floor box; switch (wall, z 48"); recessed can 6" (recessed, ceiling); surface fixture; wall sconce (wall, z 66").
  - Utility/plumbing/HVAC: water heater 22" dia ×60; boiler 18×12×30 (wall); manifold 24×6×12 (wall, z 36", 8 ports); utility sink 24×20×34; floor drain 4"; hose bib; mini-split head 32×12×8 (wall, z 84"); ceiling cassette 24×24×10 (recessed); condenser 32×13×22 (floor, exterior); ERV 30×20×12 (ceiling); exhaust fan 12×12×8.
  - Sound: bookshelf speaker 8×10×14 (wall, z 72"); in-ceiling speaker 8" round (recessed); subwoofer 16×16×18; soundbar 40×4×3.
  - Annotations: walkway (rect, halo-only), text, dimension.
- **R13.2** Every preset is editable after placement (name, dims after Unlock size, mount, z, halo, ports, props); edits never change the preset unless "Update library preset" is chosen.

### §13.2 Library UI

- **R13.3** Library panel: categories, search, drag-to-canvas (drops at cursor, snapped), click-to-place; project presets appear in a "This project" category; presets show a thumbnail (image if uploaded, else a dimensioned box).

### §13.3 Custom objects

- **R13.4** Custom object tool: draw a box on the canvas (any W×D), then a dialog sets name, W×D×H (any dimension), mount, z, layer, tags, halo, ports, image; "Save to library" stores it as a project preset.
- **R13.5** Any selected object or group can be saved to the library.

### §13.4 Tags

- **R13.6** Tag chips on objects in the inspector and object list; add via typing with autocomplete; bulk-tag a multi-selection; filter the canvas by tag (non-matching objects fade to 20%); tag colors optional; tags export to the JSON datasheet and the working sheet.

### §13.5 Reference images

- **R13.7** Upload an image (PNG/JPG/WebP, ≤ 5 MB, client-side downscaled to ≤ 2048 px) to an object or preset; stored at `refs/<project>/<uuid>.<ext>`; shown in the hover popout (§7.14), inspector, library thumbnail, and the working sheet.
- **R13.8** Optional "Show image on plan" renders the image clipped to the footprint at 40% opacity (rugs, pool table felt).

---

## §14 Layers

- **R14.1** Layer semantics per §4.3 and §7.7; per-user visibility/opacity state is local, lock state is shared (committed).
- **R14.2** Layer presets for views: "Contractor: electrical" (walls + electrical + lighting), "Radiant" (walls + flooring + utility), "Furnish" (walls + furnishing + gym + sound) as one-click visibility sets, editable.

---

## §15 Real-time collaboration [LOCKED — "Figma smooth"]

### §15.1 Two tiers

- **R15.1** Ephemeral tier (broadcast, never persisted): cursors with name badges, selections, **in-flight drag/rotate/resize positions**, in-flight wall/run drawing, "typing" on comments.
- **R15.2** Durable tier (Postgres): the commit on **pointer-up** (or Enter/blur for fields). Durable state never gates interaction; the local model is updated first, then written.

### §15.2 Channel and budget

- **R15.3** One private Realtime channel per project; presence carries {user_id, name, color, scenario_id, viewport}; only members of the same scenario render each other's cursors/drags.
- **R15.4** Throttle: cursors 15 Hz, drags 20 Hz, coalesced to the latest value per object, nothing sent when idle; a moving user costs ≤ 20 msg/s; the header shows a "realtime budget" indicator when the project's monthly message estimate passes 50% (from a local counter).
- **R15.5** Transport failures degrade gracefully: if the channel is down, the app works single-user against Postgres and shows "offline collaboration".

### §15.3 Commit pipeline

- **R15.6** Every mutation is an **op** {type: create|update|delete, table, id, before, after} applied to the local store synchronously, appended to the user's undo stack, then written to Postgres (batched per pointer-up); the response's `version` is stored.
- **R15.7** After a successful write the committer broadcasts `committed` {table, id, version, row}; peers apply it if `version` is newer than their copy. Peers also subscribe to `postgres_changes` for the scenario's tables as the authoritative backstop.
- **R15.8** On reconnect or tab focus after > 30 s hidden, the scenario is refetched and diffed into the store.
- **R15.9** Same-row concurrent edits resolve **last-writer-wins** at the row; different objects never collide because each is its own row.
- **R15.10** Failed writes retry with backoff (3×), then surface a toast with "Retry" and keep the local change marked unsynced (orange dot on the object).

### §15.4 Per-user undo/redo

- **R15.11** Undo/redo is per user, an inverse-op stack in the client (`Ctrl+Z / Ctrl+Shift+Z`), cleared on scenario switch; undo applies the inverse as a new commit (LWW). If the row's current `version` differs from the op's recorded `after.version`, the undo still applies but a toast says "Undid over <name>'s newer change".
- **R15.12** There is no global undo.

### §15.5 Presence UI

- **R15.13** Avatars/names of online members in the header; clicking one jumps to their viewport (once, not follow); a member's selection shows their color outline and name.

### §15.6 Activity

- **R15.14** An activity feed (last 200 commits per scenario, derived from `updated_by/updated_at` and an `activity` table written by a trigger) shows who changed what, with click-to-zoom.

---

## §16 Scenarios and snapshots [LOCKED]

- **R16.1** Scenario panel: list (name, created by, primary star, archived), **Fork** (copies all scenario-scoped rows from the current scenario, names "Copy of …", takes an `auto_fork` snapshot of the source first), Rename, Switch, Promote to primary, Archive/Unarchive, Delete (archived only, confirm).
- **R16.2** Each user has their own current scenario (URL); cursors show only within the same scenario; the header shows which members are in which scenario.
- **R16.3** Ghost overlay: toggle another scenario to render as dashed ghosts under the current one (read-only) for visual comparison.
- **R16.4** Scenario diff panel: objects/walls/runs added, removed, moved/resized (by id match), and cost delta, between any two scenarios.
- **R16.5** Snapshots: "Snapshot…" names and stores the current scenario payload (§18.4 shape); list with name, kind, author, time, size; **Restore** always creates a **new scenario** from the payload (auto-snapshotting nothing is overwritten); Delete snapshot (editor, confirm).
- **R16.6** Comments are per scenario (§4.9); the working sheet (§18.3) lists scenarios and their open comments.

---

## §17 Comments (point and object)

- **R17.1** Comment tool: click a point (pin at x,y) or click an object (pin follows the object); pins render on the `annotations` layer with an unread/open count; resolved pins hide unless "Show resolved".
- **R17.2** Threads: body (plain text, 2,000 chars), replies, resolve/reopen, delete own; author name/color from membership; realtime updates via `postgres_changes`.
- **R17.3** Comments panel: list by newest/unresolved/mine, filter by layer/tag of the anchored object, click-to-zoom; hovering a pin shows the first line.
- **R17.4** Comments export to the working sheet grouped by scenario with anchor descriptions ("on Power rack", "at 12'-3", 40'-0"").

---

## §18 Exports (three, all required) [LOCKED]

### §18.1 Sheet concept

- **R18.1** A **Sheet** (§4.12) is a page: paper size, orientation, scale, a view (plan / elevation of a wall / RCP, with crop and rotation), an ordered set of layers rendered in mono style, a title block, a north arrow, a graphic scale bar, general notes, and zero or more schedule blocks bound to queries (symbol legend, fixture list, circuit/panel schedule, door schedule, window schedule, radiant loop table, room finish table).
- **R18.2** Sheets are laid out in a **Sheet editor**: the view is placed and cropped on the page, schedule blocks are dragged into position, notes edited; the layout is stored on the sheet row and previewed at true page proportions.
- **R18.3** Mono style: three line weights (heavy 0.7 mm walls, medium 0.35 mm objects/runs, light 0.18 mm dimensions/hatch/grid), standard architectural symbols (door swing arcs, window sills, duplex outlet, 240 receptacle, switch, recessed light, speaker, floor drain, cleanout), hatch patterns per framing/finish, and text at 3/32" and 1/8" heights at scale.

### §18.2 Contractor sheet set (vector PDF, 1/4"=1'-0")

- **R18.4** Default sheet set per scenario, each with its own legend/schedule: **G-0** cover (project, scenario, sheet index, revision, acknowledged conflicts) · **A-1** floor plan + furniture, dimensioned (walls, openings, rooms with names/areas, furniture/gym, demo notes; door & window schedules) · **A-2..A-5** wall elevations A, B, C, D (openings with sill/head dims, wall-mounted items with z, fireplace) · **A-6+** elevations of scenario walls flagged "elevation" · **E-1** electrical (outlets, 240 receptacles, panel, circuits/home runs, panel schedule) · **E-2** reflected ceiling plan (lights, switches with switch-leg diagrams, speakers, heads) · **P-1** plumbing (nodes, cold/hot/DWV/vent/gas runs, sizes, fixture schedule) · **M-1** HVAC + radiant (heads/condenser/line sets, slab, zones, loops with spacing, manifold, loop table with lengths, insulation note) · **S-1** sound/AV (TV, speakers, rack, speaker/HDMI/low-voltage runs, cable schedule).
- **R18.5** Every sheet: title block (project name, address, owner, scenario, sheet code/title, scale, date, revision number auto-incremented per export, drawn-by), north arrow (§5.6), graphic scale bar, sheet number "n of N".
- **R18.6** Dimensions on A-1: overall room, each opening's location (center from nearest corner) and width, each new wall's position, and user-pinned dimension strings; auto-dimension is a toggle per sheet.
- **R18.7** Paper: ARCH C (18×24) default at 1/4" (the 63' plan is 15.75" long); ARCH D (24×36); ANSI B (11×17) forces 1/8" for plan sheets and 1/4" for elevations; page fit is validated and reported before export.
- **R18.8** Output: one multi-page vector PDF (jsPDF + svg2pdf.js), embedded font, text selectable, mono; also "Export single sheet"; file name `<project>-<scenario>-set-r<rev>.pdf`.
- **R18.9** Export runs on the current committed state, in a Web Worker where possible, with a progress indicator; 12 sheets export in under 10 s on a mid-range laptop (§21.4).

### §18.3 Working sheet (color, human-readable)

- **R18.10** A printable HTML report (opens in a new tab, `window.print()` to PDF) with: color plan per layer group (walls+furnish, electrical+lighting, plumbing, HVAC+radiant, sound) at fit-to-page; the object list with real dimensions, z/mount, tags, cost, product links, images (thumbnails); run lengths per system; radiant BOM; room finishes with quantities; cost totals per layer/tag/scenario with an optional budget line; open comments; scenario list with diffs vs primary; conflict list.
- **R18.11** A CSV "shopping list" (name, qty, dims, vendor, sku, url, cost, tag) is exportable from the same data.

### §18.4 JSON datasheet

- **R18.12** `Export JSON` writes `{schema_version, project, scenario, shell:{walls, openings, utility_points}, layers, objects, walls, openings, runs, circuits, slab, zones, rooms, comments, sheets, conflicts, settings}` with all dimensions in inches and derived values (areas, run lengths, circuit loads) included; the same shape is the snapshot payload (§4.11).
- **R18.13** `Import JSON` creates a new scenario (or a new project with "as new project") from a datasheet; validates schema_version and reports problems.

### §18.5 Quick exports

- **R18.14** "Export view as PNG/SVG" for the current canvas (with or without layers panel state) for chat sharing.

---

## §19 Persistence and security

### §19.1 Schema

- **R19.1** Migrations create all tables in §4 with FKs, `version/updated_at/updated_by` triggers, indexes on (scenario_id), (project_id), (wall_id), and an `activity` table fed by triggers on objects/walls/openings/runs.
- **R19.2** `project_members(project_id, user_id, access, display_name, color, last_seen_at)` with PK (project_id, user_id).

### §19.2 RPCs (SECURITY DEFINER, `search_path` pinned)

- **R19.3** `create_project(name, template)` → creates project + owner membership + tokens + seeds (§5.7); returns id and both plaintext tokens once.
- **R19.4** `claim_share_link(token)` → membership at the token's access level (upgrades view→edit, never downgrades an owner).
- **R19.5** `rotate_share_link(project_id, kind)` (owner) → new token, returns plaintext once.
- **R19.6** `fork_scenario(scenario_id, name)`, `restore_snapshot(snapshot_id, name)`, `promote_scenario(scenario_id)`, `import_datasheet(project_id, payload, as_new_project)` run server-side in one transaction.

### §19.3 RLS

- **R19.7** Helper `is_member(project_id, min_access)`; every table policy: SELECT for `view`+, INSERT/UPDATE/DELETE for `edit`+; `projects` UPDATE and `project_members` writes for `owner` only; scenario-scoped tables resolve the project via a `scenario_project(scenario_id)` stable function.
- **R19.8** `realtime.messages` policy: members may read/write topic `project:<id>` (private channel, `broadcast`+`presence`).
- **R19.9** Storage policies on `refs`: path prefix `<project_id>/` readable by members, writable by editors, 5 MB object limit, image MIME only.
- **R19.10** Anonymous users hold no privileges beyond membership rows they obtained via a token; there is no public SELECT anywhere.

### §19.4 Abuse limits

- **R19.11** `claim_share_link` is rate-limited per user (10/min) via a small `claim_attempts` table; tokens are unguessable (256-bit).

---

## §20 Build, deploy, config

- **R20.1** `.github/workflows/deploy.yml`: on push to `main` → `npm ci`, `npm test`, `npm run build` with the two `VITE_` secrets, deploy `dist/` to Pages (`actions/deploy-pages`); a PR workflow runs tests only.
- **R20.2** `vite.config.ts` sets `base` to `/recroom-planner/`; the app never uses absolute paths.
- **R20.3** `README.md` documents: Supabase project setup (enable anonymous sign-in, Google provider, create `refs` bucket, run `supabase db push`, seed), GitHub secrets, local dev, the smoke runbook (§21.5).
- **R20.4** The Supabase dashboard settings that must be enabled (anonymous sign-in, Google OAuth redirect to the Pages URL, Realtime private channels) are listed in a checked "setup" page inside the app for the owner (a self-check that calls each and reports OK/FAIL).

---

## §21 Testing and verification

### §21.1 Unit (Vitest)

- **R21.1** `geom`: units parsing/formatting, snapping, wall normalization (join/split/fuse), room detection, opening validation, transforms/rotation, halo geometry.
- **R21.2** `graph`: port matching, junction detection, connectivity queries, circuit load sums, switch-leg inference.
- **R21.3** `rules`: each §12 rule with positive/negative fixtures, including the 3" PEX clearance at rotated anchors and the 80% load boundary.
- **R21.4** `radiant`: serpentine generator (covers polygon, respects spacing, length), loop length limits, BOM sums.
- **R21.5** `sheets`: schedule queries, page-fit validation, dimension generation; `exports`: JSON round-trip (export → import → export equal).

### §21.2 Component (Vitest + Testing Library)

- **R21.6** Plan canvas: select/marquee/drag/rotate/nudge commit the expected ops; layer panel toggles; inspector edits parse feet-inches.

### §21.3 End-to-end (Playwright, against the `recroom-dev` Supabase project)

- **R21.7** Two browser contexts join via the edit link, see each other's cursors, drag the same object (LWW), undo per user, fork a scenario, comment, and export a PDF (page count and text extraction asserted).
- **R21.8** View-link context cannot write (UI disabled and RPC/RLS rejects).

### §21.4 Performance

- **R21.9** A generated 500-object/200-run scenario stays ≥ 50 fps on pan/drag (measured via `requestAnimationFrame` sampling in an e2e test) and exports the default set in < 10 s.

### §21.5 Smoke runbook (defines `[verified]`)

- **R21.10** `README.md` "Smoke" section: deploy → open the Pages URL → create Project 1 from the pool-room template → copy the edit link → open in a second browser (different profile) → verify cursors/drag/commit → draw a wall with a door → place a rack on a PEX loop and see the conflict → fork a scenario → export the contractor set and open the PDF → export the working sheet and JSON. Each step names the checklist IDs it verifies.

---

## §22 Phases (each boundary is a clean session-migration point)

| Phase | Sections | Exit gate |
|---|---|---|
| **P0 Foundation** | §2, §3, §19, §20 | Deployed to Pages; create project; join via view/edit link in two browsers; RLS e2e (R21.8) green |
| **P1 Canvas core** | §4 (schema), §5 (seed), §6, §7, §14 | Base plan renders from seed; select/marquee/drag/rotate/nudge/measure/layers/grid/snap work single-user; commits persist and reload |
| **P2 Realtime** | §15 | Two browsers: cursors, live drags, commits, LWW, per-user undo, reconnect, activity feed |
| **P3 Walls & 2.5D** | §8, §9 | Draw/edit walls, openings into walls, demo marks, shell mode, rooms/areas, four editable elevations, RCP view |
| **P4 Library & annotation** | §13, §17 | Presets, custom objects, images + hover popout, tags, groups, halos, point + object comments |
| **P5 Systems** | §10 | All system runs, magnet snap, inference queries, circuits/loads, HVAC/plumbing/sound nodes |
| **P6 Radiant** | §11 | Slab, zones, loops (freehand + serpentine), lengths, BOM |
| **P7 Conflicts** | §12 | All nine rules live, panel, acks, settings |
| **P8 Scenarios** | §16 | Fork/switch/promote/ghost/diff/snapshots/restore-as-new |
| **P9 Sheets & exports** | §18 | Sheet editor, contractor set PDF, working sheet, CSV, JSON export/import, PNG/SVG |
| **P10 Verification** | §21 | All tests green; smoke runbook executed on the deployed app; every checklist line `[verified]` |

- **R22.2** §24 features are part of the phase named on each §24 line and gate that phase's exit.
- **R22.1** Each phase ends with `/verify`-style full test run + a code-reviewer pass before `HANDOFF.md` advances to the next phase.

---

## §23 Open items (non-blocking; defaults stated)

- **R23.1** North angle (default +y) — ask the user when the first sheet is exported.
- **R23.2** Contents of the existing utility room (panel? boiler? water heater?) and where the new utility room goes — modeled by the user in a scenario; utility service entry points (§10.17) default to inside the existing utility room footprint.
- **R23.3** Wall D window unit assumed identical to Wall A's (§5.5).
- **R23.4** Door swing directions are assumed (§5.3–§5.5) and editable.
- **R23.5** Title-block address/owner fields are blank until set in Project settings.

---

## §24 Additional features (confirmed by the user 2026-09-12)

Each is a full requirement, built in the phase named in parentheses (see §22).

- **R24.1** **TV viewing cone & seating check** (P4): TV objects show a viewing-angle cone (setting, default 30° half-angle) and distance rings by size (1.5×–2.5× diagonal); seating outside the cone gets an info-level conflict.
- **R24.2** **Lighting coverage** (P5): recessed/surface fixtures render an approximate floor footprint by beam angle and mount height; per-room lumens/sqft shown against a target (setting).
- **R24.3** **Speaker geometry** (P5): a "listening position" object; L/R speakers show the stereo triangle and distances; surround angles per ITU as guides.
- **R24.4** **Bar-path / barbell halo** (P4): rack and bench presets include a 7'-2" barbell halo (plate-loading clearance) in the built-in halo set.
- **R24.5** **Outlet spacing code hint** (P7): NEC-style advisory rule — no point along a wall more than 6' from a 120V receptacle; GFCI flag within 6' of a sink.
- **R24.6** **Trace mode** (P1): import a photo/scan (like the sketch) as a scaled, rotated, semi-transparent underlay locked beneath all layers.
- **R24.7** **Mat/tile layout** (P6): rubber-mat regions auto-tile from a chosen mat size with cut count and a stagger option.
- **R24.8** **Wall finishes & drywall/paint quantities** (P3): per-wall finish (drywall, paint color, mirror, slat wall) with sqft totals on the working sheet.
- **R24.9** **Auto-snapshot** (P8): a daily automatic snapshot when the scenario changed, keeping the last 14.
- **R24.10** **Align & distribute** (P1): align left/center/right/top/bottom and distribute evenly for a multi-selection.
- **R24.11** **Room templates** (P0): "New project from this project's shell" for planning other rooms later.
- **R24.12** **Dark mode** (P1): theme toggle, exports unaffected.
