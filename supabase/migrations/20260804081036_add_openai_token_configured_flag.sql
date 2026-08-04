alter table public.user_settings
add column openai_compatible_token_configured boolean
generated always as (
  nullif(btrim(openai_compatible_token), '') is not null
) stored;

-- RLS limits rows, while column privileges ensure browser clients cannot read
-- the provider token even when they own the row. They retain UPDATE so the
-- settings form can replace or clear their own token.
revoke select on table public.user_settings from authenticated;
grant select (
  user_id,
  new_words_per_day,
  review_limit_per_day,
  hint_behavior,
  audio_autoplay,
  theme,
  language,
  reduced_motion,
  char_diff_accessibility,
  updated_at,
  gemini_api_key,
  ai_provider,
  openai_compatible_base_url,
  openai_compatible_model,
  openai_compatible_token_configured
) on table public.user_settings to authenticated;
