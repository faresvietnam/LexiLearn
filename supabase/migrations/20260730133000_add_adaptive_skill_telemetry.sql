alter table public.learning_cards
  add column if not exists recognition_score integer not null default 0,
  add column if not exists recall_score integer not null default 0,
  add column if not exists spelling_score integer not null default 0,
  add column if not exists context_score integer not null default 0,
  add column if not exists word_structure_score integer not null default 0,
  add column if not exists response_time_sample_count integer not null default 0,
  add column if not exists response_time_average_ms integer not null default 0;

alter table public.learning_cards
  add constraint learning_cards_recognition_score_check check (recognition_score between 0 and 100),
  add constraint learning_cards_recall_score_check check (recall_score between 0 and 100),
  add constraint learning_cards_spelling_score_check check (spelling_score between 0 and 100),
  add constraint learning_cards_context_score_check check (context_score between 0 and 100),
  add constraint learning_cards_word_structure_score_check check (word_structure_score between 0 and 100),
  add constraint learning_cards_response_time_sample_count_check check (response_time_sample_count >= 0),
  add constraint learning_cards_response_time_average_ms_check check (response_time_average_ms >= 0);
