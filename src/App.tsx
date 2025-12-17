import { useCallback, useEffect, useRef, useState } from 'react'
import type { Attempt, OpenFileResult, TextSegment, TypingSettings } from './shared/types'
import { DEFAULT_TYPING_SETTINGS, normalizeTypingSettings } from './shared/typingSettings'
import { Home } from './pages/Home'
import { Loading } from './pages/Loading'
import { Typing } from './pages/Typing'
import { Summary } from './pages/Summary'
import { Analytics } from './pages/Analytics'

type TypingSession = {
  file: OpenFileResult
  segments: TextSegment[]
  settings: TypingSettings
  segmentIndex: number
}

type Route =
  | { name: 'home' }
  | { name: 'loading'; file: OpenFileResult; settings: TypingSettings }
  | { name: 'typing'; session: TypingSession }
  | { name: 'summary'; session: TypingSession; attempt: Attempt }
  | { name: 'analytics' }

const SETTINGS_STORAGE_KEY = 'typing-trainer-typing-settings'

const CODE_DEFAULT_EXCLUDE_COMMENT_EXTS = new Set([
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
  'py',
  'swift',
  'php',
  'rb',
  'scala',
  'm',
  'mm',
  'sql',
])

function getFileExtensionLower(fileName: string): string {
  const lower = fileName.toLowerCase()
  const dot = lower.lastIndexOf('.')
  return dot >= 0 ? lower.slice(dot + 1) : ''
}

function defaultIncludeCommentsForFile(fileName: string): boolean {
  const ext = getFileExtensionLower(fileName)
  if (CODE_DEFAULT_EXCLUDE_COMMENT_EXTS.has(ext)) return false
  return true
}

export default function App() {
  const [route, setRoute] = useState<Route>({ name: 'home' })
  const [settings, setSettings] = useState<TypingSettings>(() => {
    try {
      const raw = localStorage.getItem(SETTINGS_STORAGE_KEY)
      if (!raw) return DEFAULT_TYPING_SETTINGS
      return normalizeTypingSettings(JSON.parse(raw) as Partial<TypingSettings>)
    } catch {
      return DEFAULT_TYPING_SETTINGS
    }
  })
  const segmenterWorkerRef = useRef<Worker | null>(null)
  const segmentRequestIdRef = useRef<string | null>(null)

  useEffect(() => {
    try {
      localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings))
    } catch {
      // ignore (quota, disabled storage, etc.)
    }
  }, [settings])

  useEffect(() => {
    return () => {
      segmenterWorkerRef.current?.terminate()
      segmenterWorkerRef.current = null
    }
  }, [])

  const getSegmenterWorker = useCallback((): Worker => {
    if (segmenterWorkerRef.current) return segmenterWorkerRef.current
    segmenterWorkerRef.current = new Worker(new URL('./workers/segmenter.worker.ts', import.meta.url), { type: 'module' })
    return segmenterWorkerRef.current
  }, [])

  const startSession = useCallback((file: OpenFileResult, overrideSettings?: TypingSettings) => {
    const baseSettings = overrideSettings ?? settings
    const sessionSettings = overrideSettings
      ? baseSettings
      : { ...baseSettings, includeComments: defaultIncludeCommentsForFile(file.fileName) }
    const requestId = crypto.randomUUID()
    segmentRequestIdRef.current = requestId

    setRoute({ name: 'loading', file, settings: sessionSettings })

    type SegmentWorkerResponse =
      | { id: string; segments: TextSegment[] }
      | { id: string; error: string }

    const worker = getSegmenterWorker()
    worker.onmessage = (event: MessageEvent<SegmentWorkerResponse>) => {
      const payload = event.data
      if (payload.id !== segmentRequestIdRef.current) return

      segmentRequestIdRef.current = null
      if ('error' in payload) {
        console.error('Failed to segment file:', payload.error)
        setRoute({ name: 'home' })
        return
      }

      setRoute({
        name: 'typing',
        session: { file, segments: payload.segments, settings: sessionSettings, segmentIndex: 0 },
      })
    }
    worker.onerror = (event) => {
      console.error('Segment worker failed:', event)
      if (segmentRequestIdRef.current === requestId) segmentRequestIdRef.current = null
      setRoute({ name: 'home' })
    }

    worker.postMessage({
      id: requestId,
      content: file.content,
      fileName: file.fileName,
      linesPerSegment: sessionSettings.linesPerSegment,
      tabWidth: sessionSettings.tabWidth,
      maxSegmentChars: sessionSettings.maxSegmentChars,
      includeComments: sessionSettings.includeComments,
    })
  }, [getSegmenterWorker, settings])

  function cancelLoading() {
    segmentRequestIdRef.current = null
    setRoute({
      name: 'home',
    })
  }

  useEffect(() => {
    return window.api.onFileOpened((file) => {
      startSession(file)
    })
  }, [startSession])

  if (route.name === 'loading') {
    return (
      <Loading
        fileName={route.file.fileName}
        onCancel={cancelLoading}
      />
    )
  }

  if (route.name === 'typing') {
    return (
      <Typing
        file={route.session.file}
        segments={route.session.segments}
        settings={route.session.settings}
        segmentIndex={route.session.segmentIndex}
        onBack={() => setRoute({ name: 'home' })}
        onUpdateSettings={(next) => {
          setSettings(next)

          const prevSettings = route.session.settings
          const requiresResegment = (
            prevSettings.linesPerSegment !== next.linesPerSegment
            || prevSettings.tabWidth !== next.tabWidth
            || prevSettings.maxSegmentChars !== next.maxSegmentChars
            || prevSettings.includeComments !== next.includeComments
          )

          if (requiresResegment) {
            startSession(route.session.file, next)
            return
          }

          setRoute((prev) => {
            if (prev.name !== 'typing') return prev
            return { name: 'typing', session: { ...prev.session, settings: next } }
          })
        }}
        onChangeSegment={(segmentIndex) => {
          setRoute((prev) => {
            if (prev.name !== 'typing') return prev
            return { name: 'typing', session: { ...prev.session, segmentIndex } }
          })
        }}
        onComplete={(attempt) => {
          setRoute((prev) => {
            if (prev.name !== 'typing') return prev
            return { name: 'summary', session: prev.session, attempt }
          })
        }}
      />
    )
  }

  if (route.name === 'summary') {
    const { session, attempt } = route
    return (
      <Summary
        attempt={attempt}
        hasPrev={session.segmentIndex > 0}
        hasNext={session.segmentIndex < session.segments.length - 1}
        onHome={() => setRoute({ name: 'home' })}
        onAnalytics={() => setRoute({ name: 'analytics' })}
        onRetry={() => setRoute({ name: 'typing', session })}
        onPrev={() => setRoute({ name: 'typing', session: { ...session, segmentIndex: Math.max(0, session.segmentIndex - 1) } })}
        onNext={() => setRoute({ name: 'typing', session: { ...session, segmentIndex: Math.min(session.segments.length - 1, session.segmentIndex + 1) } })}
      />
    )
  }

  if (route.name === 'analytics') {
    return <Analytics onHome={() => setRoute({ name: 'home' })} />
  }

  return <Home onOpen={startSession} onAnalytics={() => setRoute({ name: 'analytics' })} />
}
