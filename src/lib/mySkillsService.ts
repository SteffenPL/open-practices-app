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

export const DEFAULT_SKILLS_SETUP_ID = 'default'

export interface MySkillsSetup {
  id: string
  name: string
  is_default: boolean
  version: number
}

function database() {
  if (!supabase) throw new Error('Supabase is not configured.')
  return supabase
}

function check(error: { code?: string; message: string } | null) {
  if (error?.code === 'PT409') throw new MySkillsConflictError()
  if (error) throw new Error(error.message)
}

export async function listMySkillsSetups(): Promise<MySkillsSetup[]> {
  const {data, error} = await database().rpc('list_my_skills_setups')
  check(error)
  return data as MySkillsSetup[]
}

export async function createMySkillsSetup(name: string, requestId: string = crypto.randomUUID()): Promise<MySkillsSetup> {
  const {data,error} = await database().rpc('create_my_skills_setup', {p_name:name,p_request_id:requestId}).single()
  check(error)
  return data as MySkillsSetup
}

export async function renameMySkillsSetup(id:string, name:string, expectedVersion:number): Promise<MySkillsSetup> {
  const {data,error} = await database().rpc('rename_my_skills_setup',{p_id:id,p_name:name,p_expected_version:expectedVersion}).single()
  check(error)
  return data as MySkillsSetup
}

export async function loadMySkills(id = DEFAULT_SKILLS_SETUP_ID): Promise<MySkillsSnapshot> {
  const {data,error} = await database().rpc('load_my_skills_setup',{p_id:id}).single()
  check(error)
  return data as MySkillsSnapshot
}

export async function saveMySkills(config: MySkillsConfig, expectedVersion: number, id = DEFAULT_SKILLS_SETUP_ID): Promise<MySkillsSnapshot> {
  const {data,error} = await database().rpc('save_my_skills_setup', {
    p_id:id,p_config:config,p_expected_version:expectedVersion,
  }).single()
  check(error)
  return data as MySkillsSnapshot
}

export async function deleteMySkillsSetup(id:string, expectedVersion:number):Promise<void> {
  const {error} = await database().rpc('delete_my_skills_setup',{p_id:id,p_expected_version:expectedVersion})
  check(error)
}
