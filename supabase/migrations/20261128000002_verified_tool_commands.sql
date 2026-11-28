-- Verified with APM dry-run. Grill Me calls Grilling in its upstream SKILL.md.
insert into public.tools(name, description, apm_id, repo_url, website_url, install_command)
values (
  'Grill Me', 'Interview the author about a plan or design and resolve open decisions.',
  'mattpocock/skills/skills/productivity/grill-me',
  'https://github.com/mattpocock/skills/tree/bbadaa631c37af594e5a05c9cefacd9956136b18/skills/productivity/grill-me',
  'https://aihero.dev/skills',
  'apm install mattpocock/skills/skills/productivity/grill-me mattpocock/skills/skills/productivity/grilling'
) on conflict (apm_id) do nothing;

update public.tools set install_command = 'apm install obra/superpowers'
where apm_id = 'obra/superpowers' and merged_into is null
  and install_command is null and install_commands = '{}';

-- CLI installation methods published at the respective website URLs.
insert into public.tools(name, description, repo_url, website_url, install_commands)
select name, description, repo_url, website_url, commands
from (values
  ('Agent Package Manager', 'Manage skills and plugins for coding agents from a project manifest.',
   'https://github.com/microsoft/apm', 'https://microsoft.github.io/apm/getting-started/installation/',
   '{"macos":"brew install apm","linux":"curl -sSL https://aka.ms/apm-unix | sh","windows":"winget install --id Microsoft.APM --exact --source winget"}'::jsonb),
  ('Herdr', 'Manage persistent terminal sessions for coding agents.',
   'https://github.com/herdrdev/herdr', 'https://herdr.dev/tui/',
   '{"macos":"curl -fsSL https://herdr.dev/install.sh | sh","linux":"curl -fsSL https://herdr.dev/install.sh | sh","windows":"irm https://herdr.dev/install.ps1 | iex"}'::jsonb)
) as upstream(name, description, repo_url, website_url, commands)
where not exists (select 1 from public.tools existing where existing.repo_url = upstream.repo_url);

-- Match the specific published examples by identity and source evidence. Preserve
-- the author's writing, install comments, and any references already assigned.
update public.options o set tool_id = tool.id
from (values
  ('1f92c7ff-2a36-4686-8cf9-c2cb6184004a'::uuid, 'agent-package-manager', '%aka.ms%2Fapm-unix%', 'https://github.com/microsoft/apm'),
  ('d4408b89-356d-4cab-b517-48f029d5bfab'::uuid, 'herdr', '%herdr.dev%2Finstall.sh%', 'https://github.com/herdrdev/herdr')
) as legacy(id, name, evidence, repo_url)
join public.tools tool on tool.repo_url = legacy.repo_url and tool.merged_into is null
where o.id = legacy.id and o.name = legacy.name and o.description like legacy.evidence and o.tool_id is null;

update public.options o set tool_id = tool.id from public.tools tool
where o.id = 'cdeb9afc-5a0e-46d6-8094-98ae02acc28d' and o.name = 'mattpocock/skills'
  and o.description like '%productivity%2Fgrill-me%' and o.tool_id is null
  and tool.apm_id = 'mattpocock/skills/skills/productivity/grill-me' and tool.merged_into is null;
