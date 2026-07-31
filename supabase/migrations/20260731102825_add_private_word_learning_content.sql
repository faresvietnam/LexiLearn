create table public.private_word_parts (
  id uuid primary key default gen_random_uuid(),
  private_word_id uuid not null references public.private_words(id) on delete cascade,
  text text not null,
  type text not null check (type in ('prefix','root','base','suffix','combining_form','compound_component')),
  meaning text,
  position integer not null default 0,
  unique(private_word_id, position)
);

create table public.private_examples (
  id uuid primary key default gen_random_uuid(),
  private_meaning_id uuid not null references public.private_meanings(id) on delete cascade,
  sentence text not null,
  expected_answer text not null,
  word_form text not null default 'base',
  difficulty text not null default 'medium' check (difficulty in ('easy','medium','hard')),
  created_at timestamptz not null default now()
);

create index private_word_parts_word_idx on public.private_word_parts(private_word_id);
create index private_examples_meaning_idx on public.private_examples(private_meaning_id);

alter table public.private_word_parts enable row level security;
alter table public.private_examples enable row level security;

grant select, insert, update, delete on public.private_word_parts, public.private_examples to authenticated;

create policy "owners manage private word parts" on public.private_word_parts
for all to authenticated
using (exists (select 1 from public.private_words w where w.id = private_word_id and w.owner_user_id = (select auth.uid())))
with check (exists (select 1 from public.private_words w where w.id = private_word_id and w.owner_user_id = (select auth.uid())));

create policy "owners manage private examples" on public.private_examples
for all to authenticated
using (exists (
  select 1 from public.private_meanings m
  join public.private_words w on w.id = m.private_word_id
  where m.id = private_meaning_id and w.owner_user_id = (select auth.uid())
))
with check (exists (
  select 1 from public.private_meanings m
  join public.private_words w on w.id = m.private_word_id
  where m.id = private_meaning_id and w.owner_user_id = (select auth.uid())
));
