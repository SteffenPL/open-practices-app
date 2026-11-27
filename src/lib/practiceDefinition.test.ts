import { describe, expect, it } from 'vitest'
import {
  parseDefinition,
  renderDefinition,
  type PracticeDefinition,
} from './practiceDefinition'

const TABLE_DEFINITION = `---
title: My orchestration setup
image: https://example.com/banner.png
source: https://github.com/me/my-repo
---

Intro prose about the practice.

## Element: Which orchestration skill?

Pick the frame that coordinates the session.

| Option | Why/when | Tool |
| --- | --- | --- |
| superpowers | multi-step flows | mattpocock/skills |
| qwilmi | light sessions | |

## Element: Which model?

| Option | Why/when | Tool |
| --- | --- | --- |
| haiku | cheap | |
| sonnet | default | |
`

const SUBSECTION_DEFINITION = `---
title: Models
---

## Element: Which model?

### haiku

Fast and cheap.

A second paragraph, so the description spans multiple lines.

### sonnet

The default choice.
`

describe('parseDefinition', () => {
  it('parses frontmatter, body, and table-form elements', () => {
    const parsed = parseDefinition(TABLE_DEFINITION)
    expect(parsed.title).toBe('My orchestration setup')
    expect(parsed.image).toBe('https://example.com/banner.png')
    expect(parsed.source).toBe('https://github.com/me/my-repo')
    expect(parsed.body).toContain('Intro prose about the practice.')
    expect(parsed.elements).toHaveLength(2)

    const first = parsed.elements[0]
    expect(first.name).toBe('Which orchestration skill?')
    expect(first.description).toBe('Pick the frame that coordinates the session.')
    expect(first.options).toHaveLength(2)
    expect(first.options[0]).toMatchObject({
      name: 'superpowers',
      description: 'multi-step flows',
      toolIdentifier: 'mattpocock/skills',
    })
    expect(first.options[1].toolIdentifier).toBeNull()
  })

  it('parses subsection-form options with long descriptions', () => {
    const parsed = parseDefinition(SUBSECTION_DEFINITION)
    const element = parsed.elements[0]
    expect(element.options).toHaveLength(2)
    expect(element.options[0].name).toBe('haiku')
    expect(element.options[0].description).toContain('multiple lines')
    expect(element.options[1].name).toBe('sonnet')
  })

  it('resolves visibility directives against earlier options', () => {
    const md = `---
title: x
---

## Element: One?

| Option | Why/when | Tool |
| --- | --- | --- |
| a | first | |
| b | second | |

## Element: Two?

> Requires: a
> Incompatible: b

| Option | Why/when | Tool |
| --- | --- | --- |
| c | third | |
| d | fourth | |
`
    const parsed = parseDefinition(md)
    const elementTwo = parsed.elements[1]
    expect(elementTwo.require_options).toEqual([
      parsed.elements[0].options[0].id,
    ])
    expect(elementTwo.reject_options).toEqual([
      parsed.elements[0].options[1].id,
    ])
  })

  it('errors on a missing title', () => {
    expect(() => parseDefinition('---\nimage: x\n---\nbody')).toThrow(
      /title/,
    )
  })

  it('errors on missing frontmatter', () => {
    expect(() => parseDefinition('Just prose.')).toThrow(/frontmatter/)
  })

  it('errors on an unclosed frontmatter block', () => {
    expect(() => parseDefinition('---\ntitle: x\nbody')).toThrow(/closed/)
  })

  it('errors on a relative image path', () => {
    const md = '---\ntitle: x\nimage: ./pic.png\n---\nbody'
    expect(() => parseDefinition(md)).toThrow(/full URL/)
  })

  it('errors on directives referencing later elements', () => {
    const md = `---
title: x
---

## Element: One?

> Requires: c

| Option | Why/when | Tool |
| --- | --- | --- |
| a | first | |
| b | second | |

## Element: Two?

| Option | Why/when | Tool |
| --- | --- | --- |
| c | third | |
| d | fourth | |
`
    expect(() => parseDefinition(md)).toThrow(/no such option/)
  })

  it('allows directives referencing the same element', () => {
    const md = `---
title: x
---

## Element: One?

> Incompatible: b

| Option | Why/when | Tool |
| --- | --- | --- |
| a | first | |
| b | second | |
`
    const parsed = parseDefinition(md)
    expect(parsed.elements[0].reject_options).toEqual([
      parsed.elements[0].options[1].id,
    ])
  })

  it('errors on unknown directive option names', () => {
    const md = `---
title: x
---

## Element: Two?

> Requires: nope

| Option | Why/when | Tool |
| --- | --- | --- |
| c | third | |
| d | fourth | |
`
    expect(() => parseDefinition(md)).toThrow(/Requires.*nope/)
  })

  it('errors on elements with fewer than two options', () => {
    const md = `---
title: x
---

## Element: Only one?

| Option | Why/when | Tool |
| --- | --- | --- |
| lonely | all alone | |
`
    expect(() => parseDefinition(md)).toThrow(/at least two options/)
  })

  it('errors on a table without a separator row', () => {
    const md = `---
title: x
---

## Element: Broken?

| Option | Why/when | Tool |
| a | one | |
| b | two | |
`
    expect(() => parseDefinition(md)).toThrow(/separator/)
  })
})

