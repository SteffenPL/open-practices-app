/** Repository owner and name ignore case; package subpaths are case-sensitive. */
export function normalizeToolIdentifier(input: string): string {
  const raw = input.trim().replace(/\/+$/, '')
  const github = raw.match(/^https?:\/\/github\.com\/([\w.-]+)\/([\w.-]+)(?:\/(?:tree|blob)\/[^/]+\/(.+))?$/i)
  const identifier = github
    ? [github[1], github[2].replace(/\.git$/i, ''), github[3]].filter(Boolean).join('/')
    : raw
  const parts = identifier.split('/')
  if (parts.length < 2 || parts.some(part => !/^[\w@.-]+$/.test(part) || part === '.' || part === '..')) {
    throw new Error(`Invalid tool identifier: "${input}"`)
  }
  return [parts[0].toLowerCase(), parts[1].toLowerCase(), ...parts.slice(2)].join('/')
}
