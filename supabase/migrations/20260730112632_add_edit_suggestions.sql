create table public.edit_suggestions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  global_word_id uuid not null references public.global_words(id) on delete cascade,
  suggested_changes jsonb not null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  admin_comment text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.edit_suggestions enable row level security;
revoke all privileges on table public.edit_suggestions from public, anon;
grant select, insert on table public.edit_suggestions to authenticated;
grant update on table public.edit_suggestions to authenticated;

create policy "owners read own edit suggestions"
on public.edit_suggestions
for select
to authenticated
using (user_id = (select auth.uid()) or (select private.is_admin()));

create policy "owners create edit suggestions"
on public.edit_suggestions
for insert
to authenticated
with check (user_id = (select auth.uid()) and status = 'pending');

create policy "admins update edit suggestions"
on public.edit_suggestions
for update
to authenticated
using ((select private.is_admin()))
with check ((select private.is_admin()));
