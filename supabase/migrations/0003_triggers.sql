create or replace function set_version_fields() returns trigger
language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    new.version := 1;
  else
    new.version := old.version + 1;
  end if;
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end $$;

do $$
declare t text;
begin
  foreach t in array array[
    'projects','scenarios','layers','walls','openings','presets','object_groups','objects',
    'circuits','slabs','zones','runs','rooms','comments','sheets'
  ] loop
    execute format('create trigger %I before insert or update on %I for each row execute function set_version_fields()', t || '_version', t);
  end loop;
end $$;

create or replace function scenario_project(s uuid) returns uuid
language sql stable security definer set search_path = public as $$
  select project_id from scenarios where id = s
$$;

create or replace function wall_project(w uuid) returns uuid
language sql stable security definer set search_path = public as $$
  select project_id from walls where id = w
$$;

create or replace function log_activity() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  p uuid;
  s uuid;
  nm text;
  rid uuid;
begin
  if tg_op = 'DELETE' then
    rid := old.id;
    if tg_table_name = 'walls' then p := old.project_id; s := old.scenario_id; nm := old.label;
    elsif tg_table_name = 'openings' then p := wall_project(old.wall_id); s := null; nm := old.label;
    else s := old.scenario_id; p := scenario_project(s); nm := old.name; end if;
  else
    rid := new.id;
    if tg_table_name = 'walls' then p := new.project_id; s := new.scenario_id; nm := new.label;
    elsif tg_table_name = 'openings' then p := wall_project(new.wall_id); s := null; nm := new.label;
    else s := new.scenario_id; p := scenario_project(s); nm := new.name; end if;
  end if;
  if p is null then return null; end if;
  insert into activity(project_id, scenario_id, table_name, row_id, op, user_id, summary)
  values (p, s, tg_table_name, rid, lower(tg_op), auth.uid(), jsonb_build_object('name', coalesce(nm, '')));
  return null;
end $$;

do $$
declare t text;
begin
  foreach t in array array['objects','walls','openings','runs'] loop
    execute format('create trigger %I after insert or update or delete on %I for each row execute function log_activity()', t || '_activity', t);
  end loop;
end $$;
