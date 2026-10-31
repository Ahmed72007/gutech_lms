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
