-- This function intentionally remains SECURITY DEFINER because it aggregates
-- cross-user data that learner RLS policies must not expose.
create or replace function public.admin_user_stats()
returns table (
  id uuid,
  email text,
  display_name text,
  created_at timestamptz,
  roles text[],
  vocabulary_count bigint,
  remembered_word_count bigint,
  average_new_words_per_study_day numeric
)
language sql
stable
security definer
set search_path = pg_catalog, public, private
as $$
  select
    u.id,
    u.email,
    u.display_name,
    u.created_at,
    coalesce(array_agg(distinct ur.role) filter (where ur.role is not null), '{}'::text[]),
    coalesce(vocabulary.total_count, 0)::bigint,
    coalesce(memory.remembered_count, 0)::bigint,
    coalesce(new_words.average_count, 0)::numeric
  from public.users u
  left join public.user_roles ur on ur.user_id = u.id
  left join lateral (
    select count(*) as total_count
    from public.personal_vocabulary v
    where v.user_id = u.id and v.study_status <> 'archived'
  ) vocabulary on true
  left join lateral (
    select count(distinct c.personal_vocabulary_id) as remembered_count
    from public.learning_cards c
    where c.user_id = u.id and c.fsrs_state = 2
  ) memory on true
  left join lateral (
    select round(avg(day_totals.new_word_count), 1) as average_count
    from (
      select
        ((a.created_at at time zone coalesce(nullif(u.timezone, ''), 'Asia/Ho_Chi_Minh'))::date
          - case when (a.created_at at time zone coalesce(nullif(u.timezone, ''), 'Asia/Ho_Chi_Minh'))::time < u.study_day_starts_at then 1 else 0 end
        ) as study_date,
        count(distinct a.learning_card_id) filter (where a.first_attempt) as new_word_count
      from public.study_attempts a
      where a.user_id = u.id and a.learning_card_id is not null
      group by 1
    ) day_totals
  ) new_words on true
  where private.is_admin()
  group by u.id, u.email, u.display_name, u.created_at,
    vocabulary.total_count, memory.remembered_count, new_words.average_count
  order by u.created_at desc;
$$;

revoke all on function public.admin_user_stats() from public, anon;
grant execute on function public.admin_user_stats() to authenticated;
