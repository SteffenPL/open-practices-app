-- The first URL is primary. Source/website columns remain available to earlier clients.
alter table public.tools add column urls text[] not null default '{}';
alter table public.tools add column name_aliases text[] not null default '{}';
alter table public.tools add column commands jsonb not null default '[]';

create function public.check_tool_details() returns trigger language plpgsql set search_path='' as $$
declare item jsonb; link text; alias text; names text[] := '{}'; seen_links text[] := '{}';
begin
  if tg_op='INSERT' and cardinality(new.urls)=0 then
    new.urls:=array_remove(array[new.website_url,new.repo_url],null);
  end if;
  if cardinality(new.urls)>64 or cardinality(new.name_aliases)>64 then
    raise exception 'Use at most 64 links or aliases.';
  end if;
  foreach link in array new.urls loop
    if link is null or length(link)>2048 or link !~* '^https?://([a-z0-9-]+\.)*[a-z0-9-]+(:[0-9]{1,5})?([/?#][^[:space:][:cntrl:]]*)?$'
      then raise exception 'Each link must be a full HTTP or HTTPS URL.'; end if;
    if not link=any(seen_links) then seen_links:=array_append(seen_links,link); end if;
  end loop;
  new.urls:=seen_links;
  foreach alias in array new.name_aliases loop
    if alias is null or length(btrim(alias)) not between 1 and 160 or alias<>btrim(alias)
      then raise exception 'Aliases must be 1–160 characters.'; end if;
    if lower(alias)=any(names) then raise exception 'Aliases must be unique.'; end if;
    names:=array_append(names,lower(alias));
  end loop;
  if jsonb_typeof(new.commands)<>'array' or jsonb_array_length(new.commands)>250
    then raise exception 'Provide a list of at most 250 commands.'; end if;
  names:='{}';
  for item in select value from jsonb_array_elements(new.commands) loop
    if jsonb_typeof(item)<>'object' or not (item ? 'name') or jsonb_typeof(item->'name')<>'string'
      or item-'name'-'description'<>'{}'::jsonb or length(btrim(item->>'name')) not between 1 and 160
      or item->>'name'<>btrim(item->>'name')
      or (item ? 'description' and (jsonb_typeof(item->'description')<>'string' or length(item->>'description')>500))
      then raise exception 'Provide a command name and an optional description of up to 500 characters.'; end if;
    if lower(item->>'name')=any(names) then raise exception 'Command names must be unique.'; end if;
    names:=array_append(names,lower(item->>'name'));
  end loop;
  return new;
end $$;
-- Run after normalize_catalog_tool, so legacy source fields have been normalized first.
create trigger validate_tool_details before insert or update on public.tools
for each row execute function public.check_tool_details();
revoke all on function public.check_tool_details() from public, anon, authenticated;
grant insert(urls,name_aliases,commands) on public.tools to authenticated;
update public.tools set urls=array_remove(array[website_url,repo_url],null)
where website_url is not null or repo_url is not null;

create or replace function public.edit_catalog_tool(p_id uuid,p_fields jsonb,p_expected_updated_at timestamptz)
returns public.tools language plpgsql security definer set search_path='' as $$
declare result public.tools;
begin
  if auth.uid() is null then raise exception 'Sign in to edit the catalog' using errcode='42501'; end if;
  update public.tools t set
    urls=case when p_fields ? 'urls' then array(select jsonb_array_elements_text(p_fields->'urls')) else t.urls end,
    name_aliases=case when p_fields ? 'name_aliases' then array(select jsonb_array_elements_text(p_fields->'name_aliases')) else t.name_aliases end,
    commands=case when p_fields ? 'commands' then p_fields->'commands' else t.commands end,
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
  -- Keep target order and descriptions, then append distinct source details.
  update public.tools set
    urls=array(select value from unnest(target.urls||source.urls) with ordinality a(value,n) group by value order by min(n)),
    name_aliases=array(select (array_agg(value order by n))[1]
      from unnest(target.name_aliases || source.name_aliases || array[source.name]) with ordinality a(value,n)
      where lower(value)<>lower(target.name) group by lower(value) order by min(n)),
    commands=(select coalesce(jsonb_agg(cmd order by n),'[]'::jsonb) from (
      select distinct on(lower(value->>'name')) value as cmd,n
      from jsonb_array_elements(target.commands||source.commands) with ordinality a(value,n)
      order by lower(value->>'name'),n) merged),
    install_commands=source.install_commands||target.install_commands,
    install_command=coalesce(target.install_command,source.install_command)
    where id=p_target returning * into target;
  -- Leave aliases on the source row, preserving old UUIDs, slugs and identifiers.
  insert into public.tool_revisions(tool_id,editor_id,action,before,after)
    values(p_target,auth.uid(),'merge',to_jsonb(source),to_jsonb(target));
  return target;
