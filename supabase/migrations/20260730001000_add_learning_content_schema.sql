create table public.global_words (
  id uuid primary key default gen_random_uuid(), word text not null, normalized_word text not null unique,
  ipa text, audio_url text, image_url text, status text not null default 'active' check (status in ('active','archived')),
  version integer not null default 1, created_by_admin_id uuid references public.users(id),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.global_meanings (
  id uuid primary key default gen_random_uuid(), global_word_id uuid not null references public.global_words(id) on delete cascade,
  meaning_vi text not null, part_of_speech text not null, definition_en text, usage_note text,
  display_order integer not null default 0, status text not null default 'active' check (status in ('active','archived')),
  version integer not null default 1, unique(global_word_id, display_order)
);
create table public.global_examples (
  id uuid primary key default gen_random_uuid(), global_meaning_id uuid not null references public.global_meanings(id) on delete cascade,
  sentence text not null, sentence_vi text, expected_answer text not null, word_form text, difficulty text not null default 'medium' check (difficulty in ('easy','medium','hard')),
  status text not null default 'active' check (status in ('active','archived')), created_at timestamptz not null default now()
);
create table public.word_parts (
  id uuid primary key default gen_random_uuid(), global_word_id uuid not null references public.global_words(id) on delete cascade,
  text text not null, type text not null check (type in ('prefix','root','base','suffix','combining_form','compound_component')),
  meaning text, position integer not null default 0, unique(global_word_id, position)
);
create table public.private_words (
  id uuid primary key default gen_random_uuid(), owner_user_id uuid not null references public.users(id) on delete cascade,
  word text not null, normalized_word text not null, ipa text, audio_url text, image_url text,
  status text not null default 'pending' check (status in ('pending','rejected','approved','archived')),
  submission_version integer not null default 1, admin_comment text, merged_global_word_id uuid references public.global_words(id),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(owner_user_id, normalized_word)
);
create table public.private_meanings (
  id uuid primary key default gen_random_uuid(), private_word_id uuid not null references public.private_words(id) on delete cascade,
  meaning_vi text not null, part_of_speech text not null, definition_en text, display_order integer not null default 0,
  unique(private_word_id, display_order)
);
create table public.decks (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references public.users(id) on delete cascade,
  name text not null, description text, color text not null default '#6366f1', is_default boolean not null default false,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(user_id, name)
);
create table public.tags (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references public.users(id) on delete cascade,
  name text not null, color text not null default '#6366f1', created_at timestamptz not null default now(), unique(user_id, name)
);
create table public.personal_vocabulary (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references public.users(id) on delete cascade,
  global_word_id uuid references public.global_words(id) on delete cascade,
  private_word_id uuid references public.private_words(id) on delete cascade,
  deck_id uuid references public.decks(id) on delete set null,
  study_status text not null default 'active' check (study_status in ('active','paused','archived')),
  added_at timestamptz not null default now(), archived_at timestamptz,
  constraint personal_vocabulary_one_source check ((global_word_id is null) <> (private_word_id is null)),
  unique(user_id, global_word_id), unique(user_id, private_word_id)
);
create table public.personal_word_tags (
  personal_vocabulary_id uuid not null references public.personal_vocabulary(id) on delete cascade,
  tag_id uuid not null references public.tags(id) on delete cascade, primary key(personal_vocabulary_id, tag_id)
);
create table public.study_scope (
  user_id uuid primary key references public.users(id) on delete cascade,
  active_deck_ids uuid[] not null default '{}', excluded_tag_ids uuid[] not null default '{}', paused_word_ids uuid[] not null default '{}', updated_at timestamptz not null default now()
);
create table public.learning_cards (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references public.users(id) on delete cascade,
  personal_vocabulary_id uuid not null references public.personal_vocabulary(id) on delete cascade,
  meaning_source_id uuid not null, meaning_source_type text not null check (meaning_source_type in ('global_meaning','private_meaning')),
  memory_strength text not null default 'critical' check (memory_strength in ('critical','weak','stable','strong')),
  memory_score integer not null default 0 check (memory_score between 0 and 100), review_interval_days integer not null default 1,
  next_review_at timestamptz, last_reviewed_at timestamptz, created_at timestamptz not null default now(),
  unique(user_id, personal_vocabulary_id, meaning_source_id, meaning_source_type)
);
create table public.study_sessions (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references public.users(id) on delete cascade,
  started_at timestamptz not null default now(), ended_at timestamptz, scope_snapshot jsonb not null default '{}'::jsonb,
  review_limit integer not null, new_word_limit integer not null, status text not null default 'active' check (status in ('active','paused','completed','abandoned'))
);
create table public.study_attempts (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references public.users(id) on delete cascade,
  learning_card_id uuid references public.learning_cards(id) on delete set null, session_id uuid not null references public.study_sessions(id) on delete cascade,
  question_type text not null, input_mode text, attempt_number integer not null check (attempt_number > 0), submitted_answer text,
  is_correct boolean not null, first_attempt boolean not null, response_time_ms integer not null check (response_time_ms >= 0),
  hint_level integer not null default 0 check (hint_level between 0 and 5), answer_revealed boolean not null default false,
  error_types text[] not null default '{}', created_at timestamptz not null default now(), unique(session_id, learning_card_id, attempt_number)
);
create index private_words_owner_idx on public.private_words(owner_user_id);
create index decks_user_idx on public.decks(user_id); create index tags_user_idx on public.tags(user_id);
create index vocabulary_user_idx on public.personal_vocabulary(user_id); create index cards_user_due_idx on public.learning_cards(user_id, next_review_at);
create index sessions_user_idx on public.study_sessions(user_id, started_at desc); create index attempts_session_idx on public.study_attempts(session_id, created_at);
create trigger global_words_updated before update on public.global_words for each row execute function public.set_updated_at();
create trigger private_words_updated before update on public.private_words for each row execute function public.set_updated_at();
create trigger decks_updated before update on public.decks for each row execute function public.set_updated_at();
create trigger scope_updated before update on public.study_scope for each row execute function public.set_updated_at();

alter table public.global_words enable row level security; alter table public.global_meanings enable row level security; alter table public.global_examples enable row level security; alter table public.word_parts enable row level security;
alter table public.private_words enable row level security; alter table public.private_meanings enable row level security; alter table public.decks enable row level security; alter table public.tags enable row level security; alter table public.personal_vocabulary enable row level security; alter table public.personal_word_tags enable row level security; alter table public.study_scope enable row level security; alter table public.learning_cards enable row level security; alter table public.study_sessions enable row level security; alter table public.study_attempts enable row level security;
grant select on public.global_words, public.global_meanings, public.global_examples, public.word_parts to authenticated;
grant select, insert, update, delete on public.private_words, public.private_meanings, public.decks, public.tags, public.personal_vocabulary, public.personal_word_tags, public.study_scope, public.learning_cards, public.study_sessions, public.study_attempts to authenticated;
create policy "read active global words" on public.global_words for select to authenticated using (status = 'active' or (select private.is_admin()));
create policy "admins manage global words" on public.global_words for all to authenticated using ((select private.is_admin())) with check ((select private.is_admin()));
create policy "read global meanings" on public.global_meanings for select to authenticated using (true); create policy "admins manage global meanings" on public.global_meanings for all to authenticated using ((select private.is_admin())) with check ((select private.is_admin()));
create policy "read global examples" on public.global_examples for select to authenticated using (true); create policy "admins manage global examples" on public.global_examples for all to authenticated using ((select private.is_admin())) with check ((select private.is_admin()));
create policy "read word parts" on public.word_parts for select to authenticated using (true); create policy "admins manage word parts" on public.word_parts for all to authenticated using ((select private.is_admin())) with check ((select private.is_admin()));
create policy "owners manage private words" on public.private_words for all to authenticated using (owner_user_id=(select auth.uid())) with check (owner_user_id=(select auth.uid()));
create policy "owners manage private meanings" on public.private_meanings for all to authenticated using (exists(select 1 from public.private_words w where w.id=private_word_id and w.owner_user_id=(select auth.uid()))) with check (exists(select 1 from public.private_words w where w.id=private_word_id and w.owner_user_id=(select auth.uid())));
create policy "owners manage decks" on public.decks for all to authenticated using (user_id=(select auth.uid())) with check (user_id=(select auth.uid()));
create policy "owners manage tags" on public.tags for all to authenticated using (user_id=(select auth.uid())) with check (user_id=(select auth.uid()));
create policy "owners manage vocabulary" on public.personal_vocabulary for all to authenticated using (user_id=(select auth.uid())) with check (user_id=(select auth.uid()));
create policy "owners manage vocabulary tags" on public.personal_word_tags for all to authenticated using (exists(select 1 from public.personal_vocabulary v where v.id=personal_vocabulary_id and v.user_id=(select auth.uid()))) with check (exists(select 1 from public.personal_vocabulary v where v.id=personal_vocabulary_id and v.user_id=(select auth.uid())));
create policy "owners manage study scope" on public.study_scope for all to authenticated using (user_id=(select auth.uid())) with check (user_id=(select auth.uid()));
create policy "owners manage learning cards" on public.learning_cards for all to authenticated using (user_id=(select auth.uid())) with check (user_id=(select auth.uid()));
create policy "owners manage sessions" on public.study_sessions for all to authenticated using (user_id=(select auth.uid())) with check (user_id=(select auth.uid()));
create policy "owners manage attempts" on public.study_attempts for all to authenticated using (user_id=(select auth.uid())) with check (user_id=(select auth.uid()));
