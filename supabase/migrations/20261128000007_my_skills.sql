-- Personal APM collections and unpublished drafts have no public read policy.
create table public.my_skills_configs (
  owner_id uuid primary key references auth.users(id) on delete cascade,
  config jsonb not null,
  version integer not null check(version > 0)
);
alter table public.my_skills_configs enable row level security;
revoke all on public.my_skills_configs from public,anon,authenticated;
grant select on public.my_skills_configs to authenticated;
create policy "Read own My Skills configuration" on public.my_skills_configs
  for select to authenticated using (owner_id=(select auth.uid()));

-- The caller supplies the previously read version. The function derives ownership
-- from auth.uid(); no user-supplied owner identifier or direct writes are accepted.
create function public.save_my_skills_config(p_config jsonb,p_expected_version integer)
returns table(config jsonb,version integer)
language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); current_row public.my_skills_configs;
begin
  if actor is null then raise exception 'Sign in to save My Skills.' using errcode='42501'; end if;
  if p_expected_version is null or p_expected_version<0 then raise exception 'Invalid My Skills version.' using errcode='22023'; end if;
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
revoke all on function public.save_my_skills_config(jsonb,integer) from public,anon,authenticated;
grant execute on function public.save_my_skills_config(jsonb,integer) to authenticated;
notify pgrst,'reload schema';
