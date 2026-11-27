-- Integration coverage for catalog editing and practice writes. Run on a local database.
begin;
insert into auth.users(id,raw_user_meta_data) values
  ('adabc001-0000-4000-8000-000000000001','{}'),('adabc002-0000-4000-8000-000000000002','{}');
set local role authenticated;
set local request.jwt.claim.sub='adabc001-0000-4000-8000-000000000001';
set local request.jwt.claim.role='authenticated';
do $$
declare a public.tools; b public.tools; post public.practices; other public.practices; history_count integer; original timestamptz;
begin
  insert into public.tools(name,apm_id,repo_url) values ('Catalog Test', 'Example/Tools/PackA','https://github.com/Example/Tools') returning * into a;
  insert into public.tools(name,apm_id,repo_url) values ('Catalog Test', 'Example/Tools/PackB','https://github.com/Example/Tools') returning * into b;
  if a.slug=b.slug or a.apm_id<>'example/tools/PackA' or a.repo_url<>b.repo_url then raise exception 'Catalog identity failed'; end if;
  original:=a.updated_at;
  perform set_config('request.jwt.claim.sub','adabc002-0000-4000-8000-000000000002',true);
  select * into a from public.edit_catalog_tool(a.id,to_jsonb(a)||'{"description":"Peer edit"}',a.updated_at);
  if a.description<>'Peer edit' then raise exception 'Authenticated peer edit failed'; end if;
  begin
    perform public.edit_catalog_tool(a.id,to_jsonb(a),original); raise exception 'Stale edit allowed' using errcode='ZX100';
  exception when raise_exception then null; end;
  select * into post from public.save_mention_practice(null,'Example','#old #new #old',null,
    jsonb_build_array(jsonb_build_object('tool_id',a.id,'token','#old','install_command','install one','notes','Note'),
                      jsonb_build_object('tool_id',b.id,'token','#new','install_command','install two'),
                      jsonb_build_object('tool_id',a.id,'token','#old')));
  if not post.mention_format or (select count(*) from public.practice_tool_mentions where practice_id=post.id)<>3
      or (select count(*) from public.practice_tool_setups where practice_id=post.id)<>2 then raise exception 'Occurrence/setup mapping failed'; end if;
  begin
    perform public.merge_catalog_tools(a.id,b.id); raise exception 'Conflicting commands were merged' using errcode='ZX100';
  exception when raise_exception then null; end;
  perform set_config('request.jwt.claim.sub','adabc001-0000-4000-8000-000000000001',true);
  begin
    perform public.save_mention_practice(post.id,'Forbidden','',null,'[]'); raise exception 'Non-author write allowed' using errcode='ZX100';
  exception when insufficient_privilege then null; end;
  begin
    update public.tools set name='Unsafe' where id=a.id; raise exception 'Direct write allowed' using errcode='ZX100';
  exception when insufficient_privilege then null; end;
  perform set_config('request.jwt.claim.sub','adabc002-0000-4000-8000-000000000002',true);
  perform public.save_mention_practice(post.id,'Example','#old #new',null,
    jsonb_build_array(jsonb_build_object('tool_id',a.id,'token','#old','install_command','install one','notes','Note'),
                      jsonb_build_object('tool_id',b.id,'token','#new')));
  perform public.merge_catalog_tools(a.id,b.id);
  if not exists(select 1 from public.practice_tool_setups where practice_id=post.id and tool_id=b.id and install_command='install one' and notes='Note')
      or (select count(*) from public.practice_tool_mentions where practice_id=post.id and tool_id=b.id)<>2
      or not exists(select 1 from public.tools where id=a.id and merged_into=b.id and apm_id='example/tools/PackA') then raise exception 'Merge lost context or source alias'; end if;
  if not exists(select 1 from public.tool_revisions where tool_id=a.id and editor_id='adabc002-0000-4000-8000-000000000002' and action='edit') then raise exception 'Missing attributed revision'; end if;
  select * into other from public.save_mention_practice(null,'Old alias','#old',null,
    jsonb_build_array(jsonb_build_object('tool_id',a.id,'token','#old')));
  if not exists(select 1 from public.catalog_tool_practices(b.id) where id=other.id) then raise exception 'Merged alias did not resolve'; end if;
end $$;
reset role;
set local role anon;
do $$begin
  if has_function_privilege(current_user,'public.merge_catalog_tools(uuid,uuid)','execute')
      or has_table_privilege(current_user,'public.tool_revisions','insert') then raise exception 'Anonymous writes allowed'; end if;
end$$;
rollback;
