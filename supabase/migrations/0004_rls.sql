create or replace function access_rank(a access_level) returns int
language sql immutable as $$
  select case a when 'view' then 1 when 'edit' then 2 when 'owner' then 3 end
$$;

create or replace function is_member(p uuid, min_access access_level) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from project_members m
    where m.project_id = p and m.user_id = auth.uid()
      and access_rank(m.access) >= access_rank(min_access)
  )
$$;

-- Generic member policies: <tbl> is guarded by is_member(<project_expr>, ...).
create or replace function apply_member_policies(tbl text, project_expr text) returns void
language plpgsql as $$
begin
  execute format('alter table %I enable row level security', tbl);
  execute format('create policy %I on %I for select to authenticated using (is_member(%s, ''view''))', tbl || '_select', tbl, project_expr);
  execute format('create policy %I on %I for insert to authenticated with check (is_member(%s, ''edit''))', tbl || '_insert', tbl, project_expr);
  execute format('create policy %I on %I for update to authenticated using (is_member(%s, ''edit'')) with check (is_member(%s, ''edit''))', tbl || '_update', tbl, project_expr, project_expr);
  execute format('create policy %I on %I for delete to authenticated using (is_member(%s, ''edit''))', tbl || '_delete', tbl, project_expr);
end $$;

-- projects: members read; owner updates/deletes; inserts only via create_project RPC.
alter table projects enable row level security;
create policy projects_select on projects for select to authenticated using (is_member(id, 'view'));
create policy projects_update on projects for update to authenticated using (is_member(id, 'owner')) with check (is_member(id, 'owner'));
create policy projects_delete on projects for delete to authenticated using (is_member(id, 'owner'));

-- project_members: members read; owner writes; self-service via RPCs.
alter table project_members enable row level security;
create policy members_select on project_members for select to authenticated using (is_member(project_id, 'view'));
create policy members_insert on project_members for insert to authenticated with check (is_member(project_id, 'owner'));
create policy members_update on project_members for update to authenticated using (is_member(project_id, 'owner')) with check (is_member(project_id, 'owner'));
create policy members_delete on project_members for delete to authenticated using (is_member(project_id, 'owner'));

-- project-scoped
select apply_member_policies('scenarios', 'project_id');
select apply_member_policies('layers', 'project_id');
select apply_member_policies('walls', 'project_id');
select apply_member_policies('openings', 'wall_project(wall_id)');

-- presets: built-ins (project_id null) readable by everyone signed in; project presets member-scoped.
alter table presets enable row level security;
create policy presets_select on presets for select to authenticated using (project_id is null or is_member(project_id, 'view'));
create policy presets_insert on presets for insert to authenticated with check (project_id is not null and is_member(project_id, 'edit'));
create policy presets_update on presets for update to authenticated using (project_id is not null and is_member(project_id, 'edit')) with check (project_id is not null and is_member(project_id, 'edit'));
create policy presets_delete on presets for delete to authenticated using (project_id is not null and is_member(project_id, 'edit'));

-- scenario-scoped
select apply_member_policies('scenario_wall_states', 'scenario_project(scenario_id)');
select apply_member_policies('object_groups', 'scenario_project(scenario_id)');
select apply_member_policies('objects', 'scenario_project(scenario_id)');
select apply_member_policies('circuits', 'scenario_project(scenario_id)');
select apply_member_policies('slabs', 'scenario_project(scenario_id)');
select apply_member_policies('zones', 'scenario_project(scenario_id)');
select apply_member_policies('runs', 'scenario_project(scenario_id)');
select apply_member_policies('rooms', 'scenario_project(scenario_id)');
select apply_member_policies('snapshots', 'scenario_project(scenario_id)');
select apply_member_policies('sheets', 'scenario_project(scenario_id)');
select apply_member_policies('conflict_acks', 'scenario_project(scenario_id)');

-- comments: editors write; delete own only (R17.2).
alter table comments enable row level security;
create policy comments_select on comments for select to authenticated using (is_member(scenario_project(scenario_id), 'view'));
create policy comments_insert on comments for insert to authenticated with check (is_member(scenario_project(scenario_id), 'edit') and author_id = auth.uid());
create policy comments_update on comments for update to authenticated using (is_member(scenario_project(scenario_id), 'edit')) with check (is_member(scenario_project(scenario_id), 'edit'));
create policy comments_delete on comments for delete to authenticated using (author_id = auth.uid() and is_member(scenario_project(scenario_id), 'edit'));

-- activity: read-only for members; rows come from the security-definer trigger.
alter table activity enable row level security;
create policy activity_select on activity for select to authenticated using (is_member(project_id, 'view'));

-- claim_attempts: no policies -> only reachable from security-definer RPCs.
alter table claim_attempts enable row level security;

-- Realtime private channels: topic 'project:<uuid>' for members (viewers may broadcast cursors).
create policy realtime_members_read on realtime.messages for select to authenticated
  using (realtime.topic() like 'project:%' and is_member(substring(realtime.topic() from 9)::uuid, 'view'));
create policy realtime_members_write on realtime.messages for insert to authenticated
  with check (realtime.topic() like 'project:%' and is_member(substring(realtime.topic() from 9)::uuid, 'view'));

-- Storage: bucket refs, path <project_id>/<file>.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('refs', 'refs', false, 5242880, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do nothing;

create policy refs_select on storage.objects for select to authenticated
  using (bucket_id = 'refs' and is_member((storage.foldername(name))[1]::uuid, 'view'));
create policy refs_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'refs' and is_member((storage.foldername(name))[1]::uuid, 'edit'));
create policy refs_update on storage.objects for update to authenticated
  using (bucket_id = 'refs' and is_member((storage.foldername(name))[1]::uuid, 'edit'));
create policy refs_delete on storage.objects for delete to authenticated
  using (bucket_id = 'refs' and is_member((storage.foldername(name))[1]::uuid, 'edit'));
