-- Run after all migrations. This verifies the personal Gemini key column
-- through the same authenticated Data API role used by the browser.
begin;

set local statement_timeout = '30s';

create temporary table phase_3_gemini_failures (
  failure text not null
) on commit drop;

grant select, insert on phase_3_gemini_failures to authenticated;

create or replace function pg_temp.phase_3_gemini_assert(
  condition boolean,
  failure_message text
)
returns void
language plpgsql
as $$
begin
  if condition is not true then
    insert into phase_3_gemini_failures (failure) values (failure_message);
  end if;
end;
$$;

select pg_temp.phase_3_gemini_assert(
  exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'user_settings'
      and column_name = 'gemini_api_key'
      and data_type = 'text'
      and is_nullable = 'YES'
  ),
  'user_settings.gemini_api_key must be nullable text'
);

select pg_temp.phase_3_gemini_assert(
  (
    select relrowsecurity
    from pg_catalog.pg_class
    where oid = 'public.user_settings'::regclass
  ),
  'user_settings must retain RLS'
);

select pg_temp.phase_3_gemini_assert(
  not has_table_privilege('anon', 'public.user_settings', 'select')
    and not has_table_privilege('anon', 'public.user_settings', 'update'),
  'anon must not read or update personal settings'
);

insert into auth.users (
  id,
  aud,
  role,
  email,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at
)
values
  (
    '00000000-0000-4000-8000-000000000501',
    'authenticated',
    'authenticated',
    'gemini-owner@example.invalid',
    '{}'::jsonb,
    '{}'::jsonb,
    now(),
    now()
  ),
  (
    '00000000-0000-4000-8000-000000000502',
    'authenticated',
    'authenticated',
    'gemini-other@example.invalid',
    '{}'::jsonb,
    '{}'::jsonb,
    now(),
    now()
  ),
  (
    '00000000-0000-4000-8000-000000000503',
    'authenticated',
    'authenticated',
    'gemini-admin@example.invalid',
    '{}'::jsonb,
    '{}'::jsonb,
    now(),
    now()
  );

insert into public.user_roles (user_id, role)
values ('00000000-0000-4000-8000-000000000503', 'admin');

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '00000000-0000-4000-8000-000000000501',
  true
);
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000501","role":"authenticated"}',
  true
);

update public.user_settings
set gemini_api_key = 'owner-personal-key'
where user_id = '00000000-0000-4000-8000-000000000501';

select pg_temp.phase_3_gemini_assert(
  (
    select gemini_api_key = 'owner-personal-key'
    from public.user_settings
    where user_id = '00000000-0000-4000-8000-000000000501'
  ),
  'owners must be able to save and read their own Gemini key'
);

select pg_temp.phase_3_gemini_assert(
  not exists (
    select 1
    from public.user_settings
    where user_id = '00000000-0000-4000-8000-000000000502'
  ),
  'owners must not read another user Gemini key'
);

update public.user_settings
set gemini_api_key = 'forged-key'
where user_id = '00000000-0000-4000-8000-000000000502';

reset role;

select pg_temp.phase_3_gemini_assert(
  (
    select gemini_api_key is null
    from public.user_settings
    where user_id = '00000000-0000-4000-8000-000000000502'
  ),
  'owners must not update another user Gemini key'
);

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '00000000-0000-4000-8000-000000000503',
  true
);
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000503","role":"authenticated"}',
  true
);

select pg_temp.phase_3_gemini_assert(
  not exists (
    select 1
    from public.user_settings
    where user_id = '00000000-0000-4000-8000-000000000501'
  ),
  'admins must not read another user personal Gemini key'
);

reset role;

do $$
declare
  failures text;
begin
  select string_agg(failure, E'\n' order by failure)
  into failures
  from phase_3_gemini_failures;

  if failures is not null then
    raise exception E'Phase 3 Gemini RLS failures:\n%', failures;
  end if;
end
$$;

rollback;
