interface Identity {
  slug: string
  name?: string
  apm_id?: string | null
  name_aliases?: string[]
}
interface Mentionable extends Identity {
  aliases?: Identity[]
  commands?: {name:string; description?:string}[]
}
export function mentionBase(token: string) {
  return token.replace(/^#/, '').split('::', 1)[0]
}
function key(identifier: string) {
  const [owner, repo, ...path] = identifier.split('/')
  return [owner.toLowerCase(), ...(repo ? [repo.toLowerCase(), ...path] : [])].join('/')
}
function commandHandle(name: string) {
  return name.replace(/^\/+/, '').trim().replace(/[^\p{L}\p{N}_.-]+/gu, '-').replace(/^[.-]+|[.-]+$/g, '')
}
export function preferredToolHandle(tool: Pick<Identity, 'slug' | 'apm_id'>) {
  return tool.apm_id?.split('/').length === 2 ? tool.apm_id : tool.slug
}
function handles(entry: Identity) {
  return [entry.slug, entry.apm_id, ...(entry.name_aliases ?? []).map(alias => alias.replace(/^#/, '').trim().replace(/\s+/g, '-'))].filter((v): v is string => !!v)
}
export function resolveMentionTool<T extends Mentionable>(query: string, tools: T[]): T | undefined {
  const base = key(mentionBase(query))
  const canonical = tools.find(tool => [tool.slug, tool.apm_id].some(handle => handle && key(handle) === base))
  if (canonical) return canonical
  const matches = tools.filter(tool => [tool,...(tool.aliases ?? [])].some(entry => handles(entry).some(handle => key(handle) === base)))
  return matches.length === 1 ? matches[0] : undefined
}
export function mentionSuggestions<T extends Mentionable>(query: string, tools: T[]) {
  const matches: {tool:T; token:string; label:string; description?:string}[] = []
  const [base, command] = query.split('::')
  const toolMatch = resolveMentionTool(base, tools)
  const candidates = toolMatch ? [toolMatch, ...tools.filter(tool => tool !== toolMatch)] : tools
  for (const tool of candidates) {
    if (command !== undefined) {
      if (tool !== toolMatch) continue
      for (const item of tool.commands ?? []) {
        const name = commandHandle(item.name)
        if (!name) continue
        if (name.toLowerCase().includes(command.replace(/^\//, '').toLowerCase())) {
          matches.push({tool,token:'#'+base+'::'+name,label:item.name,description:item.description})
        }
      }
    } else {
      const catalogHandles = [tool,...(tool.aliases ?? [])].flatMap(handles)
      const byHandle = catalogHandles.find(handle => key(handle) === key(base))
        ?? catalogHandles.find(handle => handle.toLowerCase().includes(base.toLowerCase()))
      if (!byHandle && !tool.name?.toLowerCase().includes(base.toLowerCase())) continue
      const handle = byHandle && (base.includes('/') || key(byHandle) === key(base)) ? byHandle : preferredToolHandle(tool)
      matches.push({tool,token:'#'+handle,label:tool.name ?? tool.slug})
      if (base && toolMatch === tool) {
        for (const item of tool.commands ?? []) {
          const name = commandHandle(item.name)
          if (name) matches.push({tool,token:'#'+handle+'::'+name,label:item.name,description:item.description})
        }
      }
    }
  }
  return matches.slice(0, 12)
}
