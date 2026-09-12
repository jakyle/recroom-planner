# P1 Canvas Core Implementation Plan

> **Execution:** inline, task-by-task (see executing-plans). Steps use `- [ ]` checkboxes for tracking. Do NOT dispatch subagents to implement — this project executes plans inline.

**Goal:** The seeded 63'×29' shell renders on the plan canvas; single-user select / marquee / drag / rotate / resize / nudge / measure / layers / grid / snap all work; every change commits to Postgres and survives reload (SPEC §4 client model, §5, §6, §7, §14; exit gate in §22 row P1).

**Architecture:** Pure geometry modules (`src/lib/geom`) with unit tests; a document store (`src/lib/model`) holding the open scenario as reactive maps with an op-based commit pipeline (local apply first, then `repo` writes to Postgres — the only write path, R2.12); an SVG plan canvas (`src/lib/canvas`) driven by small tool objects; docked panels in `src/lib/ui`. World units are inches, +y up on screen (§0.1). Design tokens from `src/app.css` only.

**Stack:** existing (Svelte 5, supabase-js, vitest, playwright). No new runtime deps.

**Plan-writing note:** pure modules, the seed SQL, and the store carry full code below; Svelte components are specified by contract (props, behaviors, `data-test` ids) and written during execution because their bodies are long UI markup. Every contract line maps to a spec requirement.

**Brought forward from later phases (needed to exercise P1):** the custom-object dialog (R13.4 without image/library), read-only rendering of walls and openings (§9 rendering only; editing is P3), per-user undo/redo stack (R15.11, tiny once ops exist).

---

## File map

| Path | Responsibility |
|---|---|
| `supabase/migrations/0006_seed_pool_room.sql` | `seed_pool_room(project)` + `create_project` template wiring (R5.17) |
| `src/lib/geom/units.ts` | parse/format feet-inches (R6.1) |
| `src/lib/geom/transform.ts` | rotate, footprint polygon, AABB, hit tests, rect intersection (R4.11) |
| `src/lib/geom/walls.ts` | wall outline polygon, opening rect, door swing arc, point along wall (§9 render) |
| `src/lib/geom/snap.ts` | snap modes, angle snap, smart-guide candidates (R6.3–R6.6) |
| `src/lib/geom/halo.ts` | halo polygon from spec (R7.16) |
| `src/lib/model/types.ts` | domain types + op types |
| `src/lib/model/store.svelte.ts` | DocumentStore: load, select, ops, commit, undo/redo |
| `src/lib/supabase/repo.ts` | typed row CRUD for scenario/shell tables |
| `src/lib/canvas/viewport.svelte.ts` | pan/zoom state, world↔screen (R7.1) |
| `src/lib/canvas/Plan.svelte` | the SVG canvas (grid, walls, openings, objects, overlays) |
| `src/lib/canvas/tools/*.ts` | `select`, `pan`, `measure`, `object`, `text`, `walkway` |
| `src/lib/ui/ToolRail.svelte`, `LayersPanel.svelte`, `Inspector.svelte`, `ObjectsPanel.svelte`, `HoverCard.svelte`, `ContextMenu.svelte`, `ObjectDialog.svelte` | panels |
| `src/routes/Project.svelte` | mounts the canvas inside `.paper`, wires panels and keyboard |
| `tests/geom/*.test.ts`, `tests/store.test.ts` | unit |
| `e2e/canvas.spec.ts` | seed renders, drag persists across reload, marquee group move, layer toggle |

---

### Task 1: Seed the pool room (R5.1–R5.17)

**Files:** Create `supabase/migrations/0006_seed_pool_room.sql`.

- [ ] **Step 1: Write the migration.** Coordinates per §0.1: Wall A x=0, Wall B x=348, Wall C y=0, Wall D y=756 (interior faces). Centerlines sit half a thickness outside: A at x=−3, B at x=350.25, C at y=−3, D at y=759. Opening `offset` is measured from each wall's point A.

