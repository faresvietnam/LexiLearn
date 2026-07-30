create extension if not exists pgcrypto;

create table public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique,
  display_name text,
  avatar_url text,
  timezone text not null default 'Asia/Ho_Chi_Minh',
  study_day_starts_at time not null default time '04:00',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint users_timezone_not_blank check (btrim(timezone) <> '')
);

create table public.user_roles (
  user_id uuid not null references public.users(id) on delete cascade,
  role text not null check (role in ('learner', 'admin')),
  granted_by_user_id uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (user_id, role)
);

create table public.user_settings (
  user_id uuid primary key references public.users(id) on delete cascade,
  new_words_per_day integer not null default 10 check (new_words_per_day between 0 and 100),
  review_limit_per_day integer not null default 40 check (review_limit_per_day between 1 and 500),
  hint_behavior text not null default 'auto' check (hint_behavior in ('auto', 'manual')),
  audio_autoplay boolean not null default false,
  theme text not null default 'system' check (theme in ('light', 'dark', 'system')),
  language text not null default 'vi' check (language in ('vi', 'en')),
  reduced_motion boolean not null default false,
  char_diff_accessibility boolean not null default false,
  updated_at timestamptz not null default now()
);

create table public.app_settings (
  key text primary key,
  integer_value integer not null check (integer_value >= 0),
  updated_by_admin_id uuid references public.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

create table public.ai_auto_fill_usage (
  user_id uuid not null references public.users(id) on delete cascade,
  study_date date not null,
  request_count integer not null default 0 check (request_count >= 0),
  updated_at timestamptz not null default now(),
  primary key (user_id, study_date)
);

create index ai_auto_fill_usage_user_id_idx on public.ai_auto_fill_usage(user_id);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger users_set_updated_at before update on public.users
for each row execute function public.set_updated_at();
create trigger user_settings_set_updated_at before update on public.user_settings
for each row execute function public.set_updated_at();
create trigger app_settings_set_updated_at before update on public.app_settings
for each row execute function public.set_updated_at();
create trigger ai_auto_fill_usage_set_updated_at before update on public.ai_auto_fill_usage
for each row execute function public.set_updated_at();

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
    select 1
    from public.user_roles
    where user_id = (select auth.uid())
      and role = 'admin'
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

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.users (id, email, display_name, avatar_url)
  values (
    new.id,
    lower(new.email),
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name'),
    new.raw_user_meta_data ->> 'avatar_url'
  )
  on conflict (id) do update
    set email = excluded.email,
        display_name = coalesce(excluded.display_name, public.users.display_name),
        avatar_url = coalesce(excluded.avatar_url, public.users.avatar_url);

  insert into public.user_roles (user_id, role) values (new.id, 'learner')
  on conflict do nothing;

  if lower(new.email) = 'thanghong195@gmail.com' then
    insert into public.user_roles (user_id, role) values (new.id, 'admin')
    on conflict do nothing;
  end if;

  insert into public.user_settings (user_id) values (new.id)
  on conflict do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_auth_user();

insert into public.app_settings (key, integer_value)
values ('gemini_auto_fill_daily_limit', 10)
on conflict (key) do nothing;

alter table public.users enable row level security;
alter table public.user_roles enable row level security;
alter table public.user_settings enable row level security;
alter table public.app_settings enable row level security;
alter table public.ai_auto_fill_usage enable row level security;

grant usage on schema public to authenticated;
grant select, update on public.users to authenticated;
grant select on public.user_roles to authenticated;
grant select, update on public.user_settings to authenticated;
grant select, update on public.app_settings to authenticated;
grant select on public.ai_auto_fill_usage to authenticated;

create policy "users read own profile or admin" on public.users for select to authenticated
using (id = (select auth.uid()) or (select private.is_admin()));
create policy "users update own profile" on public.users for update to authenticated
using (id = (select auth.uid())) with check (id = (select auth.uid()));
create policy "roles read own role or admin" on public.user_roles for select to authenticated
using (user_id = (select auth.uid()) or (select private.is_admin()));
create policy "settings read own" on public.user_settings for select to authenticated
using (user_id = (select auth.uid()));
create policy "settings update own" on public.user_settings for update to authenticated
using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "app settings read authenticated" on public.app_settings for select to authenticated
using (true);
create policy "admins update app settings" on public.app_settings for update to authenticated
using ((select private.is_admin())) with check ((select private.is_admin()));
create policy "usage read own" on public.ai_auto_fill_usage for select to authenticated
using (user_id = (select auth.uid()));

revoke all on function private.is_admin() from public, anon, authenticated;
grant usage on schema private to authenticated;
grant execute on function private.is_admin() to authenticated;
revoke all on function public.current_study_date(uuid, timestamptz) from public, anon;
grant execute on function public.current_study_date(uuid, timestamptz) to authenticated;
revoke all on function public.handle_new_auth_user() from public, anon, authenticated;
grant usage on schema public to supabase_auth_admin;
grant execute on function public.handle_new_auth_user() to supabase_auth_admin;
revoke all on function public.set_updated_at() from public;
