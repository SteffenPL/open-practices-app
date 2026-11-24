-- Practices: the published unit of the platform. A Practice describes a
-- person's working setup and may contain Elements for readers to walk.
create table public.practices (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.profiles(id) on delete cascade,
  title text not null check (length(trim(title)) > 0),
  body text not null default '',
  image_path text,
  published_at timestamptz not null default now(),
  last_significant_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.practices enable row level security;

-- Timeline entries, detail pages, and author attribution are public.
create policy "practices readable by everyone"
  on public.practices for select
  using (true);

create policy "authors insert own practices"
  on public.practices for insert
  with check (auth.uid() = author_id);

-- A significant update sets last_significant_at (bumps the timeline);
-- updated_at always moves. The author chooses significance per edit.
create policy "authors update own practices"
  on public.practices for update
  using (auth.uid() = author_id)
  with check (auth.uid() = author_id);

create policy "authors delete own practices"
  on public.practices for delete
  using (auth.uid() = author_id);

-- Practice images: one public bucket, uploads by any signed-in author.
insert into storage.buckets (id, name, public)
values ('practice-images', 'practice-images', true)
on conflict (id) do nothing;

create policy "authenticated users upload practice images"
  on storage.objects for insert
  with check (bucket_id = 'practice-images' and auth.role() = 'authenticated');

create policy "image uploaders can delete their uploads"
  on storage.objects for delete
  using (bucket_id = 'practice-images' and owner = auth.uid());
