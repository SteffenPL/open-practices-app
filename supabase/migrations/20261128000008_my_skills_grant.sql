-- Existing grants keep their original permissions. Private drafts require an
-- independently issued grant for the personal collection endpoint.
alter table public.agent_grants drop constraint agent_grants_scope_check;
alter table public.agent_grants add constraint agent_grants_scope_check
  check(scope in ('read','practices','catalog','contribute','my-skills'));
notify pgrst,'reload schema';
