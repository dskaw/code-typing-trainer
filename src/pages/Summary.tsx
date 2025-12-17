import { Alert, Badge, Button, Container, Group, SimpleGrid, Stack, Text, Title } from '@mantine/core'
import { useEffect, useState } from 'react'
import { ThemeToggle } from '../components/ThemeToggle'
import type { Attempt } from '../shared/types'

type SummaryProps = {
  attempt: Attempt
  hasPrev: boolean
  hasNext: boolean
  onPrev: () => void
  onNext: () => void
  onRetry: () => void
  onHome: () => void
  onAnalytics: () => void
}

function formatDuration(ms: number) {
  const totalSeconds = Math.floor(ms / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}

export function Summary({ attempt, hasPrev, hasNext, onPrev, onNext, onRetry, onHome, onAnalytics }: SummaryProps) {
  const [saveState, setSaveState] = useState<'saving' | 'saved' | 'error'>('saving')
  const [saveError, setSaveError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setSaveState('saving')
    setSaveError(null)

    window.api.saveAttempt(attempt)
      .then(() => {
        if (!cancelled) setSaveState('saved')
      })
      .catch((err) => {
        if (cancelled) return
        setSaveState('error')
        setSaveError(err instanceof Error ? err.message : String(err))
      })

    return () => {
      cancelled = true
    }
  }, [attempt])

  return (
    <Container size="md" py="lg">
      <Stack gap="md">
        <Group justify="space-between" wrap="wrap">
          <Group>
            <Button variant="subtle" onClick={onHome}>Home</Button>
            <Button variant="light" onClick={onAnalytics}>Analytics</Button>
          </Group>

          <Group gap="sm">
            <ThemeToggle size="xs" variant="default" />
            <Badge
              color={saveState === 'saved' ? 'green' : saveState === 'error' ? 'red' : 'gray'}
              variant="light"
            >
              {saveState === 'saving' && 'Saving...'}
              {saveState === 'saved' && 'Saved'}
              {saveState === 'error' && 'Save failed'}
            </Badge>
          </Group>
        </Group>

        {saveError && (
          <Alert color="red" title="Save failed">
            {saveError}
          </Alert>
        )}

        <div>
          <Title order={2}>Summary</Title>
          <Text c="dimmed" mt={4}>
            <strong>{attempt.fileName}</strong> - Segment {attempt.segmentIndex + 1} - lines {attempt.segmentStartLine}-{attempt.segmentEndLine}
          </Text>
        </div>

        <SimpleGrid cols={{ base: 2, sm: 4 }} spacing="md">
          <div className="tt-panel rounded-md border px-3 py-2">
            <div className="tt-muted text-xs">WPM</div>
            <div className="font-mono text-lg">{attempt.wpm.toFixed(1)}</div>
          </div>
          <div className="tt-panel rounded-md border px-3 py-2">
            <div className="tt-muted text-xs">Unproductive%</div>
            <div className="font-mono text-lg">{attempt.unproductivePercent.toFixed(1)}</div>
          </div>
          <div className="tt-panel rounded-md border px-3 py-2">
            <div className="tt-muted text-xs">Duration</div>
            <div className="font-mono text-lg">{formatDuration(attempt.durationMs)}</div>
          </div>
          <div className="tt-panel rounded-md border px-3 py-2">
            <div className="tt-muted text-xs">Correct chars</div>
            <div className="font-mono text-lg">{attempt.correctChars}</div>
          </div>
        </SimpleGrid>

        <Group wrap="wrap">
          <Button onClick={onRetry}>Retry</Button>
          <Button variant="light" disabled={!hasPrev} onClick={onPrev}>Prev Segment</Button>
          <Button variant="light" disabled={!hasNext} onClick={onNext}>Next Segment</Button>
        </Group>

        <Group gap="xl" wrap="wrap">
          <Text size="sm"><strong>typedKeystrokes</strong>: {attempt.typedKeystrokes}</Text>
          <Text size="sm"><strong>incorrect</strong>: {attempt.incorrect}</Text>
          <Text size="sm"><strong>collateral</strong>: {attempt.collateral}</Text>
          <Text size="sm"><strong>backspaces</strong>: {attempt.backspaces}</Text>
        </Group>
      </Stack>
    </Container>
  )
}
