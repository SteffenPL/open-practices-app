export interface RepositoryFile {
  path: string
  content: string
}

export interface AuthoredSkill {
  name: string
  description: string
  instructions: string
}

export interface SkillsRepository {
  manifest: RepositoryFile
  skill?: RepositoryFile
  dependencyFragment: string
}

export function isGitHubRepository(value: string): boolean {
  if (/\s/.test(value)) return false
  const parts = value.split('/')
  if (parts.length !== 2) return false
  const [owner, repo] = parts
  // Enterprise Managed Users can have a single underscore before the enterprise shortcode.
  return owner.length <= 39 && /^[a-z0-9]+(?:-[a-z0-9]+)*(?:_[a-z0-9]+)?$/i.test(owner)
    && /^[a-z0-9._-]{1,100}$/i.test(repo) && !/^\.{1,2}$/.test(repo) && !/\.git$/i.test(repo)
}

function validPath(path: string) {
  return path.split('/').every(part => /^[\w.@-]+$/.test(part) && !['.', '..', '.git'].includes(part.toLowerCase()))
}

export function isPackageIdentifier(value: string): boolean {
  if (value.length > 512 || /\s/.test(value)) return false
  const [location, ref, ...extra] = value.split('#')
  if (extra.length || (ref !== undefined && (!ref || !validPath(ref) || !/^[a-z0-9]/i.test(ref)))) return false
  const [owner, repo, ...path] = location.split('/')
  return Boolean(repo && isGitHubRepository(owner + '/' + repo) && (!path.length || validPath(path.join('/'))))
}

export function githubRepositoryURL(repo: string): string {
  if (!isGitHubRepository(repo)) throw new Error('Enter the GitHub repository as owner/repository.')
  return 'https://github.com/' + repo
}

export function buildSkillsManifest(repo: string | null, dependencies: string[]) {
  if (repo !== null && !isGitHubRepository(repo)) throw new Error('Enter the GitHub repository as owner/repository.')
  const unique = new Map<string, string>()
  for (const dependency of dependencies) {
    const id = dependency.trim()
    if (!isPackageIdentifier(id)) throw new Error('Enter a GitHub package identifier with an optional skill path or Git ref.')
    const [location, ref] = id.split('#')
    const [owner, name, ...path] = location.split('/')
    const root = (owner + '/' + name).toLowerCase()
    if (root === repo?.toLowerCase()) throw new Error('A skills repository cannot depend on itself.')
    const key = [root, ...path].join('/') + (ref ? '#' + ref : '')
    if (!unique.has(key)) unique.set(key, id)
  }
  const dependencyFragment = Array.from(unique.values(), id => '    - ' + JSON.stringify(id)).join('\n')
  const packageName = (repo?.split('/')[1] ?? 'my-skills').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'skills'
  const manifest = {
    path: 'apm.yml',
    content: [
      'name: ' + JSON.stringify(packageName),
      'version: "1.0.0"',
      'includes: auto',
      'dependencies:',
      dependencyFragment ? '  apm:\n' + dependencyFragment : '  apm: []',
      '',
    ].join('\n'),
  }
  return { manifest, dependencyFragment }
}

export function buildSkillFile(skill: AuthoredSkill): RepositoryFile {
  if (skill.name.length > 64 || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(skill.name) || /\s/.test(skill.name)) {
    throw new Error('Use up to 64 lowercase letters, digits, and single hyphens for the skill name.')
  }
  const description = skill.description.trim()
  if (!description || description.length > 1024) throw new Error('Write a skill description of 1 to 1,024 characters.')
  if (!skill.instructions.trim()) throw new Error('Write instructions for the skill.')
  const frontmatter = ['---', 'name: ' + JSON.stringify(skill.name), 'description: ' + JSON.stringify(description), '---', '', ''].join('\n')
  const instructions = skill.instructions.replace(/\r\n?/g, '\n')
  return {
    path: '.apm/skills/' + skill.name + '/SKILL.md',
    content: frontmatter + instructions + (instructions.endsWith('\n') ? '' : '\n'),
  }
}

export function buildSkillsRepository(repo: string, dependencies: string[], skill?: AuthoredSkill): SkillsRepository {
  const result = buildSkillsManifest(repo, dependencies)
  return skill ? {...result, skill: buildSkillFile(skill)} : result
}

export function githubNewFileURL(repo: string, file: RepositoryFile, branch = 'main'): string | null {
  if (!isGitHubRepository(repo) || !validPath(branch) || !validPath(file.path)) return null
  const url = new URL(githubRepositoryURL(repo) + '/new/' + branch.split('/').map(encodeURIComponent).join('/'))
  url.searchParams.set('filename', file.path)
  url.searchParams.set('value', file.content)
  return url.href.length <= 2000 ? url.href : null
}

export function downloadRepositoryFile(file: RepositoryFile) {
  const url = URL.createObjectURL(new Blob([file.content], {type:'text/plain;charset=utf-8'}))
  const link = document.createElement('a')
  link.href = url
  link.download = file.path.split('/').at(-1) || 'download'
  document.body.append(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}
