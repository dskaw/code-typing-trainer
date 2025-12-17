/// <reference lib="webworker" />
import { normalizeText, splitByLinesWithOffsets } from '../core/segmenter'
import { parseCommentRangesForFile } from '../core/commentRanges'
import type { TextRange, TextSegment } from '../shared/types'

type SegmentRequest = {
  id: string
  content: string
  fileName: string
  linesPerSegment: number
  tabWidth: number
  maxSegmentChars: number
  includeComments: boolean
}

type SegmentResponse =
  | { id: string; segments: TextSegment[] }
  | { id: string; error: string }

const ctx: DedicatedWorkerGlobalScope = self as unknown as DedicatedWorkerGlobalScope

ctx.onmessage = (event: MessageEvent<SegmentRequest>) => {
  const { id, content, fileName, linesPerSegment, tabWidth, maxSegmentChars, includeComments } = event.data
  try {
    const normalized = normalizeText(content, tabWidth)
    const globalCommentRanges = includeComments ? [] : parseCommentRangesForFile(normalized, fileName)
    const segmentsWithOffsets = splitByLinesWithOffsets(normalized, linesPerSegment, 0, maxSegmentChars)

    let rangeIndex = 0
    const segments: TextSegment[] = segmentsWithOffsets.map(({ startOffset, endOffset, ...seg }) => {
      let commentRanges: TextRange[] | undefined
      if (!includeComments && globalCommentRanges.length > 0) {
        while (rangeIndex < globalCommentRanges.length && globalCommentRanges[rangeIndex].end <= startOffset) {
          rangeIndex += 1
        }

        let j = rangeIndex
        while (j < globalCommentRanges.length && globalCommentRanges[j].start < endOffset) {
          const r = globalCommentRanges[j]
          const s = Math.max(r.start, startOffset)
          const e = Math.min(r.end, endOffset)
          if (e > s) {
            commentRanges ??= []
            commentRanges.push({ start: s - startOffset, end: e - startOffset })
          }
          if (r.end <= endOffset) j += 1
          else break
        }

        rangeIndex = j
      }

      return {
        ...seg,
        commentRanges,
      }
    })

    const response: SegmentResponse = { id, segments }
    ctx.postMessage(response)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    const response: SegmentResponse = { id, error: message }
    ctx.postMessage(response)
  }
}
