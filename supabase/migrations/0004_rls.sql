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
