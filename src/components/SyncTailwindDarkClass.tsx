import { useComputedColorScheme } from '@mantine/core'
import { useEffect } from 'react'

export function SyncTailwindDarkClass() {
  const computed = useComputedColorScheme('light', { getInitialValueInEffect: false })

  useEffect(() => {
    document.documentElement.classList.toggle('dark', computed === 'dark')
  }, [computed])

  return null
}