```sql
create or replace function seed_pool_room(p_project uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_layer uuid;
  v_scn uuid;
  wa uuid; wb uuid; wc uuid; wd uuid;
begin
  select id into v_layer from layers where project_id = p_project and key = 'walls';
  select id into v_scn from scenarios where project_id = p_project and is_primary limit 1;

  update projects set settings = settings || jsonb_build_object(
    'north_angle', 0, 'ceiling_in', 112,
    'window_unit', jsonb_build_object('w', 36, 'h', 60, 'sill', 12),
    'room', jsonb_build_object('w', 348, 'l', 756)
  ) where id = p_project;

  -- Shell walls (centerlines). A: x=-3 (12 windows). B: x=350.25 (doors, fireplace). C: y=-3 (utility end). D: y=759 (exterior slider).
  insert into walls (project_id, scope, ax, ay, bx, by, thickness, framing, height, state, layer_id, label)
    values (p_project, 'shell', -3, -3, -3, 759, 6, 'existing_unknown', 112, 'existing', v_layer, 'Wall A') returning id into wa;
  insert into walls (project_id, scope, ax, ay, bx, by, thickness, framing, height, state, layer_id, label)
    values (p_project, 'shell', 350.25, -3, 350.25, 759, 4.5, 'existing_unknown', 112, 'existing', v_layer, 'Wall B') returning id into wb;
  insert into walls (project_id, scope, ax, ay, bx, by, thickness, framing, height, state, layer_id, label)
    values (p_project, 'shell', -3, -3, 350.25, -3, 6, 'existing_unknown', 112, 'existing', v_layer, 'Wall C') returning id into wc;
  insert into walls (project_id, scope, ax, ay, bx, by, thickness, framing, height, state, layer_id, label)
    values (p_project, 'shell', -3, 759, 350.25, 759, 6, 'existing_unknown', 112, 'existing', v_layer, 'Wall D') returning id into wd;

  -- Wall A: twelve 36x60 windows, centers 4' + 5'k, sill 1'-0" (R5.3). offset = center - 18 + 3.
  insert into openings (wall_id, kind, "offset", width, sill, head, swing, hinge, label, props)
  select wa, 'window', (48 + 60 * k) - 18 + 3, 36, 12, 72, 'none', 'none', 'W' || (k + 1),
         jsonb_build_object('unverified', true, 'unit', 'nominal 3x5 single-hung')
  from generate_series(0, 11) as k;

  -- Wall B (R5.4–R5.8). offset = start_y + 3.
  insert into openings (wall_id, kind, "offset", width, sill, head, swing, hinge, label, props) values
    (wb, 'door',        12 + 3,  36, 0, 80, 'out', 'a_side', 'Bathroom',  '{"unverified":true}'),
    (wb, 'double_door', 174 + 3, 72, 0, 80, 'in',  'none',   'Double door 1', '{"unverified":true}'),
    (wb, 'fireplace',   339 + 3, 66, 30, 72, 'none','none',   'Fireplace', '{"flush":true}'),
    (wb, 'double_door', 504 + 3, 72, 0, 80, 'in',  'none',   'Double door 2', '{"unverified":true}'),
    (wb, 'door',        672 + 3, 36, 0, 80, 'in',  'a_side', 'Hall',      '{"unverified":true}');

  -- Wall C (R5.9, R5.11). offset = start_x + 3.
  insert into openings (wall_id, kind, "offset", width, sill, head, swing, hinge, label, props) values
    (wc, 'window', 24 + 3,  36, 12, 72, 'none', 'none', 'W13', '{"unit":"nominal 3x5 single-hung"}'),
    (wc, 'door',   288 + 3, 36, 0,  80, 'out',  'a_side', 'Door', '{"unverified":true}');

  -- Wall D (R5.12, R5.13).
  insert into openings (wall_id, kind, "offset", width, sill, head, swing, hinge, label, props) values
    (wd, 'slider', 192 + 3, 96, 0, 80, 'none', 'none', 'Slider (exterior)', '{"exterior":true}'),
    (wd, 'window', 72 + 3,  36, 12, 72, 'none', 'none', 'W14', '{"unverified":true,"unit":"assumed same"}');

  -- Existing utility room (R5.10): stepped enclosure off Wall C, interior 4.5" walls, to be demolished per scenario.
  insert into walls (project_id, scope, ax, ay, bx, by, thickness, framing, height, state, layer_id, label) values
    (p_project, 'shell', 114, 0, 114, 60, 4.5, 'existing_unknown', 112, 'existing', v_layer, 'Utility room'),
    (p_project, 'shell', 114, 60, 132, 60, 4.5, 'existing_unknown', 112, 'existing', v_layer, 'Utility room'),
    (p_project, 'shell', 132, 60, 132, 84, 4.5, 'existing_unknown', 112, 'existing', v_layer, 'Utility room'),
    (p_project, 'shell', 132, 84, 228, 84, 4.5, 'existing_unknown', 112, 'existing', v_layer, 'Utility room'),
    (p_project, 'shell', 228, 84, 228, 60, 4.5, 'existing_unknown', 112, 'existing', v_layer, 'Utility room'),
    (p_project, 'shell', 228, 60, 246, 60, 4.5, 'existing_unknown', 112, 'existing', v_layer, 'Utility room'),
    (p_project, 'shell', 246, 60, 246, 0, 4.5, 'existing_unknown', 112, 'existing', v_layer, 'Utility room');

  -- Default slab = room minus utility room (R4.22).
  insert into slabs (scenario_id, polygon, thickness, insulation, vapor_barrier)
  values (v_scn, '[[0,0],[114,0],[114,60],[132,60],[132,84],[228,84],[228,60],[246,60],[246,0],[348,0],[348,756],[0,756]]'::jsonb,
          4, '{"type":"XPS","r_value":10,"thickness_in":2}'::jsonb, true);

  -- Default sheet set (R18.4), populated by P9; rows exist so the sheet list is stable.
  insert into sheets (scenario_id, code, title, paper, scale, view, layers, sort) values
    (v_scn, 'G-0', 'Cover', 'ARCH_C', '1/4', '{"kind":"cover"}', '{}', 0),
    (v_scn, 'A-1', 'Floor plan + furniture', 'ARCH_C', '1/4', '{"kind":"plan"}', '{walls,furnishing,gym,annotations}', 1),
    (v_scn, 'A-2', 'Elevation — Wall A', 'ARCH_C', '1/4', jsonb_build_object('kind','elevation','wall_id',wa)::text::jsonb, '{walls}', 2),
    (v_scn, 'A-3', 'Elevation — Wall B', 'ARCH_C', '1/4', jsonb_build_object('kind','elevation','wall_id',wb)::text::jsonb, '{walls}', 3),
    (v_scn, 'A-4', 'Elevation — Wall C', 'ARCH_C', '1/4', jsonb_build_object('kind','elevation','wall_id',wc)::text::jsonb, '{walls}', 4),
    (v_scn, 'A-5', 'Elevation — Wall D', 'ARCH_C', '1/4', jsonb_build_object('kind','elevation','wall_id',wd)::text::jsonb, '{walls}', 5),
    (v_scn, 'E-1', 'Electrical', 'ARCH_C', '1/4', '{"kind":"plan"}', '{walls,electrical,utility}', 6),
    (v_scn, 'E-2', 'Reflected ceiling plan', 'ARCH_C', '1/4', '{"kind":"rcp"}', '{walls,lighting,sound,hvac}', 7),
    (v_scn, 'P-1', 'Plumbing', 'ARCH_C', '1/4', '{"kind":"plan"}', '{walls,plumbing,utility}', 8),
    (v_scn, 'M-1', 'HVAC + radiant', 'ARCH_C', '1/4', '{"kind":"plan"}', '{walls,hvac,flooring,utility}', 9),
    (v_scn, 'S-1', 'Sound / AV', 'ARCH_C', '1/4', '{"kind":"plan"}', '{walls,sound}', 10);
end $$;

create or replace function create_project(p_name text, p_template text default 'empty') returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_id uuid;
  v_view text := new_share_token();
  v_edit text := new_share_token();
begin
  if v_uid is null then raise exception 'not signed in'; end if;
  insert into projects (name, owner_id, view_token_hash, edit_token_hash)
  values (p_name, v_uid, hash_token(v_view), hash_token(v_edit))
  returning id into v_id;
  insert into project_members (project_id, user_id, access, color) values (v_id, v_uid, 'owner', '#e6194b');
  perform seed_layers(v_id);
  insert into scenarios (project_id, name, is_primary, created_by) values (v_id, 'Base', true, v_uid);
  if p_template = 'pool_room' then perform seed_pool_room(v_id); end if;
  return jsonb_build_object('project_id', v_id, 'view_token', v_view, 'edit_token', v_edit);
end $$;

grant execute on function create_project(text, text) to authenticated;
```

