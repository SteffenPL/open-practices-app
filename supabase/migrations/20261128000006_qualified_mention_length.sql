-- A qualified identifier can contain a package path and a command name.
alter table public.practice_tool_mentions
  drop constraint practice_tool_mentions_token_check,
  add constraint practice_tool_mentions_token_check
    check (length(token) between 2 and 4096 and token ~ '^#[^[:space:]#]+$');
