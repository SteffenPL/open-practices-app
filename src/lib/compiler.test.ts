import { describe, expect, it } from 'vitest'
import { compilePractice } from './compiler'
import { visibleElements, type Selection } from './visibility'
import type { Element, Option } from './types'

let optionCounter = 0

function option(overrides: Partial<Option> = {}): Option {
  optionCounter += 1
  return {
    id: `o${optionCounter}`,
    element_id: '',
    position: 0,
    name: `Option ${optionCounter}`,
    description: null,
    tool_id: null,
    tool: null,
    ...overrides,
  }
}

function element(overrides: Partial<Element> = {}): Element {
  return {
    id: overrides.id ?? `e${Math.random()}`,
    practice_id: 'p',
    position: 0,
    name: 'Element',
    description: null,
    require_options: [],
    reject_options: [],
    options: [],
    ...overrides,
  }
}

function withTool(apmId: string): Option {
  return option({
    tool: {
      id: `t-${apmId}`,
      apm_id: apmId,
      repo_url: null,
      name: apmId,
      description: null,
    },
  })
}

describe('visibleElements', () => {
  it('shows unconditional elements', () => {
    const els = [element({ id: 'a' }), element({ id: 'b' })]
    expect(visibleElements(els, {})).toEqual(els)
  })

  it('hides elements whose required option is not picked', () => {
    const els = [
      element({ id: 'a', options: [option({ id: 'o1' })] }),
      element({ id: 'b', require_options: ['o1'] }),
    ]
    expect(visibleElements(els, {}).map((e) => e.id)).toEqual(['a'])
    expect(visibleElements(els, { a: 'o1' }).map((e) => e.id)).toEqual([
      'a',
      'b',
    ])
  })

  it('hides elements whose rejected option is picked', () => {
    const els = [
      element({ id: 'a', options: [option({ id: 'o1' })] }),
      element({ id: 'b', reject_options: ['o1'] }),
    ]
    expect(visibleElements(els, { a: 'o1' }).map((e) => e.id)).toEqual(['a'])
    expect(visibleElements(els, {}).map((e) => e.id)).toEqual(['a', 'b'])
  })
})

describe('compilePractice', () => {
  it('compiles an apm add command from picked tool options', () => {
    const els = [
      element({
        id: 'a',
        options: [withTool('mattpocock/skills'), option({ id: 'plain' })],
      }),
      element({ id: 'b', options: [withTool('other/tool')] }),
    ]
    const selection: Selection = {
      a: els[0].options[0].id,
      b: els[1].options[0].id,
    }

    const compiled = compilePractice(els, selection)
    expect(compiled.command).toBe('apm add mattpocock/skills other/tool')
    expect(compiled.yaml).toBe(
      'dependencies:\n  apm:\n    - mattpocock/skills\n    - other/tool\n',
    )
  })

  it('omits non-tool options from the compiled output', () => {
    const nonTool = option({ id: 'o1' })
    const els = [element({ id: 'a', options: [nonTool] })]
    const compiled = compilePractice(els, { a: 'o1' })
    expect(compiled.apmIds).toEqual([])
    expect(compiled.command).toContain('#')
    expect(compiled.yaml).toBe('dependencies:\n  apm:\n    []\n')
  })

  it('skips tools without an install identifier', () => {
    const repoOnly = option({
      id: 'o1',
      tool: { id: 't1', apm_id: null, repo_url: 'https://github.com/a/b', name: 'ab', description: null },
    })
    const els = [element({ id: 'a', options: [repoOnly] })]
    const compiled = compilePractice(els, { a: 'o1' })
    expect(compiled.apmIds).toEqual([])
  })

  it('ignores picks on elements hidden by visibility rules', () => {
    const gate = element({ id: 'a', options: [option({ id: 'gate-opt' })] })
    const hidden = element({
      id: 'b',
      require_options: ['gate-opt'],
      options: [withTool('hidden/tool')],
    })
    const compiled = compilePractice([gate, hidden], {
      b: hidden.options[0].id,
    })
    expect(compiled.apmIds).toEqual([])

    const compiledWhenVisible = compilePractice(
      [gate, hidden],
      { a: 'gate-opt', b: hidden.options[0].id },
    )
    expect(compiledWhenVisible.apmIds).toEqual(['hidden/tool'])
  })

  it('handles empty selection', () => {
    const els = [element({ id: 'a', options: [withTool('x/y')] })]
    const compiled = compilePractice(els, {})
    expect(compiled.apmIds).toEqual([])
    expect(compiled.command).toContain('#')
  })

  it('deduplicates tools picked in different elements', () => {
    const els = [
      element({ id: 'a', options: [withTool('same/tool')] }),
      element({ id: 'b', options: [withTool('same/tool')] }),
    ]
    const selection: Selection = {
      a: els[0].options[0].id,
      b: els[1].options[0].id,
    }
    const compiled = compilePractice(els, selection)
    expect(compiled.apmIds).toEqual(['same/tool'])
    expect(compiled.command).toBe('apm add same/tool')
  })
})
