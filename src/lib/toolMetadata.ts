import type { ToolCommand } from './types'
import type { ToolField } from './toolMatching'

type Metadata = Partial<Record<ToolField, string>> & { commands?: ToolCommand[]; repo_url: string }

/** Read only published metadata from GitHub. Never run upstream instructions. */
export async function readToolMetadata(identifier: string, source: string) {
  const id = identifier.trim()
  let owner: string | undefined, repo: string | undefined
  let directory: string[] = [], ref = ''
  if (id) {
    const parts = id.split('/')
    ;[owner,repo] = parts
    directory = parts.slice(2)
  } else {
    const url = new URL(source)
    if (url.protocol !== 'https:' || url.hostname !== 'github.com' || url.port || url.username || url.password)
      throw new Error('Enter a GitHub source URL or an APM package identifier.')
    const parts = url.pathname.replace(/^\/|\/$/g,'').split('/')
    ;[owner,repo] = parts
    if(parts.length > 2) {
      if(parts[2] !== 'tree' || parts.length < 5) throw new Error('Use a GitHub repository or package directory URL.')
      ref = parts[3]
      directory = parts.slice(4)
    }
  }
  if (!owner || !repo || ![owner,repo,...directory,...(ref ? [ref] : [])].every(p => /^[\w.-]+$/.test(p) && p !== '.' && p !== '..'))
    throw new Error('Use an owner/repository identifier with an optional package path.')
  repo = repo.replace(/\.git$/i,'')
  const root = `${owner}/${repo}`
  const abort = AbortSignal.timeout(8000)
  const response = await fetch(`https://api.github.com/repos/${root}`, {signal:abort})
  if(!response.ok) throw new Error('GitHub could not load that repository.')
  const data = await response.json() as {name: string; description: string | null; default_branch: string; homepage?: string}
  const apm = [root,...directory].join('/')
  const suggested: Metadata = {name: directory.at(-1) || data.name, apm_id: apm, repo_url: `https://github.com/${root}`, install_command: `apm install ${apm}`}
  if(data.homepage && /^https?:\/\//i.test(data.homepage)) suggested.website_url = data.homepage
  if(directory.length) {
    ref ||= data.default_branch
    suggested.repo_url += `/tree/${encodeURIComponent(ref)}/${directory.join('/')}`
    const manifest = await fetch(`https://api.github.com/repos/${root}/contents/${directory.join('/')}/SKILL.md?ref=${encodeURIComponent(ref)}`, {signal:abort})
    if (!manifest.ok) throw new Error('The selected package directory does not contain an accessible SKILL.md.')
    const file = await manifest.json() as {size:number; content?:string}
    if(file.size > 120000 || !file.content) throw new Error('The skill manifest is too large to preview.')
    const text = new TextDecoder().decode(Uint8Array.from(atob(file.content), c => c.charCodeAt(0)))
    const frontmatter = text.match(/^---\s*\r?\n([\s\S]*?)\r?\n---(?:\s|$)/)?.[1] || ''
    const scalar = (key:string) => {
      const match = frontmatter.match(new RegExp('^' + key + ':[ \\t]*(.*)(?:\\r?\\n((?:[ \\t]+[^\\r\\n]*(?:\\r?\\n|$))*))?', 'm'))
      if(!match) return ''
      return (/^[>|][-+]?$/.test(match[1].trim()) ? match[2] || '' : match[1]).trim().replace(/^["']|["']$/g,'').replace(/\s+/g, ' ')
    }
    suggested.name = scalar('name') || suggested.name
    suggested.description = scalar('description').slice(0,4000)
    const name = scalar('name')
    if (/^[a-z0-9][a-z0-9-]{0,158}$/i.test(name)) {
      suggested.commands = [{name: '/' + name, description: suggested.description.slice(0,500)}]
    }
  } else {
    suggested.description = (data.description || '').slice(0,4000)
    const manifest = await fetch(`https://api.github.com/repos/${root}/contents/apm.yml`, {signal:abort})
    if(!manifest.ok) {
      const skill = await fetch(`https://api.github.com/repos/${root}/contents/SKILL.md`, {signal:abort})
      if(!skill.ok) {
        const plugin = await fetch(`https://api.github.com/repos/${root}/contents/.claude-plugin/plugin.json`, {signal:abort})
        if (plugin.ok) {
          const file = await plugin.json() as {size:number; content?:string}
          if (file.size <= 120000 && file.content) {
            const descriptor = JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(file.content), c => c.charCodeAt(0))))
            if (Array.isArray(descriptor.skills)) {
              const names = descriptor.skills.flatMap((path: unknown) => {
                if (typeof path !== 'string') return []
                const match = path.match(/^\.\/(?:[\w.-]+\/)*([a-z0-9][a-z0-9-]{0,158})$/i)
                return match ? ['/' + match[1]] : []
              })
              suggested.commands = [...new Set<string>(names)].slice(0,250).map(name => ({name}))
            }
          }
        } else { delete suggested.install_command; delete suggested.apm_id }
      }
    }
  }
  return suggested
}
