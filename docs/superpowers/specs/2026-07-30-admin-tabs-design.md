# Admin Tabs Design

## Purpose

Replace the prototype admin navigation with one admin-only workspace in the existing sidebar. The workspace provides review of vocabulary submissions and a read-only directory of users.

## Navigation

- Remove the `/admin` route behavior and the footer `Admin Mode` control.
- Show one sidebar item named `Admin` only when the authenticated role is `admin`.
- Keep the pending-submission badge on that item.
- Selecting `Admin` opens the `admin` application tab; learners cannot see or open it.

## Admin workspace

The `admin` tab contains two top-level tabs:

1. **Duyệt bài** renders the current `AdminApprovalView` without changing its internal submission-status tabs or actions.
2. **Người dùng** renders a read-only table/list of user display name, email, roles, and join date. Display name falls back to email when absent. The view has explicit loading, empty, and recoverable-error states.

No role editing, account deletion, or profile editing is in scope for Phase 2.

## Data and authorization

- The users view reads `public.users` and `public.user_roles` through the authenticated browser client.
- Existing RLS policies allow an admin to read both tables; this change adds no schema or policy migration.
- The repository maps database rows into a small admin-user view model and turns database errors into a Vietnamese recoverable message.

## Testing and verification

- Navbar tests assert that only admins receive the `Admin` navigation item and that the pending badge remains available.
- Admin workspace tests cover switching between `Duyệt bài` and `Người dùng`, plus loading, empty, and error states for the user list.
- Run the full test suite, type check, and production build before committing the implementation.

## Non-goals

- No `/admin` URL route or route guard.
- No user-management mutations.
- No change to approval logic, learning flow, or Supabase schema/RLS policies.
