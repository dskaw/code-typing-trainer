import type { TextSegment } from '../shared/types'

export function normalizeText(input: string, tabWidth = 4): string {
  let text = input
  if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1)
  text = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n')

  const width = Number.isFinite(tabWidth) ? Math.max(0, Math.floor(tabWidth)) : 4
  if (width > 0) text = text.replace(/\t/g, ' '.repeat(width))
  else text = text.replace(/\t/g, '')

  return text
}

export type TextSegmentWithOffsets = TextSegment & {
  startOffset: number
  endOffset: number
}

function splitNormalizedByLinesWithOffsets(normalized: string, linesPerSegment = 200, maxSegmentChars = 20_000): TextSegmentWithOffsets[] {
  const lines = normalized.split('\n')
  const per = Number.isFinite(linesPerSegment) ? Math.max(1, Math.floor(linesPerSegment)) : 200
  const charLimit = Number.isFinite(maxSegmentChars) && maxSegmentChars > 0
    ? Math.max(1, Math.floor(maxSegmentChars))
    : Number.POSITIVE_INFINITY

  const lineStartOffsets: number[] = new Array(lines.length)
  {
    let offset = 0
    for (let i = 0; i < lines.length; i += 1) {
      lineStartOffsets[i] = offset
      offset += lines[i].length + 1
    }
  }

  const segments: TextSegmentWithOffsets[] = []
  let index = 0
  let segmentStartLine = 1
  let currentLinesCount = 0
  let currentChars = 0

  const pushSegment = (endLine: number) => {
    const startLineIndex = segmentStartLine - 1
    const endLineIndex = endLine - 1
    const startOffset = lineStartOffsets[startLineIndex]
    const endOffset = lineStartOffsets[endLineIndex] + lines[endLineIndex].length

    segments.push({
      index,
      startLine: segmentStartLine,
      endLine,
      text: normalized.slice(startOffset, endOffset),
      startOffset,
      endOffset,
    })

    index += 1
    segmentStartLine = endLine + 1
    currentLinesCount = 0
    currentChars = 0
  }

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const lineNumber = lineIndex + 1
    const line = lines[lineIndex]

    const lineChars = line.length
    const extraChars = currentLinesCount === 0 ? lineChars : (1 + lineChars)

    const wouldExceedLines = currentLinesCount >= per
    const wouldExceedChars = (currentChars + extraChars) > charLimit

    if (currentLinesCount > 0 && (wouldExceedLines || wouldExceedChars)) {
      pushSegment(lineNumber - 1)
    }

    if (charLimit !== Number.POSITIVE_INFINITY && lineChars > charLimit) {
      if (currentLinesCount > 0) pushSegment(lineNumber - 1)

      const lineStartOffset = lineStartOffsets[lineIndex]
      for (let offset = 0; offset < line.length; offset += charLimit) {
        const slice = line.slice(offset, offset + charLimit)
        segments.push({
          index,
          startLine: lineNumber,
          endLine: lineNumber,
          text: slice,
          startOffset: lineStartOffset + offset,
          endOffset: lineStartOffset + offset + slice.length,
        })
        index += 1
      }

      segmentStartLine = lineNumber + 1
      currentLinesCount = 0
      currentChars = 0
      continue
    }

    currentLinesCount += 1
    currentChars += extraChars

    if (currentLinesCount >= per) {
      pushSegment(lineNumber)
    }
  }

  if (currentLinesCount > 0) pushSegment(lines.length)

  return segments
}

export function splitByLinesWithOffsets(input: string, linesPerSegment = 200, tabWidth = 4, maxSegmentChars = 20_000): TextSegmentWithOffsets[] {
  const normalized = normalizeText(input, tabWidth)
  return splitNormalizedByLinesWithOffsets(normalized, linesPerSegment, maxSegmentChars)
}

export function splitByLines(input: string, linesPerSegment = 200, tabWidth = 4, maxSegmentChars = 20_000): TextSegment[] {
  return splitByLinesWithOffsets(input, linesPerSegment, tabWidth, maxSegmentChars).map(({ startOffset, endOffset, ...seg }) => seg)
}
