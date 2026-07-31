alter table public.study_attempts
  drop constraint if exists study_attempts_learning_card_id_fkey;

alter table public.study_attempts
  add constraint study_attempts_learning_card_id_fkey
  foreign key (learning_card_id)
  references public.learning_cards(id)
  on delete cascade;
