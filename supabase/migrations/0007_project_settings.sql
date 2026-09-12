-- Editors may change project settings keys (underlay, north angle, rule parameters) without owner rights (R24.6, R12.13).
create or replace function set_project_setting(p_project uuid, p_key text, p_value jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v jsonb;
begin
  if not is_member(p_project, 'edit') then raise exception 'edit access required'; end if;
  if p_value is null then
    update projects set settings = settings - p_key where id = p_project returning settings into v;
  else
    update projects set settings = settings || jsonb_build_object(p_key, p_value) where id = p_project returning settings into v;
  end if;
  return v;
end $$;

grant execute on function set_project_setting(uuid, text, jsonb) to authenticated;
