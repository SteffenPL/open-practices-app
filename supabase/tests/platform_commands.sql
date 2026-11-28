-- Run against an isolated database with the Open Practices migrations applied.
begin;
insert into auth.users(id,raw_user_meta_data) values ('fbc90011-0000-4000-8000-000000000001','{}');
set local role authenticated;
set local request.jwt.claim.sub='fbc90011-0000-4000-8000-000000000001';
set local request.jwt.claim.role='authenticated';
do $$
declare
  a public.tools; b public.tools; post public.practices; replay public.practices;
  request_id uuid:=gen_random_uuid(); legacy_id uuid:=gen_random_uuid();
  overrides jsonb:='{"linux":"install a","windows":""}';
begin
  insert into public.tools(name, install_commands) values ('Source','{"linux":"install a","macos":"first"}') returning * into a;
  insert into public.tools(name, install_commands) values ('Target','{"macos":"second"}') returning * into b;
  select * into b from public.edit_catalog_tool(b.id,'{"description":"Edit from legacy caller"}',b.updated_at);
  if b.install_commands <> '{"macos":"second"}' then raise exception 'Legacy edit cleared platform commands'; end if;
  select * into a from public.edit_catalog_tool(a.id,'{"install_commands":{"linux":"install b","macos":"first"}}',a.updated_at);
  if not exists(select 1 from public.tool_revisions where tool_id=a.id and after->'install_commands'->>'linux'='install b') then
    raise exception 'Command edit was not attributed to a revision'; end if;
  begin
    perform public.edit_catalog_tool(a.id,'{"install_commands":{"linux":123}}',a.updated_at);
    raise exception 'Invalid tool map accepted' using errcode='ZX100';
  exception when check_violation then null; end;
  select * into b from public.merge_catalog_tools(a.id,b.id);
  if b.install_commands <> '{"linux":"install b","macos":"second"}' then raise exception 'Merge lost commands'; end if;
  if not exists(select 1 from public.tool_revisions where tool_id=b.id and action='merge' and after->'install_commands'=b.install_commands) then
    raise exception 'Merge missing platform audit'; end if;

  select * into post from public.create_mention_practice_once(request_id,'Test','Example',null,'[]',null,overrides);
  select * into replay from public.create_mention_practice_once(request_id,'Test','Example',null,'[]',null,overrides);
  if post.id<>replay.id or post.install_overrides<>overrides then raise exception 'Idempotent write failed'; end if;
  begin
    perform public.create_mention_practice_once(request_id,'Test','Example',null,'[]',null,'{}');
    raise exception 'Changed overrides accepted on replay' using errcode='ZX100';
  exception when raise_exception then null; end;
  begin
    perform public.save_mention_practice(post.id,'Invalid','Changed',null,'[]',false,null,'{"other":"value"}');
    raise exception 'Unknown practice platform accepted' using errcode='ZX100';
  exception when check_violation then null; end;
  if (select title from public.practices where id=post.id)<>'Test' then raise exception 'Practice written on invalid override'; end if;
  select * into post from public.save_mention_practice(post.id,'Edited','Changed',null,'[]');
  if post.install_overrides<>overrides then raise exception 'Legacy caller erased saved overrides'; end if;
  select * into post from public.save_mention_practice(post.id,'Reset','Changed',null,'[]',false,null,'{}');
  if post.install_overrides<>'{}' then raise exception 'Could not clear overrides'; end if;

  select * into post from public.create_mention_practice_once(legacy_id,'Legacy','A draft',null,'[]');
  select * into replay from public.create_mention_practice_once(legacy_id,'Legacy','A draft',null,'[]',null,'{}');
  if replay.id<>post.id then raise exception 'Legacy receipt not compatible'; end if;
end $$;
rollback;
