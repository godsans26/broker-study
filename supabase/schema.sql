-- Run once in the Supabase SQL Editor. No service_role key belongs in the app.
begin;
create table if not exists public.study_progress (
  user_id uuid not null references auth.users(id) on delete cascade,
  document_id text not null check (document_id ~ '^(practice|past):[a-zA-Z0-9_-]{1,100}$'),
  payload jsonb not null default '{"schema":1,"entries":{}}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (user_id, document_id)
);
alter table public.study_progress enable row level security;
revoke all on public.study_progress from anon;
revoke all on public.study_progress from authenticated;
grant select, insert, update on public.study_progress to authenticated;
drop policy if exists study_select_own on public.study_progress;
drop policy if exists study_insert_own on public.study_progress;
drop policy if exists study_update_own on public.study_progress;
create policy study_select_own on public.study_progress for select to authenticated using ((select auth.uid()) = user_id);
create policy study_insert_own on public.study_progress for insert to authenticated with check ((select auth.uid()) = user_id);
create policy study_update_own on public.study_progress for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

create or replace function public.merge_study_progress(p_document text, p_payload jsonb)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  uid uuid := auth.uid();
  existing jsonb;
  merged jsonb;
  item record;
begin
  if uid is null then raise exception 'Authentication required'; end if;
  if p_document is null or p_document !~ '^(practice|past):[a-zA-Z0-9_-]{1,100}$' then raise exception 'Invalid document'; end if;
  if p_payload is null or p_payload->>'schema' is distinct from '1'
     or jsonb_typeof(p_payload->'entries') is distinct from 'object'
     or octet_length(p_payload::text) > 2000000 then raise exception 'Invalid payload'; end if;
  if (select count(*) from jsonb_each(p_payload->'entries')) > 8000 then raise exception 'Too many entries'; end if;
  for item in select key, value from jsonb_each(p_payload->'entries') loop
    if item.key <> 'session' and item.key !~ '^(answer|flag):[a-zA-Z0-9:_-]{1,160}$' then raise exception 'Invalid key'; end if;
    if jsonb_typeof(item.value) is distinct from 'object' or not (item.value ? 'value')
       or coalesce(item.value->>'stamp','') !~ '^[0-9]{15}:[0-9]{6}:[a-zA-Z0-9-]{1,64}$' then raise exception 'Invalid stamp'; end if;
    if item.key like 'answer:%' and item.value->'value' not in ('null'::jsonb,'0'::jsonb,'1'::jsonb,'2'::jsonb,'3'::jsonb) then raise exception 'Invalid answer'; end if;
    if item.key like 'flag:%' and item.value->'value' not in ('null'::jsonb,'true'::jsonb,'false'::jsonb) then raise exception 'Invalid flag'; end if;
  end loop;
  -- The insert also serializes concurrent first writes for a new user/document.
  insert into public.study_progress(user_id, document_id) values(uid, p_document) on conflict do nothing;
  select payload into existing from public.study_progress where user_id = uid and document_id = p_document for update;
  merged := existing->'entries';
  for item in select key, value from jsonb_each(p_payload->'entries') loop
    if not (merged ? item.key) or (item.value->>'stamp') collate "C" > (merged->item.key->>'stamp') collate "C" then
      merged := jsonb_set(merged, array[item.key], item.value, true);
    end if;
  end loop;
  if (select count(*) from jsonb_each(merged)) > 8000 or octet_length(merged::text) > 2000000 then raise exception 'Merged payload too large'; end if;
  existing := jsonb_build_object('schema',1,'entries',merged);
  update public.study_progress set payload = existing, updated_at = now() where user_id = uid and document_id = p_document;
  return existing;
end;
$$;
revoke all on function public.merge_study_progress(text,jsonb) from public;
-- Supabase also grants anon EXECUTE directly through its default privileges.
revoke all on function public.merge_study_progress(text,jsonb) from anon;
grant execute on function public.merge_study_progress(text,jsonb) to authenticated;
commit;
