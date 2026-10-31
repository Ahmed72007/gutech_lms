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
