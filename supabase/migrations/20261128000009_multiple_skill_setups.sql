-- The existing table remains the default for each owner and legacy clients.
alter table public.my_skills_configs add column name text not null default 'My setup'
  check(length(btrim(name)) between 1 and 120);

create table public.my_skills_setups (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null check(length(btrim(name)) between 1 and 120),
  config jsonb not null default '{"repo":"","selected_packages":[],"drafts":[]}',
  version integer not null default 1 check(version>0)
);
create index my_skills_setups_owner on public.my_skills_setups(owner_id);
alter table public.my_skills_setups enable row level security;
revoke all on public.my_skills_setups from public,anon,authenticated;
grant select on public.my_skills_setups to authenticated;
create policy "Read own named skill setups" on public.my_skills_setups
  for select to authenticated using(owner_id=(select auth.uid()));

create function public.validate_my_skills_config(p_config jsonb) returns void
language plpgsql immutable set search_path='' as $$
begin
  if jsonb_typeof(p_config) is distinct from 'object'
    or octet_length(p_config::text)>4000000
    or jsonb_typeof(p_config->'repo') is distinct from 'string'
    or jsonb_typeof(p_config->'selected_packages') is distinct from 'array'
    or jsonb_typeof(p_config->'drafts') is distinct from 'array' then
    raise exception 'Invalid My Skills configuration.' using errcode='22023';
  end if;
  if exists(select 1 from jsonb_array_elements(p_config->'selected_packages') p where jsonb_typeof(p)<>'string' or length(p #>> '{}') not between 1 and 2048)
    or length(p_config->>'repo')>2048
    or exists(select 1 from jsonb_array_elements(p_config->'drafts') d where
      jsonb_typeof(d)<>'object' or jsonb_typeof(d->'id') is distinct from 'string' or length(d->>'id') not between 1 and 256
      or jsonb_typeof(d->'name') is distinct from 'string' or jsonb_typeof(d->'description') is distinct from 'string'
      or jsonb_typeof(d->'body') is distinct from 'string')
    or exists(select 1 from jsonb_array_elements(p_config->'drafts') d group by d->>'id' having count(*)>1) then
    raise exception 'Invalid selected packages or skill drafts.' using errcode='22023';
  end if;

end $$;
revoke all on function public.validate_my_skills_config(jsonb) from public,anon,authenticated;
create or replace function public.save_my_skills_config(p_config jsonb,p_expected_version integer)
returns table(config jsonb,version integer)
language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); current_row public.my_skills_configs;
begin
  if actor is null then raise exception 'Sign in to save My Skills.' using errcode='42501'; end if;
  if p_expected_version is null or p_expected_version<0 then raise exception 'Invalid My Skills version.' using errcode='22023'; end if;
  perform public.validate_my_skills_config(p_config);
  if p_expected_version=0 then
    insert into public.my_skills_configs(owner_id,config,version) values(actor,p_config,1)
    on conflict(owner_id) do nothing returning * into current_row;
    if found then return query select current_row.config,current_row.version; return; end if;
  end if;
  select * into current_row from public.my_skills_configs m where m.owner_id=actor for update;
  -- A lost response may cause the previous write to be sent again.
  if found and current_row.config=p_config then return query select current_row.config,current_row.version; return; end if;
  if not found or current_row.version<>p_expected_version then
    raise exception 'My Skills changed. Reload before saving again.' using errcode='PT409';
  end if;
  update public.my_skills_configs m set config=p_config,version=m.version+1 where m.owner_id=actor returning * into current_row;
  return query select current_row.config,current_row.version;
end $$;

create function public.list_my_skills_setups()
returns table(id text,name text,is_default boolean,version integer)
language sql stable security invoker set search_path='' as $$
  select * from (
    select 'default'::text as id,coalesce(d.name,'My setup') as name,true as is_default,coalesce(d.version,0) as version
      from (select auth.uid() as uid) a left join public.my_skills_configs d on d.owner_id=a.uid where a.uid is not null
    union all select s.id::text,s.name,false,s.version from public.my_skills_setups s where s.owner_id=auth.uid()
  ) setups order by is_default desc,lower(name),id;
$$;

create function public.create_my_skills_setup(p_name text,p_request_id uuid default gen_random_uuid())
returns table(id text,name text,is_default boolean,version integer)
language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); result public.my_skills_setups;
begin
  if actor is null then raise exception 'Sign in to create a setup.' using errcode='42501'; end if;
  if p_name is null or length(btrim(p_name)) not between 1 and 120 or p_request_id is null then
    raise exception 'Enter a setup name of up to 120 characters.' using errcode='22023'; end if;
  insert into public.my_skills_setups(id,owner_id,name) values(p_request_id,actor,btrim(p_name))
    on conflict on constraint my_skills_setups_pkey do nothing returning * into result;
  if not found then
    select * into result from public.my_skills_setups s where s.id=p_request_id and s.owner_id=actor and s.name=btrim(p_name);
    if not found then raise exception 'This setup request could not be replayed.' using errcode='PT409'; end if;
  end if;
  return query select result.id::text,result.name,false,result.version;
