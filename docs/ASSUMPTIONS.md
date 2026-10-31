# Assumptions and decisions

Where the spec was ambiguous, the simplest option was chosen and recorded here.

## Structure
- The workspace uses `frontend/` and `backend/` instead of the spec's `apps/web` and `apps/api`.
- The backend uses Express 5 (stable, native async errors). Handlers are still wrapped for clarity.
- The earlier partial scaffold was moved to `_legacy/` rather than deleted. It is not used and can be removed.

## Schema additions (beyond Section 4)
- `profiles.phone`, `profiles.bio`, `profiles.avatar_path` support the **user profile** page. Users may update only `full_name`, `phone`, `bio`, `avatar_path` (column-level grants plus RLS). Role, email, roll number and flags are admin-only.
- `updated_at` was added to every mutable table, and `created_at` to the link tables, per rule 8.
- `assignments.attachment_name`, `submissions.file_name` and `complaints.attachment_name` keep original download names.
- `quizzes.shuffle_questions` is the optional shuffle flag. The shuffle is deterministic per attempt, so a resumed attempt keeps its order.
- A `notifications` table provides the in-app notice when a complaint's status changes (Feature 9). It is live via Realtime.
- `avatars` is a fourth private bucket (2 MB). Avatar signed URLs last 1 hour because they appear on every page. All other files use 60 s.
- SQL helpers were added: `is_admin()`, `shares_course()`, `quiz_total_marks()`, `save_quiz_questions()` (atomic question + answer-key save, service-role only), `revoke_user_sessions()` (service-role only), `mark_announcements_read()` and `unread_announcement_count()`.

## Behaviour
- **Admins and `/me/courses`:** the spec lists Student/Teacher only, so admins get 403 and use `/api/admin/courses`. Admins can open any course workspace (`/courses/:id`) read/manage.
- **Extra read endpoints** the UI needs: `GET /courses/:id`, `/courses/:id/members`, `/assignments/:id`, `/assignments/:id/attachment`, `/submissions/:id/download`, `/quizzes/:id`, `DELETE /quizzes/:id` (only without attempts), `/complaints/:id`, `/complaints/:id/attachment`, `/announcements/unread-count`, `/notifications*`, `/me/dashboard`, `/admin/courses/:id`, `/admin/courses/:id/enrollments` (GET), `/admin/audit-log`.
- **CSV enrollment preview:** `POST /admin/courses/:id/enrollments?dryRun=true` returns the same report without writing.
- **Resources delete:** uploader or admin (as specified). Another teacher of the same course cannot delete someone else's upload.
- **Assignments:** the due date must be in the future on create. Max marks cannot be lowered below an existing grade (409). Resubmission replaces text/file and clears the grade.
- **Quizzes:** expiry is `started_at + time_limit`, plus a 10 s grace. A late submit is recorded with score 0 ("scored 0 for unanswered"). An unsubmitted expired attempt is closed with score 0 when next viewed. Re-calling start on an unexpired attempt resumes it (not a second attempt). Publishing/unpublishing is always allowed; other edits are blocked once attempts exist.
- **Complaint transitions** are strictly `open → in_review → resolved | rejected`. The optional follow-up comment extension is not built.
- **Chat:** admins can read and moderate but not post. A deleted message body is overwritten with `[deleted]` so Realtime subscribers never receive the original text.
- **Password reset:** `/auth/reset-password` accepts only a token whose `amr` is `recovery`/`otp` (a normal session token cannot reset). All sessions are revoked afterwards, which makes the link single-use. Forgot-password responds immediately and identically for any email (the email is sent asynchronously).
- **Change password** verifies the current password, updates it and keeps the current session.
- **Profiles visibility (RLS):** a user can see their own row, staff rows (authors of global announcements) and anyone who shares a course with them. Students do not receive classmates' emails from the members endpoint.
- **Open items (spec §Open items):** one quiz attempt; text-only chat; marks are released on save; notifications are in-app only.

## Verified against the live Supabase project
- `0006_api_grants.sql`: this project does not grant new public tables to the Data API roles, so PostgREST hid every table until explicit grants were added (RLS still applies).
- Changing a password revokes the user's sessions, so `/auth/change-password` returns a fresh session (access token + refresh cookie).
- `announcements` has two paths to `profiles` (author and read receipts); the author embed names its FK.
- Realtime authenticates with the user's API-issued JWT via the client's `accessToken` callback. With only the publishable key it ran as `anon` and RLS (correctly) delivered nothing.
- A 46-check API smoke test passed across admin, teacher and student: auth, RLS reads/inserts, storage upload + signed download, magic-byte rejection, grading, quiz auto-grade and single attempt, marks view, chat, complaints and notifications, profile edit and audit log. Chat messages also appeared live in the browser.

## Not done / known limits
- Playwright E2E flows were not added. They need a running Supabase project with seeded data. The API suite (174 tests, mocked data layer) and frontend unit tests run with `npm test`.
- `npm audit` still reports `react-router` v6 and `zod` v3 advisories, whose fixes need the v7/v4 major migrations. Dev-only advisories (esbuild/vitest) affect the local dev server only.
