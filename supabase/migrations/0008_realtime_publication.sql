-- postgres_changes backstop (R15.7): stream the scenario tables through the supabase_realtime publication.
-- RLS on each table still decides which rows a subscriber sees (R2.5); deletes carry only the primary key.
do $$
declare t text;
begin
  foreach t in array array['objects', 'object_groups', 'walls', 'openings', 'layers', 'slabs', 'scenario_wall_states'] loop
    if not exists (
      select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table %I', t);
    end if;
  end loop;
end $$;
