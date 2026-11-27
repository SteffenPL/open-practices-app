import { describe, expect, it } from 'vitest'
import { cleanOptionDescription, getInstallCommand, splitGuidedPracticeBody } from './guidedPracticeContent'

describe('reading original practice records', () => {
  it('retains both opening and closing and keeps older unmarked bodies intact', () => {
    expect(splitGuidedPracticeBody('Opening\n\n<!-- open-practices-guided-closing -->\n\n### Next steps\nTry it')).toEqual({
      opening: 'Opening', closing: '### Next steps\nTry it', guided: true,
    })
    expect(splitGuidedPracticeBody('Original body')).toEqual({ opening: 'Original body', closing: '', guided: false })
  })

  it('keeps the original command and prose in their option note', () => {
    const description = 'Can also use npm.\n\n<!-- practice-install-command:npm%20install%20%40scope%2Ftool -->'
    expect(getInstallCommand(description)).toBe('npm install @scope/tool')
    expect(cleanOptionDescription(description)).toBe('Can also use npm.')
  })
})
