import { describe, expect, it } from 'vitest'
import { buildSkillsRepository, githubNewFileURL, githubRepositoryURL, isGitHubRepository, isPackageIdentifier } from './skillsRepository'

describe('My Skills repository files', () => {
  it('preserves dependency path case and removes repeated package references', () => {
    const generated = buildSkillsRepository('team/My_skills', ['up/Repo/skills/Pdf', 'UP/repo/skills/Pdf', 'up/Repo/skills/pdf#v1'])
    expect(generated.manifest.path).toBe('apm.yml')
    expect(generated.dependencyFragment).toBe('    - "up/Repo/skills/Pdf"\n    - "up/Repo/skills/pdf#v1"')
    expect(generated.manifest.content).toContain('  apm:\n' + generated.dependencyFragment)
    expect(generated.skill).toBeUndefined()
    expect(buildSkillsRepository('team/My_skills', []).manifest.content).toContain('  apm: []')
  })
  it('quotes frontmatter and preserves Markdown indentation in a portable skill', () => {
    const generated = buildSkillsRepository('team/skills', [], {name:'yes',description:'Use "quotes": #yes\nline two',instructions:'    indented\r\n'})
    expect(generated.skill).toMatchObject({path:'.apm/skills/yes/SKILL.md'})
    expect(generated.skill?.content).toContain('name: "yes"\ndescription: "Use \\"quotes\\": #yes\\nline two"\n---\n\n    indented\n')
  })
  it('rejects non-repository URLs, traversal, self references, and invalid skill names', () => {
    for (const repo of ['https://github.com/a/b', '../demo','org/..','org/repo\n','org/repo?other']) expect(isGitHubRepository(repo)).toBe(false)
    for (const spec of ['owner/repo/../escape','owner/repo#','owner/repo\ncommands','npm:foo','--test','owner/repo/.git/config']) expect(isPackageIdentifier(spec)).toBe(false)
    expect(isPackageIdentifier('openai/skills/skills/.curated/figma')).toBe(true)
    expect(() => buildSkillsRepository('team/skills',['TEAM/Skills'])).toThrow('itself')
    expect(() => buildSkillsRepository('team/skills',[],{name:'bad--slug',description:'A skill',instructions:'Read.'})).toThrow('hyphens')
  })
  it('encodes the exact filename and file body for GitHub, with a download fallback for large files', () => {
    const file = {path:'.apm/skills/notes/SKILL.md',content:'a&b\nc + 3 🎉'}
    const url = new URL(githubNewFileURL('team/skills',file,'trunk')!)
    expect(url.pathname).toBe('/team/skills/new/trunk')
    expect(url.searchParams.get('filename')).toBe(file.path)
    expect(url.searchParams.get('value')).toBe(file.content)
    expect(githubNewFileURL('team/skills',{...file,content:'🐙'.repeat(1000)})).toBeNull()
    expect(githubRepositoryURL('team/skills')).toBe('https://github.com/team/skills')
  })
})