- [ ] **Step 2: Push to dev, regenerate types, push to prod.**

```powershell
npx supabase db push --yes; npm run db:types
```
then link prod, push, relink dev (passwords from the secrets file as in P0).

- [ ] **Step 3: Verify** by creating a "Pool room (63×29)" project in the browser and checking `walls` = 11 rows, `openings` = 21 rows, one slab, 11 sheets (via `supabase.from(...).select('*', {count:'exact'})` in the debug hook).

- [ ] **Step 4: Commit** `feat(db): seed_pool_room + template wiring (R5.17)`.

---

### Task 2: Units (R6.1)

**Files:** Create `src/lib/geom/units.ts`, `tests/geom/units.test.ts`.

- [ ] **Step 1: Failing tests**

```ts
import { describe, it, expect } from 'vitest';
import { formatLength, parseLength, roundToEighth } from '../../src/lib/geom/units';

describe('formatLength', () => {
  it('formats whole feet and inches', () => {
    expect(formatLength(150)).toBe(`12'-6"`);
    expect(formatLength(0)).toBe(`0'-0"`);
    expect(formatLength(756)).toBe(`63'-0"`);
    expect(formatLength(-18)).toBe(`-1'-6"`);
  });
  it('formats fractions to the eighth', () => {
    expect(formatLength(3.5)).toBe(`0'-3½"`);
    expect(formatLength(12.125)).toBe(`1'-0⅛"`);
    expect(formatLength(12.1)).toBe(`1'-0⅛"`);
  });
  it('inches-only mode', () => {
    expect(formatLength(150, { inchesOnly: true })).toBe(`150"`);
  });
});

describe('parseLength', () => {
  it('parses the accepted forms', () => {
    expect(parseLength(`12'6"`)).toBe(150);
    expect(parseLength(`12'-6"`)).toBe(150);
    expect(parseLength('12-6')).toBe(150);
    expect(parseLength('150"')).toBe(150);
    expect(parseLength("12.5'")).toBe(150);
    expect(parseLength('150')).toBe(150);
    expect(parseLength(`3½"`)).toBe(3.5);
    expect(parseLength(`0'-3 1/2"`)).toBe(3.5);
    expect(parseLength("12'")).toBe(144);
  });
  it('rejects garbage', () => {
    expect(parseLength('abc')).toBeNull();
    expect(parseLength('')).toBeNull();
  });
});

describe('roundToEighth', () => {
  it('rounds', () => {
    expect(roundToEighth(3.49)).toBe(3.5);
    expect(roundToEighth(3.06)).toBe(3.125);
  });
});
```

- [ ] **Step 2: Implementation**

```ts
const EIGHTHS = ['', '⅛', '¼', '⅜', '½', '⅝', '¾', '⅞'];
const VULGAR: Record<string, number> = { '⅛': 0.125, '¼': 0.25, '⅜': 0.375, '½': 0.5, '⅝': 0.625, '¾': 0.75, '⅞': 0.875 };

export function roundToEighth(inches: number): number {
  return Math.round(inches * 8) / 8;
}

export function formatLength(inches: number, opts: { inchesOnly?: boolean } = {}): string {
  const sign = inches < 0 ? '-' : '';
  const v = roundToEighth(Math.abs(inches));
  if (opts.inchesOnly) {
    const whole = Math.floor(v);
    const frac = EIGHTHS[Math.round((v - whole) * 8)];
    return `${sign}${whole}${frac}"`;
  }
  const feet = Math.floor(v / 12);
  const rem = v - feet * 12;
  const whole = Math.floor(rem);
  const frac = EIGHTHS[Math.round((rem - whole) * 8)];
  return `${sign}${feet}'-${whole}${frac}"`;
}

