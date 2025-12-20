import Editor, { type BeforeMount, type OnMount } from '@monaco-editor/react'
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type * as Monaco from 'monaco-editor'
import EditorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker'
import { Badge, Button, Drawer, Group, NumberInput, Progress, Select, Stack, Switch, Text, useComputedColorScheme } from '@mantine/core'
import { notifications } from '@mantine/notifications'
import { ThemeToggle } from '../components/ThemeToggle'
import type { Attempt, OpenFileResult, TextRange, TextSegment, TypingSettings } from '../shared/types'
import { normalizeTypingSettings } from '../shared/typingSettings'
import type { TypingEngineState } from '../core/typingEngine'
import { createTypingEngine, handleBackspace, handleKey, isComplete } from '../core/typingEngine'
import { computeUnproductivePercent, computeWpm } from '../core/metrics'
import { computeLeadingIndentationRanges, computePreCommentPaddingRanges, computeSkippableLineBreakRanges, computeTrailingWhitespaceRanges, mergeRanges } from '../core/skipRanges'
import './Typing.css'

type TypingProps = {
  file: OpenFileResult
  segments: TextSegment[]
  settings: TypingSettings
  segmentIndex: number
  onBack: () => void
  onUpdateSettings: (settings: TypingSettings) => void
  onChangeSegment: (segmentIndex: number) => void
  onComplete: (attempt: Attempt) => void
}

type MonacoEnvironment = {
  getWorker: (moduleId: string, label: string) => Worker
}

const monacoGlobal = globalThis as unknown as { MonacoEnvironment?: MonacoEnvironment }
monacoGlobal.MonacoEnvironment ??= { getWorker: () => new EditorWorker() }

const TT_THEME_LIGHT = 'tt-vs'
const TT_THEME_DARK = 'tt-vs-dark'

let typingThemesDefined = false
function ensureTypingThemes(monaco: typeof import('monaco-editor')) {
  if (typingThemesDefined) return
  typingThemesDefined = true

  const lightForeground = '#000000'
  const darkForeground = '#D4D4D4'

  const bracketColors = (fg: string) => ({
    'editorBracketHighlight.foreground1': fg,
    'editorBracketHighlight.foreground2': fg,
    'editorBracketHighlight.foreground3': fg,
    'editorBracketHighlight.foreground4': fg,
    'editorBracketHighlight.foreground5': fg,
    'editorBracketHighlight.foreground6': fg,
    'editorBracketHighlight.unexpectedBracket.foreground': fg,
  })

  monaco.editor.defineTheme(TT_THEME_LIGHT, {
    base: 'vs',
    inherit: true,
    rules: [],
    colors: bracketColors(lightForeground),
  })

  monaco.editor.defineTheme(TT_THEME_DARK, {
    base: 'vs-dark',
    inherit: true,
    rules: [],
    colors: bracketColors(darkForeground),
  })
}

