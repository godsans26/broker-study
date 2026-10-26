\set ON_ERROR_STOP on
create role anon nologin;
create role authenticated nologin;
create schema auth;
create table auth.users(id uuid primary key);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
grant usage on schema auth to authenticated, anon;
grant execute on function auth.uid() to authenticated, anon;
insert into auth.users values ('11111111-1111-4111-8111-111111111111'), ('22222222-2222-4222-8222-222222222222');
-- Reproduce Supabase's direct default function grants, not only PostgreSQL PUBLIC.
alter default privileges in schema public grant execute on functions to anon, authenticated;
\i supabase/schema.sql
begin;
set local role authenticated;
set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';
select public.merge_study_progress('practice:test','{"schema":1,"entries":{"answer:practice:a":{"stamp":"000000000001000:000000:device-a","value":2}}}');
select public.merge_study_progress('practice:test','{"schema":1,"entries":{"answer:practice:b":{"stamp":"000000000001000:000000:device-b","value":1}}}');
do $$ begin
  if (select count(*) from public.study_progress) <> 1 then raise exception 'Own row missing'; end if;
  if (select payload->'entries'->'answer:practice:a'->>'value' from public.study_progress) <> '2' then raise exception 'Lost first answer'; end if;
end $$;
select public.merge_study_progress('practice:test','{"schema":1,"entries":{"answer:practice:a":{"stamp":"000000000001001:000000:device-a","value":null}}}');
select public.merge_study_progress('practice:test','{"schema":1,"entries":{"answer:practice:a":{"stamp":"000000000001000:000000:device-a","value":2}}}');
do $$ begin
  if (select payload->'entries'->'answer:practice:a'->'value' from public.study_progress) <> 'null'::jsonb then raise exception 'Old answer resurrected'; end if;
end $$;
set local request.jwt.claim.sub = '22222222-2222-4222-8222-222222222222';
do $$ begin
  if (select count(*) from public.study_progress) <> 0 then raise exception 'Other user can read private record'; end if;
  update public.study_progress set payload = '{}'::jsonb;
  if found then raise exception 'Other user can update private record'; end if;
  begin
    insert into public.study_progress(user_id,document_id) values('11111111-1111-4111-8111-111111111111','practice:forged');
    raise exception 'Forged owner was accepted';
  exception when insufficient_privilege then null;
  end;
end $$;
set local role anon;
do $$ begin
  begin perform * from public.study_progress;raise exception 'Anonymous access allowed';exception when insufficient_privilege then null;end;
  begin perform public.merge_study_progress('practice:test','{"schema":1,"entries":{}}');raise exception 'Anonymous RPC allowed';exception when insufficient_privilege then null;end;
end $$;
rollback;
select 'Database merge and account isolation checks passed' as result;
