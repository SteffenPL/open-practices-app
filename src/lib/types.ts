export interface Profile {
  id: string
  display_name: string
  avatar_url: string | null
  created_at: string
}

export interface Tool {
  id: string
  apm_id: string | null
  repo_url: string | null
  name: string
  description: string | null
}

export interface Option {
  id: string
  element_id: string
  position: number
  name: string
  description: string | null
  tool_id: string | null
  tool: Tool | null
}

export interface Element {
  id: string
  practice_id: string
  position: number
  name: string
  description: string | null
  require_options: string[]
  reject_options: string[]
  options: Option[]
}

export interface Practice {
  id: string
  author_id: string
  title: string
  body: string
  image_path: string | null
  source_url: string | null
  published_at: string
  last_significant_at: string
  updated_at: string
  author?: Profile | null
}

export interface Comment {
  id: string
  practice_id: string
  author_id: string
  body: string
  created_at: string
  updated_at: string
  author?: Profile | null
}

export interface CommentVersion {
  id: string
  comment_id: string
  body: string
  created_at: string
}
