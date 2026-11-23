-- Profiles: minimal public identity for each user.
-- One row per auth user, auto-created on signup.
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default '',
  avatar_url text,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- Profiles are public: practices display author names and pictures.
create policy "profiles readable by everyone"
  on public.profiles for select
  using (true);

create policy "users insert own profile"
  on public.profiles for insert
  with check (auth.uid() = id);

create policy "users update own profile"
  on public.profiles for update
  using (auth.uid() = id);

-- Auto-provision the profile row on signup, seeding display name and
-- avatar from the Google account's metadata.
create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name, avatar_url)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'name', ''),
    new.raw_user_meta_data->>'picture'
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