/** Accepts 12'6", 12'-6", 12-6, 150", 12.5', 150, 3½", 0'-3 1/2", 12'. Unitless = inches. Returns inches or null. */
export function parseLength(raw: string): number | null {
  let s = raw.trim().replace(/[“”]/g, '"').replace(/[‘’]/g, "'");
  if (!s) return null;
  let sign = 1;
  if (s.startsWith('-')) { sign = -1; s = s.slice(1).trim(); }
  // feet-and-inches forms
  const fi = s.match(/^(\d+(?:\.\d+)?)\s*'\s*-?\s*(.*)$/);
  if (fi) {
    const feet = parseFloat(fi[1]);
    const rest = fi[2].trim();
    if (!rest) return sign * feet * 12;
    const inches = parseInches(rest);
    return inches === null ? null : sign * (feet * 12 + inches);
  }
  const dash = s.match(/^(\d+)\s*-\s*(\d+(?:\.\d+)?)$/);
  if (dash) return sign * (parseInt(dash[1], 10) * 12 + parseFloat(dash[2]));
  const inches = parseInches(s);
  return inches === null ? null : sign * inches;
}

function parseInches(s: string): number | null {
  s = s.replace(/"$/, '').trim();
  const m = s.match(/^(\d+)?\s*(?:(\d+)\s*\/\s*(\d+)|([⅛¼⅜½⅝¾⅞]))?$/);
  if (m && (m[1] !== undefined || m[2] !== undefined || m[4] !== undefined)) {
    let v = m[1] ? parseInt(m[1], 10) : 0;
    if (m[2] && m[3]) v += parseInt(m[2], 10) / parseInt(m[3], 10);
    if (m[4]) v += VULGAR[m[4]];
    return v;
  }
  const dec = s.match(/^\d+(?:\.\d+)?$/);
  return dec ? parseFloat(s) : null;
}
```

- [ ] **Step 3: Run** `npx vitest run tests/geom/units.test.ts` → PASS. Commit.

---

### Task 3: Transforms and hit-testing (R4.11, R7.3)

**Files:** `src/lib/geom/transform.ts`, `tests/geom/transform.test.ts`.

- [ ] **Step 1: Failing tests**

```ts
import { describe, it, expect } from 'vitest';
import { footprint, aabb, pointInPolygon, polygonsIntersect, rectContainsPolygon, rotatePoint, centerOf } from '../../src/lib/geom/transform';

const box = { x: 0, y: 0, w: 100, d: 50, rot: 0 };

describe('footprint', () => {
  it('unrotated corners', () => {
    expect(footprint(box)).toEqual([[0, 0], [100, 0], [100, 50], [0, 50]]);
  });
  it('rotates about the center', () => {
    const p = footprint({ ...box, rot: 90 }).map(([x, y]) => [Math.round(x), Math.round(y)]);
    expect(p).toEqual([[75, -25], [75, 75], [25, 75], [25, -25]]);
  });
});

describe('aabb', () => {
  it('bounds a rotated box', () => {
    const b = aabb(footprint({ ...box, rot: 90 }));
    expect([Math.round(b.minX), Math.round(b.minY), Math.round(b.maxX), Math.round(b.maxY)]).toEqual([25, -25, 75, 75]);
  });
});

describe('hit tests', () => {
  it('point in polygon', () => {
    expect(pointInPolygon([10, 10], footprint(box))).toBe(true);
    expect(pointInPolygon([110, 10], footprint(box))).toBe(false);
  });
  it('polygons intersect and containment', () => {
    const other = footprint({ x: 90, y: 40, w: 30, d: 30, rot: 0 });
    expect(polygonsIntersect(footprint(box), other)).toBe(true);
    expect(polygonsIntersect(footprint(box), footprint({ x: 200, y: 0, w: 10, d: 10, rot: 0 }))).toBe(false);
    expect(rectContainsPolygon({ minX: -1, minY: -1, maxX: 101, maxY: 51 }, footprint(box))).toBe(true);
    expect(rectContainsPolygon({ minX: 0, minY: 0, maxX: 50, maxY: 50 }, footprint(box))).toBe(false);
  });
});

describe('rotatePoint / centerOf', () => {
  it('works', () => {
    expect(centerOf(box)).toEqual([50, 25]);
    const [x, y] = rotatePoint([1, 0], [0, 0], 90);
    expect([Math.round(x), Math.round(y)]).toEqual([0, 1]);
  });
});
```

- [ ] **Step 2: Implementation**

```ts
export type Pt = [number, number];
export type Poly = Pt[];
export type Box = { x: number; y: number; w: number; d: number; rot: number };
export type AABB = { minX: number; minY: number; maxX: number; maxY: number };

export const deg = (r: number) => (r * 180) / Math.PI;
export const rad = (d: number) => (d * Math.PI) / 180;

export function centerOf(b: Box): Pt {
  return [b.x + b.w / 2, b.y + b.d / 2];
}

export function rotatePoint(p: Pt, c: Pt, degrees: number): Pt {
  const a = rad(degrees);
  const cos = Math.cos(a), sin = Math.sin(a);
  const dx = p[0] - c[0], dy = p[1] - c[1];
  return [c[0] + dx * cos - dy * sin, c[1] + dx * sin + dy * cos];
}

export function footprint(b: Box): Poly {
  const corners: Poly = [[b.x, b.y], [b.x + b.w, b.y], [b.x + b.w, b.y + b.d], [b.x, b.y + b.d]];
  if (!b.rot) return corners;
  const c = centerOf(b);
  return corners.map((p) => rotatePoint(p, c, b.rot));
}

export function aabb(poly: Poly): AABB {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const [x, y] of poly) { minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y); }
  return { minX, minY, maxX, maxY };
}

export function pointInPolygon(p: Pt, poly: Poly): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if (yi > p[1] !== yj > p[1] && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function segmentsIntersect(a: Pt, b: Pt, c: Pt, d: Pt): boolean {
  const o = (p: Pt, q: Pt, r: Pt) => Math.sign((q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]));
  return o(a, b, c) !== o(a, b, d) && o(c, d, a) !== o(c, d, b);
}

export function polygonsIntersect(a: Poly, b: Poly): boolean {
  if (pointInPolygon(a[0], b) || pointInPolygon(b[0], a)) return true;
  for (let i = 0; i < a.length; i++)
    for (let j = 0; j < b.length; j++)
      if (segmentsIntersect(a[i], a[(i + 1) % a.length], b[j], b[(j + 1) % b.length])) return true;
  return false;
}

export function rectToPoly(r: AABB): Poly {
  return [[r.minX, r.minY], [r.maxX, r.minY], [r.maxX, r.maxY], [r.minX, r.maxY]];
}

export function rectContainsPolygon(r: AABB, poly: Poly): boolean {
  return poly.every(([x, y]) => x >= r.minX && x <= r.maxX && y >= r.minY && y <= r.maxY);
}

export function dist(a: Pt, b: Pt): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1]);
}

export function polygonArea(poly: Poly): number {
  let s = 0;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) s += (poly[j][0] + poly[i][0]) * (poly[j][1] - poly[i][1]);
  return Math.abs(s / 2);
}
```

- [ ] **Step 3: Run → PASS. Commit.**

---

### Task 4: Wall rendering geometry (§9 render subset)

**Files:** `src/lib/geom/walls.ts`, `tests/geom/walls.test.ts`.

- [ ] **Step 1: Failing tests**

```ts
import { describe, it, expect } from 'vitest';
import { wallOutline, pointAlong, openingRect, swingArc, wallLength } from '../../src/lib/geom/walls';

const wall = { ax: 0, ay: 0, bx: 100, by: 0, thickness: 6 };