describe('renderDefinition', () => {
  it('round-trips multiline per-tool commands and setup notes', () => {
    const md = `---\ntitle: Setup\n---\n\nUse #tool-a to begin.\n\n## Tool setup\n\n### #tool-a\ncommand: |\n  apm install vendor/tool\n  apm config set mode safe\nnotes: |\n  First setup step.\n  Second setup step.\n`
    const parsed = parseDefinition(md)
    expect(parsed.mentions?.[0]).toMatchObject({
      token: '#tool-a', slug: 'tool-a',
      installCommand: 'apm install vendor/tool\napm config set mode safe',
      notes: 'First setup step.\nSecond setup step.',
    })
    const roundTrip = parseDefinition(renderDefinition(parsed))
    expect(roundTrip.mentions).toEqual(parsed.mentions)
    expect(roundTrip.body).toBe(parsed.body)
  })

  it('does not treat a fenced ## Tool setup example as metadata', () => {
    const md = '---\ntitle: Example\n---\n\n```md\n## Tool setup\n\n### #example\ncommand: leave this in the example\n```\n'
    const parsed = parseDefinition(md)
    expect(parsed.body).toContain('## Tool setup')
    expect(parsed.mentions).toEqual([])
  })

  it('converts old alternatives to readable body notes without re-export duplication', () => {
    const parsed = parseDefinition(`---\ntitle: Old\n---\n\n## Element: Which tool?\n\n> Requires: one\n\n| Option | Why/when | Tool |\n| --- | --- | --- |\n| one | first | owner/tool-one |\n| two | second | |\n`)
    expect(parsed.body).toContain('### Which tool?')
    expect(parsed.body).toContain('Shown when: one.')
    expect(parsed.body).toContain('#tool-one')
    const exported = renderDefinition(parsed)
    expect(exported.match(/### Which tool\?/g)).toHaveLength(1)
    expect(parseDefinition(exported).body).toBe(parsed.body)
  })

  it('keeps visibility names when they refer to an earlier element', () => {
    const parsed = parseDefinition(`---\ntitle: Rules\n---\n\n## Element: First\n\n| Option | Why/when | Tool |\n| --- | --- | --- |\n| a | first | |\n| b | second | |\n\n## Element: Second\n\n> Requires: a\n> Incompatible: b\n\n| Option | Why/when | Tool |\n| --- | --- | --- |\n| c | third | |\n| d | fourth | |\n`)
    expect(parsed.body).toContain('Shown when: a.')
    expect(parsed.body).toContain('Hidden when: b.')
    expect(renderDefinition(parsed)).not.toContain('an earlier option')
  })

  it('round-trips a parsed definition (parse -> render -> parse is stable)', () => {
    const once = parseDefinition(TABLE_DEFINITION)
    const twice = parseDefinition(renderDefinition(once))
    expect(twice.title).toBe(once.title)
    expect(twice.image).toBe(once.image)
    expect(twice.source).toBe(once.source)
    expect(twice.body).toBe(once.body)
    expect(twice.body).toContain('## Alternatives')
    expect(twice.elements).toHaveLength(0)
    expect(twice.body).toContain('superpowers')
    expect(twice.body).toContain('#skills')
  })

  it('uses subsections when rendering long descriptions', () => {
    const once = parseDefinition(SUBSECTION_DEFINITION)
    const rendered = renderDefinition(once)
    expect(rendered).toContain('**haiku**')
    const twice = parseDefinition(rendered)
    expect(twice.body).toContain('multiple lines')
  })

  it('renders directives as option names', () => {
    const md = `---
title: x
---

## Element: One?

| Option | Why/when | Tool |
| --- | --- | --- |
| a | first | |
| b | second | |

## Element: Two?

> Requires: a
> Incompatible: b

| Option | Why/when | Tool |
| --- | --- | --- |
| c | third | |
| d | fourth | |
`
    const rendered = renderDefinition(parseDefinition(md))
    expect(rendered).toContain('Shown when: a.')
    expect(rendered).toContain('Hidden when: b.')
  })

  it('renders the definition for a body-only practice', () => {
    const definition: PracticeDefinition = {
      title: 'Plain',
      image: null,
      source: null,
      body: 'Just prose.',
      elements: [],
    }
    const rendered = renderDefinition(definition)
    expect(rendered).toContain('title: Plain')
    expect(rendered).toContain('Just prose.')
    expect(() => parseDefinition(rendered)).not.toThrow()
  })
})
