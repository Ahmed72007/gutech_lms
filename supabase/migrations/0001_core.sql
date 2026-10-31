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