function formatElapsed(ms: number) {
  const totalSeconds = Math.floor(ms / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}

type UiSnapshot = {
  cursor: number
  locked: boolean
  errorActive: boolean
  firstErrorIndex: number

  typedKeystrokes: number
  incorrect: number
  collateral: number
  backspaces: number
  correctChars: number

  startedAtMs: number | null
}

function snapshotFromEngine(engine: TypingEngineState, startedAtMs: number | null): UiSnapshot {
  return {
    cursor: engine.cursor,
    locked: engine.locked,
    errorActive: engine.errorActive,
    firstErrorIndex: engine.firstErrorIndex,
    typedKeystrokes: engine.typedKeystrokes,
    incorrect: engine.incorrect,
    collateral: engine.collateral,
    backspaces: engine.backspaces,
    correctChars: engine.correctChars,
    startedAtMs,
  }
}

function coerceInt(value: unknown, fallback: number): number {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.floor(value)
  if (typeof value === 'string') {
    const n = Number(value)
    if (Number.isFinite(n)) return Math.floor(n)
  }
  return fallback
}

const MonacoReadonly = memo(function MonacoReadonly({
  value,
  onMount,
  beforeMount,
  options,
  theme,
}: {
  value: string
  onMount: OnMount
  beforeMount: BeforeMount
  options: Monaco.editor.IStandaloneEditorConstructionOptions
  theme: string
}) {
  return (
    <Editor
      height="100%"
      defaultLanguage="plaintext"
      value={value}
      onMount={onMount}
      beforeMount={beforeMount}
      options={options}
      theme={theme}
    />
  )
})

export function Typing({ file, segments, settings, segmentIndex, onBack, onUpdateSettings, onChangeSegment, onComplete }: TypingProps) {
  const perfRef = useRef({
    lastKeyHandlingMs: 0,
    lastDecorationUpdateMs: 0,
    lastDecorationCount: 0,
    lastRenderLatencyMs: 0,
    lastKeyAt: 0,
    pendingRenderLatency: false,
  })
  const renderCountRef = useRef(0)
  renderCountRef.current += 1
  if (perfRef.current.pendingRenderLatency) {
    perfRef.current.lastRenderLatencyMs = performance.now() - perfRef.current.lastKeyAt
    perfRef.current.pendingRenderLatency = false
  }

  const segment = segments[Math.min(segmentIndex, Math.max(0, segments.length - 1))]
  const segmentText = segment?.text ?? ''
  const computedColorScheme = useComputedColorScheme('light', { getInitialValueInEffect: false })
  const monacoTheme = computedColorScheme === 'dark' ? TT_THEME_DARK : TT_THEME_LIGHT

  const editorRef = useRef<Monaco.editor.IStandaloneCodeEditor | null>(null)
  const monacoRef = useRef<typeof import('monaco-editor') | null>(null)
  const decorationsRef = useRef<Monaco.editor.IEditorDecorationsCollection | null>(null)
  const staticDecorationsRef = useRef<Monaco.editor.IEditorDecorationsCollection | null>(null)
  const lastRevealCursorRef = useRef(-1)
  const monacoContainerRef = useRef<HTMLDivElement | null>(null)
  const editorDisposablesRef = useRef<Monaco.IDisposable[]>([])
  const enterHintWidgetRef = useRef<Monaco.editor.IContentWidget | null>(null)
  const enterHintStateRef = useRef<{ visible: boolean; position: Monaco.IPosition | null }>({ visible: false, position: null })
  const layoutRafRef = useRef<number | null>(null)

  const engineRef = useRef<TypingEngineState>(createTypingEngine(segmentText, settings.slackN, settings.autoSkipBlankLines))
  const autoSkipRef = useRef(settings.autoSkipBlankLines)
  const commitRafRef = useRef<number | null>(null)

  const completedRef = useRef(false)

  const inputRef = useRef<HTMLTextAreaElement | null>(null)
  const isComposingRef = useRef(false)
  const startAtRef = useRef<number | null>(null)
  const [elapsedMs, setElapsedMs] = useState(0)
  const [ui, setUi] = useState<UiSnapshot>(() => snapshotFromEngine(engineRef.current, startAtRef.current))
  const [settingsOpened, setSettingsOpened] = useState(false)
  const [draftSettings, setDraftSettings] = useState<TypingSettings>(settings)
  const wasLockedRef = useRef(false)

  useEffect(() => {
    setDraftSettings(settings)
  }, [settings])

  useEffect(() => {
    if (ui.locked && !wasLockedRef.current) {
      notifications.show({
        id: 'typing-locked',
        color: 'red',
        title: 'Input locked',
        message: 'Backspace to fix the first mistake.',
        autoClose: 1500,
      })
    }
    wasLockedRef.current = ui.locked
  }, [ui.locked])

  const focusInputSoon = useCallback(() => {
    setTimeout(() => inputRef.current?.focus(), 0)
  }, [])

  useEffect(() => {
    autoSkipRef.current = settings.autoSkipBlankLines
    engineRef.current.autoSkipBlankLines = settings.autoSkipBlankLines
  }, [settings.autoSkipBlankLines])

  const scheduleEditorLayout = useCallback((reason: string) => {
    if (layoutRafRef.current !== null) return
    layoutRafRef.current = requestAnimationFrame(() => {
      layoutRafRef.current = null
      const editor = editorRef.current
      if (!editor) return
      try {
        editor.layout()
      } catch (error) {
        console.warn('editor.layout failed:', reason, error)
      }
    })
  }, [])

  const copyFilePath = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(file.filePath)
      notifications.show({ color: 'green', message: 'Copied file path' })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      notifications.show({ color: 'red', title: 'Copy failed', message })
    }
  }, [file.filePath])

  function ensureStarted() {
    if (startAtRef.current === null) startAtRef.current = Date.now()
  }

  const buildSkipInfo = useCallback(() => {
    const maxLen = segmentText.length
    const rawCommentRanges: TextRange[] = settings.includeComments ? [] : (segment?.commentRanges ?? [])
    const preCommentPaddingRanges = settings.includeComments ? [] : computePreCommentPaddingRanges(segmentText, rawCommentRanges)
    const leadingIndentRanges = settings.skipLeadingIndentation ? computeLeadingIndentationRanges(segmentText) : []
    const trailingWhitespaceRanges = settings.trimTrailingWhitespace ? computeTrailingWhitespaceRanges(segmentText) : []

    const skipSpaceRanges = mergeRanges([...leadingIndentRanges, ...preCommentPaddingRanges, ...trailingWhitespaceRanges], maxLen)
    const commentRanges = mergeRanges(rawCommentRanges, maxLen)
    const baseSkipRanges = settings.includeComments
      ? skipSpaceRanges
      : mergeRanges([...commentRanges, ...skipSpaceRanges], maxLen)
    const lineBreakSkipRanges = settings.includeComments
      ? []
      : computeSkippableLineBreakRanges(segmentText, baseSkipRanges)
    const engineSkipRanges = lineBreakSkipRanges.length === 0
      ? baseSkipRanges
      : mergeRanges([...baseSkipRanges, ...lineBreakSkipRanges], maxLen)

    return { commentRanges, skipSpaceRanges, engineSkipRanges }
  }, [segment?.commentRanges, segmentText, settings.includeComments, settings.skipLeadingIndentation, settings.trimTrailingWhitespace])

  const applyDecorations = useCallback(() => {
    const editor = editorRef.current
    const monaco = monacoRef.current
    const decorations = decorationsRef.current
    if (!editor || !monaco || !decorations) return

    const model = editor.getModel()
    if (!model) return

    const state = engineRef.current
    const textLength = state.text.length
    const decos: Monaco.editor.IModelDeltaDecoration[] = []

    const clamp = (value: number) => Math.max(0, Math.min(textLength, value))
    const makeRange = (start: number, end: number) => {
      const a = clamp(start)
      const b = clamp(end)
      const startPos = model.getPositionAt(a)
      const endPos = model.getPositionAt(b)
      return new monaco.Range(startPos.lineNumber, startPos.column, endPos.lineNumber, endPos.column)
    }

    const correctEnd = state.errorActive ? state.firstErrorIndex : state.typedEnd
    if (correctEnd > 0) {
      decos.push({
        range: makeRange(0, correctEnd),
        options: { inlineClassName: 'tt-mark-correct' },
      })
    }

    if (state.errorActive && state.firstErrorIndex >= 0 && state.firstErrorIndex < textLength) {
      decos.push({
        range: makeRange(state.firstErrorIndex, state.firstErrorIndex + 1),
        options: { inlineClassName: 'tt-mark-incorrect' },
      })

      const collateralStart = state.firstErrorIndex + 1
      const collateralEnd = state.cursor
      if (collateralEnd > collateralStart && collateralStart < textLength) {
        decos.push({
          range: makeRange(collateralStart, collateralEnd),
          options: { inlineClassName: 'tt-mark-collateral' },
        })
      }
    }

    const expectedChar = state.cursor < textLength ? state.text[state.cursor] : null
    const showEnterHint = expectedChar === '\n'
    const visualCursorOffset = showEnterHint && state.typedEnd < state.cursor ? state.typedEnd : state.cursor

    if (state.cursor < textLength) {
      if (showEnterHint && state.typedEnd < state.cursor) {
        const pos = model.getPositionAt(clamp(visualCursorOffset))
        decos.push({
          range: new monaco.Range(pos.lineNumber, pos.column, pos.lineNumber, pos.column),
          options: { afterContentClassName: 'tt-cursor-after' },
        })
      } else {
        decos.push({
          range: makeRange(state.cursor, state.cursor + 1),
          options: { inlineClassName: 'tt-cursor-char' },
        })
      }
    } else {
      const pos = model.getPositionAt(textLength)
      decos.push({
        range: new monaco.Range(pos.lineNumber, pos.column, pos.lineNumber, pos.column),
        options: { afterContentClassName: 'tt-cursor-after' },
      })
    }

    const decorationStart = performance.now()
    decorations.set(decos)
    perfRef.current.lastDecorationUpdateMs = performance.now() - decorationStart
    perfRef.current.lastDecorationCount = decos.length

    const hint = enterHintStateRef.current
    const widget = enterHintWidgetRef.current
    if (widget) {
      if (showEnterHint) {
        const nextPos = model.getPositionAt(clamp(visualCursorOffset))
        const prevPos = hint.position
        const samePos = prevPos?.lineNumber === nextPos.lineNumber && prevPos.column === nextPos.column
        if (!hint.visible || !samePos) {
          hint.visible = true
          hint.position = nextPos
          const top = editor.getScrollTop()
          const left = editor.getScrollLeft()
          editor.layoutContentWidget(widget)
          editor.setScrollTop(top)
          editor.setScrollLeft(left)
        }
      } else if (hint.visible) {
        hint.visible = false
        hint.position = null
        const top = editor.getScrollTop()
        const left = editor.getScrollLeft()
        editor.layoutContentWidget(widget)
        editor.setScrollTop(top)
        editor.setScrollLeft(left)
      }
    }

    if (lastRevealCursorRef.current !== visualCursorOffset) {
      lastRevealCursorRef.current = visualCursorOffset
      const revealPos = model.getPositionAt(clamp(visualCursorOffset))
      const visible = editor.getVisibleRanges().some((r) => r.containsPosition(revealPos))
      if (!visible) editor.revealPositionInCenterIfOutsideViewport(revealPos)
    }
  }, [])

  const applyStaticDecorations = useCallback(() => {
    const editor = editorRef.current
    const monaco = monacoRef.current
    const decorations = staticDecorationsRef.current
    if (!editor || !monaco || !decorations) return

    const model = editor.getModel()
    if (!model) return

    const { commentRanges, skipSpaceRanges } = buildSkipInfo()
    const textLength = model.getValueLength()

    const clamp = (value: number) => Math.max(0, Math.min(textLength, value))
    const makeRange = (start: number, end: number) => {
      const a = clamp(start)
      const b = clamp(end)
      const startPos = model.getPositionAt(a)
      const endPos = model.getPositionAt(b)
      return new monaco.Range(startPos.lineNumber, startPos.column, endPos.lineNumber, endPos.column)
    }

    const decos: Monaco.editor.IModelDeltaDecoration[] = []

    if (!settings.includeComments) {
      for (const r of commentRanges) {
        decos.push({
          range: makeRange(r.start, r.end),
          options: { inlineClassName: 'tt-skip-comment' },
        })
      }
    }

    for (const r of skipSpaceRanges) {
      decos.push({
        range: makeRange(r.start, r.end),
        options: { inlineClassName: 'tt-skip-space' },
      })
    }

    decorations.set(decos)
  }, [buildSkipInfo, settings.includeComments])

  const maybeComplete = useCallback(() => {
    const engine = engineRef.current
    if (completedRef.current) return
    if (!segment) return
    if (!isComplete(engine)) return

    completedRef.current = true

    const endAtMs = Date.now()
    const startAtMs = startAtRef.current ?? endAtMs
    const durationMs = Math.max(0, endAtMs - startAtMs)

    const attempt: Attempt = {
      id: crypto.randomUUID(),
      filePath: file.filePath,
      fileName: file.fileName,
      segmentIndex,
      segmentStartLine: segment.startLine,
      segmentEndLine: segment.endLine,
      linesPerSegment: settings.linesPerSegment,
      tabWidth: settings.tabWidth,
      slackN: settings.slackN,
      typeableChars: engine.typeableChars,
      typedKeystrokes: engine.typedKeystrokes,
      incorrect: engine.incorrect,
      collateral: engine.collateral,
      backspaces: engine.backspaces,
      correctChars: engine.correctChars,
      startAtMs,
      endAtMs,
      durationMs,
      wpm: computeWpm(engine.correctChars, durationMs),
      unproductivePercent: computeUnproductivePercent(engine.typedKeystrokes, engine.incorrect, engine.collateral, engine.backspaces),
    }

    onComplete(attempt)
  }, [file.fileName, file.filePath, onComplete, segment, segmentIndex, settings.linesPerSegment, settings.slackN, settings.tabWidth])

  const scheduleCommit = useCallback(() => {
    if (commitRafRef.current !== null) return
    commitRafRef.current = requestAnimationFrame(() => {
      commitRafRef.current = null

      const engine = engineRef.current
      setUi(snapshotFromEngine(engine, startAtRef.current))
      maybeComplete()
    })
  }, [maybeComplete])

  const resetEngine = useCallback(() => {
    completedRef.current = false
    if (commitRafRef.current !== null) {
      cancelAnimationFrame(commitRafRef.current)
      commitRafRef.current = null
    }
    const { engineSkipRanges } = buildSkipInfo()
    engineRef.current = createTypingEngine(
      segmentText,
      settings.slackN,
      autoSkipRef.current,
      engineSkipRanges,
      !settings.includeComments,
    )
    startAtRef.current = null
    setElapsedMs(0)
    lastRevealCursorRef.current = -1
    setUi(snapshotFromEngine(engineRef.current, null))
    focusInputSoon()
    applyStaticDecorations()
    scheduleCommit()
  }, [applyStaticDecorations, buildSkipInfo, focusInputSoon, scheduleCommit, segmentText, settings.includeComments, settings.slackN])

  useEffect(() => {
    resetEngine()
  }, [resetEngine])

  useEffect(() => {
    return () => {
      if (commitRafRef.current !== null) cancelAnimationFrame(commitRafRef.current)
      if (layoutRafRef.current !== null) cancelAnimationFrame(layoutRafRef.current)
      editorDisposablesRef.current.forEach((d) => d.dispose())
      editorDisposablesRef.current = []
      if (enterHintWidgetRef.current && editorRef.current) {
        editorRef.current.removeContentWidget(enterHintWidgetRef.current)
        enterHintWidgetRef.current = null
      }
    }
  }, [])

  useEffect(() => {
    const id = setInterval(() => {
      const startedAt = startAtRef.current
      setElapsedMs(startedAt ? Date.now() - startedAt : 0)
    }, 200)
    return () => clearInterval(id)
  }, [])

  const onMount: OnMount = useCallback((editor, monaco) => {
    editorRef.current = editor
    monacoRef.current = monaco
    decorationsRef.current = editor.createDecorationsCollection()
    staticDecorationsRef.current = editor.createDecorationsCollection()

    try {
      monaco.languages.typescript.typescriptDefaults.setDiagnosticsOptions({ noSemanticValidation: true, noSyntaxValidation: true })
      monaco.languages.typescript.javascriptDefaults.setDiagnosticsOptions({ noSemanticValidation: true, noSyntaxValidation: true })
    } catch (error) {
      console.warn('Failed to disable TS/JS diagnostics:', error)
    }

    const model = editor.getModel()
    if (model) {
      monaco.editor.setModelMarkers(model, 'typescript', [])
      monaco.editor.setModelMarkers(model, 'javascript', [])
      monaco.editor.setModelMarkers(model, 'tt', [])
    }

    if (!enterHintWidgetRef.current) {
      const domNode = document.createElement('div')
      domNode.className = 'tt-enterHint'
      domNode.setAttribute('aria-hidden', 'true')

      const keycap = document.createElement('div')
      keycap.className = 'tt-enterHintKeycap'
      keycap.textContent = '↵'
      domNode.appendChild(keycap)

      const widget: Monaco.editor.IContentWidget = {
        getId: () => 'tt-enter-hint',
        getDomNode: () => domNode,
        getPosition: () => {
          const hint = enterHintStateRef.current
          if (!hint.visible || !hint.position) return null
          return {
            position: hint.position,
            preference: [monaco.editor.ContentWidgetPositionPreference.EXACT],
          }
        },
      }

      enterHintWidgetRef.current = widget
      editor.addContentWidget(widget)
    }

    editorDisposablesRef.current.forEach((d) => d.dispose())
    editorDisposablesRef.current = []

    editor.updateOptions({
      fontSize: settings.editorFontSize,
      lineHeight: Math.max(16, Math.round(settings.editorFontSize * 1.35)),
    })
    scheduleEditorLayout('mount')
    focusInputSoon()
    applyStaticDecorations()
    scheduleCommit()
  }, [applyStaticDecorations, focusInputSoon, scheduleCommit, settings.editorFontSize, scheduleEditorLayout])

  const beforeMount: BeforeMount = useCallback((monaco) => {
    ensureTypingThemes(monaco as unknown as typeof import('monaco-editor'))
  }, [])

  const processCommittedText = useCallback((text: string) => {
    if (!text) return
    if (!segment) return
    if (isComplete(engineRef.current)) return

    const keyStart = performance.now()
    perfRef.current.lastKeyAt = keyStart
    perfRef.current.pendingRenderLatency = true

    ensureStarted()
    for (let i = 0; i < text.length; i += 1) {
      handleKey(engineRef.current, text[i])
    }
    // Apply Monaco decorations synchronously to avoid a 1-frame stale cursor/afterContent "ghost".
    applyDecorations()
    scheduleCommit()
    perfRef.current.lastKeyHandlingMs = performance.now() - keyStart
  }, [applyDecorations, scheduleCommit, segment])

  const handleInput = useCallback((event: React.FormEvent<HTMLTextAreaElement>) => {
    if (isComposingRef.current) return
    const el = event.currentTarget
    const value = el.value
    if (!value) return
    el.value = ''
    processCommittedText(value)
  }, [processCommittedText])

  const handleCompositionStart = useCallback(() => {
    isComposingRef.current = true
  }, [])

  const handleCompositionEnd = useCallback((event: React.CompositionEvent<HTMLTextAreaElement>) => {
    isComposingRef.current = false
    const el = event.currentTarget
    const value = el.value
    if (!value) return
    el.value = ''
    processCommittedText(value)
  }, [processCommittedText])

  const handlePaste = useCallback((event: React.ClipboardEvent<HTMLTextAreaElement>) => {
    event.preventDefault()
    event.currentTarget.value = ''
  }, [])

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    const accel = e.ctrlKey || e.metaKey

    if (accel && e.key.toLowerCase() === 'v') {
      e.preventDefault()
      return
    }

    if (accel && e.shiftKey && e.key.toLowerCase() === 'd') {
      e.preventDefault()
      onUpdateSettings({ ...settings, showDebugOverlay: !settings.showDebugOverlay })
      return
    }

    if (accel && e.key.toLowerCase() === 'r') {
      e.preventDefault()
      resetEngine()
      return
    }

    if (accel && e.key === 'ArrowLeft') {
      e.preventDefault()
      onChangeSegment(Math.max(0, segmentIndex - 1))
      return
    }

    if (accel && e.key === 'ArrowRight') {
      e.preventDefault()
      onChangeSegment(Math.min(segments.length - 1, segmentIndex + 1))
      return
    }

    if (accel || e.altKey) return
    if (!segment) return

    if (isComplete(engineRef.current)) return

    if (isComposingRef.current && (e.key === 'Backspace' || e.key === 'Enter')) {
      return
    }

    if (e.key === 'Backspace') {
      e.preventDefault()
      const keyStart = performance.now()
      perfRef.current.lastKeyAt = keyStart
      perfRef.current.pendingRenderLatency = true
      ensureStarted()
      handleBackspace(engineRef.current)
      applyDecorations()
      scheduleCommit()
      perfRef.current.lastKeyHandlingMs = performance.now() - keyStart
      return
    }

    if (e.key === 'Enter') {
      e.preventDefault()
      const keyStart = performance.now()
      perfRef.current.lastKeyAt = keyStart
      perfRef.current.pendingRenderLatency = true
      ensureStarted()
      handleKey(engineRef.current, '\n')
      applyDecorations()
      scheduleCommit()
      perfRef.current.lastKeyHandlingMs = performance.now() - keyStart
      return
    }

    if (e.key === 'Tab') {
      e.preventDefault()
      if (isComposingRef.current) return
      const keyStart = performance.now()
      perfRef.current.lastKeyAt = keyStart
      perfRef.current.pendingRenderLatency = true
      ensureStarted()
      for (let i = 0; i < settings.tabWidth; i += 1) handleKey(engineRef.current, ' ')
      applyDecorations()
      scheduleCommit()
      perfRef.current.lastKeyHandlingMs = performance.now() - keyStart
      return
    }
  }

  const wpm = computeWpm(ui.correctChars, elapsedMs)
  const unproductive = computeUnproductivePercent(ui.typedKeystrokes, ui.incorrect, ui.collateral, ui.backspaces)

  const progress = useMemo(() => {
    const total = segmentText.length
    if (total <= 0) return 0
    return Math.min(100, Math.max(0, (ui.cursor / total) * 100))
  }, [segmentText.length, ui.cursor])

  const editorFontSize = settings.editorFontSize
  const editorLineHeight = useMemo(() => Math.max(16, Math.round(editorFontSize * 1.35)), [editorFontSize])

  const editorOptions = useMemo<Monaco.editor.IStandaloneEditorConstructionOptions>(() => ({
    readOnly: true,
    domReadOnly: true,
    // We render our own cursor/position indicator via decorations/content widgets.
    // Hide Monaco's native cursor to avoid occasional focus-related "ghost" caret rendering.
    cursorWidth: 0,
    hideCursorInOverviewRuler: true,
    minimap: { enabled: false },
    scrollBeyondLastLine: false,
    wordWrap: 'off',
    renderWhitespace: 'all',
    renderLineHighlight: 'none',
    renderValidationDecorations: 'off',
    occurrencesHighlight: 'off',
    selectionHighlight: false,
    folding: false,
    bracketPairColorization: { enabled: false },
    guides: { bracketPairs: false },
    matchBrackets: 'never',
    glyphMargin: false,
    overviewRulerBorder: false,
    overviewRulerLanes: 0,
    hover: { enabled: false },
    parameterHints: { enabled: false },
    quickSuggestions: false,
    suggestOnTriggerCharacters: false,
    contextmenu: false,
    unicodeHighlight: {
      ambiguousCharacters: false,
      invisibleCharacters: false,
      nonBasicASCII: false,
    },
  }), [])

  useEffect(() => {
    const editor = editorRef.current
    if (!editor) return

    editor.updateOptions({
      fontSize: editorFontSize,
      lineHeight: editorLineHeight,
    })
    scheduleEditorLayout('fontSize')
    lastRevealCursorRef.current = -1
    applyDecorations()
  }, [applyDecorations, editorFontSize, editorLineHeight, scheduleEditorLayout])

  useEffect(() => {
    scheduleEditorLayout('textAlign')
  }, [scheduleEditorLayout, settings.textAlign])

  useEffect(() => {
    applyDecorations()
  }, [applyDecorations, monacoTheme])

  useEffect(() => {
    const editor = editorRef.current
    const monaco = monacoRef.current
    const model = editor?.getModel()
    if (!editor || !monaco || !model) return

    monaco.editor.setModelMarkers(model, 'typescript', [])
    monaco.editor.setModelMarkers(model, 'javascript', [])
    monaco.editor.setModelMarkers(model, 'tt', [])
  }, [segmentText])

  const applySettings = useCallback(() => {
    const next = normalizeTypingSettings(draftSettings)
    setSettingsOpened(false)
    onUpdateSettings(next)
  }, [draftSettings, onUpdateSettings])

  const segmentLabel = segments.length === 0 ? '0/0' : `${segmentIndex + 1}/${segments.length}`
  const totalChars = segmentText.length

  return (
    <div className="tt-page h-full flex flex-col">
      <header className="tt-panel shrink-0 border-b">
        <div className="flex items-center gap-3 px-3 py-2">
          <Button size="xs" variant="subtle" onClick={onBack}>Back</Button>

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 min-w-0">
              <Text fw={600} className="truncate" title={file.filePath}>
                {file.fileName}
              </Text>
              <Button size="xs" variant="light" onClick={copyFilePath}>Copy path</Button>
            </div>
            <Text size="xs" c="dimmed" className="truncate" title={file.filePath}>
              {file.filePath}
            </Text>
          </div>

          <Group gap={6} wrap="nowrap">
            <Badge variant="light">Seg {segmentLabel}</Badge>
            {segment && <Badge variant="light">Lines {segment.startLine}-{segment.endLine}</Badge>}
            <Badge variant="light">Enc {file.encoding}</Badge>
          </Group>

          <Group gap={6} wrap="nowrap">
            <Button
              size="xs"
              variant="light"
              disabled={segmentIndex <= 0}
              onClick={() => onChangeSegment(Math.max(0, segmentIndex - 1))}
            >
              Prev
            </Button>
            <Button
              size="xs"
              variant="light"
              disabled={segmentIndex >= segments.length - 1}
              onClick={() => onChangeSegment(Math.min(segments.length - 1, segmentIndex + 1))}
            >
              Next
            </Button>
            <Button size="xs" variant="default" onClick={resetEngine}>Restart (Ctrl+R)</Button>
            <Button size="xs" variant="default" onClick={() => setSettingsOpened(true)}>Settings</Button>
            <ThemeToggle size="xs" variant="default" />
          </Group>
        </div>

        <div className="px-3 pb-3">
          <Progress value={progress} size="sm" radius="xl" />
          <div className="tt-muted mt-1 flex items-center justify-between text-xs">
            <span>{totalChars === 0 ? 'Empty segment' : `${ui.cursor}/${totalChars} chars`}</span>
            <span>Ctrl+←/→ segment · Ctrl+R restart</span>
          </div>
        </div>

        {ui.locked && (
          <div className="px-3 pb-3">
            <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-200">
              Locked: backspace to fix the first mistake.
            </div>
          </div>
        )}
      </header>

      <div className="tt-panel shrink-0 border-b px-3 py-3">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-6">
          <div className="tt-panel rounded-md border px-3 py-2">
            <div className="tt-muted text-xs">WPM</div>
            <div className="font-mono text-lg">{wpm.toFixed(1)}</div>
          </div>
          <div className="tt-panel rounded-md border px-3 py-2">
            <div className="tt-muted text-xs">Unproductive%</div>
            <div className="font-mono text-lg">{unproductive.toFixed(1)}</div>
          </div>
          <div className="tt-panel rounded-md border px-3 py-2">
            <div className="tt-muted text-xs">incorrect</div>
            <div className="font-mono text-lg">{ui.incorrect}</div>
          </div>
          <div className="tt-panel rounded-md border px-3 py-2">
            <div className="tt-muted text-xs">collateral</div>
            <div className="font-mono text-lg">{ui.collateral}</div>
          </div>
          <div className="tt-panel rounded-md border px-3 py-2">
            <div className="tt-muted text-xs">backspaces</div>
            <div className="font-mono text-lg">{ui.backspaces}</div>
          </div>
          <div className="tt-panel rounded-md border px-3 py-2">
            <div className="tt-muted text-xs">elapsed</div>
            <div className="font-mono text-lg">{formatElapsed(elapsedMs)}</div>
          </div>
        </div>
      </div>

      <div
        className={`tt-monacoContainer tt-monacoContainer--${settings.textAlign}`}
        onMouseDownCapture={focusInputSoon}
        onClick={focusInputSoon}
      >
        <textarea
          ref={inputRef}
          className="tt-hiddenInput"
          onKeyDown={handleKeyDown}
          onInput={handleInput}
          onCompositionStart={handleCompositionStart}
          onCompositionEnd={handleCompositionEnd}
          onPaste={handlePaste}
          spellCheck={false}
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
        />
        <div ref={monacoContainerRef} className="tt-monacoFrame">
          <MonacoReadonly value={segmentText} onMount={onMount} beforeMount={beforeMount} options={editorOptions} theme={monacoTheme} />
        </div>
      </div>

      <Drawer opened={settingsOpened} onClose={() => setSettingsOpened(false)} title="Settings" position="right" size="sm">
        <Stack gap="md">
          <NumberInput
            label="Lines per segment"
            value={draftSettings.linesPerSegment}
            min={1}
            max={5000}
            onChange={(value) => setDraftSettings((prev) => ({ ...prev, linesPerSegment: coerceInt(value, prev.linesPerSegment) }))}
          />
          <Switch
            label="Auto-skip blank lines"
            description="When pressing Enter on blank lines, automatically skip consecutive newlines."
            checked={draftSettings.autoSkipBlankLines}
            onChange={(event) => setDraftSettings((prev) => ({ ...prev, autoSkipBlankLines: event.currentTarget.checked }))}
          />
          <NumberInput
            label="Slack N"
            value={draftSettings.slackN}
            min={0}
            max={50}
            onChange={(value) => setDraftSettings((prev) => ({ ...prev, slackN: coerceInt(value, prev.slackN) }))}
          />
          <NumberInput
            label="Tab width"
            value={draftSettings.tabWidth}
            min={0}
            max={16}
            onChange={(value) => setDraftSettings((prev) => ({ ...prev, tabWidth: coerceInt(value, prev.tabWidth) }))}
          />
          <Switch
            label="Skip leading indentation"
            description="Do not type spaces at the start of each line."
            checked={draftSettings.skipLeadingIndentation}
            onChange={(event) => setDraftSettings((prev) => ({ ...prev, skipLeadingIndentation: event.currentTarget.checked }))}
          />
          <Switch
            label="Trim trailing whitespace"
            description="Do not type spaces/tabs at the end of each line."
            checked={draftSettings.trimTrailingWhitespace}
            onChange={(event) => setDraftSettings((prev) => ({ ...prev, trimTrailingWhitespace: event.currentTarget.checked }))}
          />
          <Switch
            label="Show debug overlay"
            description="Shows perf timings (key handling / decorations / render count) for diagnosing input lag. Shortcut: Ctrl+Shift+D."
            checked={draftSettings.showDebugOverlay}
            onChange={(event) => setDraftSettings((prev) => ({ ...prev, showDebugOverlay: event.currentTarget.checked }))}
          />
          <Select
            label="Comments"
            description="Changing this reloads segments for the current file."
            value={draftSettings.includeComments ? 'type' : 'skip'}
            data={[
              { value: 'skip', label: 'Skip comments (show but don’t type)' },
              { value: 'type', label: 'Type comments' },
            ]}
            onChange={(value) => {
              if (value === 'type') setDraftSettings((prev) => ({ ...prev, includeComments: true }))
              else if (value === 'skip') setDraftSettings((prev) => ({ ...prev, includeComments: false }))
            }}
          />
          <NumberInput
            label="Editor font size"
            value={draftSettings.editorFontSize}
            min={10}
            max={32}
            onChange={(value) => setDraftSettings((prev) => ({ ...prev, editorFontSize: coerceInt(value, prev.editorFontSize) }))}
          />
          <Select
            label="Text alignment"
            value={draftSettings.textAlign}
            data={[
              { value: 'left', label: 'Left' },
              { value: 'center', label: 'Center' },
              { value: 'right', label: 'Right' },
            ]}
            onChange={(value) => {
              if (value === 'left' || value === 'center' || value === 'right') {
                setDraftSettings((prev) => ({ ...prev, textAlign: value }))
              }
            }}
          />
          <NumberInput
            label="Max segment chars"
            description="Hard cap to keep Monaco responsive; segments split smaller if exceeded."
            value={draftSettings.maxSegmentChars}
            min={500}
            max={500000}
            step={500}
            onChange={(value) => setDraftSettings((prev) => ({ ...prev, maxSegmentChars: coerceInt(value, prev.maxSegmentChars) }))}
          />

          <Group justify="flex-end">
            <Button variant="default" onClick={() => setSettingsOpened(false)}>Cancel</Button>
            <Button onClick={applySettings}>Apply</Button>
          </Group>
        </Stack>
      </Drawer>

      {settings.showDebugOverlay && (
        <div className="tt-perfOverlay">
          <div className="tt-perfTitle">Debug: perf overlay</div>
          <div>lastKeyHandlingMs: {perfRef.current.lastKeyHandlingMs.toFixed(2)}</div>
          <div>lastDecorationUpdateMs: {perfRef.current.lastDecorationUpdateMs.toFixed(2)}</div>
          <div>reactRenderCount: {renderCountRef.current}</div>
          <div>decorationCount: {perfRef.current.lastDecorationCount}</div>
          <div>key→renderMs: {perfRef.current.lastRenderLatencyMs.toFixed(2)}</div>
        </div>
      )}
    </div>
  )
}
