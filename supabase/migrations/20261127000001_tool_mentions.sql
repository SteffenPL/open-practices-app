-- New records coexist with the original Element/Option editor and its data.
alter table public.practices add column if not exists mention_format boolean not null default false;
alter table public.tools add column if not exists slug text;
alter table public.tools add column if not exists website_url text;
alter table public.tools add column if not exists install_command text;
alter table public.tools add column if not exists updated_at timestamptz not null default now();
alter table public.tools add column if not exists merged_into uuid references public.tools(id);
-- Entries identified only by a name or project website are valid catalog items.
alter table public.tools drop constraint if exists tools_check;
-- One repository may publish several distinct APM packages.
alter table public.tools drop constraint if exists tools_repo_url_key;
create index if not exists tools_repo_lookup on public.tools(repo_url);

create unique index if not exists tools_slug_key on public.tools(slug);
create table if not exists public.tool_revisions (
  id uuid primary key default gen_random_uuid(),
  tool_id uuid not null references public.tools(id),
  editor_id uuid references public.profiles(id) on delete set null,
  action text not null,
  before jsonb,
  after jsonb not null,
  created_at timestamptz not null default clock_timestamp()
);
create index if not exists tool_revisions_tool_time on public.tool_revisions(tool_id, created_at desc);
alter table public.tool_revisions enable row level security;
drop policy if exists "Public catalog history" on public.tool_revisions;
create policy "Public catalog history" on public.tool_revisions for select using (true);

-- One setup per tool in each post. Repeated mentions keep their original tokens.
create table if not exists public.practice_tool_setups (
  practice_id uuid not null references public.practices(id) on delete cascade,
  tool_id uuid not null references public.tools(id),
  install_command text,
  notes text,
  primary key (practice_id, tool_id)
);
create table if not exists public.practice_tool_mentions (
  practice_id uuid not null,
  position integer not null check (position >= 0),
  tool_id uuid not null references public.tools(id),
  token text not null check (length(token) between 2 and 201 and token ~ '^#[^[:space:]#]+$'),
  primary key (practice_id, position),
  foreign key (practice_id,tool_id) references public.practice_tool_setups(practice_id,tool_id) on delete cascade
);
create index if not exists practice_tool_mentions_tool on public.practice_tool_mentions(tool_id, practice_id);
alter table public.practice_tool_setups enable row level security;
alter table public.practice_tool_mentions enable row level security;
drop policy if exists "Public practice setups" on public.practice_tool_setups;
create policy "Public practice setups" on public.practice_tool_setups for select using (true);
drop policy if exists "Public practice mentions" on public.practice_tool_mentions;
create policy "Public practice mentions" on public.practice_tool_mentions for select using (true);

-- The original authenticated insert policy remains for older API clients.
-- All edits, merges, history and association writes go through checked RPCs.
revoke all on public.tool_revisions,public.practice_tool_setups,public.practice_tool_mentions from public,anon,authenticated;
grant select on public.tool_revisions,public.practice_tool_setups,public.practice_tool_mentions to anon,authenticated;
revoke all on public.tools from public,anon,authenticated;
grant select on public.tools to anon,authenticated;
grant insert(name,description,apm_id,repo_url,website_url,install_command) on public.tools to authenticated;

