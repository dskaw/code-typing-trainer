import { describe, expect, it } from 'vitest'
import { computeSkippableLineBreakRanges, computeTrailingWhitespaceRanges } from './skipRanges'

describe('computeSkippableLineBreakRanges', () => {
  it('does not skip newlines on printable lines', () => {
    const text = 'a\nb\n'
    expect(computeSkippableLineBreakRanges(text, [])).toEqual([])
  })

  it('skips blank lines even without skip ranges', () => {
    const text = '\nA'
    expect(computeSkippableLineBreakRanges(text, [])).toEqual([{ start: 0, end: 1 }])
  })

  it('skips newline for comment-only line when comment body is skippable', () => {
    const text = 'a\n//x\nb'
    const commentRange = { start: 2, end: 5 } // excludes the newline at index 5
    expect(computeSkippableLineBreakRanges(text, [commentRange])).toEqual([{ start: 5, end: 6 }])
  })

  it('does not skip newline for code line with trailing comment', () => {
    const text = 'a //x\nb'
    const skip = [{ start: 1, end: 5 }] // pre-comment space + comment (excludes newline at 5)
    expect(computeSkippableLineBreakRanges(text, skip)).toEqual([])
  })
})

describe('computeTrailingWhitespaceRanges', () => {
  it('captures trailing spaces before newline and EOF', () => {
    const text = 'a  \nB\t\t'
    expect(computeTrailingWhitespaceRanges(text)).toEqual([
      { start: 1, end: 3 },
      { start: 5, end: 7 },
    ])
  })
})
