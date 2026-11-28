import { describe, expect, it } from 'vitest'
import { mentionSuggestions, resolveMentionTool } from './mentionIdentity'
import { activePracticeMention, tokenizePracticeText } from './practiceText'
import { parseDefinition, renderDefinition } from './practiceDefinition'

const tool = {slug:'skills-suite',name:'Skills',apm_id:'mattpocock/skills',name_aliases:['Matt Skills'],commands:[{name:'/review',description:'Review a change'}],aliases:[{slug:'older',apm_id:'other/repo/Skill'}]}
describe('qualified mentions', () => {
  it('preserves the whole visible token and ignores literals and punctuation', () => {
    const body='Try #mattpocock/skills::review, #older::/review and `#x::run` or “#y::ask”.'
    expect(tokenizePracticeText(body).filter(t=>t.kind==='mention').map(t=>t.text)).toEqual(['#mattpocock/skills::review','#older::/review'])
    expect(activePracticeMention('#mattpocock/skills::',20)?.query).toBe('mattpocock/skills::')
    expect(activePracticeMention('#other/',7)?.query).toBe('other/')
    expect(tokenizePracticeText('#openai/skills/skills/.curated/playwright::run.')[0].text).toBe('#openai/skills/skills/.curated/playwright::run')
    expect(tokenizePracticeText('#git.Then')[0].text).toBe('#git')
  })
  it('resolves aliases while keeping package subpaths case-sensitive and ambiguous aliases unlinked', () => {
    for (const token of ['#Matt-Skills::review','#MATTPocock/Skills::/review','#older','#Other/Repo/Skill']) expect(resolveMentionTool(token,[tool])).toBe(tool)
    expect(resolveMentionTool('#other/repo/skill',[tool])).toBeUndefined()
    expect(resolveMentionTool('#Matt-Skills',[tool,{slug:'another',name_aliases:['Matt Skills']}])).toBeUndefined()
  })
  it('suggests commands while selecting a tool and filters after ::', () => {
    expect(mentionSuggestions('mattp',[tool])[0].token).toBe('#mattpocock/skills')
    expect(mentionSuggestions('mattpocock/skills',[tool]).map(m=>m.token)).toEqual(['#mattpocock/skills','#mattpocock/skills::review'])
    expect(mentionSuggestions('older::re',[tool])[0]).toMatchObject({token:'#older::review',description:'Review a change'})
  })
  it('round-trips command mentions through Markdown while keeping setup on the tool', () => {
    const definition=parseDefinition('---\ntitle: Try this\n---\n\nUse #other/repo/Skill::review.\n\n## Tool setup\n\n### #other/repo/Skill\nnotes: Remember this\n')
    expect(definition.mentions?.[0]).toMatchObject({token:'#other/repo/Skill::review',slug:'other/repo/Skill',notes:'Remember this'})
    expect(parseDefinition(renderDefinition(definition)).mentions).toEqual(definition.mentions)
  })
})
