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
