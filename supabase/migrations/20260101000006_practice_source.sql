-- Import: source attribution for practices published from a repository.
-- Stores the raw file URL actually imported (canonical for "Sync now").
alter table public.practices add column source_url text;
