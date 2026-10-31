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
