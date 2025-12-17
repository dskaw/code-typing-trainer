import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import './index.css'
import '@mantine/core/styles.css'
import '@mantine/notifications/styles.css'
import { localStorageColorSchemeManager, MantineProvider } from '@mantine/core'
import { Notifications } from '@mantine/notifications'
import { ErrorBoundary } from './components/ErrorBoundary'
import { GlobalErrorHandler } from './components/GlobalErrorHandler'
import { SyncTailwindDarkClass } from './components/SyncTailwindDarkClass'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <MantineProvider
    defaultColorScheme="light"
    colorSchemeManager={localStorageColorSchemeManager({ key: 'typing-trainer-color-scheme' })}
  >
    <Notifications position="top-right" />
    <GlobalErrorHandler />
    <SyncTailwindDarkClass />
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </MantineProvider>,
)
