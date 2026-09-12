-- R5.17: seed the confirmed pool-room shell (SPEC §5). Coordinates per §0.1 (inches; interior faces at
-- x=0 / x=348 and y=0 / y=756; centerlines half a thickness outside). Opening offset = distance from wall point A.

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

  -- Wall A: twelve nominal 3'x5' windows, centers 4' + 5'k, sill 1'-0" (R5.3). offset = center - 18 + 3.
  insert into openings (wall_id, kind, "offset", width, sill, head, swing, hinge, label, props)
  select wa, 'window', (48 + 60 * k) - 18 + 3, 36, 12, 72, 'none', 'none', 'W' || (k + 1),
         jsonb_build_object('unverified', true, 'unit', 'nominal 3x5 single-hung')
  from generate_series(0, 11) as k;

  -- Wall B (R5.4–R5.8). offset = start_y + 3.
  insert into openings (wall_id, kind, "offset", width, sill, head, swing, hinge, label, props) values
    (wb, 'door',        12 + 3,  36, 0,  80, 'out', 'a_side', 'Bathroom',      '{"unverified":true}'),
    (wb, 'double_door', 174 + 3, 72, 0,  80, 'in',  'none',   'Double door 1', '{"unverified":true}'),
    (wb, 'fireplace',   339 + 3, 66, 30, 72, 'none','none',   'Fireplace',     '{"flush":true}'),
    (wb, 'double_door', 504 + 3, 72, 0,  80, 'in',  'none',   'Double door 2', '{"unverified":true}'),
    (wb, 'door',        672 + 3, 36, 0,  80, 'in',  'a_side', 'Hall',          '{"unverified":true}');

  -- Wall C (R5.9, R5.11). offset = start_x + 3.
  insert into openings (wall_id, kind, "offset", width, sill, head, swing, hinge, label, props) values
    (wc, 'window', 24 + 3,  36, 12, 72, 'none', 'none',   'W13',  '{"unit":"nominal 3x5 single-hung"}'),
    (wc, 'door',   288 + 3, 36, 0,  80, 'out',  'a_side', 'Door', '{"unverified":true}');

  -- Wall D (R5.12, R5.13).
  insert into openings (wall_id, kind, "offset", width, sill, head, swing, hinge, label, props) values
    (wd, 'slider', 192 + 3, 96, 0,  80, 'none', 'none', 'Slider (exterior)', '{"exterior":true}'),
    (wd, 'window', 72 + 3,  36, 12, 72, 'none', 'none', 'W14',               '{"unverified":true,"unit":"assumed same"}');

  -- Existing utility room (R5.10): stepped enclosure off Wall C, interior 4.5" walls, demolished per scenario.
  insert into walls (project_id, scope, ax, ay, bx, by, thickness, framing, height, state, layer_id, label) values
    (p_project, 'shell', 114, 0,  114, 60, 4.5, 'existing_unknown', 112, 'existing', v_layer, 'Utility room'),
    (p_project, 'shell', 114, 60, 132, 60, 4.5, 'existing_unknown', 112, 'existing', v_layer, 'Utility room'),
    (p_project, 'shell', 132, 60, 132, 84, 4.5, 'existing_unknown', 112, 'existing', v_layer, 'Utility room'),
    (p_project, 'shell', 132, 84, 228, 84, 4.5, 'existing_unknown', 112, 'existing', v_layer, 'Utility room'),
    (p_project, 'shell', 228, 84, 228, 60, 4.5, 'existing_unknown', 112, 'existing', v_layer, 'Utility room'),
    (p_project, 'shell', 228, 60, 246, 60, 4.5, 'existing_unknown', 112, 'existing', v_layer, 'Utility room'),
    (p_project, 'shell', 246, 60, 246, 0,  4.5, 'existing_unknown', 112, 'existing', v_layer, 'Utility room');

  -- Default slab = room minus utility room (R4.22).
  insert into slabs (scenario_id, polygon, thickness, insulation, vapor_barrier)
  values (v_scn, '[[0,0],[114,0],[114,60],[132,60],[132,84],[228,84],[228,60],[246,60],[246,0],[348,0],[348,756],[0,756]]'::jsonb,
          4, '{"type":"XPS","r_value":10,"thickness_in":2}'::jsonb, true);

  -- Default sheet set (R18.4); layouts populated in P9.
  insert into sheets (scenario_id, code, title, paper, scale, view, layers, sort) values
    (v_scn, 'G-0', 'Cover',                  'ARCH_C', '1/4', '{"kind":"cover"}'::jsonb, '{}', 0),
    (v_scn, 'A-1', 'Floor plan + furniture', 'ARCH_C', '1/4', '{"kind":"plan"}'::jsonb, '{walls,furnishing,gym,annotations}', 1),
    (v_scn, 'A-2', 'Elevation - Wall A',     'ARCH_C', '1/4', jsonb_build_object('kind', 'elevation', 'wall_id', wa), '{walls}', 2),
    (v_scn, 'A-3', 'Elevation - Wall B',     'ARCH_C', '1/4', jsonb_build_object('kind', 'elevation', 'wall_id', wb), '{walls}', 3),
    (v_scn, 'A-4', 'Elevation - Wall C',     'ARCH_C', '1/4', jsonb_build_object('kind', 'elevation', 'wall_id', wc), '{walls}', 4),
    (v_scn, 'A-5', 'Elevation - Wall D',     'ARCH_C', '1/4', jsonb_build_object('kind', 'elevation', 'wall_id', wd), '{walls}', 5),
    (v_scn, 'E-1', 'Electrical',             'ARCH_C', '1/4', '{"kind":"plan"}'::jsonb, '{walls,electrical,utility}', 6),
    (v_scn, 'E-2', 'Reflected ceiling plan', 'ARCH_C', '1/4', '{"kind":"rcp"}'::jsonb, '{walls,lighting,sound,hvac}', 7),
    (v_scn, 'P-1', 'Plumbing',               'ARCH_C', '1/4', '{"kind":"plan"}'::jsonb, '{walls,plumbing,utility}', 8),
    (v_scn, 'M-1', 'HVAC + radiant',         'ARCH_C', '1/4', '{"kind":"plan"}'::jsonb, '{walls,hvac,flooring,utility}', 9),
    (v_scn, 'S-1', 'Sound / AV',             'ARCH_C', '1/4', '{"kind":"plan"}'::jsonb, '{walls,sound}', 10);
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

-- Shared per-layer lock (R14.1).
alter table layers add column if not exists locked boolean not null default false;

grant execute on function create_project(text, text) to authenticated;
