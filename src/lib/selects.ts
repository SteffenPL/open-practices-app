/** Shared PostgREST select string: a row plus its author's public identity. */
export const AUTHOR_SELECT = '*, author:profiles(display_name, avatar_url)'
