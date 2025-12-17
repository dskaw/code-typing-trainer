import { Alert, Button, Container, Group, Stack, Text, Title } from '@mantine/core'
import { useState } from 'react'
import { ThemeToggle } from '../components/ThemeToggle'
import type { OpenFileResult } from '../shared/types'

type HomeProps = {
  onOpen: (file: OpenFileResult) => void
  onAnalytics: () => void
}

export function Home({ onOpen, onAnalytics }: HomeProps) {
  const [error, setError] = useState<string | null>(null)

  async function handleOpen() {
    setError(null)
    try {
      const result = await window.api.openFile()
      if (result) onOpen(result)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  return (
    <Container size="sm" py="xl">
      <Stack gap="md">
        <div>
          <Title order={2}>CodeTyping Trainer</Title>
          <Text c="dimmed" mt={4}>
            Open a local text/code file to start practicing. The app is fully offline (no telemetry, no network calls).
          </Text>
        </div>

        <Group>
          <Button onClick={handleOpen}>Open File (Ctrl+O)</Button>
          <Button variant="light" onClick={onAnalytics}>Analytics</Button>
          <ThemeToggle variant="default" />
        </Group>

        {error && (
          <Alert color="red" title="Open failed">
            {error}
          </Alert>
        )}
      </Stack>
    </Container>
  )
}
