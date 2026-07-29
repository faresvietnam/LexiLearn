import {afterEach, describe, expect, it, vi} from 'vitest';

vi.hoisted(() => {
  const storage = new Map<string, string>();

  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      clear: () => storage.clear(),
      getItem: (key: string) => storage.get(key) ?? null,
      key: (index: number) => [...storage.keys()][index] ?? null,
      get length() {
        return storage.size;
      },
      removeItem: (key: string) => storage.delete(key),
      setItem: (key: string, value: string) => storage.set(key, value),
    },
  });
});

import {
  getSupabaseClient,
  getSupabaseConfigurationError,
} from './supabase';

describe('Supabase browser configuration', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('returns an actionable error and no client when public configuration is absent', () => {
    vi.stubEnv('VITE_SUPABASE_URL', '');
    vi.stubEnv('VITE_SUPABASE_PUBLISHABLE_KEY', '');

    expect(getSupabaseClient()).toBeNull();
    expect(getSupabaseConfigurationError()).toBe(
      'Thiếu cấu hình Supabase. Hãy đặt VITE_SUPABASE_URL và VITE_SUPABASE_PUBLISHABLE_KEY trong file .env.local.',
    );
  });

  it('does not construct a client when either public value is absent', () => {
    vi.stubEnv(
      'VITE_SUPABASE_URL',
      'https://whsyzhsvsmyzdaxqrvoi.supabase.co',
    );
    vi.stubEnv('VITE_SUPABASE_PUBLISHABLE_KEY', '');

    expect(getSupabaseClient()).toBeNull();
    expect(getSupabaseConfigurationError()).not.toBeNull();
  });
});
