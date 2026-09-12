create extension if not exists pgcrypto with schema extensions;

create type access_level as enum ('view', 'edit', 'owner');
create type wall_scope as enum ('shell', 'scenario');
create type wall_state as enum ('existing', 'new');
create type framing_kind as enum ('2x4', '2x6', 'masonry', 'existing_unknown');
create type opening_kind as enum ('door', 'double_door', 'slider', 'window', 'fireplace', 'cased_opening');
create type swing_kind as enum ('in', 'out', 'none');
create type hinge_side as enum ('a_side', 'b_side', 'none');
create type mount_kind as enum ('floor', 'floor_anchored', 'wall', 'ceiling', 'recessed');
create type system_kind as enum (
  'cold', 'hot', 'dwv', 'vent', 'gas',
  'v120', 'v240', 'lighting', 'switch_leg', 'low_voltage', 'speaker', 'hdmi',
  'refrigerant', 'duct_supply', 'duct_return',
  'pex_loop', 'pex_supply', 'pex_return'
);
create type comment_anchor as enum ('point', 'object');
create type snapshot_kind as enum ('manual', 'auto_fork', 'auto_restore');
create type paper_size as enum ('ARCH_C', 'ARCH_D', 'ANSI_B');
create type finish_kind as enum ('rubber_mat', 'lvp', 'carpet', 'concrete', 'other');
create type sheet_view_kind as enum ('plan', 'elevation', 'rcp');
