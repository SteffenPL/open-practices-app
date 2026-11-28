import { strToU8, zipSync } from 'fflate'
import type { RepositoryFile } from './skillsRepository'

export function downloadRepositoryArchive(repo: string, files: RepositoryFile[]) {
  const entries = Object.fromEntries(files.map(({path,content}) => [path,strToU8(content)]))
  const bytes = zipSync(entries, {level:3})
  const url = URL.createObjectURL(new Blob([new Uint8Array(bytes)], {type:'application/zip'}))
  const link = document.createElement('a')
  link.href = url
  link.download = (repo.split('/').pop() || 'my-skills') + '-source.zip'
  document.body.append(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}
