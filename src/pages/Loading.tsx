import { Button, Container, Group, Loader, Stack, Text, Title } from '@mantine/core'
import { ThemeToggle } from '../components/ThemeToggle'

type LoadingProps = {
  fileName: string
  onCancel: () => void
}

export function Loading({ fileName, onCancel }: LoadingProps) {
  return (
    <Container size="sm" py="xl">
      <Stack gap="md">
        <Group justify="space-between">
          <Button variant="subtle" onClick={onCancel}>Cancel</Button>
          <ThemeToggle size="xs" variant="default" />
        </Group>

        <Group gap="sm">
          <Loader size="sm" />
          <Title order={3} m={0}>Loading segments...</Title>
        </Group>

        <Text c="dimmed">{fileName}</Text>
        <Text size="sm" c="dimmed">
          Large files are segmented in a worker to keep the UI responsive.
        </Text>
      </Stack>
    </Container>
  )
}
