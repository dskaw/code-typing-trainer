import type { TextRange } from '../shared/types'

type CommentMode = 'c-like' | 'python' | 'none'

const C_LIKE_EXTS = new Set([
  'c',
  'h',
  'cpp',
  'cc',
  'hpp',
  'java',
  'js',
  'ts',
  'tsx',
  'go',
  'rs',
  'cs',
  'kt',
  'swift',
  'php',
  'rb',
  'scala',
  'm',
  'mm',
])

function getFileExtensionLower(fileName: string): string {
  const lower = fileName.toLowerCase()
  const dot = lower.lastIndexOf('.')
  return dot >= 0 ? lower.slice(dot + 1) : ''
}

function detectCommentMode(fileName: string): CommentMode {
  const ext = getFileExtensionLower(fileName)
  if (ext === 'py') return 'python'
  return C_LIKE_EXTS.has(ext) ? 'c-like' : 'none'
}

export function parseCommentRangesForFile(text: string, fileName: string): TextRange[] {
  const mode = detectCommentMode(fileName)
  if (mode === 'none') return []
  return mode === 'python' ? parsePythonCommentRanges(text) : parseCLikeCommentRanges(text)
}

function parseCLikeCommentRanges(text: string): TextRange[] {
  const ranges: TextRange[] = []

  type State = 'code' | 'lineComment' | 'blockComment' | 'singleQuote' | 'doubleQuote' | 'template'
  let state: State = 'code'
  let escaped = false
  let start = -1

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i]
    const next = i + 1 < text.length ? text[i + 1] : ''

    if (state === 'lineComment') {
      if (ch === '\n') {
        ranges.push({ start, end: i })
        start = -1
        state = 'code'
      }
      continue
    }

    if (state === 'blockComment') {
      if (ch === '*' && next === '/') {
        i += 1
        ranges.push({ start, end: i + 1 })
        start = -1
        state = 'code'
      }
      continue
    }

    if (state === 'singleQuote' || state === 'doubleQuote' || state === 'template') {
      if (escaped) {
        escaped = false
        continue
      }
      if (ch === '\\') {
        escaped = true
        continue
      }
      if ((state === 'singleQuote' && ch === '\'') || (state === 'doubleQuote' && ch === '"') || (state === 'template' && ch === '`')) {
        state = 'code'
      }
      continue
    }

    // state === 'code'
    if (ch === '/' && next === '/') {
      start = i
      state = 'lineComment'
      i += 1
      continue
    }

    if (ch === '/' && next === '*') {
      start = i
      state = 'blockComment'
      i += 1
      continue
    }

    if (ch === '\'') {
      state = 'singleQuote'
      escaped = false
      continue
    }

    if (ch === '"') {
      state = 'doubleQuote'
      escaped = false
      continue
    }

    if (ch === '`') {
      state = 'template'
      escaped = false
      continue
    }
  }

  if (state === 'lineComment' && start >= 0) ranges.push({ start, end: text.length })
  if (state === 'blockComment' && start >= 0) ranges.push({ start, end: text.length })

  return ranges
}

function parsePythonCommentRanges(text: string): TextRange[] {
  const ranges: TextRange[] = []

  type State = 'code' | 'lineComment' | 'singleQuote' | 'doubleQuote' | 'tripleSingle' | 'tripleDouble'
  let state: State = 'code'
  let escaped = false
  let start = -1

  const startsWithAt = (needle: string, at: number) => text.slice(at, at + needle.length) === needle

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i]

    if (state === 'lineComment') {
      if (ch === '\n') {
        ranges.push({ start, end: i })
        start = -1
        state = 'code'
      }
      continue
    }

    if (state === 'tripleSingle') {
      if (startsWithAt("'''", i)) {
        i += 2
        ranges.push({ start, end: i + 1 })
        start = -1
        state = 'code'
      }
      continue
    }

    if (state === 'tripleDouble') {
      if (startsWithAt('"""', i)) {
        i += 2
        ranges.push({ start, end: i + 1 })
        start = -1
        state = 'code'
      }
      continue
    }

    if (state === 'singleQuote' || state === 'doubleQuote') {
      if (escaped) {
        escaped = false
        continue
      }
      if (ch === '\\') {
        escaped = true
        continue
      }
      if ((state === 'singleQuote' && ch === '\'') || (state === 'doubleQuote' && ch === '"')) {
        state = 'code'
      }
      continue
    }

    // state === 'code'
    if (startsWithAt("'''", i)) {
      start = i
      state = 'tripleSingle'
      i += 2
      continue
    }

    if (startsWithAt('"""', i)) {
      start = i
      state = 'tripleDouble'
      i += 2
      continue
    }

    if (ch === '#') {
      start = i
      state = 'lineComment'
      continue
    }

    if (ch === '\'') {
      state = 'singleQuote'
      escaped = false
      continue
    }

    if (ch === '"') {
      state = 'doubleQuote'
      escaped = false
      continue
    }
  }

  if (state === 'lineComment' && start >= 0) ranges.push({ start, end: text.length })
  if ((state === 'tripleSingle' || state === 'tripleDouble') && start >= 0) ranges.push({ start, end: text.length })

  return ranges
}

