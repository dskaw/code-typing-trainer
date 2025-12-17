import { describe, expect, it } from 'vitest'
import { Mark } from '../shared/types'
import { createTypingEngine, handleBackspace, handleKey, isComplete } from './typingEngine'

describe('typingEngine', () => {
  it('all correct input completes with zero errors', () => {
    const s = createTypingEngine('abc', 3)
    handleKey(s, 'a')
    handleKey(s, 'b')
    handleKey(s, 'c')

    expect(s.incorrect).toBe(0)
    expect(s.collateral).toBe(0)
    expect(s.backspaces).toBe(0)
    expect(s.cursor).toBe(3)
    expect(s.locked).toBe(false)
    expect(s.errorActive).toBe(false)
    expect(isComplete(s)).toBe(true)
    expect(s.correctChars).toBe(3)
    expect(s.marks).toEqual([Mark.CORRECT, Mark.CORRECT, Mark.CORRECT])
  })

  it('within slackN after first error accumulates collateral and does not lock', () => {
    const s = createTypingEngine('abcd', 3)
    handleKey(s, 'x') // incorrect at index 0
    handleKey(s, 'b')
    handleKey(s, 'c')
    handleKey(s, 'd')

    expect(s.incorrect).toBe(1)
    expect(s.collateral).toBe(3)
    expect(s.locked).toBe(false)
    expect(s.errorActive).toBe(true)
    expect(s.firstErrorIndex).toBe(0)
    expect(s.cursor).toBe(4)
    expect(s.marks).toEqual([Mark.INCORRECT, Mark.COLLATERAL, Mark.COLLATERAL, Mark.COLLATERAL])
  })

  it('exceeding slackN locks and blocks normal input until backspace', () => {
    const s = createTypingEngine('abcdef', 2)
    handleKey(s, 'x') // incorrect at 0, cursor=1
    handleKey(s, 'b') // collateral at 1, cursor=2
    handleKey(s, 'c') // collateral at 2, cursor=3

    expect(s.cursor).toBe(3)
    expect(s.locked).toBe(false)

    handleKey(s, 'd') // exceed slack => locked, cursor stays 3
    expect(s.locked).toBe(true)
    expect(s.cursor).toBe(3)

    handleKey(s, 'e') // locked => cursor stays 3, still counts keystroke
    expect(s.cursor).toBe(3)
    expect(s.typedKeystrokes).toBe(5)

    handleBackspace(s) // unlock + cursor--
    expect(s.locked).toBe(false)
    expect(s.cursor).toBe(2)
    expect(s.backspaces).toBe(1)
    expect(s.marks[2]).toBe(Mark.UNTOUCHED)
  })

  it('backspacing to firstErrorIndex clears errorActive and unlocks', () => {
    const s = createTypingEngine('abcdef', 2)
    handleKey(s, 'x') // incorrect at 0
    handleKey(s, 'b') // collateral
    handleKey(s, 'c') // collateral
    handleKey(s, 'd') // lock at cursor=3

    expect(s.locked).toBe(true)
    expect(s.errorActive).toBe(true)
    expect(s.firstErrorIndex).toBe(0)

    handleBackspace(s) // cursor=2, unlock
    handleBackspace(s) // cursor=1
    handleBackspace(s) // cursor=0, clears errorActive

    expect(s.cursor).toBe(0)
    expect(s.locked).toBe(false)
    expect(s.errorActive).toBe(false)
    expect(s.firstErrorIndex).toBe(-1)
    expect(s.backspaces).toBe(3)
    expect(s.typedKeystrokes).toBe(7)
    expect(s.marks[0]).toBe(Mark.UNTOUCHED)
  })

  it('auto-skip blank lines: "\\n\\nP" Enter consumes consecutive newlines and lands on P', () => {
    const s = createTypingEngine('\n\nP', 3, true)

    handleKey(s, '\n')

    expect(s.cursor).toBe(2)
    expect(s.text[s.cursor]).toBe('P')
    expect(s.incorrect).toBe(0)
    expect(s.collateral).toBe(0)
    expect(s.locked).toBe(false)
    expect(s.errorActive).toBe(false)
    expect(s.typedKeystrokes).toBe(1)
    expect(s.correctChars).toBe(1)
    expect(s.marks.slice(0, 2)).toEqual([Mark.CORRECT, Mark.CORRECT])
  })

  it('auto-skip blank lines: "\\nP" Enter advances normally to P', () => {
    const s = createTypingEngine('\nP', 3, true)

    handleKey(s, '\n')

    expect(s.cursor).toBe(1)
    expect(s.text[s.cursor]).toBe('P')
    expect(s.incorrect).toBe(0)
    expect(s.collateral).toBe(0)
    expect(s.typedKeystrokes).toBe(1)
    expect(s.correctChars).toBe(1)
    expect(s.marks[0]).toBe(Mark.CORRECT)
  })

  it('skip comments: advances across comment ranges without extra keystrokes', () => {
    const s = createTypingEngine('a/*c*/b', 3, true, [{ start: 1, end: 6 }])

    handleKey(s, 'a')
    expect(s.cursor).toBe(6)
    expect(s.text[s.cursor]).toBe('b')
    expect(s.typedKeystrokes).toBe(1)
    expect(s.correctChars).toBe(1)

    handleKey(s, 'b')
    expect(s.cursor).toBe(7)
    expect(isComplete(s)).toBe(true)
    expect(s.correctChars).toBe(2)
    expect(s.typedKeystrokes).toBe(2)
  })

  it('skip comments: backspace returns to last typed position before comment', () => {
    const s = createTypingEngine('a/*c*/b', 3, true, [{ start: 1, end: 6 }])

    handleKey(s, 'a')
    expect(s.cursor).toBe(6)
    handleBackspace(s)
    expect(s.cursor).toBe(0)
    expect(s.backspaces).toBe(1)
    expect(s.typedKeystrokes).toBe(2)
    expect(s.correctChars).toBe(0)
  })

  it('skip comments: slack/collateral counts exclude skipped ranges', () => {
    const s = createTypingEngine('a/*c*/b', 1, true, [{ start: 1, end: 6 }])

    handleKey(s, 'x') // incorrect at 0; cursor jumps across comment to 'b'
    expect(s.errorActive).toBe(true)
    expect(s.firstErrorIndex).toBe(0)
    expect(s.cursor).toBe(6)
    expect(s.locked).toBe(false)

    handleKey(s, 'b') // within slack => collateral
    expect(s.collateral).toBe(1)
    expect(s.cursor).toBe(7)
    expect(s.locked).toBe(false)
  })

  it('skip leading indentation: entering a new line jumps to first non-space', () => {
    const text = '{\n    c'
    const indentRange = { start: 2, end: 6 }
    const s = createTypingEngine(text, 3, true, [indentRange])

    handleKey(s, '{')
    handleKey(s, '\n')

    expect(s.cursor).toBe(6)
    expect(s.text[s.cursor]).toBe('c')
    expect(s.typedKeystrokes).toBe(2)
    expect(s.correctChars).toBe(2)
  })

  it('skip comments: space can advance newline when enabled', () => {
    const text = 'a  //x\nb'
    const skipAllAfterA = { start: 1, end: 6 } // spaces + comment, leaving '\n' at 6 and 'b' at 7
    const s = createTypingEngine(text, 3, true, [skipAllAfterA], true)

    handleKey(s, 'a')
    expect(s.cursor).toBe(6)
    expect(s.text[s.cursor]).toBe('\n')

    handleKey(s, ' ')
    expect(s.cursor).toBe(7)
    expect(s.text[s.cursor]).toBe('b')
    expect(s.incorrect).toBe(0)
    expect(s.collateral).toBe(0)
  })
})
