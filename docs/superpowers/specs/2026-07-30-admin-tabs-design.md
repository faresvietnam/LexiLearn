# LexiLearn — Admin workspace

The Admin workspace is intentionally limited to the user directory. Vocabulary is no longer submitted for approval or merged by an administrator; private words are owned and studyable by the learner immediately, while exact matches may link to the existing Global Vocabulary entry.

## Scope

- Show the Admin navigation item only to users with the admin role.
- Show account name, email, role, and join date.
- Keep learner navigation free of admin controls and moderation badges.

## Removed

The former `Duyệt bài` tab, pending badge, Approve, Reject, Merge, Edit Suggestion, and moderation RPC are retired from the application. Historical Supabase tables and migrations remain only for replay compatibility.
