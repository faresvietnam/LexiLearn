alter table public.user_settings
add column gemini_api_key text;

-- The browser reads this field through the existing owner-only settings
-- boundary. Reassert that boundary explicitly because the column contains a
-- personal credential and must not inherit any future Admin visibility.
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
