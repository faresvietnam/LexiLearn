create schema if not exists private;
revoke all on schema private from public;

create or replace function private.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public, private
as $$
  select exists (
    select 1 from public.user_roles
    where user_id = (select auth.uid()) and role = 'admin'
  );
$$;

create or replace function public.current_study_date(
  p_user_id uuid,
  p_at timestamptz default now()
)
returns date
language sql
stable
security invoker
set search_path = public
as $$
  select ((p_at at time zone timezone) - study_day_starts_at)::date
  from public.users
  where id = p_user_id
    and (p_user_id = (select auth.uid()) or (select private.is_admin()));
$$;

alter policy "users read own profile or admin" on public.users
using (id = (select auth.uid()) or (select private.is_admin()));
alter policy "roles read own role or admin" on public.user_roles
using (user_id = (select auth.uid()) or (select private.is_admin()));
alter policy "admins update app settings" on public.app_settings
using ((select private.is_admin())) with check ((select private.is_admin()));

revoke all on function public.is_admin() from public, anon, authenticated;
drop function public.is_admin();
revoke all on function private.is_admin() from public, anon, authenticated;
grant usage on schema private to authenticated;
grant execute on function private.is_admin() to authenticated;
revoke all on function public.current_study_date(uuid, timestamptz) from public, anon;
grant execute on function public.current_study_date(uuid, timestamptz) to authenticated;
revoke all on function public.handle_new_auth_user() from public, anon, authenticated;
grant usage on schema public to supabase_auth_admin;
grant execute on function public.handle_new_auth_user() to supabase_auth_admin;
