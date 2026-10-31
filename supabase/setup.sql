-- GENERATED: migrations 0001-0006 + seed.sql in one file for the Supabase SQL editor.
-- Run once on an EMPTY project. Source of truth stays in migrations/ and seed.sql.

-- ===== migrations/0001_core.sql =====
-- 0001_core: identities, courses, membership, audit trail, notifications and RLS helpers.

create extension if not exists pgcrypto;

create type public.user_role as enum ('admin', 'teacher', 'student');

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- Users: id matches auth.users.id
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null check (char_length(full_name) between 2 and 120),
  email text not null unique,
  role public.user_role not null,
  roll_no text unique, -- students only
  phone text check (phone is null or char_length(phone) <= 32),
  bio text check (bio is null or char_length(bio) <= 500),
  avatar_path text,
  is_active boolean not null default true,
  must_change_password boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.courses (
  id uuid primary key default gen_random_uuid(),
  code text not null unique, -- e.g. CS101
  title text not null,
  description text,
  is_archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.course_teachers (
  course_id uuid references public.courses (id) on delete cascade,
  teacher_id uuid references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (course_id, teacher_id)
);

create table public.enrollments (
  course_id uuid references public.courses (id) on delete cascade,
  student_id uuid references public.profiles (id) on delete cascade,
  enrolled_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  primary key (course_id, student_id)
);

create table public.audit_log (
  id bigint generated always as identity primary key,
  actor_id uuid references public.profiles (id) on delete set null,
  action text not null,
  entity text not null,
  entity_id uuid,
  at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

-- In-app notices (complaint status changes and similar).
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  kind text not null,
  title text not null,
  body text,
  link text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index on public.profiles (role);
create index on public.course_teachers (teacher_id);
create index on public.enrollments (student_id);
create index on public.audit_log (at desc);
create index on public.notifications (user_id, created_at desc);

create trigger profiles_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();
create trigger courses_updated_at before update on public.courses
  for each row execute function public.set_updated_at();

-- RLS helpers. SECURITY DEFINER so policies can call them without recursing into RLS.
create or replace function public.is_admin()
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin' and is_active
  );
$$;

create or replace function public.is_enrolled(p_course_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1
    from public.enrollments e
    join public.courses c on c.id = e.course_id
    where e.course_id = p_course_id and e.student_id = auth.uid() and not c.is_archived
  );
$$;

create or replace function public.teaches(p_course_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.course_teachers
    where course_id = p_course_id and teacher_id = auth.uid()
  );
$$;

create or replace function public.is_course_member(p_course_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select public.teaches(p_course_id) or public.is_enrolled(p_course_id);
$$;

-- True when the current user and p_profile_id belong to at least one common course.
create or replace function public.shares_course(p_profile_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  with mine as (
    select course_id from public.enrollments where student_id = auth.uid()
    union
    select course_id from public.course_teachers where teacher_id = auth.uid()
  )
  select exists (
    select 1 from public.enrollments e join mine m on m.course_id = e.course_id where e.student_id = p_profile_id
    union all
    select 1 from public.course_teachers t join mine m on m.course_id = t.course_id where t.teacher_id = p_profile_id
  );
$$;

-- Server-only: revoke every session (refresh tokens cascade) for a user.
create or replace function public.revoke_user_sessions(p_user_id uuid)
returns void
language sql security definer set search_path = public, auth
as $$
  delete from auth.sessions where user_id = p_user_id;
$$;

revoke execute on function public.revoke_user_sessions(uuid) from public, anon, authenticated;
grant execute on function public.revoke_user_sessions(uuid) to service_role;

-- ===== migrations/0002_content.sql =====
-- 0002_content: resources, assignments, submissions, quizzes and the derived marks view.

create table public.resources (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses (id) on delete cascade,
  uploaded_by uuid not null references public.profiles (id),
  title text not null,
  description text,
  file_path text not null, -- path in 'resources' bucket
  file_name text not null,
  mime_type text not null,
  size_bytes bigint not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.assignments (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses (id) on delete cascade,
  created_by uuid not null references public.profiles (id),
  title text not null,
  instructions text not null,
  max_marks numeric(6, 2) not null check (max_marks > 0),
  due_at timestamptz not null,
  allow_late boolean not null default false,
  attachment_path text,
  attachment_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.submissions (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null references public.assignments (id) on delete cascade,
  student_id uuid not null references public.profiles (id) on delete cascade,
  text_answer text,
  file_path text,
  file_name text,
  submitted_at timestamptz not null default now(),
  is_late boolean not null default false,
  marks_obtained numeric(6, 2),
  feedback text,
  graded_by uuid references public.profiles (id),
  graded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (assignment_id, student_id)
);

create table public.quizzes (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses (id) on delete cascade,
  created_by uuid not null references public.profiles (id),
  title text not null,
  description text,
  time_limit_minutes int not null check (time_limit_minutes > 0),
  opens_at timestamptz not null,
  closes_at timestamptz not null,
  is_published boolean not null default false,
  shuffle_questions boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (closes_at > opens_at)
);

create type public.question_type as enum ('mcq_single', 'mcq_multi', 'true_false');

create table public.quiz_questions (
  id uuid primary key default gen_random_uuid(),
  quiz_id uuid not null references public.quizzes (id) on delete cascade,
  position int not null,
  type public.question_type not null,
  prompt text not null,
  options jsonb not null, -- [{"id":"a","text":"..."}]
  marks numeric(5, 2) not null default 1,
  created_at timestamptz not null default now()
);

-- Teacher/admin only (RLS): correct option ids
create table public.quiz_answers (
  question_id uuid primary key references public.quiz_questions (id) on delete cascade,
  correct_option_ids text[] not null,
  created_at timestamptz not null default now()
);

create table public.quiz_attempts (
  id uuid primary key default gen_random_uuid(),
  quiz_id uuid not null references public.quizzes (id) on delete cascade,
  student_id uuid not null references public.profiles (id) on delete cascade,
  started_at timestamptz not null default now(),
  submitted_at timestamptz,
  answers jsonb not null default '{}', -- {question_id: [option_ids]}
  score numeric(6, 2),
  created_at timestamptz not null default now(),
  unique (quiz_id, student_id) -- one attempt per student
);

create index on public.resources (course_id, created_at desc);
create index on public.assignments (course_id, due_at);
create index on public.submissions (assignment_id);
create index on public.submissions (student_id);
create index on public.quizzes (course_id, opens_at);
create index on public.quiz_questions (quiz_id, position);
create index on public.quiz_attempts (quiz_id);
create index on public.quiz_attempts (student_id);

create trigger resources_updated_at before update on public.resources
  for each row execute function public.set_updated_at();
create trigger assignments_updated_at before update on public.assignments
  for each row execute function public.set_updated_at();
create trigger submissions_updated_at before update on public.submissions
  for each row execute function public.set_updated_at();
create trigger quizzes_updated_at before update on public.quizzes
  for each row execute function public.set_updated_at();

-- Total marks of a quiz, readable by students without exposing the questions table.
create or replace function public.quiz_total_marks(p_quiz_id uuid)
returns numeric
language sql stable security definer set search_path = public
as $$
  select coalesce(sum(marks), 0) from public.quiz_questions where quiz_id = p_quiz_id;
$$;

-- Replace a quiz's questions and answer key atomically. Server-only.
create or replace function public.save_quiz_questions(p_quiz_id uuid, p_questions jsonb)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  q jsonb;
  v_question_id uuid;
  v_position int := 0;
begin
  delete from public.quiz_questions where quiz_id = p_quiz_id;
  for q in select value from jsonb_array_elements(p_questions) loop
    v_position := v_position + 1;
    insert into public.quiz_questions (quiz_id, position, type, prompt, options, marks)
    values (
      p_quiz_id,
      v_position,
      (q ->> 'type')::public.question_type,
      q ->> 'prompt',
      q -> 'options',
      (q ->> 'marks')::numeric
    )
    returning id into v_question_id;

    insert into public.quiz_answers (question_id, correct_option_ids)
    values (v_question_id, array(select jsonb_array_elements_text(q -> 'correctOptionIds')));
  end loop;
end;
$$;

revoke execute on function public.save_quiz_questions(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.save_quiz_questions(uuid, jsonb) to service_role;

-- Marks are derived, not duplicated. security_invoker keeps the caller's RLS in force.
create view public.v_student_marks
with (security_invoker = true)
as
  select
    s.student_id,
    a.course_id,
    'assignment'::text as kind,
    a.id as item_id,
    a.title,
    s.marks_obtained as obtained,
    a.max_marks as max,
    s.graded_at
  from public.submissions s
  join public.assignments a on a.id = s.assignment_id
  union all
  select
    qa.student_id,
    q.course_id,
    'quiz'::text as kind,
    q.id as item_id,
    q.title,
    qa.score as obtained,
    public.quiz_total_marks(q.id) as max,
    qa.submitted_at as graded_at
  from public.quiz_attempts qa
  join public.quizzes q on q.id = qa.quiz_id
  where qa.submitted_at is not null;

-- ===== migrations/0003_communication.sql =====
-- 0003_communication: announcements, read receipts, classroom chat and complaints.

create table public.announcements (
  id uuid primary key default gen_random_uuid(),
  course_id uuid references public.courses (id) on delete cascade, -- null = global
  author_id uuid not null references public.profiles (id),
  title text not null,
  body text not null,
  is_pinned boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.announcement_reads (
  user_id uuid references public.profiles (id) on delete cascade,
  announcement_id uuid references public.announcements (id) on delete cascade,
  read_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  primary key (user_id, announcement_id)
);

create table public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses (id) on delete cascade,
  sender_id uuid not null references public.profiles (id),
  body text not null check (char_length(body) between 1 and 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create type public.complaint_status as enum ('open', 'in_review', 'resolved', 'rejected');

create table public.complaints (
  id uuid primary key default gen_random_uuid(),
  raised_by uuid not null references public.profiles (id),
  course_id uuid references public.courses (id),
  category text not null check (category in ('academic', 'technical', 'facility', 'conduct', 'other')),
  subject text not null,
  description text not null,
  attachment_path text,
  attachment_name text,
  status public.complaint_status not null default 'open',
  admin_response text,
  resolved_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index on public.announcements (course_id, created_at desc);
create index on public.announcements (is_pinned desc, created_at desc);
create index on public.chat_messages (course_id, created_at desc);
create index on public.complaints (status, created_at desc);
create index on public.complaints (raised_by, created_at desc);

create trigger announcements_updated_at before update on public.announcements
  for each row execute function public.set_updated_at();
create trigger chat_messages_updated_at before update on public.chat_messages
  for each row execute function public.set_updated_at();
create trigger complaints_updated_at before update on public.complaints
  for each row execute function public.set_updated_at();

-- Mark every visible announcement up to p_before as read. SECURITY INVOKER: RLS decides visibility.
create or replace function public.mark_announcements_read(p_before timestamptz)
returns integer
language sql security invoker set search_path = public
as $$
  with inserted as (
    insert into public.announcement_reads (user_id, announcement_id)
    select auth.uid(), a.id
    from public.announcements a
    where a.created_at <= p_before
    on conflict do nothing
    returning 1
  )
  select count(*)::int from inserted;
$$;

create or replace function public.unread_announcement_count()
returns integer
language sql stable security invoker set search_path = public
as $$
  select count(*)::int
  from public.announcements a
  where a.author_id <> auth.uid()
    and not exists (
      select 1 from public.announcement_reads r
      where r.announcement_id = a.id and r.user_id = auth.uid()
    );
$$;

-- Realtime: chat, announcement badges and notices.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.chat_messages, public.announcements, public.notifications;
  end if;
end;
$$;

-- ===== migrations/0004_rls.sql =====
-- 0004_rls: row level security on every table. The API enforces permissions first;
-- these policies are the second line of defense and guard direct client access (Realtime).
-- The service-role client bypasses RLS and is only used by server-side code.

alter table public.profiles enable row level security;
alter table public.courses enable row level security;
alter table public.course_teachers enable row level security;
alter table public.enrollments enable row level security;
alter table public.audit_log enable row level security;
alter table public.notifications enable row level security;
alter table public.resources enable row level security;
alter table public.assignments enable row level security;
alter table public.submissions enable row level security;
alter table public.quizzes enable row level security;
alter table public.quiz_questions enable row level security;
alter table public.quiz_answers enable row level security;
alter table public.quiz_attempts enable row level security;
alter table public.announcements enable row level security;
alter table public.announcement_reads enable row level security;
alter table public.chat_messages enable row level security;
alter table public.complaints enable row level security;

-- Anonymous visitors never read application data.
revoke all on all tables in schema public from anon;

-- profiles ---------------------------------------------------------------
-- Own row, staff (authors of global announcements), and people who share a course.
create policy profiles_select on public.profiles for select to authenticated
  using (id = (select auth.uid()) or role <> 'student' or public.is_admin() or public.shares_course(id));

-- Users may edit only their own descriptive fields; role, email and flags stay server-managed.
revoke update on public.profiles from authenticated;
grant update (full_name, phone, bio, avatar_path) on public.profiles to authenticated;
create policy profiles_update_own on public.profiles for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- courses and membership -------------------------------------------------
create policy courses_select on public.courses for select to authenticated
  using (public.is_admin() or public.teaches(id) or public.is_enrolled(id));
create policy courses_admin_write on public.courses for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy course_teachers_select on public.course_teachers for select to authenticated
  using (public.is_admin() or public.is_course_member(course_id));
create policy course_teachers_admin_write on public.course_teachers for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy enrollments_select on public.enrollments for select to authenticated
  using (student_id = (select auth.uid()) or public.is_admin() or public.teaches(course_id));
create policy enrollments_admin_write on public.enrollments for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- audit + notifications --------------------------------------------------
create policy audit_log_admin_read on public.audit_log for select to authenticated
  using (public.is_admin());

create policy notifications_own_select on public.notifications for select to authenticated
  using (user_id = (select auth.uid()));
create policy notifications_own_update on public.notifications for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- resources --------------------------------------------------------------
create policy resources_select on public.resources for select to authenticated
  using (public.is_admin() or public.is_course_member(course_id));
create policy resources_insert on public.resources for insert to authenticated
  with check (uploaded_by = (select auth.uid()) and (public.is_admin() or public.teaches(course_id)));
create policy resources_delete on public.resources for delete to authenticated
  using (uploaded_by = (select auth.uid()) or public.is_admin());

-- assignments + submissions ----------------------------------------------
create policy assignments_select on public.assignments for select to authenticated
  using (public.is_admin() or public.is_course_member(course_id));
create policy assignments_teacher_write on public.assignments for all to authenticated
  using (public.is_admin() or public.teaches(course_id))
  with check (public.is_admin() or public.teaches(course_id));

-- A student only ever sees their own submission.
create policy submissions_select on public.submissions for select to authenticated
  using (
    student_id = (select auth.uid())
    or public.is_admin()
    or exists (select 1 from public.assignments a where a.id = assignment_id and public.teaches(a.course_id))
  );
create policy submissions_student_insert on public.submissions for insert to authenticated
  with check (
    student_id = (select auth.uid())
    and exists (select 1 from public.assignments a where a.id = assignment_id and public.is_enrolled(a.course_id))
  );
create policy submissions_grader_update on public.submissions for update to authenticated
  using (
    public.is_admin()
    or exists (select 1 from public.assignments a where a.id = assignment_id and public.teaches(a.course_id))
  );

-- quizzes ----------------------------------------------------------------
create policy quizzes_select on public.quizzes for select to authenticated
  using (public.is_admin() or public.teaches(course_id) or (is_published and public.is_enrolled(course_id)));
create policy quizzes_teacher_write on public.quizzes for all to authenticated
  using (public.is_admin() or public.teaches(course_id))
  with check (public.is_admin() or public.teaches(course_id));

-- Questions are served to students by the API only during an attempt (without answers).
create policy quiz_questions_staff on public.quiz_questions for all to authenticated
  using (public.is_admin() or exists (select 1 from public.quizzes q where q.id = quiz_id and public.teaches(q.course_id)))
  with check (public.is_admin() or exists (select 1 from public.quizzes q where q.id = quiz_id and public.teaches(q.course_id)));

-- The answer key is never readable by students, even with a direct Supabase call.
create policy quiz_answers_staff on public.quiz_answers for all to authenticated
  using (
    public.is_admin()
    or exists (
      select 1 from public.quiz_questions qq join public.quizzes q on q.id = qq.quiz_id
      where qq.id = question_id and public.teaches(q.course_id)
    )
  )
  with check (
    public.is_admin()
    or exists (
      select 1 from public.quiz_questions qq join public.quizzes q on q.id = qq.quiz_id
      where qq.id = question_id and public.teaches(q.course_id)
    )
  );

-- Attempts are created and graded by the API (service role); clients may only read.
create policy quiz_attempts_select on public.quiz_attempts for select to authenticated
  using (
    student_id = (select auth.uid())
    or public.is_admin()
    or exists (select 1 from public.quizzes q where q.id = quiz_id and public.teaches(q.course_id))
  );

-- announcements ----------------------------------------------------------
create policy announcements_select on public.announcements for select to authenticated
  using (course_id is null or public.is_admin() or public.is_course_member(course_id));
create policy announcements_insert on public.announcements for insert to authenticated
  with check (
    author_id = (select auth.uid())
    and (public.is_admin() or (course_id is not null and public.teaches(course_id)))
  );
create policy announcements_update on public.announcements for update to authenticated
  using (author_id = (select auth.uid()) or public.is_admin());
create policy announcements_delete on public.announcements for delete to authenticated
  using (author_id = (select auth.uid()) or public.is_admin());

create policy announcement_reads_own on public.announcement_reads for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- chat -------------------------------------------------------------------
create policy chat_select on public.chat_messages for select to authenticated
  using (public.is_admin() or public.is_course_member(course_id));
create policy chat_insert on public.chat_messages for insert to authenticated
  with check (sender_id = (select auth.uid()) and public.is_course_member(course_id));

-- complaints -------------------------------------------------------------
create policy complaints_select on public.complaints for select to authenticated
  using (raised_by = (select auth.uid()) or public.is_admin());
create policy complaints_insert on public.complaints for insert to authenticated
  with check (raised_by = (select auth.uid()) and not public.is_admin());
create policy complaints_admin_update on public.complaints for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- ===== migrations/0005_storage.sql =====
-- 0005_storage: private buckets. No storage.objects policies are created on purpose:
-- browsers never touch storage directly; the API uploads with the service role and
-- hands out short-lived signed URLs.

insert into storage.buckets (id, name, public, file_size_limit)
values
  ('resources', 'resources', false, 26214400),                     -- 25 MB
  ('submissions', 'submissions', false, 26214400),                 -- 25 MB
  ('complaint-attachments', 'complaint-attachments', false, 10485760), -- 10 MB
  ('avatars', 'avatars', false, 2097152)                           -- 2 MB
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit;

-- ===== migrations/0006_api_grants.sql =====
-- 0006_api_grants: explicit Data API privileges.
-- Newer Supabase projects no longer grant public-schema tables to the API roles by
-- default, and PostgREST hides tables the API roles cannot access. RLS (0004) still
-- decides which rows each signed-in user sees.

grant usage on schema public to authenticated, service_role;

-- Server-side service role: full access (bypasses RLS; used only after API authorization).
grant all on all tables in schema public to service_role;
grant all on all sequences in schema public to service_role;
grant execute on all functions in schema public to service_role;

-- Signed-in users: table access filtered by RLS policies.
grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage on all sequences in schema public to authenticated;

-- Users may edit only their own descriptive profile fields (keeps 0004's column rule).
revoke update on public.profiles from authenticated;
grant update (full_name, phone, bio, avatar_path) on public.profiles to authenticated;

-- Anonymous visitors never read application data.
revoke all on all tables in schema public from anon;

-- Server-only functions stay server-only.
revoke execute on function public.revoke_user_sessions(uuid) from public, anon, authenticated;
revoke execute on function public.save_quiz_questions(uuid, jsonb) from public, anon, authenticated;

-- Future tables get the same treatment.
alter default privileges in schema public grant all on tables to service_role;
alter default privileges in schema public grant select, insert, update, delete on tables to authenticated;

notify pgrst, 'reload schema';

-- ===== seed.sql =====
-- LOCAL DEVELOPMENT ONLY (supabase db reset). For a hosted project use `npm run db:seed`.
-- 1 admin, 2 teachers, 5 students, 3 courses. Every account uses the temporary password
-- ChangeMe123! and must change it at first sign-in. Never load this into production.

with demo_users (id, email, full_name, role, roll_no) as (
  values
    ('10000000-0000-4000-8000-000000000001'::uuid, 'admin@gutech.example', 'Amina Al-Balushi', 'admin'::public.user_role, null::text),
    ('10000000-0000-4000-8000-000000000002'::uuid, 'teacher.one@gutech.example', 'Salim Al-Hinai', 'teacher', null),
    ('10000000-0000-4000-8000-000000000003'::uuid, 'teacher.two@gutech.example', 'Maha Al-Rawahi', 'teacher', null),
    ('10000000-0000-4000-8000-000000000004'::uuid, 'student.one@gutech.example', 'Noor Said', 'student', 'S2026001'),
    ('10000000-0000-4000-8000-000000000005'::uuid, 'student.two@gutech.example', 'Omar Nasser', 'student', 'S2026002'),
    ('10000000-0000-4000-8000-000000000006'::uuid, 'student.three@gutech.example', 'Mariam Ahmed', 'student', 'S2026003'),
    ('10000000-0000-4000-8000-000000000007'::uuid, 'student.four@gutech.example', 'Yusuf Hamad', 'student', 'S2026004'),
    ('10000000-0000-4000-8000-000000000008'::uuid, 'student.five@gutech.example', 'Laila Khalid', 'student', 'S2026005')
),
auth_rows as (
  insert into auth.users (
    id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
    confirmation_token, recovery_token, email_change_token_new, email_change,
    created_at, updated_at, raw_app_meta_data, raw_user_meta_data, is_sso_user, is_anonymous
  )
  select
    id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', email,
    crypt('ChangeMe123!', gen_salt('bf')), now(),
    '', '', '', '',
    now(), now(), '{"provider":"email","providers":["email"]}'::jsonb,
    jsonb_build_object('full_name', full_name), false, false
  from demo_users
  on conflict (id) do nothing
  returning id
)
insert into public.profiles (id, full_name, email, role, roll_no, must_change_password)
select d.id, d.full_name, d.email, d.role, d.roll_no, true
from demo_users d
on conflict (id) do nothing;

insert into auth.identities (id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at)
select gen_random_uuid(), u.id,
       jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true),
       'email', u.id::text, now(), now(), now()
from auth.users u
where u.email like '%@gutech.example'
on conflict (provider_id, provider) do nothing;

insert into public.courses (id, code, title, description) values
  ('20000000-0000-4000-8000-000000000001', 'CS101', 'Introduction to Computer Science', 'A practical foundation in computing, programming and problem solving.'),
  ('20000000-0000-4000-8000-000000000002', 'MG204', 'Innovation and Entrepreneurship', 'From opportunity discovery to validating a sustainable venture.'),
  ('20000000-0000-4000-8000-000000000003', 'DS180', 'Data Stories and Visualisation', 'Explore data, reveal patterns and communicate findings with clarity.')
on conflict (code) do nothing;

insert into public.course_teachers (course_id, teacher_id) values
  ('20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000002'),
  ('20000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000002'),
  ('20000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000003')
on conflict do nothing;

-- Students 1-3 take every course; students 4-5 take CS101 and DS180.
insert into public.enrollments (course_id, student_id)
select c.id, p.id
from public.courses c
cross join public.profiles p
where p.role = 'student'
  and (p.roll_no in ('S2026001', 'S2026002', 'S2026003') or c.code <> 'MG204')
on conflict do nothing;

insert into public.announcements (id, course_id, author_id, title, body, is_pinned) values
  ('30000000-0000-4000-8000-000000000001', null, '10000000-0000-4000-8000-000000000001',
   'Welcome to the GUtech learning portal',
   'Your courses, resources, assignments, marks and campus updates now live in one place.', true),
  ('30000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000002',
   'Lab session moved to Thursday',
   'This week''s programming lab moves to Thursday 10:00 in Lab B2.', false)
on conflict (id) do nothing;

insert into public.assignments (id, course_id, created_by, title, instructions, max_marks, due_at, allow_late) values
  ('40000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000002',
   'Problem set 1: Algorithms', 'Solve the five problems and explain the complexity of each solution.', 20, now() + interval '7 days', false),
  ('40000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000002',
   'Chart critique', 'Pick a published chart, critique it and propose an improved version.', 10, now() + interval '3 days', true)
on conflict (id) do nothing;

insert into public.quizzes (id, course_id, created_by, title, description, time_limit_minutes, opens_at, closes_at, is_published) values
  ('50000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000002',
   'Week 1 check-in', 'A short warm-up on computing fundamentals.', 10, now() - interval '1 day', now() + interval '14 days', true)
on conflict (id) do nothing;

select public.save_quiz_questions('50000000-0000-4000-8000-000000000001', '[
  {"type":"mcq_single","prompt":"Which unit executes program instructions?","marks":2,
   "options":[{"id":"a","text":"CPU"},{"id":"b","text":"SSD"},{"id":"c","text":"Monitor"}],"correctOptionIds":["a"]},
  {"type":"mcq_multi","prompt":"Select every programming language.","marks":3,
   "options":[{"id":"a","text":"Python"},{"id":"b","text":"HTML"},{"id":"c","text":"TypeScript"},{"id":"d","text":"SQL"}],"correctOptionIds":["a","c","d"]},
  {"type":"true_false","prompt":"Binary uses base 2.","marks":1,
   "options":[{"id":"true","text":"True"},{"id":"false","text":"False"}],"correctOptionIds":["true"]}
]'::jsonb)
where not exists (select 1 from public.quiz_questions where quiz_id = '50000000-0000-4000-8000-000000000001');

