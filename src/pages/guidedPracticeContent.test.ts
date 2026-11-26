import { describe, expect, it } from 'vitest'
import {
  apmPackageIdFromCommand,
  cleanOptionDescription,
  composeGuidedPracticeBody,
  getInstallCommand,
  suggestApmInstallCommand,
  suggestedToolName,
  splitGuidedPracticeBody,
  withInstallCommand,
} from './guidedPracticeContent'

describe('guided practice persistence helpers', () => {
  it('keeps the opening and closing together in the existing body field', () => {
    const body = composeGuidedPracticeBody('Opening point', 'Next steps', 'Try a small change')

    expect(splitGuidedPracticeBody(body)).toEqual({
      opening: 'Opening point',
      closing: '### Next steps\n\nTry a small change',
      guided: true,
    })
  })

  it('leaves legacy practice bodies unmarked', () => {
    expect(splitGuidedPracticeBody('An existing practice body')).toEqual({
      opening: 'An existing practice body',
      closing: '',
      guided: false,
    })
  })

  it('stores an arbitrary command invisibly alongside the option description', () => {
    const description = withInstallCommand('Useful guidance', 'npm install @scope/tool --save-exact')

    expect(getInstallCommand(description)).toBe('npm install @scope/tool --save-exact')
    expect(cleanOptionDescription(description)).toBe('Useful guidance')
  })

  it('recognizes only the supported single APM package install form', () => {
    expect(apmPackageIdFromCommand('apm install microsoft/playwright')).toBe('microsoft/playwright')
    expect(apmPackageIdFromCommand('npm install playwright')).toBeNull()
    expect(apmPackageIdFromCommand('apm add microsoft/playwright')).toBeNull()
    expect(apmPackageIdFromCommand('apm install one/pkg two/pkg')).toBeNull()
  })

  it('suggests the current APM command form from package ids or tool names', () => {
    expect(suggestApmInstallCommand('microsoft/playwright')).toBe('apm install microsoft/playwright')
    expect(suggestApmInstallCommand('Playwright Tools')).toBe('apm install playwright-tools')
    expect(suggestApmInstallCommand('https://github.com/microsoft/playwright')).toBe('apm install microsoft/playwright')
    expect(suggestedToolName('microsoft/playwright')).toBe('playwright')
  })
})
