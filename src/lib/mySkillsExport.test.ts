import { describe, expect, it } from 'vitest'
import { parse } from 'yaml'
import { generateSkillsExport } from './mySkillsExport'
import { buildSkillsRepository } from './skillsRepository'

const draft = {id:'1', name:'notes', description:'Summarize a meeting.', body:'Record action items.'}

describe('portable My Skills export', () => {
  it('exports local drafts and external packages without requiring a GitHub repository', () => {
    const selected_packages = ['local/my-skills', 'owner/my-skills', 'upstream/repo/skills/review']
    const result = generateSkillsExport({repo:'',selected_packages,drafts:[draft,{...draft,id:'2',name:'review'}]})
    expect(result.problems).toEqual([])
    expect(result.files.map(file => file.path)).toEqual(['apm.yml','.apm/skills/notes/SKILL.md','.apm/skills/review/SKILL.md'])
    expect(parse(result.files[0].content)).toEqual({name:'my-skills',version:'1.0.0',includes:'auto',dependencies:{apm:selected_packages}})
    expect(result.files[1].content).toContain('Record action items.')
  })

  it('keeps existing named repository output and genuine self-dependency checks', () => {
    const config = {repo:'example/Field_Notes',selected_packages:['owner/pkg'],drafts:[draft]}
    const expected = buildSkillsRepository(config.repo,config.selected_packages,{...draft,instructions:draft.body})
    expect(generateSkillsExport(config)).toEqual({files:[expected.manifest,expected.skill],problems:[]})
    expect(generateSkillsExport({...config,selected_packages:['EXAMPLE/field_notes']}).problems.join()).toContain('itself')
    expect(generateSkillsExport({...config,repo:'broken'}).problems.join()).toContain('owner/repository')
  })

  it('reports duplicate paths and invalid drafts while retaining the other previews', () => {
    const result = generateSkillsExport({repo:'',selected_packages:[],drafts:[draft,{...draft,id:'2'}, {...draft,id:'3',name:'Bad'}]})
    expect(result.files.map(file => file.path)).toEqual(['apm.yml','.apm/skills/notes/SKILL.md'])
    expect(result.problems).toEqual([expect.stringContaining('Skill 2 · Give each'),expect.stringContaining('Skill 3 · Use up to')])
  })
})
