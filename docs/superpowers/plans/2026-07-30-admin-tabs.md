# Admin Tabs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace prototype admin navigation with a single admin workspace containing vocabulary review and a read-only user directory.

**Architecture:** Keep application tab state as the only navigation mechanism. `Navbar` exposes one admin-only `admin` item; `AdminWorkspace` owns the two nested tabs. An `adminUsersRepository` reads RLS-protected user tables through the existing browser client and returns a UI view model.

**Tech Stack:** React 19, TypeScript, Vite, Vitest, React Testing Library, `@supabase/supabase-js`, Supabase PostgreSQL/RLS.

## Global Constraints

- Work directly on `main`; commit after every completed task.
- Do not change Supabase schema, migrations, or RLS policies.
- Browser code uses only the publishable Supabase client.
- Do not add role editing, account deletion, or profile editing.
- Preserve the approval and learning flows.
- Do not retain a `/admin` route or an `Admin Mode` footer control.

---

## File Structure

- Modify `src/components/Navbar.tsx` and `src/components/Navbar.test.tsx` for one admin-only navigation item.
- Create `src/features/admin/adminUsersRepository.ts` and test for user-directory querying/mapping.
- Create `src/components/AdminWorkspace.tsx` and test for nested tabs and request states.
- Modify `src/App.tsx` to remove React Router admin handling and render the workspace from app tab state.

### Task 1: Replace legacy admin navigation

**Files:**

- Modify: `src/components/Navbar.tsx`, `src/components/Navbar.test.tsx`, `src/App.tsx`

**Interfaces:** `Navbar` no longer accepts `onOpenAdmin`; `onSelectTab('admin')` is the only admin navigation event.

- [ ] **Step 1: Write the failing navbar test**

```tsx
renderNavbar({userRole: 'admin', pendingSubmissionsCount: 2});
expect(screen.getByRole('button', {name: /Admin/})).toHaveTextContent('2');
renderNavbar({userRole: 'learner', pendingSubmissionsCount: 2});
expect(screen.queryByRole('button', {name: /Admin/})).not.toBeInTheDocument();
```

- [ ] **Step 2: Verify RED**

Run: `npm test -- --run src/components/Navbar.test.tsx`

Expected: FAIL because the item is named `Duyệt bài` and the legacy prop/footer remain.

- [ ] **Step 3: Write the minimal implementation**

```tsx
if (userRole === 'admin') {
  navItems.push({id: 'admin', label: 'Admin', icon: ShieldCheck, badge: pendingSubmissionsCount || undefined});
}
```

Remove `onOpenAdmin`, the `Admin Mode` footer button, and `Navigate`/`useLocation` handling in `App`.

- [ ] **Step 4: Verify GREEN**

Run: `npm test -- --run src/components/Navbar.test.tsx && npm run lint`

Expected: PASS.

- [ ] **Step 5: Commit**

Run: `git add src/components/Navbar.tsx src/components/Navbar.test.tsx src/App.tsx && git commit -m "feat: consolidate admin navigation"`

### Task 2: Add the read-only admin user repository

**Files:**

- Create: `src/features/admin/adminUsersRepository.ts`, `src/features/admin/adminUsersRepository.test.ts`

**Interfaces:**

```ts
export type AdminUser = {id: string; displayName: string; email: string; roles: string[]; joinedAt: string};
export async function loadAdminUsers(): Promise<{data: AdminUser[]; error: null} | {data: null; error: string}>;
```

- [ ] **Step 1: Write the failing repository test**

```ts
mockQuery([{id: 'u1', email: 'a@example.com', display_name: null, created_at: '2026-07-30T00:00:00Z', user_roles: [{role: 'learner'}]}]);
await expect(loadAdminUsers()).resolves.toEqual({data: [{id: 'u1', displayName: 'a@example.com', email: 'a@example.com', roles: ['learner'], joinedAt: '2026-07-30T00:00:00Z'}], error: null});
```

- [ ] **Step 2: Verify RED**

Run: `npm test -- --run src/features/admin/adminUsersRepository.test.ts`

Expected: FAIL because the repository module does not exist.

- [ ] **Step 3: Write the minimal implementation**

```ts
client.from('users').select('id, email, display_name, created_at, user_roles(role)').order('created_at', {ascending: false});
```

Map `display_name ?? email`, preserve role strings, and return `Không thể tải danh sách người dùng.` for a missing client or query error.

- [ ] **Step 4: Verify GREEN**

Run: `npm test -- --run src/features/admin/adminUsersRepository.test.ts && npm run lint`

Expected: PASS.

- [ ] **Step 5: Commit**

Run: `git add src/features/admin/adminUsersRepository.ts src/features/admin/adminUsersRepository.test.ts && git commit -m "feat: add admin user directory repository"`

### Task 3: Build the Admin workspace and connect it to App

**Files:**

- Create: `src/components/AdminWorkspace.tsx`, `src/components/AdminWorkspace.test.tsx`
- Modify: `src/App.tsx`

**Interfaces:** `AdminWorkspace` receives the existing `AdminApprovalView` props plus `loadUsers`, defaulting to `loadAdminUsers`. It owns `activeTab: 'submissions' | 'users'` and fetches only when the user tab is selected.

- [ ] **Step 1: Write the failing workspace test**

```tsx
const loadUsers = vi.fn().mockResolvedValue({data: [{id: 'u1', displayName: 'Thang', email: 'thang@example.com', roles: ['admin', 'learner'], joinedAt: '2026-07-30T00:00:00Z'}], error: null});
render(<AdminWorkspace {...approvalProps} loadUsers={loadUsers} />);
fireEvent.click(screen.getByRole('tab', {name: 'Người dùng'}));
expect(await screen.findByText('thang@example.com')).toBeInTheDocument();
expect(screen.getByText('admin, learner')).toBeInTheDocument();
```

Also assert default `Duyệt bài` renders approval content, and empty/error responses show `Chưa có người dùng nào.` / `Không thể tải danh sách người dùng.`.

- [ ] **Step 2: Verify RED**

Run: `npm test -- --run src/components/AdminWorkspace.test.tsx`

Expected: FAIL because `AdminWorkspace` does not exist.

- [ ] **Step 3: Write the minimal implementation**

Use semantic `role="tablist"`, `role="tab"`, and `aria-selected`. Keep `AdminApprovalView` unchanged in `Duyệt bài`. In `Người dùng`, show loading, empty, and error states plus a responsive table with `Tên`, `Email`, `Vai trò`, and `Tham gia`. Format `joinedAt` with `Intl.DateTimeFormat('vi-VN')`.

In `App`, render:

```tsx
{currentTab === 'admin' && userRole === 'admin' && <AdminWorkspace words={words} onApproveWord={handleApproveWord} onRejectWord={handleRejectWord} onMergeWithGlobal={handleApproveWord} />}
```

- [ ] **Step 4: Verify GREEN and regression suite**

Run: `npm test -- --run src/components/AdminWorkspace.test.tsx && npm test -- --run && npm run lint && npm run build`

Expected: all commands exit 0.

- [ ] **Step 5: Commit**

Run: `git add src/components/AdminWorkspace.tsx src/components/AdminWorkspace.test.tsx src/App.tsx && git commit -m "feat: add admin submissions and users tabs"`

## Self-review

- Tasks cover navigation, nested tabs, user columns, RLS-backed query, loading/empty/error states, and tests.
- The plan leaves schema/RLS and approval behavior untouched.
- All later interfaces are defined before use; no placeholders remain.
