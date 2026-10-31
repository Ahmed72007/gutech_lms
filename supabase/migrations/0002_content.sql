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