describe('walls', () => {
  it('length and point along', () => {
    expect(wallLength(wall)).toBe(100);
    expect(pointAlong(wall, 25)).toEqual([25, 0]);
  });
  it('outline is a rectangle around the centerline', () => {
    expect(wallOutline(wall)).toEqual([[0, -3], [100, -3], [100, 3], [0, 3]]);
  });
  it('opening rect sits in the wall', () => {
    const r = openingRect(wall, { offset: 10, width: 36 });
    expect(r).toEqual([[10, -3], [46, -3], [46, 3], [10, 3]]);
  });
  it('door swing arc quarter circle from hinge', () => {
    const arc = swingArc(wall, { offset: 10, width: 36, swing: 'in', hinge: 'a_side' }, 1);
    expect(arc.hinge).toEqual([10, 0]);
    expect(Math.round(arc.end[0])).toBe(10);
    expect(Math.round(arc.end[1])).toBe(36);
    expect(arc.path).toContain('A 36 36');
  });
});
```

- [ ] **Step 2: Implementation**

```ts
import type { Pt, Poly } from './transform';

export type WallSeg = { ax: number; ay: number; bx: number; by: number; thickness: number };
export type OpeningGeom = { offset: number; width: number; swing?: 'in' | 'out' | 'none'; hinge?: 'a_side' | 'b_side' | 'none' };

export function wallLength(w: WallSeg): number {
  return Math.hypot(w.bx - w.ax, w.by - w.ay);
}

export function wallDir(w: WallSeg): Pt {
  const l = wallLength(w) || 1;
  return [(w.bx - w.ax) / l, (w.by - w.ay) / l];
}

/** Left-hand normal of A→B; "in" swings toward +normal when insideSign = 1. */
export function wallNormal(w: WallSeg): Pt {
  const [dx, dy] = wallDir(w);
  return [-dy, dx];
}

export function pointAlong(w: WallSeg, t: number): Pt {
  const [dx, dy] = wallDir(w);
  return [w.ax + dx * t, w.ay + dy * t];
}

export function wallOutline(w: WallSeg): Poly {
  const [nx, ny] = wallNormal(w);
  const h = w.thickness / 2;
  return [
    [w.ax + nx * h, w.ay + ny * h],
    [w.bx + nx * h, w.by + ny * h],
    [w.bx - nx * h, w.by - ny * h],
    [w.ax - nx * h, w.ay - ny * h],
  ];
}

export function openingRect(w: WallSeg, o: OpeningGeom): Poly {
  const [nx, ny] = wallNormal(w);
  const h = w.thickness / 2;
  const a = pointAlong(w, o.offset), b = pointAlong(w, o.offset + o.width);
  return [[a[0] + nx * h, a[1] + ny * h], [b[0] + nx * h, b[1] + ny * h], [b[0] - nx * h, b[1] - ny * h], [a[0] - nx * h, a[1] - ny * h]];
}

/** insideSign: +1 if the room interior lies on the +normal side of the wall, −1 otherwise. */
export function swingArc(w: WallSeg, o: OpeningGeom, insideSign: 1 | -1): { hinge: Pt; end: Pt; path: string; leaf: [Pt, Pt] } {
  const [dx, dy] = wallDir(w);
  const [nx, ny] = wallNormal(w);
  const side = (o.swing === 'out' ? -1 : 1) * insideSign;
  const hingeAtA = o.hinge !== 'b_side';
  const hinge = pointAlong(w, hingeAtA ? o.offset : o.offset + o.width);
  const dir: Pt = hingeAtA ? [dx, dy] : [-dx, -dy];
  const r = o.width;
  const leafEnd: Pt = [hinge[0] + nx * side * r, hinge[1] + ny * side * r];
  const arcStart: Pt = [hinge[0] + dir[0] * r, hinge[1] + dir[1] * r];
  const sweep = ((dir[0] * (nx * side) * 0 + 1) && (dir[0] * ny * side - dir[1] * nx * side) > 0) ? 1 : 0;
  const path = `M ${arcStart[0]} ${arcStart[1]} A ${r} ${r} 0 0 ${sweep} ${leafEnd[0]} ${leafEnd[1]}`;
  return { hinge, end: leafEnd, path, leaf: [hinge, leafEnd] };
}

/** Which side of a shell wall the room is on: for the seeded room the interior is the side containing (174, 378). */
export function insideSignFor(w: WallSeg, interiorPoint: Pt): 1 | -1 {
  const [nx, ny] = wallNormal(w);
  const v: Pt = [interiorPoint[0] - w.ax, interiorPoint[1] - w.ay];
  return v[0] * nx + v[1] * ny >= 0 ? 1 : -1;
}
```

- [ ] **Step 3: Run → PASS (adjust the `sweep` expectation only if the arc renders mirrored in the browser; the leaf line is the visual contract). Commit.**

---

### Task 5: Snapping and guides (R6.2–R6.6)

**Files:** `src/lib/geom/snap.ts`, `tests/geom/snap.test.ts`.

- [ ] **Step 1: Failing tests**

```ts
import { describe, it, expect } from 'vitest';
import { snapValue, snapAngle, guideCandidates, applyGuides, type SnapMode } from '../../src/lib/geom/snap';

describe('snapValue', () => {
  it('grid = 12", fine = 1", free = none', () => {
    expect(snapValue(17, 'grid')).toBe(12);
    expect(snapValue(17.6, 'fine')).toBe(18);
    expect(snapValue(17.6, 'free')).toBe(17.6);
  });
});

describe('snapAngle', () => {
  it('15° default, free passthrough', () => {
    expect(snapAngle(22, false)).toBe(15);
    expect(snapAngle(22, true)).toBe(22);
    expect(snapAngle(-7, false)).toBe(0);
  });
});

