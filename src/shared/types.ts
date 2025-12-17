export type OpenFileResult = {
  filePath: string
  fileName: string
  content: string
  encoding: string
}

export type TextAlign = 'left' | 'center' | 'right'

export type TextRange = {
  start: number
  end: number
}

export enum Mark {
  UNTOUCHED = 'UNTOUCHED',
  CORRECT = 'CORRECT',
  INCORRECT = 'INCORRECT',
  COLLATERAL = 'COLLATERAL',
}

export type TextSegment = {
  index: number
  startLine: number
  endLine: number
  text: string
  commentRanges?: TextRange[]
}

export type TypingSettings = {
  linesPerSegment: number
  tabWidth: number
  slackN: number
  maxSegmentChars: number
  editorFontSize: number
  textAlign: TextAlign
  includeComments: boolean
  skipLeadingIndentation: boolean
  trimTrailingWhitespace: boolean
  autoSkipBlankLines: boolean
  showDebugOverlay: boolean
}

export type Attempt = {
  id: string

  filePath: string
  fileName: string

  segmentIndex: number
  segmentStartLine: number
  segmentEndLine: number

  linesPerSegment: number
  tabWidth: number
  slackN: number

  typeableChars: number
  typedKeystrokes: number
  incorrect: number
  collateral: number
  backspaces: number
  correctChars: number

  startAtMs: number
  endAtMs: number
  durationMs: number

  wpm: number
  unproductivePercent: number
}
