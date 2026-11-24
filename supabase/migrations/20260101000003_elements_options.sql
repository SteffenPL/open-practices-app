-- Elements: decision points inside a Practice.
-- Options: choices within an Element. Conditional visibility is stored on
-- the Element: require_options (all must be picked to show it) and
-- reject_options (any picked hides it). Both reference Option ids from
-- earlier Elements.
create table public.elements (
  id uuid primary key default gen_random_uuid(),
  practice_id uuid not null references public.practices(id) on delete cascade,
  position int not null default 0,
  name text not null check (length(trim(name)) > 0),
  description text,
  require_options uuid[] not null default '{}',
  reject_options uuid[] not null default '{}'
);

alter table public.elements enable row level security;

create policy "elements readable by everyone"
  on public.elements for select
  using (true);

create policy "practice authors manage their elements"
  on public.elements for insert
  with check (
    exists (
      select 1 from public.practices p
      where p.id = practice_id and p.author_id = auth.uid()
    )
  );

create policy "practice authors update their elements"
  on public.elements for update
  using (
    exists (
      select 1 from public.practices p
      where p.id = practice_id and p.author_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.practices p
      where p.id = practice_id and p.author_id = auth.uid()
    )
  );

create policy "practice authors delete their elements"
  on public.elements for delete
  using (
    exists (
      select 1 from public.practices p
      where p.id = practice_id and p.author_id = auth.uid()
    )
  );

create table public.options (
  id uuid primary key default gen_random_uuid(),
  element_id uuid not null references public.elements(id) on delete cascade,
  position int not null default 0,
  name text not null check (length(trim(name)) > 0),
  description text,
  -- Filled by the Tool catalog migration (0004); nullable until then.
  tool_id uuid
);

alter table public.options enable row level security;

create policy "options readable by everyone"
  on public.options for select
  using (true);

create policy "practice authors manage their options"
  on public.options for insert
  with check (
    exists (
      select 1 from public.elements e
      join public.practices p on p.id = e.practice_id
      where e.id = element_id and p.author_id = auth.uid()
    )
  );

create policy "practice authors update their options"
  on public.options for update
  using (
    exists (
      select 1 from public.elements e
      join public.practices p on p.id = e.practice_id
      where e.id = element_id and p.author_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.elements e
      join public.practices p on p.id = e.practice_id
      where e.id = element_id and p.author_id = auth.uid()
    )
  );

create policy "practice authors delete their options"
  on public.options for delete
  using (
    exists (
      select 1 from public.elements e
      join public.practices p on p.id = e.practice_id
      where e.id = element_id and p.author_id = auth.uid()
    )
  );
