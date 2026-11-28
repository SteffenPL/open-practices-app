import { isGitHubRepository, type RepositoryFile } from './skillsRepository'

export interface GitHubSkillsSnapshot {
  repo: string
  branch: string
  sha: string
  files: RepositoryFile[]
}

interface TreeEntry { path: string; type: string; mode: string; sha: string; size?: number }
interface Tree { tree: TreeEntry[]; truncated: boolean }
type Request = <T>(path: string, method?: 'GET' | 'POST', body?: unknown) => Promise<T>
const maxFileSize = 1024 * 1024
const changedBranch = 'The GitHub branch changed. Pull its latest version before pushing.'
const skillDirectory = /^\.apm\/skills\/[a-z0-9]+(?:-[a-z0-9]+)*$/

function managedPath(path: string) {
  return path === 'apm.yml' || (path.endsWith('/SKILL.md') && skillDirectory.test(path.slice(0, -9)))
}

function branchRef(branch: string) {
  if (!branch || branch === '@' || branch.startsWith('-') || branch.includes('..') || branch.includes('@{')
    || branch.endsWith('.') || /[\s~^:?*[\\]/.test(branch) || Array.from(branch).some(char => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127)
    || branch.split('/').some(part => !part || part.startsWith('.') || part.endsWith('.lock'))) {
    throw new Error('Enter a valid GitHub branch name.')
  }
  return 'heads/' + branch.split('/').map(encodeURIComponent).join('/')
}

function gitSHA(value: string) {
  if (!/^[a-f\d]{40}$/i.test(value)) throw new Error('GitHub returned an invalid Git object identifier.')
  return value
}

function github(repo: string, token?: string): Request {
  if (!isGitHubRepository(repo)) throw new Error('Enter a GitHub repository as owner/repository.')
  return async <T>(path: string, method = 'GET', body?: unknown): Promise<T> => {
    const headers: Record<string, string> = {Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28'}
    if (token?.trim()) headers.Authorization = 'Bearer ' + token.trim()
    if (body !== undefined) headers['Content-Type'] = 'application/json'
    const url = path === 'graphql' ? 'https://api.github.com/graphql' :
      'https://api.github.com/repos/' + repo + (path ? '/git/' + path : '')
    const response = await fetch(url, {
      method, headers, body: body === undefined ? undefined : JSON.stringify(body), cache: 'no-store', redirect: 'error', credentials: 'omit',
    })
    if (!response.ok) {
      if (response.status === 401) throw new Error('GitHub rejected the token. Check its value and expiration.')
      if (response.status === 429 || (response.status === 403 && response.headers.get('X-RateLimit-Remaining') === '0')) {
        throw new Error('GitHub’s API rate limit was reached. Try again after the limit resets.')
      }
      if (response.status === 404) throw new Error('GitHub could not find the repository or branch. Check the name and token access.')
      if (response.status === 403) throw new Error('GitHub denied access. Check the token’s repository permissions and branch protection.')
      if (response.status === 409) throw new Error('The repository needs an initial commit on the selected branch before syncing.')
      throw new Error('GitHub could not complete the request (HTTP ' + response.status + ').')
    }
    return response.json() as Promise<T>
  }
}

async function head(request: Request, ref: string) {
  const result = await request<{object:{sha:string;type:string}}>('ref/' + ref)
  if (result.object.type !== 'commit') throw new Error('The selected GitHub ref must be a branch pointing to a commit.')
  return gitSHA(result.object.sha)
}

function inspectManagedEntries(entries: TreeEntry[]) {
  for (const entry of entries) {
    const path = entry.path.toLowerCase()
    const directory = path === '.apm' || path === '.apm/skills' || skillDirectory.test(path)
    const skill = path.endsWith('/skill.md') && skillDirectory.test(path.slice(0,-9))
    if (!directory && !skill && path !== 'apm.yml') continue
    const canonical = skill ? path.slice(0,-9) + '/SKILL.md' : path
    if (entry.path !== canonical) throw new Error('Rename ' + entry.path + ' to ' + canonical + ' before syncing.')
    if (directory && (entry.type !== 'tree' || entry.mode !== '040000')) {
      throw new Error(entry.path + ' must be a directory. Sync cannot follow a link or submodule there.')
    }
    if (!directory) regularFile(entry)
  }
  return entries
}

async function treeAt(request: Request, sha: string) {
  const commit = await request<{tree:{sha:string}}>('commits/' + gitSHA(sha))
  const root = gitSHA(commit.tree.sha)
  const recursive = await request<Tree>('trees/' + root + '?recursive=1')
  if (!recursive.truncated) return {root, entries:inspectManagedEntries(recursive.tree)}
  // Extremely large repositories can truncate recursive listings. Only descend into managed directories.
  const entries: TreeEntry[] = []
  async function descend(sha: string, prefix: string) {
    const tree = await request<Tree>('trees/' + gitSHA(sha))
    if (tree.truncated) throw new Error('GitHub returned an incomplete directory listing. Sync requires a complete list of skill files.')
    for (const entry of tree.tree) {
      const path = prefix + entry.path
      entries.push({...entry,path})
      if (entry.type === 'tree' && (path === '.apm' || path === '.apm/skills' || skillDirectory.test(path))) {
        await descend(entry.sha, path + '/')
      }
    }
  }
  await descend(root,'')
  return {root,entries:inspectManagedEntries(entries)}
}

function regularFile(entry: TreeEntry) {
  if (entry.type !== 'blob' || !['100644','100755'].includes(entry.mode)) {
    throw new Error(entry.path + ' must be a regular file. GitHub sync cannot edit a link, directory, or submodule at that path.')
  }
  if (entry.size === undefined || entry.size > maxFileSize) throw new Error(entry.path + ' exceeds the 1 MiB file limit or its size is unavailable.')
}

export async function loadGitHubSkills(repo: string, branch: string, token?: string): Promise<GitHubSkillsSnapshot> {
  const request = github(repo,token)
  const sha = await head(request,branchRef(branch))
  const {entries} = await treeAt(request,sha)
  const managed = entries.filter(entry => managedPath(entry.path))
  managed.sort((a,b) => a.path === 'apm.yml' ? -1 : b.path === 'apm.yml' ? 1 : a.path < b.path ? -1 : 1)
  const files: RepositoryFile[] = []
  for (let i = 0; i < managed.length; i += 6) {
    files.push(...await Promise.all(managed.slice(i,i+6).map(async entry => {
      const blob = await request<{encoding:string;content:string;size:number}>('blobs/' + gitSHA(entry.sha))
      if (blob.encoding !== 'base64' || blob.size !== entry.size) throw new Error('GitHub returned incomplete content for ' + entry.path)
      try {
        const data = Uint8Array.from(atob(blob.content), char => char.charCodeAt(0))
        if (data.length !== blob.size) throw new Error()
        const content = new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(data)
        if (content.includes('\0')) throw new Error()
        return {path:entry.path,content}
      } catch { throw new Error(entry.path + ' must contain complete UTF-8 text.') }
    })))
  }
  return {repo,branch,sha,files}
}

export async function pushGitHubSkills(snapshot: GitHubSkillsSnapshot, files: RepositoryFile[], message: string, token: string): Promise<string> {
  if (!token.trim()) throw new Error('Enter a GitHub token with Contents write permission for this repository.')
  if (!message.trim()) throw new Error('Enter a commit message.')
  const paths = new Set<string>()
  const original = new Map(snapshot.files.map(file => [file.path,file.content]))
  for (const file of files) {
    if (!managedPath(file.path) || paths.has(file.path)) throw new Error('Choose each managed skill or manifest path only once.')
    if (new TextEncoder().encode(file.content).length > maxFileSize || file.content.includes('\0')) throw new Error(file.path + ' must contain at most 1 MiB of text.')
    paths.add(file.path)
  }
  const ref = branchRef(snapshot.branch)
  const request = github(snapshot.repo,token)
  const base = await head(request,ref)
  if (base !== snapshot.sha) throw new Error(changedBranch)
  const changed = files.filter(file => original.get(file.path) !== file.content)
  if (!changed.length) return base
  const {root, entries} = await treeAt(request,base)
  const byPath = new Map(entries.map(entry => [entry.path,entry]))
  const tree = changed.map(file => {
    const parts = file.path.split('/')
    for (let i = 1; i < parts.length; i++) {
      const parent = byPath.get(parts.slice(0,i).join('/'))
      if (parent && parent.type !== 'tree') throw new Error(parent.path + ' must be a directory before adding skills.')
    }
    const existing = byPath.get(file.path)
    if (existing) {
      regularFile(existing)
      if (!original.has(file.path)) throw new Error('Pull the existing ' + file.path + ' before replacing it.')
    }
    return {...file, mode:existing?.mode ?? '100644', type:'blob'}
  })
  const created = await request<{sha:string}>('trees','POST',{base_tree:root,tree})
  const commit = await request<{sha:string}>('commits','POST',{message:message.trim(),tree:gitSHA(created.sha),parents:[base]})
  const sha = gitSHA(commit.sha)
  const repository = await request<{node_id:string}>('')
  // beforeOid also detects intervening forced rewinds that an ordinary fast-forward check would miss.
  try {
    const result = await request<{data?:{updateRefs?:object};errors?:unknown[]}>('graphql','POST',{
      query: 'mutation CommitSkills($input: UpdateRefsInput!) { updateRefs(input: $input) { clientMutationId } }',
      variables: {input:{repositoryId:repository.node_id,refUpdates:[
        {name:'refs/heads/' + snapshot.branch,beforeOid:base,afterOid:sha,force:false},
      ]}},
    })
    if (result.errors?.length || !result.data?.updateRefs) {
      throw new Error('GitHub declined the commit. Check Contents write permission and branch protection.')
    }
  } catch (error) {
    // A network failure can hide a successful ref update. Read the ref before reporting the outcome.
    const current = await head(request,ref).catch(() => undefined)
    if (current === sha) return sha
    if (current && current !== base) throw new Error(changedBranch)
    if (!current) throw new Error('Could not confirm the commit. Pull the branch to check the result before retrying.')
    throw error
  }
  return sha
}
