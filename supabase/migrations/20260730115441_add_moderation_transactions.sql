create table public.admin_audit_logs (
  id uuid primary key default gen_random_uuid(),
  admin_id uuid not null references public.users(id) on delete restrict,
  action text not null,
  entity_type text not null,
  entity_id uuid not null,
  before_snapshot jsonb not null,
  after_snapshot jsonb not null,
  created_at timestamptz not null default now()
);

alter table public.admin_audit_logs enable row level security;
revoke all privileges on table public.admin_audit_logs from public, anon;
grant select, insert on table public.admin_audit_logs to authenticated;

create policy "admins read audit logs" on public.admin_audit_logs
for select to authenticated using ((select private.is_admin()));
create policy "admins write audit logs" on public.admin_audit_logs
for insert to authenticated with check ((select private.is_admin()) and admin_id = (select auth.uid()));

create or replace function public.moderate_private_word(
  p_private_word_id uuid,
  p_action text,
  p_submission_version integer,
  p_merged_global_word_id uuid default null,
  p_admin_comment text default null
)
returns jsonb
language plpgsql
security invoker
set search_path = public, private
as $$
declare
  existing public.private_words;
  updated public.private_words;
begin
  if not (select private.is_admin()) then
    raise exception 'admin_required';
  end if;

  select * into existing
  from public.private_words
  where id = p_private_word_id
  for update;

  if not found then raise exception 'private_word_not_found'; end if;
  if existing.submission_version <> p_submission_version then
    raise exception 'stale_submission_version';
  end if;
  if p_action not in ('approve', 'reject', 'merge') then
    raise exception 'invalid_moderation_action';
  end if;
  if p_action = 'merge' and p_merged_global_word_id is null then
    raise exception 'merge_target_required';
  end if;
  if p_merged_global_word_id is not null and not exists (
    select 1 from public.global_words where id = p_merged_global_word_id and status = 'active'
  ) then raise exception 'merge_target_not_found'; end if;

  update public.private_words
  set status = case when p_action = 'reject' then 'rejected' else 'approved' end,
      admin_comment = p_admin_comment,
      merged_global_word_id = case when p_action = 'merge' then p_merged_global_word_id else null end,
      submission_version = submission_version + 1,
      updated_at = now()
  where id = p_private_word_id
  returning * into updated;

  insert into public.admin_audit_logs(
    admin_id, action, entity_type, entity_id, before_snapshot, after_snapshot
  ) values (
    (select auth.uid()), p_action, 'private_word', updated.id,
    to_jsonb(existing), to_jsonb(updated)
  );

  return jsonb_build_object('id', updated.id, 'status', updated.status,
    'submission_version', updated.submission_version,
    'merged_global_word_id', updated.merged_global_word_id);
end;
$$;

revoke all on function public.moderate_private_word(uuid, text, integer, uuid, text) from public, anon;
grant execute on function public.moderate_private_word(uuid, text, integer, uuid, text) to authenticated;