describe('guides', () => {
  it('aligns an edge to a nearby edge within tolerance', () => {
    const cands = guideCandidates([{ minX: 100, minY: 0, maxX: 200, maxY: 50 }]);
    const moving = { minX: 96, minY: 300, maxX: 146, maxY: 350 };
    const r = applyGuides(moving, cands, 6);
    expect(r.dx).toBe(4);
    expect(r.dy).toBe(0);
    expect(r.guides.some((g) => g.axis === 'x' && g.at === 100)).toBe(true);
  });
  it('no snap outside tolerance', () => {
    const cands = guideCandidates([{ minX: 100, minY: 0, maxX: 200, maxY: 50 }]);
    expect(applyGuides({ minX: 80, minY: 300, maxX: 130, maxY: 350 }, cands, 6).dx).toBe(0);
  });
});
```

- [ ] **Step 2: Implementation**

```ts
import type { AABB } from './transform';

export type SnapMode = 'grid' | 'fine' | 'free';

export function snapValue(v: number, mode: SnapMode): number {
  if (mode === 'grid') return Math.round(v / 12) * 12;
  if (mode === 'fine') return Math.round(v);
  return v;
}

export function snapAngle(deg: number, free: boolean): number {
  const n = ((deg % 360) + 360) % 360;
  const v = free ? n : Math.round(n / 15) * 15;
  return v >= 360 ? v - 360 : v;
}

export type Guide = { axis: 'x' | 'y'; at: number };
export type GuideSet = { xs: number[]; ys: number[] };

/** Edge and center lines of other objects (and wall faces) become alignment candidates. */
export function guideCandidates(boxes: AABB[]): GuideSet {
  const xs: number[] = [], ys: number[] = [];
  for (const b of boxes) {
    xs.push(b.minX, b.maxX, (b.minX + b.maxX) / 2);
    ys.push(b.minY, b.maxY, (b.minY + b.maxY) / 2);
  }
  return { xs, ys };
}

/** Returns the correction (dx, dy) that aligns the moving box's edges/center to the nearest candidate within tol (world units). */
export function applyGuides(moving: AABB, cands: GuideSet, tol: number): { dx: number; dy: number; guides: Guide[] } {
  const mx = [moving.minX, moving.maxX, (moving.minX + moving.maxX) / 2];
  const my = [moving.minY, moving.maxY, (moving.minY + moving.maxY) / 2];
  let best: { d: number; at: number } | null = null;
  for (const m of mx) for (const c of cands.xs) { const d = c - m; if (Math.abs(d) <= tol && (!best || Math.abs(d) < Math.abs(best.d))) best = { d, at: c }; }
  const bx = best; best = null;
  for (const m of my) for (const c of cands.ys) { const d = c - m; if (Math.abs(d) <= tol && (!best || Math.abs(d) < Math.abs(best.d))) best = { d, at: c }; }
  const by = best;
  const guides: Guide[] = [];
  if (bx) guides.push({ axis: 'x', at: bx.at });
  if (by) guides.push({ axis: 'y', at: by.at });
  return { dx: bx?.d ?? 0, dy: by?.d ?? 0, guides };
}
```

- [ ] **Step 3: Run → PASS. Commit.**

---

### Task 6: Halo geometry (R7.16, R7.17)

**Files:** `src/lib/geom/halo.ts`, test in `tests/geom/halo.test.ts`.

- [ ] **Step 1: Test + implementation**

```ts
// halo.ts
import { footprint, type Box, type Poly } from './transform';
export type HaloSpec = { all?: number; front?: number; back?: number; left?: number; right?: number };
/** Uniform or per-side expansion of the object's local rect before rotation. front = +d side (top in world y), back = -d, left = -w, right = +w. */
export function haloPolygon(b: Box, h: HaloSpec): Poly {
  const l = h.left ?? h.all ?? 0, r = h.right ?? h.all ?? 0, f = h.front ?? h.all ?? 0, k = h.back ?? h.all ?? 0;
  const expanded: Box = { x: b.x - l, y: b.y - k, w: b.w + l + r, d: b.d + k + f, rot: b.rot };
  // rotate about the ORIGINAL center so the halo stays attached
  const c = [b.x + b.w / 2, b.y + b.d / 2] as const;
  const corners = footprint({ ...expanded, rot: 0 });
  return corners.map(([x, y]) => {
    const a = (b.rot * Math.PI) / 180, cos = Math.cos(a), sin = Math.sin(a);
    const dx = x - c[0], dy = y - c[1];
    return [c[0] + dx * cos - dy * sin, c[1] + dx * sin + dy * cos];
  });
}
export const BUILTIN_HALOS: Record<string, HaloSpec> = {
  pool_table: { all: 60 }, walkway: { all: 0 }, power_rack: { left: 24, right: 24, front: 48, back: 0 }, bench: { all: 24 }, treadmill: { back: 78, left: 20, right: 20, front: 0 },
};
```
Test: `haloPolygon({x:0,y:0,w:10,d:10,rot:0},{all:5})` → `[[-5,-5],[15,-5],[15,15],[-5,15]]`. Commit.

---

### Task 7: Model types, repo, store with commit pipeline and undo (R2.12, R4.9–R4.11, R7.10, R15.6, R15.11)

**Files:** `src/lib/model/types.ts`, `src/lib/supabase/repo.ts`, `src/lib/model/store.svelte.ts`, `tests/store.test.ts`.

- [ ] **Step 1: types.ts**

```ts
import type { Database } from '../supabase/database.types';
type T = Database['public']['Tables'];
export type LayerRow = T['layers']['Row'];
export type WallRow = T['walls']['Row'];
export type OpeningRow = T['openings']['Row'];
export type ObjectRow = T['objects']['Row'];
export type GroupRow = T['object_groups']['Row'];
export type WallStateRow = T['scenario_wall_states']['Row'];
export type SlabRow = T['slabs']['Row'];
export type Mount = Database['public']['Enums']['mount_kind'];

export type TableName = 'objects' | 'object_groups' | 'walls' | 'openings' | 'scenario_wall_states' | 'layers' | 'slabs';
export type RowOf<N extends TableName> = T[N]['Row'];

export type Op =
  | { type: 'create'; table: TableName; row: Record<string, unknown> }
  | { type: 'update'; table: TableName; id: string; before: Record<string, unknown>; after: Record<string, unknown> }
  | { type: 'delete'; table: TableName; id: string; row: Record<string, unknown> };

