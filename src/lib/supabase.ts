/// <reference types="vite/client" />

import {
  createClient,
  type SupabaseClient,
} from '@supabase/supabase-js';

const CONFIGURATION_ERROR =
  'Thiếu cấu hình Supabase. Hãy đặt VITE_SUPABASE_URL và VITE_SUPABASE_PUBLISHABLE_KEY trong file .env.local.';

let supabaseClient: SupabaseClient | null = null;

function getPublicConfiguration() {
  const url = import.meta.env.VITE_SUPABASE_URL?.trim();
  const publishableKey =
    import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim();

  if (!url || !publishableKey) {
    return null;
  }

  return {url, publishableKey};
}

export function getSupabaseClient(): SupabaseClient | null {
  const configuration = getPublicConfiguration();

  if (!configuration) {
    return null;
  }

  supabaseClient ??= createClient(
    configuration.url,
    configuration.publishableKey,
  );

  return supabaseClient;
}

export function getSupabaseConfigurationError(): string | null {
  return getPublicConfiguration() ? null : CONFIGURATION_ERROR;
}
