create or replace function new_share_token() returns text
language sql volatile as $$
  select translate(encode(extensions.gen_random_bytes(32), 'base64'), '+/=', '-_')
$$;

create or replace function hash_token(t text) returns text
language sql immutable as $$
  select encode(extensions.digest(t, 'sha256'), 'hex')
$$;

create or replace function seed_layers(p_project uuid) returns void
language sql security definer set search_path = public as $$
  insert into layers (project_id, key, name, color, sort, builtin) values
    (p_project, 'walls',       'Shell & Walls',      '#222222', 0,  true),
    (p_project, 'utility',     'Utility',            '#6b4e16', 1,  true),
    (p_project, 'flooring',    'Flooring & Radiant', '#c0392b', 2,  true),
    (p_project, 'plumbing',    'Plumbing',           '#1f77b4', 3,  true),
    (p_project, 'electrical',  'Electrical',         '#e6a100', 4,  true),
    (p_project, 'lighting',    'Lighting',           '#f1c40f', 5,  true),
    (p_project, 'hvac',        'HVAC',               '#16a085', 6,  true),
    (p_project, 'sound',       'Sound & AV',         '#8e44ad', 7,  true),
    (p_project, 'furnishing',  'Furnishing',         '#7f8c8d', 8,  true),
    (p_project, 'gym',         'Gym',                '#2c3e50', 9,  true),
    (p_project, 'annotations', 'Annotations',        '#27ae60', 10, true)
$$;

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
  insert into project_members (project_id, user_id, access, color)
  values (v_id, v_uid, 'owner', '#e6194b');
  perform seed_layers(v_id);
  insert into scenarios (project_id, name, is_primary, created_by) values (v_id, 'Base', true, v_uid);
  -- p_template = 'pool_room' is wired to seed_pool_room() in P1 (R5.17).
  return jsonb_build_object('project_id', v_id, 'view_token', v_view, 'edit_token', v_edit);
end $$;

