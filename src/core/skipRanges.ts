import type { TextRange } from '../shared/types'

export function mergeRanges(ranges: TextRange[], maxLen: number): TextRange[] {
  if (ranges.length === 0) return []

  const trimmed = ranges
    .map((r) => ({
      start: Math.max(0, Math.min(maxLen, Math.floor(r.start))),
      end: Math.max(0, Math.min(maxLen, Math.floor(r.end))),
    }))
    .filter((r) => r.end > r.start)
    .sort((a, b) => (a.start - b.start) || (a.end - b.end))

  if (trimmed.length <= 1) return trimmed

  const merged: TextRange[] = []
  let current = trimmed[0]
  for (let i = 1; i < trimmed.length; i += 1) {
    const next = trimmed[i]
    if (next.start <= current.end) {
      current = { start: current.start, end: Math.max(current.end, next.end) }
    } else {
      merged.push(current)
      current = next
    }
  }
  merged.push(current)
  return merged
}

export function computeLeadingIndentationRanges(text: string): TextRange[] {
  const ranges: TextRange[] = []
  let lineStart = 0

  for (let i = 0; i <= text.length; i += 1) {
    const isLineBreak = i === text.length || text[i] === '\n'
    if (!isLineBreak) continue

    const lineEnd = i
    let j = lineStart
    while (j < lineEnd && text[j] === ' ') j += 1
    if (j > lineStart) ranges.push({ start: lineStart, end: j })

    lineStart = i + 1
  }

  return ranges
}

export function computeTrailingWhitespaceRanges(text: string): TextRange[] {
  const ranges: TextRange[] = []
  let lineStart = 0

  for (let i = 0; i <= text.length; i += 1) {
    const isLineBreak = i === text.length || text[i] === '\n'
    if (!isLineBreak) continue

    const lineEnd = i
    let j = lineEnd
    while (j > lineStart && (text[j - 1] === ' ' || text[j - 1] === '\t')) j -= 1
    if (j < lineEnd) ranges.push({ start: j, end: lineEnd })

    lineStart = i + 1
  }

  return ranges
}

export function computePreCommentPaddingRanges(text: string, commentRanges: TextRange[]): TextRange[] {
  if (commentRanges.length === 0) return []

  const ranges: TextRange[] = []

  for (const r of commentRanges) {
    const commentStart = Math.max(0, Math.min(text.length, Math.floor(r.start)))
    if (commentStart <= 0) continue

    const prevNewline = text.lastIndexOf('\n', commentStart - 1)
    const lineStart = prevNewline >= 0 ? prevNewline + 1 : 0

    let j = commentStart
    while (j > lineStart && text[j - 1] === ' ') j -= 1
    if (j < commentStart) ranges.push({ start: j, end: commentStart })
  }

  return ranges
}

export function computeSkippableLineBreakRanges(text: string, skipRanges: TextRange[]): TextRange[] {
  if (text.length === 0) return []

  const ranges = mergeRanges(skipRanges, text.length)
  const skipMask = new Array<boolean>(text.length).fill(false)
  for (const r of ranges) {
    for (let i = r.start; i < r.end; i += 1) skipMask[i] = true
  }

  const out: TextRange[] = []
  let lineStart = 0
  for (let i = 0; i < text.length; i += 1) {
    if (text[i] !== '\n') continue

    let hasPrintable = false
    for (let j = lineStart; j < i; j += 1) {
      if (!skipMask[j]) {
        hasPrintable = true
        break
      }
    }

    if (!hasPrintable) out.push({ start: i, end: i + 1 })
    lineStart = i + 1
  }

  return out
}
