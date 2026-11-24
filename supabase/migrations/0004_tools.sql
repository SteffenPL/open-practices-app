-- Tools: shared catalog of installable things referenced by Options.
-- Identity comes from an APM package ID and/or a GitHub repository.
-- Auto-provisioned on first reference; never hand-edited in v1.
create table public.tools (
  id uuid primary key default gen_random_uuid(),
  apm_id text unique,
  repo_url text unique,
  name text not null,
  description text,
  created_at timestamptz not null default now(),
  check (apm_id is not null or repo_url is not null)
);

alter table public.tools enable row level security;

create policy "tools readable by everyone"
  on public.tools for select
  using (true);

create policy "authenticated users provision tools"
  on public.tools for insert
  with check (auth.role() = 'authenticated');

-- Options may reference a Tool.
alter table public.options
  add constraint options_tool_id_fkey
  foreign key (tool_id) references public.tools(id);