create or replace function claim_share_link(p_token text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_hash text := hash_token(p_token);
  v_project uuid;
  v_access access_level;
  v_count int;
  v_member_count int;
begin
  if v_uid is null then raise exception 'not signed in'; end if;
  select count(*) into v_count from claim_attempts where user_id = v_uid and at > now() - interval '1 minute';
  if v_count >= 10 then raise exception 'too many attempts, wait a minute'; end if;
  insert into claim_attempts (user_id) values (v_uid);

  select id, 'edit'::access_level into v_project, v_access from projects where edit_token_hash = v_hash;
  if v_project is null then
    select id, 'view'::access_level into v_project, v_access from projects where view_token_hash = v_hash;
  end if;
  if v_project is null then raise exception 'invalid link'; end if;

  select count(*) into v_member_count from project_members where project_id = v_project;
  insert into project_members (project_id, user_id, access, color)
  values (v_project, v_uid, v_access,
          (array['#e6194b','#3cb44b','#4363d8','#f58231','#911eb4','#42d4f4','#f032e6','#9a6324'])[(v_member_count % 8) + 1])
  on conflict (project_id, user_id) do update
    set access = case when access_rank(project_members.access) >= access_rank(excluded.access)
                      then project_members.access else excluded.access end,
        last_seen_at = now();
  select access into v_access from project_members where project_id = v_project and user_id = v_uid;
  return jsonb_build_object('project_id', v_project, 'access', v_access);
end $$;

create or replace function rotate_share_link(p_project uuid, p_kind text) returns text
language plpgsql security definer set search_path = public as $$
declare v_token text := new_share_token();
begin
  if not is_member(p_project, 'owner') then raise exception 'owner only'; end if;
  if p_kind = 'view' then
    update projects set view_token_hash = hash_token(v_token) where id = p_project;
  elsif p_kind = 'edit' then
    update projects set edit_token_hash = hash_token(v_token) where id = p_project;
  else
    raise exception 'kind must be view or edit';
  end if;
  return v_token;
end $$;

create or replace function set_display_name(p_project uuid, p_name text, p_color text default null) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_member(p_project, 'view') then raise exception 'not a member'; end if;
  update project_members
     set display_name = left(trim(p_name), 60),
         color = coalesce(p_color, color),
         last_seen_at = now()
   where project_id = p_project and user_id = auth.uid();
end $$;

create or replace function touch_last_seen(p_project uuid) returns void
language sql security definer set search_path = public as $$
  update project_members set last_seen_at = now() where project_id = p_project and user_id = auth.uid()
$$;

create or replace function build_scenario_payload(p_scenario uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_project uuid := scenario_project(p_scenario);
  v jsonb;
begin
  if not is_member(v_project, 'view') then raise exception 'not a member'; end if;
  select jsonb_build_object(
    'schema_version', 1,
    'project', (select to_jsonb(p) - 'view_token_hash' - 'edit_token_hash' from projects p where p.id = v_project),
    'scenario', (select to_jsonb(s) from scenarios s where s.id = p_scenario),
    'shell', jsonb_build_object(
      'walls', (select coalesce(jsonb_agg(to_jsonb(w)), '[]') from walls w where w.project_id = v_project and w.scope = 'shell'),
      'openings', (select coalesce(jsonb_agg(to_jsonb(o)), '[]') from openings o join walls w on w.id = o.wall_id where w.project_id = v_project and w.scope = 'shell')
    ),
    'layers', (select coalesce(jsonb_agg(to_jsonb(l) order by l.sort), '[]') from layers l where l.project_id = v_project),
    'walls', (select coalesce(jsonb_agg(to_jsonb(w)), '[]') from walls w where w.scenario_id = p_scenario),
    'wall_states', (select coalesce(jsonb_agg(to_jsonb(s)), '[]') from scenario_wall_states s where s.scenario_id = p_scenario),
    'openings', (select coalesce(jsonb_agg(to_jsonb(o)), '[]') from openings o join walls w on w.id = o.wall_id where w.scenario_id = p_scenario),
    'groups', (select coalesce(jsonb_agg(to_jsonb(g)), '[]') from object_groups g where g.scenario_id = p_scenario),
    'objects', (select coalesce(jsonb_agg(to_jsonb(o)), '[]') from objects o where o.scenario_id = p_scenario),
    'circuits', (select coalesce(jsonb_agg(to_jsonb(c)), '[]') from circuits c where c.scenario_id = p_scenario),
    'slab', (select to_jsonb(s) from slabs s where s.scenario_id = p_scenario),
    'zones', (select coalesce(jsonb_agg(to_jsonb(z)), '[]') from zones z where z.scenario_id = p_scenario),
    'runs', (select coalesce(jsonb_agg(to_jsonb(r)), '[]') from runs r where r.scenario_id = p_scenario),
    'rooms', (select coalesce(jsonb_agg(to_jsonb(r)), '[]') from rooms r where r.scenario_id = p_scenario),
    'comments', (select coalesce(jsonb_agg(to_jsonb(c)), '[]') from comments c where c.scenario_id = p_scenario),
    'sheets', (select coalesce(jsonb_agg(to_jsonb(s) order by s.sort), '[]') from sheets s where s.scenario_id = p_scenario),
    'conflict_acks', (select coalesce(jsonb_agg(to_jsonb(a)), '[]') from conflict_acks a where a.scenario_id = p_scenario),
    'exported_at', now()
  ) into v;
  return v;
end $$;

-- Fork: snapshot the source (auto_fork), then copy every scenario-scoped row with remapped ids.
create or replace function fork_scenario(p_scenario uuid, p_name text) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_project uuid := scenario_project(p_scenario);
  v_uid uuid := auth.uid();
  v_new uuid;
begin
  if not is_member(v_project, 'edit') then raise exception 'edit access required'; end if;

  insert into snapshots (scenario_id, name, kind, payload, created_by)
  values (p_scenario, 'before fork: ' || p_name, 'auto_fork', build_scenario_payload(p_scenario), v_uid);

  insert into scenarios (project_id, name, parent_scenario_id, is_primary, created_by)
  values (v_project, p_name, p_scenario, false, v_uid) returning id into v_new;

  create temp table idmap (old uuid primary key, new uuid not null) on commit drop;

  -- walls (scenario scope)
  insert into idmap select id, gen_random_uuid() from walls where scenario_id = p_scenario;
  insert into walls (id, project_id, scenario_id, scope, ax, ay, bx, by, thickness, framing, height, state, layer_id, label, include_elevation)
  select m.new, w.project_id, v_new, w.scope, w.ax, w.ay, w.bx, w.by, w.thickness, w.framing, w.height, w.state, w.layer_id, w.label, w.include_elevation
  from walls w join idmap m on m.old = w.id where w.scenario_id = p_scenario;

  insert into scenario_wall_states (scenario_id, wall_id, state)
  select v_new, wall_id, state from scenario_wall_states where scenario_id = p_scenario;

  -- openings on scenario walls
  insert into openings (wall_id, kind, "offset", width, sill, head, swing, hinge, label, props)
  select m.new, o.kind, o."offset", o.width, o.sill, o.head, o.swing, o.hinge, o.label, o.props
  from openings o join walls w on w.id = o.wall_id join idmap m on m.old = w.id where w.scenario_id = p_scenario;

  -- groups
  insert into idmap select id, gen_random_uuid() from object_groups where scenario_id = p_scenario;
  insert into object_groups (id, scenario_id, name)
  select m.new, v_new, g.name from object_groups g join idmap m on m.old = g.id where g.scenario_id = p_scenario;

  -- objects
  insert into idmap select id, gen_random_uuid() from objects where scenario_id = p_scenario;
  insert into objects (id, scenario_id, layer_id, preset_id, name, x, y, z, w, d, h, rot, mount, wall_id, group_id, z_order, tags, image_path, halo, locked, props)
  select m.new, v_new, o.layer_id, o.preset_id, o.name, o.x, o.y, o.z, o.w, o.d, o.h, o.rot, o.mount,
         coalesce((select new from idmap where old = o.wall_id), o.wall_id),
         (select new from idmap where old = o.group_id),
         o.z_order, o.tags, o.image_path, o.halo, o.locked, o.props
  from objects o join idmap m on m.old = o.id where o.scenario_id = p_scenario;

  -- circuits
  insert into idmap select id, gen_random_uuid() from circuits where scenario_id = p_scenario;
  insert into circuits (id, scenario_id, panel_object_id, slot, name, amps, voltage, pole)
  select m.new, v_new, (select new from idmap where old = c.panel_object_id), c.slot, c.name, c.amps, c.voltage, c.pole
  from circuits c join idmap m on m.old = c.id where c.scenario_id = p_scenario;

  -- slab
  insert into slabs (scenario_id, polygon, thickness, insulation, vapor_barrier, notes)
  select v_new, polygon, thickness, insulation, vapor_barrier, notes from slabs where scenario_id = p_scenario;

  -- zones
  insert into idmap select id, gen_random_uuid() from zones where scenario_id = p_scenario;
  insert into zones (id, scenario_id, name, polygon, spacing, tubing, manifold_object_id, manifold_port, design_btuh)
  select m.new, v_new, z.name, z.polygon, z.spacing, z.tubing, (select new from idmap where old = z.manifold_object_id), z.manifold_port, z.design_btuh
  from zones z join idmap m on m.old = z.id where z.scenario_id = p_scenario;

  -- runs
  insert into runs (scenario_id, layer_id, system, points, from_object_id, from_port, to_object_id, to_port, circuit_id, zone_id, props)
  select v_new, r.layer_id, r.system, r.points,
         (select new from idmap where old = r.from_object_id), r.from_port,
         (select new from idmap where old = r.to_object_id), r.to_port,
         (select new from idmap where old = r.circuit_id),
         (select new from idmap where old = r.zone_id), r.props
  from runs r where r.scenario_id = p_scenario;

  -- rooms
  insert into rooms (scenario_id, name, polygon, finish, finish_props)
  select v_new, name, polygon, finish, finish_props from rooms where scenario_id = p_scenario;

  -- open comments only (R4.27); parents before replies
  insert into idmap select id, gen_random_uuid() from comments where scenario_id = p_scenario and not resolved;
  insert into comments (id, scenario_id, anchor, x, y, object_id, parent_id, body, author_id, author_name, resolved)
  select m.new, v_new, c.anchor, c.x, c.y, (select new from idmap where old = c.object_id),
         (select new from idmap where old = c.parent_id),
         c.body || E'\n\n(copied from ' || (select name from scenarios where id = p_scenario) || ')',
         c.author_id, c.author_name, false
  from comments c join idmap m on m.old = c.id
  where c.scenario_id = p_scenario and not c.resolved
    and (c.parent_id is null or exists (select 1 from idmap where old = c.parent_id))
  order by c.parent_id nulls first;

  -- sheets
  insert into sheets (scenario_id, code, title, paper, scale, view, layers, schedules, sort)
  select v_new, code, title, paper, scale, view, layers, schedules, sort from sheets where scenario_id = p_scenario;

  -- acks
  insert into conflict_acks (scenario_id, rule_id, key, user_id, note)
  select v_new, rule_id, key, user_id, note from conflict_acks where scenario_id = p_scenario;

  return v_new;
end $$;

create or replace function promote_scenario(p_scenario uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_project uuid := scenario_project(p_scenario);
begin
  if not is_member(v_project, 'edit') then raise exception 'edit access required'; end if;
  update scenarios set is_primary = false where project_id = v_project and is_primary;
  update scenarios set is_primary = true, archived = false where id = p_scenario;
end $$;

create or replace function setup_check() returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  return jsonb_build_object(
    'signed_in', auth.uid() is not null,
    'is_anonymous', coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false),
    'pgcrypto', exists (select 1 from pg_extension where extname = 'pgcrypto'),
    'tables', (select count(*) from information_schema.tables where table_schema = 'public'),
    'bucket_refs', exists (select 1 from storage.buckets where id = 'refs'),
    'realtime_policy', exists (select 1 from pg_policies where schemaname = 'realtime' and policyname = 'realtime_members_read')
  );
end $$;

-- Lock down function execution: signed-in users get the RPCs plus the helpers that RLS policies and triggers call.
revoke execute on all functions in schema public from public, anon, authenticated;
grant execute on function
  create_project(text, text), claim_share_link(text), rotate_share_link(uuid, text),
  set_display_name(uuid, text, text), touch_last_seen(uuid), build_scenario_payload(uuid),
  fork_scenario(uuid, text), promote_scenario(uuid), setup_check(),
  is_member(uuid, access_level), access_rank(access_level), scenario_project(uuid), wall_project(uuid),
  set_version_fields(), log_activity()
  to authenticated;
