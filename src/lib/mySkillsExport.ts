import type { MySkillsConfig } from './mySkillsService'
import { buildSkillFile, buildSkillsManifest, type RepositoryFile } from './skillsRepository'

export function generateSkillsExport(config: MySkillsConfig): { files: RepositoryFile[]; problems: string[] } {
  const files: RepositoryFile[] = []
  const problems: string[] = []
  const paths = new Set<string>()
  try {
    files.push(buildSkillsManifest(config.repo || null, config.selected_packages).manifest)
  } catch (error) {
    problems.push(error instanceof Error ? error.message : 'Could not generate the package manifest.')
  }
  for (const [index, draft] of config.drafts.entries()) {
    try {
      const file = buildSkillFile({name:draft.name, description:draft.description, instructions:draft.body})
      if (paths.has(file.path)) throw new Error('Give each skill a different name.')
      paths.add(file.path)
      files.push(file)
    } catch (error) {
      problems.push('Skill ' + (index + 1) + ' · ' + (error instanceof Error ? error.message : 'Could not generate the skill file.'))
    }
  }
  return {files, problems}
}
