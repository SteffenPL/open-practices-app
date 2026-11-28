-- Only the identifier, scope, and expiry are persisted. The opaque bearer holds an
-- encrypted, short-lived user JWT, so all agent operations still run under user RLS.
create table public.agent_grants (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  scope text not null check(scope in ('read','practices','catalog','contribute')),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null check(expires_at > created_at and expires_at <= created_at + interval '30 minutes')
);
create index agent_grants_owner_expiry on public.agent_grants(owner_id,expires_at desc);
alter table public.agent_grants enable row level security;
revoke all on public.agent_grants from public,anon,authenticated;
grant select,delete on public.agent_grants to authenticated;
grant insert(scope,expires_at) on public.agent_grants to authenticated;
create policy "own agent grants" on public.agent_grants for select to authenticated using(owner_id=auth.uid());
create policy "issue own agent grant" on public.agent_grants for insert to authenticated with check(owner_id=auth.uid());
create policy "revoke own agent grant" on public.agent_grants for delete to authenticated using(owner_id=auth.uid());
notify pgrst,'reload schema';
