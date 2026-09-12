-- Versioned tables all carry: version int, updated_at, updated_by (R4.33). Trigger in 0003.

create table projects (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(name) between 1 and 120),
  owner_id uuid not null references auth.users(id) on delete restrict,
  view_token_hash text not null unique,
  edit_token_hash text not null unique,
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  version int not null default 1,
  updated_at timestamptz not null default now(),
  updated_by uuid
);

create table project_members (
  project_id uuid not null references projects(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  access access_level not null,
  display_name text not null default '' check (length(display_name) <= 60),
  color text not null default '#888888',
  joined_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  primary key (project_id, user_id)
);
create index project_members_user_idx on project_members(user_id);

create table scenarios (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  name text not null check (length(name) between 1 and 120),
  parent_scenario_id uuid references scenarios(id) on delete set null,
  is_primary boolean not null default false,
  archived boolean not null default false,
  created_by uuid,
  created_at timestamptz not null default now(),
  version int not null default 1,
  updated_at timestamptz not null default now(),
  updated_by uuid
);
create index scenarios_project_idx on scenarios(project_id);
create unique index scenarios_one_primary on scenarios(project_id) where is_primary;

create table layers (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  key text not null,
  name text not null,
  color text not null default '#444444',
  sort int not null default 0,
  builtin boolean not null default false,
  version int not null default 1,
  updated_at timestamptz not null default now(),
  updated_by uuid,
  unique (project_id, key)
);

create table walls (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  scenario_id uuid references scenarios(id) on delete cascade,
  scope wall_scope not null,
  ax double precision not null, ay double precision not null,
  bx double precision not null, by double precision not null,
  thickness double precision not null default 4.5,
  framing framing_kind not null default '2x4',
  height double precision not null default 112,
  state wall_state not null default 'new',
  layer_id uuid references layers(id) on delete set null,
  label text not null default '',
  include_elevation boolean not null default false,
  version int not null default 1,
  updated_at timestamptz not null default now(),
  updated_by uuid,
  check ((scope = 'shell' and scenario_id is null) or (scope = 'scenario' and scenario_id is not null))
);
create index walls_project_idx on walls(project_id);
create index walls_scenario_idx on walls(scenario_id);

create table scenario_wall_states (
  scenario_id uuid not null references scenarios(id) on delete cascade,
  wall_id uuid not null references walls(id) on delete cascade,
  state text not null check (state = 'demo'),
  primary key (scenario_id, wall_id)
);

create table openings (
  id uuid primary key default gen_random_uuid(),
  wall_id uuid not null references walls(id) on delete cascade,
  kind opening_kind not null,
  "offset" double precision not null,
  width double precision not null check (width > 0),
  sill double precision not null default 0,
  head double precision not null,
  swing swing_kind not null default 'none',
  hinge hinge_side not null default 'none',
  label text not null default '',
  props jsonb not null default '{}'::jsonb,
  version int not null default 1,
  updated_at timestamptz not null default now(),
  updated_by uuid
);
create index openings_wall_idx on openings(wall_id);

create table presets (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references projects(id) on delete cascade,
  name text not null,
  category text not null,
  layer_key text not null,
  w double precision not null, d double precision not null, h double precision not null,
  mount mount_kind not null default 'floor',
  props jsonb not null default '{}'::jsonb,
  halo jsonb,
  image_path text,
  tags text[] not null default '{}',
  version int not null default 1,
  updated_at timestamptz not null default now(),
  updated_by uuid
);
create index presets_project_idx on presets(project_id);

create table object_groups (
  id uuid primary key default gen_random_uuid(),
  scenario_id uuid not null references scenarios(id) on delete cascade,
  name text not null default '',
  version int not null default 1,
  updated_at timestamptz not null default now(),
  updated_by uuid
);
create index object_groups_scenario_idx on object_groups(scenario_id);

create table objects (
  id uuid primary key default gen_random_uuid(),
  scenario_id uuid not null references scenarios(id) on delete cascade,
  layer_id uuid not null references layers(id) on delete restrict,
  preset_id uuid references presets(id) on delete set null,
  name text not null default '',
  x double precision not null default 0, y double precision not null default 0, z double precision not null default 0,
  w double precision not null check (w > 0), d double precision not null check (d > 0), h double precision not null check (h >= 0),
  rot double precision not null default 0,
  mount mount_kind not null default 'floor',
  wall_id uuid references walls(id) on delete set null,
  group_id uuid references object_groups(id) on delete set null,
  z_order int not null default 0,
  tags text[] not null default '{}',
  image_path text,
  halo jsonb,
  locked boolean not null default false,
  props jsonb not null default '{}'::jsonb,
  version int not null default 1,
  updated_at timestamptz not null default now(),
  updated_by uuid
);
create index objects_scenario_idx on objects(scenario_id);
create index objects_wall_idx on objects(wall_id);

create table circuits (
  id uuid primary key default gen_random_uuid(),
  scenario_id uuid not null references scenarios(id) on delete cascade,
  panel_object_id uuid not null references objects(id) on delete cascade,
  slot int not null,
  name text not null default '',
  amps int not null default 20,
  voltage int not null default 120 check (voltage in (120, 240)),
  pole int not null default 1 check (pole in (1, 2)),
  version int not null default 1,
  updated_at timestamptz not null default now(),
  updated_by uuid
);
create index circuits_scenario_idx on circuits(scenario_id);

create table slabs (
  id uuid primary key default gen_random_uuid(),
  scenario_id uuid not null unique references scenarios(id) on delete cascade,
  polygon jsonb not null default '[]'::jsonb,
  thickness double precision not null default 4,
  insulation jsonb not null default '{}'::jsonb,
  vapor_barrier boolean not null default true,
  notes text not null default '',
  version int not null default 1,
  updated_at timestamptz not null default now(),
  updated_by uuid
);

create table zones (
  id uuid primary key default gen_random_uuid(),
  scenario_id uuid not null references scenarios(id) on delete cascade,
  name text not null default '',
  polygon jsonb not null default '[]'::jsonb,
  spacing double precision not null default 12,
  tubing text not null default '1/2',
  manifold_object_id uuid references objects(id) on delete set null,
  manifold_port text,
  design_btuh double precision,
  version int not null default 1,
  updated_at timestamptz not null default now(),
  updated_by uuid
);
create index zones_scenario_idx on zones(scenario_id);

create table runs (
  id uuid primary key default gen_random_uuid(),
  scenario_id uuid not null references scenarios(id) on delete cascade,
  layer_id uuid not null references layers(id) on delete restrict,
  system system_kind not null,
  points jsonb not null default '[]'::jsonb,
  from_object_id uuid references objects(id) on delete set null,
  from_port text,
  to_object_id uuid references objects(id) on delete set null,
  to_port text,
  circuit_id uuid references circuits(id) on delete set null,
  zone_id uuid references zones(id) on delete set null,
  props jsonb not null default '{}'::jsonb,
  version int not null default 1,
  updated_at timestamptz not null default now(),
  updated_by uuid
);
create index runs_scenario_idx on runs(scenario_id);

create table rooms (
  id uuid primary key default gen_random_uuid(),
  scenario_id uuid not null references scenarios(id) on delete cascade,
  name text not null default '',
  polygon jsonb not null default '[]'::jsonb,
  finish finish_kind not null default 'concrete',
  finish_props jsonb not null default '{}'::jsonb,
  version int not null default 1,
  updated_at timestamptz not null default now(),
  updated_by uuid
);
create index rooms_scenario_idx on rooms(scenario_id);

create table comments (
  id uuid primary key default gen_random_uuid(),
  scenario_id uuid not null references scenarios(id) on delete cascade,
  anchor comment_anchor not null,
  x double precision, y double precision,
  object_id uuid references objects(id) on delete cascade,
  parent_id uuid references comments(id) on delete cascade,
  body text not null check (length(body) between 1 and 2000),
  author_id uuid not null,
  author_name text not null default '',
  resolved boolean not null default false,
  created_at timestamptz not null default now(),
  version int not null default 1,
  updated_at timestamptz not null default now(),
  updated_by uuid,
  check ((anchor = 'point' and x is not null and y is not null) or (anchor = 'object' and object_id is not null))
);
create index comments_scenario_idx on comments(scenario_id);

create table snapshots (
  id uuid primary key default gen_random_uuid(),
  scenario_id uuid not null references scenarios(id) on delete cascade,
  name text not null,
  kind snapshot_kind not null,
  payload jsonb not null,
  created_by uuid,
  created_at timestamptz not null default now()
);
create index snapshots_scenario_idx on snapshots(scenario_id);

create table sheets (
  id uuid primary key default gen_random_uuid(),
  scenario_id uuid not null references scenarios(id) on delete cascade,
  code text not null,
  title text not null,
  paper paper_size not null default 'ARCH_C',
  scale text not null default '1/4',
  view jsonb not null default '{}'::jsonb,
  layers text[] not null default '{}',
  schedules jsonb not null default '[]'::jsonb,
  sort int not null default 0,
  version int not null default 1,
  updated_at timestamptz not null default now(),
  updated_by uuid
);
create index sheets_scenario_idx on sheets(scenario_id);

create table conflict_acks (
  scenario_id uuid not null references scenarios(id) on delete cascade,
  rule_id text not null,
  key text not null,
  user_id uuid not null,
  note text not null default '',
  created_at timestamptz not null default now(),
  primary key (scenario_id, rule_id, key)
);

create table activity (
  id bigserial primary key,
  project_id uuid not null references projects(id) on delete cascade,
  scenario_id uuid,
  table_name text not null,
  row_id uuid not null,
  op text not null check (op in ('insert', 'update', 'delete')),
  user_id uuid,
  at timestamptz not null default now(),
  summary jsonb not null default '{}'::jsonb
);
create index activity_project_at_idx on activity(project_id, at desc);

create table claim_attempts (
  user_id uuid not null,
  at timestamptz not null default now()
);
create index claim_attempts_user_at_idx on claim_attempts(user_id, at desc);
