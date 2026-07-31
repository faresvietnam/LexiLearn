alter table public.study_attempts
  add column if not exists sentence_key text;

create index if not exists study_attempts_sentence_key_idx
  on public.study_attempts(user_id, sentence_key)
  where sentence_key is not null;
