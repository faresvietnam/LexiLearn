drop policy if exists "owners delete pending private words" on public.private_words;

create policy "owners delete private words"
on public.private_words
for delete
to authenticated
using (owner_user_id = (select auth.uid()));
