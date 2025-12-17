import type { TextAlign, TypingSettings } from './types'

export const DEFAULT_TYPING_SETTINGS: TypingSettings = {
  linesPerSegment: 200,
  tabWidth: 4,
  slackN: 3,
  maxSegmentChars: 20_000,
  editorFontSize: 13,
  textAlign: 'center',
  includeComments: true,
  skipLeadingIndentation: true,
  trimTrailingWhitespace: true,
  autoSkipBlankLines: true,
  showDebugOverlay: false,
}

function coerceInt(value: unknown, fallback: number): number {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.floor(value)
  if (typeof value === 'string') {
    const n = Number(value)
    if (Number.isFinite(n)) return Math.floor(n)
  }
  return fallback
}

function clampInt(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function normalizeTextAlign(value: unknown, fallback: TextAlign): TextAlign {
  if (value === 'left' || value === 'center' || value === 'right') return value
  return fallback
}

export function normalizeTypingSettings(input: Partial<TypingSettings>): TypingSettings {
  return {
    linesPerSegment: clampInt(coerceInt(input.linesPerSegment, DEFAULT_TYPING_SETTINGS.linesPerSegment), 1, 5000),
    tabWidth: clampInt(coerceInt(input.tabWidth, DEFAULT_TYPING_SETTINGS.tabWidth), 0, 16),
    slackN: clampInt(coerceInt(input.slackN, DEFAULT_TYPING_SETTINGS.slackN), 0, 50),
    maxSegmentChars: clampInt(coerceInt(input.maxSegmentChars, DEFAULT_TYPING_SETTINGS.maxSegmentChars), 500, 500_000),
    editorFontSize: clampInt(coerceInt(input.editorFontSize, DEFAULT_TYPING_SETTINGS.editorFontSize), 10, 32),
    textAlign: normalizeTextAlign(input.textAlign, DEFAULT_TYPING_SETTINGS.textAlign),
    includeComments: Boolean(input.includeComments ?? DEFAULT_TYPING_SETTINGS.includeComments),
    skipLeadingIndentation: Boolean(input.skipLeadingIndentation ?? DEFAULT_TYPING_SETTINGS.skipLeadingIndentation),
    trimTrailingWhitespace: Boolean(input.trimTrailingWhitespace ?? DEFAULT_TYPING_SETTINGS.trimTrailingWhitespace),
    autoSkipBlankLines: Boolean(input.autoSkipBlankLines ?? DEFAULT_TYPING_SETTINGS.autoSkipBlankLines),
    showDebugOverlay: Boolean(input.showDebugOverlay ?? DEFAULT_TYPING_SETTINGS.showDebugOverlay),
  }
}
