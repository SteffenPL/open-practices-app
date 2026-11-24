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
  it('round-trips a parsed definition (parse -> render -> parse is stable)', () => {
    const once = parseDefinition(TABLE_DEFINITION)
    const twice = parseDefinition(renderDefinition(once))
    expect(twice.title).toBe(once.title)
    expect(twice.image).toBe(once.image)
    expect(twice.source).toBe(once.source)
    expect(twice.body).toBe(once.body)
    expect(twice.elements.map((e) => e.name)).toEqual(
      once.elements.map((e) => e.name),
    )
    const firstOnce = once.elements[0].options[0]
    const firstTwice = twice.elements[0].options[0]
    expect(firstTwice).toMatchObject({
      name: firstOnce.name,
      description: firstOnce.description,
      toolIdentifier: firstOnce.toolIdentifier,
    })
  })

  it('uses subsections when rendering long descriptions', () => {
    const once = parseDefinition(SUBSECTION_DEFINITION)
    const rendered = renderDefinition(once)
    expect(rendered).toContain('### haiku')
    const twice = parseDefinition(rendered)
    expect(twice.elements[0].options[0].description).toContain('multiple lines')
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
    expect(rendered).toContain('> Requires: a')
    expect(rendered).toContain('> Incompatible: b')
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
