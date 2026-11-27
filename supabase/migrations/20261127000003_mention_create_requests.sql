-- A publish response can be lost after commit. Scope receipts to the author
-- and keep a tombstone on deletion so replay cannot resurrect a removed post.
create table if not exists public.mention_create_requests (
  author_id uuid not null references public.profiles(id) on delete cascade,
  request_id uuid not null,
  payload_hash bytea not null,
  practice_id uuid references public.practices(id) on delete set null,
  primary key (author_id,request_id)
);
alter table public.mention_create_requests enable row level security;
revoke all on public.mention_create_requests from public,anon,authenticated;

create or replace function public.create_mention_practice_once(
  p_request_id uuid,p_title text,p_body text,p_image_path text,p_mentions jsonb,p_source_url text default null)
returns public.practices language plpgsql security definer set search_path='' as $$
declare
  actor uuid:=auth.uid();
  payload bytea:=sha256(convert_to(jsonb_build_array(p_title,p_body,p_image_path,p_mentions,p_source_url)::text,'UTF8'));
  receipt public.mention_create_requests;
  result public.practices;
begin
  if actor is null then raise exception 'Sign in to publish a practice' using errcode='42501'; end if;
  if p_request_id is null then raise exception 'A publish request ID is required'; end if;
  -- One transaction owns a given author's request at a time, including when
  -- the first attempt is still running. Failure rolls back both post and receipt.
  perform pg_advisory_xact_lock(hashtextextended(actor::text||':'||p_request_id::text,0));
  select * into receipt from public.mention_create_requests where author_id=actor and request_id=p_request_id;
  if found then
    if receipt.practice_id is null then raise exception 'This practice was published and later removed.'; end if;
    if receipt.payload_hash<>payload then
      raise exception 'An earlier version of this practice was already published (ID %). Open it from your profile to make changes.',receipt.practice_id;
    end if;
    select * into strict result from public.practices where id=receipt.practice_id and author_id=actor;
    return result;
  end if;
  select * into result from public.save_mention_practice(null,p_title,p_body,p_image_path,p_mentions,false,p_source_url);
  insert into public.mention_create_requests(author_id,request_id,payload_hash,practice_id) values(actor,p_request_id,payload,result.id);
  return result;
end $$;
revoke all on function public.create_mention_practice_once(uuid,text,text,text,jsonb,text) from public,anon;
grant execute on function public.create_mention_practice_once(uuid,text,text,text,jsonb,text) to authenticated;
notify pgrst,'reload schema';
