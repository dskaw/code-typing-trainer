import { Alert, Badge, Button, Card, Container, Divider, Group, Stack, Text, TextInput, Title, Collapse } from '@mantine/core'
import { notifications } from '@mantine/notifications'
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

  const copyText = async (label: string, value: string) => {
    try {
      await navigator.clipboard.writeText(value)
      notifications.show({ color: 'green', message: `Copied ${label}` })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      notifications.show({ color: 'red', title: 'Copy failed', message })
    }
  }

  return (
    <Container size="lg" py="lg">
      <Stack gap="md">
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

        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          <Card withBorder padding="md">
            <Group justify="space-between" mb="xs">
              <Text fw={600}>WPM over time</Text>
              {state.status === 'loading' && <Text size="xs" c="dimmed">Loading...</Text>}
            </Group>
            <div style={{ height: 240 }}>
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
            <Group justify="space-between" mb="xs">
              <Text fw={600}>Unproductive% over time</Text>
              {state.status === 'loading' && <Text size="xs" c="dimmed">Loading...</Text>}
            </Group>
            <div style={{ height: 240 }}>
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

        <Divider />

        <Stack gap="sm">
          <Group justify="space-between" align="flex-end" wrap="wrap">
            <div>
              <Text fw={700}>Attempts</Text>
              <Text size="sm" c="dimmed">
                Browse attempts below (page scroll). Use the filter above to narrow by file name.
              </Text>
            </div>
            {state.status === 'loading' && <Text size="xs" c="dimmed">Loading...</Text>}
          </Group>

          {filteredAttempts.length === 0 && state.status === 'loaded' && (
            <Text size="sm" c="dimmed">
              No attempts yet. Finish a segment to create one.
            </Text>
          )}

          <Stack gap="md">
            {filteredAttempts.map((a) => {
              const expanded = expandedId === a.id
              const detailsJson = JSON.stringify(a, null, 2)
              return (
                <Card
                  key={a.id}
                  withBorder
                  padding="md"
                  style={{ cursor: 'pointer' }}
                  onClick={() => setExpandedId(expanded ? null : a.id)}
                >
                  <Group justify="space-between" align="flex-start" wrap="wrap" gap="md">
                    <div className="min-w-0">
                      <Group gap="sm" wrap="wrap">
                        <Text fw={700}>{a.fileName}</Text>
                        <Badge variant="light">Seg {a.segmentIndex + 1}</Badge>
                        <Badge variant="light">Lines {a.segmentStartLine}-{a.segmentEndLine}</Badge>
                        <Badge variant="light">{formatDateTime(a.endAtMs)}</Badge>
                      </Group>
                      <Text
                        size="xs"
                        c="dimmed"
                        className="truncate"
                        title={a.filePath}
                        mt={6}
                      >
                        {a.filePath}
                      </Text>
                    </div>

                    <Group gap="md" wrap="wrap" justify="flex-end">
                      <Text size="sm"><strong>WPM</strong> {a.wpm.toFixed(1)}</Text>
                      <Text size="sm"><strong>Unprod%</strong> {a.unproductivePercent.toFixed(1)}</Text>
                      <Text size="sm"><strong>Duration</strong> {(a.durationMs / 1000).toFixed(1)}s</Text>
                      <Button
                        size="xs"
                        variant="light"
                        onClick={(e) => {
                          e.stopPropagation()
                          setExpandedId(expanded ? null : a.id)
                        }}
                      >
                        {expanded ? 'Hide details' : 'Details'}
                      </Button>
                    </Group>
                  </Group>

                  <Collapse in={expanded}>
                    <Divider my="sm" />
                    <Stack gap="xs">
                      <Group gap="sm" wrap="wrap">
                        <Button
                          size="xs"
                          variant="default"
                          onClick={(e) => {
                            e.stopPropagation()
                            void copyText('file path', a.filePath)
                          }}
                        >
                          Copy path
                        </Button>
                        <Button
                          size="xs"
                          variant="default"
                          onClick={(e) => {
                            e.stopPropagation()
                            void copyText('JSON', detailsJson)
                          }}
                        >
                          Copy JSON
                        </Button>
                      </Group>

                      <Text size="sm" style={{ overflowWrap: 'anywhere' }}>
                        <strong>filePath</strong>: <span className="tt-muted">{a.filePath}</span>
                      </Text>

                      <Group gap="md" wrap="wrap">
                        <Text size="sm"><strong>typeableChars</strong>: {a.typeableChars}</Text>
                        <Text size="sm"><strong>correctChars</strong>: {a.correctChars}</Text>
                        <Text size="sm"><strong>typedKeystrokes</strong>: {a.typedKeystrokes}</Text>
                      </Group>
                      <Group gap="md" wrap="wrap">
                        <Text size="sm"><strong>incorrect</strong>: {a.incorrect}</Text>
                        <Text size="sm"><strong>collateral</strong>: {a.collateral}</Text>
                        <Text size="sm"><strong>backspaces</strong>: {a.backspaces}</Text>
                      </Group>
                      <Text size="sm">
                        <strong>settings</strong>: linesPerSegment={a.linesPerSegment}, tabWidth={a.tabWidth}, slackN={a.slackN}
                      </Text>

                      <Text fw={600} size="sm" mt="xs">Raw JSON</Text>
                      <pre
                        className="tt-panel tt-border rounded-md border px-3 py-2 text-xs"
                        style={{ margin: 0, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}
                        onClick={(e) => e.stopPropagation()}
                      >
                        {detailsJson}
                      </pre>
                    </Stack>
                  </Collapse>
                </Card>
              )
            })}
          </Stack>
        </Stack>
      </Stack>
    </Container>
  )
}
