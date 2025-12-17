import type { TextRange } from '../shared/types'
import { Mark } from '../shared/types'

export type TypingEngineState = {
  text: string
  slackN: number
  autoSkipBlankLines: boolean
  allowWhitespaceAdvanceToNewline: boolean
  skipRanges: TextRange[]

  cursor: number
  typedEnd: number
  errorActive: boolean
  firstErrorIndex: number
  firstErrorTypedProgress: number
  locked: boolean
  marks: Mark[]
  countedCorrect: boolean[]
  typedPositions: number[]

  typeableChars: number
  typedKeystrokes: number
  incorrect: number
  collateral: number
  backspaces: number
  correctChars: number
}

function normalizeRanges(ranges: TextRange[] | undefined, max: number): TextRange[] {
  if (!ranges || ranges.length === 0) return []

  const trimmed = ranges
    .map((r) => ({
      start: Math.max(0, Math.min(max, Math.floor(r.start))),
      end: Math.max(0, Math.min(max, Math.floor(r.end))),
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

function sumRangeLengths(ranges: TextRange[]): number {
  let total = 0
  for (const r of ranges) total += Math.max(0, r.end - r.start)
  return total
}

function findContainingRange(ranges: TextRange[], pos: number): TextRange | null {
  let lo = 0
  let hi = ranges.length - 1
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    const r = ranges[mid]
    if (pos < r.start) hi = mid - 1
    else if (pos >= r.end) lo = mid + 1
    else return r
  }
  return null
}

function skipForwardIfNeeded(state: TypingEngineState) {
  const ranges = state.skipRanges
  if (ranges.length === 0) return

  while (state.cursor < state.text.length) {
    const r = findContainingRange(ranges, state.cursor)
    if (!r) break
    state.cursor = r.end
  }
}

export function createTypingEngine(
  text: string,
  slackN = 3,
  autoSkipBlankLines = true,
  skipRanges: TextRange[] = [],
  allowWhitespaceAdvanceToNewline = false,
): TypingEngineState {
  const slack = Number.isFinite(slackN) ? Math.max(0, Math.floor(slackN)) : 3
  const autoSkip = Boolean(autoSkipBlankLines)
  const allowWhitespaceAdvance = Boolean(allowWhitespaceAdvanceToNewline)
  const ranges = normalizeRanges(skipRanges, text.length)
  const skippedChars = sumRangeLengths(ranges)
  const state: TypingEngineState = {
    text,
    slackN: slack,
    autoSkipBlankLines: autoSkip,
    allowWhitespaceAdvanceToNewline: allowWhitespaceAdvance,
    skipRanges: ranges,
    cursor: 0,
    typedEnd: 0,
    errorActive: false,
    firstErrorIndex: -1,
    firstErrorTypedProgress: -1,
    locked: false,
    marks: Array.from({ length: text.length }, () => Mark.UNTOUCHED),
    countedCorrect: Array.from({ length: text.length }, () => false),
    typedPositions: [],
    typeableChars: Math.max(0, text.length - skippedChars),
    typedKeystrokes: 0,
    incorrect: 0,
    collateral: 0,
    backspaces: 0,
    correctChars: 0,
  }
  skipForwardIfNeeded(state)
  return state
}

export function isComplete(state: TypingEngineState): boolean {
  return state.cursor >= state.text.length && !state.errorActive && !state.locked
}

function setMark(state: TypingEngineState, index: number, next: Mark, countCorrect: boolean) {
  if (index < 0 || index >= state.marks.length) return
  const prev = state.marks[index]
  const prevCounted = state.countedCorrect[index] === true
  const prevWasCountedCorrect = prev === Mark.CORRECT && prevCounted
  const nextWillCountCorrect = next === Mark.CORRECT && countCorrect

  if (prevWasCountedCorrect && !nextWillCountCorrect) state.correctChars -= 1
  if (!prevWasCountedCorrect && nextWillCountCorrect) state.correctChars += 1

  state.marks[index] = next
  state.countedCorrect[index] = nextWillCountCorrect
}

export function handleKey(state: TypingEngineState, ch: string): TypingEngineState {
  if (!ch) return state

  state.typedKeystrokes += 1

  if (state.locked) {
    return state
  }

  skipForwardIfNeeded(state)

  if (state.cursor >= state.text.length) {
    return state
  }

  let input = ch[0]
  const expected = state.text[state.cursor]

  if (!state.errorActive) {
    if (state.allowWhitespaceAdvanceToNewline && input === ' ' && expected === '\n') {
      input = '\n'
    }

    if (input === expected) {
      const isEnter = input === '\n' && expected === '\n'
      if (isEnter && state.autoSkipBlankLines) {
        setMark(state, state.cursor, Mark.CORRECT, true)
        state.typedPositions.push(state.cursor)
        state.cursor += 1
        state.typedEnd = state.cursor

        while (state.cursor < state.text.length && state.text[state.cursor] === '\n') {
          setMark(state, state.cursor, Mark.CORRECT, false)
          state.cursor += 1
        }
        state.typedEnd = state.cursor

        skipForwardIfNeeded(state)
        return state
      }

      setMark(state, state.cursor, Mark.CORRECT, true)
      state.typedPositions.push(state.cursor)
      state.cursor += 1
      state.typedEnd = state.cursor
      skipForwardIfNeeded(state)
      return state
    }

    const typedProgressBefore = state.typedPositions.length
    setMark(state, state.cursor, Mark.INCORRECT, false)
    state.typedPositions.push(state.cursor)
    state.incorrect += 1
    state.errorActive = true
    state.firstErrorIndex = state.cursor
    state.firstErrorTypedProgress = typedProgressBefore
    state.cursor += 1
    state.typedEnd = state.cursor
    skipForwardIfNeeded(state)
    return state
  }

  const typedDistance = state.firstErrorTypedProgress >= 0
    ? (state.typedPositions.length - state.firstErrorTypedProgress)
    : (state.cursor - state.firstErrorIndex)

  if (typedDistance <= state.slackN) {
    setMark(state, state.cursor, Mark.COLLATERAL, false)
    state.typedPositions.push(state.cursor)
    state.collateral += 1
    state.cursor += 1
    state.typedEnd = state.cursor
    skipForwardIfNeeded(state)
    return state
  }

  state.locked = true
  return state
}

export function handleBackspace(state: TypingEngineState): TypingEngineState {
  state.typedKeystrokes += 1
  state.backspaces += 1
  state.locked = false

  const last = state.typedPositions.pop()
  if (typeof last === 'number') {
    state.cursor = last
    state.typedEnd = state.cursor
    setMark(state, state.cursor, Mark.UNTOUCHED, false)
  }

  if (state.errorActive && state.cursor <= state.firstErrorIndex) {
    state.errorActive = false
    state.firstErrorIndex = -1
    state.firstErrorTypedProgress = -1
  }

  return state
}
