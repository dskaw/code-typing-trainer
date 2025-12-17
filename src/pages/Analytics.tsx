import { Alert, Badge, Button, Card, Container, Group, Stack, Text, TextInput, Title } from '@mantine/core'
import { useEffect, useMemo, useState } from 'react'
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { ThemeToggle } from '../components/ThemeToggle'
import type { Attempt } from '../shared/types'

type AnalyticsProps = {
  onHome: () => void
}

type LoadState =
  | { status: 'loading' }
  | { status: 'loaded'; attempts: Attempt[] }
  | { status: 'error'; message: string }

function formatDateTime(ms: number) {
  const d = new Date(ms)
  return d.toLocaleString()
}

function formatTimeTick(ms: number) {
  const d = new Date(ms)
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  return `${hh}:${mm}`
}

function formatTooltipLabel(ms: unknown) {
  const value = typeof ms === 'number' ? ms : Number(ms)
  return Number.isFinite(value) ? formatDateTime(value) : String(ms)
}

export function Analytics({ onHome }: AnalyticsProps) {
  const [state, setState] = useState<LoadState>({ status: 'loading' })
  const [filter, setFilter] = useState('')
  const [expandedId, setExpandedId] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setState({ status: 'loading' })

    window.api.listAttempts()
      .then((attempts) => {
        if (cancelled) return
        setState({ status: 'loaded', attempts })
      })
      .catch((err) => {
        if (cancelled) return
        setState({ status: 'error', message: err instanceof Error ? err.message : String(err) })
      })

    return () => {
      cancelled = true
    }
  }, [])

  const filteredAttempts = useMemo(() => {
    const attempts = state.status === 'loaded' ? state.attempts : []
    const q = filter.trim().toLowerCase()
    if (!q) return attempts
    return attempts.filter((a) => a.fileName.toLowerCase().includes(q))
  }, [state, filter])

  const series = useMemo(() => {
    return filteredAttempts
      .slice()
      .sort((a, b) => a.endAtMs - b.endAtMs)
      .map((a) => ({
        t: a.endAtMs,
        wpm: a.wpm,
        unproductive: a.unproductivePercent,
      }))
  }, [filteredAttempts])

  return (
    <Container size="lg" py="lg" className="h-full">
      <Stack gap="md" className="h-full">
        <Group justify="space-between" align="flex-end" wrap="wrap">
          <Group>
            <Button variant="subtle" onClick={onHome}>Home</Button>
            <Title order={2} m={0}>Analytics</Title>
            <Badge variant="light">{filteredAttempts.length} attempts</Badge>
          </Group>

          <Group align="flex-end" wrap="nowrap">
            <TextInput
              label="Filter (file name)"
              value={filter}
              onChange={(e) => setFilter(e.currentTarget.value)}
              placeholder="e.g. README"
              w={260}
            />
            <ThemeToggle size="xs" variant="default" />
          </Group>
        </Group>

        {state.status === 'error' && (
          <Alert color="red" title="Failed to load attempts">
            {state.message}
          </Alert>
        )}

        <div className="grid grid-cols-1 gap-3">
          <Card withBorder padding="md">
            <Group justify="space-between" mb="xs">
              <Text fw={600}>WPM over time</Text>
              {state.status === 'loading' && <Text size="xs" c="dimmed">Loading...</Text>}
            </Group>
            <div style={{ height: 220 }}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={series} margin={{ top: 10, right: 16, bottom: 8, left: 0 }}>
                  <CartesianGrid strokeDasharray="4 4" />
                  <XAxis
                    dataKey="t"
                    type="number"
                    scale="time"
                    tickFormatter={formatTimeTick}
                    domain={['dataMin', 'dataMax']}
                  />
                  <YAxis />
                  <Tooltip labelFormatter={formatTooltipLabel} />
                  <Line type="monotone" dataKey="wpm" stroke="#2563eb" dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </Card>

          <Card withBorder padding="md">
            <Text fw={600} mb="xs">Unproductive% over time</Text>
            <div style={{ height: 220 }}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={series} margin={{ top: 10, right: 16, bottom: 8, left: 0 }}>
                  <CartesianGrid strokeDasharray="4 4" />
                  <XAxis
                    dataKey="t"
                    type="number"
                    scale="time"
                    tickFormatter={formatTimeTick}
                    domain={['dataMin', 'dataMax']}
                  />
                  <YAxis domain={[0, 100]} />
                  <Tooltip labelFormatter={formatTooltipLabel} />
                  <Line type="monotone" dataKey="unproductive" stroke="#f59e0b" dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </Card>
        </div>

        <div className="tt-border min-h-0 overflow-auto border-t pt-3">
          <Group justify="space-between" mb="xs">
            <Text fw={600}>Attempts</Text>
            {state.status === 'loading' && <Text size="xs" c="dimmed">Loading...</Text>}
          </Group>

          {filteredAttempts.length === 0 && state.status === 'loaded' && (
            <Text size="sm" c="dimmed">
              No attempts yet. Finish a segment to create one.
            </Text>
          )}

          <Stack gap="xs">
            {filteredAttempts.map((a) => {
              const expanded = expandedId === a.id
              return (
                <Card key={a.id} withBorder padding="sm">
                  <button
                    type="button"
                    onClick={() => setExpandedId(expanded ? null : a.id)}
                    className="w-full text-left"
                  >
                    <Group justify="space-between" align="flex-start" wrap="wrap">
                      <div>
                        <Text fw={600}>{a.fileName}</Text>
                        <Text size="xs" c="dimmed">{formatDateTime(a.endAtMs)}</Text>
                      </div>

                      <Group gap="md" wrap="wrap">
                        <Text size="sm"><strong>WPM</strong> {a.wpm.toFixed(1)}</Text>
                        <Text size="sm"><strong>Unprod%</strong> {a.unproductivePercent.toFixed(1)}</Text>
                        <Text size="sm"><strong>Seg</strong> {a.segmentIndex + 1}</Text>
                      </Group>
                    </Group>
                  </button>

                      {expanded && (
                    <Stack gap={4} mt="sm">
                      <Text size="sm"><strong>filePath</strong>: <span className="tt-muted">{a.filePath}</span></Text>
                      <Text size="sm"><strong>lines</strong>: {a.segmentStartLine}-{a.segmentEndLine}</Text>
                      <Text size="sm"><strong>durationMs</strong>: {a.durationMs}</Text>
                      <Group gap="md" wrap="wrap" mt={4}>
                        <Text size="sm"><strong>typeableChars</strong>: {a.typeableChars}</Text>
                        <Text size="sm"><strong>correctChars</strong>: {a.correctChars}</Text>
                        <Text size="sm"><strong>typedKeystrokes</strong>: {a.typedKeystrokes}</Text>
                      </Group>
                      <Group gap="md" wrap="wrap" mt={4}>
                        <Text size="sm"><strong>incorrect</strong>: {a.incorrect}</Text>
                        <Text size="sm"><strong>collateral</strong>: {a.collateral}</Text>
                        <Text size="sm"><strong>backspaces</strong>: {a.backspaces}</Text>
                      </Group>
                      <Text size="sm" mt={4}>
                        <strong>settings</strong>: linesPerSegment={a.linesPerSegment}, tabWidth={a.tabWidth}, slackN={a.slackN}
                      </Text>
                    </Stack>
                  )}
                </Card>
              )
            })}
          </Stack>
        </div>
      </Stack>
    </Container>
  )
}