create or replace function public.normalize_catalog_tool()
returns trigger language plpgsql set search_path='' as $$
declare root text; parts text[];
begin
  new.name := trim(new.name);
  if new.name is null or length(new.name) not between 1 and 160 then raise exception 'Tool name must be 1–160 characters'; end if;
  new.apm_id := nullif(trim(both '/' from trim(new.apm_id)),'');
  if new.apm_id is not null then
    if new.apm_id !~ '^[a-zA-Z0-9@_.-]+(/[a-zA-Z0-9@_.-]+)*$' then raise exception 'Invalid APM package identifier'; end if;
    parts:=string_to_array(new.apm_id,'/');
    parts[1]:=lower(parts[1]);
    if cardinality(parts)>=2 then parts[2]:=lower(parts[2]); end if;
    new.apm_id:=array_to_string(parts,'/');
  end if;
  new.repo_url:=nullif(rtrim(trim(new.repo_url),'/'),'');
  if new.repo_url is not null then
    parts:=regexp_match(new.repo_url,'^https?://github\.com/([a-z0-9_.-]+)/([a-z0-9_.-]+)(/[^[:space:]?#]*)?$','i');
    if parts is null then raise exception 'Enter an HTTPS GitHub repository or source URL'; end if;
    new.repo_url:='https://github.com/'||lower(parts[1])||'/'||regexp_replace(lower(parts[2]),'\.git$','')||coalesce(parts[3],'');
  end if;
  new.website_url:=nullif(trim(new.website_url),'');
  if new.website_url is not null then
    parts:=regexp_match(new.website_url,'^(https?)://([a-z0-9.-]+(:[0-9]+)?)([/#?][^[:space:]]*)?$','i');
    if parts is null then raise exception 'Enter an HTTP or HTTPS project website'; end if;
    new.website_url:=lower(parts[1])||'://'||lower(parts[2])||coalesce(nullif(parts[4],'/'),'');
  end if;
  new.description:=nullif(trim(new.description),'');
  new.install_command:=nullif(trim(new.install_command),'');
  if length(new.description)>12000 or length(new.install_command)>8000 or length(new.repo_url)>2048 or length(new.website_url)>2048 or length(new.apm_id)>512 then raise exception 'Tool field exceeds its length limit'; end if;
  if new.slug is null then
    root:=coalesce(nullif(trim(both '-' from regexp_replace(lower(new.name),'[^a-z0-9]+','-','g')),''),'tool');
    new.slug:=left(root,145);
    -- Serialize generated slugs so equal names can coexist with distinct IDs.
    perform pg_advisory_xact_lock(hashtextextended('catalog-slug:'||new.slug,0));
    if exists(select 1 from public.tools t where t.slug=new.slug and t.id<>new.id) then new.slug:=new.slug||'-'||new.id::text; end if;
  end if;
  if new.slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$' then raise exception 'Invalid tool slug'; end if;
  new.updated_at:=clock_timestamp();
  return new;
end $$;
drop trigger if exists normalize_catalog_tool on public.tools;
create trigger normalize_catalog_tool before insert or update on public.tools for each row execute function public.normalize_catalog_tool();
update public.tools set slug=null where slug is null;
alter table public.tools alter column slug set not null;

create or replace function public.record_tool_revision()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  insert into public.tool_revisions(tool_id,editor_id,action,before,after)
  values(new.id,auth.uid(),case when tg_op='INSERT' then 'create'
      when old.merged_into is distinct from new.merged_into then 'merge' else 'edit' end,
      case when tg_op='UPDATE' then to_jsonb(old) end,to_jsonb(new));
  return new;
end $$;
drop trigger if exists record_tool_revision on public.tools;
create trigger record_tool_revision after insert or update on public.tools for each row execute function public.record_tool_revision();
insert into public.tool_revisions(tool_id,action,after)
select t.id,'create',to_jsonb(t) from public.tools t where not exists(select 1 from public.tool_revisions r where r.tool_id=t.id);

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
  -- Leave aliases on the source row, preserving old UUIDs, slugs and identifiers.
  insert into public.tool_revisions(tool_id,editor_id,action,before,after)
    values(p_target,auth.uid(),'merge',to_jsonb(source),to_jsonb(target));
  return target;
end $$;

create or replace function public.resolve_option_tool_alias()
returns trigger language plpgsql security definer set search_path='' as $$
declare canonical uuid;
begin
  if new.tool_id is not null then
    select coalesce(merged_into,id) into strict canonical from public.tools where id=new.tool_id for share;
    new.tool_id:=canonical;
  end if;
  return new;
end $$;
drop trigger if exists resolve_option_tool_alias on public.options;
create trigger resolve_option_tool_alias before insert or update of tool_id on public.options for each row execute function public.resolve_option_tool_alias();

create or replace function public.save_mention_practice(
  p_id uuid,p_title text,p_body text,p_image_path text,p_mentions jsonb,
  p_significant boolean default false,p_source_url text default null)
