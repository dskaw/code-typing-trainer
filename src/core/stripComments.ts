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

function isNewline(ch: string): boolean {
  return ch === '\n' || ch === '\r'
}

export function stripCommentsForFile(input: string, fileName: string): string {
  const mode = detectCommentMode(fileName)
  if (mode === 'none') return input
  const stripped = mode === 'python' ? stripPythonComments(input) : stripCLikeComments(input)
  return rstripLineEndWhitespace(stripped)
}

function stripCLikeComments(input: string): string {
  let out = ''
  let i = 0

  type State = 'code' | 'lineComment' | 'blockComment' | 'singleQuote' | 'doubleQuote' | 'template'
  let state: State = 'code'
  let escaped = false

  while (i < input.length) {
    const ch = input[i]
    const next = i + 1 < input.length ? input[i + 1] : ''

    if (state === 'lineComment') {
      if (isNewline(ch)) {
        out += ch
        state = 'code'
      }
      i += 1
      continue
    }

    if (state === 'blockComment') {
      if (ch === '*' && next === '/') {
        i += 2
        state = 'code'
        continue
      }
      if (isNewline(ch)) out += ch
      i += 1
      continue
    }

    if (state === 'singleQuote' || state === 'doubleQuote' || state === 'template') {
      out += ch
      if (escaped) {
        escaped = false
      } else if (ch === '\\') {
        escaped = true
      } else if (
        (state === 'singleQuote' && ch === '\'')
        || (state === 'doubleQuote' && ch === '"')
        || (state === 'template' && ch === '`')
      ) {
        state = 'code'
      }
      i += 1
      continue
    }

    // state === 'code'
    if (ch === '\'' ) {
      state = 'singleQuote'
      escaped = false
      out += ch
      i += 1
      continue
    }

    if (ch === '"') {
      state = 'doubleQuote'
      escaped = false
      out += ch
      i += 1
      continue
    }

    if (ch === '`') {
      state = 'template'
      escaped = false
      out += ch
      i += 1
      continue
    }

    if (ch === '/' && next === '/') {
      out += ' '
      i += 2
      state = 'lineComment'
      continue
    }

    if (ch === '/' && next === '*') {
      out += ' '
      i += 2
      state = 'blockComment'
      continue
    }

    out += ch
    i += 1
  }

  return out
}

function stripPythonComments(input: string): string {
  let out = ''
  let i = 0

  type State = 'code' | 'lineComment' | 'singleQuote' | 'doubleQuote' | 'tripleSingle' | 'tripleDouble'
  let state: State = 'code'
  let escaped = false

  const startsWithAt = (needle: string, at: number) => input.slice(at, at + needle.length) === needle

  while (i < input.length) {
    const ch = input[i]

    if (state === 'lineComment') {
      if (isNewline(ch)) {
        out += ch
        state = 'code'
      }
      i += 1
      continue
    }

    if (state === 'tripleSingle') {
      if (startsWithAt("'''", i)) {
        i += 3
        state = 'code'
        continue
      }
      if (isNewline(ch)) out += ch
      i += 1
      continue
    }

    if (state === 'tripleDouble') {
      if (startsWithAt('"""', i)) {
        i += 3
        state = 'code'
        continue
      }
      if (isNewline(ch)) out += ch
      i += 1
      continue
    }

    if (state === 'singleQuote' || state === 'doubleQuote') {
      out += ch
      if (escaped) {
        escaped = false
      } else if (ch === '\\') {
        escaped = true
      } else if ((state === 'singleQuote' && ch === '\'') || (state === 'doubleQuote' && ch === '"')) {
        state = 'code'
      }
      i += 1
      continue
    }

    // state === 'code'
    if (startsWithAt("'''", i)) {
      out += ' '
      i += 3
      state = 'tripleSingle'
      continue
    }

    if (startsWithAt('"""', i)) {
      out += ' '
      i += 3
      state = 'tripleDouble'
      continue
    }

    if (ch === '\'') {
      out += ch
      i += 1
      escaped = false
      state = 'singleQuote'
      continue
    }

    if (ch === '"') {
      out += ch
      i += 1
      escaped = false
      state = 'doubleQuote'
      continue
    }

    if (ch === '#') {
      i += 1
      state = 'lineComment'
      continue
    }

    out += ch
    i += 1
  }

  return out
}

function rstripLineEndWhitespace(text: string): string {
  return text
    .replace(/[ \t]+\r\n/g, '\r\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/[ \t]+\r/g, '\r')
    .replace(/[ \t]+$/g, '')
}
