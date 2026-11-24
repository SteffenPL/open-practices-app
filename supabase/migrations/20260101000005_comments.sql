-- Comments: flat, one level, on Practices. Editing keeps a visible
-- version history in comment_versions (append-only log of prior bodies).
create table public.comments (
  id uuid primary key default gen_random_uuid(),
  practice_id uuid not null references public.practices(id) on delete cascade,
  author_id uuid not null references public.profiles(id) on delete cascade,
  body text not null check (length(trim(body)) > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.comments enable row level security;

create policy "comments readable by everyone"
  on public.comments for select
  using (true);

create policy "comment authors insert their comments"
  on public.comments for insert
  with check (auth.uid() = author_id);

create policy "comment authors update their comments"
  on public.comments for update
  using (auth.uid() = author_id)
  with check (auth.uid() = author_id);

-- Comment authors can delete their own; the Practice author can delete any.
create policy "comment author or practice author deletes"
  on public.comments for delete
  using (
    auth.uid() = author_id
    or exists (
      select 1 from public.practices p
      where p.id = practice_id and p.author_id = auth.uid()
    )
  );

create table public.comment_versions (
  id uuid primary key default gen_random_uuid(),
  comment_id uuid not null references public.comments(id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now()
);

alter table public.comment_versions enable row level security;

create policy "comment versions readable by everyone"
  on public.comment_versions for select
  using (true);

create policy "comment authors append versions"
  on public.comment_versions for insert
  with check (
    exists (
      select 1 from public.comments c
      where c.id = comment_id and c.author_id = auth.uid()
    )
  );