returns public.practices language plpgsql security definer set search_path='' as $$
declare result public.practices; actor uuid:=auth.uid(); mention jsonb; remaining text:=p_body; at_token integer;
begin
  if actor is null then raise exception 'Sign in to publish a practice' using errcode='42501'; end if;
  if jsonb_typeof(p_mentions) is distinct from 'array' or jsonb_array_length(p_mentions)>300 then raise exception 'Invalid tool mentions'; end if;
  if p_title is null or length(trim(p_title)) not between 1 and 500 or p_body is null or length(p_body)>150000 then raise exception 'Invalid practice title or body'; end if;
  perform id from public.tools where id in(select (item->>'tool_id')::uuid from jsonb_array_elements(p_mentions) item) order by id for share;
  for mention in select value from jsonb_array_elements(p_mentions) loop
    if not exists(select 1 from public.tools where id=(mention->>'tool_id')::uuid) then raise exception 'Unknown mentioned tool'; end if;
    if mention->>'token' is null or mention->>'token' !~ '^#[^[:space:]#]+$' then raise exception 'Invalid tool mention token'; end if;
    at_token:=strpos(remaining,mention->>'token');
    if at_token<1 then raise exception 'Tool mention tokens must occur in body order'; end if;
    remaining:=substr(remaining,at_token+length(mention->>'token'));
    if length(mention->>'install_command')>8000 or length(mention->>'notes')>12000 then raise exception 'Tool setup is too long'; end if;
  end loop;
  if p_id is null then
    insert into public.practices(author_id,title,body,image_path,source_url,mention_format)
      values(actor,trim(p_title),p_body,p_image_path,p_source_url,true) returning * into result;
  else
    update public.practices set title=trim(p_title),body=p_body,image_path=p_image_path,
      source_url=coalesce(p_source_url,source_url),mention_format=true,updated_at=clock_timestamp(),
      last_significant_at=case when p_significant then clock_timestamp() else last_significant_at end
      where id=p_id and author_id=actor returning * into result;
    if not found then raise exception 'Only the practice author can edit it' using errcode='42501'; end if;
    delete from public.practice_tool_setups where practice_id=p_id;
  end if;
  -- Collapse repeated mentions to a single setup; reject conflicting nonempty values.
  if exists(select 1 from jsonb_array_elements(p_mentions) m join public.tools t on t.id=(m->>'tool_id')::uuid
      group by coalesce(t.merged_into,t.id) having count(distinct nullif(trim(m->>'notes'),''))>1 or count(distinct nullif(trim(m->>'install_command'),''))>1)
    then raise exception 'Provide one setup per tool per practice'; end if;
  insert into public.practice_tool_setups(practice_id,tool_id,install_command,notes)
    select result.id,coalesce(t.merged_into,t.id),max(nullif(trim(m->>'install_command'),'')),max(nullif(trim(m->>'notes'),''))
    from jsonb_array_elements(p_mentions) m join public.tools t on t.id=(m->>'tool_id')::uuid group by coalesce(t.merged_into,t.id);
  insert into public.practice_tool_mentions(practice_id,position,tool_id,token)
    select result.id,(entry.ord-1)::int,coalesce(t.merged_into,t.id),entry.m->>'token'
    from jsonb_array_elements(p_mentions) with ordinality as entry(m,ord) join public.tools t on t.id=(entry.m->>'tool_id')::uuid;
  return result;
end $$;

create or replace function public.catalog_tool_practices(p_id uuid)
returns setof public.practices language sql stable security invoker set search_path='' as $$
  select p.* from public.practices p where
    exists (select 1 from public.practice_tool_setups s where s.practice_id=p.id and s.tool_id=p_id)
    or exists (select 1 from public.elements e join public.options o on o.element_id=e.id where e.practice_id=p.id and o.tool_id=p_id)
    order by p.last_significant_at desc;
$$;
revoke all on function public.edit_catalog_tool(uuid,jsonb,timestamptz), public.merge_catalog_tools(uuid,uuid),
  public.save_mention_practice(uuid,text,text,text,jsonb,boolean,text) from public,anon;
grant execute on function public.edit_catalog_tool(uuid,jsonb,timestamptz), public.merge_catalog_tools(uuid,uuid),
  public.save_mention_practice(uuid,text,text,text,jsonb,boolean,text) to authenticated;
grant execute on function public.catalog_tool_practices(uuid) to anon,authenticated;
-- Only the catalog's own triggers may invoke the auditing and alias helpers.
revoke all on function public.normalize_catalog_tool(),public.record_tool_revision(),public.resolve_option_tool_alias()
  from public,anon,authenticated;
notify pgrst,'reload schema';
