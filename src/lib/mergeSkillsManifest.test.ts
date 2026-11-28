import { describe, expect, it } from 'vitest'
import { parse } from 'yaml'
import { mergeSkillsManifest } from './mergeSkillsManifest'

describe('merging a selection into apm.yml', () => {
  const original = '# team settings\nname: writing\nversion: 1.2.0\ndependencies:\n  apm:\n    - git: Example/Skills#v2\n      skills: [draft]\n  mcp: [example]\nscripts:\n  review: do-review\n'
  it('preserves pins, filters, comments and unrelated configuration', () => {
    const result = mergeSkillsManifest(original, ['example/skills', 'upstream/tools/Case'])
    expect(result.added).toEqual(['upstream/tools/Case'])
    expect(result.text).toContain('# team settings')
    expect(parse(result.text)).toEqual({...parse(original), dependencies:{apm:[{git:'Example/Skills#v2',skills:['draft']},'upstream/tools/Case'],mcp:['example']}})
    expect(mergeSkillsManifest(result.text, ['Upstream/Tools/Case']).text).toBe(result.text)
  })
  it('handles manifests without dependencies and refuses malformed input', () => {
    expect(parse(mergeSkillsManifest('name: mine\n', ['owner/skills']).text).dependencies.apm).toEqual(['owner/skills'])
    expect(() => mergeSkillsManifest('dependencies: [wrong]', ['owner/skills'])).toThrow()
    expect(() => mergeSkillsManifest('bad: [', ['owner/skills'])).toThrow()
  })
})
