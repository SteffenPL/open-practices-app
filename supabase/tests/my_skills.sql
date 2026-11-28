begin;
insert into auth.users(id,raw_user_meta_data) values
 ('1379f181-e9ac-4512-9197-000000000001','{}'),('1379f181-e9ac-4512-9197-000000000002','{}');
set local role authenticated;
set local request.jwt.claim.sub='1379f181-e9ac-4512-9197-000000000001';
do $$
declare initial jsonb:='{"repo":"owner/skills","selected_packages":["owner/repo/Path"],"drafts":[{"id":"draft-a","name":"","description":"","body":"unfinished"},{"id":"draft-b","name":"second","description":"another","body":"# Skill"}]}';
  newer jsonb:=initial||'{"repo":"owner/new"}'; saved record;
begin
 select * into saved from public.save_my_skills_config(initial,0);
 if saved.version<>1 or saved.config<>initial then raise exception 'Initial save failed'; end if;
 select * into saved from public.save_my_skills_config(initial,0);
 if saved.version<>1 then raise exception 'Lost-response retry changed version'; end if;
 select * into saved from public.save_my_skills_config(newer,1);
 if saved.version<>2 then raise exception 'Did not increment version'; end if;
 begin
   perform public.save_my_skills_config(initial,1);
   raise exception 'Stale draft save succeeded' using errcode='ZX100';
 exception when sqlstate 'PT409' then null; end;
 begin
   perform public.save_my_skills_config(newer||'{"drafts":[{}]}',2);
   raise exception 'Invalid shape accepted' using errcode='ZX100';
 exception when invalid_parameter_value then null; end;
 if (select config from public.my_skills_configs)<>newer then raise exception 'Rejected edit changed draft'; end if;
 perform set_config('request.jwt.claim.sub','1379f181-e9ac-4512-9197-000000000002',true);
 if exists(select 1 from public.my_skills_configs) then raise exception 'Other owner can read drafts'; end if;
 begin
   update public.my_skills_configs set config=initial;
   raise exception 'Direct writes allowed' using errcode='ZX100';
 exception when insufficient_privilege then null; end;
 perform public.save_my_skills_config(initial,0);
 if (select count(*) from public.my_skills_configs)<>1 then raise exception 'Wrong owner snapshot'; end if;
end $$;
set local role anon;
do $$begin
 begin
   perform * from public.my_skills_configs;
   raise exception 'Anonymous read allowed' using errcode='ZX100';
 exception when insufficient_privilege then null; end;
 begin
   perform public.save_my_skills_config('{}',0);
   raise exception 'Anonymous write allowed' using errcode='ZX100';
 exception when insufficient_privilege then null; end;
end $$;
rollback;