end $$;


-- Old clients can still call the two-argument RPC. Interactive merges compare both snapshots.
create function public.merge_catalog_tools(p_source uuid,p_target uuid,p_source_updated_at timestamptz,p_target_updated_at timestamptz)
returns public.tools language plpgsql security definer set search_path='' as $$
begin
  if auth.uid() is null then raise exception 'Sign in to merge tools' using errcode='42501'; end if;
  perform id from public.tools where id in (p_source,p_target) order by id for update;
  if not exists(select 1 from public.tools where id=p_source and updated_at=p_source_updated_at)
    or not exists(select 1 from public.tools where id=p_target and updated_at=p_target_updated_at)
    then raise exception 'A tool changed. Reload before merging.'; end if;
  return public.merge_catalog_tools(p_source,p_target);
end $$;
revoke all on function public.merge_catalog_tools(uuid,uuid,timestamptz,timestamptz) from public,anon;
grant execute on function public.merge_catalog_tools(uuid,uuid,timestamptz,timestamptz) to authenticated;

-- APM installed all 27 skills listed by .claude-plugin/plugin.json at
-- mattpocock/skills@bbadaa631c37af594e5a05c9cefacd9956136b18 into a scratch Codex project.
insert into public.tools(name, description, apm_id, repo_url, website_url, urls, name_aliases, install_command, commands)
values ('Matt Pocock''s Skills', 'A collection of agent skills for design interviews, specifications, implementation, review, and handoffs.',
  'mattpocock/skills', 'https://github.com/mattpocock/skills', 'https://skills.sh/mattpocock/skills',
  array['https://github.com/mattpocock/skills','https://skills.sh/mattpocock/skills'],
  array['mattpocock/skills','mattpocock-skills','Skills For Real Engineers','Matt Pocock'],
  'apm install mattpocock/skills', '[
    {"name":"/ask-matt","description":"Choose a skill or workflow for the task."},
    {"name":"/diagnosing-bugs","description":"Reproduce, isolate, and verify a fix for a bug."},
    {"name":"/grill-with-docs","description":"Explore a design and record decisions and domain terms."},
    {"name":"/triage","description":"Classify issues and move them through triage."},
    {"name":"/improve-codebase-architecture","description":"Find and discuss opportunities to simplify module interfaces."},
    {"name":"/setup-matt-pocock-skills","description":"Configure issue tracking, labels, and domain documents for a repository."},
    {"name":"/tdd","description":"Develop behavior incrementally with tests."},
    {"name":"/to-spec","description":"Turn a discussion into a written specification."},
    {"name":"/to-tickets","description":"Divide a plan into tickets and identify dependencies."},
    {"name":"/wayfinder","description":"Map the decisions needed for a multi-session project."},
    {"name":"/implement","description":"Implement a specification or a set of tickets."},
    {"name":"/implement-spec","description":"Coordinate implementation of an entire specification on one branch."},
    {"name":"/prototype","description":"Build a disposable prototype to answer a design question."},
    {"name":"/research","description":"Investigate a question and document it with primary sources."},
    {"name":"/domain-modeling","description":"Clarify terminology and maintain a project glossary."},
    {"name":"/codebase-design","description":"Design and test modules with focused interfaces."},
    {"name":"/code-review","description":"Review changes against the specification and coding standards."},
    {"name":"/pr","description":"Prepare a pull request with evidence and merge considerations."},
    {"name":"/retro","description":"Identify improvements to an agent’s working environment."},
    {"name":"/wizard","description":"Build an interactive script for setup steps that require a person."},
    {"name":"/grill-me","description":"Work through open questions about a plan or design."},
    {"name":"/grilling","description":"Conduct the interview used by several other skills."},
    {"name":"/handoff","description":"Prepare context for a subsequent session."},
    {"name":"/teach","description":"Guide a learner through a skill over multiple sessions."},
    {"name":"/to-questionnaire","description":"Prepare a written questionnaire for a decision maker."},
    {"name":"/wait-what","description":"Explain an unclear message using the project’s vocabulary."},
    {"name":"/writing-for-agents","description":"Write documentation and instructions for agent readers."}
  ]'::jsonb)
on conflict (apm_id) do nothing;

-- This legacy option names the whole collection and discusses several of its skills.
update public.options o set tool_id=package.id
from public.tools package, public.tools previous
where o.id='cdeb9afc-5a0e-46d6-8094-98ae02acc28d' and o.name='mattpocock/skills'
  and previous.id=o.tool_id and previous.apm_id='mattpocock/skills/skills/productivity/grill-me'
  and package.apm_id='mattpocock/skills' and package.merged_into is null;
