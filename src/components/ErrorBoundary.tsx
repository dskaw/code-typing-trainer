import { Button, Container, Stack, Text, Title } from '@mantine/core'
import { Component, type ReactNode } from 'react'

type ErrorBoundaryProps = {
  children: ReactNode
}

type ErrorBoundaryState = {
  error: Error | null
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error }
  }

  componentDidCatch(error: Error) {
    console.error('Renderer crashed:', error)
  }

  render() {
    if (!this.state.error) return this.props.children

    return (
      <Container size="sm" py="xl">
        <Stack gap="md">
          <Title order={2}>Something went wrong</Title>
          <Text c="dimmed">
            The UI crashed. You can reload the window to recover.
          </Text>
          <Button onClick={() => window.location.reload()}>Reload</Button>
          <Text size="xs" c="dimmed" style={{ whiteSpace: 'pre-wrap' }}>
            {this.state.error.stack ?? this.state.error.message}
          </Text>
        </Stack>
      </Container>
    )
  }
}
