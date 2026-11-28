-- Platform-specific tool defaults and whole-practice install block overrides.
-- An absent platform means inherit. A present empty practice value suppresses the block.
create function public.valid_platform_commands(commands jsonb, allow_empty boolean)
returns boolean language sql immutable strict parallel safe set search_path='' as $$
  select case when jsonb_typeof(commands)<>'object' then false else not exists (
    select 1 from jsonb_each(commands) entry
    where entry.key not in ('macos','linux','windows')
       or jsonb_typeof(entry.value)<>'string'
       or length(entry.value #>> '{}') > case when allow_empty then 150000 else 8000 end
       or (not allow_empty and btrim(entry.value #>> '{}',E' \t\r\n')='')
  ) end;
$$;

alter table public.tools add column install_commands jsonb not null default '{}'::jsonb
  constraint tools_platform_commands_valid check (public.valid_platform_commands(install_commands,false));
alter table public.practices add column install_overrides jsonb not null default '{}'::jsonb
  constraint practices_platform_overrides_valid check (public.valid_platform_commands(install_overrides,true));
grant insert(install_commands) on public.tools to authenticated;

create or replace function public.edit_catalog_tool(p_id uuid,p_fields jsonb,p_expected_updated_at timestamptz)
returns public.tools language plpgsql security definer set search_path='' as $$
declare result public.tools;
begin
  if auth.uid() is null then raise exception 'Sign in to edit the catalog' using errcode='42501'; end if;
  update public.tools t set
    name=case when p_fields ? 'name' then p_fields->>'name' else t.name end,
    description=case when p_fields ? 'description' then p_fields->>'description' else t.description end,
    apm_id=case when p_fields ? 'apm_id' then p_fields->>'apm_id' else t.apm_id end,
    repo_url=case when p_fields ? 'repo_url' then p_fields->>'repo_url' else t.repo_url end,
    website_url=case when p_fields ? 'website_url' then p_fields->>'website_url' else t.website_url end,
    install_commands=case when p_fields ? 'install_commands' then p_fields->'install_commands' else t.install_commands end,
    install_command=case when p_fields ? 'install_command' then p_fields->>'install_command' else t.install_command end
    where id=p_id and merged_into is null and updated_at=p_expected_updated_at returning * into result;
  if not found then raise exception 'Tool changed or merged. Reload before saving.'; end if;
  return result;
end $$;

create or replace function public.merge_catalog_tools(p_source uuid,p_target uuid)
returns public.tools language plpgsql security definer set search_path='' as $$
declare source public.tools; target public.tools;
begin
  if auth.uid() is null then raise exception 'Sign in to merge tools' using errcode='42501'; end if;
  if p_source=p_target then raise exception 'Choose two different tools'; end if;
  -- Lock catalog entries before any references. Old clients can still POST options.
  perform id from public.tools where id in (p_source,p_target) order by id for update;
  select * into strict source from public.tools where id=p_source;
  select * into strict target from public.tools where id=p_target;
  if source.merged_into=p_target then return target; end if;
  if source.merged_into is not null or target.merged_into is not null then raise exception 'Tool already merged. Reload the catalog.'; end if;

  if exists (
    select 1 from public.practice_tool_setups s join public.practice_tool_setups t using(practice_id)
    where s.tool_id=p_source and t.tool_id=p_target and (
      (s.install_command is not null and t.install_command is not null and s.install_command<>t.install_command)
      or (s.notes is not null and t.notes is not null and s.notes<>t.notes)))
    then raise exception 'A practice has different setup commands or notes for these tools. Its author must reconcile the setup before merging.'; end if;
  insert into public.practice_tool_setups as existing(practice_id,tool_id,install_command,notes)
    select practice_id,p_target,install_command,notes from public.practice_tool_setups where tool_id=p_source
    on conflict(practice_id,tool_id) do update set
      install_command=coalesce(existing.install_command,excluded.install_command),
      notes=coalesce(existing.notes,excluded.notes);
  update public.practice_tool_mentions set tool_id=p_target where tool_id=p_source;
  delete from public.practice_tool_setups where tool_id=p_source;
  update public.options set tool_id=p_target where tool_id=p_source;
  update public.tools set merged_into=p_target where merged_into=p_source;
  update public.tools set merged_into=p_target where id=p_source;
  -- The target wins overlapping platform keys. The source snapshot remains in history.
  if (source.install_commands || target.install_commands) <> target.install_commands then
    update public.tools set install_commands=source.install_commands || target.install_commands
      where id=p_target returning * into target;
  end if;
  -- Leave aliases on the source row, preserving old UUIDs, slugs and identifiers.
  insert into public.tool_revisions(tool_id,editor_id,action,before,after)
    values(p_target,auth.uid(),'merge',to_jsonb(source),to_jsonb(target));
  return target;
end $$;

-- Retain the pre-existing arities for old clients. Their writes leave new metadata intact.
-- Supplying an explicit empty map to this overload clears previously saved overrides.
create function public.save_mention_practice(
  p_id uuid,p_title text,p_body text,p_image_path text,p_mentions jsonb,
  p_significant boolean,p_source_url text,p_install_overrides jsonb)
returns public.practices language plpgsql security definer set search_path='' as $$
declare result public.practices;
begin
  select * into strict result from public.save_mention_practice(
    p_id,p_title,p_body,p_image_path,p_mentions,p_significant,p_source_url);
  if result.install_overrides is distinct from p_install_overrides then
    update public.practices set install_overrides=p_install_overrides
      where id=result.id and author_id=auth.uid() returning * into strict result;
  end if;
  return result;
end $$;

create or replace function public.create_mention_practice_once(
  p_request_id uuid,p_title text,p_body text,p_image_path text,p_mentions jsonb,p_source_url text,p_install_overrides jsonb)
returns public.practices language plpgsql security definer set search_path='' as $$
declare
  actor uuid:=auth.uid();
  -- Keep the pre-migration digest for a submission with no platform overrides.
  parts jsonb:=jsonb_build_array(p_title,p_body,p_image_path,p_mentions,p_source_url);
  payload bytea;
  receipt public.mention_create_requests;
  result public.practices;
begin
  if actor is null then raise exception 'Sign in to publish a practice' using errcode='42501'; end if;
  if p_request_id is null then raise exception 'A publish request ID is required'; end if;
  if p_install_overrides is distinct from '{}'::jsonb then
    parts:=parts || jsonb_build_array(p_install_overrides);
  end if;
  payload:=sha256(convert_to(parts::text,'UTF8'));
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
  select * into result from public.save_mention_practice(null,p_title,p_body,p_image_path,p_mentions,false,p_source_url,p_install_overrides);
  insert into public.mention_create_requests(author_id,request_id,payload_hash,practice_id) values(actor,p_request_id,payload,result.id);
  return result;
end $$;
revoke all on function public.save_mention_practice(uuid,text,text,text,jsonb,boolean,text,jsonb),
  public.create_mention_practice_once(uuid,text,text,text,jsonb,text,jsonb) from public,anon;
grant execute on function public.save_mention_practice(uuid,text,text,text,jsonb,boolean,text,jsonb),
  public.create_mention_practice_once(uuid,text,text,text,jsonb,text,jsonb) to authenticated;
notify pgrst,'reload schema';
