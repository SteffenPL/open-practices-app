import { describe, expect, it } from 'vitest'
import { activePracticeMention, tokenizePracticeText } from './practiceText'

describe('Practice text', () => {
  it('links only actual mentions and keeps literal code and prompts', () => {
    const text = 'Try #git, then “ask #tool” or "use #shell"; run `git show #rev`. #git again.'
    const tokens = tokenizePracticeText(text)
    expect(tokens.filter(token => token.kind === 'mention').map(token => token.text)).toEqual(['#git', '#git'])
    expect(tokens.filter(token => token.kind === 'quote')).toHaveLength(2)
    expect(tokens.find(token => token.kind === 'code')?.text).toBe('`git show #rev`')
    expect(tokens.map(token => text.slice(token.start, token.end)).join('')).toEqual(text)
  })
  it('opens suggestions at a bare #, replaces the whole token, and respects UTF-16 indices', () => {
    expect(activePracticeMention('✨ #', 3)).toEqual({ start: 2, end: 3, query: '' })
    expect(activePracticeMention('🚀 #git-tools!', 6)).toEqual({ start: 3, end: 13, query: 'gi' })
  })
  it('suppresses autocomplete while writing code or straight/curly quoted prompts', () => {
    for (const value of ['Try `#git', 'Try “prompt #git', 'Try "prompt #git', 'Try `#git`', 'Try “#git”']) {
      expect(activePracticeMention(value, value.indexOf('#git') + 4)).toBeNull()
    }
    expect(tokenizePracticeText("Use '#git' and don't convert me").some(token => token.kind === 'quote')).toBe(false)
    expect(activePracticeMention('Try "ok" #g', 11)?.query).toBe('g')
  })
  it('leaves URL fragments, escaped hashes, and embedded hashes alone', () => {
    const text = 'https://example.org/#git GitHub#issue \\#text (#real)'
    expect(tokenizePracticeText(text).filter(token => token.kind === 'mention').map(token => token.text)).toEqual(['#real'])
  })
})
