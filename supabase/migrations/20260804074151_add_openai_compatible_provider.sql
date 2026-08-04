alter table public.user_settings
  add column ai_provider text not null default 'gemini'
    check (ai_provider in ('gemini', 'openai-compatible')),
  add column openai_compatible_base_url text,
  add column openai_compatible_token text,
  add column openai_compatible_model text;

-- Credentials use the existing browser-readable, owner-only settings
-- boundary. Reassert it so future admin policies cannot expose these columns.
alter table public.user_settings enable row level security;

revoke all on table public.user_settings from anon;
grant select, update on table public.user_settings to authenticated;

alter policy "settings read own" on public.user_settings
to authenticated
using ((select auth.uid()) = user_id);

alter policy "settings update own" on public.user_settings
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);
