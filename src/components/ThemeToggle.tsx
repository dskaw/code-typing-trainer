import { Button, type ButtonProps, useComputedColorScheme, useMantineColorScheme } from '@mantine/core'

type ThemeToggleProps = Omit<ButtonProps, 'onClick' | 'children'>

export function ThemeToggle(props: ThemeToggleProps) {
  const computed = useComputedColorScheme('light', { getInitialValueInEffect: false })
  const { toggleColorScheme } = useMantineColorScheme({ keepTransitions: true })

  const label = computed === 'dark' ? 'Light mode' : 'Dark mode'

  return (
    <Button {...props} onClick={() => toggleColorScheme()}>
      {label}
    </Button>
  )
}

