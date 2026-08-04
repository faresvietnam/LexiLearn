-- Run after all migrations. Verifies provider settings through the same
-- authenticated Data API role used by the browser.
begin;

set local statement_timeout = '30s';

create temporary table openai_provider_failures (
  failure text not null
) on commit drop;

grant select, insert on openai_provider_failures to authenticated;

create or replace function pg_temp.openai_provider_assert(
  condition boolean,
  failure_message text
)
returns void
language plpgsql
as $$
begin
  if condition is not true then
    insert into openai_provider_failures (failure) values (failure_message);
  end if;
end;
$$;

select pg_temp.openai_provider_assert(
  (
    select column_default like '%gemini%'
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'user_settings'
      and column_name = 'ai_provider'
  ),
  'ai_provider must default to gemini'
);

select pg_temp.openai_provider_assert(
  not has_table_privilege('anon', 'public.user_settings', 'select')
    and not has_table_privilege('anon', 'public.user_settings', 'update'),
  'anon must not access provider settings'
);

insert into auth.users (
  id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values
  (
    '00000000-0000-4000-8000-000000000601',
    'authenticated', 'authenticated', 'provider-owner@example.invalid',
    '{}'::jsonb, '{}'::jsonb, now(), now()
  ),
  (
    '00000000-0000-4000-8000-000000000602',
    'authenticated', 'authenticated', 'provider-other@example.invalid',
    '{}'::jsonb, '{}'::jsonb, now(), now()
  );

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '00000000-0000-4000-8000-000000000601',
  true
);
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000601","role":"authenticated"}',
  true
);

update public.user_settings
set
  ai_provider = 'openai-compatible',
  openai_compatible_base_url = 'https://integrate.8686.vn/v1',
  openai_compatible_token = 'owner-token',
  openai_compatible_model = 'deepseek-ai/deepseek-v4-flash'
where user_id = '00000000-0000-4000-8000-000000000601';

select pg_temp.openai_provider_assert(
  (
    select ai_provider = 'openai-compatible'
      and openai_compatible_token = 'owner-token'
    from public.user_settings
    where user_id = '00000000-0000-4000-8000-000000000601'
  ),
  'owner must read and update own provider settings'
);

select pg_temp.openai_provider_assert(
  not exists (
    select 1
    from public.user_settings
    where user_id = '00000000-0000-4000-8000-000000000602'
  ),
  'owner must not read another provider configuration'
);

update public.user_settings
set openai_compatible_token = 'forged-token'
where user_id = '00000000-0000-4000-8000-000000000602';

reset role;

select pg_temp.openai_provider_assert(
  (
    select openai_compatible_token is null
    from public.user_settings
    where user_id = '00000000-0000-4000-8000-000000000602'
  ),
  'owner must not update another provider configuration'
);

do $$
declare
  failures text;
begin
  select string_agg(failure, E'\n' order by failure)
  into failures
  from openai_provider_failures;

  if failures is not null then
    raise exception E'OpenAI provider RLS failures:\n%', failures;
  end if;
end
$$;

rollback;
