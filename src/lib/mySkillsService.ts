import { supabase } from './supabase'

export interface SkillDraft {
  id: string
  name: string
  description: string
  body: string
}

export interface MySkillsConfig {
  repo: string
  selected_packages: string[]
  drafts: SkillDraft[]
}

export interface MySkillsSnapshot {
  version: number
  config: MySkillsConfig
}

export class MySkillsConflictError extends Error {
  constructor() {
    super('My Skills changed in another tab. Reload the saved version before saving again.')
    this.name = 'MySkillsConflictError'
  }
}

export async function loadMySkills(): Promise<MySkillsSnapshot> {
  if (!supabase) throw new Error('Supabase is not configured.')
  const { data, error } = await supabase.from('my_skills_configs').select('config,version').maybeSingle()
  if (error) throw new Error(error.message)
  return data as MySkillsSnapshot | null ?? { config: { repo: '', selected_packages: [], drafts: [] }, version: 0 }
}

export async function saveMySkills(config: MySkillsConfig, expectedVersion: number): Promise<MySkillsSnapshot> {
  if (!supabase) throw new Error('Supabase is not configured.')
  const {data, error} = await supabase.rpc('save_my_skills_config', {
    p_config: config, p_expected_version: expectedVersion,
  }).single()
  if (error?.code === 'PT409') throw new MySkillsConflictError()
  if (error) throw new Error(error.message)
  return data as MySkillsSnapshot
}
