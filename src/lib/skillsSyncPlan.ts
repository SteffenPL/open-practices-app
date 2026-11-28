import { isMap, isScalar, isSeq, parseDocument } from 'yaml'
import type { MySkillsConfig, SkillDraft } from './mySkillsService'
import { manifestByteLimit } from './mergeSkillsManifest'
import { buildSkillsRepository, isGitHubRepository, isPackageIdentifier, type RepositoryFile } from './skillsRepository'
import { normalizeToolIdentifier } from './toolIdentifier'

export interface SkillsFileChange {
  path: string
  before: string | null
  after: string
}

const skillPath = /^\.apm\/skills\/([a-z0-9]+(?:-[a-z0-9]+)*)\/SKILL\.md$/
const packageKey = (value: string) => {
  const [location, ref] = value.split('#')
  return normalizeToolIdentifier(location) + (ref ? '#' + ref : '')
}

function snapshotMap(files: RepositoryFile[]) {
  const result = new Map<string,string>()
  for (const {path, content} of files) {
    if (result.has(path)) throw Error('Duplicate path in the GitHub snapshot: ' + path)
    result.set(path,content)
  }
  return result
}

function readManifest(source: string) {
  if (new Blob([source]).size > manifestByteLimit) throw Error('The apm.yml exceeds the 512 KB sync limit.')
  const doc = parseDocument(source,{logLevel:'silent'})
  if (doc.errors.length || doc.warnings.length || !isMap(doc.contents)) throw Error('The apm.yml must be a valid YAML mapping.')
  const dependencies=doc.get('dependencies',true)
  if (dependencies!==undefined && !isMap(dependencies)) throw Error('Cannot safely edit the dependencies section of apm.yml.')
  const list=doc.getIn(['dependencies','apm'],true)
  if (list!==undefined && !isSeq(list)) throw Error('Cannot safely edit dependencies.apm. Expected a YAML list.')
  const packages: {id:string; index:number; managed:boolean}[]=[]
  if(isSeq(list)) list.items.forEach((item,index)=>{
    const value=isScalar(item) ? item.value : isMap(item) ? item.get('git') : null
    if(typeof value!=='string') return
    // URL-style and structured sources are displayed when recognizable, but their
    // transport, ref, filters and other fields always remain authored by the repo.
    let id=value
    if(!isPackageIdentifier(id)){
      const [loc,ref]=id.split('#')
      try {id=normalizeToolIdentifier(loc.replace(/^github\.com\//i,''))+(ref?'#'+ref:'')}
      catch{return}
    }
    if(isPackageIdentifier(id)) packages.push({id,index,managed:isScalar(item) && value===id && !id.includes('#') && !item.anchor})
  })
  return {doc,list,packages}
}

function readSkill(path:string,source:string) {
  const folder=path.match(skillPath)?.[1]
  if(!folder)return null
  const parts=source.match(/^(\uFEFF?---[ \t]*(\r?\n))([\s\S]*?)(^---[ \t]*(?:\r?\n|$))([\s\S]*)$/m)
  if(!parts || parts.index!==0)return null
  const doc=parseDocument(parts[3],{logLevel:'silent'})
  if(doc.errors.length || doc.warnings.length || !isMap(doc.contents))return null
  const name=doc.get('name'), description=doc.get('description')
  if(name!==folder || typeof description!=='string')return null
  const draft:SkillDraft={id:path,name,description,body:parts[5]}
  return {draft,doc,opening:parts[1],newline:parts[2],frontmatter:parts[3],closing:parts[4]}
}

export function importSkillsRepository(repo:string, files:RepositoryFile[]):MySkillsConfig {
  if(!isGitHubRepository(repo))throw Error('Expected a GitHub owner/repository.')
  const byPath=snapshotMap(files)
  const manifest=byPath.get('apm.yml')
  const selection=manifest===undefined ? [] : readManifest(manifest).packages.map(p=>p.id)
  const drafts=[...byPath].flatMap(([path,source])=>{
    const skill=readSkill(path,source)
    return skill?[skill.draft]:[]
  }).sort((a,b)=>a.id.localeCompare(b.id))
  return {repo, selected_packages:[...new Map(selection.map(id=>[packageKey(id),id])).values()],drafts}
}

function editManifest(source:string, config:MySkillsConfig, baseline?:MySkillsConfig) {
  const {doc,list,packages}=readManifest(source)
  const selected=new Set(config.selected_packages.map(packageKey))
  const initial=new Set(baseline?.selected_packages.map(packageKey) ?? [])
  const existing=new Set(packages.map(p=>packageKey(p.id)))
  for(const id of initial){
    if(selected.has(id) && !existing.has(id))throw Error('A selected dependency changed on GitHub. Reload apm.yml before saving.')
  }
  const roots=new Map(packages.map(p=>[packageKey(p.id).split('#')[0],p.id]))
  let changed=false
  for(const pkg of [...packages].reverse()){
    const key=packageKey(pkg.id)
    if(!initial.has(key) || selected.has(key))continue
    if(!pkg.managed) throw Error('Keep the pinned or structured dependency '+pkg.id+' selected, or change it directly in apm.yml.')
    if(isSeq(list))list.delete(pkg.index)
    changed=true
  }
  for(const id of config.selected_packages){
    const key=packageKey(id)
    if(existing.has(key))continue
    const other=roots.get(key.split('#')[0])
    if(other && packageKey(other)!==key)throw Error('The repository already specifies '+other+'. Change its Git ref directly in apm.yml.')
    if(!isSeq(doc.getIn(['dependencies','apm'],true)))doc.setIn(['dependencies','apm'],doc.createNode([]))
    doc.addIn(['dependencies','apm'],doc.createNode(id))
    existing.add(key)
    roots.set(key.split('#')[0],id)
    changed=true
  }
  return changed ? doc.toString({lineWidth:0}).replace(/\r?\n/g,source.includes('\r\n')?'\r\n':'\n') : source
}

/** Only explicit deselection from an imported baseline removes plain dependencies.
 * Existing skill files retain their original path; no change ever deletes a file. */
export function planSkillsChanges(config:MySkillsConfig, files:RepositoryFile[], baseline?:MySkillsConfig):SkillsFileChange[] {
  if(baseline && baseline.repo.toLowerCase()!==config.repo.toLowerCase())throw Error('Reload the baseline for this GitHub repository.')
  const generated=buildSkillsRepository(config.repo,config.selected_packages)
  const byPath=snapshotMap(files)
  const changes:SkillsFileChange[]=[]
  const before=byPath.get('apm.yml')??null
  if(before===null && baseline?.selected_packages.length)throw Error('The loaded apm.yml is missing. Reload the repository before saving.')
  const after=before===null ? generated.manifest.content : editManifest(before,config,baseline)
  if(before!==after)changes.push({path:'apm.yml',before,after})
  const seen=new Set<string>()
  for(const draft of config.drafts){
    const path='.apm/skills/'+draft.name+'/SKILL.md'
    if(seen.has(path))throw Error('Two drafts would write the same skill: '+draft.name)
    seen.add(path)
    const original=byPath.get(path)
    const prior=baseline?.drafts.find(d=>d.id===path || d.name===draft.name)
    if(original===undefined && prior)throw Error('A loaded skill file is missing. Reload the repository before saving.')
    if(original===undefined && [...byPath.keys()].some(other=>other.toLowerCase()===path.toLowerCase()))throw Error('A differently capitalized skill path already exists on GitHub.')
    const existing=original===undefined ? null : readSkill(path,original)
    if(existing && existing.draft.description===draft.description && existing.draft.body===draft.body)continue
    const file=buildSkillsRepository(config.repo,[],{name:draft.name,description:draft.description,instructions:draft.body}).skill!
    if(draft.id.startsWith('.apm/skills/') && draft.id!==path)throw Error('Renaming an imported skill changes its path. Create a separate draft or rename the file on GitHub.')
    if(original===undefined){changes.push({path,before:null,after:file.content});continue}
    if(original===file.content)continue
    if(!existing || !prior)throw Error('GitHub already has '+path+'. Load its contents before editing it.')
    if(existing.draft.body!==prior.body || existing.draft.description!==prior.description)throw Error('The skill '+draft.name+' has changed on GitHub. Reload it before saving.')
    let front=existing.frontmatter
    if(draft.description!==existing.draft.description){
      existing.doc.set('description',draft.description)
      front=existing.doc.toString({lineWidth:0}).replace(/\r?\n/g,existing.newline)
    }
    changes.push({path,before:original,after:existing.opening+front+existing.closing+draft.body.replace(/\r?\n/g,existing.newline)})
  }
  return changes
}