end $$;

create function public.load_my_skills_setup(p_id text)
returns table(config jsonb,version integer)
language plpgsql stable security invoker set search_path='' as $$
begin
  if auth.uid() is null then raise exception 'Sign in to open a setup.' using errcode='42501'; end if;
  if p_id='default' then
    return query select coalesce(d.config,'{"repo":"","selected_packages":[],"drafts":[]}'::jsonb),coalesce(d.version,0)
      from (select auth.uid() as uid) a left join public.my_skills_configs d on d.owner_id=a.uid;
  else
    return query select s.config,s.version from public.my_skills_setups s where s.id=p_id::uuid and s.owner_id=auth.uid();
    if not found then raise exception 'Setup not found.' using errcode='PT404'; end if;
  end if;
end $$;

create function public.save_my_skills_setup(p_id text,p_config jsonb,p_expected_version integer)
returns table(config jsonb,version integer)
language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); result public.my_skills_setups;
begin
  if actor is null then raise exception 'Sign in to save a setup.' using errcode='42501'; end if;
  if p_id='default' then
    return query select * from public.save_my_skills_config(p_config,p_expected_version); return;
  end if;
  perform public.validate_my_skills_config(p_config);
  select * into result from public.my_skills_setups s where s.id=p_id::uuid and s.owner_id=actor for update;
  if not found then raise exception 'Setup not found.' using errcode='PT404'; end if;
  if p_expected_version is null or p_expected_version<0 then raise exception 'Invalid version.' using errcode='22023'; end if;
  if result.config<>p_config then
    if result.version<>p_expected_version then raise exception 'Setup changed. Reload before saving.' using errcode='PT409'; end if;
    update public.my_skills_setups s set config=p_config,version=s.version+1 where s.id=result.id returning * into result;
  end if;
  return query select result.config,result.version;
end $$;

create function public.rename_my_skills_setup(p_id text,p_name text,p_expected_version integer)
returns table(id text,name text,is_default boolean,version integer)
language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); label text:=btrim(p_name); old_name text; old_version integer;
begin
  if actor is null then raise exception 'Sign in to rename a setup.' using errcode='42501'; end if;
  if label is null or length(label) not between 1 and 120 or p_expected_version is null or p_expected_version<0 then
    raise exception 'Invalid setup name or version.' using errcode='22023'; end if;
  if p_id='default' then
    if p_expected_version=0 then
      insert into public.my_skills_configs(owner_id,name,config,version) values(actor,label,'{"repo":"","selected_packages":[],"drafts":[]}',1)
      on conflict(owner_id) do nothing;
      if found then return query select p_id,label,true,1; return; end if;
    end if;
    select d.name,d.version into old_name,old_version from public.my_skills_configs d where d.owner_id=actor for update;
  else
    select s.name,s.version into old_name,old_version from public.my_skills_setups s where s.id=p_id::uuid and s.owner_id=actor for update;
    if not found then raise exception 'Setup not found.' using errcode='PT404'; end if;
  end if;
  if old_name is distinct from label then
    if old_version is distinct from p_expected_version then raise exception 'Setup changed. Reload before renaming.' using errcode='PT409'; end if;
    if p_id='default' then
      update public.my_skills_configs s set name=label,version=s.version+1 where s.owner_id=actor returning s.version into old_version;
    else
      update public.my_skills_setups s set name=label,version=s.version+1 where s.id=p_id::uuid returning s.version into old_version;
    end if;
  end if;
  return query select p_id,label,p_id='default',old_version;
end $$;

create function public.delete_my_skills_setup(p_id text,p_expected_version integer)
returns void language plpgsql security definer set search_path='' as $$
declare current_version integer; actor uuid:=auth.uid();
begin
  if actor is null then raise exception 'Sign in to delete a setup.' using errcode='42501'; end if;
  if p_id='default' then raise exception 'The default setup cannot be deleted.' using errcode='22023'; end if;
  select s.version into current_version from public.my_skills_setups s where s.owner_id=actor and s.id=p_id::uuid for update;
  if not found then raise exception 'Setup not found.' using errcode='PT404'; end if;
  if current_version is distinct from p_expected_version then raise exception 'Setup changed. Reload before deleting.' using errcode='PT409'; end if;
  delete from public.my_skills_setups s where s.id=p_id::uuid and s.owner_id=actor;
end $$;
revoke all on function public.delete_my_skills_setup(text,integer) from public,anon,authenticated;
grant execute on function public.delete_my_skills_setup(text,integer) to authenticated;

revoke all on function public.list_my_skills_setups(), public.create_my_skills_setup(text,uuid), public.load_my_skills_setup(text),
 public.save_my_skills_setup(text,jsonb,integer), public.rename_my_skills_setup(text,text,integer) from public,anon,authenticated;
grant execute on function public.list_my_skills_setups(), public.create_my_skills_setup(text,uuid), public.load_my_skills_setup(text),
 public.save_my_skills_setup(text,jsonb,integer), public.rename_my_skills_setup(text,text,integer) to authenticated;
notify pgrst,'reload schema';
