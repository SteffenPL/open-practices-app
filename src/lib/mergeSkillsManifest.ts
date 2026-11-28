import { isMap, isScalar, isSeq, parseDocument } from 'yaml'
import { isPackageIdentifier } from './skillsRepository'
import { normalizeToolIdentifier } from './toolIdentifier'

export const manifestByteLimit = 512 * 1024

function dependencyKey(value: string): string | undefined {
  const source = value.trim().split('#')[0].replace(/^github\.com\//i, '')
  try { return normalizeToolIdentifier(source) } catch { return undefined }
}

/** Add missing GitHub dependencies without rewriting pins, filters or other settings. */
export function mergeSkillsManifest(source: string, packages: string[]) {
  if (new Blob([source]).size > manifestByteLimit) throw Error('Choose an apm.yml smaller than 512 KB.')
  const doc = parseDocument(source, {logLevel:'silent'})
  if (doc.errors.length || !isMap(doc.contents)) throw Error('Choose a valid apm.yml containing a YAML mapping.')
  const deps = doc.get('dependencies', true)
  if (deps !== undefined && !isMap(deps)) throw Error('The dependencies section must be a YAML mapping to merge automatically.')
  const apm = doc.getIn(['dependencies','apm'], true)
  if (apm !== undefined && !isSeq(apm)) throw Error('The dependencies.apm section must be a list to merge automatically.')

  const existing = new Set<string>()
  if (isSeq(apm)) {
    for (const entry of apm.items) {
      const value = isScalar(entry) ? entry.value : isMap(entry) ? entry.get('git') : undefined
      if (typeof value === 'string') {
        const key = dependencyKey(value)
        if (key) existing.add(key)
      }
    }
  }
  const added: string[] = []
  for (const item of packages) {
    if (!isPackageIdentifier(item)) throw Error('Choose a valid GitHub APM package.')
    const key = normalizeToolIdentifier(item.split('#')[0])
    if (!existing.has(key)) { existing.add(key); added.push(item) }
  }
  if (!added.length) return { text: source, added }
  if (!apm) doc.setIn(['dependencies','apm'], doc.createNode(added))
  else for (const name of added) apm.add(doc.createNode(name))
  return { text: doc.toString({lineWidth:0}), added }
}
