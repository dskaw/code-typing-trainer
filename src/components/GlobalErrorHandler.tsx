import { notifications } from '@mantine/notifications'
import { useEffect } from 'react'

function isResizeObserverNoise(message: string): boolean {
  const m = message.toLowerCase()
  return (
    m.includes('resizeobserver loop limit exceeded')
    || m.includes('resizeobserver loop completed with undelivered notifications')
  )
}

function formatReason(reason: unknown): string {
  if (reason instanceof Error) return reason.message
  if (typeof reason === 'string') return reason
  try {
    return JSON.stringify(reason)
  } catch {
    return String(reason)
  }
}

export function GlobalErrorHandler() {
  useEffect(() => {
    const onError = (event: ErrorEvent) => {
      const message = event.error instanceof Error ? event.error.message : event.message
      if (message && isResizeObserverNoise(message)) {
        console.warn('window.onerror (ignored ResizeObserver noise):', message)
        return
      }

      console.error('window.onerror:', event.error ?? event.message)
      notifications.show({
        color: 'red',
        title: 'Unhandled error',
        message: message || 'An unknown error occurred.',
      })
    }

    const onUnhandledRejection = (event: PromiseRejectionEvent) => {
      const reasonText = formatReason(event.reason)
      if (reasonText && isResizeObserverNoise(reasonText)) {
        console.warn('unhandledrejection (ignored ResizeObserver noise):', reasonText)
        return
      }

      console.error('unhandledrejection:', event.reason)
      notifications.show({
        color: 'red',
        title: 'Unhandled promise rejection',
        message: reasonText,
      })
    }

    window.addEventListener('error', onError)
    window.addEventListener('unhandledrejection', onUnhandledRejection)
    return () => {
      window.removeEventListener('error', onError)
      window.removeEventListener('unhandledrejection', onUnhandledRejection)
    }
  }, [])

  return null
}
