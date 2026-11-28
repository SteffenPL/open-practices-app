export type PracticeTextToken = {
  kind: 'text' | 'code' | 'quote' | 'mention'
  text: string
  start: number
  end: number
}

const quotes: Record<string, string> = { '"': '"', '“': '”' }
const word = /[\p{L}\p{N}_]/u
const mention = /^#(?:[\p{L}\p{N}][\p{L}\p{N}_.-]*(?:\/[\p{L}\p{N}_@-]+(?:\.[\p{L}\p{N}_@-]+)*)+|[\p{L}\p{N}][\p{L}\p{N}_-]*)(?:::\/?[\p{L}\p{N}_-]+(?:\.[\p{L}\p{N}_-]+)*)?/u

function quoteEnd(input: string, opening: number, closing: string): number {
  for (let i = opening + 1; i < input.length && input[i] !== '\n'; i++) {
    if (input[i] === '\\') { i++; continue }
    if (input[i] !== closing) continue
    return i + 1
  }
  return -1
}

/** Offsets use textarea selectionStart and selectionEnd coordinates. */
export function tokenizePracticeText(input: string, editing = false): PracticeTextToken[] {
  const result: PracticeTextToken[] = []
  let plainStart = 0
  let i = 0
  function emit(kind: PracticeTextToken['kind'], end: number) {
    if (plainStart < i) result.push({ kind: 'text', text: input.slice(plainStart, i), start: plainStart, end: i })
    result.push({ kind, text: input.slice(i, end), start: i, end })
    plainStart = i = end
  }
  while (i < input.length) {
    const char = input[i]
    if (char === '\\') { i += 2; continue }
    if (char === '`') {
      let next = i + 1
      while (input[next] === '`') next++
      const fence = input.slice(i, next)
      const close = input.indexOf(fence, next)
      if (close >= 0) { emit('code', close + fence.length); continue }
      if (editing) { emit('text', input.length); continue }
      i = next
      continue
    }
    if (Object.hasOwn(quotes, char) && !word.test(input[i - 1] ?? '')) {
      const end = quoteEnd(input, i, quotes[char])
      if (end > i) { emit('quote', end); continue }
      if (editing) {
        const newline = input.indexOf('\n', i)
        emit('text', newline < 0 ? input.length : newline)
        continue
      }
    }
    if (char === '#' && (i === 0 || /[\s([{'“‘,;:!?]/u.test(input[i - 1]))) {
      const match = input.slice(i).match(mention)
      if (match) { emit('mention', i + match[0].length); continue }
    }
    i++
  }
  if (plainStart < input.length) result.push({ kind: 'text', text: input.slice(plainStart), start: plainStart, end: input.length })
  return result
}


/** Find the hashtag currently being typed, including a just-entered #. */
export function activePracticeMention(input: string, caret: number): { start: number; end: number; query: string } | null {
  if (!Number.isInteger(caret) || caret < 0 || caret > input.length) return null
  // Insert a legal slug character at the caret so a bare # follows the same lexer rules.
  const probe = input.slice(0, caret) + 'x' + input.slice(caret)
  const token = tokenizePracticeText(probe, true).find(item => item.kind === 'mention' && item.start < caret && item.end > caret)
  if (!token) return null
  return { start: token.start, end: token.end - 1, query: input.slice(token.start + 1, caret) }
}
