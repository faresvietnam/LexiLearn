# Auth Profile Footer Design

## Goal

Make the authenticated Google account visible in the application shell and provide a clear sign-out action without conflating it with Admin navigation.

## Layout

The bottom section of the sidebar displays the authenticated user's Google avatar (or first initial fallback), display name, and email. Admin users also see an `Admin` badge. A dedicated `Đăng xuất` button ends the Supabase session. The existing `Admin Mode` button remains visible only to admins and opens the admin screen; it never changes roles or signs out.

## Data flow

`AuthProvider` already exposes the authenticated Supabase `User` and role list. `App` passes these values plus `signOut` to `Navbar`. The Navbar is presentational: it does not read Supabase directly.

## Scope

- Show profile metadata from Google/Supabase user metadata, with email fallback.
- Add accessible avatar fallback and a dedicated logout control.
- Preserve the existing learning navigation and admin authorization.
- Do not change database schema, OAuth scopes, or RLS.
