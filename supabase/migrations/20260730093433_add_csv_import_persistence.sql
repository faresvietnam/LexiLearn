create table public.csv_imports (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references public.users(id) on delete cascade,
  source_filename text,
  status text not null default 'uploaded'
    check (status in ('uploaded', 'validating', 'ready', 'importing', 'completed', 'failed')),
  total_rows integer not null default 0 check (total_rows >= 0),
  valid_rows integer not null default 0 check (valid_rows >= 0),
  invalid_rows integer not null default 0 check (invalid_rows >= 0),
  duplicate_rows integer not null default 0 check (duplicate_rows >= 0),
  error_details jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz
);

create index csv_imports_owner_created_idx
  on public.csv_imports(owner_user_id, created_at desc);

create table public.csv_import_rows (
  id uuid primary key default gen_random_uuid(),
  import_id uuid not null references public.csv_imports(id) on delete cascade,
  owner_user_id uuid not null references public.users(id) on delete cascade,
  source_row_number integer not null check (source_row_number > 1),
  canonical_key text not null,
  raw_data jsonb not null,
  status text not null default 'pending'
    check (status in ('pending', 'imported', 'skipped', 'failed')),
  error_details jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (import_id, source_row_number),
  unique (import_id, canonical_key)
);

create index csv_import_rows_owner_status_idx
  on public.csv_import_rows(owner_user_id, status);

create trigger csv_imports_set_updated_at
before update on public.csv_imports
for each row execute function public.set_updated_at();

create trigger csv_import_rows_set_updated_at
before update on public.csv_import_rows
for each row execute function public.set_updated_at();

alter table public.csv_imports enable row level security;
alter table public.csv_import_rows enable row level security;

revoke all on public.csv_imports, public.csv_import_rows from anon;
grant select, insert, update on public.csv_imports, public.csv_import_rows to authenticated;

create policy "users read own csv imports"
on public.csv_imports for select to authenticated
using ((select auth.uid()) = owner_user_id);

create policy "users create own csv imports"
on public.csv_imports for insert to authenticated
with check ((select auth.uid()) = owner_user_id);

create policy "users update own csv imports"
on public.csv_imports for update to authenticated
using ((select auth.uid()) = owner_user_id)
with check ((select auth.uid()) = owner_user_id);

create policy "users read own csv import rows"
on public.csv_import_rows for select to authenticated
using ((select auth.uid()) = owner_user_id);

create policy "users create own csv import rows"
on public.csv_import_rows for insert to authenticated
with check (
  (select auth.uid()) = owner_user_id
  and exists (
    select 1 from public.csv_imports parent
    where parent.id = import_id
      and parent.owner_user_id = (select auth.uid())
  )
);

create policy "users update own csv import rows"
on public.csv_import_rows for update to authenticated
using ((select auth.uid()) = owner_user_id)
with check (
  (select auth.uid()) = owner_user_id
  and exists (
    select 1 from public.csv_imports parent
    where parent.id = import_id
      and parent.owner_user_id = (select auth.uid())
  )
);