export type Batch = { ops: Op[]; label: string };

export type ObjectProps = {
  kind?: 'text' | 'dimension' | 'walkway';
  text?: string;
  points?: [number, number][];
  size_locked?: boolean;
  cost?: number; product_url?: string; vendor?: string; sku?: string; notes?: string;
  load_va?: number; voltage?: 120 | 240; ports?: unknown[]; anchor_points?: [number, number][];
  flipped?: boolean;
};
```

- [ ] **Step 2: repo.ts** — thin typed CRUD; every write returns the stored row (with `version`).

```ts
import { supabase } from './client';
import type { TableName } from '../model/types';

export async function insertRow(table: TableName, row: Record<string, unknown>) {
  const { data, error } = await supabase.from(table).insert(row as never).select('*').single();
  if (error) throw error;
  return data as Record<string, unknown>;
}
export async function updateRow(table: TableName, id: string, patch: Record<string, unknown>) {
  const { data, error } = await supabase.from(table).update(patch as never).eq('id', id).select('*').single();
  if (error) throw error;
  return data as Record<string, unknown>;
}
export async function deleteRow(table: TableName, id: string) {
  const { error } = await supabase.from(table).delete().eq('id', id);
  if (error) throw error;
}
export async function deleteWallState(scenarioId: string, wallId: string) {
  const { error } = await supabase.from('scenario_wall_states').delete().eq('scenario_id', scenarioId).eq('wall_id', wallId);
  if (error) throw error;
}
export async function loadScenario(projectId: string, scenarioId: string) {
  const [layers, shellWalls, scWalls, groups, objects, states, slab] = await Promise.all([
    supabase.from('layers').select('*').eq('project_id', projectId).order('sort'),
    supabase.from('walls').select('*').eq('project_id', projectId).eq('scope', 'shell'),
    supabase.from('walls').select('*').eq('scenario_id', scenarioId),
    supabase.from('object_groups').select('*').eq('scenario_id', scenarioId),
    supabase.from('objects').select('*').eq('scenario_id', scenarioId),
    supabase.from('scenario_wall_states').select('*').eq('scenario_id', scenarioId),
    supabase.from('slabs').select('*').eq('scenario_id', scenarioId).maybeSingle(),
  ]);
  for (const r of [layers, shellWalls, scWalls, groups, objects, states, slab]) if (r.error) throw r.error;
  const wallIds = [...(shellWalls.data ?? []), ...(scWalls.data ?? [])].map((w) => w.id);
  const openings = wallIds.length ? await supabase.from('openings').select('*').in('wall_id', wallIds) : { data: [], error: null };
  if (openings.error) throw openings.error;
  return {
    layers: layers.data ?? [], walls: [...(shellWalls.data ?? []), ...(scWalls.data ?? [])], openings: openings.data ?? [],
    groups: groups.data ?? [], objects: objects.data ?? [], wallStates: states.data ?? [], slab: slab.data ?? null,
  };
}
```

- [ ] **Step 3: store.svelte.ts** — the document store. Contract:
  - `$state` maps: `layers`, `walls`, `openings`, `objects`, `groups`, `wallStates` (keyed by id / composite), `slab`; `selection: Set<string>` (object ids); `activeLayerId`; per-user layer UI state `{visible, opacity}` (local), `locked` from... (R14.1 says lock is shared → stored in `layers.locked`? The schema has no `locked` column — add it in migration 0007: `alter table layers add column locked boolean not null default false`).
  - `load(projectId, scenarioId)`; `commit(batch)` = apply locally → push undo → write each op via repo sequentially (create → set returned id/version; update → version; delete) → on failure mark op rows `unsynced` and toast; `undo()` / `redo()` build inverse batches and commit them (LWW).
  - `apply(op)` pure-ish local mutation; `inverse(op)`.
  - Helpers: `updateObjects(ids, patchFn, label)`, `createObject(row)`, `deleteObjects(ids)`, `duplicate(ids)`, `setLayerFlag(layerId, ...)`.
  - Test `tests/store.test.ts` with an injected fake repo (constructor param) covering: create → object present; update → version bump from repo; delete; undo restores; redo reapplies; failed write flags `unsynced`.
- [ ] **Step 4: migration 0007** `alter table layers add column locked boolean not null default false;` push dev+prod, regen types.
- [ ] **Step 5: Run tests → PASS. Commit.**

---

### Task 8: Viewport and the plan canvas (R6.2, R7.1, R7.2, R7.10)

**Files:** `src/lib/canvas/viewport.svelte.ts`, `src/lib/canvas/Plan.svelte`, `src/lib/canvas/layers/*.svelte` (WallsLayer, OpeningsLayer, ObjectsLayer, Overlays).

Contract:
- Viewport state `{ scale (px per inch), tx, ty }`; `toWorld(sx, sy)`, `toScreen(wx, wy)` with y flipped (`sy = ty − wy·scale`); `zoomAt(screenPt, factor)` clamped 10–400 px/ft (i.e. 0.833–33.3 px/in); `fitTo(aabb, padding)`; `pan(dx, dy)`; persisted per project in localStorage.
- `Plan.svelte` props: `store`, `viewport`, `tool`, `settings` (grid on/off, snap mode, show halos). Renders one `<svg>` filling `.paper`, a `<g transform="matrix(scale 0 0 -scale tx ty)">` world group; grid via two `<pattern>`s (12" major always; 1" minor only when `scale*12 ≥ 24`); shell walls (`wallOutline` polygons, dashed when demo), openings (window: sill line + break; door: leaf + swing arc; slider: two offset leaves; fireplace: hatched box), objects per layer `<g data-layer>` with opacity/visibility, each object a `<g class="obj" data-id>` with rect + name label (label counter-rotated, hidden below 6 px/ft), selection outline + handles, marquee rect, guide lines, measure overlay, hover target. Pointer events: `pointerdown/move/up` delegated to `tool.on*`; wheel = zoom at cursor; space+drag / middle-drag / two-pointer = pan/pinch.
- Emits `cursor` world coordinates to the status strip.
- Perf: objects rendered from a `$derived` sorted array; no per-object filters; text labels are plain `<text>`.

- [ ] Build; verify the seeded shell renders (11 walls, 21 openings) with grid, pan, zoom, fit. Commit.

---

### Task 9: Select tool (R7.3–R7.9, R6.3–R6.6)

**Files:** `src/lib/canvas/tools/select.ts`, `src/lib/canvas/tools/types.ts`.

Contract (`Tool` interface: `onPointerDown/Move/Up(ev, ctx)`, `onKey(ev, ctx)`, `cursor`, `overlay` state):
- Click selects topmost object (hit test via `pointInPolygon` on footprint, respecting layer visible/locked and object `locked`); shift-click toggles; click empty = clear; **drag on empty = marquee** (right-drag intersect, left-drag enclosed).
- Drag selected = move all selected; position snapped per mode (`Alt` = free, `Shift` = axis lock); smart guides applied with 6 px tolerance converted to world units; live readout of position; wall-mounted objects (`mount = wall|recessed`) slide along their wall face (`wall_id`).
- Handles on single selection: 8 resize (only if `!props.size_locked`), 1 rotate above the box; multi-selection: move + rotate about centroid.
- Rotate: angle from center, `snapAngle` (Alt = free), readout shows angle + rotated bbox dims.
- Keys: arrows nudge 1" (Shift 12"); `Ctrl+D` duplicate (+12" offset); `R` rotate mode (drag rotates); `F` flip (`rot = -rot`, toggles `props.flipped`); `Delete/Backspace` delete; `Esc` clear; `Ctrl+A` select all on active layer; `Tab` cycle overlapping under the cursor; `Ctrl+Z`/`Ctrl+Shift+Z` undo/redo; `G` grid; `S` snap mode cycle; `H` halos.
- Commit on pointer-up only (R7.10); during drag mutate a local `dragPreview` map that `Plan.svelte` overlays.

- [ ] Build; verify in browser; commit.

---

### Task 10: Other tools (R7.11–R7.13, R13.4 subset)

- `pan.ts`: drag pans.
- `measure.ts`: click-click distance (feet-inches + dx/dy), chain clicks for polyline length, click first point again to close → area; `Enter`/`Esc` ends; "Pin" button in the overlay stores a `dimension` annotation object (`props.kind='dimension'`, `points`).
- `object.ts`: drag a box → opens `ObjectDialog` (name, W×D×H via `parseLength`, mount, z, layer, tags) → creates object on the active layer with `size_locked=false`.
- `text.ts`: click → text annotation; `walkway.ts`: drag a rect → walkway object (halo-only).
- `ToolRail.svelte`: buttons with keys `V` select, `Space/M` pan, `X` measure, `O` object, `T` text, `W` walkway; disabled tools for later phases shown greyed with a tooltip naming the phase.

- [ ] Build; verify; commit.

---

### Task 11: Panels (R7.4, R7.14, R7.15, R7.18–R7.21, R14.1, R14.2)

- `LayersPanel.svelte`: rows with eye (alt-click solo), lock (shared via `layers.locked`), opacity slider, color swatch, count; active layer radio; view presets dropdown (Contractor: electrical / Radiant / Furnish / All) editable in localStorage.
- `Inspector.svelte`: for the selection — name, layer, W×D×H (feet-inches inputs, `size_locked` toggle "Unlock size"), x/y/z, rotation, mount (+ wall picker when wall/recessed), tags (chips + autocomplete), locked, halo (all/per-side), notes/cost/url; multi-select shows counts + bulk layer/tag/lock.
- `ObjectsPanel.svelte`: search by name/tag, filter by layer/mount, sort, click → select + zoom-to; bulk tag/layer/delete on the filtered set.
- `HoverCard.svelte`: 400 ms hover → name, W×D×H, z/mount, tags, cost/url, comments count (0).
- `ContextMenu.svelte`: Duplicate, Group/Ungroup, Lock/Unlock, Send to layer ▸, Add tag…, Save to library (disabled, P4), Add comment (disabled, P4), Bring to front / Send to back, Delete.
- Groups: `object_groups` rows; grouped objects select together; ungroup clears `group_id`.
- Status strip: live cursor (feet-inches), snap mode, zoom (px/ft), grid on/off, unsynced count.

- [ ] Build; verify; commit.

---

### Task 12: Project route integration + e2e

- `Project.svelte`: create `DocumentStore` + viewport on scenario load; render `<Plan>` inside `.paper`; dock = Layers, Inspector/Objects tabs, Scenarios, Share, People; keyboard handler at the shell level (ignored while typing in inputs).
- `e2e/canvas.spec.ts`: create pool-room project → `[data-test=wall]` count 11 and `[data-test=opening]` count 21; place an object via the Object tool (drag + dialog) → drag it 5' right → reload → position persisted (`data-x` attribute); marquee two objects → drag → both moved; toggle furnishing layer eye → objects hidden; undo restores position.
- Update `e2e/smoke.spec.ts` to use the pool-room template and assert the walls render.

- [ ] Run unit + e2e; deploy; live smoke; mark CHECKLIST (`[coded]` → `[verified]` per smoke); update HANDOFF → next: P2 Realtime (§15). Commit.

---

## Self-review

- **Coverage:** §5 all → Task 1; R6.1 → T2; R6.2 → T8; R6.3–R6.6 → T5/T9; R7.1–R7.2 → T8; R7.3–R7.10 → T9; R7.11–R7.13 → T10; R7.14–R7.15 → T11; R7.16–R7.17 → T6/T9; R7.18–R7.21 → T11; R7.22 → T8 (pointer events + `?` overlay in T11); R14.1–R14.2 → T11; R4.9–R4.11 → T7; R2.12 → T7.
- **Types:** `Box` = `{x,y,w,d,rot}` matches `ObjectRow` fields; `TableName` union used by repo and ops; `SnapMode` shared by snap.ts, store settings, status strip.
- **Placeholders:** component contracts are deliberate (see header); no TBDs.
