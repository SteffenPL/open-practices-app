begin;
insert into auth.users(id,raw_user_meta_data) values
 ('1379f181-e9ac-4512-9197-000000000011','{}'),('1379f181-e9ac-4512-9197-000000000012','{}');
set local role authenticated;
set local request.jwt.claim.sub='1379f181-e9ac-4512-9197-000000000011';
do $$
declare
  payload jsonb:='{"repo":"owner/default","selected_packages":["public/tools/Case"],"drafts":[]}';
  other jsonb:=payload||'{"repo":"owner/named"}'; setup record; result record; setup_id text;
begin
  if (select count(*) from public.list_my_skills_setups())<>1 then raise exception 'Expected virtual default'; end if;
  perform public.save_my_skills_config(payload,0);
  if (select config from public.load_my_skills_setup('default'))<>payload then raise exception 'Legacy default lost'; end if;
  select * into setup from public.create_my_skills_setup('Test workspace');
  setup_id:=setup.id;
  if setup.is_default or setup.version<>1 then raise exception 'Bad new setup'; end if;
  perform public.create_my_skills_setup('Test workspace',setup_id::uuid);
  if (select count(*) from public.list_my_skills_setups())<>2 then raise exception 'Create retry duplicated setup'; end if;
  perform public.rename_my_skills_setup('default','Renamed default',1);
  select * into result from public.save_my_skills_setup(setup_id,other,1);
  if result.version<>2 then raise exception 'Setup versions coupled'; end if;
  perform public.rename_my_skills_setup(setup_id,'Renamed workspace',2);
  begin perform public.save_my_skills_setup(setup_id,payload,2); raise exception 'Allowed stale write' using errcode='ZX100';
  exception when sqlstate 'PT409' then null; end;
  begin perform public.rename_my_skills_setup(setup_id,'Stale',2); raise exception 'Allowed stale rename' using errcode='ZX100';
  exception when sqlstate 'PT409' then null; end;
  begin perform public.delete_my_skills_setup(setup_id,2); raise exception 'Allowed stale delete' using errcode='ZX100';
  exception when sqlstate 'PT409' then null; end;
  begin perform public.delete_my_skills_setup('default',2); raise exception 'Deleted default' using errcode='ZX100';
  exception when invalid_parameter_value then null; end;
  perform set_config('request.jwt.claim.sub','1379f181-e9ac-4512-9197-000000000012',true);
  if (select count(*) from public.list_my_skills_setups())<>1 or exists(select 1 from public.my_skills_setups)
      or (select version from public.load_my_skills_setup('default'))<>0 then raise exception 'Cross-owner read'; end if;
  begin perform public.load_my_skills_setup(setup_id); raise exception 'Cross-owner read by ID' using errcode='ZX100';
  exception when sqlstate 'PT404' then null; end;
  begin perform public.save_my_skills_setup(setup_id,payload,3); raise exception 'Cross-owner write' using errcode='ZX100';
  exception when sqlstate 'PT404' then null; end;
  begin perform public.delete_my_skills_setup(setup_id,3); raise exception 'Cross-owner delete' using errcode='ZX100';
  exception when sqlstate 'PT404' then null; end;
  begin perform public.rename_my_skills_setup(setup_id,'changed',3); raise exception 'Cross-owner rename' using errcode='ZX100';
  exception when sqlstate 'PT404' then null; end;
  perform set_config('request.jwt.claim.sub','1379f181-e9ac-4512-9197-000000000011',true);
  perform public.delete_my_skills_setup(setup_id,3);
  if (select count(*) from public.list_my_skills_setups())<>1 or (select config from public.load_my_skills_setup('default'))<>payload then raise exception 'Removed default'; end if;
  perform public.save_my_skills_config(other,2);
  if (select name from public.list_my_skills_setups())<>'Renamed default' then raise exception 'Legacy client erased name'; end if;
end $$;
set local role anon;
do $$begin
  begin perform public.list_my_skills_setups(); raise exception 'Anonymous list succeeded' using errcode='ZX100';
  exception when insufficient_privilege then null; end;
end $$;
rollback;
